import { describe, expect, it } from "vitest";
import { auditRequestSchema, modelOutputSchema, type AuditRequest } from "../src/lib/contracts";
import { canonicalizeSources, createSource, segmentAnswer, validateSourceCollection } from "../src/lib/canonical";
import { canonicalClaims, noEvidenceOutput, validateOutput } from "../src/lib/validate-report";
import { sampleOutput, sampleReport, sampleSources, SAMPLE_ANSWER, SAMPLE_CONTEXT } from "../src/lib/sample";

async function fixture(conflict=false) {
  const sources=await sampleSources(conflict);
  const request:AuditRequest={mode:"audit",answer:SAMPLE_ANSWER,context:SAMPLE_CONTEXT,sources,selectedSourceIds:sources.map(s=>s.id)};
  return {sources,request,raw:sampleOutput(sources,request.selectedSourceIds)};
}
const meta={model:"unit-test",elapsedMs:1};
describe("evidence and claim validation",()=>{
  it("validates the mixed sample without pretending missing evidence is false",async()=>{
    const {sources,request,raw}=await fixture();const report=validateOutput(raw,request,sources,meta);
    expect(report.complete).toBe(true);expect(report.findings.map(f=>f.verdict)).toEqual(["supported","supported","supported","contradicted","insufficient","contradicted"]);
    expect(report.findings.every(f=>request.answer.slice(f.start!,f.end!)===f.answerQuote)).toBe(true);
  });
  it("turns invented evidence quotes into an unresolved finding",async()=>{
    const {sources,request,raw}=await fixture();raw.findings[0].evidence[0].quote="Every refund is guaranteed in one hour.";
    const report=validateOutput(raw,request,sources,meta);expect(report.findings[0].verdict).toBeNull();expect(report.complete).toBe(false);expect(report.findings[0].evidence.some(e=>e.quote.includes("one hour"))).toBe(false);
  });
  it("rejects unknown and excluded block references",async()=>{
    const {sources,request,raw}=await fixture();request.selectedSourceIds=[sources[0].id];raw.findings[0].evidence[0].blockId="imaginary";
    const report=validateOutput(raw,request,sources,meta);expect(report.findings[0].validation).toBe("unresolved");expect(report.findings[1].verdict).toBeNull();
  });
  it("requires appropriate evidence relations",async()=>{
    const {sources,request,raw}=await fixture();raw.findings[0].evidence.forEach(e=>e.relation="contradicts");
    expect(validateOutput(raw,request,sources,meta).findings[0].verdict).toBeNull();
  });
  it("shows both sides of a policy conflict",async()=>{
    const {sources,request,raw}=await fixture(true);const finding=validateOutput(raw,request,sources,meta).findings[1];expect(finding.verdict).toBe("ambiguous");expect(new Set(finding.evidence.map(e=>e.relation)).size).toBe(2);
  });
  it("does not accept conflict strength with one side missing",async()=>{
    const {sources,request,raw}=await fixture(true);raw.findings[1].evidence=raw.findings[1].evidence.filter(e=>e.relation==="supports");expect(validateOutput(raw,request,sources,meta).findings[1].verdict).toBeNull();
  });
  it("reports omitted sentences and invalid answer spans",async()=>{
    const {sources,request,raw}=await fixture();raw.findings.pop();raw.findings[0].answerQuote="Text never in the answer";const report=validateOutput(raw,request,sources,meta);expect(report.complete).toBe(false);expect(report.warnings.join(" ")).toContain("not accounted");expect(report.findings[0].start).toBeNull();
  });
  it("rejects duplicated claim IDs and claim overflow",async()=>{
    const {sources,request,raw}=await fixture();raw.findings[1].id="c1";expect(()=>validateOutput(raw,request,sources,meta)).toThrow("duplicate");raw.tooManyClaims=true;expect(()=>validateOutput(raw,request,sources,meta)).toThrow("more than 20");
  });
  it("rejects rewritten or omitted fixed claims during comparison",async()=>{
    const {sources,request,raw}=await fixture();const initial=validateOutput(raw,request,sources,meta);request.mode="compare";request.claims=canonicalClaims(initial.findings);raw.findings[0].proposition="A different claim";expect(()=>validateOutput(raw,request,sources,meta)).toThrow("changed or omitted");
  });
  it("computes highlight offsets without trusting model numbers",()=>{
    const answer="  First statement.\n\nSecond statement! ";const segments=segmentAnswer(answer);expect(segments).toHaveLength(2);for(const s of segments)expect(answer.slice(s.start,s.end)).toBe(s.text);
  });
  it("localizes opposite judgments inside one compound sentence",async()=>{
    const source=await createSource("Window",[{number:1,text:"Returns are allowed within 14 days. Processing time is not specified."}]);
    const request:AuditRequest={mode:"audit",answer:"Returns are allowed within 14 days and refunds arrive in 48 hours.",context:"",sources:[source],selectedSourceIds:[source.id]};
    const raw=modelOutputSchema.parse({findings:[{id:"c1",segmentId:"s1",answerQuote:"Returns are allowed within 14 days",proposition:"Returns are allowed within 14 days.",verdict:"supported",issues:[],explanation:"The window is explicit.",strength:"direct",evidence:[{blockId:source.blocks[0].id,quote:"Returns are allowed within 14 days.",relation:"supports"}]},{id:"c2",segmentId:"s1",answerQuote:"refunds arrive in 48 hours",proposition:"Refunds arrive in 48 hours.",verdict:"insufficient",issues:["unsupported_assertion"],explanation:"The processing time is not specified.",strength:"none",evidence:[]}],nonfactualSegmentIds:[],tooManyClaims:false});
    const report=validateOutput(raw,request,[source],meta);expect(report.complete).toBe(true);expect(report.findings.map(f=>request.answer.slice(f.start!,f.end!))).toEqual(["Returns are allowed within 14 days","refunds arrive in 48 hours"]);
  });
  it("handles repeated evidence text by identifying a block instead of inventing a unique offset",async()=>{
    const source=await createSource("Duplicate wording",[{number:1,text:"Allowed. Allowed."}]);const request:AuditRequest={mode:"audit",answer:"It is allowed.",context:"",sources:[source],selectedSourceIds:[source.id]};
    const raw=modelOutputSchema.parse({findings:[{id:"c1",segmentId:"s1",answerQuote:request.answer,proposition:request.answer,verdict:"supported",issues:[],explanation:"The text permits it.",strength:"direct",evidence:[{blockId:source.blocks[0].id,quote:"Allowed.",relation:"supports"}]}],nonfactualSegmentIds:[],tooManyClaims:false});
    expect(validateOutput(raw,request,[source],meta).findings[0].evidence[0].location).toBe("block");
  });
});
describe("comparison integrity",()=>{
  it("removing the premium exception changes both the universal-window and shipping assessments",async()=>{const sources=await sampleSources();const report=sampleReport(sources,[sources[0].id,sources[2].id],true);expect(report.findings[1].verdict).toBe("contradicted");expect(report.findings[2].verdict).toBe("insufficient");expect(report.findings[0].verdict).toBe("supported");});
  it("removing all sources produces insufficient evidence without a model call",async()=>{const {raw}=await fixture();const output=noEvidenceOutput(raw.findings);expect(output.findings.every(f=>f.verdict==="insufficient"&&f.evidence.length===0)).toBe(true);expect(output.findings.map(f=>f.proposition)).toEqual(raw.findings.map(f=>f.proposition));});
  it("preserves canonical IDs through whitespace normalization and detects altered source content",async()=>{const a=await createSource("A",[{number:1,text:"Some   policy text."}]);const b=await createSource("B",[{number:1,text:"Some policy text."}]);expect(a.id).toBe(b.id);await expect(canonicalizeSources([{...a,pages:[{number:1,text:"Changed policy."}]}])).rejects.toThrow("changed");});
  it("rejects duplicate source identities and too many pages",async()=>{const {request,sources}=await fixture();expect(()=>validateSourceCollection([sources[0],sources[0]])).toThrow("already");request.sources=[...sources,sources[0]];expect(auditRequestSchema.safeParse(request).success).toBe(false);});
  it("rejects oversized answers, invalid selections, and missing comparison baselines",async()=>{const {request}=await fixture();expect(auditRequestSchema.safeParse({...request,answer:"a".repeat(2001)}).success).toBe(false);expect(auditRequestSchema.safeParse({...request,selectedSourceIds:["nope"]}).success).toBe(false);expect(auditRequestSchema.safeParse({...request,mode:"compare"}).success).toBe(false);});
});
