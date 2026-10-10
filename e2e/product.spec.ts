import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile } from "node:fs/promises";

test("example library filters and opens the actual conflict report without an AI request",async({page})=>{
  test.setTimeout(60000);
  let audits=0;page.on("request",r=>{if(r.url().endsWith("/api/audit"))audits++;});
  await page.goto("/examples");await expect(page.locator(".example-card")).toHaveCount(3);
  await page.getByRole("button",{name:"Conflicts",exact:true}).click();await expect(page.locator(".example-card")).toHaveCount(1);
  await page.getByLabel("Search examples").fill("unmatched query");await expect(page.getByText("No matching scenarios.")).toBeVisible();
  await page.getByRole("button",{name:"Reset filters"}).click();await expect(page.locator(".example-card")).toHaveCount(3);
  await page.getByRole("button",{name:"Open conflict case"}).click();await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.locator(".finding-row")).toHaveCount(6);await expect(page.locator(".source-card")).toHaveCount(4);
  await expect(page.locator(".evidence-panel")).toContainText("Ambiguous / conflicting");
  expect(audits).toBe(0);
});

test("review notes persist across pages, present with real citations, and export separately",async({page})=>{
  test.setTimeout(60000);await page.goto("/");await page.goto("/examples");await page.getByRole("button",{name:"Open refund case"}).click();
  await page.getByLabel("Reviewer note for C1",{exact:true}).fill("Check the unopened-item condition with the customer.");
  await page.getByRole("checkbox",{name:"Mark C1 reviewed"}).check();await expect(page.locator(".review-progress")).toContainText("1 of 6");
  await page.getByLabel("Search claims").fill("48 hours");await expect(page.locator(".finding-row")).toHaveCount(1);await page.getByLabel("Search claims").fill("");
  await page.locator(".site-header").getByRole("link",{name:"How it works"}).click();await expect(page).toHaveURL(/\/methodology$/);
  await page.locator(".site-header").getByRole("link",{name:"Continue review"}).click();await expect(page.locator(".source-card")).toHaveCount(3);
  await expect(page.getByLabel("Reviewer note for C1",{exact:true})).toHaveValue("Check the unopened-item condition with the customer.");
  await page.getByRole("link",{name:"Present",exact:true}).click();await expect(page).toHaveURL(/\/present$/);
  await expect(page.locator(".presentation-quote")).toHaveCount(2);await expect(page.locator(".presenter-note")).toContainText("unopened-item condition");
  await mkdir("artifacts",{recursive:true});await page.screenshot({path:"artifacts/presentation-desktop.png",fullPage:true});
  await page.keyboard.press("ArrowRight");await expect(page.locator(".presentation-claim h1")).toContainText("Premium members can return");
  await page.getByRole("button",{name:"Go to claim 5",exact:true}).click();await expect(page.locator(".presentation-no-evidence")).toBeVisible();
  const downloadPromise=page.waitForEvent("download");await page.getByRole("button",{name:"Download review brief"}).click();const download=await downloadPromise;
  const text=await readFile((await download.path())!,"utf8");expect(text).toContain("Authored synthetic sample. No AI call.");expect(text).toContain("Reviewer note: Check the unopened-item condition");expect(text).not.toContain("sample-only");
  await page.getByRole("button",{name:"Back to workspace"}).click();await expect(page.locator(".finding-row")).toHaveCount(6);
  await page.reload();await expect(page.getByRole("heading",{name:"A second look. A clearer answer."})).toBeVisible();await expect(page.locator(".source-card")).toHaveCount(0);
});

test("replacing a case is explicit and the missing-source case preserves a baseline",async({page})=>{
  await page.goto("/");await page.goto("/examples");await page.getByRole("button",{name:"Open refund case"}).click();
  await page.locator(".site-header").getByRole("link",{name:"Examples"}).click();await page.getByRole("button",{name:"Open missing-source case"}).click();
  await expect(page.getByRole("dialog",{name:"Open a different example?"})).toBeVisible();await page.getByRole("button",{name:"Keep current workspace"}).click();
  await page.locator(".site-header").getByRole("link",{name:"Continue review"}).click();await expect(page.locator(".comparison-notice")).toHaveCount(0);
  await page.locator(".site-header").getByRole("link",{name:"Examples"}).click();await page.getByRole("button",{name:"Open missing-source case"}).click();await page.getByRole("button",{name:"Replace with example"}).click();
  await expect(page.locator(".comparison-notice")).toContainText("2 judgments changed");await expect(page.locator(".evidence-panel")).toContainText("Insufficient evidence");
  await page.getByRole("button",{name:"Restore original audit"}).click();await expect(page.locator(".finding-row").filter({hasText:"free return shipping"})).toContainText("Supported");
});

test("evidence lab explains four different judgments and resets its score",async({page})=>{
  test.setTimeout(60000);let audits=0;page.on("request",r=>{if(r.url().endsWith("/api/audit"))audits++;});await page.goto("/lab");
  for(const [i,verdict] of ["Contradicted","Insufficient evidence","Supported","Ambiguous / conflicting"].entries()){
    await page.locator(".lab-options").getByRole("button",{name:new RegExp(verdict)}).click();await expect(page.locator(".lab-feedback")).toContainText("That matches the evidence.");
    await page.getByRole("button",{name:i===3?"See my takeaways":"Next challenge"}).click();
  }
  await expect(page.locator(".lab-finish")).toContainText("4 of 4");expect(audits).toBe(0);await page.getByRole("button",{name:"Try again"}).click();
  await expect(page.locator(".lab-progress")).toContainText("0 / 4");await expect(page.locator(".lab-options button").first()).toBeEnabled();
});

test("new pages are accessible and responsive, including mobile navigation",async({page})=>{
  test.setTimeout(120000);await mkdir("artifacts",{recursive:true});
  for(const route of ["examples","lab","methodology"]){
    await page.setViewportSize({width:1440,height:1000});await page.goto(`/${route}`);await page.evaluate(()=>document.fonts.ready);
    await expect(page.locator(".site-header .site-navigation")).toBeVisible();
    await page.screenshot({path:`artifacts/${route}-desktop.png`,fullPage:true});
    const result=await new AxeBuilder({page}).exclude("nextjs-portal").withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();
    expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),route).toEqual([]);
    await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:`artifacts/${route}-mobile.png`,fullPage:true});
  }
  await page.getByRole("button",{name:"Open navigation"}).click();await expect(page.getByRole("button",{name:"Close navigation"})).toHaveAttribute("aria-expanded","true");
  await page.locator(".site-navigation").getByRole("link",{name:"Examples",exact:true}).click();await expect(page).toHaveURL(/\/examples$/);await expect(page.getByRole("button",{name:"Open navigation"})).toHaveAttribute("aria-expanded","false");
});

test("presentation has an honest empty state and the active view stays accessible",async({page})=>{
  test.setTimeout(60000);await page.goto("/present");await expect(page.locator(".presentation-empty")).toContainText("Open an audit first");
  await page.getByRole("button",{name:"Open the refund example"}).click();await page.getByRole("link",{name:"Present",exact:true}).click();
  const result=await new AxeBuilder({page}).exclude("nextjs-portal").withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
  await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:"artifacts/presentation-mobile.png",fullPage:true});
});
