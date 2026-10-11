import { MAX_CLAIM_LENGTH, fullScreenUrl, normalizeClaim, safeSourceUrl, validateClaim } from "./shared.js";

const claimInput = document.querySelector("#claim");
const subjectInput = document.querySelector("#subject");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const submit = document.querySelector("#submit");
const cancel = document.querySelector("#cancel");
const openFull = document.querySelector("#open-full");
const capture = document.querySelector("#capture");
let latestState;
const editorId = crypto.randomUUID();
let editRevision = 0;
let pendingEdits = 0;
let pendingAction = false;
let saveQueue = Promise.resolve();
let renderedResult = null;

function say(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}
function updateInput() {
  document.querySelector("#count").textContent = `${claimInput.value.length} / ${MAX_CLAIM_LENGTH}`;
  openFull.disabled = normalizeClaim(claimInput.value).length < 10;
}
function setBusy(busy) {
  submit.disabled = busy || pendingAction;
  submit.textContent = busy ? "Searching evidence…" : "Find evidence ↗";
  cancel.hidden = !busy;
  claimInput.readOnly = busy || pendingAction;
  subjectInput.disabled = busy || pendingAction;
  capture.disabled = busy || pendingAction;
  document.querySelector("#screen-form").setAttribute("aria-busy", String(busy));
}
function textElement(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}
function renderResult(result) {
  document.querySelector("#notice").textContent = typeof result.notice === "string" ? result.notice : "Relevant sources are candidates for review, not a truth verdict.";
  document.querySelector("#source-count").textContent = `${result.sources.length} sources`;
  const container = document.querySelector("#sources");
  container.replaceChildren();
  if (!result.sources.length) container.append(textElement("p", "No matching sources returned. Try a shorter claim or a different subject. Missing evidence does not make a claim false.", "notice"));
  for (const source of result.sources) {
    const card = document.createElement("article");
    card.className = "source";
    const metadata = [source.kind === "fact-check" ? "Published fact-check" : source.kind === "supplied" ? "Supplied source" : "Research source", source.publisher, source.year].filter(Boolean).join(" · ");
    card.append(textElement("p", metadata, "source-meta"));
    const heading = document.createElement("h3");
    const url = safeSourceUrl(source.url);
    if (url) {
      const link = textElement("a", source.title);
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      heading.append(link);
    } else heading.textContent = source.title;
    card.append(heading);
    if (typeof source.abstract === "string" && source.abstract.trim()) card.append(textElement("p", source.abstract.length > 360 ? `${source.abstract.slice(0, 360)}…` : source.abstract, "excerpt"));
    if (typeof source.reviewedClaim === "string") card.append(textElement("p", `Claim reviewed by this publisher: ${source.reviewedClaim}`, "excerpt"));
    if (typeof source.publishedRating === "string") card.append(textElement("p", `Publisher's rating of its reviewed claim: ${source.publishedRating}. Read the original to confirm it addresses your claim.`, "rating"));
    container.append(card);
  }
  document.querySelector("#providers").replaceChildren(...result.providers.map((provider) => textElement("li", `${provider.name}: ${provider.message}`)));
  results.hidden = false;
}
function applyState(state) {
  if (!state || (latestState && state.revision < latestState.revision)) return;
  latestState = state;
  // Local keystrokes win over an earlier storage event or response.
  if (pendingEdits) return;
  claimInput.value = state.claim;
  subjectInput.value = state.subject;
  setBusy(state.status === "running");
  say(state.message, state.status === "error");
  if (state.status === "complete" && state.result) {
    if (renderedResult !== state.result.id) renderResult(state.result);
    results.hidden = false;
    renderedResult = state.result.id;
  } else {
    results.hidden = true;
    document.querySelector("#sources").replaceChildren();
    renderedResult = null;
  }
  updateInput();
}
async function message(payload) {
  const response = await chrome.runtime.sendMessage(payload);
  if (!response?.ok || !response.state) throw new Error(response?.error || "The extension was updated or restarted. Close and reopen it to reconnect.");
  return response.state;
}
async function refreshAfterError(error) {
  try { applyState(await message({ type: "review:get" })); } catch { /* Preserve the draft displayed here. */ }
  say(error.message || "Could not update your review. Close and reopen the extension.", true);
}
function saveDraft() {
  editRevision++;
  pendingEdits++;
  const claim = claimInput.value, subject = subjectInput.value;
  results.hidden = true;
  say("Saving your draft…");
  updateInput();
  // Send every keystroke immediately. A popup can disappear before an awaited
  // write completes; queued work belongs to the worker, not to this document.
  const saving = message({ type: "review:draft", claim, subject, revision: latestState?.revision, editorId, editId: editRevision });
  const settled = (async () => {
    try {
      const state = await saving;
      applyState(state);
    } catch (error) {
      // Do not retry a stale edit over a newer review from another window.
      await refreshAfterError(error);
      throw error;
    } finally {
      pendingEdits--;
      if (!pendingEdits && latestState) applyState(latestState);
    }
  })();
  saveQueue = Promise.all([saveQueue.catch(() => {}), settled]);
  void saveQueue.catch(() => {});
}
claimInput.addEventListener("input", saveDraft);
subjectInput.addEventListener("change", saveDraft);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.reviewState?.newValue) applyState(changes.reviewState.newValue);
});

