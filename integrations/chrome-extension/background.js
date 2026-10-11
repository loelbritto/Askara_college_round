import { MAX_CLAIM_LENGTH, SUBJECTS, discoverEvidence, normalizeClaim, validateClaim, validateResponse } from "./shared.js";

export const STATE_KEY = "reviewState";
export const REQUEST_TIMEOUT = 24000;
const MENU_ID = "second-opinion-selection";
const emptyState = () => ({ schema: 1, revision: 0, claim: "", subject: "auto", status: "idle", message: "", result: null, runId: null, startedAt: null });
const draftText = (value) => typeof value === "string" ? value.replace(/\u0000/g, "").slice(0, MAX_CLAIM_LENGTH) : "";

// One writer serializes storage updates. Network work runs outside this queue, so
// cancel/clear remain responsive and a late response cannot restore cleared data.
export function createReviewSession({ storage, discover = discoverEvidence, now = Date.now, makeId = () => crypto.randomUUID(), timeoutMs = REQUEST_TIMEOUT }) {
  let state;
  let active = null;
  let queue = Promise.resolve();
  const enqueue = (task) => {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  };
  const snapshot = () => structuredClone(state);
  async function save(next) {
    const saved = { ...next, revision: (state?.revision || 0) + 1 };
    await storage.set({ [STATE_KEY]: saved });
    state = saved;
    return snapshot();
  }
  async function load() {
    if (state) return;
    const stored = await storage.get([STATE_KEY, "pendingClaim"]);
    const previous = stored[STATE_KEY];
    state = emptyState();
    if (previous?.schema === 1) {
      state = { ...state, claim: draftText(previous.claim), subject: SUBJECTS.includes(previous.subject) ? previous.subject : "auto", revision: Number.isSafeInteger(previous.revision) ? previous.revision : 0 };
      if (previous.status === "running") {
        await save({ ...state, status: "error", message: "Chrome interrupted the previous search. Your claim is saved; select Find evidence to retry." });
      } else if (previous.status === "complete" && previous.result) {
        try {
          const result = validateResponse(previous.result);
          if (normalizeClaim(result.claim) === normalizeClaim(state.claim)) state = { ...state, status: "complete", result, message: "Your last evidence search is restored. Read the sources before drawing a conclusion." };
        } catch { /* Discard invalid cached results, retain the editable draft. */ }
      } else if (["error", "cancelled", "idle"].includes(previous.status)) {
        state = { ...state, status: previous.status, message: typeof previous.message === "string" ? previous.message.slice(0, 500) : "" };
      }
    }
    // Upgrade an unused 1.0 context-menu handoff without sending it anywhere.
    const pending = stored.pendingClaim;
    if (pending && typeof pending.text === "string" && Number.isFinite(pending.at) && now() - pending.at >= 0 && now() - pending.at < 300000) {
      await save({ ...emptyState(), claim: draftText(pending.text), message: pending.truncated ? "Review this excerpt: your selection was longer than 800 characters." : "Selected text is ready. Review it before searching." });
    }
    if (pending) await storage.remove("pendingClaim");
  }
  function stop() {
    const previous = active;
    active = null;
    previous?.controller.abort("cancelled");
  }
  async function perform(job, claim, subject) {
    const timeout = setTimeout(() => job.controller.abort("timeout"), timeoutMs);
    try {
      const result = await discover(claim, subject, job.controller.signal);
      await enqueue(async () => {
        if (active !== job || state.runId !== job.id) return;
        active = null;
        await save({ ...state, status: "complete", runId: null, startedAt: null, result, message: result.sources.length ? "Sources found. Read the originals, or open model comparison on the website." : "No matching sources returned. Check provider status below, or try a more specific claim." });
      });
    } catch (error) {
      await enqueue(async () => {
        if (active !== job || state.runId !== job.id) return;
        active = null;
        const message = job.controller.signal.aborted ? "The search took too long. Your claim is saved; try again." : error instanceof TypeError ? "Could not reach Second Opinion. Check your connection and try again." : error?.message || "The search could not finish. Your claim is saved; try again.";
        await save({ ...state, status: "error", runId: null, startedAt: null, result: null, message });
      });
    } finally { clearTimeout(timeout); }
  }
  return {
    dispatch(message) {
      return enqueue(async () => {
        await load();
        if (!message || typeof message.type !== "string") throw new Error("Invalid extension request.");
        if (message.type === "review:get") return snapshot();
        if (message.type === "review:clear") {
          stop();
          await storage.remove("pendingClaim");
          return save({ ...emptyState(), message: "Cleared from this browser session." });
        }
        if (message.type === "review:cancel") {
          if (state.status !== "running") return snapshot();
          stop();
          return save({ ...state, status: "cancelled", runId: null, startedAt: null, result: null, message: "Search cancelled. Your claim is still here." });
        }
        if (!["review:draft", "review:start", "review:selection"].includes(message.type)) throw new Error("Unknown extension request.");
        const editor = message.type === "review:draft" && typeof message.editorId === "string" && message.editorId.length <= 64 && Number.isSafeInteger(message.editId) && message.editId > 0;
        const continuingEdit = editor && message.editorId === state.editorId && message.editId > state.editId;
        if (editor && message.editorId === state.editorId && message.editId <= state.editId) return snapshot();
        if (message.revision !== undefined && message.revision !== state.revision && !continuingEdit) throw new Error("This review changed in another extension window. Your saved review has been restored; try again.");
        if (typeof message.claim !== "string" || message.claim.length > MAX_CLAIM_LENGTH || !SUBJECTS.includes(message.subject)) throw new Error("Enter a claim of 800 characters or fewer and choose a subject.");
        if (message.type === "review:selection") stop();
        else if (state.status === "running") {
          if (message.type === "review:start" && normalizeClaim(message.claim) === state.claim && message.subject === state.subject) return snapshot();
          throw new Error("Cancel the current search before changing your claim.");
        }
        if (message.type !== "review:start") return save({ ...emptyState(), ...(editor ? { editorId: message.editorId, editId: message.editId } : {}), claim: draftText(message.claim), subject: message.subject, message: message.type === "review:selection" ? message.truncated ? "Review this excerpt: your selection was longer than 800 characters." : "Selected text is ready. Review it before searching." : "Draft saved for this browser session." });
        const claim = validateClaim(message.claim);
        const job = { id: makeId(), controller: new AbortController() };
        active = job;
        let saved;
        try { saved = await save({ ...state, claim, subject: message.subject, status: "running", result: null, runId: job.id, startedAt: now(), message: "Finding research and available fact-checks. You can close this popup and return to your search." }); }
        catch (error) { active = null; throw error; }
        // Acknowledgement is immediate and does not depend on the popup staying open.
        void perform(job, claim, message.subject).catch(() => {});
        return saved;
      });
    },
  };
}

if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  const review = createReviewSession({ storage: chrome.storage.session });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(""))) return false;
    void review.dispatch(message).then((state) => respond({ ok: true, state }), (error) => respond({ ok: false, error: error?.message || "The review could not be updated. Reopen the extension and try again." }));
    return true;
  });
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ id: MENU_ID, title: "Review with Second Opinion", contexts: ["selection"] });
    });
  });
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID) return;
    const claim = normalizeClaim(info.selectionText);
    if (!claim) return;
    void review.dispatch({ type: "review:selection", claim: claim.slice(0, MAX_CLAIM_LENGTH), subject: "auto", truncated: claim.length > MAX_CLAIM_LENGTH }).then(async () => {
      try { await chrome.action.openPopup(Number.isInteger(tab?.windowId) ? { windowId: tab.windowId } : {}); }
      catch { await chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?view=tab") }); }
    }).catch(() => {});
  });
}
