import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { accountSession, auditLimit, ACCOUNT_COOKIE, resolveSession, sharedLimit, signInAccount, signOutAccount } from "../src/lib/server/accounts";
import { POST as login, DELETE as logout } from "../src/app/api/session/route";
import { GET as health } from "../src/app/api/health/route";
import { issueSession, configStatus } from "../src/lib/server/security";

const token="eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature";
const identity={sid:"11111111-1111-4111-8111-111111111111",userId:"22222222-2222-4222-8222-222222222222",exp:Math.floor(Date.now()/1000)+3600};
const fetcher=vi.fn<typeof fetch>();
beforeEach(()=>{
  vi.stubEnv("AUTH_MODE","supabase");vi.stubEnv("SUPABASE_URL","https://accounts.example.test");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY","sb_publishable_test");vi.stubEnv("SUPABASE_SECRET_KEY","sb_secret_test");
  vi.stubEnv("SUPABASE_FREE_TIER_CONFIRMED","true");vi.stubEnv("SESSION_SECRET","test-session-secret-at-least-32-characters");
  vi.stubEnv("APP_ORIGIN","https://example.test");vi.stubEnv("FREE_TIER_CONFIRMED","true");vi.stubEnv("GEMINI_API_KEY","test");vi.stubEnv("PILOT_ACCESS_CODE","");
  fetcher.mockReset();vi.stubGlobal("fetch",fetcher);
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
function request(method="POST",body?:unknown,query="") {return new NextRequest(`https://example.test/api/session${query}`,{method,headers:{origin:"https://example.test","Content-Type":"application/json",cookie:`${ACCOUNT_COOKIE}=${token}`},...(body?{body:JSON.stringify(body)}:{})});}
function reply(data:unknown){fetcher.mockResolvedValueOnce(Response.json(data));}

describe("managed accounts fail closed and keep tokens on the server",()=>{
  it("requires the selected account configuration, not a pilot code",()=>{expect(configStatus().configured).toBe(true);vi.stubEnv("SUPABASE_FREE_TIER_CONFIRMED","false");expect(configStatus().configured).toBe(false);});
  it("never accepts a pilot token or a decoded JWT instead of a checked account session",async()=>{
    expect(await resolveSession(issueSession(),undefined)).toBe(null);expect(fetcher).not.toHaveBeenCalled();
    reply(null);expect(await accountSession(token)).toBe(null);expect(fetcher).toHaveBeenCalledTimes(1);
    reply(identity);expect(await accountSession(token)).toMatchObject({...identity,accessToken:token});
    const [url,init]=fetcher.mock.calls[1];expect(url).toContain("so_current_session");expect(init?.headers).toMatchObject({apikey:"sb_publishable_test",Authorization:`Bearer ${token}`});
  });
  it("rejects expired or malformed identities and does not cache a revoked session",async()=>{
    reply(identity);expect(await accountSession(token)).not.toBe(null);
    reply(null);expect(await accountSession(token)).toBe(null);
    reply({...identity,exp:1});expect(await accountSession(token)).toBe(null);
    reply({userId:identity.userId});await expect(accountSession(token)).rejects.toMatchObject({status:503});
  });
  it("does not fall back to pilot auth on an invalid mode or an outage",async()=>{
    fetcher.mockRejectedValueOnce(new Error("private upstream details"));await expect(resolveSession(issueSession(),token)).rejects.toMatchObject({code:"ACCOUNT_UNAVAILABLE"});
    vi.stubEnv("AUTH_MODE","supabse");await expect(resolveSession(issueSession(),undefined)).rejects.toMatchObject({code:"NOT_CONFIGURED"});
  });
  it("uses server-only atomic limits for both user and project without raw identities",async()=>{
    reply(true);reply(true);await auditLimit({...identity,accessToken:token});
    expect(fetcher).toHaveBeenCalledTimes(2);
    for(const [,init] of fetcher.mock.calls){expect(init?.headers).toMatchObject({apikey:"sb_secret_test"});expect(init?.headers).not.toHaveProperty("Authorization");expect(String(init?.body)).not.toContain(identity.userId);expect(JSON.parse(String(init?.body)).p_key).toMatch(/^[a-f0-9]{64}$/);}
    reply(false);await expect(sharedLimit("audit:user:test",3)).rejects.toMatchObject({status:429});
    reply({ok:true});await expect(sharedLimit("audit:user:test",3)).rejects.toMatchObject({status:503});
  });
  it("signs in with HttpOnly cookies, clears the pilot cookie and never returns tokens",async()=>{
    reply(true);reply(true);reply({access_token:token,refresh_token:"never-store-me"});reply(identity);
    const result=await login(request("POST",{email:"reader@example.test",password:"not-a-real-password"}));
    expect(result.status).toBe(200);expect(await result.json()).toEqual({authenticated:true,authMode:"supabase"});
    expect(result.headers.get("set-cookie")).toContain("HttpOnly");expect(result.headers.get("set-cookie")).toContain("SameSite=strict");expect(result.headers.get("set-cookie")).not.toContain("never-store-me");
    expect(fetcher.mock.calls[2][1]?.headers).toMatchObject({apikey:"sb_publishable_test"});
  });
  it("distinguishes invalid credentials from outages without leaking upstream content",async()=>{
    reply(true);reply(true);fetcher.mockResolvedValueOnce(Response.json({message:"email exists; secret debug info"},{status:400}));
    await expect(signInAccount("reader@example.test","wrong")).rejects.toMatchObject({status:401,message:"Sign-in failed. Check your email and password."});
    reply(true);reply(true);fetcher.mockResolvedValueOnce(new Response("private details",{status:503}));
    await expect(signInAccount("reader@example.test","wrong")).rejects.toMatchObject({status:503,code:"ACCOUNT_UNAVAILABLE"});
  });
  it("revokes before clearing cookies and preserves local state on a failed revocation",async()=>{
    reply(identity);fetcher.mockResolvedValueOnce(new Response(null,{status:204}));
    const response=await logout(request("DELETE",undefined,"?all=true"));expect(response.status).toBe(200);expect(fetcher.mock.calls[1][0]).toContain("scope=global");expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    reply(identity);fetcher.mockRejectedValueOnce(new Error("offline"));
    const failed=await logout(request("DELETE"));expect(failed.status).toBe(503);expect(failed.headers.get("set-cookie")).toBe(null);
  });
  it("clears already revoked sessions without an unnecessary logout request",async()=>{reply(null);await signOutAccount(token);expect(fetcher).toHaveBeenCalledTimes(1);});
  it("never claims all-device revocation from an expired or absent session",async()=>{reply(null);await expect(signOutAccount(token,true)).rejects.toMatchObject({status:401});await expect(signOutAccount(undefined,true)).rejects.toMatchObject({status:401});expect(fetcher).toHaveBeenCalledTimes(1);});
  it("health does not expose identity, tokens, or backend configuration secrets",async()=>{
    reply(identity);const response=await health(request("GET"));const body=await response.json();expect(body.authenticated).toBe(true);expect(body.authMode).toBe("supabase");expect(JSON.stringify(body)).not.toContain(token);expect(JSON.stringify(body)).not.toContain(identity.userId);
  });
});
