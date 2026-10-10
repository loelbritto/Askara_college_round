import { createHash } from "node:crypto";
import { AuditError } from "@/lib/contracts";
import { screenRequestSchema } from "@/lib/screening/contracts";
import { discoverEvidence } from "@/lib/server/evidence-search";
import { readJson, throttle } from "@/lib/server/security";

export const runtime = "nodejs";
export const maxDuration = 15;

function allowedOrigin(request: Request): string | null | false {
  const origin = request.headers.get("origin");
  // This is a public, credential-free endpoint. Non-browser API clients can omit Origin.
  if (!origin) return null;
  const site = process.env.APP_ORIGIN?.replace(/\/$/, "") || "https://secondopinion-ten.vercel.app";
  if (origin === site || /^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return origin;
  if (process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1):300[0-9]$/.test(origin)) return origin;
  return false;
}

function responseHeaders(origin: string | null | false): Headers {
  const headers = new Headers({"Cache-Control": "no-store", "Vary": "Origin", "X-Content-Type-Options": "nosniff"});
  if (typeof origin === "string") {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
  }
  // Deliberately no Access-Control-Allow-Credentials or cookies.
  return headers;
}

export function OPTIONS(request: Request) {
  const origin = allowedOrigin(request);
  const requestedMethod = request.headers.get("access-control-request-method");
  const requestedHeaders = request.headers.get("access-control-request-headers")?.split(",").map((header) => header.trim().toLowerCase()) ?? [];
  const permitted = origin !== false && (!requestedMethod || requestedMethod === "POST") && requestedHeaders.every((header) => header === "content-type");
  return new Response(null, {status: permitted ? 204 : 403, headers: responseHeaders(permitted ? origin : false)});
}

export async function POST(request: Request) {
  const origin = allowedOrigin(request), headers = responseHeaders(origin);
  if (origin === false) return Response.json({error: {code: "FORBIDDEN", message: "Open Second Opinion or use its browser extension to discover evidence."}}, {status: 403, headers});
  try {
    // Instance-local abuse mitigation, not a distributed guarantee. Do not log claims or IPs.
    const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 100) || "unknown";
    const identity = createHash("sha256").update(client).digest("hex");
    throttle(`screen:client:${identity}`, 6);
    throttle("screen:global", 30);
    const input = screenRequestSchema.safeParse(await readJson(request, 48 * 1024));
    if (!input.success) return Response.json({error: {code: "INVALID_INPUT", message: "Enter one claim (3–800 characters), a valid subject, and explicit permission to discover sources. Attach at most 3 passages of 3,000 characters each."}}, {status: 400, headers});
    const result = await discoverEvidence(input.data, request.signal);
    return Response.json(result, {headers});
  } catch (error) {
    const known = error instanceof AuditError;
    const status = known ? error.status : 503;
    if (status === 429) headers.set("Retry-After", "60");
    return Response.json({error: {code: known ? error.code : "UNAVAILABLE", message: known ? error.message : "Evidence discovery is temporarily unavailable. Your claim has not been evaluated."}}, {status, headers});
  }
}
