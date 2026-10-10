export const LOCAL_MODELS = [
  {id:"Xenova/nli-deberta-v3-xsmall",name:"DeBERTa v3",revision:"2a4f614a701367a02d51389039afc998faeda637",upstream:"cross-encoder/nli-deberta-v3-xsmall"},
  {id:"onnx-community/nli-roberta-base-ONNX",name:"RoBERTa",revision:"d0af16bf61a3740cc7744f16bc0b71ef9f9f3e47",upstream:"cross-encoder/nli-roberta-base"},
] as const;
export type Relation = "entailment"|"contradiction"|"neutral";
export type ModelVote = {sourceId:string;modelId:string;modelRevision:string;label:Relation;scores:Record<Relation,number>;elapsedMs:number};
export type EvidenceExcerpt = {sourceId:string;text:string;shortened:boolean};
export function excerptForModel(sourceId:string,text:string):EvidenceExcerpt {
  const clean=text.trim(),words=clean.split(/\s+/);
  const excerpt=words.slice(0,160).join(" ");
  return {sourceId,text:excerpt.slice(0,3000),shortened:words.length>160||excerpt.length>3000};
}
export function relationFromLogits(logits:number[],labels:Record<string,string>) {
  if(logits.length!==3 || logits.some(v=>!Number.isFinite(v))) throw new Error("Invalid model scores");
  const normalized=["0","1","2"].map(key=>labels[key]?.toLowerCase());
  if(Object.keys(labels).length!==3||!["entailment","neutral","contradiction"].every(l=>normalized.includes(l))) throw new Error("Unsupported model label mapping");
  const exp=logits.map(v=>Math.exp(v-Math.max(...logits))),sum=exp.reduce((a,b)=>a+b,0);
  const scores=Object.fromEntries(logits.map((_,i)=>[labels[String(i)].toLowerCase(),exp[i]/sum])) as Record<Relation,number>;
  const label=(Object.keys(scores) as Relation[]).reduce((a,b)=>scores[a]>=scores[b]?a:b);
  return {label,scores};
}
export function voteSummary(votes:ModelVote[]):"not-run"|"incomplete"|"disagreement"|"supports-passage"|"conflicts-passage"|"unresolved" {
  if(!votes.length)return "not-run";
  if(votes.length!==2||new Set(votes.map(v=>v.sourceId)).size!==1||new Set(votes.map(v=>v.modelId)).size!==2)return "incomplete";
  for(const vote of votes){
    const scores=[vote.scores?.entailment,vote.scores?.contradiction,vote.scores?.neutral];
    if(scores.some(v=>typeof v!=="number"||!Number.isFinite(v)||v<0||v>1)||Math.abs(scores.reduce((a,b)=>a+b,0)-1)>0.001||!Number.isFinite(vote.scores[vote.label])||vote.scores[vote.label]<Math.max(...scores))return "incomplete";
  }
  const valid=LOCAL_MODELS.map(m=>votes.find(v=>v.modelId===m.id && v.modelRevision===m.revision));
  if(valid.some(v=>!v))return "incomplete";
  const [a,b]=valid as ModelVote[];
  if(a.label!==b.label)return "disagreement";
  if(a.label==="neutral")return "unresolved";
  // Conservative UI abstention rule, not a calibrated probability of correctness.
  if(a.scores[a.label]<0.8 || b.scores[b.label]<0.8)return "unresolved";
  return a.label==="entailment"?"supports-passage":"conflicts-passage";
}
