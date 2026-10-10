import { AutoModelForSequenceClassification, AutoTokenizer, env } from "@huggingface/transformers";
import { LOCAL_MODELS, relationFromLogits, type EvidenceExcerpt, type ModelVote } from "../lib/screening/local-models";

env.allowLocalModels=false;
env.useBrowserCache=true;
env.useWasmCache=false;
env.backends.onnx.wasm!.numThreads=1;
env.backends.onnx.wasm!.proxy=false;
env.backends.onnx.wasm!.wasmPaths=`${self.location.origin}/models-runtime/`;
let running=false;
self.onmessage=async(event:MessageEvent<{claim:string;excerpts:EvidenceExcerpt[]}>)=>{
  if(running)return;
  const {claim,excerpts}=event.data;
  if(typeof claim!=="string" || claim.length>800 || !Array.isArray(excerpts) || !excerpts.length || excerpts.length>3 || excerpts.some(e=>!e||typeof e.text!=="string"||!e.text.trim()||e.text.length>3000)){
    self.postMessage({type:"done",votes:[],failures:["The selected passages could not be evaluated. Use up to three nonempty, short passages."]});return;
  }
  running=true;
  const votes:ModelVote[]=[],failures:string[]=[];
  try {
    for(const spec of LOCAL_MODELS){
      let model:Awaited<ReturnType<typeof AutoModelForSequenceClassification.from_pretrained>>|undefined;
      try {
        self.postMessage({type:"status",message:`Loading ${spec.name}…`});
        const options={revision:spec.revision,progress_callback:(p:{status:string;progress?:number;file?:string})=>{
          if(p.status==="progress")self.postMessage({type:"status",message:`Downloading ${spec.name}: ${Math.round(p.progress??0)}% (${p.file?.split("/").pop()??"model"})`});
        }};
        const tokenizer=await AutoTokenizer.from_pretrained(spec.id,options);
        model=await AutoModelForSequenceClassification.from_pretrained(spec.id,{...options,dtype:"q8",device:"wasm"});
        for(const excerpt of excerpts){
          self.postMessage({type:"status",message:`${spec.name}: comparing passage ${excerpts.indexOf(excerpt)+1} of ${excerpts.length}…`});
          const inputs=tokenizer(excerpt.text,{text_pair:claim,truncation:false,padding:false});
          if(inputs.input_ids.dims.at(-1)!>512){failures.push(`${spec.name}: ${excerpt.sourceId} exceeded the 512-token limit and was not evaluated.`);continue;}
          const started=performance.now(),output=await model(inputs);
          const relation=relationFromLogits(Array.from(output.logits.data as Float32Array),(model.config as unknown as {id2label:Record<string,string>}).id2label);
          const vote:ModelVote={sourceId:excerpt.sourceId,modelId:spec.id,modelRevision:spec.revision,...relation,elapsedMs:Math.round(performance.now()-started)};
          votes.push(vote);self.postMessage({type:"vote",vote});
        }
      }catch{failures.push(`${spec.name} could not run. Check your network or browser memory, then retry. No verdict was substituted.`);}
      finally {await model?.dispose();}
    }
    self.postMessage({type:"done",votes,failures});
  }catch{self.postMessage({type:"done",votes,failures:[...failures,"Local screening stopped unexpectedly. Treat this run as incomplete."]});}
  finally{running=false;}
};
