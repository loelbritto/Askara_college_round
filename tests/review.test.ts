import { describe, it, expect } from "vitest";
import { sampleReport, sampleSources } from "../src/lib/sample";
import { reviewBrief, reviewKey } from "../src/lib/review";
describe("human review export",()=>{
  it("binds annotations to their report and keeps human review separate from model findings",async()=>{
    const report=sampleReport(await sampleSources());
    const brief=reviewBrief(report,{[reviewKey(report.id,"c1")]:{checked:true,note:"Ask for the receipt."},[reviewKey("different-report","c1")]:{checked:true,note:"Do not carry this note over."}});
    expect(brief).toContain("1 / 6 claims marked reviewed");expect(brief).toContain("Reviewer note: Ask for the receipt.");expect(brief).not.toContain("Do not carry this note over");expect(brief).not.toContain(report.baselineToken);expect(brief).toContain("not model findings");expect(brief).toContain(report.findings[0].evidence[0].quote);
  });
  it("labels hypothetical reports and exports unresolved judgments without overstating confidence",async()=>{
    const report=sampleReport(await sampleSources(),[],true);report.findings[0].verdict=null;
    const brief=reviewBrief(report,{});expect(brief).toContain("Hypothetical assessment");expect(brief).toContain("Selected sources: 0");expect(brief).toContain("Judgment: Needs review");expect(brief).toContain("No AI call");
  });
});
