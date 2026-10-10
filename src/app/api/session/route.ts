import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuditError } from "@/lib/contracts";
import { assertOrigin, configStatus, constantEqual, COOKIE_NAME, cookieOptions, issueSession, readJson, throttle } from "@/lib/server/security";
import { errorResponse, requestTrace } from "@/lib/server/response";
import { accountMode, accountConfiguration } from "@/lib/server/account-config";
import { ACCOUNT_COOKIE, signInAccount, signOutAccount } from "@/lib/server/accounts";
export async function POST(request: NextRequest) {
  const trace = requestTrace("session.sign-in");
  try {
    assertOrigin(request);
    if(accountMode()) {
      if(!accountConfiguration().configured)throw new AuditError("NOT_CONFIGURED","Individual accounts are not configured.",503);
      const input=z.object({email:z.email().max(254),password:z.string().min(1).max(200)}).parse(await readJson(request,2048));
      const session=await signInAccount(input.email,input.password,request.signal);
      const response=NextResponse.json({authenticated:true,authMode:"supabase"},{headers:{"Cache-Control":"no-store"}});
      response.cookies.set(ACCOUNT_COOKIE,session.accessToken!,{...cookieOptions(),maxAge:Math.max(1,Math.floor(session.exp-Date.now()/1000))});
      response.cookies.set(COOKIE_NAME,"",{...cookieOptions(),maxAge:0});
      return trace.finish(response);
    }
    throttle(`login:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"}`,10);
    if (!configStatus().configured) throw new AuditError("NOT_CONFIGURED", "Live auditing is not configured. You can explore the sample workspace.",503);
    const {code} = z.object({code:z.string().min(1).max(200)}).parse(await readJson(request,1024));
    if (!constantEqual(code,process.env.PILOT_ACCESS_CODE!)) throw new AuditError("UNAUTHORIZED", "That access code is not correct.",401);
    const response = NextResponse.json({authenticated:true},{headers:{"Cache-Control":"no-store"}});
    response.cookies.set(COOKIE_NAME,issueSession(),cookieOptions());
    return trace.finish(response);
  } catch(error) { return errorResponse(error,trace); }
}
export async function DELETE(request: NextRequest) {
  const trace = requestTrace("session.sign-out");
  try {
    assertOrigin(request);
    if(accountMode())await signOutAccount(request.cookies.get(ACCOUNT_COOKIE)?.value,request.nextUrl.searchParams.get("all")==="true");
    const response = NextResponse.json({authenticated:false},{headers:{"Cache-Control":"no-store"}});
    response.cookies.set(COOKIE_NAME,"",{...cookieOptions(),maxAge:0});
    response.cookies.set(ACCOUNT_COOKIE,"",{...cookieOptions(),maxAge:0});
    return trace.finish(response);
  } catch(error) {return errorResponse(error,trace);}
}
