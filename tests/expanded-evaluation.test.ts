import { describe,expect,it } from "vitest";
import { expandedDrafts,getExpandedCases } from "../evaluation/expanded-cases";
import { evaluateReport,evaluateStability,aggregateMetrics } from "../evaluation/metrics";
import { auditRequestSchema } from "../src/lib/contracts";
import { sampleReport,sampleSources } from "../src/lib/sample";

describe("expanded evaluation provenance and coverage",()=>{
  it("contains 40 distinct scenario packets and 160 candidate targets, split by scenario",async()=>{
    const dev=await getExpandedCases("development"),held=await getExpandedCases("heldout");expect(dev).toHaveLength(20);expect(held).toHaveLength(20);const all=[...dev,...held];expect(all.flatMap(c=>c.targets)).toHaveLength(160);expect(new Set(all.map(c=>c.id)).size).toBe(40);expect(new Set(expandedDrafts.map(d=>d.category)).size).toBe(10);const devSources=new Set(dev.flatMap(c=>c.sources.map(s=>s.hash)));expect(held.flatMap(c=>c.sources).every(s=>!devSources.has(s.hash))).toBe(true);
    for(const c of all){expect(c.labelProvenance).toContain("pending");expect(auditRequestSchema.safeParse({mode:"audit",answer:c.answer,context:c.context,sources:c.sources,selectedSourceIds:c.sources.map(s=>s.id)}).success).toBe(true);for(const target of c.targets){expect(c.answer.includes(target.quote)).toBe(true);expect(c.answer.indexOf(target.quote)).toBe(c.answer.lastIndexOf(target.quote));}}
  });
  it("counts false support, omitted targets and unresolved results without inflating accuracy",async()=>{
    const report=sampleReport(await sampleSources());const targets=report.findings.map(f=>({quote:f.answerQuote,verdict:f.verdict!,rationale:"test target"}));const testCase={id:"test",sources:report.sources,answer:report.answer,context:report.context,targets};report.findings[4].verdict="supported";report.findings=report.findings.slice(1);report.findings[0].validation="unresolved";const metrics=evaluateReport(testCase,report);expect(metrics.correct).toBe(3);expect(metrics.total).toBe(6);expect(metrics.falseSupportRate.numerator).toBe(1);expect(metrics.unresolvedOrUnaligned.numerator).toBe(2);expect(metrics.humanEvidenceRelevance).toBe("not reviewed");expect(aggregateMetrics([metrics]).cases).toBe(1);
  });
  it("does not treat repeated failure to align as stable model judgments",async()=>{
    const report=sampleReport(await sampleSources());const testCase={id:"test",sources:report.sources,answer:report.answer,context:report.context,targets:report.findings.map(f=>({quote:f.answerQuote,verdict:f.verdict!,rationale:"test target"}))};report.findings=report.findings.slice(1);const result=evaluateStability(testCase,[report,report,report]);expect(result.agreement.denominator).toBe(5);expect(result.unresolvedTargets).toBe(1);expect(result.targets[0].unchanged).toBeNull();
  });
});
