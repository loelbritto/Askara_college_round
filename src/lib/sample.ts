import { createSource, segmentAnswer } from "./canonical";
import { type AuditRequest, type ModelOutput, type RawFinding, type RawPolicyRule, type Source } from "./contracts";
import { canonicalClaims, noEvidenceOutput, validateOutput } from "./validate-report";

export const SAMPLE_ANSWER = "Standard customers can return unopened items with a receipt within 14 days. Premium members can return unopened items with a receipt within 30 days. Premium members receive free return shipping. Opened items qualify for a return as long as the customer has a receipt. Refunds arrive within 48 hours. Customers should send their CVV to support to process a refund.";
export const SAMPLE_CONTEXT = "What should our support team tell customers about returns and refunds?";
export const SAMPLE_POLICIES = [
  {name:"General refund policy",text:"SYNTHETIC DEMONSTRATION POLICY — NOT A REAL BUSINESS POLICY\n\nAll membership tiers have a return window of 14 days from purchase, unless an applicable exception explicitly overrides this window.\n\nAll returns require an unopened item and a valid purchase receipt. Opened items are not eligible for return.\n\nRefunds are issued to the original payment method."},
  {name:"Premium membership exception",text:"SYNTHETIC DEMONSTRATION POLICY — NOT A REAL BUSINESS POLICY\n\nPremium members have a return window of 30 days from purchase. This exception overrides the general 14-day return window for premium members only.\n\nItems must still be unopened and accompanied by a valid purchase receipt.\n\nPremium members receive free return shipping."},
  {name:"Payment security guidelines",text:"SYNTHETIC DEMONSTRATION POLICY — NOT A REAL BUSINESS POLICY\n\nSupport staff must never request a customer's card verification value (CVV). Customers must not send a CVV to support.\n\nRefunds must use the original payment method. Support does not need a CVV to process a refund."},
  {name:"Conflicting premium bulletin",text:"SYNTHETIC CONFLICT VARIANT — SAME SCOPE AND EFFECTIVE PERIOD\n\nPremium members have a return window of 21 days from purchase. This exception overrides the general 14-day return window for premium members only.\n\nItems must be unopened and accompanied by a valid purchase receipt. This bulletin has the same scope and effective period as the other premium exception. No precedence between the two premium documents is established."},
];
export async function sampleSources(conflict = false): Promise<Source[]> {
  return Promise.all(SAMPLE_POLICIES.slice(0,conflict ? 4 : 3).map(p => createSource(p.name,[{number:1,text:p.text}],"sample")));
}
export function sampleOutput(sources: Source[], selectedIds: string[]): ModelOutput {
  const selected = sources.filter(s => selectedIds.includes(s.id));
  const general = selected.find(s => s.name === SAMPLE_POLICIES[0].name);
  const premium = selected.find(s => s.name === SAMPLE_POLICIES[1].name);
  const security = selected.find(s => s.name === SAMPLE_POLICIES[2].name);
  const conflict = selected.find(s => s.name === SAMPLE_POLICIES[3].name);
  const segments = segmentAnswer(SAMPLE_ANSWER);
  const claims = segments.map((s,i) => ({id:`c${i+1}`,proposition:s.text,segmentId:s.id,answerQuote:s.text}));
  const cite = (source: Source | undefined, index: number, relation: "supports" | "contradicts" = "supports") => source ? [{blockId:source.blocks[index].id,quote:source.blocks[index].text,relation}] : [];
  const findings: RawFinding[] = claims.map(c => ({...c,verdict:"insufficient",issues:["unsupported_assertion"],explanation:"The selected policy packet does not establish or contradict this claim.",strength:"none",evidence:[]}));
  if (general) findings[0] = {...findings[0],verdict:"supported",issues:[],explanation:"The general policy establishes a 14-day window and requires an unopened item with a receipt.",strength:"direct",evidence:[...cite(general,1),...cite(general,2)]};
  if (premium && conflict) findings[1] = {...findings[1],verdict:"ambiguous",issues:[],explanation:"Two applicable premium policies specify different return windows, 30 and 21 days. Neither establishes precedence over the other.",strength:"conflicting",evidence:[...cite(premium,1),...cite(conflict,1,"contradicts"),...cite(premium,2)]};
  else if (premium) findings[1] = {...findings[1],verdict:"supported",issues:[],explanation:"The premium exception explicitly overrides the general window with 30 days, while retaining the item and receipt conditions.",strength:"direct",evidence:[...cite(premium,1),...cite(premium,2)]};
  else if (conflict || general) findings[1] = {...findings[1],verdict:"contradicted",issues:["factual_mismatch"],explanation:conflict ? "The remaining premium policy specifies 21 days, not 30 days." : "With the premium exception excluded, the remaining explicitly universal policy specifies 14 days for all membership tiers.",strength:"direct",evidence:cite(conflict ?? general,1,"contradicts")};
  if (premium) findings[2] = {...findings[2],verdict:"supported",issues:[],explanation:"The premium policy directly grants free return shipping.",strength:"direct",evidence:cite(premium,3)};
  const itemPolicy = general ?? premium ?? conflict;
  if (itemPolicy) findings[3] = {...findings[3],verdict:"contradicted",issues:["missing_condition","reasoning_inconsistency"],explanation:"A receipt alone is not enough. The policy also requires the item to be unopened.",strength:"direct",evidence:cite(itemPolicy,2,"contradicts")};
  findings[4].explanation = "None of the supplied policies states a refund processing time. The 48-hour promise is unverified, rather than established as false.";
  if (security) findings[5] = {...findings[5],verdict:"contradicted",issues:["policy_risk"],explanation:"The security policy expressly prohibits requesting or sending a CVV to support.",strength:"direct",evidence:cite(security,1,"contradicts")};
  findings.forEach(f=>{if(f.verdict==="insufficient")f.uncertainty={reason:"missing_policy",question:f.id==="c5"?"Does an applicable policy specify refund-processing time? Add it if available, or remove the 48-hour promise.":"Is there an applicable policy that establishes this statement? Add it if available, or remove the unsupported promise."};});
  if(premium&&conflict)findings[1].uncertainty={reason:"conflicting_policies",question:"Which premium return policy applies, or explicitly supersedes the other? Both documents currently claim the same scope and effective period."};
  if(itemPolicy)findings[3].suggestedCorrection="Returns require an unopened item and a valid purchase receipt.";
  findings[4].suggestedCorrection="The supplied policies do not specify how long refund processing takes.";
  if(security)findings[5].suggestedCorrection="Customers must not send their CVV to support to process a refund.";
  const rules:RawPolicyRule[]=[];
  const references=(source:Source,indexes:number[])=>indexes.map(index=>({blockId:source.blocks[index].id,quote:source.blocks[index].text}));
  if(general)rules.push({id:"r1",claimIds:["c1","c2","c4"],appliesTo:"All membership tiers",action:"Return an item",timeLimit:"14 days from purchase",conditions:"Unopened item and valid purchase receipt",exceptions:"An applicable exception may explicitly override the return window",scope:"Returns under the general refund policy",precedence:"Applies unless an explicit applicable exception overrides the window",references:references(general,[1,2])});
  if(premium){rules.push({id:"r2",claimIds:["c2","c4"],appliesTo:"Premium members only",action:"Return an item",timeLimit:"30 days from purchase",conditions:"Unopened item and valid purchase receipt",exceptions:"",scope:"Premium-member returns",precedence:"Explicitly overrides the general 14-day window for premium members",references:references(premium,[1,2])});rules.push({id:"r3",claimIds:["c3"],appliesTo:"Premium members",action:"Receive free return shipping",timeLimit:"",conditions:"",exceptions:"",scope:"Return shipping",precedence:"",references:references(premium,[3])});}
  if(security)rules.push({id:"r4",claimIds:["c6"],appliesTo:"Support staff and customers",action:"Never request or send a CVV to support",timeLimit:"",conditions:"",exceptions:"",scope:"Refund processing",precedence:"",references:references(security,[1,2])});
  if(conflict)rules.push({id:"r5",claimIds:["c2","c4"],appliesTo:"Premium members only",action:"Return an item",timeLimit:"21 days from purchase",conditions:"Unopened item and valid purchase receipt",exceptions:"",scope:"Same scope and effective period as the other premium exception",precedence:"Overrides the general window; no precedence over the other premium document is established",references:references(conflict,[1,2])});
  return {findings,rules,nonfactualSegmentIds:[],tooManyClaims:false};
}
export function sampleReport(sources: Source[], selectedIds = sources.map(s => s.id), compare = false) {
  const initial = sampleOutput(sources,sources.map(s => s.id));
  const request: AuditRequest = {mode:compare ? "compare" : "audit",answer:SAMPLE_ANSWER,context:SAMPLE_CONTEXT,sources,selectedSourceIds:selectedIds,claims:initial.findings};
  const output = selectedIds.length ? sampleOutput(sources,selectedIds) : noEvidenceOutput(initial.findings);
  const report = validateOutput(output,request,sources,{origin:"sample",model:"Authored sample · no AI call",elapsedMs:0});
  if (!compare) report.baselineToken = "sample-only";
  return report;
}
export async function isUnchangedSample(answer: string, context: string, sources: Source[]) {
  if (answer !== SAMPLE_ANSWER || context !== SAMPLE_CONTEXT) return false;
  const expected = await sampleSources(sources.length === 4);
  return expected.length === sources.length && sources.every((s,i) => s.id === expected[i].id && s.name === expected[i].name && s.pages[0].text === expected[i].pages[0].text);
}
