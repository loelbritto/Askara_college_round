"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Check, CircleHelp, TriangleAlert, X, XCircle, ScanLine } from "lucide-react";
import { verdictLabels, type Verdict } from "@/lib/contracts";
export function Mark({small=false}:{small?:boolean}) {return <span className={`brand-mark ${small?"small":""}`} aria-hidden="true"><ScanLine size={small?17:23}/><i><Check size={small?7:10}/></i></span>;}
export function VerdictIcon({verdict,size=15}:{verdict:Verdict|null;size?:number}) {const Icon=verdict==="supported"?Check:verdict==="contradicted"?XCircle:verdict==="ambiguous"?TriangleAlert:CircleHelp;return <Icon size={size}/>;}
export function Badge({verdict}:{verdict:Verdict|null}) {return <span className={`verdict-badge ${verdict??"unresolved"}`}><VerdictIcon verdict={verdict}/>{verdict?verdictLabels[verdict]:"Needs review"}</span>;}
export function Modal({title,children,onClose,wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null);
  const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{const dialog=ref.current;const previous=document.activeElement as HTMLElement|null;dialog?.showModal();return()=>{dialog?.close();previous?.focus();};},[]);
  return <dialog ref={ref} className={`modal ${wide?"wide":""}`} aria-label={title} onCancel={e=>{e.preventDefault();close.current();}} onClick={e=>{if(e.target===e.currentTarget)close.current();}}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div><div className="modal-content">{children}</div></dialog>;
}
