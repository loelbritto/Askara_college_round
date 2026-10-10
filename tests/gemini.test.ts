import { beforeEach, describe, expect, it, vi } from "vitest";
const {create}=vi.hoisted(()=>({create:vi.fn()}));
vi.mock("@google/genai",()=>({GoogleGenAI:class {interactions={create};}}));
import { callGemini } from "../src/lib/server/gemini";
import { sampleOutput, sampleSources, SAMPLE_ANSWER, SAMPLE_CONTEXT } from "../src/lib/sample";
beforeEach(()=>{vi.stubEnv("GEMINI_API_KEY","fake-test-key");vi.stubEnv("FREE_TIER_CONFIRMED","true");create.mockReset();});
async function inputs(){const sources=await sampleSources();return {sources,request:{mode:"audit" as const,answer:SAMPLE_ANSWER,context:SAMPLE_CONTEXT,sources,selectedSourceIds:sources.map(s=>s.id)}};}
describe("provider boundary",()=>{
  it("uses one stateless structured request, disables retries and exposes numeric usage only",async()=>{const {sources,request}=await inputs();create.mockResolvedValue({status:"completed",output_text:JSON.stringify(sampleOutput(sources,request.selectedSourceIds)),usage:{total_tokens:120,metadata:"ignored"}});const result=await callGemini(request,sources);expect(create).toHaveBeenCalledTimes(1);expect(create.mock.calls[0][0]).toMatchObject({store:false,stream:false,response_format:{type:"text",mime_type:"application/json"}});expect(create.mock.calls[0][1].maxRetries).toBe(0);expect(create.mock.calls[0][0].tools).toBeUndefined();expect(result.usage).toEqual({total_tokens:120});});
  it.each([[429,"QUOTA"],[403,"MODEL_UNAVAILABLE"],[404,"MODEL_UNAVAILABLE"],[503,"MODEL_UNAVAILABLE"]])("maps provider %s without leaking payloads",async(status,code)=>{const {sources,request}=await inputs();create.mockRejectedValue({status,message:"secret payload"});await expect(callGemini(request,sources)).rejects.toMatchObject({code});expect(create).toHaveBeenCalledTimes(1);});
  it("fails closed on invalid output",async()=>{const {sources,request}=await inputs();create.mockResolvedValue({status:"completed",output_text:'{"findings":[]}'});await expect(callGemini(request,sources)).rejects.toMatchObject({code:"INVALID_OUTPUT"});});
  it("does not convert model failure to an unsupported verdict",async()=>{const {sources,request}=await inputs();create.mockResolvedValue({status:"failed",output_text:""});await expect(callGemini(request,sources)).rejects.toMatchObject({code:"BLOCKED_RESPONSE"});});
  it("reports timeouts separately and never retries them",async()=>{const {sources,request}=await inputs();const error=new Error("timed out");error.name="TimeoutError";create.mockRejectedValue(error);await expect(callGemini(request,sources)).rejects.toMatchObject({code:"TIMEOUT"});expect(create).toHaveBeenCalledTimes(1);});
});
