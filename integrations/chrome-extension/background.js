import { MAX_CLAIM_LENGTH, normalizeClaim } from "./shared.js";

const MENU_ID = "second-opinion-selection";
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_ID, title: "Review with Second Opinion", contexts: ["selection"] });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  void reviewSelection(info.selectionText, tab?.windowId);
});

async function reviewSelection(selection, windowId) {
  const claim = normalizeClaim(selection);
  if (!claim) return;
  // Ephemeral handoff only: never persist a conversation or send it on selection.
  await chrome.storage.session.set({ pendingClaim: { text: claim.slice(0, MAX_CLAIM_LENGTH), truncated: claim.length > MAX_CLAIM_LENGTH, at: Date.now() } });
  try {
    await chrome.action.openPopup(Number.isInteger(windowId) ? { windowId } : {});
  } catch {
    // A review tab still requires the user's separate "Find evidence" click.
    await chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
  }
}
