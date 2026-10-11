import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const extensionPath = resolve(root, "integrations/chrome-extension");
const output = resolve(root, "output/chrome-extension");
await mkdir(output, { recursive: true });
const profile = await mkdtemp(resolve(output, "test-profile-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: process.env.EXTENSION_TEST_CHANNEL || "msedge",
  headless: true,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});

try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 10000 });
  const extensionId = new URL(worker.url()).host;
  let page = await context.newPage();
  const claim = "Antibiotics are effective against viral infections.";
  await worker.evaluate(async (text) => {
    await chrome.storage.session.set({ pendingClaim: { text, at: Date.now(), truncated: false } });
  }, claim);
  let requests = 0;
  await context.route("https://secondopinion-ten.vercel.app/api/screen", async (route) => {
    requests++;
    assert.deepEqual(route.request().postDataJSON(), { claim, subject: "auto", discover: true });
    assert.equal(route.request().headers().cookie, undefined);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "test-report", claim, subject: "health", method: "evidence-discovery", createdAt: new Date().toISOString(),
        sources: [
          { id: "paper-1", title: "Antibiotic use and viral infection", publisher: "Example medical journal", year: 2025, kind: "paper", abstract: "This is a fictional test source. Research candidates need review of the original publication.", url: "https://example.com/paper" },
          { id: "unsafe", title: "<img src=x onerror=alert(1)>", publisher: "Untrusted test", kind: "paper", url: "javascript:alert(1)" },
        ],
        providers: [{ name: "Crossref", status: "ok", message: "Test response: 2 candidates." }],
        notice: "Search results are evidence candidates, not a verified truth verdict.",
      }),
    });
  });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForFunction(() => document.querySelector("#claim")?.value.length > 0);
  assert.equal(await page.locator("#claim").inputValue(), claim);
  assert.equal(requests, 0, "Opening a selected claim must never send it automatically");
  await page.getByRole("button", { name: "Find evidence" }).click();
  await page.getByText("2 sources", { exact: true }).waitFor();
  assert.equal(requests, 1);
  assert.equal(await page.locator(".source img").count(), 0);
  assert.equal(await page.locator(".source a").count(), 1);
  assert.equal(await page.locator(".source").nth(1).textContent(), "Research source · Untrusted test<img src=x onerror=alert(1)>");
  assert.equal(await worker.evaluate(async () => (await chrome.storage.session.get("pendingClaim")).pendingClaim), undefined);
  await page.close();
  page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html?view=tab`);
  await page.getByText("2 sources", { exact: true }).waitFor();
  assert.equal(await page.locator("#claim").inputValue(), claim);
  assert.equal(requests, 1, "Reopening a completed review must not repeat its network request");
  await page.setViewportSize({ width: 460, height: 930 });
  await page.screenshot({ path: resolve(output, "extension-evidence.png"), fullPage: true });
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  assert.equal(await page.locator("#claim").inputValue(), "");
  assert.equal(await page.locator(".source").count(), 0);
  await page.locator("#claim").fill("A fresh draft must survive closing the popup immediately.");
  await page.close();
  page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html?view=tab`);
  await page.waitForFunction(() => document.querySelector("#claim")?.value === "A fresh draft must survive closing the popup immediately.");
  assert.equal(requests, 1);
  console.log("Isolated extension smoke passed: MV3 loaded; explicit search; safe rendering; results and drafts survive closing; no duplicate request; clear.");
} finally {
  await context.close();
}
