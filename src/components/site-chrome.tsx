"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, Menu, X, LogOut, ArrowRight, ShieldCheck } from "lucide-react";
import { Mark } from "./ui";
import { useWorkspaceMemory } from "./workspace-memory";

const links=[{href:"/",label:"Start here"},{href:"/examples",label:"Examples"},{href:"/screen",label:"Check a claim · Free"},{href:"/connect",label:"Connect your AI"},{href:"/methodology",label:"How it works"}];
export function SiteHeader({workspace=false,onClear}:{workspace?:boolean;onClear?:()=>void}) {
  const pathname=usePathname(),{state}=useWorkspaceMemory();
  const [menu,setMenu]=useState(false),[scrolled,setScrolled]=useState(false);
  useEffect(()=>{const update=()=>setScrolled(window.scrollY>20);update();window.addEventListener("scroll",update,{passive:true});return()=>window.removeEventListener("scroll",update);},[]);
  useEffect(()=>setMenu(false),[pathname]);
  useEffect(()=>{if(!menu)return;const close=(e:KeyboardEvent)=>{if(e.key==="Escape")setMenu(false);};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close);},[menu]);
  return <header className={`site-header no-print ${workspace?"workspace-header":""} ${scrolled?"is-scrolled":""}`}><div className="site-header-inner">
    <Link className="brand" href="/" aria-label="Second Opinion home"><Mark small/><span>second<span className="brand-light">opinion</span><span className="brand-period">.</span></span></Link>
    <nav className={menu?"site-navigation is-open":"site-navigation"} id="site-navigation" aria-label="Main navigation">{links.map(link=><Link href={link.href} key={link.href} aria-current={pathname===link.href?"page":undefined}>{link.label}</Link>)}<Link className="mobile-workspace-link" href="/workspace">Start a review <ArrowUpRight size={14}/></Link></nav>
    <div className="site-header-actions">{workspace?<><span className="memory-status"><span/> In this session</span><button className="icon-button" aria-label="Clear session and leave" title="Clear session and leave" onClick={onClear}><LogOut size={17}/></button></>:<Link className="nav-workspace" href="/workspace">{state.answer||state.sources.length?"Continue review":"Start a review"}<ArrowUpRight size={14}/></Link>}<button className="site-menu-button icon-button" aria-label={menu?"Close navigation":"Open navigation"} aria-expanded={menu} aria-controls="site-navigation" onClick={()=>setMenu(v=>!v)}>{menu?<X size={21}/>:<Menu size={21}/>}</button></div>
  </div></header>;
}
export function SiteFooter(){return <footer className="site-footer"><Link className="brand" href="/" aria-label="Second Opinion home"><Mark small/><span>second<span className="brand-light">opinion</span><span className="brand-period">.</span></span></Link><span>Evidence before confidence.</span><div><Link href="/lab">Practice with examples</Link><Link href="/methodology#handling">Privacy & limits</Link><Link href="/workspace">Start a review <ArrowRight size={13}/></Link></div></footer>;}
export function PageFrame({children,className=""}:{children:ReactNode;className?:string}){return <div className={`product-page ${className}`}><a className="skip-link" href="#page-content">Skip to content</a><SiteHeader/><main id="page-content">{children}</main><SiteFooter/></div>;}
export function PageHeading({eyebrow,title,accent,description,children}:{eyebrow:string;title:string;accent:string;description:string;children?:ReactNode}){return <div className="page-heading"><div><div className="page-eyebrow"><span/>{eyebrow}</div><h1>{title}<br/><span>{accent}</span></h1><p>{description}</p></div>{children}</div>;}
export function SessionNote(){return <div className="session-note"><ShieldCheck size={16}/><span>Your workspace travels between these pages. Save a review file to keep a copy after refreshing or clearing.</span></div>;}
