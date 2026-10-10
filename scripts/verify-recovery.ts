import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { COOKIE_NAME, issueSession, signBaseline, verifySession } from "../src/lib/server/security";
import type { AuditRequest } from "../src/lib/contracts";
import { createSource } from "../src/lib/canonical";

// Exercise real compiled HTTP handlers using synthetic sessions and no provider access.
// Nothing is written to .env.local and no real account, API key or document is used.
const reservation = createServer();
await new Promise<void>((resolve,reject) => { reservation.once("error",reject); reservation.listen(0,"127.0.0.1",resolve); });
const port = (reservation.address() as {port:number}).port;
await new Promise<void>((resolve,reject) => reservation.close(error => error ? reject(error) : resolve()));
const origin = `http://127.0.0.1:${port}`;
const initialSecret = randomBytes(32).toString("hex");
const oldParentSecret = process.env.SESSION_SECRET;
process.env.SESSION_SECRET = initialSecret;
const token = issueSession();
const session = verifySession(token)!;
const source = await createSource("Synthetic policy",[{number:1,text:"Receipts are required."}]);
const input: AuditRequest = {
  mode:"compare",answer:"Receipts are required.",context:"",
  sources:[source],
  selectedSourceIds:[],claims:[{id:"c1",proposition:"Receipts are required.",segmentId:"s1",answerQuote:"Receipts are required."}],
};
input.baselineToken = signBaseline(input,session);
const checks: {name:string;status:number;code?:string}[] = [];
const traces: Record<string,unknown>[] = [];
const responseIds = new Set<string>();

async function start(enabled:boolean,secret:string) {
  let pending = "";
  const child = spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{
    cwd:process.cwd(),windowsHide:true,stdio:["ignore","pipe","pipe"],
    env:{...process.env,NODE_ENV:"production",APP_ORIGIN:origin,AUTH_MODE:"pilot",SESSION_SECRET:secret,
      PILOT_ACCESS_CODE:"synthetic-recovery-only",GEMINI_API_KEY:"",FREE_TIER_CONFIRMED:"false",
      SUPABASE_URL:"",SUPABASE_PUBLISHABLE_KEY:"",SUPABASE_SECRET_KEY:"",SUPABASE_FREE_TIER_CONFIRMED:"false",
      AUDITS_ENABLED:String(enabled),NEXT_TELEMETRY_DISABLED:"1"},
  });
  const exited = new Promise<void>(resolve => child.once("exit",() => resolve()));
  const stop = async () => { if(child.exitCode === null && child.signalCode === null)child.kill(); await exited; };
  try {
    await new Promise<void>((resolve,reject) => {
      const timeout = setTimeout(() => reject(new Error("Recovery server did not become ready.")),20000);
      const rejectStartup = () => { clearTimeout(timeout); reject(new Error("Recovery server failed to start. Build first and retry.")); };
      child.once("error",rejectStartup);
      child.once("exit",rejectStartup);
      const read = (chunk:Buffer) => {
        const text = chunk.toString();
        pending += text;
        if(text.includes("Ready in")) { clearTimeout(timeout); resolve(); }
        const lines = pending.split(/\r?\n/); pending = lines.pop() ?? "";
        for(const line of lines) {
          if(!line.startsWith("{"))continue;
          try { const entry = JSON.parse(line); if(["request_completed","request_failed"].includes(entry.event))traces.push(entry); } catch { /* framework output */ }
        }
      };
      child.stdout.on("data",read); child.stderr.on("data",read);
    });
    return stop;
  } catch(error) { await stop(); throw error; }
}

async function check(name:string,path:string,expected:number,body?:unknown,cookie=token,code?:string) {
  const response = await fetch(`${origin}/api/${path}`,{
    method:body === undefined ? "GET" : "POST",redirect:"error",signal:AbortSignal.timeout(10000),
    headers:{origin,"content-type":"application/json",cookie:`${COOKIE_NAME}=${cookie}`,"x-request-id":"untrusted-input"},
    ...(body === undefined ? {} : {body:JSON.stringify(body)}),
  });
  assert.equal(response.status,expected,`${name}: unexpected status`);
  const id = response.headers.get("x-request-id")!;
  assert.match(id,/^[0-9a-f-]{36}$/); assert(!responseIds.has(id)); responseIds.add(id);
  assert.equal(response.headers.get("cache-control"),"no-store");
  const result = await response.json();
  if(code) { assert.equal(result.error.code,code); assert.equal(result.error.requestId,id); }
  checks.push({name,status:response.status,...(code ? {code} : {})});
  return result;
}

try {
  let stop = await start(false,initialSecret);
  try {
    const status = await check("disabled health","health",200);
    assert.equal(status.enabled,false); assert.equal(status.authenticated,true); assert.equal(status.configured,false);
    await check("authenticated audit disabled","audit",503,input,token,"DISABLED");
    await check("disabled audit still rejects anonymous access","audit",401,input,"invalid","UNAUTHORIZED");
  } finally { await stop(); }

  stop = await start(true,initialSecret);
  try {
    const status = await check("enabled health after restart","health",200);
    assert.equal(status.enabled,true); assert.equal(status.authenticated,true);
    const report = await check("signed no-evidence comparison recovers","audit",200,input);
    assert.equal(report.findings.length,1); assert.equal(report.findings[0].verdict,"insufficient");
    assert.equal(report.model,"No model call — no evidence selected");
    await check("missing provider configuration fails closed","audit",503,{...input,mode:"audit",selectedSourceIds:[source.id]},token,"NOT_CONFIGURED");
  } finally { await stop(); }

  const rotatedSecret = randomBytes(32).toString("hex");
  process.env.SESSION_SECRET = rotatedSecret;
  const newToken = issueSession();
  stop = await start(true,rotatedSecret);
  try {
    await check("secret rotation invalidates previous session","audit",401,input,token,"UNAUTHORIZED");
    await check("previous baseline cannot enter new session","audit",409,input,newToken,"STALE_BASELINE");
  } finally { await stop(); }

  assert.equal(traces.length,responseIds.size,"Each response must have exactly one trace.");
  assert.deepEqual(new Set(traces.map(trace => trace.requestId)),responseIds);
  const permitted = new Set(["event","requestId","operation","status","elapsedMs","code","mode","complete","usage"]);
  for(const trace of traces)assert(Object.keys(trace).every(key => permitted.has(key)));
  const logged = JSON.stringify(traces);
  for(const privateValue of [token,newToken,initialSecret,rotatedSecret,input.answer,"Synthetic policy","untrusted-input"])assert(!logged.includes(privateValue));
  const evidence = {verifiedAt:new Date().toISOString(),scope:"Local compiled production HTTP server; synthetic pilot sessions; no model or cloud calls",checks,traceCount:traces.length,tracePrivacy:"Allowed fields only; no synthetic credentials, source name or answer in captured application traces",limitations:["Not a hosted deployment rollback","Not Supabase revocation or outage recovery","No live model quality or provider recovery measured"]};
  await mkdir("artifacts",{recursive:true});
  await writeFile("artifacts/verification-recovery.json",JSON.stringify(evidence,null,2)+"\n");
  console.log(JSON.stringify(evidence,null,2));
} finally {
  if(oldParentSecret === undefined)delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = oldParentSecret;
}
