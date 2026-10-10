"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpen, Check, CheckCheck, ChevronDown, Download, FileText, GitCompareArrows, Info, Layers3, LoaderCircle, LockKeyhole, LogOut, Plus, Printer, RotateCcw, ScanText, ShieldCheck, Sparkles, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SiteHeader } from "./site-chrome";
import { useWorkspaceField } from "./workspace-memory";
import { ReviewPanel, ReviewProgress } from "./review-tools";
import { ReviewComposer } from "./chat-setup";
import { ResultGuide } from "./result-guide";
import { PolicyRules } from "./policy-rules";
import { RevisionActions, RevisionDialog } from "./revision-dialog";
import { RevisionHistory } from "./revision-history";
import { appendRevision, type RevisionInput, type RevisionKind } from "@/lib/revisions";
import { reviewKey } from "@/lib/review";
import { AnswerReport } from "./answer-report";
import { EvidencePanel } from "./evidence";
import { Mark, Modal } from "./ui";
import { ResearchContent } from "./research";
import { LIMITS, type AuditRequest, type Report, type Source, type Verdict } from "@/lib/contracts";
import { createSource, sha256, validateSourceCollection } from "@/lib/canonical";
import { canonicalClaims } from "@/lib/validate-report";
import { isUnchangedSample, sampleReport, sampleSources, SAMPLE_ANSWER, SAMPLE_CONTEXT } from "@/lib/sample";
import { readSourceFile } from "@/lib/pdf";
import { readApiResponse } from "@/lib/client-response";
import { SessionFields } from "./session-fields";
import { SavedReviews } from "./saved-reviews";

