import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { AuditError } from "../src/lib/contracts";
import { errorResponse, requestTrace } from "../src/lib/server/response";
import { GET as health } from "../src/app/api/health/route";
import { POST as audit } from "../src/app/api/audit/route";
import { POST as login, DELETE as logout } from "../src/app/api/session/route";
import { POST as workspaces } from "../src/app/api/workspaces/route";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("privacy-preserving request traces", () => {
  it("whitelists finite nonnegative token counts and emits only one completion", () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const trace = requestTrace("audit");
    const response = NextResponse.json({answer:"private answer"});
    trace.finish(response, {mode:"audit",complete:false,usage:{total_tokens:30,total_input_tokens:20,total_output_tokens:10,total_thought_tokens:NaN,total_cached_tokens:-1,"private document title":42}});
    trace.finish(response);
    expect(log).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(log.mock.calls[0][0]);
    expect(entry).toEqual({event:"request_completed",requestId:trace.requestId,operation:"audit",status:200,elapsedMs:expect.any(Number),mode:"audit",complete:false,usage:{total_tokens:30,total_input_tokens:20,total_output_tokens:10}});
    expect(JSON.stringify(entry)).not.toContain("private");
    expect(response.headers.get("x-request-id")).toBe(trace.requestId);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("links an error body, response header and log without exposing exception details", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const trace = requestTrace("workspaces");
    const response = errorResponse(new Error("password and document contents"),trace);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({error:{code:"INTERNAL",requestId:trace.requestId}});
    expect(response.headers.get("x-request-id")).toBe(trace.requestId);
    const entry = JSON.parse(log.mock.calls[0][0]);
    expect(entry).toEqual({event:"request_failed",requestId:trace.requestId,operation:"workspaces",status:500,elapsedMs:expect.any(Number),code:"INTERNAL"});
    expect(JSON.stringify(entry)).not.toMatch(/password|document contents|stack/);
    expect(errorResponse(new AuditError("QUOTA","Wait.",429),requestTrace("audit")).headers.get("retry-after")).toBe("60");
  });

  it("does not turn a successful write into a retry when a logging sink fails", () => {
    vi.spyOn(console, "info").mockImplementation(() => { throw new Error("sink unavailable"); });
    const response = requestTrace("workspaces").finish(NextResponse.json({version:2}));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("traces every handled API route and ignores client-supplied identity and request IDs", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("AUTH_MODE","pilot");
    vi.stubEnv("APP_ORIGIN","https://example.test");
    vi.stubEnv("GEMINI_API_KEY","");
    const ids = new Set<string>();
    for (const [handler,method,path] of [
      [health,"GET","health"], [audit,"POST","audit"], [login,"POST","session"],
      [logout,"DELETE","session"], [workspaces,"POST","workspaces"],
    ] as const) {
      const response = await handler(new NextRequest(`https://example.test/api/${path}?private=secret`,{
        method,headers:{origin:"https://example.test","x-request-id":"private-user-supplied-id",authorization:"Bearer private-token"},
      }));
      const id = response.headers.get("x-request-id")!;
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(ids.has(id)).toBe(false);
      ids.add(id);
      if(response.status >= 400)expect((await response.json()).error.requestId).toBe(id);
    }
    const logs = [...info.mock.calls,...warn.mock.calls].map(call => JSON.parse(call[0]));
    expect(logs).toHaveLength(5);
    expect(new Set(logs.map(log => log.requestId))).toEqual(ids);
    expect(JSON.stringify(logs)).not.toMatch(/private|secret|Bearer/);
  });
});
