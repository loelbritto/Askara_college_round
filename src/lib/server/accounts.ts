import { createHmac } from "node:crypto";
import { z } from "zod";
import { AuditError } from "../contracts";
import { accountConfiguration, accountMode } from "./account-config";
import { verifySession, throttle } from "./security";

export const ACCOUNT_COOKIE = "second_opinion_account";
export type AccessSession = {sid:string; exp:number; userId?:string; accessToken?:string};
const sessionSchema = z.object({sid:z.uuid(),exp:z.number().int().positive(),userId:z.uuid()});
const unavailable = () => new AuditError("ACCOUNT_UNAVAILABLE", "Account access is temporarily unavailable. Your work is preserved; retry when service returns.",503);

// Browser code never receives Supabase credentials or tokens. All calls go through our server.
export async function accountRequest(path:string,options:{body?:unknown;token?:string;privileged?:boolean;signal?:AbortSignal}={}) {
  if (!accountConfiguration().configured) throw new AuditError("NOT_CONFIGURED","Individual accounts are not configured. The free examples remain available.",503);
  const headers:Record<string,string> = {apikey:options.privileged?process.env.SUPABASE_SECRET_KEY!:process.env.SUPABASE_PUBLISHABLE_KEY!,"Content-Type":"application/json"};
  if (options.token) headers.Authorization=`Bearer ${options.token}`;
  try {
    const response = await fetch(`${process.env.SUPABASE_URL!.replace(/\/$/,"")}${path}`,{method:"POST",headers,body:JSON.stringify(options.body??{}),cache:"no-store",redirect:"error",signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});
    if (response.status===429) throw new AuditError("QUOTA","Account request limit reached. Wait before trying again.",429);
    if (response.status===409) throw new AuditError("SAVE_CONFLICT","This review changed in another tab. Refresh the saved list and load the latest version, or save a separate copy.",409);
    if (response.status===413) throw new AuditError("TOO_LARGE","The saved review or storage allowance is full. Download a copy; delete an unneeded saved review before trying again.",413);
    if (response.status===404 && path.includes("workspace")) throw new AuditError("NOT_FOUND","That saved review is unavailable.",404);
    if (response.status===400 && path==="/auth/v1/token?grant_type=password") throw new AuditError("UNAUTHORIZED","Sign-in failed. Check your email and password.",401);
    if (response.status===401 || response.status===403) throw new AuditError("UNAUTHORIZED","Sign in again to continue. Your draft is still here.",401);
    // Do not expose upstream errors: they can contain credentials, SQL, or user data.
    if (!response.ok) throw unavailable();
    if (response.status===204) return null;
    return await response.json() as unknown;
  } catch(error) { if(error instanceof AuditError)throw error;throw unavailable(); }
}

export async function accountSession(token:string|undefined):Promise<AccessSession|null> {
  if (!token || token.length>3800 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    // PostgREST verifies the JWT; the function ALSO checks auth.sessions and bans.
    // Merely decoding a token, or verifying its signature, cannot establish revocation.
    const value=await accountRequest("/rest/v1/rpc/so_current_session",{token});
    if(value===null)return null;
    const result=sessionSchema.safeParse(value);
    if(!result.success)throw unavailable();
    if(result.data.exp<=Date.now()/1000)return null;
    return {...result.data,accessToken:token};
  }catch(error){if(error instanceof AuditError&&error.status===401)return null;throw error;}
}
export async function resolveSession(pilotToken:string|undefined,accountToken:string|undefined) {
  if(process.env.AUTH_MODE && !["pilot","supabase"].includes(process.env.AUTH_MODE))throw new AuditError("NOT_CONFIGURED","Account mode is not configured correctly.",503);
  return accountMode()?accountSession(accountToken):verifySession(pilotToken);
}
export async function requireSession(pilotToken:string|undefined,accountToken:string|undefined):Promise<AccessSession> {
  const session=await resolveSession(pilotToken,accountToken);
  if(!session)throw new AuditError("UNAUTHORIZED",accountMode()?"Sign in to your account to continue. Your draft is still here.":"Your access session has expired. Enter the pilot code again; your work is still here.",401);
  return session;
}
export async function sharedLimit(key:string,limit:number,signal?:AbortSignal) {
  if(!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length<32)throw new AuditError("NOT_CONFIGURED","Session security is not configured.",503);
  const digest=createHmac("sha256",process.env.SESSION_SECRET).update(key).digest("hex");
  const result=await accountRequest("/rest/v1/rpc/so_take_limit",{privileged:true,body:{p_key:digest,p_limit:limit},signal});
  if(result===false)throw new AuditError("QUOTA","Too many requests. Wait a minute before trying again.",429);
  if(result!==true)throw unavailable();
}
export async function auditLimit(session:AccessSession,signal?:AbortSignal) {
  if(accountMode()){
    if(!session.userId)throw new AuditError("UNAUTHORIZED","Sign in to continue.",401);
    await sharedLimit(`audit:user:${session.userId}`,3,signal);
    await sharedLimit("audit:global",10,signal);
  }else throttle(`audit:${session.sid}`,3);
}
export async function signInAccount(email:string,password:string,signal?:AbortSignal) {
  await sharedLimit(`login:${email.trim().toLowerCase()}`,5,signal);
  // A global bound prevents attackers bypassing per-email limits with random addresses.
  await sharedLimit("login:global",20,signal);
  const result=await accountRequest("/auth/v1/token?grant_type=password",{body:{email,password},signal});
  const parsed=z.object({access_token:z.string().max(3800)}).safeParse(result);
  if(!parsed.success)throw unavailable();
  const session=await accountSession(parsed.data.access_token);
  if(!session)throw new AuditError("UNAUTHORIZED","This account session is not active.",401);
  return session;
}
export async function signOutAccount(token:string|undefined,allDevices=false) {
  if(!token){if(allDevices)throw new AuditError("UNAUTHORIZED","Sign in again before revoking sessions on all devices.",401);return;}
  // Expired or already-revoked credentials can be cleared locally. An outage must
  // not be reported as successful revocation.
  const session=await accountSession(token);
  if(!session){if(allDevices)throw new AuditError("UNAUTHORIZED","Sign in again before revoking sessions on all devices.",401);return;}
  await accountRequest(`/auth/v1/logout?scope=${allDevices?"global":"local"}`,{token});
}
