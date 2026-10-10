"use client";
import { useState } from "react";
import { ArrowRight, FileClock, Pencil, MessageSquarePlus } from "lucide-react";
import { LIMITS, type Finding, type Report } from "@/lib/contracts";
import { createSource, validateSourceCollection } from "@/lib/canonical";
import { proposedAnswer, textDifference, type RevisionInput, type RevisionKind } from "@/lib/revisions";
import { Modal } from "./ui";
import { SessionFields } from "./session-fields";

export function RevisionActions({disabled,onOpen}:{disabled:boolean;onOpen:(kind:RevisionKind)=>void}){
  return <div className="revision-actions no-print" aria-label="Improve this review"><span>Improve this review</span><button disabled={disabled} onClick={()=>onOpen("answer")}><Pencil size={15}/> Revise answer</button><button disabled={disabled} onClick={()=>onOpen("context")}><MessageSquarePlus size={15}/> Add context</button><button disabled={disabled} onClick={()=>onOpen("policy")}><FileClock size={15}/> Update a policy</button></div>;
}
export function RevisionDialog({report,finding,kind,busy,available,authenticated,account=false,requestError,onLogin,onClose,onCancel,onSubmit}:{report:Report;finding?:Finding;kind:RevisionKind;busy:boolean;available:boolean;authenticated:boolean;account?:boolean;requestError:string;onLogin:(code:string,email?:string)=>Promise<boolean>;onClose:()=>void;onCancel:()=>void;onSubmit:(input:RevisionInput)=>Promise<boolean>}){
  const [answer,setAnswer]=useState(kind==="answer"?proposedAnswer(report,finding):report.answer),[context,setContext]=useState(report.context);
  const [sourceId,setSourceId]=useState(report.selectedSourceIds[0]??report.sources[0]?.id??"");
  const source=report.sources.find(s=>s.id===sourceId);
  const [policyText,setPolicyText]=useState(()=>source?.pages.map(p=>p.text).join("\n\n")??"");
  const [versionLabel,setVersionLabel]=useState(""),[effectiveFrom,setEffectiveFrom]=useState(""),[scope,setScope]=useState(""),[supersedes,setSupersedes]=useState("");
  const [error,setError]=useState("");
  const [accessCode,setAccessCode]=useState(""),[signingIn,setSigningIn]=useState(false);
  const [email,setEmail]=useState("");
  const oldText=kind==="policy"?source?.pages.map(p=>p.text).join("\n\n")??"":kind==="context"?report.context:report.answer;
  const newText=kind==="policy"?policyText:kind==="context"?context:answer;
  const diff=textDifference(oldText,newText);
  async function submit(){
    setError("");
    try{
      if(!diff.changed)throw new Error("Make a change before running a new check.");
      let sources=report.sources,selectedSourceIds=report.selectedSourceIds;
      if(kind==="policy"){
        if(!source||!policyText.trim()||!versionLabel.trim())throw new Error("Choose a policy, add the revised text, and name this version.");
        const replacement=await createSource(source.name,[{number:1,text:policyText}],"paste");
        if(replacement.id===source.id)throw new Error("The policy content is unchanged after normalization. Change the policy text to create a new audit.");
        sources=sources.map(s=>s.id===source.id?replacement:s);validateSourceCollection(sources);
        selectedSourceIds=selectedSourceIds.map(id=>id===source.id?replacement.id:id);
      }
      if(!answer.trim()||!selectedSourceIds.length)throw new Error("A new audit needs an answer and at least one selected policy.");
      const ok=await onSubmit({answer,context,sources,selectedSourceIds,change:{kind,label:kind==="policy"?`Policy update: ${versionLabel.trim()}`:kind==="answer"?"Revised answer":"Added customer context",...(kind==="policy"?{sourceName:source!.name,versionLabel:versionLabel.trim(),effectiveFrom,scope,supersedes}:{})}});
      if(ok)onClose();
    }catch(e){setError(e instanceof Error?e.message:"The revision could not be prepared.");}
  }
  const title=kind==="policy"?"Update a policy version":kind==="context"?"Add context and check again":"Revise and check the answer";
  return <Modal title={title} onClose={()=>{if(!busy)onClose();}} wide><div className="revision-dialog"><p>Your current report stays available. This change creates a separate audit with a new baseline.</p>
    {kind==="answer"&&<>{finding?.suggestedCorrection&&answer!==report.answer&&<div className="revision-hint">{report.origin==="sample"?"An authored example correction":"An AI-proposed correction"} has been inserted for the selected statement. Review and edit it before checking.</div>}<label className="field-label" htmlFor="revised-answer">Revised answer</label><textarea id="revised-answer" className="source-text-input" maxLength={LIMITS.answerChars} value={answer} disabled={busy} onChange={e=>setAnswer(e.target.value)}/></>}
    {kind==="context"&&<><label className="field-label" htmlFor="revision-context">Customer context or original question</label><textarea id="revision-context" className="source-text-input" maxLength={LIMITS.contextChars} value={context} disabled={busy} onChange={e=>setContext(e.target.value)} placeholder="Add only facts you know, such as membership tier or purchase date."/><p className="small muted">Customer facts help determine applicability. They do not override the policy documents.</p></>}
    {kind==="policy"&&<><label className="field-label" htmlFor="revision-source">Policy to replace</label><select id="revision-source" className="text-input" value={sourceId} disabled={busy} onChange={e=>{setSourceId(e.target.value);setPolicyText(report.sources.find(s=>s.id===e.target.value)?.pages.map(p=>p.text).join("\n\n")??"");}}>{report.sources.filter(s=>report.selectedSourceIds.includes(s.id)).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><div className="revision-metadata"><label>Version label<input className="text-input" maxLength={100} value={versionLabel} disabled={busy} onChange={e=>setVersionLabel(e.target.value)} placeholder="e.g. October return policy"/></label><label>Effective date, if known<input className="text-input" type="date" value={effectiveFrom} disabled={busy} onChange={e=>setEffectiveFrom(e.target.value)}/></label><label>Scope, if known<input className="text-input" maxLength={300} value={scope} disabled={busy} onChange={e=>setScope(e.target.value)} placeholder="e.g. Premium orders placed in October"/></label><label>Supersedes, if explicitly stated<input className="text-input" maxLength={300} value={supersedes} disabled={busy} onChange={e=>setSupersedes(e.target.value)}/></label></div><p className="small muted">These labels describe your revision; they do not establish authority. Include any actual scope or supersession clause in the policy text. Pasted revision text becomes one extracted-text page.</p><label className="field-label" htmlFor="revision-policy">Revised policy text</label><textarea id="revision-policy" className="source-text-input" maxLength={LIMITS.sourceChars} value={policyText} disabled={busy} onChange={e=>setPolicyText(e.target.value)}/></>}
    <section className="revision-diff" aria-label="Changes to check"><h3>Changes to check</h3>{diff.changed?<p>{diff.prefix}{diff.removed&&<del aria-label="Removed text">{diff.removed}</del>}{diff.added&&<ins aria-label="Added text">{diff.added}</ins>}{diff.suffix}</p>:<p>No changes yet.</p>}</section>
    {!available&&<p className="form-error">Live checking is not configured. You can prepare a revision, but a revised answer or policy requires a live audit; example findings cannot validate changed inputs.</p>}
    {available&&!authenticated&&<div className="revision-access"><SessionFields account={account} prefix="revision-access-code" email={email} setEmail={setEmail} password={accessCode} setPassword={setAccessCode} disabled={signingIn}/><button className="button secondary" disabled={!accessCode||signingIn||(account&&!email)} onClick={async()=>{setSigningIn(true);try{if(await onLogin(accessCode,email)){setAccessCode("");setEmail("");setError("");}else setError("Could not open the session. Check your sign-in details and try again.");}finally{setSigningIn(false);}}}>{signingIn?"Opening session…":account?"Sign in":"Open live session"}</button></div>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    {requestError&&<p className="form-error" role="alert">{requestError}</p>}
    <div className="modal-actions"><button className="button secondary" onClick={busy?onCancel:onClose}>{busy?"Cancel request":"Keep current report"}</button><button className="button primary" disabled={busy||!available||!authenticated||!diff.changed} onClick={submit}>{busy?"Checking revision…":"Check revision"}<ArrowRight size={15}/></button></div></div></Modal>;
}
