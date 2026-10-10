import { NextRequest, NextResponse } from "next/server";
import { configStatus, COOKIE_NAME } from "@/lib/server/security";
import { accountMode, accountConfiguration } from "@/lib/server/account-config";
import { ACCOUNT_COOKIE, resolveSession } from "@/lib/server/accounts";
import { errorResponse, requestTrace } from "@/lib/server/response";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const trace = requestTrace("health");
  const {configured,enabled} = configStatus();
  try {
    const session=await resolveSession(request.cookies.get(COOKIE_NAME)?.value,request.cookies.get(ACCOUNT_COOKIE)?.value);
    return trace.finish(NextResponse.json({service:"second-opinion",configured,enabled,authenticated:!!session,authMode:accountMode()?"supabase":"pilot",accountsConfigured:accountMode()&&accountConfiguration().configured,model:process.env.GEMINI_MODEL || "gemini-3.8-flash"}));
  }catch(error){return errorResponse(error,trace);}
}
