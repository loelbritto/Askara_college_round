import { z } from "zod";
import { canonicalClaimSchema, LIMITS, policyRuleFieldsSchema, rawEvidenceSchema, rawFindingSchema, sourceInputSchema, type Report, type RuleReview, type Source } from "./contracts";
import { canonicalizeSources, segmentAnswer, validateSourceCollection } from "./canonical";
import type { AuditVersion } from "./revisions";
import type { Review } from "./review";

export const ARCHIVE_BYTES=2*1024*1024;
const text=z.string().max(2000), warnings=z.array(text).max(100);
const reference=rawEvidenceSchema.omit({relation:true}).extend({sourceId:z.string().max(100),sourceName:z.string().max(150),page:z.number().int().min(1).max(20),start:z.number().int().nonnegative(),end:z.number().int().nonnegative(),location:z.enum(["exact","block"])});
const finding=rawFindingSchema.extend({verdict:rawFindingSchema.shape.verdict.nullable(),validation:z.enum(["verified","unresolved"]),warnings,start:z.number().int().nonnegative().nullable(),end:z.number().int().nonnegative().nullable(),evidence:z.array(reference.extend({relation:z.enum(["supports","contradicts"])})).max(8)});
const rule=policyRuleFieldsSchema.extend({id:z.string().regex(/^r\d+$/),claimIds:z.array(z.string().regex(/^c\d+$/)).max(20),references:z.array(reference).max(5),validation:z.enum(["references_checked","unresolved"]),warnings});
const reportSchema=z.object({
  id:z.string().min(1).max(100),mode:z.enum(["audit","compare"]),origin:z.enum(["sample","live"]),answer:z.string().min(1).max(LIMITS.answerChars),context:z.string().max(LIMITS.contextChars),
  sources:z.array(sourceInputSchema).min(1).max(5),selectedSourceIds:z.array(z.string().max(100)).max(5),findings:z.array(finding).max(20),rules:z.array(rule).max(20).optional(),
  complete:z.boolean(),warnings,createdAt:z.iso.datetime(),model:z.string().max(200),promptVersion:z.string().max(100),elapsedMs:z.number().nonnegative().finite(),usage:z.record(z.string().max(100),z.number().finite()).refine(v=>Object.keys(v).length<=30),limitations:warnings,
});
const changeSchema=z.object({kind:z.enum(["answer","context","policy"]),label:z.string().max(200),sourceName:z.string().max(150).optional(),versionLabel:z.string().max(100).optional(),effectiveFrom:z.string().max(20).optional(),scope:z.string().max(300).optional(),supersedes:z.string().max(300).optional()});
const boundedRecord=<T extends z.ZodType>(schema:T)=>z.record(z.string().min(1).max(250),schema).refine(v=>Object.keys(v).length<=500,"Too many review annotations.");
const archiveSchema=z.object({
  format:z.literal("second-opinion-workspace"),version:z.literal(1),savedAt:z.iso.datetime(),
  draft:z.object({sources:z.array(sourceInputSchema).max(5),selectedIds:z.array(z.string().max(100)).max(5),answer:z.string().max(LIMITS.answerChars),context:z.string().max(LIMITS.contextChars),sampleMode:z.boolean(),setupStep:z.union([z.literal(1),z.literal(2),z.literal(3)])}),
  reports:z.array(reportSchema).max(22),baselineId:z.string().max(100).nullable(),comparisonId:z.string().max(100).nullable(),showComparison:z.boolean(),
  history:z.array(z.object({reportId:z.string().max(100),parentId:z.string().max(100).nullable(),change:changeSchema.nullable()})).max(20),
  reviews:boundedRecord(z.object({checked:z.boolean(),note:z.string().max(2000)})),
  ruleReviews:boundedRecord(z.object({fields:policyRuleFieldsSchema,confirmed:z.boolean(),updatedAt:z.iso.datetime()})),
});
export type WorkspaceArchive=z.infer<typeof archiveSchema>;
export type ArchivableWorkspace={sources:Source[];selectedIds:string[];answer:string;context:string;sampleMode:boolean;setupStep:1|2|3;baseline:Report|null;comparison:Report|null;showComparison:boolean;history:AuditVersion[];reviews:Record<string,Review>;ruleReviews:Record<string,RuleReview>};
const invalid=()=>new Error("This saved review has inconsistent documents or references. Your current workspace is unchanged.");
function unique(values:string[]){return new Set(values).size===values.length;}

