import { test,expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile,mkdir } from "node:fs/promises";
import { createArchive } from "../src/lib/workspace-archive";
import { sampleReport,sampleSources,SAMPLE_ANSWER,SAMPLE_CONTEXT } from "../src/lib/sample";

test("a complete review file survives refresh, restores notes and rejects damaged evidence",async({page})=>{
  await page.goto("/examples");await page.getByRole("button",{name:"Open refund case"}).click();
  await page.getByLabel("Reviewer note for C1").fill("Check the original receipt before sending.");
  await page.getByRole("button",{name:"Save or open a review",exact:true}).click();
  const downloaded=page.waitForEvent("download");await page.getByRole("button",{name:"Download review file"}).click();const raw=await readFile((await (await downloaded).path())!,"utf8");expect(raw).not.toContain("baselineToken");
  await page.reload();await expect(page.getByRole("heading",{name:"Let’s check an answer."})).toBeVisible();
  await page.getByRole("button",{name:"Save or open a review",exact:true}).click();const chooser=page.waitForEvent("filechooser");await page.getByRole("button",{name:"Open review file",exact:true}).click();await (await chooser).setFiles({name:"review.json",mimeType:"application/json",buffer:Buffer.from(raw)});
  await expect(page.getByRole("heading",{name:"Replace the review in this tab?"})).toBeVisible();await page.getByRole("button",{name:"Replace with saved review"}).click();await expect(page.getByText("Saved review opened",{exact:true})).toBeVisible();await expect(page.getByLabel("Reviewer note for C1")).toHaveValue("Check the original receipt before sending.");
  await page.getByRole("button",{name:"Save or open a review",exact:true}).click();const corrupt=JSON.parse(raw);corrupt.reports[0].findings[0].evidence[0].quote="Fabricated quotation";
  const badChooser=page.waitForEvent("filechooser");await page.getByRole("button",{name:"Open review file",exact:true}).click();await (await badChooser).setFiles({name:"damaged.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(corrupt))});await expect(page.getByRole("dialog")).toContainText("inconsistent documents or references");
  await page.getByRole("button",{name:"Close dialog"}).click();await expect(page.getByLabel("Reviewer note for C1")).toHaveValue("Check the original receipt before sending.");
  await page.setViewportSize({width:390,height:844});await page.getByRole("button",{name:"Save or open a review",exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);await mkdir("artifacts",{recursive:true});await page.screenshot({path:"artifacts/save-review-mobile.png"});
});

test("individual sign-in preserves the draft and sends credentials only to the session endpoint",async({page})=>{
  const requests:unknown[]=[];
  await page.route("**/api/health",r=>r.fulfill({json:{configured:true,enabled:true,authenticated:false,authMode:"supabase",accountsConfigured:true,model:"test-stub"}}));
  await page.route("**/api/session",route=>{requests.push(route.request().postDataJSON());return route.fulfill({json:{authenticated:true,authMode:"supabase"}});});
  await page.goto("/examples");await page.getByRole("button",{name:"Open refund case"}).click();await page.getByRole("button",{name:"Switch to live"}).click();await page.getByRole("button",{name:"Check answer",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"Sign in to Second Opinion"})).toBeVisible();await page.getByLabel("Email",{exact:true}).fill("reviewer@example.test");await page.getByLabel("Password",{exact:true}).fill("fictional-test-password");expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);expect(requests).toEqual([{email:"reviewer@example.test",password:"fictional-test-password"}]);await expect(page.getByRole("button",{name:"Check answer",exact:true})).toBeEnabled();
});

test("cloud versions, stale-save conflicts and explicit deletion preserve the local review",async({page})=>{
  const id="33333333-3333-4333-8333-333333333333";let version=0,deleted=false;const saved:unknown[]=[];
  await page.route("**/api/health",r=>r.fulfill({json:{configured:true,enabled:true,authenticated:true,authMode:"supabase",accountsConfigured:true,model:"test-stub"}}));
  await page.route("**/api/workspaces",route=>{
    const body=route.request().postDataJSON();
    if(body.action==="save"){
      if(body.expectedVersion!==version)return route.fulfill({status:409,json:{error:{message:"This review changed in another tab. Save a separate copy."}}});
      saved.push(body.archive);version++;return route.fulfill({json:{id,version}});
    }
    if(body.action==="list")return route.fulfill({json:deleted?[]:[{id,title:"Refund review",version,updatedAt:new Date().toISOString(),versions:[version,1].filter((v,i,a)=>a.indexOf(v)===i)}]});
    if(body.action==="load")return route.fulfill({json:saved[body.version-1]});
    if(body.action==="delete"){deleted=true;return route.fulfill({json:{deleted:true}});}
    return route.fulfill({status:400});
  });
  await page.goto("/examples");await page.getByRole("button",{name:"Open refund case"}).click();await page.getByRole("button",{name:"Save or open a review",exact:true}).click();await page.getByLabel("Review name").fill("Refund review");await page.getByRole("button",{name:"Save review",exact:true}).click();await expect(page.getByRole("status")).toContainText("Saved version 1");await page.getByRole("button",{name:"Save a new version",exact:true}).click();await expect(page.getByRole("status")).toContainText("Saved version 2");
  version++;await page.getByRole("button",{name:"Save a new version",exact:true}).click();await expect(page.getByRole("dialog").getByRole("alert")).toContainText("changed in another tab");version=2;
  await page.getByRole("button",{name:"Show saved reviews"}).click();await page.getByLabel("Version of Refund review").selectOption("1");await page.getByRole("button",{name:"Open saved review",exact:true}).click();await page.getByRole("button",{name:"Replace with saved review"}).click();await expect(page.getByText("Saved review opened",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Save or open a review",exact:true}).click();await page.getByRole("button",{name:"Show saved reviews"}).click();await page.getByRole("button",{name:"Delete Refund review",exact:true}).click();expect(deleted).toBe(false);await page.getByRole("button",{name:"Delete all saved versions",exact:true}).click();await expect(page.getByRole("dialog").getByRole("status")).toContainText("versions deleted");expect(deleted).toBe(true);await page.getByRole("button",{name:"Close dialog"}).click();await expect(page.getByRole("heading",{name:"Your answer, checked."})).toBeVisible();
});

test("restored live findings require a fresh audit before source comparison",async({page})=>{
  const sources=await sampleSources(),baseline=sampleReport(sources);baseline.origin="live";baseline.baselineToken="expired-signature";
  const archive=await createArchive({sources,selectedIds:sources.map(s=>s.id),answer:SAMPLE_ANSWER,context:SAMPLE_CONTEXT,sampleMode:false,setupStep:3,baseline,comparison:null,showComparison:false,history:[],reviews:{},ruleReviews:{}});
  let calls=0;await page.route("**/api/audit",route=>{calls++;return route.fulfill({json:{...baseline,baselineToken:"fresh-signature"}});});
  await page.route("**/api/health",r=>r.fulfill({json:{configured:true,enabled:true,authenticated:true,model:"test-stub"}}));
  await page.goto("/workspace");await page.getByRole("button",{name:"Save or open a review",exact:true}).click();const chooser=page.waitForEvent("filechooser");await page.getByRole("button",{name:"Open review file",exact:true}).click();await (await chooser).setFiles({name:"live-review.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(archive))});await page.getByRole("button",{name:"Replace with saved review"}).click();
  await page.locator(".source-card input[type=checkbox]").first().uncheck();await page.getByRole("button",{name:"Compare to apply"}).click();await expect(page.locator(".notice.error")).toContainText("Run a fresh audit");expect(calls).toBe(0);await page.getByRole("button",{name:"Run a fresh audit"}).click();await expect(page.getByText("Saved review opened",{exact:true})).toHaveCount(0);expect(calls).toBe(1);
});
