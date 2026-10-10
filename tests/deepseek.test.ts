import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callDeepSeek } from "../src/lib/server/deepseek";
import { callModel } from "../src/lib/server/model";
import { configStatus } from "../src/lib/server/security";
import { GET } from "../src/app/api/health/route";
import { NextRequest } from "next/server";
import { sampleOutput, sampleSources, SAMPLE_ANSWER, SAMPLE_CONTEXT } from "../src/lib/sample";
const fetchMock=vi.fn();
beforeEach(()=>{vi.stubGlobal("fetch",fetchMock);fetchMock.mockReset();vi.stubEnv("AI_PROVIDER","deepseek");vi.stubEnv("DEEPSEEK_API_KEY","private-test-key");vi.stubEnv("DEEPSEEK_MODEL","deepseek-flash");vi.stubEnv("GEMINI_API_KEY","");vi.stubEnv("FREE_TIER_CONFIRMED","false");vi.stubEnv("AUTH_MODE","pilot");vi.stubEnv("PILOT_ACCESS_CODE","long-demo-code");vi.stubEnv("SESSION_SECRET","a-test-session-secret-over-32-characters");vi.stubEnv("APP_ORIGIN","https://example.test");});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
async function input(){const sources=await sampleSources();return {sources,request:{mode:"audit" as const,answer:SAMPLE_ANSWER,context:SAMPLE_CONTEXT,sources,selectedSourceIds:sources.map(s=>s.id)}};}
describe("DeepSeek provider boundary",()=>{
  it("distinguishes a gateway web page from invalid model output without exposing either body",async()=>{
    vi.stubEnv("AI_PROVIDER","agentrouter");const {sources,request}=await input();
    fetchMock.mockResolvedValueOnce(new Response("<html>private gateway challenge</html>",{headers:{"content-type":"text/html"}}));
    await expect(callModel(request,sources)).rejects.toMatchObject({code:"MODEL_UNAVAILABLE",message:expect.stringContaining("web page instead of API JSON")});
    fetchMock.mockResolvedValueOnce(new Response("private non-json envelope"));
    await expect(callModel(request,sources)).rejects.toMatchObject({message:expect.stringContaining("API returned a non-JSON response")});
    fetchMock.mockResolvedValueOnce(Response.json({choices:[{finish_reason:"stop",message:{content:"not audit JSON"}}]}));
    await expect(callModel(request,sources)).rejects.toMatchObject({message:expect.stringContaining("model returned invalid audit JSON")});
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("routes only explicitly selected AgentRouter calls using the permitted model and existing key slot",async()=>{
    vi.stubEnv("AI_PROVIDER","agentrouter");vi.stubEnv("AGENTROUTER_API_KEY","");vi.stubEnv("AGENTROUTER_MODEL","");
    const {sources,request}=await input();
    fetchMock.mockResolvedValue(Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify(sampleOutput(sources,request.selectedSourceIds))}}]}));
    expect(configStatus().configured).toBe(true);
    const result=await callModel(request,sources);
    expect(result.model).toBe("deepseek-v4-flash");
    const [url,options]=fetchMock.mock.calls[0];
    expect(url).toBe("https://agentrouter.org/v1/chat/completions");
    expect(options.headers.Authorization).toBe("Bearer private-test-key");
    expect(options.redirect).toBe("error");expect(JSON.parse(options.body).model).toBe("deepseek-v4-flash");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const health=await (await GET(new NextRequest("https://example.test/api/health"))).json();
    expect(health).toMatchObject({provider:"agentrouter",model:"deepseek-v4-flash",configured:true});
    expect(JSON.stringify(health)).not.toContain("private-test-key");
  });
  it("prefers the dedicated AgentRouter key and never falls back after credential rejection",async()=>{
    vi.stubEnv("AI_PROVIDER","agentrouter");vi.stubEnv("AGENTROUTER_API_KEY","dedicated-private-key");
    const {sources,request}=await input();fetchMock.mockResolvedValue(new Response("secret error body",{status:401}));
    await expect(callModel(request,sources)).rejects.toMatchObject({message:expect.stringContaining("AgentRouter rejected authentication or client access (401)")});
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer dedicated-private-key");expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("blocks AgentRouter before network access when no key exists",async()=>{
    vi.stubEnv("AI_PROVIDER","agentrouter");vi.stubEnv("AGENTROUTER_API_KEY","");vi.stubEnv("DEEPSEEK_API_KEY","");
    expect(configStatus().missing).toContain("AGENTROUTER_API_KEY");
    const {sources,request}=await input();await expect(callModel(request,sources)).rejects.toMatchObject({code:"NOT_CONFIGURED"});expect(fetchMock).not.toHaveBeenCalled();
  });
  it("selects DeepSeek without requiring Gemini or a false free-tier declaration",async()=>{expect(configStatus().configured).toBe(true);const {sources,request}=await input();fetchMock.mockResolvedValue(Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify(sampleOutput(sources,request.selectedSourceIds))}}],usage:{total_tokens:100,prompt_tokens:80,completion_tokens:20,private_text:"ignored"}}));const result=await callModel(request,sources);expect(result.model).toBe("deepseek-flash");expect(result.usage).toEqual({total_tokens:100,prompt_tokens:80,completion_tokens:20});expect(fetchMock).toHaveBeenCalledTimes(1);const [url,options]=fetchMock.mock.calls[0];expect(url).toBe("https://api.deepseek.com/chat/completions");expect(options.redirect).toBe("error");const body=JSON.parse(options.body);expect(body).toMatchObject({model:"deepseek-flash",max_tokens:10000,stream:false,thinking:{type:"disabled"},response_format:{type:"json_object"}});expect(body.tools).toBeUndefined();expect(body.messages[0].content).toContain("JSON schema");});
  it.each([[402,"QUOTA"],[429,"QUOTA"],[401,"MODEL_UNAVAILABLE"],[422,"MODEL_UNAVAILABLE"],[503,"MODEL_UNAVAILABLE"]])("handles HTTP %s with no retries or error payload disclosure",async(status,code)=>{const {sources,request}=await input();fetchMock.mockResolvedValue(new Response("private-provider-error",{status}));await expect(callDeepSeek(request,sources)).rejects.toMatchObject({code});expect(fetchMock).toHaveBeenCalledTimes(1);});
  it.each(["length","content_filter","tool_calls"])("rejects incomplete finish reason %s",async(reason)=>{const {sources,request}=await input();fetchMock.mockResolvedValue(Response.json({choices:[{finish_reason:reason,message:{content:"{}"}}]}));await expect(callDeepSeek(request,sources)).rejects.toMatchObject({code:"BLOCKED_RESPONSE"});});
  it("rejects malformed output and oversize responses",async()=>{const {sources,request}=await input();fetchMock.mockResolvedValueOnce(Response.json({choices:[{finish_reason:"stop",message:{content:'{"findings":[]}'}}]}));await expect(callDeepSeek(request,sources)).rejects.toMatchObject({code:"INVALID_OUTPUT"});fetchMock.mockResolvedValueOnce(new Response("x".repeat(1048577)));await expect(callDeepSeek(request,sources)).rejects.toMatchObject({code:"INVALID_OUTPUT"});});
  it("fails closed on missing key or unknown provider and reports only missing names",async()=>{vi.stubEnv("DEEPSEEK_API_KEY","");expect(configStatus().missing).toContain("DEEPSEEK_API_KEY");const response=await GET(new NextRequest("https://example.test/api/health"));const data=await response.json();expect(data).toMatchObject({configured:false,provider:"deepseek",missing:["DEEPSEEK_API_KEY"]});expect(JSON.stringify(data)).not.toContain("a-test-session-secret");const {sources,request}=await input();await expect(callModel(request,sources)).rejects.toMatchObject({code:"NOT_CONFIGURED"});vi.stubEnv("AI_PROVIDER","typo");await expect(callModel(request,sources)).rejects.toMatchObject({code:"NOT_CONFIGURED"});expect(fetchMock).not.toHaveBeenCalled();});
  it("honors cancellation without leaking network errors",async()=>{const {sources,request}=await input();const controller=new AbortController();controller.abort();fetchMock.mockRejectedValue(new Error("private-network-error"));await expect(callDeepSeek(request,sources,controller.signal)).rejects.toMatchObject({code:"TIMEOUT"});expect(fetchMock).toHaveBeenCalledTimes(1);});
});
