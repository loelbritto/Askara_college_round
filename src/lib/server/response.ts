import { NextResponse } from "next/server";
import { AuditError } from "../contracts";
import { ZodError } from "zod";

type Operation = "audit" | "session.sign-in" | "session.sign-out" | "workspaces" | "health";
type Metrics = { mode?: "audit" | "compare"; complete?: boolean; usage?: Record<string, number> };
const tokenFields = ["total_tokens", "total_input_tokens", "total_output_tokens", "total_thought_tokens", "total_cached_tokens"] as const;

// Never accept client request IDs, arbitrary log fields, URLs, identities or payloads.
export function requestTrace(operation: Operation) {
  const requestId = crypto.randomUUID();
  const started = performance.now();
  let finished = false;
  return {
    requestId,
    finish<T extends Response>(response: T, metrics: Metrics = {}, code?: string): T {
      response.headers.set("X-Request-Id", requestId);
      response.headers.set("Cache-Control", "no-store");
      if (!finished) {
        finished = true;
        const usage: Record<string, number> = {};
        for (const field of tokenFields) {
          const value = metrics.usage?.[field];
          if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) usage[field] = value;
        }
        const entry = {
          event: response.status >= 400 ? "request_failed" : "request_completed",
          requestId, operation, status: response.status,
          elapsedMs: Math.max(0, Math.round(performance.now() - started)),
          ...(code ? {code} : {}),
          ...(metrics.mode === "audit" || metrics.mode === "compare" ? {mode: metrics.mode} : {}),
          ...(typeof metrics.complete === "boolean" ? {complete: metrics.complete} : {}),
          ...(Object.keys(usage).length ? {usage} : {}),
        };
        // A logging sink failure must not turn a completed save into an apparent failure.
        try { (response.status >= 400 ? console.warn : console.info)(JSON.stringify(entry)); } catch { /* best effort */ }
      }
      return response;
    },
  };
}

export function errorResponse(error: unknown, trace: ReturnType<typeof requestTrace>) {
  const known = error instanceof AuditError ? error : error instanceof ZodError ? new AuditError("INVALID_INPUT", error.issues[0]?.message ?? "Invalid input.") : new AuditError("INTERNAL", "The audit could not be completed. Your inputs are preserved.", 500);
  return trace.finish(NextResponse.json({error:{code:known.code,message:known.message,requestId:trace.requestId}}, {status:known.status,headers:{...(known.status===429 ? {"Retry-After":"60"} : {})}}), {}, known.code);
}
