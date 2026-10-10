import { NextRequest, NextResponse } from "next/server";
import { configStatus, COOKIE_NAME } from "@/lib/server/security";
import { accountMode, accountConfiguration } from "@/lib/server/account-config";
import { ACCOUNT_COOKIE, resolveSession } from "@/lib/server/accounts";
import { errorResponse, requestTrace } from "@/lib/server/response";
import { providerConfig } from "@/lib/server/provider-config";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const trace = requestTrace("health");
  const {configured,enabled,missing} = configStatus();
  try {
    const session=await resolveSession(request.cookies.get(COOKIE_NAME)?.value,request.cookies.get(ACCOUNT_COOKIE)?.value);
    const {provider,model}=providerConfig();
    return trace.finish(NextResponse.json({service:"second-opinion",configured,enabled,missing,authenticated:!!session,authMode:accountMode()?"supabase":"pilot",accountsConfigured:accountMode()&&accountConfiguration().configured,provider,model}));
  }catch(error){return errorResponse(error,trace);}
}
