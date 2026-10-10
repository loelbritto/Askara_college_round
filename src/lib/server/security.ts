import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { AuditError, type AuditRequest, LIMITS } from "../contracts";
import { accountConfiguration, accountMode } from "./account-config";
export const COOKIE_NAME = "second_opinion_session";
const SESSION_SECONDS = 8 * 60 * 60;

export function configStatus() {
  const missing = [
    !process.env.GEMINI_API_KEY && "GEMINI_API_KEY",
    !accountMode() && (!process.env.PILOT_ACCESS_CODE || process.env.PILOT_ACCESS_CODE.length < 12) && "PILOT_ACCESS_CODE (12+ characters)",
    ...(accountMode()?accountConfiguration().missing:[]),
    !!process.env.AUTH_MODE && !["pilot","supabase"].includes(process.env.AUTH_MODE) && "AUTH_MODE (pilot or supabase)",
    (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) && "SESSION_SECRET (32+ characters)",
    process.env.FREE_TIER_CONFIRMED !== "true" && "FREE_TIER_CONFIRMED",
    process.env.NODE_ENV === "production" && !process.env.APP_ORIGIN && "APP_ORIGIN",
  ].filter(Boolean) as string[];
  return {configured: missing.length === 0, missing, enabled: process.env.AUDITS_ENABLED !== "false"};
}
function secret() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new AuditError("NOT_CONFIGURED", "The pilot is not configured yet. The sample workspace is available.", 503);
  return process.env.SESSION_SECRET;
}
export function constantEqual(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left,right);
}
function sign(value: string) { return createHmac("sha256", secret()).update(value).digest("base64url"); }
export function issueSession(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({sid: randomUUID(), exp: Math.floor(now/1000)+SESSION_SECONDS})).toString("base64url");
  return `${payload}.${sign(`session:${payload}`)}`;
}
export function verifySession(token: string | undefined, now = Date.now()): {sid: string; exp: number} | null {
  if (!token || token.length > 500) return null;
  try {
    const [payload, signature, extra] = token.split(".");
    if (extra || !payload || !signature || !constantEqual(signature,sign(`session:${payload}`))) return null;
    const value = JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    if (typeof value.sid !== "string" || typeof value.exp !== "number" || value.exp <= now/1000 || value.exp > now/1000+SESSION_SECONDS+5) return null;
    return value;
  } catch { return null; }
}
export function cookieOptions() { return {httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: SESSION_SECONDS}; }
export function assertOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = process.env.APP_ORIGIN ? [process.env.APP_ORIGIN.replace(/\/$/,"")] : process.env.NODE_ENV !== "production" ? ["http://localhost:3000", "http://127.0.0.1:3000"] : [];
  if (!origin || !allowed.includes(origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new AuditError("FORBIDDEN", "This request must come from the audit workspace.", 403);
}
export async function readJson(request: Request, maxBytes: number = LIMITS.bodyBytes): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new AuditError("INVALID_INPUT", "Send an application/json request.", 415);
  const length = request.headers.get("content-length");
  if (length && Number(length) > maxBytes) throw new AuditError("TOO_LARGE", "The request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AuditError("INVALID_INPUT", "The request body is empty.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new AuditError("TOO_LARGE", "The request is too large.", 413); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof AuditError) throw error;
    throw new AuditError("INVALID_INPUT", "The request body is not valid JSON.");
  } finally { reader.releaseLock(); }
}
function baselinePayload(request: AuditRequest, exp: number, sid: string) {
  return JSON.stringify({sid, exp, answer: request.answer, context: request.context, sources: request.sources.map(s => ({id:s.id,name:s.name,kind:s.kind,pages:s.pages})), claims: request.claims});
}
export function signBaseline(request: AuditRequest, session: {sid:string;exp:number}) {
  return `${session.exp}.${sign(`baseline:${baselinePayload(request,session.exp,session.sid)}`)}`;
}
export function verifyBaseline(request: AuditRequest, session: {sid:string;exp:number}) {
  if (!request.baselineToken) return false;
  const [expires,signature,extra] = request.baselineToken.split(".");
  const exp = Number(expires);
  return !extra && exp === session.exp && exp > Date.now()/1000 && !!signature && constantEqual(signature,sign(`baseline:${baselinePayload(request,exp,session.sid)}`));
}

// Best effort, instance-local abuse mitigation. Provider quotas remain the cost boundary.
const windows = new Map<string,{count:number; until:number}>();
export function throttle(key: string, limit: number, now = Date.now()) {
  if (windows.size > 2000) for (const [k,v] of windows) if (v.until <= now) windows.delete(k);
  if (windows.size > 10000) throw new AuditError("QUOTA", "The pilot is busy. Try again in a minute.",429);
  const entry = windows.get(key);
  if (!entry || entry.until <= now) { windows.set(key,{count:1,until:now+60000}); return; }
  if (entry.count >= limit) throw new AuditError("QUOTA", "Too many requests. Wait a minute before trying again.",429);
  entry.count++;
}
