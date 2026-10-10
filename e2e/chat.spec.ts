import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { sampleReport, sampleSources } from "../src/lib/sample";

test("live demo opens an authenticated DeepSeek review with one explicit request",async({page})=>{
  let calls=0;
  await page.route("**/api/health",r=>r.fulfill({json:{configured:true,enabled:true,authenticated:false,provider:"deepseek",model:"deepseek-flash"}}));
  await page.route("**/api/session",r=>r.fulfill({json:{authenticated:true}}));
  const report={...sampleReport(await sampleSources()),origin:"live",model:"deepseek-flash"};
  await page.route("**/api/audit",r=>{calls++;return r.fulfill({json:report});});
  await page.goto("/workspace");await page.getByRole("button",{name:"Set up a live demo"}).click();
  await expect(page.locator(".composer-file")).toHaveCount(3);
  expect(calls).toBe(0);
  await page.getByRole("button",{name:"Check answer",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"Open a live pilot session"})).toBeVisible();
  await page.getByLabel("Pilot access code").fill("test-demo-access");
  await page.getByRole("button",{name:"Open session & check"}).click();
  await expect(page.locator(".mode-banner")).toContainText("Live audit");
  await expect(page.locator(".chat-side-bottom")).toContainText("Session active");
  await expect(page.locator(".finding-row")).toHaveCount(6);expect(calls).toBe(1);
  await page.getByRole("button",{name:"Review first issue"}).click();
  await expect(page.locator(".selected-claim")).toContainText("Opened items");
  const download=page.waitForEvent("download");await page.getByRole("button",{name:"Export JSON"}).click();expect((await download).suggestedFilename()).toContain("live");
});

test("AgentRouter is disclosed and permission failures preserve the user's draft",async({page})=>{
  await page.route("**/api/health",r=>r.fulfill({json:{configured:true,enabled:true,authenticated:true,provider:"agentrouter",model:"deepseek-v4-flash"}}));
  let calls=0;
  await page.route("**/api/audit",r=>{calls++;return r.fulfill({status:503,json:{error:{code:"MODEL_UNAVAILABLE",message:"AgentRouter denied access (403). Check the token's model permissions and provider access restrictions."}}});});
  await page.goto("/workspace");await page.getByRole("button",{name:"Set up a live demo"}).click();
  await expect(page.locator(".chat-side-bottom")).toContainText("DeepSeek via AgentRouter");
  await expect(page.locator(".composer-disclosure")).toContainText("AgentRouter");
  await page.getByRole("button",{name:"Check answer",exact:true}).click();
  await expect(page.locator(".notice.error")).toContainText("AgentRouter denied access (403)");
  await expect(page.getByLabel("AI answer to check")).toContainText("Refunds arrive within 48 hours.");
  await expect(page.locator(".composer-file")).toHaveCount(3);expect(calls).toBe(1);
});

test("composer keeps drafts and explains missing deployment settings",async({page})=>{
  await page.route("**/api/health",r=>r.fulfill({json:{configured:false,enabled:true,authenticated:false,provider:"deepseek",model:"deepseek-flash",missing:["DEEPSEEK_API_KEY","APP_ORIGIN"]}}));
  await page.goto("/workspace");await expect(page.getByRole("button",{name:"Check answer",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Paste policy",exact:true}).click();
  await page.getByLabel("SOURCE NAME").fill("Returns policy");await page.getByLabel("POLICY TEXT",{exact:true}).fill("Returns must be made within 14 days.");await page.getByRole("button",{name:"Add source",exact:true}).click();
  await page.getByLabel("AI answer to check").fill("Returns are accepted within 30 days.");
  await page.getByText("Deployment setup details",{exact:true}).click();await expect(page.locator(".composer-readiness")).toContainText("DEEPSEEK_API_KEY");
  await page.getByRole("button",{name:"Prefer a walkthrough? Use the step-by-step guide"}).click();await page.getByRole("button",{name:"Continue to answer"}).click();await expect(page.getByLabel("AI answer",{exact:false})).toHaveValue("Returns are accepted within 30 days.");
  await page.getByRole("button",{name:"Use the simple composer"}).click();await expect(page.getByLabel("AI answer to check")).toHaveValue("Returns are accepted within 30 days.");
});

test("responsive composer is accessible and preserves input after provider credit failure",async({page})=>{
  await mkdir("artifacts",{recursive:true});
  await page.route("**/api/health",r=>r.fulfill({json:{configured:true,enabled:true,authenticated:true,provider:"deepseek",model:"deepseek-flash"}}));
  await page.route("**/api/audit",r=>r.fulfill({status:429,json:{error:{code:"QUOTA",message:"DeepSeek credit is exhausted.",requestId:"test-trace"}}}));
  await page.setViewportSize({width:1440,height:1000});await page.goto("/workspace");
  await page.screenshot({path:"artifacts/chat-desktop.png",fullPage:true});
  const desktop=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();expect(desktop.violations).toEqual([]);
  await page.getByRole("button",{name:"Set up a live demo"}).click();await page.getByLabel("AI answer to check").press("Control+Enter");
  await expect(page.locator(".notice.error")).toContainText("DeepSeek credit is exhausted");await expect(page.getByLabel("AI answer to check")).toContainText("Refunds arrive within 48 hours.");
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:"reduce"});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  const mobile=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();expect(mobile.violations).toEqual([]);
  await page.screenshot({path:"artifacts/chat-mobile.png",fullPage:true});
});
