import { MAX_CLAIM_LENGTH, discoverEvidence, fullScreenUrl, normalizeClaim, safeSourceUrl, validateClaim } from "./shared.js";

const claimInput = document.querySelector("#claim");
const subjectInput = document.querySelector("#subject");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const submit = document.querySelector("#submit");
const cancel = document.querySelector("#cancel");
const openFull = document.querySelector("#open-full");
let controller;
let currentRun = 0;

function say(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

function updateInput() {
  document.querySelector("#count").textContent = `${claimInput.value.length} / ${MAX_CLAIM_LENGTH}`;
  openFull.disabled = normalizeClaim(claimInput.value).length < 10;
}

function setBusy(busy) {
  submit.disabled = busy;
  submit.textContent = busy ? "Searching evidence…" : "Find evidence ↗";
  cancel.hidden = !busy;
  claimInput.readOnly = busy;
  subjectInput.disabled = busy;
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
    } else {
      heading.textContent = source.title;
    }
    card.append(heading);
    if (typeof source.abstract === "string" && source.abstract.trim()) card.append(textElement("p", source.abstract.length > 360 ? `${source.abstract.slice(0, 360)}…` : source.abstract, "excerpt"));
    if (typeof source.reviewedClaim === "string") card.append(textElement("p", `Claim reviewed by this publisher: ${source.reviewedClaim}`, "excerpt"));
    if (typeof source.publishedRating === "string") card.append(textElement("p", `Publisher's rating of its reviewed claim: ${source.publishedRating}. Read the original to confirm it addresses your claim.`, "rating"));
    container.append(card);
  }
  const providers = document.querySelector("#providers");
  providers.replaceChildren(...result.providers.map((provider) => textElement("li", `${provider.name}: ${provider.message}`)));
  results.hidden = false;
}

document.querySelector("#screen-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let claim;
  try { claim = validateClaim(claimInput.value); } catch (error) { say(error.message, true); claimInput.focus(); return; }
  const run = ++currentRun;
  controller?.abort();
  const requestController = new AbortController();
  controller = requestController;
  const timeout = setTimeout(() => requestController.abort("timeout"), 30000);
  setBusy(true);
  results.hidden = true;
  say("Finding research and available fact-checks. This does not call a paid language model.");
  try {
    const result = await discoverEvidence(claim, subjectInput.value, requestController.signal);
    if (run !== currentRun) return;
    renderResult(result);
    say(result.sources.length ? "Sources found. Read the originals, or open the full screen to compare models." : "No matching sources returned. Check provider status below, or try a more specific claim.");
  } catch (error) {
    if (run !== currentRun) return;
    if (requestController.signal.aborted) say(requestController.signal.reason === "timeout" ? "The search took too long. Your claim is still here; try again." : "Search cancelled. Your claim is still here.", requestController.signal.reason === "timeout");
    else say(error instanceof TypeError ? "Could not reach Second Opinion. Check your connection and try again." : error.message || "Something went wrong. Try again.", true);
  } finally {
    clearTimeout(timeout);
    if (run === currentRun) setBusy(false);
  }
});

claimInput.addEventListener("input", () => { results.hidden = true; say(""); updateInput(); });
subjectInput.addEventListener("change", () => { results.hidden = true; say(""); });
cancel.addEventListener("click", () => controller?.abort("cancelled"));
document.querySelector("#clear").addEventListener("click", async () => {
  currentRun++;
  controller?.abort("cancelled");
  claimInput.value = "";
  results.hidden = true;
  document.querySelector("#sources").replaceChildren();
  await chrome.storage.session.remove("pendingClaim");
  setBusy(false);
  say("Cleared.");
  updateInput();
  claimInput.focus();
});
openFull.addEventListener("click", async () => {
  try { await chrome.tabs.create({ url: fullScreenUrl(claimInput.value) }); }
  catch (error) { say(error.message || "Could not open the full screen.", true); }
});

async function initialize() {
  try {
    const { pendingClaim } = await chrome.storage.session.get("pendingClaim");
    await chrome.storage.session.remove("pendingClaim");
    if (pendingClaim && typeof pendingClaim.text === "string" && Date.now() - pendingClaim.at < 300000) {
      claimInput.value = pendingClaim.text.slice(0, MAX_CLAIM_LENGTH);
      if (pendingClaim.truncated) say("Your selection was longer than 800 characters. Review this excerpt and choose one complete claim.");
    } else {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (Number.isInteger(tab?.id)) {
        const [selection] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const active = document.activeElement;
            if (active instanceof HTMLTextAreaElement || (active instanceof HTMLInputElement && ["text", "search", "url"].includes(active.type))) {
              return active.value.slice(active.selectionStart ?? 0, active.selectionEnd ?? 0).slice(0, 801);
            }
            return (window.getSelection()?.toString() || "").slice(0, 801);
          },
        });
        const selected = normalizeClaim(selection?.result);
        claimInput.value = selected.slice(0, MAX_CLAIM_LENGTH);
        if (selected.length > MAX_CLAIM_LENGTH) say("Your selection was longer than 800 characters. Review this excerpt and choose one complete claim.");
      }
    }
  } catch {
    say("Select text on a regular webpage, or paste a claim here.");
  }
  updateInput();
}
void initialize();
