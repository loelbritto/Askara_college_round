import { NextRequest, NextResponse } from "next/server";
import { AuditError, auditRequestSchema } from "@/lib/contracts";
import { canonicalizeSources } from "@/lib/canonical";
import { canonicalClaims, noEvidenceOutput, validateOutput } from "@/lib/validate-report";
import { callGemini } from "@/lib/server/gemini";
import { assertOrigin, configStatus, COOKIE_NAME, readJson, signBaseline, verifyBaseline } from "@/lib/server/security";
import { ACCOUNT_COOKIE, auditLimit, requireSession } from "@/lib/server/accounts";
import { errorResponse, requestTrace } from "@/lib/server/response";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  const trace = requestTrace("audit");
  const started = performance.now();
  try {
    assertOrigin(request);
    const session = await requireSession(request.cookies.get(COOKIE_NAME)?.value,request.cookies.get(ACCOUNT_COOKIE)?.value);
    if (!configStatus().enabled) throw new AuditError("DISABLED", "Live audits have been temporarily disabled by the operator.",503);
    await auditLimit(session,request.signal);
    const input = auditRequestSchema.parse(await readJson(request));
    const sources = await canonicalizeSources(input.sources);
    if (input.mode === "compare" && !verifyBaseline(input,session)) throw new AuditError("STALE_BASELINE", "The baseline was changed or belongs to an expired session. Run a new initial audit.",409);
    const result = !input.selectedSourceIds.length
      ? {output:noEvidenceOutput(input.claims!),usage:{},model:"No model call — no evidence selected"}
      : await callGemini(input,sources,request.signal);
    const report = validateOutput(result.output,input,sources,{...result,elapsedMs:Math.round(performance.now()-started)});
    if (input.mode === "audit") report.baselineToken = signBaseline({...input,claims:canonicalClaims(report.findings)},session);
    return trace.finish(NextResponse.json(report),{mode:input.mode,usage:report.usage,complete:report.complete});
  } catch(error) {return errorResponse(error,trace);}
}
