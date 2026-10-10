"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CircleHelp, FileText, Fingerprint, GitCompareArrows, Layers3, LockKeyhole, ScanLine, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { SiteHeader, SiteFooter } from "./site-chrome";
import { HomeExplore } from "./home-explore";

const chapters = [
  {label:"Separate the claims", title:<>One answer.<br/><span>Several claims.</span></>, description:"An answer can be right about the return window and unsupported about the refund timeline. Give each claim the attention it deserves."},
  {label:"Follow the evidence", title:<>The exact passage.<br/><span>In plain sight.</span></>, description:"Open the policy behind a judgment. Inspect the words, conditions, and exceptions that support it—with references checked in code."},
  {label:"Test what changes", title:<>Same answer.<br/><span>Different evidence.</span></>, description:"Remove a source. Keep the claims fixed. See what still holds up, what conflicts, and where the evidence runs out."},
];

function HeroEvidence() {
  return <div className="hero-evidence" aria-label="Illustrative policy audit with two claims">
    <div className="hero-orbit orbit-one" aria-hidden="true"/><div className="hero-orbit orbit-two" aria-hidden="true"/><div className="hero-beam" aria-hidden="true"/>
    <div className="hero-document"><div className="object-kicker"><FileText size={14}/><span>YOUR SOURCE</span><span>01</span></div><strong className="hero-document-title">Premium policy</strong><p>“Premium members have a<br/><mark>30-day return window.</mark>”</p><div className="document-lines" aria-hidden="true"><i/><i/><i/></div><div className="object-bottom">POLICY EXCEPTION <span>PAGE 01</span></div></div>
    <div className="hero-answer"><div className="object-kicker"><span className="object-dot"/>ANSWER UNDER REVIEW<span>01 / 02</span></div><p>“You have <span className="answer-supported">30 days</span> to return it.<br/>Your refund will arrive<br/>within <span className="answer-uncertain">48 hours.</span>”</p><div className="hero-answer-bottom"><ScanLine size={14}/> Two claims. Two different stories.<span className="scanning-line" aria-hidden="true"/></div></div>
    <div className="hero-verdict hero-verdict-supported"><span className="verdict-orb"><Check size={18}/></span><div><span>30-DAY RETURN WINDOW</span><strong>Supported.</strong><small>Premium policy · page 1</small></div><ArrowUpRight size={16}/></div>
    <div className="hero-verdict hero-verdict-uncertain"><span className="verdict-orb"><CircleHelp size={19}/></span><div><span>48-HOUR REFUND PROMISE</span><strong>Where’s the evidence?</strong><small>No timeline in the selected policies.</small></div></div>
    <div className="hero-figure-caption"><span className="figure-cross">+</span> ILLUSTRATIVE SAMPLE · NO AI REQUEST <span className="figure-cross">+</span></div>
  </div>;
}

