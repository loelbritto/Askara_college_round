import { describe, expect, it } from "vitest";
import { createArchive, readArchive, type ArchivableWorkspace } from "../src/lib/workspace-archive";
import { sampleReport, sampleSources, SAMPLE_ANSWER, SAMPLE_CONTEXT } from "../src/lib/sample";

async function workspace():Promise<ArchivableWorkspace>{
  const sources=await sampleSources(),baseline=sampleReport(sources);baseline.baselineToken="do-not-save-session-token";
  return {sources,selectedIds:sources.map(s=>s.id),answer:SAMPLE_ANSWER,context:SAMPLE_CONTEXT,sampleMode:true,setupStep:3,baseline,comparison:null,showComparison:false,history:[{report:baseline,parentId:null,change:null}],reviews:{[`${baseline.id}:c1`]:{checked:true,note:"Inspect the receipt."}},ruleReviews:{}};
}
describe("explicit workspace archives",()=>{
  it("round trips reports, sources, history and separate notes, without an access signature",async()=>{
    const original=await workspace(),archive=await createArchive(original);expect(JSON.stringify(archive)).not.toContain("do-not-save-session-token");
    expect(archive.reports).toHaveLength(1);const restored=(await readArchive(JSON.parse(JSON.stringify(archive)))).workspace;
    expect(restored.sources).toEqual(original.sources);expect(restored.baseline?.findings).toEqual(original.baseline?.findings);expect(restored.reviews).toEqual(original.reviews);expect(restored.history[0].report.baselineToken).toBeUndefined();expect(original.baseline?.baselineToken).toBe("do-not-save-session-token");
  });
  it("supports a draft before an audit and preserves an incomplete report",async()=>{
    const state=await workspace();state.baseline=null;state.history=[];state.reviews={};state.answer="";
    expect((await readArchive(await createArchive(state))).workspace.answer).toBe("");
    const other=await workspace();other.baseline!.findings=[];other.baseline!.rules=[];other.baseline!.complete=false;other.baseline!.warnings=["No statements extracted"];
    const restored=(await readArchive(await createArchive(other))).workspace;expect(restored.baseline!.complete).toBe(false);expect(restored.baseline!.warnings).toContain("No statements extracted");
  });
  it("rejects changed policy text, fabricated quotations and incorrect locations",async()=>{
    const archive=await createArchive(await workspace());
    const changed=structuredClone(archive);changed.reports[0].sources[0].pages[0].text+=" Changed.";await expect(readArchive(changed)).rejects.toThrow();
    const quote=structuredClone(archive);quote.reports[0].findings[0].evidence[0].quote="fabricated quote";await expect(readArchive(quote)).rejects.toThrow();
    const offsets=structuredClone(archive);offsets.reports[0].findings[0].start=1999;await expect(readArchive(offsets)).rejects.toThrow();
  });
  it("rejects forged successful summaries, orphan notes, cyclic history, and oversized files",async()=>{
    const archive=await createArchive(await workspace());
    const empty=structuredClone(archive);empty.reports[0].findings=[];empty.reports[0].rules=[];await expect(readArchive(empty)).rejects.toThrow();
    const orphan=structuredClone(archive);orphan.reviews["unknown:c1"]={checked:true,note:"note"};await expect(readArchive(orphan)).rejects.toThrow();
    const cycle=structuredClone(archive);cycle.history[0].parentId=cycle.history[0].reportId;await expect(readArchive(cycle)).rejects.toThrow();
    await expect(readArchive({huge:"a".repeat(2097153)})).rejects.toThrow("2 MB");
  });
  it("accepts reordered fixed claims but refuses changed comparison propositions",async()=>{
    const state=await workspace();state.comparison=sampleReport(state.sources,[],true);state.comparison.findings.reverse();state.showComparison=true;
    const archive=await createArchive(state);expect((await readArchive(archive)).workspace.comparison?.selectedSourceIds).toEqual([]);
    archive.reports.find(r=>r.mode==="compare")!.findings[0].proposition="Different claim";await expect(readArchive(archive)).rejects.toThrow();
  });
});
