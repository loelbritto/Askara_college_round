import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "output/browser-models");
await mkdir(output, { recursive: true });
const claim = "The library is closed on Sundays.";
const passage = "The library opens at 9 AM on weekdays and is closed on Sundays.";
const target = process.env.MODEL_TEST_URL || "http://127.0.0.1:3007/screen";
const context = await chromium.launchPersistentContext(resolve(output, "test-profile"), { channel: "msedge", headless: true, viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
const requests = [];
const errors = [];
const failedRequests = [];
const responses = [];
const csp = [];
await context.addInitScript(() => {
  window.__cspEvents = [];
  window.addEventListener("securitypolicyviolation", (event) => {
    window.__cspEvents.push({ directive: event.violatedDirective, blockedURI: event.blockedURI, sourceFile: event.sourceFile, line: event.lineNumber });
  });
});
context.on("request", (request) => {
  const url = new URL(request.url());
  const body = request.postData() || "";
  let decodedUrl = request.url();
  try { decodedUrl = decodeURIComponent(decodedUrl.replace(/\+/g, " ")); } catch { /* Keep the raw URL if a provider sends an invalid escape. */ }
  requests.push({
    host: url.host, path: url.pathname, method: request.method(),
    hasQuery: Boolean(url.search),
    carriesClaim: decodedUrl.includes(claim) || body.includes(claim),
    carriesPassage: decodedUrl.includes(passage) || body.includes(passage),
  });
});
context.on("requestfailed", (request) => failedRequests.push({ host: new URL(request.url()).host, path: new URL(request.url()).pathname, error: request.failure()?.errorText }));
context.on("response", (response) => {
  const url = new URL(response.url());
  responses.push({ host: url.host, path: url.pathname, status: response.status(), contentType: response.headers()["content-type"] });
});
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text().slice(0, 3000)); });
page.on("pageerror", (error) => errors.push(error.message));
let outcome = "not-started";
const started = Date.now();
try {
  await page.goto(target, { waitUntil: "networkidle", timeout: 30000 });
  await page.getByLabel("What claim would you like to check?").fill(claim);
  await page.getByText("Have your own reference passage? Check it locally.", { exact: true }).click();
  await page.getByLabel("Reference text", { exact: true }).fill(passage);
  await page.getByRole("button", { name: "Use this passage locally" }).click();
  await page.getByRole("button", { name: "Download & run both models" }).click();
  console.log("Real local inference started; downloading actual Hugging Face weights in isolated Edge.");
  const progress = setInterval(() => {
    void page.locator('.screen-model-panel [role="status"]').innerText().then((text) => console.log(`Model progress: ${text}`)).catch(() => {});
  }, 30000);
  try {
    await page.locator('.screen-model-panel [role="status"]').filter({ hasText: /Both models finished|Finished with gaps/ }).or(page.locator('.screen-model-panel [role="alert"]').first()).first().waitFor({ timeout: 150000 });
  } finally { clearInterval(progress); }
  outcome = "finished";
} catch (error) {
  outcome = error.name === "TimeoutError" ? "timeout" : "failed";
  errors.push(error.message.slice(0, 3000));
} finally {
  csp.push(...await page.evaluate(() => window.__cspEvents || []).catch(() => []));
  const modelPanel = await page.locator(".screen-model-panel").innerText().catch(() => "");
  const votes = await page.locator(".screen-votes").allTextContents();
  const modelVotes = await page.locator(".screen-votes > div").allTextContents();
  const localOnly = requests.filter((request) => request.path === "/api/screen").length === 0;
  const disclosedContent = requests.filter((request) => request.host !== new URL(target).host && (request.carriesClaim || request.carriesPassage));
  const runtimeResponses = responses.filter((response) => response.path.startsWith("/models-runtime/"));
  const report = { outcome, elapsedMs: Date.now() - started, localOnly, disclosedContent, votes, modelVotes, modelPanel, errors, csp, failedRequests, requests, responses, runtimeResponses };
  await page.screenshot({ path: resolve(output, "models-screen.png"), fullPage: true });
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outcome, elapsedMs: report.elapsedMs, localOnly, disclosedContent, votes, modelVotes, modelPanel, errors, csp, failedRequests, runtimeResponses, requestCount: requests.length }, null, 2));
  await context.close();
  // CSP events stay visible in the report. A deliberately blocked, caught JIT
  // feature probe is not itself proof that inference failed.
  if (outcome !== "finished" || modelVotes.length !== 2 || !modelPanel.includes("Both models finished") || disclosedContent.length || !localOnly || runtimeResponses.some((response) => response.status >= 400)) process.exitCode = 1;
}
