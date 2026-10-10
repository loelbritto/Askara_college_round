import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

test("first-time visitor follows one guided example from policies to actionable results",async({page})=>{
  test.setTimeout(60000);let audits=0;page.on("request",r=>{if(r.url().endsWith("/api/audit"))audits++;});
  await mkdir("artifacts",{recursive:true});await page.setViewportSize({width:1440,height:1000});await page.goto("/");
  await expect(page.getByRole("heading",{name:"Confidence is easy. Proof is different."})).toBeVisible();
  await expect(page.getByRole("button",{name:"Try with an example"})).toBeInViewport();
  await page.screenshot({path:"artifacts/start-desktop.png",fullPage:true});
  await page.getByRole("button",{name:"Try with an example"}).click();
  await expect(page.getByRole("heading",{name:"Your example policies are ready."})).toBeFocused();
  await expect(page.locator(".setup-source")).toHaveCount(3);await expect(page.locator(".evidence-panel")).toHaveCount(0);
  await page.screenshot({path:"artifacts/guided-policies.png",fullPage:true});
  await page.getByRole("button",{name:"Continue to answer"}).click();
  await expect(page.getByLabel("AI answer",{exact:false})).toContainText("Refunds arrive within 48 hours.");
  await page.locator(".site-header").getByRole("link",{name:"How it works"}).click();
  await page.locator(".site-header").getByRole("link",{name:"Continue review"}).click();
  await expect(page.getByRole("heading",{name:"Here’s the answer we’ll check."})).toBeVisible();
  await page.getByRole("button",{name:"Continue to check"}).click();
  await expect(page.locator(".setup-confirm li")).toHaveCount(3);
  await page.getByRole("button",{name:"Back",exact:true}).click();await expect(page.getByLabel("AI answer",{exact:false})).toContainText("Refunds arrive within 48 hours.");
  await page.getByRole("button",{name:"Continue to check"}).click();
  const axe=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();expect(axe.violations).toEqual([]);
  await page.getByRole("button",{name:"Show example results"}).click();
  await expect(page.locator(".result-guide")).toContainText("3 of 6 statements need your attention.");
  await page.getByRole("button",{name:"Review first issue"}).click();
  await expect(page.locator(".evidence-panel .selected-claim")).toContainText("Opened items");expect(audits).toBe(0);
});

test("custom review has clear prerequisites and explains unavailable live checking before submission",async({page})=>{
  let audits=0;page.on("request",r=>{if(r.url().endsWith("/api/audit"))audits++;});
  await page.route("**/api/health",r=>r.fulfill({json:{configured:false,enabled:true,authenticated:false,model:"test-stub"}}));
  await page.goto("/");await page.getByRole("link",{name:"I have my own documents"}).click();await page.getByRole("button",{name:"Prefer a walkthrough? Use the step-by-step guide"}).click();
  await expect(page.getByRole("button",{name:"Continue to answer"})).toBeDisabled();
  await page.getByRole("button",{name:"Paste policy text instead"}).click();
  await page.getByLabel("SOURCE NAME").fill("Returns policy");await page.getByLabel("POLICY TEXT",{exact:true}).fill("Returns are accepted within 14 days.");
  await page.getByRole("button",{name:"Add source",exact:true}).click();await page.getByRole("button",{name:"Continue to answer"}).click();
  await expect(page.getByRole("button",{name:"Continue to check"})).toBeDisabled();
  await page.getByLabel("AI answer",{exact:false}).fill("Returns are accepted within 30 days.");await page.getByRole("button",{name:"Continue to check"}).click();
  await expect(page.locator(".setup-availability")).toContainText("Live checking is not set up yet.");
  await expect(page.getByRole("button",{name:"Live checking unavailable"})).toBeDisabled();
  await page.getByRole("button",{name:"Try the guided example"}).click();await expect(page.getByRole("dialog",{name:"Open a different example?"})).toBeVisible();
  await page.getByRole("button",{name:"Keep current workspace"}).click();await expect(page.locator(".setup-answer-preview")).toHaveText("Returns are accepted within 30 days.");expect(audits).toBe(0);
});

test("mobile and reduced-motion onboarding keeps the next step clear and accessible",async({page})=>{
  test.setTimeout(60000);await mkdir("artifacts",{recursive:true});await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:"reduce"});await page.goto("/");
  await expect(page.getByRole("button",{name:"Try with an example"})).toBeInViewport();
  await page.screenshot({path:"artifacts/start-mobile.png",fullPage:true});
  await page.getByRole("button",{name:"Try with an example"}).click();
  for(const name of ["Continue to answer","Continue to check"]){
    const result=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.getByRole("button",{name}).click();
  }
  await page.screenshot({path:"artifacts/guided-mobile.png",fullPage:true});await page.getByRole("button",{name:"Show example results"}).click();await page.getByRole("button",{name:"Review first issue"}).click();
  await expect(page.locator(".evidence-panel")).toBeVisible();await expect(page.locator(".selected-claim")).toContainText("Opened items");
});

test("short laptop screens can enter and complete the guide without scroll-driven controls",async({page})=>{
  await page.setViewportSize({width:1280,height:650});await page.goto("/workspace");await page.getByRole("button",{name:"Prefer a walkthrough? Use the step-by-step guide"}).click();
  await expect(page.getByRole("heading",{name:"Add the policies to check against."})).toBeVisible();
  await page.getByRole("button",{name:"Use our example policies and answer"}).click();
  await page.getByRole("button",{name:"Continue to answer"}).click();await page.getByRole("button",{name:"Continue to check"}).click();await page.getByRole("button",{name:"Show example results"}).click();
  await expect(page.locator(".finding-row")).toHaveCount(6);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