function EvidenceStory({ready}:{ready:boolean}) {
  const section=useRef<HTMLElement>(null);
  const [step,setStep]=useState(0),[includePremium,setIncludePremium]=useState(false),[compact,setCompact]=useState(false);
  useEffect(()=>{
    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
    const small=window.matchMedia("(max-width: 760px), (max-height: 760px)");
    let frame=0;
    function update(){
      frame=0;const element=section.current;if(!element)return;
      if(reduced.matches||small.matches){setCompact(true);element.style.setProperty("--story-progress","0.5");return;}
      setCompact(false);const rect=element.getBoundingClientRect();
      const progress=Math.max(0,Math.min(1,(-rect.top+80)/(rect.height-window.innerHeight)));
      element.style.setProperty("--story-progress",String(progress));setStep(Math.min(2,Math.floor(progress*3)));
    }
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
    update();window.addEventListener("scroll",schedule,{passive:true});window.addEventListener("resize",schedule);
    reduced.addEventListener("change",schedule);small.addEventListener("change",schedule);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener("scroll",schedule);window.removeEventListener("resize",schedule);reduced.removeEventListener("change",schedule);small.removeEventListener("change",schedule);};
  },[]);
  function selectChapter(index:number){
    if(compact){setStep(index);return;}
    const element=section.current;if(!element)return;
    window.scrollTo({top:element.getBoundingClientRect().top+window.scrollY+(element.offsetHeight-window.innerHeight)*(index+.35)/3-80,behavior:"smooth"});
  }
  const included=step<2||includePremium;
  return <section className="evidence-story" id="approach" ref={section} data-step={step} aria-label="How Second Opinion works"><div className="story-sticky"><div className="story-inner">
    <div className="story-copy"><div className="section-index"><span>01 — THE APPROACH</span><Fingerprint size={18}/></div><h2>{chapters[step].title}</h2><p>{chapters[step].description}</p>
      <div className="story-chapters" aria-label="Explore the audit process">{chapters.map((chapter,i)=><button key={chapter.label} aria-pressed={step===i} disabled={!ready} onClick={()=>selectChapter(i)}><span>0{i+1}</span>{chapter.label}<ArrowRight size={14}/></button>)}</div>
      <span className="story-hint">{compact?"Choose a chapter to explore":"Scroll to follow the evidence"}<ArrowDown size={13}/></span>
    </div>
    <div className="story-stage" aria-label="Illustrative evidence comparison"><div className="stage-grid" aria-hidden="true"/><div className="stage-coordinate stage-coordinate-top">EVIDENCE MAP <span>REF. 001</span></div>
      <svg className="evidence-connections" viewBox="0 0 600 560" fill="none" aria-hidden="true"><defs><linearGradient id="evidence-path" x1="300" y1="150" x2="300" y2="480" gradientUnits="userSpaceOnUse"><stop stopColor="#609fff"/><stop offset="1" stopColor="#55d7ea" stopOpacity=".15"/></linearGradient></defs><path d="M300 160V208C300 222 170 219 170 250V300M300 160V208C300 222 445 219 445 250V300M170 335V390C170 420 300 402 300 445M445 335V390C445 420 300 402 300 445" stroke="url(#evidence-path)" strokeWidth="1.5" strokeDasharray="5 5"/><circle cx="300" cy="206" r="4" fill="#80cfff"/></svg>
      <div className="scene-answer"><div className="object-kicker"><ScanLine size={14}/>THE ANSWER<span>CLAIMS FIXED</span></div><p>“Premium members have 30 days<br/>and get free return shipping.”</p></div>
      <div className={`scene-policy ${included?"":"policy-excluded"}`}><div className="object-kicker"><FileText size={14}/><span>PREMIUM EXCEPTION</span>{included?<Check size={13}/>:<X size={13}/>}</div><p>“Premium members have a 30-day window and receive free return shipping.”</p><div className="object-bottom">PAGE 01 <span>{included?"INCLUDED":"EXCLUDED"}</span></div></div>
      <div className="scene-claim"><div className="object-kicker"><Layers3 size={14}/>ATOMIC CLAIM<span>C03</span></div><p>Premium members receive<br/>free return shipping.</p><span className={`scene-verdict ${included?"is-supported":"is-insufficient"}`}>{included?<Check size={13}/>:<CircleHelp size={13}/>} {included?"Supported":"Insufficient evidence"}</span></div>
      <div className="scene-result" aria-live="polite">{step===0?<><span className="result-symbol"><Layers3 size={18}/></span><div><strong>One statement at a time.</strong><span>Conditions and exceptions stay attached.</span></div></>:step===1?<><span className="result-symbol"><Fingerprint size={18}/></span><div><strong>Evidence you can inspect.</strong><span>A verified quote, with its source and page.</span></div></>:<><span className="result-symbol"><GitCompareArrows size={18}/></span><div><strong>{included?"Support restored.":"The claim stays. The support doesn’t."}</strong><span>{included?"The premium exception supports free shipping.":"Missing evidence does not make a claim false."}</span></div></>}</div>
      {step===2&&<label className="story-source-toggle"><input type="checkbox" checked={includePremium} onChange={e=>setIncludePremium(e.target.checked)} aria-label="Include premium policy in illustration"/><span className="switch-track" aria-hidden="true"/><span>Include premium policy</span><span className="toggle-invitation">Try it <ArrowUpRight size={12}/></span></label>}
      <div className="stage-coordinate stage-coordinate-bottom"><span>ILLUSTRATIVE CASE · NO AI CALL</span><span>0{step+1} / 03</span></div>
    </div>
  </div></div></section>;
}

