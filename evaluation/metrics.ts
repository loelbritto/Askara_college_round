import { VERDICTS, type Report, type Verdict } from "../src/lib/contracts";
import type { EvaluationCase } from "./cases";

const fraction=(numerator:number,denominator:number)=>({numerator,denominator,value:denominator?numerator/denominator:null});
export function evaluateReport(testCase:EvaluationCase,report:Report){
  const targets=testCase.targets.map(target=>{
    const matches=report.findings.filter(f=>f.answerQuote===target.quote);
    const finding=matches.length===1?matches[0]:undefined;
    const predicted=finding?.validation==="verified"?finding.verdict:null;
    return {...target,predicted,matchedClaims:matches.length,correct:!!finding&&predicted===target.verdict,alignment:matches.length===1?"exact":"human_review_required"};
  });
  const perVerdict=Object.fromEntries(VERDICTS.map(verdict=>{
    const tp=targets.filter(t=>t.verdict===verdict&&t.predicted===verdict).length;
    return [verdict,{precision:fraction(tp,targets.filter(t=>t.predicted===verdict).length),recall:fraction(tp,targets.filter(t=>t.verdict===verdict).length)}];
  }));
  const falseSupport=targets.filter(t=>t.verdict!=="supported"&&t.predicted==="supported").length;
  return {correct:targets.filter(t=>t.correct).length,total:targets.length,targets,perVerdict,
    claimAlignmentCoverage:fraction(targets.filter(t=>t.matchedClaims===1).length,targets.length),
    falseSupportRate:fraction(falseSupport,targets.filter(t=>t.verdict!=="supported").length),
    falseDiscoveryAmongSupported:fraction(falseSupport,targets.filter(t=>t.predicted==="supported").length),
    unresolvedOrUnaligned:fraction(targets.filter(t=>t.predicted===null).length,targets.length),
    unmatchedOrAmbiguousAlignment:targets.filter(t=>t.matchedClaims!==1).length,
    falseFlagsOnSupported:targets.filter(t=>t.verdict==="supported"&&t.predicted!==null&&t.predicted!=="supported").length,
    returnedClaims:report.findings.length,unmatchedReturnedClaims:report.findings.filter(f=>!testCase.targets.some(t=>t.quote===f.answerQuote)).length,
    validatedCitations:report.findings.reduce((sum,f)=>sum+f.evidence.length,0),
    humanEvidenceRelevance:"not reviewed",humanConditionPreservation:"not reviewed",humanSemanticClaimCoverage:"not reviewed",
    latencyMs:report.elapsedMs,usage:report.usage,
    interpretation:"Exact quotation alignment is a conservative proxy, not semantic claim coverage. Human review must check splits, conditions, relevance and candidate labels. Unaligned targets count incorrect; null is not a verdict.",
  };
}
export function evaluateStability(testCase:EvaluationCase,reports:Report[]){
  const evaluated=reports.map(report=>evaluateReport(testCase,report));
  const targets=testCase.targets.map((target,index)=>{
    const judgments=evaluated.map(run=>run.targets[index].predicted);
    const resolved=judgments.length>=2&&judgments.every(v=>v!==null);
    return {quote:target.quote,judgments,fullyAlignedAndResolved:resolved,unchanged:resolved?new Set(judgments).size===1:null};
  });
  return {runs:reports.length,targets,agreement:fraction(targets.filter(t=>t.unchanged===true).length,targets.filter(t=>t.fullyAlignedAndResolved).length),unresolvedTargets:targets.filter(t=>!t.fullyAlignedAndResolved).length,note:"Repeated unresolved results do not count as stable judgments. Agreement is not correctness or calibrated confidence."};
}
export function aggregateMetrics(runs:ReturnType<typeof evaluateReport>[]){
  const targets=runs.flatMap(r=>r.targets),latencies=runs.map(r=>r.latencyMs).sort((a,b)=>a-b);
  const percentile=(p:number)=>latencies.length?latencies[Math.max(0,Math.ceil(p*latencies.length)-1)]:null;
  return {cases:runs.length,claims:targets.length,accuracy:fraction(targets.filter(t=>t.correct).length,targets.length),
    falseSupportRate:fraction(targets.filter(t=>t.verdict!=="supported"&&t.predicted==="supported").length,targets.filter(t=>t.verdict!=="supported").length),
    perVerdict:Object.fromEntries(VERDICTS.map((v:Verdict)=>{const tp=targets.filter(t=>t.verdict===v&&t.predicted===v).length;return [v,{precision:fraction(tp,targets.filter(t=>t.predicted===v).length),recall:fraction(tp,targets.filter(t=>t.verdict===v).length)}];})),
    unresolvedOrUnaligned:targets.filter(t=>t.predicted===null).length,latencyMs:{median:percentile(.5),p95:percentile(.95)},
    note:"Descriptive counts on the selected cases; not independent claim-level statistical guarantees. Human semantic validation remains separate."};
}
