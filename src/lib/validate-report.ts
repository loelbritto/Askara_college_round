import { AuditError, type AuditRequest, type CanonicalClaim, type Finding, type ModelOutput, type PolicyRule, type Report, type Source } from "./contracts";
import { segmentAnswer } from "./canonical";

export const PROMPT_VERSION = "policy-audit-1.1.0";
export const REPORT_LIMITATIONS = ["Findings assess the supplied evidence, not universal truth.", "Verified quotations establish text existence; model interpretation can still be wrong.", "Source exclusion is hypothetical and does not change an organization's policy.", "No statistically calibrated confidence score is claimed."];
export function canonicalClaims(findings: Finding[]): CanonicalClaim[] {
  return findings.map(({id, proposition, segmentId, answerQuote}) => ({id, proposition, segmentId, answerQuote}));
}
export function validateOutput(raw: ModelOutput, request: AuditRequest, sources: Source[], meta: {origin?: "live" | "sample"; model: string; elapsedMs: number; usage?: Record<string,number>}): Report {
  if (raw.tooManyClaims) throw new AuditError("TOO_LARGE", "The answer contains more than 20 atomic claims. Shorten it and try again.", 422);
  const segments = segmentAnswer(request.answer);
  const selected = sources.filter(s => request.selectedSourceIds.includes(s.id));
  const blocks = selected.flatMap(s => s.blocks.map(b => ({...b, sourceName: s.name})));
  const warnings: string[] = [];
  const ids = raw.findings.map(f => f.id);
  if (new Set(ids).size !== ids.length) throw new AuditError("INVALID_OUTPUT", "The model returned duplicate claim identities. Retry the audit.", 502);
  if (new Set((raw.rules??[]).map(r=>r.id)).size !== (raw.rules??[]).length) throw new AuditError("INVALID_OUTPUT", "The model returned duplicate policy rule identities. Retry the audit.", 502);
  if (request.mode === "compare") {
    const fixed = request.claims ?? [];
    if (fixed.length !== raw.findings.length || raw.findings.some(f => {
      const original = fixed.find(c => c.id === f.id);
      return !original || ["proposition", "segmentId", "answerQuote"].some(k => f[k as keyof CanonicalClaim] !== original[k as keyof CanonicalClaim]);
    })) throw new AuditError("INVALID_OUTPUT", "The comparison changed or omitted a fixed claim. The original audit is preserved; retry the comparison.", 502);
  }
  const findings: Finding[] = raw.findings.map(f => {
    const problems: string[] = [];
    const segment = segments.find(s => s.id === f.segmentId);
    const local = segment?.text.indexOf(f.answerQuote) ?? -1;
    const unique = segment && local >= 0 && segment.text.indexOf(f.answerQuote, local+1) === -1;
    if (!unique) problems.push("The answer quotation could not be located uniquely in its sentence.");
    const evidence = f.evidence.flatMap(e => {
      const block = blocks.find(b => b.id === e.blockId);
      const start = block?.text.indexOf(e.quote) ?? -1;
      if (!block || start < 0) { problems.push("An evidence quotation or source reference could not be verified."); return []; }
      const uniqueQuote = block.text.indexOf(e.quote,start+1) === -1;
      return [{...e, sourceId: block.sourceId, sourceName: block.sourceName, page: block.page, start: uniqueQuote ? start : 0, end: uniqueQuote ? start+e.quote.length : block.text.length, location: uniqueQuote ? "exact" as const : "block" as const}];
    });
    if (f.verdict === "supported" && !evidence.some(e => e.relation === "supports")) problems.push("A supported finding needs a verified supporting passage.");
    if (f.verdict === "contradicted" && !evidence.some(e => e.relation === "contradicts")) problems.push("A contradicted finding needs a verified contradicting passage.");
    if (f.strength === "conflicting" && !(evidence.some(e => e.relation === "supports") && evidence.some(e => e.relation === "contradicts"))) problems.push("Conflicting evidence requires both supporting and contradicting passages.");
    return {...f, verdict: problems.length ? null : f.verdict, evidence, validation: problems.length ? "unresolved" : "verified", warnings: problems, start: unique ? segment!.start+local : null, end: unique ? segment!.start+local+f.answerQuote.length : null};
  });
  const rules: PolicyRule[] = (raw.rules??[]).map(rule=>{
    const problems:string[]=[];
    if(rule.claimIds.some(id=>!ids.includes(id)) || new Set(rule.claimIds).size!==rule.claimIds.length) problems.push("The rule refers to an unknown or repeated claim.");
    const references=rule.references.flatMap(reference=>{
      const block=blocks.find(b=>b.id===reference.blockId),start=block?.text.indexOf(reference.quote)??-1;
      if(!block || start<0){problems.push("A policy rule quotation or source reference could not be verified.");return [];}
      const uniqueQuote=block.text.indexOf(reference.quote,start+1)===-1;
      return [{...reference,sourceId:block.sourceId,sourceName:block.sourceName,page:block.page,start:uniqueQuote?start:0,end:uniqueQuote?start+reference.quote.length:block.text.length,location:uniqueQuote?"exact" as const:"block" as const}];
    });
    if(!references.length)problems.push("A policy rule needs a passage from the selected documents.");
    return {...rule,claimIds:rule.claimIds.filter(id=>ids.includes(id)),references,validation:problems.length?"unresolved":"references_checked",warnings:problems};
  });
  if(rules.some(rule=>rule.validation==="unresolved"))warnings.push("Some policy rule references could not be validated. Review their source text before using the interpretation.");
  const accounted = new Set([...raw.findings.map(f => f.segmentId), ...raw.nonfactualSegmentIds]);
  const missing = segments.filter(s => !accounted.has(s.id));
  if (missing.length) warnings.push(`${missing.length} answer sentence(s) were not accounted for: ${missing.map(s => s.id).join(", ")}.`);
  if (raw.nonfactualSegmentIds.some(id => !segments.some(s => s.id === id))) warnings.push("The model returned an unknown nonfactual sentence reference.");
  if (raw.nonfactualSegmentIds.some(id => raw.findings.some(f => f.segmentId === id))) warnings.push("A sentence was marked both factual and nonfactual.");
  if (!findings.length) warnings.push("No checkable claims were extracted. Review the answer manually.");
  if (findings.some(f => f.validation === "unresolved")) warnings.push("Some findings failed evidence or location validation and need review.");
  return {id: crypto.randomUUID(), mode: request.mode, origin: meta.origin ?? "live", answer: request.answer, context: request.context, sources, selectedSourceIds: request.selectedSourceIds, findings, rules, segments, complete: !warnings.length, warnings, createdAt: new Date().toISOString(), model: meta.model, promptVersion: PROMPT_VERSION, elapsedMs: meta.elapsedMs, usage: meta.usage ?? {}, limitations: REPORT_LIMITATIONS};
}
export function noEvidenceOutput(claims: CanonicalClaim[]): ModelOutput {
  return {findings: claims.map(c => ({...c, verdict: "insufficient", issues: ["unsupported_assertion"], explanation: "No sources are selected. This hypothetical assessment cannot establish or contradict the claim.", strength: "none", evidence: []})), nonfactualSegmentIds: [], tooManyClaims: false};
}