type Health = {configured:boolean;enabled:boolean;authenticated:boolean;model:string;authMode?:"pilot"|"supabase";accountsConfigured?:boolean;provider?:string;missing?:string[]};
type SourceView = {id:string;blockId?:string;quote?:string};
export function Workbench() {
  const router=useRouter();
  const [reviews,setReviews]=useWorkspaceField("reviews");
  const [,setRuleReviews]=useWorkspaceField("ruleReviews");
  const [history,setHistory]=useWorkspaceField("history");
  const [revisionKind,setRevisionKind]=useState<RevisionKind|null>(null);
  const [setupStep,setSetupStep]=useWorkspaceField("setupStep");
  const [guided,setGuided]=useWorkspaceField("guided");
  const [healthReady,setHealthReady]=useState(false);
  const [health,setHealth]=useState<Health>({configured:false,enabled:true,authenticated:false,model:"AI provider"});
  const [code,setCode]=useState(""),[loginBusy,setLoginBusy]=useState(false);
  const [email,setEmail]=useState("");
  const [restoredAt,setRestoredAt]=useWorkspaceField("restoredAt");
  const [,setSavedWorkspace]=useWorkspaceField("savedWorkspace");
  const [sources,setSources]=useWorkspaceField("sources"),[selectedIds,setSelectedIds]=useWorkspaceField("selectedIds");
  const [answer,setAnswer]=useWorkspaceField("answer"),[context,setContext]=useWorkspaceField("context");
  const [baseline,setBaseline]=useWorkspaceField("baseline"),[comparison,setComparison]=useWorkspaceField("comparison"),[showComparison,setShowComparison]=useWorkspaceField("showComparison");
  const [selectedClaim,setSelectedClaim]=useWorkspaceField("selectedClaim"),[filter,setFilter]=useWorkspaceField("filter");
  const [view,setView]=useWorkspaceField("view"),[changedOnly,setChangedOnly]=useWorkspaceField("changedOnly");
  const [busy,setBusy]=useState(false),[phase,setPhase]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [methodOpen,setMethodOpen]=useState(false),[addOpen,setAddOpen]=useState(false),[loginOpen,setLoginOpen]=useState(false),[clearOpen,setClearOpen]=useState(false);
  const [sourceView,setSourceView]=useState<SourceView|null>(null),[sourceName,setSourceName]=useState(""),[sourceText,setSourceText]=useState("");
  const [editingSource,setEditingSource]=useState<string|null>(null),[sourceError,setSourceError]=useState("");
  const [sampleMode,setSampleMode]=useWorkspaceField("sampleMode"),[fileBusy,setFileBusy]=useState(false),[mobileTab,setMobileTab]=useState<"answer"|"sources"|"findings">("answer");
  const [cacheHit,setCacheHit]=useState(false);
  const pendingAudit=useRef<{compare:boolean}|null>(null);
  const abortRef=useRef<AbortController|null>(null),generation=useRef(0),cache=useRef(new Map<string,Report>()),fileInput=useRef<HTMLInputElement>(null),busyRef=useRef(false);
  const report=showComparison&&comparison?comparison:baseline;
  const selectionPending=!!report&&(selectedIds.length!==report.selectedSourceIds.length||selectedIds.some(id=>!report.selectedSourceIds.includes(id)));
  const finding=report?.findings.find(f=>f.id===selectedClaim);
  const inspected=sources.find(s=>s.id===sourceView?.id);

  useEffect(()=>{const controller=new AbortController();fetch("/api/health",{signal:controller.signal,cache:"no-store"}).then(r=>r.json()).then(setHealth).catch(()=>{}).finally(()=>{if(!controller.signal.aborted)setHealthReady(true);});return()=>{generation.current++;controller.abort();abortRef.current?.abort();cache.current.clear();};},[]);
  useEffect(()=>{window.scrollTo({top:0,behavior:"instant"});},[]);
  useEffect(()=>{if(!sourceView?.blockId)return;const timer=setTimeout(()=>document.getElementById(sourceView.blockId!)?.scrollIntoView({block:"center",behavior:"smooth"}),80);return()=>clearTimeout(timer);},[sourceView]);
  const clearResults=()=>{setBaseline(null);setComparison(null);setShowComparison(false);setView("answer");setFilter("all");cache.current.clear();setCacheHit(false);};
  const selectFinding=(id:string)=>{setSelectedClaim(id);if(window.matchMedia("(max-width: 900px)").matches)setMobileTab("findings");};
  async function loginWithCode(sessionCode:string,accountEmail?:string) {
    setLoginBusy(true);setError("");
    try {const response=await fetch("/api/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(health.authMode==="supabase"?{email:accountEmail,password:sessionCode}:{code:sessionCode})});await readApiResponse(response,"Could not open the session.");setHealth(h=>({...h,authenticated:true}));setLoginOpen(false);setCode("");setEmail("");cache.current.clear();setNotice("Session opened. Use only public or synthetic policies.");if(pendingAudit.current){const pending=pendingAudit.current;pendingAudit.current=null;void audit(pending.compare,true);}return true;}catch(e){setError(e instanceof Error?e.message:"Could not open the session.");return false;}finally{setLoginBusy(false);}
  }
  async function login(){await loginWithCode(code,email);}
  async function loadSample(conflict=false,preview=false,live=false) {
    const run=generation.current;const docs=await sampleSources(conflict);if(run!==generation.current)return;generation.current++;abortRef.current?.abort();busyRef.current=false;setBusy(false);setSetupStep(1);
    setRestoredAt(null);setSavedWorkspace(null);setSources(docs);setSelectedIds(docs.map(s=>s.id));setAnswer(SAMPLE_ANSWER);setContext(SAMPLE_CONTEXT);setSampleMode(!live);setGuided(false);clearResults();setHistory([]);setReviews({});setRuleReviews({});setError("");setNotice("");setSelectedClaim("c1");setMobileTab("answer");
    if(preview){setBaseline(sampleReport(docs));setNotice("This is an authored sample report. No document was sent to an AI model.");}
  }
  function resetWorkspace() {setRestoredAt(null);setSavedWorkspace(null);setSetupStep(1);generation.current++;abortRef.current?.abort();busyRef.current=false;setBusy(false);setSources([]);setSelectedIds([]);setAnswer("");setContext("");setSampleMode(false);clearResults();setHistory([]);setReviews({});setRuleReviews({});setRevisionKind(null);setError("");setNotice("");setSourceView(null);setSourceText("");setSourceName("");setMobileTab("answer");setClearOpen(false);setGuided(false);}
  function editAnswer() {setSetupStep(2);generation.current++;abortRef.current?.abort();busyRef.current=false;setBusy(false);setPhase("");clearResults();setNotice("Editing starts a new baseline. Your sources and answer are preserved.");setMobileTab("answer");}
  async function addTextSource() {
    setSourceError("");try {if(!sourceName.trim()||!sourceText.trim())throw new Error("Add a source name and readable policy text.");const source=await createSource(sourceName,[{number:1,text:sourceText}],"paste");const next=editingSource?sources.map(s=>s.id===editingSource?source:s):[...sources,source];validateSourceCollection(next);setSources(next);setSelectedIds(next.map(s=>s.id));clearResults();setSampleMode(false);setSetupStep(1);setAddOpen(false);setSourceText("");setSourceName("");setEditingSource(null);}catch(e){setSourceError(e instanceof Error?e.message:"The source could not be added.");}
  }
  async function uploadFiles(files: FileList|null) {
    if(!files?.length)return;setFileBusy(true);setError("");const run=generation.current;
    try {let next=[...sources];for(const file of Array.from(files)){next=[...next,await readSourceFile(file,next)];}if(run!==generation.current)return;setSources(next);setSelectedIds(next.map(s=>s.id));clearResults();setSampleMode(false);setNotice("Files were read locally. Review the extracted text before auditing.");}catch(e){setError(e instanceof Error?e.message:"Could not read this file.");}finally{setFileBusy(false);if(fileInput.current)fileInput.current.value="";}
  }
  async function audit(compare=false,sessionOpened=false) {
    if(busyRef.current)return;
    setError("");setNotice("");setCacheHit(false);
    if(!answer.trim()||!sources.length||(!compare&&!selectedIds.length)){setError("Add an answer and select at least one source.");return;}
    if(compare&&!baseline){setError("Run an initial audit before comparing sources.");return;}
    if(compare&&!sampleMode&&!baseline?.baselineToken){setError("Run a fresh audit before comparing this saved report. Saved files cannot restore an access signature.");return;}
    busyRef.current=true;setBusy(true);setPhase("Preparing sources");const run=++generation.current;const controller=new AbortController();abortRef.current=controller;
    try {
      let result:Report;
      if(sampleMode) {
        if(!await isUnchangedSample(answer,context,sources))throw new Error("This sample was edited. Switch to live auditing and enter a pilot access code to check custom inputs.");
        result=sampleReport(sources,selectedIds,compare);
      } else {
        if(!health.authenticated&&!sessionOpened){pendingAudit.current={compare};setLoginOpen(true);throw new Error(health.authMode==="supabase"?"Sign in to run a live audit. Your inputs will stay here.":"Enter your pilot code to run a live audit. Your inputs will stay here.");}
        const request:AuditRequest={mode:compare?"compare":"audit",answer,context,sources,selectedSourceIds:selectedIds,...(compare?{claims:canonicalClaims(baseline!.findings),baselineToken:baseline!.baselineToken}:{})};
        const key=await sha256(JSON.stringify({...request,selectedSourceIds:[...request.selectedSourceIds].sort()}));
        const cached=cache.current.get(key);
        if(cached){result=cached;setCacheHit(true);}else{
          setPhase("Auditing claims");
          const response=await fetch("/api/audit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request),signal:controller.signal});
          if(response.status===401){setHealth(h=>({...h,authenticated:false}));setLoginOpen(true);}
          result=await readApiResponse<Report>(response,"The audit could not be completed. Your work is preserved.");setPhase("Checking evidence references");
          if(result.complete){if(cache.current.size>=20)cache.current.delete(cache.current.keys().next().value!);cache.current.set(key,result);}
        }
      }
      if(run!==generation.current)return;
      if(compare){setComparison(result);setShowComparison(true);setView("compare");}else{setBaseline(result);setComparison(null);setShowComparison(false);setSelectedClaim(result.findings[0]?.id??"c1");setView("answer");}
      setFilter("all");setMobileTab("answer");setRestoredAt(null);
    }catch(e){if(run===generation.current&&!controller.signal.aborted)setError(e instanceof Error?e.message:"Audit failed. Your inputs are preserved.");}finally{if(run===generation.current){setBusy(false);busyRef.current=false;setPhase("");abortRef.current=null;}}
  }
  async function auditRevision(input:RevisionInput):Promise<boolean>{
    if(busyRef.current||!report)return false;
    if(history.length>=20){setError("This tab holds 20 audit versions. Export the records before starting another workspace.");return false;}
    if(!health.configured||!health.enabled||!health.authenticated){setError("Open an available live session before checking a revision.");return false;}
    const parent=report,run=++generation.current,controller=new AbortController();abortRef.current=controller;busyRef.current=true;setBusy(true);setPhase("Checking revised inputs");setError("");setNotice("");
    try{
      const request:AuditRequest={mode:"audit",answer:input.answer,context:input.context,sources:input.sources,selectedSourceIds:input.selectedSourceIds};
      const response=await fetch("/api/audit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request),signal:controller.signal});
      if(response.status===401)setHealth(h=>({...h,authenticated:false}));
      const result=await readApiResponse<Report>(response,"The revision could not be checked. Your original report is preserved.");
      if(run!==generation.current)return false;
      setRestoredAt(null);setHistory(previous=>appendRevision(previous,parent,result,input.change));setSources(input.sources);setSelectedIds(input.selectedSourceIds);setAnswer(input.answer);setContext(input.context);setBaseline(result);setComparison(null);setShowComparison(false);setSampleMode(false);setSelectedClaim(result.findings[0]?.id??"c1");setView("answer");setFilter("all");setMobileTab("answer");setCacheHit(false);cache.current.clear();setNotice("Revision checked as a new audit. Your original report and notes are available in Review history.");return true;
    }catch(e){if(run===generation.current&&!controller.signal.aborted)setError(e instanceof Error?e.message:"The revision failed. Your original report is preserved.");return false;}
    finally{if(run===generation.current){busyRef.current=false;setBusy(false);setPhase("");abortRef.current=null;}}
  }
  function cancel(){generation.current++;abortRef.current?.abort();busyRef.current=false;setBusy(false);setPhase("");setNotice("Request cancelled. Your inputs and previous report are preserved.");}
  function exportReport(){if(!report)return;const {baselineToken:_,...safe}=report;const blob=new Blob([JSON.stringify(safe,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=`second-opinion-${report.origin}-${report.id.slice(0,8)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function signOut(allDevices=false){try{const response=await fetch(allDevices?"/api/session?all=true":"/api/session",{method:"DELETE"});if(!response.ok)throw new Error("Could not end the access session. Please retry.");resetWorkspace();setHealth(h=>({...h,authenticated:false}));router.push("/");setCode("");}catch(e){setClearOpen(false);setError(e instanceof Error?e.message:"Could not end the access session. Please retry.");}}
  const modalResearch=methodOpen&&<Modal title="Methodology & document handling" onClose={()=>setMethodOpen(false)} wide><ResearchContent/></Modal>;
  return <div className={`app-shell chat-shell ${report?"has-report":"is-composing"}`}>
    <aside className="chat-sidebar no-print" aria-label="Workspace navigation"><Link href="/" className="chat-side-brand"><Mark small/><strong>Second Opinion</strong></Link><button className="chat-new" aria-label="Start new review" disabled={busy||fileBusy} onClick={()=>setClearOpen(true)}><Plus size={17}/> New review</button><nav><Link href="/workspace" aria-current="page"><ScanText size={17}/> Review workspace</Link><Link href="/examples"><Sparkles size={17}/> Example library</Link><Link href="/methodology"><BookOpen size={17}/> How it works</Link></nav><div className="chat-side-session"><span>THIS SESSION</span><strong>{report?"Answer reviewed":sources.length?"Review in progress":"Your next review"}</strong><p>{sources.length} policies · {history.length} earlier versions</p><p>Use Save or open a review to keep your work.</p></div><div className="chat-side-bottom"><ShieldCheck size={18}/><div><strong>{health.provider==="deepseek"?"DeepSeek Flash":health.provider==="gemini"?"Gemini":"AI connection"}</strong><span>{!healthReady?"Checking setup…":!health.enabled?"Paused":health.configured?"Configured · access required":"Setup needed"}</span></div></div></aside>
    <a className="skip-link" href="#audit-main">Skip to audit</a>
    <SiteHeader workspace onClear={()=>setClearOpen(true)}/>
    <main id="audit-main" className="workspace"><div className="workspace-title no-print"><div><div className="eyebrow">WORKSPACE <span>/</span> {report?"POLICY AUDIT":"NEW AUDIT"}</div><h1>{report?"Your answer, checked.":"Let’s check an answer."}</h1><p>{report?"See what matches your policies and what needs a closer look.":"Your policies. Your answer. One clear place to review."}</p></div><div className="title-actions">{report?<><Link className="button secondary presentation-link" href="/present" aria-disabled={busy||fileBusy} onClick={e=>{if(busy||fileBusy)e.preventDefault();}}><BookOpen size={15}/> Present</Link><button className="button secondary" onClick={exportReport}><Download size={15}/> Export JSON</button><button className="icon-button outlined" onClick={()=>window.print()} aria-label="Print report"><Printer size={17}/></button><button className="button primary" onClick={()=>setClearOpen(true)}><Plus size={16}/> New review</button></>:(sources.length||answer)?<button className="button secondary" onClick={()=>setClearOpen(true)}>Start over</button>:null}</div></div>
    <SavedReviews disabled={busy||fileBusy} account={health.authMode==="supabase"&&!!health.accountsConfigured} authenticated={health.authenticated} onSignIn={()=>{setError("");setLoginOpen(true);}} onSignOut={()=>signOut(true)} onExpired={()=>setHealth(h=>({...h,authenticated:false}))}/>
    {restoredAt&&<div className="restored-review no-print" role="status"><div><strong>Saved review opened</strong><p>Saved {new Date(restoredAt).toLocaleString()}. These historical findings have not been checked again. Review the original timestamps and sources.</p></div><button className="button secondary" disabled={busy||fileBusy||!selectedIds.length} onClick={()=>audit(false)}>{sampleMode?"Reload example results":"Run a fresh audit"}</button></div>}
    {report&&<div className={`mode-banner no-print ${sampleMode?"sample":"live"}`}><span><Info size={15}/>{sampleMode?<><strong>Sample mode</strong><span>Authored findings for fictional policies. No AI request.</span></>:<><ShieldCheck size={15}/><strong>Live audit</strong><span>Only public or synthetic policies. Text is sent to the configured AI provider.</span></>}</span><button onClick={()=>{setSetupStep(3);setGuided(true);clearResults();setSampleMode(!sampleMode);setError("");setNotice(sampleMode?"Live mode selected. An access code is required to audit.":"Sample mode supports the unchanged example packet. Load a sample case to explore.");}} disabled={busy}>{sampleMode?"Switch to live":"Use sample mode"}<ArrowRight size={14}/></button></div>}
    {error&&<div className="notice error no-print" role="alert"><Info size={17}/><span>{error}</span><button className="icon-button" onClick={()=>setError("")} aria-label="Dismiss error"><X size={16}/></button></div>}
    {notice&&<div className="toast no-print" role="status"><CheckCheck size={15}/><span>{notice}</span><button className="icon-button" onClick={()=>setNotice("")} aria-label="Dismiss notice"><X size={14}/></button></div>}
    {busy&&<div className="progress-notice no-print" role="status"><LoaderCircle className="spin" size={18}/><span>{phase}… <small>One request. No automatic retries.</small></span><button className="text-button" onClick={cancel}>Cancel</button></div>}
    {selectionPending&&!busy&&<div className="toast selection-pending no-print" role="status"><GitCompareArrows size={15}/><span>Source selection changed. The displayed report still uses its original evidence set.</span><button className="text-button" onClick={()=>audit(true)}>Compare to apply <ArrowRight size={13}/></button></div>}
    <input ref={fileInput} type="file" accept=".pdf,.txt" multiple hidden onChange={e=>uploadFiles(e.target.files)}/>
    {!report?<ReviewComposer guided={guided} onGuided={setGuided} missing={health.missing??[]} providerLabel={health.provider==="deepseek"?"DeepSeek":health.provider==="gemini"?"Gemini":"AI provider"} onLiveDemo={()=>loadSample(false,false,true)} step={setupStep} setStep={setSetupStep} sources={sources} selectedIds={selectedIds} answer={answer} context={context} setAnswer={value=>{setAnswer(value);cache.current.clear();}} setContext={setContext} sample={sampleMode} busy={busy} fileBusy={fileBusy} healthReady={healthReady} configured={health.configured} enabled={health.enabled} onUpload={()=>fileInput.current?.click()} onDrop={files=>uploadFiles(files)} onPaste={()=>{setEditingSource(null);setSourceName("");setSourceText("");setSourceError("");setAddOpen(true);}} onInspect={id=>setSourceView({id})} onToggle={(id,checked)=>setSelectedIds(ids=>checked?[...ids,id]:ids.filter(value=>value!==id))} onAudit={()=>audit()}/>:<><ResultGuide report={report} onSelect={id=>{setFilter("all");setView("answer");selectFinding(id);document.getElementById("review-results")?.scrollIntoView({block:"start",behavior:"smooth"});}}/><ReviewProgress report={report}/>

    <RevisionActions disabled={busy||fileBusy||selectionPending} onOpen={kind=>{setError("");setRevisionKind(kind);}}/><RevisionHistory/>
    <div className="mobile-tabs no-print">{(["answer","sources","findings"] as const).map(t=><button key={t} onClick={()=>setMobileTab(t)} className={mobileTab===t?"active":""}>{t==="findings"?"Evidence":t[0].toUpperCase()+t.slice(1)}</button>)}</div>
    <div id="review-results" className={`work-grid mobile-${mobileTab} ${busy?"working":""}`}>
      <aside className="source-panel no-print"><div className="panel-heading"><span><Layers3 size={17}/> Policy sources <b>{sources.length.toString().padStart(2,"0")}</b></span><button className="icon-button" disabled={busy||fileBusy||sources.length>=LIMITS.documents} aria-label="Add policy source" onClick={()=>{setEditingSource(null);setSourceName("");setSourceText("");setSourceError("");setAddOpen(true);}}><Plus size={18}/></button></div><div className="source-body"><p className="section-intro">Your evidence packet.<br/>Include only the policies you want to test.</p>
      <div className="source-list">{sources.map((s,i)=><div key={s.id} className={`source-card ${selectedIds.includes(s.id)?"included":"excluded"}`}><div className="source-card-top"><span className="file-icon"><FileText size={18}/></span><label className="source-toggle" title={`Include ${s.name}`}><input type="checkbox" aria-label={`Include ${s.name}`} checked={selectedIds.includes(s.id)} disabled={busy} onChange={e=>setSelectedIds(ids=>e.target.checked?[...ids,s.id]:ids.filter(id=>id!==s.id))}/></label></div><button className="source-preview-button" onClick={()=>setSourceView({id:s.id})}><strong>{s.name}</strong><span>{s.kind==="sample"?"SYNTHETIC":s.kind.toUpperCase()} <i/> {s.pages.length} page{s.pages.length!==1?"s":""}</span><p>{s.blocks.find(b=>!b.text.startsWith("SYNTHETIC"))?.text.slice(0,102)}…</p></button><div className="source-card-bottom"><span>SOURCE {String(i+1).padStart(2,"0")}</span><button onClick={()=>setSourceView({id:s.id})}>Inspect text <ArrowRight size={12}/></button></div></div>)}</div>
      {!sources.length&&<div className="sources-empty"><Layers3 size={28}/><p>No policies yet</p><span>Add the documents that should inform the answer.</span></div>}
      <button className="upload-zone" disabled={busy||fileBusy||sources.length>=LIMITS.documents} onClick={()=>fileInput.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy&&!fileBusy)uploadFiles(e.dataTransfer.files);}}><Upload size={20}/><strong>{fileBusy?"Reading document…":"Add a policy document"}</strong><span>Drop a PDF / TXT, or click to browse</span><small>5 MB each · selectable text only</small></button><button className="paste-button" disabled={busy||fileBusy||sources.length>=LIMITS.documents} onClick={()=>{setEditingSource(null);setSourceName("");setSourceText("");setSourceError("");setAddOpen(true);}}><Plus size={14}/> Or paste policy text</button>
      <div className="packet-meta"><span>{selectedIds.length} of {sources.length} sources selected</span><span>{sources.reduce((n,s)=>n+s.pages.length,0)} / {LIMITS.pages} pages</span></div>
      {baseline&&<div className="stress-test"><div className="mini-label"><GitCompareArrows size={14}/> TEST THE EVIDENCE</div><h3>What if this source<br/>wasn’t here?</h3><p>Exclude a policy above. Recheck the same claims against what remains.</p><button className="button primary" disabled={busy||fileBusy||!baseline.findings.length} onClick={()=>audit(true)}><GitCompareArrows size={15}/> Compare selected sources</button>{comparison&&<button className="text-button restore" disabled={busy} onClick={()=>{setShowComparison(false);setSelectedIds(baseline.selectedSourceIds);setView("answer");setFilter("all");}}><RotateCcw size={13}/> Restore original audit</button>}</div>}
      <div className="source-note"><LockKeyhole size={15}/><p>Save a review explicitly<br/>to keep it after a refresh.</p></div></div></aside>
      <section className="main-panel">{report&&baseline?<>{cacheHit&&<p className="cache-notice">Reused an identical report from this browser session. No new model call.</p>}<AnswerReport reviewedIds={report.findings.filter(f=>reviews[reviewKey(report.id,f.id)]?.checked).map(f=>f.id)} report={report} baseline={baseline} selectedId={selectedClaim} onSelect={selectFinding} onEdit={editAnswer} view={view} setView={setView} filter={filter} setFilter={setFilter} changedOnly={changedOnly} setChangedOnly={setChangedOnly}/></>:<div className="editor"><div className="panel-heading"><span><ScanText size={17}/> Answer to review</span><span className="mini-label">START WITH THE CLAIMS</span></div><div className="editor-body"><div className="editor-intro"><span className="step-badge">01</span><div><h2>What did the AI say?</h2><p>Paste the answer exactly as it was generated.</p></div></div><label className="field-label" htmlFor="answer">AI-GENERATED ANSWER <span>Required</span></label><textarea id="answer" className="answer-input" value={answer} onChange={e=>{setAnswer(e.target.value);cache.current.clear();}} maxLength={LIMITS.answerChars} disabled={busy} placeholder="Paste the answer you want to verify against your policies…"/><div className="field-help"><span>We’ll separate the claims and check each one.</span><span>{answer.length} / {LIMITS.answerChars}</span></div><label className="field-label context-label" htmlFor="context">ORIGINAL QUESTION OR CONTEXT <span>Optional</span></label><textarea id="context" className="context-input" value={context} onChange={e=>setContext(e.target.value)} maxLength={LIMITS.contextChars} disabled={busy} placeholder="What was the customer asking?"/><div className="audit-action"><span><ShieldCheck size={16}/> Evidence-bound. Human-reviewed.</span><button className="button primary" disabled={busy||fileBusy||!answer.trim()||!selectedIds.length} onClick={()=>audit()}>{busy?<LoaderCircle className="spin" size={16}/>:<ScanText size={16}/>} {sampleMode?"Preview sample audit":"Audit answer"}<ArrowRight size={15}/></button></div><div className="editor-divider"/><div className="how-grid"><div><span>01</span><h4>Add the evidence</h4><p>Policies and exceptions that apply to this answer.</p></div><div><span>02</span><h4>Inspect each claim</h4><p>Supported, contradicted, or still uncertain.</p></div><div><span>03</span><h4>Test what changes</h4><p>Remove a source. Keep the claims fixed.</p></div></div></div></div>}</section>
      <EvidencePanel review={report&&finding?<><PolicyRules report={report} claimId={finding.id} onCitation={(id,blockId,quote)=>setSourceView({id,blockId,quote})}/><ReviewPanel report={report} finding={finding}/></>:undefined} finding={finding} previous={showComparison?baseline?.findings.find(f=>f.id===selectedClaim):undefined} selectedSourceIds={report?.selectedSourceIds} onCitation={(id,blockId,quote)=>setSourceView({id,blockId,quote})}/>
    </div>
    </>}
    <footer className="workspace-footer no-print"><span><ShieldCheck size={14}/> Evidence before confidence.</span><span>English text · up to 5 policies · explicit saves</span><button className="text-button" onClick={()=>setMethodOpen(true)}>Methodology & privacy <ArrowRight size={13}/></button></footer>
    {report&&<section className="print-report"><h1>Second Opinion — Audit report</h1><p>{report.origin==="sample"?"AUTHORED SAMPLE — NO AI CALL":`LIVE AUDIT · ${report.model}`} · {report.createdAt}</p><p>{report.mode==="compare"?"Hypothetical audit under selected sources. ":""}{report.complete?"All returned references checked.":"AUDIT INCOMPLETE."}</p><h2>Original answer</h2><p>{report.answer}</p>{report.findings.map(f=><article key={f.id}><h3>{f.id.toUpperCase()} — {f.proposition}</h3><p><strong>{f.verdict??"Needs review"}</strong> · {f.explanation}</p>{f.evidence.map((e,i)=><blockquote key={i}>{e.sourceName}, page {e.page}: “{e.quote}”</blockquote>)}</article>)}<h2>Limitations</h2>{report.limitations.map(l=><p key={l}>{l}</p>)}</section>}
    </main>
    {modalResearch}
    {revisionKind&&report&&<RevisionDialog report={report} finding={finding} kind={revisionKind} busy={busy} available={healthReady&&health.configured&&health.enabled} authenticated={health.authenticated} account={health.authMode==="supabase"} requestError={error} onLogin={loginWithCode} onClose={()=>setRevisionKind(null)} onCancel={cancel} onSubmit={auditRevision}/>} 
    {addOpen&&<Modal title={editingSource?"Edit policy source":"Add a policy source"} onClose={()=>setAddOpen(false)}><form onSubmit={e=>{e.preventDefault();addTextSource();}}><p className="small muted">Use public or synthetic, non-sensitive text. Editing creates a new audit baseline.</p><label className="field-label" htmlFor="source-name">SOURCE NAME</label><input id="source-name" className="text-input" value={sourceName} maxLength={150} onChange={e=>setSourceName(e.target.value)} placeholder="e.g. Returns policy — October" required/><label className="field-label" htmlFor="source-text">POLICY TEXT</label><textarea id="source-text" className="source-text-input" value={sourceText} onChange={e=>setSourceText(e.target.value)} maxLength={LIMITS.sourceChars} placeholder="Paste the policy exactly as written…" required/><span className="small muted">{sourceText.length.toLocaleString()} characters</span>{sourceError&&<p className="form-error" role="alert">{sourceError}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setAddOpen(false)}>Cancel</button><button className="button primary"><Plus size={15}/>{editingSource?"Save source & reset audit":"Add source"}</button></div></form></Modal>}
    {inspected&&sourceView&&<Modal title={inspected.name} onClose={()=>setSourceView(null)} wide><div className="source-modal-meta"><span>{inspected.pages.length} page(s) · extracted text</span><span title={inspected.hash}>SHA-256 {inspected.hash.slice(0,12)}…</span></div>{inspected.pages.map(page=><section className="source-page" key={page.number}><div className="mini-label">PAGE {page.number}</div>{inspected.blocks.filter(b=>b.page===page.number).map(b=>{const index=b.id===sourceView.blockId&&sourceView.quote?b.text.indexOf(sourceView.quote):-1;return <p key={b.id} id={b.id} className={index>=0?"located-passage":""}>{index>=0?<>{b.text.slice(0,index)}<mark>{sourceView.quote}</mark>{b.text.slice(index+sourceView.quote!.length)}</>:b.text}</p>;})}</section>)}<div className="modal-actions"><button className="button danger" disabled={busy} onClick={()=>{setSources(s=>s.filter(d=>d.id!==inspected.id));setSelectedIds(ids=>ids.filter(id=>id!==inspected.id));setSourceView(null);setSampleMode(false);clearResults();}}><Trash2 size={14}/> Remove source</button><button className="button secondary" disabled={busy} onClick={()=>{setEditingSource(inspected.id);setSourceName(inspected.name);setSourceText(inspected.pages.map(p=>p.text).join("\n\n"));setSourceView(null);setSourceError("");setAddOpen(true);}}>Edit as text</button><button className="button primary" onClick={()=>setSourceView(null)}>Done <Check size={15}/></button></div></Modal>}
    {loginOpen&&<Modal title={health.authMode==="supabase"?"Sign in to Second Opinion":"Open a live pilot session"} onClose={()=>{pendingAudit.current=null;setLoginOpen(false);setCode("");setEmail("");}}><p>Your draft stays in this browser. Live audits use the configured AI provider. DeepSeek requests consume the operator’s API credit.</p><form onSubmit={e=>{e.preventDefault();login();}}><SessionFields account={health.authMode==="supabase"} prefix="pilot-code" email={email} setEmail={setEmail} password={code} setPassword={setCode} disabled={loginBusy}/>{error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button primary" disabled={!code||loginBusy||(health.authMode==="supabase"&&!email)}>{loginBusy?"Checking…":health.authMode==="supabase"?"Sign in":pendingAudit.current?"Open session & check":"Open session"}<ArrowRight size={15}/></button></div></form>{!health.configured&&<p className="small muted">The operator must complete server configuration before live access is available.</p>}</Modal>}
    {clearOpen&&<Modal title="Clear this workspace?" onClose={()=>setClearOpen(false)}><p>This removes the answer, documents, and cached reports from application memory. Use Save or open a review to keep a copy. Saved account versions are not deleted by clearing this tab.</p><div className="modal-actions"><button className="button secondary" onClick={()=>setClearOpen(false)}>Keep working</button><button className="button secondary" onClick={()=>signOut()}>Clear & leave</button><button className="button primary" onClick={resetWorkspace}>Start a new review</button></div></Modal>}
    {sampleMode&&<div className="sample-tools no-print"><Sparkles size={13}/><span>Try another angle</span><button onClick={()=>loadSample(false,true)} disabled={busy}>Refund case</button><button onClick={()=>loadSample(true,true)} disabled={busy}>Conflicting policies <ArrowRight size={12}/></button></div>}
  </div>;
}