document.querySelector("#screen-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (pendingAction) return;
  try { validateClaim(claimInput.value); } catch (error) { say(error.message, true); claimInput.focus(); return; }
  pendingAction = true;
  setBusy(false);
  try {
    await saveQueue;
    applyState(await message({ type: "review:start", claim: claimInput.value, subject: subjectInput.value, revision: latestState?.revision }));
  } catch (error) { await refreshAfterError(error); }
  finally { pendingAction = false; setBusy(latestState?.status === "running"); }
});
cancel.addEventListener("click", async () => {
  try { applyState(await message({ type: "review:cancel" })); }
  catch (error) { await refreshAfterError(error); }
});
document.querySelector("#clear").addEventListener("click", async () => {
  if (pendingAction) return;
  editRevision++;
  pendingAction = true;
  setBusy(false);
  try {
    await saveQueue.catch(() => {});
    applyState(await message({ type: "review:clear" }));
    claimInput.focus();
  } catch (error) { await refreshAfterError(error); }
  finally { pendingAction = false; setBusy(latestState?.status === "running"); }
});
openFull.addEventListener("click", async () => {
  try {
    await saveQueue;
    await chrome.tabs.create({ url: fullScreenUrl(claimInput.value, subjectInput.value) });
  } catch (error) { say(error.message || "Could not open the full screen.", true); }
});
document.querySelector("#open-tab").addEventListener("click", async () => {
  try {
    await saveQueue;
    await chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?view=tab") });
  } catch (error) { say(error.message || "Could not open the review tab.", true); }
});

async function captureSelection(automatic = false) {
  const revision = editRevision;
  const stateRevision = latestState?.revision;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!Number.isInteger(tab?.id)) throw new Error("No active webpage.");
    const [selection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const active = document.activeElement;
        if (active instanceof HTMLTextAreaElement || (active instanceof HTMLInputElement && ["text", "search", "url"].includes(active.type))) return active.value.slice(active.selectionStart ?? 0, active.selectionEnd ?? 0).slice(0, 801);
        return (window.getSelection()?.toString() || "").slice(0, 801);
      },
    });
    if (editRevision !== revision || latestState?.revision !== stateRevision || pendingAction) return;
    const selected = normalizeClaim(selection?.result);
    if (!selected) {
      if (!automatic) say("No selected text found. Highlight one claim on the webpage, or paste it here.");
      return;
    }
    applyState(await message({ type: "review:selection", claim: selected.slice(0, MAX_CLAIM_LENGTH), subject: "auto", revision: stateRevision, truncated: selected.length > MAX_CLAIM_LENGTH }));
  } catch {
    if (editRevision === revision && !pendingAction) say("Chrome cannot read this page. Paste a claim here, or select text on a regular webpage and use the right-click menu.");
  }
}
capture.addEventListener("click", () => void captureSelection());
async function initialize() {
  pendingAction = true;
  setBusy(false);
  try {
    applyState(await message({ type: "review:get" }));
    pendingAction = false;
    setBusy(latestState.status === "running");
    if (!latestState.claim && latestState.status === "idle" && !new URLSearchParams(location.search).has("view")) void captureSelection(true);
  } catch (error) {
    pendingAction = false;
    setBusy(false);
    say(error.message || "Could not connect. Close and reopen the extension.", true);
  }
  if (new URLSearchParams(location.search).get("view") === "tab") {
    document.body.classList.add("review-tab");
    document.querySelector("#open-tab").hidden = true;
  }
  updateInput();
}
void initialize();
