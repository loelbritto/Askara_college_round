import { readJson, throttle } from "@/lib/server/security";
import { verifyEvidenceReceipt } from "@/lib/server/evidence-receipt";
import type { ScreenResponse } from "@/lib/screening/contracts";
import { AuditError } from "@/lib/contracts";
export const runtime="nodejs";
export async function POST(request:Request) {
  try {
    throttle("receipt-verify",60);
    const value=await readJson(request,128*1024);
    const valid=!!value && typeof value==="object" && verifyEvidenceReceipt(value as ScreenResponse);
    return Response.json({valid,meaning:"Checks that the evidence record is unchanged and was issued by this service within 30 days. It does not certify truth, source quality, local model output, or reviewer notes."});
  } catch(error) {
    return Response.json({valid:false,error:"The evidence receipt could not be verified."},{status:error instanceof AuditError?error.status:400});
  }
}