async function validateReport(value:z.infer<typeof reportSchema>):Promise<Report>{
  const sources=await canonicalizeSources(value.sources);validateSourceCollection(sources);
  if(!unique(value.selectedSourceIds)||value.selectedSourceIds.some(id=>!sources.some(s=>s.id===id)))throw invalid();
  if(!unique(value.findings.map(f=>f.id))||!unique((value.rules??[]).map(r=>r.id)))throw invalid();
  const segments=segmentAnswer(value.answer);
  function checkReference(ref:z.infer<typeof reference>){
    const source=sources.find(s=>s.id===ref.sourceId),block=source?.blocks.find(b=>b.id===ref.blockId);
    if(!source||!value.selectedSourceIds.includes(source.id)||source.name!==ref.sourceName||!block||block.page!==ref.page)throw invalid();
    const start=block.text.indexOf(ref.quote),exact=start>=0&&block.text.indexOf(ref.quote,start+1)===-1;
    if(start<0||ref.location!==(exact?"exact":"block")||ref.start!==(exact?start:0)||ref.end!==(exact?start+ref.quote.length:block.text.length))throw invalid();
  }
  for(const f of value.findings){
    f.evidence.forEach(checkReference);
    const segment=segments.find(s=>s.id===f.segmentId),local=segment?.text.indexOf(f.answerQuote)??-1;
    const located=!!segment&&local>=0&&segment.text.indexOf(f.answerQuote,local+1)===-1;
    if(f.start!==(located?segment!.start+local:null)||f.end!==(located?segment!.start+local+f.answerQuote.length:null))throw invalid();
    if(f.validation==="verified"&&(!located||f.verdict===null||f.warnings.length))throw invalid();
    if(f.validation==="unresolved"&&f.verdict!==null)throw invalid();
    if(f.verdict==="supported"&&!f.evidence.some(e=>e.relation==="supports"))throw invalid();
    if(f.verdict==="contradicted"&&!f.evidence.some(e=>e.relation==="contradicts"))throw invalid();
    if(f.validation==="verified"&&f.strength==="conflicting"&&!(f.evidence.some(e=>e.relation==="supports")&&f.evidence.some(e=>e.relation==="contradicts")))throw invalid();
  }
  for(const r of value.rules??[]){
    r.references.forEach(checkReference);
    if(!unique(r.claimIds)||r.claimIds.some(id=>!value.findings.some(f=>f.id===id)))throw invalid();
    if(r.validation==="references_checked"&&(!r.references.length||r.warnings.length))throw invalid();
  }
  if(value.complete&&(value.warnings.length||!value.findings.length||value.findings.some(f=>f.validation!=="verified")||(value.rules??[]).some(r=>r.validation==="unresolved")))throw invalid();
  return {...value,sources,segments};
}

export async function readArchive(input:unknown):Promise<{archive:WorkspaceArchive;workspace:ArchivableWorkspace}>{
  if(new TextEncoder().encode(JSON.stringify(input)).byteLength>ARCHIVE_BYTES)throw new Error("Saved reviews must be smaller than 2 MB.");
  const parsed=archiveSchema.safeParse(input);
  if(!parsed.success)throw new Error("This is not a supported Second Opinion review file, or some fields exceed the allowed limits.");
  const archive=parsed.data,draft=archive.draft;
  const sources=await canonicalizeSources(draft.sources);validateSourceCollection(sources);
  if(!unique(draft.selectedIds)||draft.selectedIds.some(id=>!sources.some(s=>s.id===id))||!unique(archive.reports.map(r=>r.id)))throw invalid();
  const reports=await Promise.all(archive.reports.map(validateReport));
  const get=(id:string|null)=>id===null?null:reports.find(r=>r.id===id)??(()=>{throw invalid();})();
  const baseline=get(archive.baselineId),comparison=get(archive.comparisonId);
  if(comparison&&!baseline||archive.showComparison&&!comparison)throw invalid();
  if(baseline){
    if(baseline.mode!=="audit"||baseline.answer!==draft.answer||baseline.context!==draft.context||JSON.stringify(baseline.sources)!==JSON.stringify(sources))throw invalid();
  }
  if(comparison&&baseline){
    if(comparison.mode!=="compare"||comparison.answer!==baseline.answer||comparison.context!==baseline.context||JSON.stringify(comparison.sources)!==JSON.stringify(baseline.sources)||comparison.findings.length!==baseline.findings.length||comparison.findings.some(f=>{const original=baseline.findings.find(c=>c.id===f.id);return !original||JSON.stringify(canonicalClaimSchema.parse(f))!==JSON.stringify(canonicalClaimSchema.parse(original));}))throw invalid();
  }
  const seen=new Set<string>();
  const history=archive.history.map(entry=>{
    if(seen.has(entry.reportId)||entry.parentId!==null&&!seen.has(entry.parentId))throw invalid();
    seen.add(entry.reportId);return {...entry,report:get(entry.reportId)!};
  });
  const claimKeys=new Set(reports.flatMap(r=>r.findings.map(f=>`${r.id}:${f.id}`))),ruleKeys=new Set(reports.flatMap(r=>(r.rules??[]).map(f=>`${r.id}:${f.id}`)));
  if(Object.keys(archive.reviews).some(key=>!claimKeys.has(key))||Object.keys(archive.ruleReviews).some(key=>!ruleKeys.has(key)))throw invalid();
  // Schema parsing removes signatures and arbitrary fields. Restoring never
  // creates a new verified model result or resurrects a session-bound token.
  return {archive,workspace:{...draft,sources,baseline,comparison,showComparison:archive.showComparison,history,reviews:archive.reviews,ruleReviews:archive.ruleReviews}};
}

export async function createArchive(workspace:ArchivableWorkspace):Promise<WorkspaceArchive>{
  const reports=[...new Map([...workspace.history.map(h=>h.report),workspace.baseline,workspace.comparison].filter((r):r is Report=>!!r).map(r=>[r.id,r])).values()];
  const claimKeys=new Set(reports.flatMap(r=>r.findings.map(f=>`${r.id}:${f.id}`))),ruleKeys=new Set(reports.flatMap(r=>(r.rules??[]).map(f=>`${r.id}:${f.id}`)));
  const {sources,selectedIds,answer,context,sampleMode,setupStep}=workspace;
  const value={format:"second-opinion-workspace",version:1,savedAt:new Date().toISOString(),draft:{sources,selectedIds,answer,context,sampleMode,setupStep},reports,baselineId:workspace.baseline?.id??null,comparisonId:workspace.comparison?.id??null,showComparison:workspace.showComparison,history:workspace.history.map(({report,parentId,change})=>({reportId:report.id,parentId,change})),reviews:Object.fromEntries(Object.entries(workspace.reviews).filter(([key])=>claimKeys.has(key))),ruleReviews:Object.fromEntries(Object.entries(workspace.ruleReviews).filter(([key])=>ruleKeys.has(key)))};
  return (await readArchive(value)).archive;
}
