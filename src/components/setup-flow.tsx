"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, Check, FileText, Info, LoaderCircle, Plus, ShieldCheck, Upload } from "lucide-react";
import { LIMITS, type Source } from "@/lib/contracts";
import { useWorkspaceMemory } from "./workspace-memory";

type Props = {
  step:1|2|3; setStep:(step:1|2|3)=>void; sources:Source[]; selectedIds:string[];
  answer:string; context:string; setAnswer:(value:string)=>void; setContext:(value:string)=>void;
  sample:boolean; busy:boolean; fileBusy:boolean; healthReady:boolean; configured:boolean; enabled:boolean;
  onUpload:()=>void; onDrop:(files:FileList)=>void; onPaste:()=>void; onInspect:(id:string)=>void;
  onToggle:(id:string,checked:boolean)=>void; onAudit:()=>void;
};
const steps=["Add policies","Add the answer","Check & review"];
export function SetupFlow(props:Props) {
  const {step,setStep,sources,selectedIds,answer,context,setAnswer,setContext,sample,busy,fileBusy,healthReady,configured,enabled,onUpload,onDrop,onPaste,onInspect,onToggle,onAudit}=props;
  const {openExample,launching}=useWorkspaceMemory();
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus({preventScroll:true});window.scrollTo({top:0,behavior:"instant"});},[step]);
  const selected=sources.filter(s=>selectedIds.includes(s.id));
  const nextAllowed=step===1?selected.length>0:!!answer.trim();
  const liveUnavailable=!sample&&healthReady&&(!configured||!enabled);
  const title=step===1?(sample?"Your example policies are ready.":"Add the policies to check against."):step===2?(sample?"Here’s the answer we’ll check.":"Paste the AI answer you want to check."):"Ready to check this answer?";
  return <section className="setup-flow" aria-label="Start a review">
    <nav className="setup-steps" aria-label="Review steps"><ol>{steps.map((label,i)=><li key={label}><button disabled={busy||fileBusy||(i>0&&!selected.length)||(i===2&&!answer.trim())} aria-current={step===i+1?"step":undefined} onClick={()=>setStep((i+1) as 1|2|3)}><span>{step>i+1?<Check size={15}/>:i+1}</span><strong>{label}</strong></button></li>)}</ol></nav>
    {sample&&<div className="setup-example-note"><Info size={17}/><span><strong>You’re trying the example.</strong> The policies and answer are already filled in. No AI call or account needed.</span></div>}
    <div className="setup-card"><div className="setup-heading"><span>STEP {step} OF 3</span><h2 ref={heading} tabIndex={-1}>{title}</h2><p>{step===1?"A policy is a document with your rules—for example, a returns policy, employee handbook, or support guide.":step===2?"This is the response you received from an AI assistant. We’ll check its statements against the policies from step 1.":"We’ll identify the statements in this answer and show the policy text that supports or contradicts each one."}</p></div>
      {step===1&&<div className="setup-documents">
        {!sample&&<><button className="setup-upload" disabled={busy||fileBusy||sources.length>=LIMITS.documents} onClick={onUpload} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!fileBusy&&!busy)onDrop(e.dataTransfer.files);}}><Upload size={26}/><strong>{fileBusy?"Reading your documents…":"Choose PDF or TXT files"}</strong><span>or drag them here · up to 5 files, 5 MB each</span></button><button className="setup-paste" disabled={busy||fileBusy||sources.length>=LIMITS.documents} onClick={onPaste}><Plus size={16}/> Paste policy text instead</button></>}
        {sources.length>0&&<div className="setup-source-list"><div className="setup-list-label"><strong>{selected.length} {selected.length===1?"policy":"policies"} selected</strong><span>Open any document to inspect its text.</span></div>{sources.map(s=><article className="source-card setup-source" key={s.id}><FileText size={21}/><div><h3>{s.name}</h3><span>{s.pages.length} {s.pages.length===1?"page":"pages"} · {s.kind==="sample"?"Fictional example":s.kind.toUpperCase()}</span></div><button onClick={()=>onInspect(s.id)} aria-label={`Inspect text: ${s.name}`}>View text <ArrowRight size={14}/></button><input type="checkbox" checked={selectedIds.includes(s.id)} aria-label={`Include ${s.name}`} onChange={e=>onToggle(s.id,e.target.checked)} disabled={busy||fileBusy}/></article>)}</div>}
        {!sources.length&&<p className="setup-empty-help">Nothing to upload yet? <button disabled={launching} onClick={()=>openExample("returns",true)}>Use our example policies and answer <ArrowRight size={14}/></button></p>}
      </div>}
      {step===2&&<div className="setup-answer"><label htmlFor="answer">AI answer <span>{sample?"Example · read only":"Required"}</span></label><textarea id="answer" value={answer} onChange={e=>setAnswer(e.target.value)} maxLength={LIMITS.answerChars} readOnly={sample} disabled={busy} placeholder="For example: You can return an opened item within 30 days and your refund will arrive in 48 hours."/><div className="setup-field-help"><span>{sample?"This example deliberately contains mistakes. We’ll find them in the next step.":"Paste the answer as written, including any details or conditions."}</span><span>{answer.length} / {LIMITS.answerChars}</span></div><details className="setup-context" open={!!context||undefined}><summary>Add the original question <span>Optional</span></summary><label htmlFor="context" className="sr-only">Original question</label><textarea id="context" value={context} onChange={e=>setContext(e.target.value)} maxLength={LIMITS.contextChars} readOnly={sample} disabled={busy} placeholder="What did you ask the AI assistant?"/></details></div>}
      {step===3&&<div className="setup-confirm"><section><div><h3><FileText size={17}/> {selected.length} {selected.length===1?"policy":"policies"} to check against</h3><button disabled={busy} onClick={()=>setStep(1)}>Change</button></div><ul>{selected.map(s=><li key={s.id}><Check size={14}/>{s.name}</li>)}</ul></section><section><div><h3>The answer to check</h3><button disabled={busy} onClick={()=>setStep(2)}>{sample?"View answer":"Edit answer"}</button></div><p className="setup-answer-preview">{answer}</p></section>
        {liveUnavailable?<div className="setup-availability" role="status"><Info size={19}/><div><strong>Live checking is {enabled?"not set up yet":"temporarily paused"}.</strong><p>You can prepare your documents and answer here. To see results now, try the free example.</p><button disabled={launching} onClick={()=>openExample("returns",true)}>Try the guided example <ArrowRight size={14}/></button></div></div>:<p className="setup-send-note"><ShieldCheck size={17}/>{sample?"This shows an authored example report. It makes no AI request.":"Checking sends the selected policy text and answer to Gemini. Use public or fictional information. You may be asked for the pilot access code."}</p>}
      </div>}
      <div className="setup-actions"><div>{step>1?<button className="button secondary" disabled={busy||fileBusy} onClick={()=>setStep((step-1) as 1|2)}><ArrowLeft size={16}/> Back</button>:<span className="setup-action-hint">{selected.length?"Policies added. You can continue.":"Add at least one policy to continue."}</span>}</div>{step<3?<button className="button primary" disabled={!nextAllowed||busy||fileBusy} onClick={()=>setStep((step+1) as 2|3)}>{step===1?"Continue to answer":"Continue to check"}<ArrowRight size={17}/></button>:<button className="button primary" disabled={busy||fileBusy||!selected.length||!answer.trim()||liveUnavailable||(!sample&&!healthReady)} onClick={onAudit}>{busy?<LoaderCircle size={17} className="spin"/>:<Check size={17}/>} {busy?"Checking answer…":sample?"Show example results":liveUnavailable?"Live checking unavailable":"Check answer"}{!busy&&<ArrowRight size={17}/>}</button>}</div>
    </div><p className="setup-memory-note">Your progress stays here while you visit other pages. Refreshing clears this review.</p>
  </section>;
}
