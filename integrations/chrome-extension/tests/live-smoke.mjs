import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

// Explicit opt-in integration check: one fictional public claim goes to the
// production evidence API. Uses a new isolated profile, never the user's tabs.
// Unlike browser-smoke.mjs, this opens the real toolbar popup and does not mock
// the API. Upstream outages or throttling appropriately fail this live check.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const output = resolve(root, "tmp/extension-live-popup");
await mkdir(output, { recursive: true });
const profile = await mkdtemp(resolve(output, "profile-"));
const extensionPath = resolve(root, "integrations/chrome-extension");
const context = await chromium.launchPersistentContext(profile, {
  channel: process.env.EXTENSION_TEST_CHANNEL || "msedge",
  headless: true,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});

try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 10000 });
  const extensionId = new URL(worker.url()).host;
  const cdp = await context.newCDPSession(context.pages()[0]);
  const pending = new Map();
  let sequence = 0;
  let evidenceRequests = 0;
  let popupSessionId;
  const pageLoads = new Set();
  cdp.on("Target.receivedMessageFromTarget", ({ message, sessionId }) => {
    const event = JSON.parse(message);
    if (sessionId === popupSessionId && event.method === "Page.loadEventFired") {
      for (const resolve of pageLoads) resolve();
      pageLoads.clear();
    }
    if (event.method === "Network.requestWillBeSent" && event.params.request.url === "https://secondopinion-ten.vercel.app/api/screen") evidenceRequests++;
    const response = pending.get(event.id);
    if (!response) return;
    clearTimeout(response.timer);
    pending.delete(event.id);
    if (event.error) response.reject(new Error(JSON.stringify(event.error)));
    else response.resolve(event.result);
  });

  const workerTarget = (await cdp.send("Target.getTargets")).targetInfos.find((item) => item.url === worker.url());
  assert(workerTarget, "The MV3 service worker must be installed");
  const workerSession = await cdp.send("Target.attachToTarget", { targetId: workerTarget.targetId, flatten: false });
  await command("Network.enable", {}, workerSession.sessionId);
  const claim = "Antibiotics are effective against viral infections.";
  await worker.evaluate(async (text) => {
    await chrome.storage.session.set({ pendingClaim: { text, at: Date.now(), truncated: false } });
    await chrome.action.openPopup();
  }, claim);
  const target = (await cdp.send("Target.getTargets")).targetInfos.find((item) => item.url === `chrome-extension://${extensionId}/popup.html`);
  assert(target, "The real toolbar popup must open after loading the unpacked extension");
  // Playwright does not expose toolbar popups as normal context.pages(). Attach
  // to that exact browser-created target, rather than substituting a regular tab.
  ({ sessionId: popupSessionId } = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: false }));
  async function command(method, params = {}, sessionId = popupSessionId) {
    const id = ++sequence;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Popup command timed out: ${method}`)); }, 10000);
      pending.set(id, { resolve, reject, timer });
    });
    await cdp.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({ id, method, params }) });
    return response;
  }
  async function evaluate(expression) {
    const response = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    assert(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
    return response.result.value;
  }
  async function until(expression, timeout = 35000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = await evaluate(expression);
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Popup condition timed out: ${expression}`);
  }
  async function reloadPopup() {
    const loaded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pageLoads.delete(complete); reject(new Error("Toolbar popup did not reload")); }, 10000);
      function complete() { clearTimeout(timer); resolve(); }
      pageLoads.add(complete);
    });
    await command("Page.reload");
    await loaded;
  }
  await command("Page.enable");
  await command("Network.enable");
  await until('document.querySelector("#claim")?.value.length > 0');
  assert.equal(await evaluate('document.querySelector("#claim").value'), claim);
  await evaluate('document.querySelector("#subject").value = "health"; document.querySelector("#subject").dispatchEvent(new Event("change", {bubbles:true}));');
  await until('(async () => (await chrome.storage.session.get("reviewState")).reviewState?.subject === "health")()');
  // Headless toolbar popups do not reliably close on blur. Reload the actual
  // toolbar document to exercise its destruction/restoration without replacing
  // it with a regular tab or pretending to test a native toolbar click.
  await reloadPopup();
  await until('document.querySelector("#claim")?.value.length > 0');
  assert.equal(await evaluate('document.querySelector("#claim").value'), claim);
  assert.equal(await evaluate('document.querySelector("#subject").value'), "health");
  assert.equal(evidenceRequests, 0, "Opening the review popup must not send a claim automatically");
  await evaluate('document.querySelector("#submit").click()');
  const requestState = await until('(async () => { const state = (await chrome.storage.session.get("reviewState")).reviewState; return ["running", "complete"].includes(state?.status) && state.status; })()');
  await reloadPopup();
  await until('document.querySelector("#claim")?.value.length > 0');
  const status = await until('document.querySelector("#submit")?.disabled === false && document.querySelector("#results")?.hidden === false && document.querySelector("#status")?.textContent');
  const summary = await evaluate('({count:document.querySelectorAll(".source").length, providers:document.querySelector("#providers").textContent, resultsVisible:!document.querySelector("#results").hidden})');
  assert.equal(evidenceRequests, 1, "One click must make exactly one live API request");
  assert(summary.resultsVisible && summary.count > 0, `Live source discovery failed: ${status}; ${summary.providers}`);
  await reloadPopup();
  await until('document.querySelector("#results")?.hidden === false');
  assert.equal(await evaluate('document.querySelector("#claim").value'), claim);
  assert.equal(await evaluate('document.querySelectorAll(".source").length'), summary.count, "Completed sources must survive the popup document reloading");
  assert.equal(evidenceRequests, 1, "Restoring results must not submit the claim again");
  const screenshot = await command("Page.captureScreenshot", { format: "png" });
  await writeFile(resolve(output, "actual-toolbar-popup.png"), Buffer.from(screenshot.data, "base64"));
  console.log(JSON.stringify({ browser: process.env.EXTENSION_TEST_CHANNEL || "msedge", toolbarPopup: true, mockedApi: false, evidenceRequests, draftRestored: true, reloadedWhileRunning: requestState === "running", resultsRestored: true, status, ...summary, screenshot: resolve(output, "actual-toolbar-popup.png") }, null, 2));
} finally {
  await context.close();
}
