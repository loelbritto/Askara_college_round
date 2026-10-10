"use client";
import { useState } from "react";
import { verdictLabels } from "@/lib/contracts";
import { revisionImpact, type AuditVersion } from "@/lib/revisions";
import { useWorkspaceField } from "./workspace-memory";

export function RevisionHistory(){
  const [history]=useWorkspaceField("history"),[chosen,setChosen]=useState<string|null>(null);
  if(!history.length)return null;
  const entry=history.find(v=>v.report.id===chosen)??history[history.length-1];
  const parent=history.find(v=>v.report.id===entry.parentId);
  const rows=parent?revisionImpact(parent.report,entry.report):[];
  return <details className="revision-history no-print"><summary>Review history <span>{history.length} audit versions · kept in this tab</span></summary><div className="history-content"><label>Audit version<select className="text-input" value={entry.report.id} onChange={e=>setChosen(e.target.value)}>{history.map((version,i)=><option key={version.report.id} value={version.report.id}>{i+1}. {version.change?.label??"Original review"}</option>)}</select></label><p>{entry.report.origin==="sample"?"Authored sample":"Live audit"} · {entry.report.model} · {entry.report.complete?"Reference checks complete":"Incomplete: review warnings"}</p>
    {entry.change?.kind==="policy"&&<dl className="version-metadata"><div><dt>Policy</dt><dd>{entry.change.sourceName}</dd></div><div><dt>Version</dt><dd>{entry.change.versionLabel}</dd></div><div><dt>Effective date</dt><dd>{entry.change.effectiveFrom||"Not specified"}</dd></div><div><dt>Scope</dt><dd>{entry.change.scope||"Not specified"}</dd></div><div><dt>Supersedes (reviewer description)</dt><dd>{entry.change.supersedes||"Not specified; no precedence inferred"}</dd></div></dl>}
    {parent&&<><h3>{entry.change?.kind==="policy"?"Policy change impact":"Before and after"}</h3><p>{rows.filter(r=>r.changed).length} matched judgments changed. {rows.filter(r=>r.alignment==="needs_review").length} rows need manual alignment because claim wording or decomposition changed.</p><div className="impact-table-wrap"><table><thead><tr><th>Statement</th><th>Before</th><th>After</th><th>Alignment</th></tr></thead><tbody>{rows.map((row,i)=><tr key={i}><td>{row.claim}</td><td>{row.before?verdictLabels[row.before]:row.beforeId?"Unresolved":"No exact match"}</td><td>{row.after?verdictLabels[row.after]:row.afterId?"Unresolved":"No exact match"}</td><td>{row.alignment==="exact"?row.changed?"Changed judgment":"Same judgment":"Review manually"}</td></tr>)}</tbody></table></div></>}
    {parent&&<ReportRecord entry={parent} label="Original report"/>}<ReportRecord entry={entry} label={parent?"Revised report":"Report"}/>
    <button className="button secondary" onClick={()=>{const data=history.map(version=>{const {baselineToken:_,...report}=version.report;return {...version,report};});const url=URL.createObjectURL(new Blob([JSON.stringify({format:"second-opinion-history",version:1,audits:data},null,2)],{type:"application/json"}));const link=document.createElement("a");link.href=url;link.download="second-opinion-history.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>Download audit history</button>
    <p className="small muted">These independent audits are linked for review. Unmatched statements are not counted as improvements. Reviewer notes remain scoped to each report. Save a review file or account version to retain the full history after refreshing or clearing.</p>
  </div></details>;
}
function ReportRecord({entry,label}:{entry:AuditVersion;label:string}){
  const [reviews]=useWorkspaceField("reviews");
  return <details className="history-report"><summary>{label} · {entry.report.findings.length} statements</summary><p className="history-answer">{entry.report.answer}</p>{entry.report.warnings.map(w=><p className="form-error" key={w}>{w}</p>)}{entry.report.findings.map(f=><article key={f.id}><h4>{f.proposition}</h4><strong>{f.verdict?verdictLabels[f.verdict]:"Unresolved"}</strong><p>{f.explanation}</p>{f.evidence.map((e,i)=><blockquote key={i}>{e.quote}<cite>{e.sourceName} · page {e.page}</cite></blockquote>)}{reviews[`${entry.report.id}:${f.id}`]?.note&&<p>Reviewer note: {reviews[`${entry.report.id}:${f.id}`].note}</p>}</article>)}</details>;
}
