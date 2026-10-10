import { test,expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir,readFile } from "node:fs/promises";
import { sampleOutput,sampleReport,sampleSources } from "../src/lib/sample";
import { segmentAnswer } from "../src/lib/canonical";
import { validateOutput } from "../src/lib/validate-report";
import type { AuditRequest, Source } from "../src/lib/contracts";

test("incomplete and empty model reports never show a successful result summary",async({page})=>{
  const report=sampleReport(await sampleSources());
  await page.route("**/api/health",r=>r.fulfill({json:{configured:true,enabled:true,authenticated:true,model:"test-stub"}}));
  await page.route("**/api/audit",r=>r.fulfill({json:{...report,origin:"live",findings:[],complete:true,warnings:[]}}));
  await page.goto("/examples");await page.getByRole("button",{name:"Open refund case"}).click();await page.getByRole("button",{name:"Switch to live"}).click();await page.getByRole("button",{name:"Check answer",exact:true}).click();
  await expect(page.getByRole("heading",{name:"No statements could be checked."})).toBeVisible();await expect(page.getByText("Every checked statement has supporting evidence.")).toHaveCount(0);await expect(page.getByRole("button",{name:"Review available findings"})).toBeDisabled();
});

test("policy interpretations are editable, scoped, exportable and accessible",async({page})=>{
  await page.goto("/examples");await page.getByRole("button",{name:"Open refund case"}).click();
  await page.locator(".finding-row").filter({hasText:"Premium members can return unopened"}).click();
  const rule=page.locator(".policy-rule").filter({hasText:"Premium members only"});await rule.locator("summary").click();
  await expect(rule).toContainText("30 days from purchase");await rule.getByRole("button",{name:"Edit interpretation"}).click();await rule.getByLabel("Required conditions").fill("Check membership, unopened item, and receipt.");await rule.getByRole("button",{name:"Save interpretation"}).click();await rule.getByRole("checkbox",{name:"I reviewed this interpretation"}).check();
  await expect(rule).toContainText("Interpretation reviewed");await page.locator(".site-header").getByRole("link",{name:"Examples",exact:true}).click();await page.locator(".site-header").getByRole("link",{name:"Continue review",exact:true}).click();await expect(rule).toContainText("Check membership, unopened item, and receipt.");
  const downloadPromise=page.waitForEvent("download");await page.getByRole("button",{name:"Download review brief"}).click();const download=await downloadPromise;const brief=await readFile((await download.path())!,"utf8");expect(brief).toContain("Check membership, unopened item, and receipt.");expect(brief).toContain("Original proposed interpretation");
  await page.locator(".finding-row").filter({hasText:"Refunds arrive within 48 hours"}).click();await expect(page.locator(".finding-next-action")).toContainText("refund-processing time");await page.getByRole("button",{name:"Revise answer",exact:true}).click();await expect(page.getByLabel("Revised answer")).not.toHaveValue(/48 hours/);await expect(page.getByRole("button",{name:"Check revision",exact:true})).toBeDisabled();await expect(page.locator(".revision-diff del")).toContainText("Refunds arrive within 48 hours");await page.getByRole("button",{name:"Keep current report"}).click();
  await mkdir("artifacts",{recursive:true});await page.screenshot({path:"artifacts/policy-next-action.png",fullPage:true});
  const a11y=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();expect(a11y.violations).toEqual([]);
});

test("revisions create fresh audits, preserve old notes and expose policy version impact",async({page})=>{
  test.setTimeout(60000);const requests:AuditRequest[]=[];let fail=false;
  await page.route("**/api/health",r=>r.fulfill({json:{configured:true,enabled:true,authenticated:true,model:"test-stub"}}));
  await page.route("**/api/audit",async route=>{
    const request=route.request().postDataJSON() as AuditRequest;requests.push(request);
    if(fail)return route.fulfill({status:429,json:{error:{code:"QUOTA",message:"Quota exhausted. Original report preserved."}}});
    const sources=request.sources as Source[],raw=sampleOutput(sources,request.selectedSourceIds),segments=segmentAnswer(request.answer);
    raw.findings=raw.findings.map((f,i)=>({...f,answerQuote:segments[i].text,proposition:segments[i].text}));
    if(sources[0].pages[0].text.includes("10 days")){raw.findings[0].verdict="contradicted";raw.findings[0].evidence=raw.findings[0].evidence.map(e=>({...e,relation:"contradicts"}));}
    const report=validateOutput(raw,request,sources,{model:"test-stub",elapsedMs:1});report.baselineToken="new-test-baseline";return route.fulfill({json:report});
  });
  await page.goto("/examples");await page.getByRole("button",{name:"Open refund case"}).click();await page.locator(".finding-row").filter({hasText:"Refunds arrive within 48 hours"}).click();await page.getByLabel("Reviewer note for C5").fill("Original note survives revisions.");
  await page.getByRole("button",{name:"Revise answer",exact:true}).click();await expect(page.getByLabel("Revised answer")).toHaveValue(/do not specify/);await page.getByRole("button",{name:"Check revision",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(requests[0].mode).toBe("audit");expect(requests[0].baselineToken).toBeUndefined();expect(requests[0].claims).toBeUndefined();
  await page.locator(".revision-history>summary").click();await expect(page.locator(".revision-history")).toContainText("2 audit versions");await page.locator(".history-report").filter({hasText:"Original report"}).locator("summary").click();await expect(page.locator(".revision-history")).toContainText("Original note survives revisions.");
  await page.getByRole("button",{name:"Update a policy",exact:true}).click();await page.getByLabel("Version label",{exact:true}).fill("October v2");const input=page.getByLabel("Revised policy text");await input.fill((await input.inputValue()).replace("14 days","10 days"));await page.getByRole("button",{name:"Check revision",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);await expect(page.locator(".revision-history")).toContainText("Policy change impact");await expect(page.locator(".revision-history")).toContainText("1 matched judgments changed");expect(requests[1].sources[0].id).not.toBe(requests[0].sources[0].id);expect(requests[1].baselineToken).toBeUndefined();
  fail=true;await page.getByRole("button",{name:"Add context",exact:true}).click();await page.getByLabel("Customer context or original question").fill("The customer is a premium member.");await page.getByRole("button",{name:"Check revision",exact:true}).click();await expect(page.getByRole("dialog")).toContainText("Quota exhausted");await expect(page.getByLabel("Customer context or original question")).toHaveValue("The customer is a premium member.");await page.getByRole("button",{name:"Keep current report"}).click();await expect(page.locator(".revision-history")).toContainText("3 audit versions");expect(requests).toHaveLength(3);
  const promise=page.waitForEvent("download");await page.getByRole("button",{name:"Download audit history"}).click();const exported=JSON.parse(await readFile((await (await promise).path())!,"utf8"));expect(exported.audits).toHaveLength(3);expect(exported.audits.every((v:{report:{baselineToken?:string}})=>v.report.baselineToken===undefined)).toBe(true);
  await page.setViewportSize({width:390,height:844});await page.getByRole("button",{name:"Revise answer",exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:"artifacts/revision-mobile.png",fullPage:true});const a11y=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();expect(a11y.violations).toEqual([]);
});
