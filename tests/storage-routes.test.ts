import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/workspaces/route";
import { ACCOUNT_COOKIE } from "../src/lib/server/accounts";
import { createArchive } from "../src/lib/workspace-archive";

const token="eyJhIjox.eyJpIjox.signature",identity={sid:"11111111-1111-4111-8111-111111111111",userId:"22222222-2222-4222-8222-222222222222",exp:Math.floor(Date.now()/1000)+3600};
const id="33333333-3333-4333-8333-333333333333",fetcher=vi.fn<typeof fetch>();
beforeEach(()=>{vi.stubEnv("AUTH_MODE","supabase");vi.stubEnv("SUPABASE_URL","https://accounts.example.test");vi.stubEnv("SUPABASE_PUBLISHABLE_KEY","sb_publishable_test");vi.stubEnv("SUPABASE_SECRET_KEY","sb_secret_test");vi.stubEnv("SUPABASE_FREE_TIER_CONFIRMED","true");vi.stubEnv("SESSION_SECRET","session-secret-at-least-thirty-two-characters");vi.stubEnv("APP_ORIGIN","https://example.test");fetcher.mockReset();vi.stubGlobal("fetch",fetcher);});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const req=(body:unknown,cookie=token,origin="https://example.test")=>new NextRequest("https://example.test/api/workspaces",{method:"POST",headers:{origin,"Content-Type":"application/json",cookie:`${ACCOUNT_COOKIE}=${cookie}`},body:JSON.stringify(body)});
function access(){fetcher.mockResolvedValueOnce(Response.json(identity)).mockResolvedValueOnce(Response.json(true));}
async function draft(){return createArchive({sources:[],selectedIds:[],answer:"Draft answer",context:"",sampleMode:false,setupStep:2,baseline:null,comparison:null,showComparison:false,history:[],reviews:{},ruleReviews:{}});}
describe("saved-review API boundaries (transport mocked, database policies verified separately)",()=>{
  it("rejects cross-origin, anonymous and pilot-only storage requests",async()=>{expect((await POST(req({action:"list"},token,"https://evil.test"))).status).toBe(403);expect((await POST(req({action:"list"},""))).status).toBe(401);expect(fetcher).not.toHaveBeenCalled();vi.stubEnv("AUTH_MODE","pilot");expect((await POST(req({action:"list"}))).status).toBe(503);});
  it("saves only sanitized archives through the user's token, never the service key",async()=>{
    access();fetcher.mockResolvedValueOnce(Response.json({id,version:1}));const archive=await draft();
    const response=await POST(req({action:"save",title:"My draft",archive:{...archive,baselineToken:"forged",ownerId:"someone-else"}}));expect(response.status).toBe(200);
    const [,options]=fetcher.mock.calls[2];expect(options?.headers).toMatchObject({apikey:"sb_publishable_test",Authorization:`Bearer ${token}`});expect(String(options?.body)).not.toContain("someone-else");expect(String(options?.body)).not.toContain("forged");
  });
  it("rejects corrupt archives before saving and corrupt stored payloads before restoring",async()=>{
    access();expect((await POST(req({action:"save",title:"Test",archive:{}}))).status).toBe(400);expect(fetcher).toHaveBeenCalledTimes(2);
    access();fetcher.mockResolvedValueOnce(Response.json({bad:"payload"}));expect((await POST(req({action:"load",id,version:1}))).status).toBe(422);
  });
  it("preserves conflict, missing-review and deletion failures as errors",async()=>{
    access();fetcher.mockResolvedValueOnce(new Response("SAVE_CONFLICT",{status:409}));const conflict=await POST(req({action:"save",title:"Draft",id,expectedVersion:1,archive:await draft()}));expect(conflict.status).toBe(409);expect((await conflict.json()).error.code).toBe("SAVE_CONFLICT");
    access();fetcher.mockResolvedValueOnce(Response.json(null));expect((await POST(req({action:"load",id,version:1}))).status).toBe(404);
    access();fetcher.mockResolvedValueOnce(Response.json(false));expect((await POST(req({action:"delete",id,expectedVersion:1}))).status).toBe(404);
  });
  it("deletes only the requested version-checked workspace and returns no cached response",async()=>{
    access();fetcher.mockResolvedValueOnce(Response.json(true));const result=await POST(req({action:"delete",id,expectedVersion:2}));expect(result.status).toBe(200);expect(await result.json()).toEqual({deleted:true});expect(result.headers.get("cache-control")).toBe("no-store");expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({p_workspace_id:id,p_expected_version:2});
  });
});
