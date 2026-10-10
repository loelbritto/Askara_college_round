"use client";
import { CheckCheck, MessageSquareText, Download, CircleCheck } from "lucide-react";
import type { Finding, Report } from "@/lib/contracts";
import { downloadBrief, reviewKey } from "@/lib/review";
import { useWorkspaceField } from "./workspace-memory";

export function ReviewPanel({report,finding}:{report:Report;finding:Finding}) {
  const [reviews,setReviews]=useWorkspaceField("reviews"),key=reviewKey(report.id,finding.id);
  const review=reviews[key]??{checked:false,note:""};
  function update(values:Partial<typeof review>){setReviews(current=>({...current,[key]:{...(current[key]??{checked:false,note:""}),...values}}));}
  return <section className="review-panel"><div className="review-panel-heading"><MessageSquareText size={16}/><h4>Your second opinion</h4></div><p>Keep your reasoning beside the evidence.</p><label htmlFor={`review-${finding.id}`} className="sr-only">Reviewer note for {finding.id.toUpperCase()}</label><textarea id={`review-${finding.id}`} placeholder="What should the team check or change?" value={review.note} maxLength={1500} onChange={e=>update({note:e.target.value})}/><label className={`review-check ${review.checked?"checked":""}`}><input type="checkbox" checked={review.checked} onChange={e=>update({checked:e.target.checked})}/><CircleCheck size={16}/><span>Mark {finding.id.toUpperCase()} reviewed</span></label><small>Session-only notes. Reviewed does not mean approved.</small></section>;
}
export function ReviewProgress({report}:{report:Report}){const [reviews]=useWorkspaceField("reviews"),[ruleReviews]=useWorkspaceField("ruleReviews");const count=report.findings.filter(f=>reviews[reviewKey(report.id,f.id)]?.checked).length;return <div className="review-progress no-print"><div><CheckCheck size={18}/><span><strong>{count} of {report.findings.length}</strong> claims reviewed</span><progress value={count} max={Math.max(report.findings.length,1)} aria-label="Human review progress"/></div><button onClick={()=>downloadBrief(report,reviews,ruleReviews)}><Download size={14}/> Download review brief</button></div>;}
