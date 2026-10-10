import { ArrowRight, CircleCheck, CircleAlert } from "lucide-react";
import type { Report } from "@/lib/contracts";
import { resultSummary } from "@/lib/result-summary";

export function ResultGuide({report,onSelect}:{report:Report;onSelect:(id:string)=>void}) {
  const summary=resultSummary(report);
  return <section className="result-guide no-print" aria-label="What to do next"><div className="result-guide-icon">{summary.attention?<CircleAlert size={25}/>:<CircleCheck size={25}/>}</div><div><span>{report.origin==="sample"?"EXAMPLE RESULTS":"YOUR RESULTS"}</span><h2>{summary.title}</h2><p>{summary.description}</p>{report.warnings.length>0&&<ul className="result-warnings">{report.warnings.map(w=><li key={w}>{w}</li>)}</ul>}</div><button className="button primary" onClick={()=>{if(summary.selectedId)onSelect(summary.selectedId);}} disabled={!summary.selectedId}>{summary.action}<ArrowRight size={16}/></button></section>;
}
