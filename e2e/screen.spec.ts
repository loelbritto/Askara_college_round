import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile } from "node:fs/promises";

const result={id:"test-record",claim:"The library is closed on Sundays.",subject:"general",createdAt:"2026-10-11T00:00:00Z",method:"evidence-discovery",sources:[{id:"paper-1",title:"Fictional reference for interface testing",publisher:"Test fixture",kind:"paper",url:"https://example.org/paper",abstract:"The library opens on weekdays and is closed on Sundays.",retrievedAt:"2026-10-11T00:00:00Z"},{id:"review-1",title:"Published review fixture",publisher:"Test publisher",kind:"fact-check",url:"https://example.org/review",reviewedClaim:"The library is always open.",publishedRating:"False",retrievedAt:"2026-10-11T00:00:00Z"}],providers:[{name:"Research fixture",status:"ok",message:"Fixture only."}],notice:"Retrieved references need human review. These are not factual verdicts."};

test("extension handoff requires consent; fact-check claim text cannot enter NLI; edits invalidate results",async({page})=>{
  let calls=0;
  await page.route("**/api/screen",route=>{calls++;expect(route.request().postDataJSON()).toEqual({claim:result.claim,subject:"general",discover:true});return route.fulfill({json:result});});
  await page.goto(`/screen#claim=${encodeURIComponent(result.claim)}&subject=general`);
  await expect(page.getByLabel("What claim would you like to check?")).toHaveValue(result.claim);
  await expect(page.getByLabel("Subject",{exact:false})).toHaveValue("general");
  expect(page.url()).not.toContain("#");expect(calls).toBe(0);
  await expect(page.getByRole("button",{name:"Find evidence",exact:true})).toBeDisabled();
  await page.getByLabel("Search public sources with this claim.",{exact:false}).check();
  await page.getByRole("button",{name:"Find evidence",exact:true}).click();
  await expect(page.getByRole("heading",{name:"2 sources to inspect"})).toBeVisible();expect(calls).toBe(1);
  await expect(page.locator(".screen-source").nth(1).getByRole("checkbox")).toBeDisabled();
  await expect(page.locator(".screen-source").nth(1)).toContainText("Claim reviewed by the publisher");
  const download=page.waitForEvent("download");await page.getByRole("button",{name:"Export record"}).click();expect((await download).suggestedFilename()).toMatch(/second-opinion-evidence/);
  await page.getByLabel("What claim would you like to check?").fill("A different claim.");
  await expect(page.getByRole("region",{name:"Evidence results"})).toHaveCount(0);
});

test("supplied passage stays local and model failure does not fabricate a result",async({page})=>{
  let searches=0;await page.route("**/api/screen",()=>{searches++;});
  await page.route("**/screen-worker.js",route=>route.fulfill({contentType:"text/javascript",body:`self.onmessage=()=>self.postMessage({type:"done",votes:[],failures:["Models unavailable in this test. No verdict was substituted."]});`}));
  await page.goto("/screen");await page.getByLabel("What claim would you like to check?").fill(result.claim);
  await page.getByText("Have your own reference passage? Check it locally.").click();
  await page.getByLabel("Reference text",{exact:true}).fill(result.sources[0].abstract!);
  await page.getByRole("button",{name:"Use this passage locally"}).click();
  expect(searches).toBe(0);await expect(page.getByRole("heading",{name:"1 sources to inspect"})).toBeVisible();
  await page.getByRole("button",{name:"Download & run both models"}).click();
  await expect(page.locator(".screen-error")).toContainText("No verdict was substituted");
  await expect(page.locator(".screen-votes")).toHaveCount(0);
  const downloadEvent=page.waitForEvent("download");await page.getByRole("button",{name:"Export record"}).click();
  const exported=JSON.parse(await readFile((await (await downloadEvent).path())!,"utf8"));
  expect(exported.evidence).toBeNull();expect(exported.claim).toBe(result.claim);expect(exported.modelRun.claim).toBe(result.claim);
});

test("starting a new claim cancels an old search without restoring stale results",async({page})=>{
  let release!:()=>void;let requested!:()=>void;
  const ready=new Promise<void>(resolve=>{requested=resolve;});const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/api/screen",async route=>{requested();await pending;await route.fulfill({json:result}).catch(()=>{});});
  await page.goto("/screen");await page.getByLabel("What claim would you like to check?").fill(result.claim);
  await page.getByLabel("Search public sources with this claim.",{exact:false}).check();await page.getByRole("button",{name:"Find evidence",exact:true}).click();await ready;
  await page.getByRole("link",{name:"New claim",exact:true}).click();release();
  await expect(page.getByLabel("What claim would you like to check?")).toHaveValue("");
  await expect(page.getByRole("region",{name:"Evidence results"})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Find evidence",exact:true})).toBeDisabled();
});

test("free screening and integration setup are accessible on desktop and mobile",async({page})=>{
  await mkdir("output/screening",{recursive:true});
  await page.setViewportSize({width:1440,height:1000});await page.goto("/screen");
  await expect(page.locator(".screen-sidebar")).toHaveCSS("position","fixed");
  await expect(page.locator(".screen-composer")).toHaveCSS("border-radius","17px");
  expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({path:"output/screening/desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({path:"output/screening/mobile.png",fullPage:true});
  await page.goto("/connect");expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
  await expect(page.getByRole("heading",{name:"3. Click “Load unpacked”"})).toBeVisible();
  await page.getByText("Already installed, or stuck on a step?",{exact:true}).click();
  await expect(page.getByText("“Manifest missing”:",{exact:false})).toBeVisible();
  await page.screenshot({path:"output/screening/connect-mobile.png",fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:"output/screening/connect-desktop.png",fullPage:true});
  await page.locator(".connect-explainer").scrollIntoViewIfNeeded();
  expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
  const zipDownload=page.waitForEvent("download");
  await page.getByRole("link",{name:"Download extension ZIP"}).click();
  expect((await zipDownload).suggestedFilename()).toBe("second-opinion-chrome.zip");
  await expect(page.getByRole("status").filter({hasText:"Download requested"})).toBeVisible();
  await expect(page.getByRole("link",{name:"Download extension ZIP"})).toHaveAttribute("href",/^\/downloads\/second-opinion-chrome\.zip\?v=/);
});
