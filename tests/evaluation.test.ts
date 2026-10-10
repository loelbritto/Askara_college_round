import { describe, expect, it } from "vitest";
import { getCases, getPairedCases } from "../evaluation/cases";
import { auditRequestSchema, VERDICTS } from "../src/lib/contracts";
describe("evaluation fixture integrity",()=>{
  it.each([["development",12,3],["heldout",24,6]] as const)("keeps %s labels balanced and separate from model predictions",async(split,total,perClass)=>{
    const cases=await getCases(split);const targets=cases.flatMap(c=>c.targets);expect(targets).toHaveLength(total);for(const v of VERDICTS)expect(targets.filter(t=>t.verdict===v)).toHaveLength(perClass);
    for(const c of cases)expect(auditRequestSchema.safeParse({mode:"audit",answer:c.answer,context:c.context,sources:c.sources,selectedSourceIds:c.sources.map(s=>s.id)}).success).toBe(true);
  });
  it("includes eight distinct evidence-change scenarios",async()=>{const pairs=await getPairedCases();expect(pairs).toHaveLength(8);expect(new Set(pairs.map(p=>p.id)).size).toBe(8);expect(pairs.map(p=>p.id)).toContain("remove-redundant");expect(pairs.map(p=>p.id)).toContain("add-irrelevant");});
});
