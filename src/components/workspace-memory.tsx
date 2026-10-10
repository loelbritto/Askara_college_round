"use client";

import { createContext, useCallback, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import type { Report, RuleReview, Source, Verdict } from "@/lib/contracts";
import { sampleReport, sampleSources, SAMPLE_ANSWER, SAMPLE_CONTEXT } from "@/lib/sample";
import { Modal } from "./ui";

export type ExampleId = "returns" | "conflict" | "missing";
import type { Review } from "@/lib/review";
import type { AuditVersion } from "@/lib/revisions";
type WorkspaceState = {
  sources: Source[]; selectedIds: string[]; answer: string; context: string;
  baseline: Report | null; comparison: Report | null; showComparison: boolean;
  selectedClaim: string; filter: Verdict | "all" | "unresolved";
  view: "answer" | "compare"; changedOnly: boolean; sampleMode: boolean;
  reviews: Record<string, Review>; ruleReviews: Record<string, RuleReview>; history: AuditVersion[]; revision: number; setupStep: 1 | 2 | 3;
  restoredAt:string|null; savedWorkspace:{id:string;version:number;title:string}|null;
};
export const emptyWorkspace = (): WorkspaceState => ({sources:[],selectedIds:[],answer:"",context:"",baseline:null,comparison:null,showComparison:false,selectedClaim:"c1",filter:"all",view:"answer",changedOnly:false,sampleMode:false,reviews:{},ruleReviews:{},history:[],revision:0,setupStep:1,restoredAt:null,savedWorkspace:null});
type Memory = { state: WorkspaceState; setState: Dispatch<SetStateAction<WorkspaceState>>; openExample: (id:ExampleId,guided?:boolean)=>void; launching:boolean; ready:boolean };
const WorkspaceContext=createContext<Memory|null>(null);

export function WorkspaceProvider({children}:{children:ReactNode}) {
  const [state,setState]=useState(emptyWorkspace),[pending,setPending]=useState<{id:ExampleId;guided:boolean}|null>(null),[launching,setLaunching]=useState(false),[error,setError]=useState("");
  const router=useRouter();
  const [ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);
  async function launch(id:ExampleId,guided=false) {
    if(launching)return;
    setLaunching(true);setError("");
    try {
      const sources=await sampleSources(id==="conflict");
      const baseline=guided?null:sampleReport(sources);
      const selectedIds=sources.filter(s=>id!=="missing"||s.name!=="Premium membership exception").map(s=>s.id);
      const comparison=!guided&&id==="missing"?sampleReport(sources,selectedIds,true):null;
      setState(previous=>({...emptyWorkspace(),revision:previous.revision+1,sources,selectedIds,answer:SAMPLE_ANSWER,context:SAMPLE_CONTEXT,baseline,comparison,showComparison:!!comparison,view:comparison?"compare":"answer",sampleMode:true,selectedClaim:id==="conflict"?"c2":id==="missing"?"c3":"c1"}));
      setPending(null);router.push("/workspace");
    } catch {setError("The example could not be opened. Your current workspace is unchanged. Please try again.");}
    finally {setLaunching(false);}
  }
  function openExample(id:ExampleId,guided=false){if(launching)return;if(state.answer||state.sources.length){setPending({id,guided});setError("");}else void launch(id,guided);}
  return <WorkspaceContext.Provider value={{state,setState,openExample,launching:launching||!ready,ready}}>{children}
    {pending&&<Modal title="Open a different example?" onClose={()=>{if(!launching)setPending(null);}}><p>Your current answer, sources, and review notes will be replaced. Export anything you want to keep first.</p>{error&&<p role="alert" className="form-error">{error}</p>}<div className="modal-actions"><button className="button secondary" disabled={launching} onClick={()=>setPending(null)}>Keep current workspace</button><button className="button primary" disabled={launching} onClick={()=>launch(pending.id,pending.guided)}>{launching?"Opening…":"Replace with example"}</button></div></Modal>}
    {error&&!pending&&<Modal title="Could not open example" onClose={()=>setError("")}><p role="alert">{error}</p><div className="modal-actions"><button className="button primary" onClick={()=>setError("")}>Close</button></div></Modal>}
  </WorkspaceContext.Provider>;
}
export function useWorkspaceMemory(){const value=useContext(WorkspaceContext);if(!value)throw new Error("WorkspaceProvider is required");return value;}
export function useWorkspaceField<K extends keyof WorkspaceState>(key:K):[WorkspaceState[K],Dispatch<SetStateAction<WorkspaceState[K]>>] {
  const {state,setState}=useWorkspaceMemory();
  const set=useCallback((value:SetStateAction<WorkspaceState[K]>)=>setState(previous=>({...previous,[key]:typeof value==="function"?(value as (current:WorkspaceState[K])=>WorkspaceState[K])(previous[key]):value})),[key,setState]);
  return [state[key],set];
}
