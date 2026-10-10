import { type Report, type RuleReview, verdictLabels } from "./contracts";
export type Review = { checked: boolean; note: string };
export const reviewKey=(reportId:string,claimId:string)=>`${reportId}:${claimId}`;
export function reviewBrief(report:Report,reviews:Record<string,Review>,ruleReviews:Record<string,RuleReview>={}):string {
  const reviewed=report.findings.filter(f=>reviews[reviewKey(report.id,f.id)]?.checked).length;
  return ["SECOND OPINION — REVIEW BRIEF",report.origin==="sample"?"Authored synthetic sample. No AI call.":`Live audit · ${report.model}`,report.mode==="compare"?"Hypothetical assessment under the selected evidence set.":"Baseline assessment.",`Created: ${report.createdAt}`,`Selected sources: ${report.selectedSourceIds.length}`,`Human review: ${reviewed} / ${report.findings.length} claims marked reviewed. This does not certify correctness.`,"", "ORIGINAL ANSWER",report.answer,"",...report.findings.flatMap(f=>{
    const review=reviews[reviewKey(report.id,f.id)];
    return [`${f.id.toUpperCase()} — ${f.proposition}`,`Judgment: ${f.verdict?verdictLabels[f.verdict]:"Needs review"}`,f.explanation,...f.evidence.map(e=>`Evidence: ${e.sourceName}, page ${e.page} (${e.relation})\n“${e.quote}”`),`Reviewer status: ${review?.checked?"Reviewed":"Not reviewed"}`,`Reviewer note: ${review?.note.trim()||"None"}`,""];
  }),"POLICY INTERPRETATIONS",...(report.rules??[]).flatMap(rule=>{
    const review=ruleReviews[reviewKey(report.id,rule.id)];
    return [`${rule.id.toUpperCase()} — ${rule.action}`,`Reference status: ${rule.validation}`,`Original proposed interpretation: ${JSON.stringify({appliesTo:rule.appliesTo,action:rule.action,timeLimit:rule.timeLimit,conditions:rule.conditions,exceptions:rule.exceptions,scope:rule.scope,precedence:rule.precedence})}`,...rule.references.map(ref=>`Source: ${ref.sourceName}, page ${ref.page}\n“${ref.quote}”`),review?`Human interpretation (${review.confirmed?"reviewed":"not confirmed"}): ${JSON.stringify(review.fields)}`:"No human interpretation recorded.",""];
  }),"LIMITATIONS",...report.limitations,"Exact quotations establish text existence, not correct interpretation. Reviewer notes and edited interpretations are human annotations, not model findings."].join("\n");
}
export function downloadBrief(report:Report,reviews:Record<string,Review>,ruleReviews:Record<string,RuleReview>={}){const url=URL.createObjectURL(new Blob([reviewBrief(report,reviews,ruleReviews)],{type:"text/plain;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download=`second-opinion-review-${report.origin}.txt`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
