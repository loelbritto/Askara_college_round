import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

test("cinematic landing keeps its interactive story and opens the guided review",async({page})=>{
  test.setTimeout(60000);let audits=0;page.on("request",r=>{if(r.url().endsWith("/api/audit"))audits++;});
  await mkdir("artifacts",{recursive:true});await page.setViewportSize({width:1440,height:1050});await page.goto("/");await page.evaluate(()=>document.fonts.ready);
  await expect(page.getByRole("button",{name:"Try with an example",exact:true})).toBeInViewport();
  await expect(page.getByRole("link",{name:"I have my own documents",exact:true})).toBeInViewport();
  await expect(page.locator(".hero-evidence")).toBeVisible();
  await page.screenshot({path:"artifacts/landing-desktop.png"});
  await page.getByRole("link",{name:"A CLEAR PATH FROM ANSWER TO EVIDENCE"}).click();await expect(page.getByRole("heading",{name:"One review. Three simple steps."})).toBeInViewport();
  await page.getByRole("button",{name:/Test what changes/}).click();await expect(page.locator("#approach")).toHaveAttribute("data-step","2");
  await expect(page.locator(".scene-verdict")).toContainText("Insufficient evidence");
  await page.getByRole("checkbox",{name:"Include premium policy in illustration"}).check();await expect(page.locator(".scene-result")).toContainText("Support restored");
  await page.locator(".story-inner").screenshot({path:"artifacts/evidence-story.png"});
  const axe=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();expect(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
  await page.getByRole("button",{name:"Start guided example",exact:true}).click();await expect(page.getByRole("heading",{name:"Your example policies are ready."})).toBeVisible();
  await page.getByRole("button",{name:"Continue to answer"}).click();
  await page.locator(".site-header").getByRole("link",{name:"Second Opinion home"}).click();await page.getByRole("link",{name:"Continue your review",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Here’s the answer we’ll check."})).toBeVisible();expect(audits).toBe(0);
});

test("cinematic chapters work on mobile, reduced motion, and short laptop screens",async({page})=>{
  test.setTimeout(60000);await mkdir("artifacts",{recursive:true});await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:"reduce"});await page.goto("/");
  await expect(page.getByRole("button",{name:"Try with an example",exact:true})).toBeInViewport();await page.screenshot({path:"artifacts/landing-mobile.png"});
  await page.getByRole("button",{name:/Test what changes/}).click();await page.getByRole("checkbox",{name:"Include premium policy in illustration"}).check();await expect(page.locator(".scene-result")).toContainText("Support restored");
  await page.getByRole("button",{name:/Follow the evidence/}).click();await expect(page.locator("#approach")).toHaveAttribute("data-step","1");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.setViewportSize({width:1280,height:650});await page.emulateMedia({reducedMotion:"no-preference"});
  await page.getByRole("button",{name:/Test what changes/}).click();await expect(page.locator("#approach")).toHaveAttribute("data-step","2");
  expect(await page.locator(".story-sticky").evaluate(el=>getComputedStyle(el).position)).toBe("relative");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
