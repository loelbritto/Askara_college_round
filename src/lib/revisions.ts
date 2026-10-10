import type { Finding, Report, Source, Verdict } from "./contracts";

export type RevisionKind = "answer" | "context" | "policy";
export type RevisionChange = {kind:RevisionKind;label:string;sourceName?:string;versionLabel?:string;effectiveFrom?:string;scope?:string;supersedes?:string};
export type AuditVersion = {report:Report;parentId:string|null;change:RevisionChange|null};
export type RevisionInput = {answer:string;context:string;sources:Source[];selectedSourceIds:string[];change:RevisionChange};

export function proposedAnswer(report:Report,finding?:Finding):string {
  if(!finding?.suggestedCorrection || finding.validation!=="verified" || finding.start===null || finding.end===null)return report.answer;
  if(report.answer.slice(finding.start,finding.end)!==finding.answerQuote)return report.answer;
  return report.answer.slice(0,finding.start)+finding.suggestedCorrection+report.answer.slice(finding.end);
}
export function textDifference(before:string,after:string){
  const a=Array.from(before),b=Array.from(after);let start=0,end=0;
  while(start<a.length&&start<b.length&&a[start]===b[start])start++;
  const word=(char:string|undefined)=>!!char&&/[\p{L}\p{N}_]/u.test(char);
  while(start>0&&((word(a[start-1])&&word(a[start]))||(word(b[start-1])&&word(b[start]))))start--;
  while(end<a.length-start&&end<b.length-start&&a[a.length-1-end]===b[b.length-1-end])end++;
  while(end>0&&((word(a[a.length-end-1])&&word(a[a.length-end]))||(word(b[b.length-end-1])&&word(b[b.length-end]))))end--;
  return {prefix:a.slice(0,start).join(""),removed:a.slice(start,a.length-end).join(""),added:b.slice(start,b.length-end).join(""),suffix:end?a.slice(a.length-end).join(""):"",changed:before!==after};
}
export function appendRevision(history:AuditVersion[],parent:Report,result:Report,change:RevisionChange):AuditVersion[]{
  const next=history.some(v=>v.report.id===parent.id)?history:[...history,{report:parent,parentId:null,change:null}];
  if(next.some(v=>v.report.id===result.id))return next;
  return [...next,{report:result,parentId:parent.id,change}];
}
export type ImpactRow={claim:string;before:Verdict|null;after:Verdict|null;alignment:"exact"|"needs_review";changed:boolean;beforeId?:string;afterId?:string};
export function revisionImpact(before:Report,after:Report):ImpactRow[]{
  const used=new Set<string>();
  const rows:ImpactRow[]=before.findings.map(previous=>{
    const matches=after.findings.filter(f=>f.proposition===previous.proposition);
    const uniqueBefore=before.findings.filter(f=>f.proposition===previous.proposition).length===1;
    const current=uniqueBefore&&matches.length===1?matches[0]:undefined;
    if(current)used.add(current.id);
    return {claim:previous.proposition,before:previous.verdict,after:current?.verdict??null,alignment:current?"exact":"needs_review",changed:!!current&&current.verdict!==previous.verdict,beforeId:previous.id,afterId:current?.id};
  });
  after.findings.filter(f=>!used.has(f.id)).forEach(f=>rows.push({claim:f.proposition,before:null,after:f.verdict,alignment:"needs_review",changed:false,afterId:f.id}));
  return rows;
}
