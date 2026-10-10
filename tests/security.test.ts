import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertOrigin, constantEqual, issueSession, readJson, signBaseline, throttle, verifyBaseline, verifySession, configStatus } from "../src/lib/server/security";
import { sampleReport, sampleSources, SAMPLE_ANSWER, SAMPLE_CONTEXT } from "../src/lib/sample";
import { canonicalClaims } from "../src/lib/validate-report";
import type { AuditRequest } from "../src/lib/contracts";
beforeEach(()=>{vi.stubEnv("SESSION_SECRET","test-signing-secret-that-is-at-least-32-characters");vi.stubEnv("APP_ORIGIN","https://example.test");});
describe("session security",()=>{
  it("verifies a signed session and rejects tampering",()=>{const token=issueSession();expect(verifySession(token)?.sid).toBeTruthy();expect(verifySession(`${token}x`)).toBeNull();expect(verifySession("made.up")).toBeNull();});
  it("rejects expired sessions",()=>{const now=Date.now();const token=issueSession(now);expect(verifySession(token,now+8*60*60*1000+1)).toBeNull();});
  it("requires an exact allowed origin",()=>{expect(()=>assertOrigin(new Request("https://example.test/api/audit",{headers:{origin:"https://evil.test"}}))).toThrow();expect(()=>assertOrigin(new Request("https://example.test/api/audit"))).toThrow();expect(()=>assertOrigin(new Request("https://example.test/api/audit",{headers:{origin:"https://example.test"}}))).not.toThrow();});
  it("fails readiness closed without free-tier confirmation",()=>{vi.stubEnv("GEMINI_API_KEY","test-key");vi.stubEnv("PILOT_ACCESS_CODE","a-long-test-code");vi.stubEnv("FREE_TIER_CONFIRMED","false");expect(configStatus().configured).toBe(false);});
  it("checks lengths safely and throttles repeated attempts",()=>{expect(constantEqual("abc","abcd")).toBe(false);const key=crypto.randomUUID();throttle(key,2,100);throttle(key,2,100);expect(()=>throttle(key,2,100)).toThrow("Too many");expect(()=>throttle(key,2,60101)).not.toThrow();});
  it("limits streaming request bodies even without content-length",async()=>{const request=new Request("https://example.test/api",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({a:"x".repeat(100)})});await expect(readJson(request,20)).rejects.toThrow("too large");});
  it("rejects malformed JSON and unsupported content types",async()=>{await expect(readJson(new Request("https://example.test",{method:"POST",headers:{"Content-Type":"application/json"},body:"{"}))).rejects.toThrow("valid JSON");await expect(readJson(new Request("https://example.test",{method:"POST",body:"{}"}))).rejects.toThrow("application/json");});
  it("binds comparisons to original content, claims and session, while allowing evidence selection changes",async()=>{
    const sources=await sampleSources();const report=sampleReport(sources);const session=verifySession(issueSession())!;
    const request:AuditRequest={mode:"compare",answer:SAMPLE_ANSWER,context:SAMPLE_CONTEXT,sources,selectedSourceIds:sources.map(s=>s.id),claims:canonicalClaims(report.findings)};
    request.baselineToken=signBaseline(request,session);expect(verifyBaseline({...request,selectedSourceIds:[sources[0].id]},session)).toBe(true);
    expect(verifyBaseline({...request,answer:"Changed"},session)).toBe(false);expect(verifyBaseline(request,{...session,sid:"another-session"})).toBe(false);
    expect(verifyBaseline({...request,claims:request.claims!.map((c,i)=>i===0?{...c,proposition:"changed"}:c)},session)).toBe(false);
  });
});
