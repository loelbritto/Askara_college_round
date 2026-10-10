import { beforeEach, describe, expect, it, vi } from "vitest";
const {call}=vi.hoisted(()=>({call:vi.fn()}));
vi.mock("../src/lib/server/gemini",()=>({callGemini:call}));
import { POST } from "../src/app/api/audit/route";
import { POST as login, DELETE as logout } from "../src/app/api/session/route";
import { NextRequest } from "next/server";
import { COOKIE_NAME, issueSession } from "../src/lib/server/security";
import { sampleOutput, sampleSources, SAMPLE_ANSWER, SAMPLE_CONTEXT } from "../src/lib/sample";
beforeEach(()=>{vi.stubEnv("SESSION_SECRET","test-signing-secret-with-at-least-32-characters");vi.stubEnv("PILOT_ACCESS_CODE","test-access-code-12345");vi.stubEnv("FREE_TIER_CONFIRMED","true");vi.stubEnv("GEMINI_API_KEY","test-fake-key");vi.stubEnv("APP_ORIGIN","https://example.test");vi.stubEnv("AUDITS_ENABLED","true");call.mockReset();});
function req(body:unknown,token=issueSession(),origin="https://example.test") {return new NextRequest("https://example.test/api/audit",{method:"POST",headers:{origin,"Content-Type":"application/json",cookie:`${COOKIE_NAME}=${token}`},body:JSON.stringify(body)});}
describe("real route access and comparison contract",()=>{
  it("denies anonymous and cross-origin requests before contacting the provider",async()=>{expect((await POST(req({},"invalid"))).status).toBe(401);expect((await POST(req({},issueSession(),"https://evil.test"))).status).toBe(403);expect(call).not.toHaveBeenCalled();});
  it("issues an HttpOnly session for the correct code and deletes it",async()=>{const response=await login(req({code:"test-access-code-12345"}));expect(response.status).toBe(200);expect(response.headers.get("set-cookie")).toContain("HttpOnly");expect(response.headers.get("set-cookie")).toContain("SameSite=strict");const out=await logout(req({}));expect(out.headers.get("set-cookie")).toContain("Max-Age=0");});
  it("honors the operator off switch",async()=>{vi.stubEnv("AUDITS_ENABLED","false");expect((await POST(req({}))).status).toBe(503);expect(call).not.toHaveBeenCalled();});
  it("returns a signed baseline, accepts source removal and rejects a changed claim",async()=>{
    const sources=await sampleSources();const selectedSourceIds=sources.map(s=>s.id);const body={mode:"audit",answer:SAMPLE_ANSWER,context:SAMPLE_CONTEXT,sources,selectedSourceIds};const token=issueSession();
    call.mockResolvedValue({output:sampleOutput(sources,selectedSourceIds),model:"test-stub",usage:{total_tokens:10}});
    const response=await POST(req(body,token));expect(response.status).toBe(200);const report=await response.json();expect(report.baselineToken).toBeTruthy();
    const claims=report.findings.map(({id,proposition,segmentId,answerQuote}:Record<string,string>)=>({id,proposition,segmentId,answerQuote}));
    const compare={...body,mode:"compare",selectedSourceIds:[],claims,baselineToken:report.baselineToken};const result=await POST(req(compare,token));expect(result.status).toBe(200);expect((await result.json()).findings.every((f:{verdict:string})=>f.verdict==="insufficient")).toBe(true);expect(call).toHaveBeenCalledTimes(1);
    compare.claims[0].proposition="Tampered claim";expect((await POST(req(compare,token))).status).toBe(409);
  });
});
