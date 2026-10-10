import { execFile } from "node:child_process";
import { describe, expect, it } from "vitest";

function run(args:string[],configured:boolean,free=true) {
  const code=`globalThis.fetch=async()=>{process.stderr.write('NETWORK_ATTEMPT');throw new Error('NETWORK_ATTEMPT');};process.argv=['node','verify-supabase',...${JSON.stringify(args)}];await import('./scripts/verify-supabase.ts');`;
  const env={...process.env,SUPABASE_URL:configured?"https://synthetic.invalid":"",SUPABASE_PUBLISHABLE_KEY:configured?"sb_publishable_synthetic":"",SUPABASE_SECRET_KEY:configured?"sb_secret_synthetic":"",SUPABASE_FREE_TIER_CONFIRMED:String(free),SUPABASE_TEST_A_EMAIL:configured?"a@example.invalid":"",SUPABASE_TEST_A_PASSWORD:configured?"private-password-a":"",SUPABASE_TEST_B_EMAIL:configured?"b@example.invalid":"",SUPABASE_TEST_B_PASSWORD:configured?"private-password-b":""};
  return new Promise<{code:number|string;stdout:string;stderr:string}>(resolve=>execFile(process.execPath,["--import","tsx","--input-type=module","-e",code],{env,timeout:10000},(error,stdout,stderr)=>resolve({code:error?.code??0,stdout,stderr})));
}

describe("live integration verifier preflight",()=>{
  it("never contacts the provider without explicit live opt-in, even with complete credentials",async()=>{
    const result=await run([],true);
    expect(result.code).toBe(0);expect(result.stderr).not.toContain("NETWORK_ATTEMPT");
    expect(JSON.parse(result.stdout)).toMatchObject({status:"dry-run",missing:[],networkRequests:0});
    expect(result.stdout).not.toMatch(/private-password|sb_secret_|a@example|b@example/);
  });
  it("rejects live execution before network access when project or test users are missing",async()=>{
    const result=await run(["--live"],false);
    expect(result.code).toBe(2);expect(result.stderr).not.toContain("NETWORK_ATTEMPT");
    expect(JSON.parse(result.stdout)).toMatchObject({status:"blocked",networkRequests:0});
    expect(JSON.parse(result.stdout).missing).toHaveLength(3);
  });
  it("rejects live execution without explicit Free-tier confirmation",async()=>{
    const result=await run(["--live"],true,false);
    expect(result.code).toBe(2);expect(result.stderr).not.toContain("NETWORK_ATTEMPT");
    expect(JSON.parse(result.stdout)).toMatchObject({status:"blocked",networkRequests:0});
  });
});