type LandingProps={onSample:()=>void;busy:boolean;hasDraft:boolean};
export function LandingExperience({onSample,busy,hasDraft}:LandingProps) {
  const [ready,setReady]=useState(false);
  useEffect(()=>setReady(true),[]);
  return <div className="landing-shell combined-landing">
    <a className="skip-link" href="#overview">Skip to content</a><SiteHeader/>
    <main>
      <section className="landing-hero" id="overview">
        <div className="hero-content"><div className="hero-eyebrow"><span className="hero-status-dot"/> AI ANSWERS, CHECKED AGAINST YOUR POLICIES</div>
          <h1>Confidence is easy.<br/><span>Proof is different.</span></h1>
          <p className="hero-description">Check an AI answer against your policy documents. See what matches, what needs attention, and the exact evidence behind each result.</p>
          <p className="hero-start-hint">{hasDraft?"Your review is still here. Pick up where you left off.":"First time? Start with our filled-in example."}</p>
          <div className="hero-actions">{hasDraft?<Link className="cinema-button" href="/workspace">Continue your review <ArrowRight size={17}/></Link>:<button className="cinema-button" onClick={onSample} disabled={busy||!ready}>Try with an example <ArrowRight size={17}/></button>}{hasDraft?<button className="cinema-link" onClick={onSample} disabled={busy||!ready}>Try the guided example <ArrowUpRight size={15}/></button>:<Link href="/workspace" className="cinema-link">I have my own documents <ArrowUpRight size={15}/></Link>}</div>
          <p className="hero-microcopy">Free example <i/> No account or API key <i/> Three guided steps</p>
        </div>
        <HeroEvidence/><a className="scroll-cue" href="#getting-started"><span>A CLEAR PATH FROM ANSWER TO EVIDENCE</span><ArrowDown size={14}/></a>
      </section>
      <section className="landing-start-steps" id="getting-started" aria-labelledby="getting-started-title"><div className="landing-steps-heading"><span className="section-index">START HERE</span><h2 id="getting-started-title">One review.<br/><span>Three simple steps.</span></h2><p>The example is already filled in. With your own documents, we guide you through the same process.</p></div><ol><li><span>01</span><FileText size={23}/><h3>Add your policies</h3><p>Upload a PDF or TXT file, or paste your rules. These define the correct answer.</p></li><li><span>02</span><ScanLine size={23}/><h3>Paste the AI answer</h3><p>Add the response you want to check. Include the original question if it helps.</p></li><li><span>03</span><ShieldCheck size={23}/><h3>Review what needs attention</h3><p>Read each flagged statement beside its policy text, then decide what to change.</p></li></ol></section>
      <EvidenceStory ready={ready}/>
      <section className="judgment-section" id="judgments"><div className="judgment-heading"><div><div className="section-index">02 — UNDERSTAND THE RESULT</div><h2>Clarity includes<br/><span>knowing what’s missing.</span></h2></div><p>Every statement gets a clear judgment. Open the evidence to understand why—and make the final call yourself.</p></div><div className="judgment-grid"><article className="judgment supported"><span className="judgment-icon"><Check size={24}/></span><span className="judgment-number">01</span><h3>Supported</h3><p>The policy supports the statement, including its conditions.</p></article><article className="judgment contradicted"><span className="judgment-icon"><X size={24}/></span><span className="judgment-number">02</span><h3>Contradicted</h3><p>The statement doesn’t match an applicable policy.</p></article><article className="judgment insufficient"><span className="judgment-icon"><CircleHelp size={24}/></span><span className="judgment-number">03</span><h3>Insufficient evidence</h3><p>The documents don’t settle it. Missing support doesn’t mean it’s false.</p></article><article className="judgment ambiguous"><span className="judgment-icon"><TriangleAlert size={23}/></span><span className="judgment-number">04</span><h3>Ambiguous / conflicting</h3><p>The policies conflict or their meaning needs a closer look.</p></article></div><div className="human-review-note"><ShieldCheck size={18}/><p>We check the references. You review the interpretation.</p><Link href="/methodology">Read how checking works <ArrowUpRight size={14}/></Link></div></section>
      <HomeExplore/>
      <section className="landing-invitation"><div className="invitation-orbit" aria-hidden="true"/><span className="section-index">YOUR NEXT ANSWER</span><h2>Give it a<br/><span>second opinion.</span></h2><p>Start with the example. Follow the evidence.<br/>Then bring an answer of your own.</p>{hasDraft?<Link className="cinema-button" href="/workspace">Return to your review <ArrowRight size={17}/></Link>:<button className="cinema-button" onClick={onSample} disabled={busy||!ready}>Start guided example <ArrowRight size={17}/></button>}<Link href="/workspace" className="invitation-own">{hasDraft?"Your progress is preserved in this tab.":"Or start with your documents"}<ArrowUpRight size={14}/></Link><p className="invitation-note"><LockKeyhole size={14}/> Save only when you choose. Live checks use Gemini; use public or fictional policies.</p></section>
    </main><SiteFooter/>
  </div>;
}
