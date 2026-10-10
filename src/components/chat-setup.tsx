"use client";
import { ArrowUp, FileText, LoaderCircle, Paperclip, Plus, Sparkles, ShieldCheck, X } from "lucide-react";
import { LIMITS } from "@/lib/contracts";
import { useWorkspaceMemory } from "./workspace-memory";
import { SetupFlow, type SetupProps } from "./setup-flow";

export function ReviewComposer(props:SetupProps & {guided:boolean;onGuided:(value:boolean)=>void;onLiveDemo:()=>void;missing:string[]}) {
  const {openExample,launching}=useWorkspaceMemory();
  const {sources,selectedIds,answer,context,setAnswer,setContext,busy,fileBusy,healthReady,configured,enabled,onUpload,onPaste,onInspect,onToggle,onAudit,providerLabel="AI provider"}=props;
  if (props.sample||props.guided) return <>{!props.sample&&<button className="composer-guide-switch no-print" disabled={busy||fileBusy} onClick={()=>props.onGuided(false)}>Use the simple composer</button>}<SetupFlow {...props}/></>;
  const selected=sources.filter(s=>selectedIds.includes(s.id));
  const ready=!!answer.trim()&&!!selected.length&&healthReady&&configured&&enabled&&!busy&&!fileBusy;
  return <section className="chat-start" aria-label="Start a review">
    <div className="chat-welcome"><span className="chat-sigil"><ShieldCheck size={27}/></span><h2>A second look. A clearer answer.</h2><p>Attach your policies, paste an AI answer, and see what holds up.</p></div>
    {!sources.length&&!answer&&<div className="chat-starters">
      <button disabled={busy||fileBusy||launching} onClick={props.onLiveDemo}><Sparkles size={19}/><strong>Set up a live demo</strong><span>Fictional policies. A real AI check.</span></button>
      <button disabled={busy||launching} onClick={()=>openExample("returns",true)}><FileText size={19}/><strong>Explore an example</strong><span>See how it works. No AI credits.</span></button>
    </div>}
    <form className="chat-composer" onSubmit={e=>{e.preventDefault();if(ready)onAudit();}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy&&!fileBusy&&sources.length<LIMITS.documents)props.onDrop(e.dataTransfer.files);}}>
      {sources.length>0&&<div className="composer-attachments" aria-label="Attached policies">{sources.map(source=><div key={source.id} className={`composer-file ${selectedIds.includes(source.id)?"":"excluded"}`}><FileText size={17}/><button type="button" onClick={()=>onInspect(source.id)} aria-label={`Inspect text: ${source.name}`}><strong>{source.name}</strong><small>{source.pages.length} page{source.pages.length===1?"":"s"} · {selectedIds.includes(source.id)?"Included":"Excluded"}</small></button><button type="button" disabled={busy||fileBusy} aria-label={`${selectedIds.includes(source.id)?"Exclude":"Include"} ${source.name}`} onClick={()=>onToggle(source.id,!selectedIds.includes(source.id))}>{selectedIds.includes(source.id)?<X size={15}/>:<Plus size={15}/>}</button></div>)}</div>}
      <label htmlFor="chat-answer" className="sr-only">AI answer to check</label>
      <textarea id="chat-answer" value={answer} maxLength={LIMITS.answerChars} disabled={busy||fileBusy} placeholder="Paste the answer you want to double-check…" onChange={e=>setAnswer(e.target.value)} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter"&&!e.nativeEvent.isComposing){e.preventDefault();if(ready)onAudit();}}}/>
      <details className="composer-context" open={!!context||undefined}><summary>Add the original question <span>Optional</span></summary><label htmlFor="chat-context" className="sr-only">Original question</label><textarea id="chat-context" disabled={busy||fileBusy} value={context} maxLength={LIMITS.contextChars} onChange={e=>setContext(e.target.value)} placeholder="What did the customer ask? Add any relevant context."/></details>
      <div className="composer-toolbar"><div><button type="button" disabled={busy||fileBusy||sources.length>=LIMITS.documents} onClick={onUpload}><Paperclip size={17}/><span>{fileBusy?"Reading…":"Attach policies"}</span></button><button type="button" disabled={busy||fileBusy||sources.length>=LIMITS.documents} onClick={onPaste}><Plus size={16}/><span>Paste policy</span></button></div><button className="composer-submit" type="submit" disabled={!ready}>{busy?<LoaderCircle className="spin" size={17}/>:<ArrowUp size={18}/>}<span>{busy?"Checking…":"Check answer"}</span></button></div>
    </form>
    <div className="composer-hints"><span>{selected.length?`${selected.length} ${selected.length===1?"policy":"policies"} selected` : "Attach a PDF / TXT or paste a policy to begin"}</span><span>{answer.length} / {LIMITS.answerChars} · Ctrl / ⌘ + Enter</span></div>
    {healthReady&&(!configured||!enabled)&&<div className="composer-readiness" role="status"><strong>{enabled?"Live checking needs server setup":"Live checking is paused"}</strong><p>Your draft is safe here. You can explore an example while the operator finishes setup.</p>{props.missing.length>0&&<details><summary>Deployment setup details</summary><p>Add or correct these environment variables in Vercel, then redeploy:</p><ul>{props.missing.map(name=><li key={name}><code>{name}</code></li>)}</ul><p>Only setting names are shown. Never paste keys into the answer box.</p></details>}</div>}
    <p className="composer-disclosure">{healthReady?`${providerLabel} · ${configured&&enabled?"Ready for a live request":"Not ready for live requests"}`:"Checking connection…"}. A live check sends selected policy text and your answer to the configured provider. Use public or fictional information.</p>
    <button className="composer-guide-switch" disabled={busy||fileBusy} onClick={()=>props.onGuided(true)}>Prefer a walkthrough? Use the step-by-step guide</button>
  </section>;
}
