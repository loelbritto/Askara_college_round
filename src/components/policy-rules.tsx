"use client";
import { useState } from "react";
import { ArrowUpRight, Check, Pencil, RotateCcw } from "lucide-react";
import { policyRuleFieldsSchema, type PolicyRule, type PolicyRuleFields, type Report } from "@/lib/contracts";
import { useWorkspaceField } from "./workspace-memory";
import { reviewKey } from "@/lib/review";

const labels: Record<keyof PolicyRuleFields,string> = {
  appliesTo:"Who it applies to",action:"Action or obligation",timeLimit:"Time limit or quantity",
  conditions:"Required conditions",exceptions:"Exceptions",scope:"Scope",precedence:"Explicit precedence",
};
export function PolicyRules({report,claimId,onCitation}:{report:Report;claimId:string;onCitation:(id:string,block:string,quote:string)=>void}) {
  const rules=(report.rules??[]).filter(rule=>rule.claimIds.includes(claimId));
  if(!rules.length)return null;
  return <section className="policy-rules" aria-label="Policy conditions"><div className="evidence-section-heading"><h4>Policy conditions</h4><span>{rules.length} rule{rules.length===1?"":"s"}</span></div><p className="rule-intro">Check who each rule applies to. These are proposed interpretations of the passages.</p>{rules.map(rule=><RuleCard key={`${report.id}:${rule.id}`} rule={rule} reportId={report.id} sample={report.origin==="sample"} onCitation={onCitation}/>)}</section>;
}
function RuleCard({rule,reportId,sample,onCitation}:{rule:PolicyRule;reportId:string;sample:boolean;onCitation:(id:string,block:string,quote:string)=>void}) {
  const [reviews,setReviews]=useWorkspaceField("ruleReviews");
  const key=reviewKey(reportId,rule.id),review=reviews[key];
  const [editing,setEditing]=useState(false),[error,setError]=useState("");
  const [draft,setDraft]=useState<PolicyRuleFields>(()=>review?.fields??policyRuleFieldsSchema.parse(rule));
  const fields=review?.fields??rule;
  function save(){const parsed=policyRuleFieldsSchema.safeParse(draft);if(!parsed.success){setError("Add an action and keep each field within its length limit.");return;}setReviews(current=>({...current,[key]:{fields:parsed.data,confirmed:false,updatedAt:new Date().toISOString()}}));setEditing(false);setError("");}
  return <details className={`policy-rule ${rule.validation==="unresolved"?"unresolved":""}`}><summary><span>{fields.action}<small>{review?.confirmed?"Interpretation reviewed":review?"Your edited interpretation":rule.validation==="unresolved"?"References need review":sample?"Authored interpretation · review applicability":"AI interpretation · needs review"}</small></span></summary>
    <div className="rule-content">{editing?<div className="rule-editor">{(Object.keys(labels) as (keyof PolicyRuleFields)[]).map(field=><label key={field}>{labels[field]}<textarea value={draft[field]} maxLength={field==="conditions"||field==="exceptions"?1200:800} onChange={e=>setDraft(value=>({...value,[field]:e.target.value}))}/></label>)}{error&&<p role="alert" className="form-error">{error}</p>}<div className="rule-actions"><button className="button secondary" onClick={()=>setEditing(false)}>Cancel edit</button><button className="button primary" onClick={save}>Save interpretation</button></div></div>:<><dl>{(Object.keys(labels) as (keyof PolicyRuleFields)[]).map(field=><div key={field}><dt>{labels[field]}</dt><dd>{fields[field]||"Not specified in this extraction"}</dd></div>)}</dl><div className="rule-actions"><button className="text-button" onClick={()=>{setDraft(policyRuleFieldsSchema.parse(fields));setEditing(true);}}><Pencil size={13}/> Edit interpretation</button>{review&&<button className="text-button" onClick={()=>setReviews(current=>{const next={...current};delete next[key];return next;})}><RotateCcw size={13}/> Reset interpretation</button>}</div></>}
      <div className="rule-references">{rule.references.map((ref,i)=><button key={`${ref.blockId}:${i}`} onClick={()=>onCitation(ref.sourceId,ref.blockId,ref.location==="exact"?ref.quote:"")}><span>{ref.sourceName} · page {ref.page}<ArrowUpRight size={13}/></span><q>{ref.quote}</q></button>)}</div>
      {rule.warnings.map(warning=><p key={warning} className="form-error">{warning}</p>)}
      {!editing&&<label className="rule-confirm"><input type="checkbox" checked={review?.confirmed??false} disabled={rule.validation!=="references_checked"} onChange={e=>setReviews(current=>({...current,[key]:{fields:policyRuleFieldsSchema.parse(fields),confirmed:e.target.checked,updatedAt:new Date().toISOString()}}))}/><Check size={14}/> I reviewed this interpretation against its passages</label>}
      <p className="rule-footnote">Your edits are separate annotations. They do not change the source, model verdict, or establish which policy has authority.</p>
    </div>
  </details>;
}
