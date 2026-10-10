import { test, expect } from "@playwright/test";
import { sampleReport, sampleSources, SAMPLE_ANSWER } from "../src/lib/sample";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile } from "node:fs/promises";

function tinyPdf(text="") {
  const stream=text?`BT /F1 12 Tf 50 740 Td (${text}) Tj ET`:"";
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let pdf="%PDF-1.4\n";const offsets=[0];for(const [i,obj]of objects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;}
  const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,"0")} 00000 n `).join("\n")}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

test("sample audit, citations, fixed-claim comparison, conflict, export and clear",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/");await expect(page.getByRole("heading",{name:"Confidence is easy. Proof is different."})).toBeVisible();
  await page.goto("/examples");await page.getByRole("button",{name:"Open refund case"}).click();
  await expect(page.getByText("Authored findings for fictional policies. No AI request.")).toBeVisible();
  await expect(page.locator(".finding-row")).toHaveCount(6);
  await mkdir("artifacts",{recursive:true});await page.screenshot({path:"artifacts/sample-workspace.png",fullPage:true});
  await page.emulateMedia({media:"print"});await expect(page.locator(".print-report")).toBeVisible();await expect(page.locator(".work-grid")).toBeHidden();await expect(page.locator(".print-report article")).toHaveCount(6);await page.emulateMedia({media:"screen"});
  await page.locator(".finding-row").filter({hasText:"Refunds arrive within 48 hours"}).click();
  await expect(page.locator(".evidence-panel")).toContainText("Insufficient evidence");
  await expect(page.locator(".no-evidence")).toBeVisible();
  await page.locator(".finding-row").filter({hasText:"Standard customers"}).click();
  await page.locator(".citation").first().click();
  await expect(page.getByRole("dialog")).toContainText("PAGE 1");await expect(page.getByRole("dialog").locator("mark")).toContainText("14 days");
  await page.getByRole("button",{name:"Done",exact:true}).click();
  await page.getByRole("checkbox",{name:"Include Premium membership exception"}).uncheck();
  await expect(page.getByText("Source selection changed.",{exact:false})).toBeVisible();
  await page.getByRole("button",{name:"Compare selected sources",exact:true}).click();
  await expect(page.locator(".comparison-notice")).toContainText("2 judgments changed");
  await expect(page.locator(".compare-row").filter({hasText:"Premium members receive free return shipping"})).toContainText("Insufficient evidence");
  await page.getByRole("checkbox",{name:"Changed findings only"}).check();await expect(page.locator(".compare-row")).toHaveCount(2);
  const downloadPromise=page.waitForEvent("download");await page.getByRole("button",{name:"Export JSON"}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toContain("sample");const exported=JSON.parse(await readFile((await download.path())!,"utf8"));expect(exported.origin).toBe("sample");expect(exported.findings).toHaveLength(6);expect(exported.baselineToken).toBeUndefined();expect(exported.sources.every((s:{hash:string})=>s.hash.length===64)).toBe(true);
  await page.getByRole("button",{name:"Restore original audit"}).click();await expect(page.locator(".finding-row").filter({hasText:"Premium members receive free return shipping"})).toContainText("Supported");
  await page.getByRole("button",{name:"Conflicting policies",exact:true}).click();await page.locator(".finding-row").filter({hasText:"Premium members can return unopened"}).click();
  await expect(page.locator(".evidence-panel")).toContainText("Ambiguous / conflicting");await expect(page.locator(".citation.contradicts")).toHaveCount(1);
  await page.getByRole("button",{name:"New review",exact:true}).click();await page.getByRole("button",{name:"Start a new review",exact:true}).click();await page.getByRole("button",{name:"Prefer a walkthrough? Use the step-by-step guide"}).click();
  await expect(page.getByRole("heading",{name:"Add the policies to check against."})).toBeVisible();await expect(page.locator(".source-card")).toHaveCount(0);expect(errors).toEqual([]);
});

test("source upload, editable input, scanned PDF rejection and session-only refresh",async({page})=>{
  await page.route("**/api/health",r=>r.fulfill({json:{configured:true,enabled:true,authenticated:false,model:"test-stub"}}));
  await page.goto("/");await page.goto("/examples");await page.getByRole("button",{name:"Open refund case"}).click();
  await page.getByRole("button",{name:"New review",exact:true}).click();await page.getByRole("button",{name:"Start a new review",exact:true}).click();await page.getByRole("button",{name:"Prefer a walkthrough? Use the step-by-step guide"}).click();
  await page.locator('input[type="file"]').setInputFiles({name:"public-policy.txt",mimeType:"text/plain",buffer:Buffer.from("Returns are accepted within 12 days. All items must be unopened.")});
  await expect(page.locator(".source-card")).toContainText("public-policy.txt");
  await page.getByRole("button",{name:"Continue to answer"}).click();
  await page.getByLabel("AI answer",{exact:false}).fill("Returns are accepted within 12 days.");
  await page.getByRole("button",{name:"Continue to check"}).click();
  await page.getByRole("button",{name:"Check answer",exact:true}).click();await expect(page.getByRole("dialog",{name:"Open a live pilot session"})).toBeVisible();
  await page.getByRole("button",{name:"Close dialog"}).click();await page.reload();await page.getByRole("button",{name:"Prefer a walkthrough? Use the step-by-step guide"}).click();
  await expect(page.getByRole("heading",{name:"Add the policies to check against."})).toBeVisible();
  await expect(page.locator(".source-card")).toHaveCount(0);
  await page.locator('input[type="file"]').setInputFiles({name:"readable.pdf",mimeType:"application/pdf",buffer:tinyPdf("All returns must be requested within 12 days.")});
  await expect(page.locator(".source-card")).toContainText("readable.pdf");
  await page.getByRole("button",{name:/Inspect text:/}).click();await expect(page.getByRole("dialog")).toContainText("within 12 days");await page.getByRole("button",{name:"Done",exact:true}).click();
  await page.locator('input[type="file"]').setInputFiles({name:"scanned.pdf",mimeType:"application/pdf",buffer:tinyPdf()});
  await expect(page.locator(".notice.error")).toContainText("OCR is not included");
  await page.locator('input[type="file"]').setInputFiles({name:"broken.pdf",mimeType:"application/pdf",buffer:Buffer.from("not a valid PDF")});
  await expect(page.locator(".notice.error")).toContainText("corrupt");
  await page.locator('input[type="file"]').setInputFiles({name:"large.txt",mimeType:"text/plain",buffer:Buffer.alloc(5*1024*1024+1,65)});
  await expect(page.locator(".notice.error")).toContainText("5 MB");
});

test("mobile layout provides source and evidence tabs without horizontal overflow",async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto("/");await page.goto("/examples");await page.getByRole("button",{name:"Open refund case"}).click();
  await expect(page.locator(".main-panel")).toBeVisible();await expect(page.locator(".source-panel")).toBeHidden();
  await page.locator(".mobile-tabs").getByRole("button",{name:"Sources",exact:true}).click();await expect(page.locator(".source-panel")).toBeVisible();
  await page.getByRole("checkbox",{name:"Include Premium membership exception"}).uncheck();await page.getByRole("button",{name:"Compare selected sources",exact:true}).click();
  await expect(page.locator(".main-panel")).toBeVisible();await page.locator(".compare-row").filter({hasText:"Premium members receive free return shipping"}).click();await expect(page.locator(".evidence-panel")).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:"artifacts/mobile-evidence.png",fullPage:true});
});

test("a quota failure preserves the current report and never starts a hidden retry",async({page})=>{
  // Transport stubs test browser behavior only; they are not evidence of live Gemini accuracy.
  let audits=0;
  const sources=await sampleSources();const report={...sampleReport(sources),origin:"live",model:"test-stub"};
  await page.route("**/api/health",r=>r.fulfill({json:{configured:true,enabled:true,authenticated:true,model:"test-stub"}}));
  await page.route("**/api/audit",r=>{audits++;return audits===1?r.fulfill({json:report}):r.fulfill({status:429,json:{error:{code:"QUOTA",message:"Free quota exhausted. No paid fallback was used."}}});});
  await page.goto("/");await page.goto("/examples");await page.getByRole("button",{name:"Open refund case"}).click();await page.getByRole("button",{name:"Switch to live"}).click();
  await page.getByRole("button",{name:"Check answer",exact:true}).click();await expect(page.locator(".finding-row")).toHaveCount(6);
  await page.getByRole("checkbox",{name:"Include Premium membership exception"}).uncheck();await page.getByRole("button",{name:"Compare selected sources",exact:true}).click();
  await expect(page.locator(".notice.error")).toContainText("Free quota exhausted");await expect(page.locator(".finding-row")).toHaveCount(6);expect(audits).toBe(2);
});

test("landing and workspace pass automated accessibility checks",async({page})=>{
  test.setTimeout(60000);
  await page.goto("/");
  const landing=await new AxeBuilder({page}).exclude("nextjs-portal").withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();
  expect(landing.violations.map(v=>({id:v.id,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
  await page.locator(".site-header").getByRole("link",{name:"How it works",exact:true}).click();
  const methodology=await new AxeBuilder({page}).exclude("nextjs-portal").withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();
  expect(methodology.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
  await page.locator(".site-header").getByRole("link",{name:"Second Opinion home"}).click();
  await page.goto("/examples");await page.getByRole("button",{name:"Open refund case"}).click();
  const workspace=await new AxeBuilder({page}).exclude("nextjs-portal").withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();
  expect(workspace.violations.map(v=>({id:v.id,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
  await page.getByRole("button",{name:"View inputs",exact:true}).click();const editor=await new AxeBuilder({page}).exclude("nextjs-portal").withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();expect(editor.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
});

test("cancelling a comparison preserves the baseline, retry works, and identical results are cached",async({page})=>{
  const sources=await sampleSources();
  const baseline={...sampleReport(sources),origin:"live",model:"test-stub",baselineToken:"test-baseline"};
  const selected=sources.filter(s=>s.name!=="Premium membership exception").map(s=>s.id);
  const comparison={...sampleReport(sources,selected,true),origin:"live",model:"test-stub"};
  let audits=0;
  let release!:()=>void;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/api/health",r=>r.fulfill({json:{configured:true,enabled:true,authenticated:true,model:"test-stub"}}));
  await page.route("**/api/audit",async r=>{
    const attempt=++audits;
    if(attempt===2){await pending;await r.fulfill({json:comparison}).catch(()=>{});return;}
    await r.fulfill({json:attempt===1?baseline:comparison});
  });
  await page.goto("/");await page.goto("/examples");await page.getByRole("button",{name:"Open refund case"}).click();
  await page.getByRole("button",{name:"Switch to live"}).click();await page.getByRole("button",{name:"Check answer",exact:true}).click();
  await expect(page.locator(".finding-row")).toHaveCount(6);
  await page.getByRole("checkbox",{name:"Include Premium membership exception"}).uncheck();
  await page.getByRole("button",{name:"Compare selected sources",exact:true}).click();
  await expect.poll(()=>audits).toBe(2);
  await page.getByRole("button",{name:"Cancel",exact:true}).click();release();
  await expect(page.getByText("Request cancelled. Your inputs and previous report are preserved.")).toBeVisible();
  await expect(page.locator(".finding-row").filter({hasText:"Premium members receive free return shipping"})).toContainText("Supported");
  await page.getByRole("button",{name:"Compare selected sources",exact:true}).click();
  await expect(page.locator(".comparison-notice")).toContainText("2 judgments changed");expect(audits).toBe(3);
  await page.getByRole("button",{name:"Restore original audit"}).click();
  await page.getByRole("checkbox",{name:"Include Premium membership exception"}).uncheck();
  await page.getByRole("button",{name:"Compare selected sources",exact:true}).click();
  await expect(page.locator(".cache-notice")).toContainText("No new model call");expect(audits).toBe(3);
  await page.getByRole("button",{name:"Inspect text",exact:true}).first().click();
  await page.getByRole("button",{name:"Edit as text",exact:true}).click();
  await page.getByLabel("POLICY TEXT",{exact:true}).fill("All membership tiers have a 12-day return window.");
  await page.getByRole("button",{name:"Save source & reset audit",exact:true}).click();
  await expect(page.locator(".finding-row")).toHaveCount(0);
  await page.getByRole("button",{name:"Continue to answer"}).click();
  await expect(page.getByLabel("AI answer",{exact:false})).toHaveValue(SAMPLE_ANSWER);
  await expect(page.getByRole("button",{name:"Compare selected sources",exact:true})).toHaveCount(0);
});

test("expired access with an HTML response preserves the draft and permits reauthentication",async({page})=>{
  const sources=await sampleSources();const report={...sampleReport(sources),origin:"live",model:"test-stub"};
  let audits=0;
  await page.route("**/api/health",r=>r.fulfill({json:{configured:true,enabled:true,authenticated:true,model:"test-stub"}}));
  await page.route("**/api/session",r=>r.fulfill({json:{ok:true}}));
  await page.route("**/api/audit",r=>++audits===1
    ?r.fulfill({status:401,contentType:"text/html",body:"<html>Access expired</html>"})
    :r.fulfill({json:report}));
  await page.goto("/");await page.goto("/examples");await page.getByRole("button",{name:"Open refund case"}).click();
  await page.getByRole("button",{name:"Switch to live"}).click();await page.getByRole("button",{name:"Check answer",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Open a live pilot session"});
  await expect(dialog).toBeVisible();await expect(dialog).toContainText("Your access session has expired");
  await expect(page.locator(".setup-answer-preview")).toHaveText(SAMPLE_ANSWER);
  await expect(page.locator(".setup-confirm li")).toHaveCount(3);
  await dialog.getByLabel("PILOT ACCESS CODE").fill("synthetic-test-access-code");
  await dialog.getByRole("button",{name:"Open session",exact:true}).click();
  await expect(dialog).toBeHidden();await page.getByRole("button",{name:"Check answer",exact:true}).click();
  await expect(page.locator(".finding-row")).toHaveCount(6);expect(audits).toBe(2);
});

