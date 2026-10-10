import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { ScreenResponse } from "../screening/contracts";

// Canonical JSON makes an exported record verifiable regardless of object key order.
export function canonicalRecord(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalRecord).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b,"en")).map(([k,v])=>`${JSON.stringify(k)}:${canonicalRecord(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function digestRecord(report: Omit<ScreenResponse,"receipt">) {
  return createHash("sha256").update(canonicalRecord(report)).digest("hex");
}
function receiptKey() { const key=process.env.SESSION_SECRET; return key && key.length>=32 ? key : null; }
export function attachEvidenceReceipt(report: ScreenResponse, now=Date.now()): ScreenResponse {
  const key=receiptKey();
  if (!key) return report;
  const {receipt: _receipt, ...record}=report;
  const digest=digestRecord(record),issuedAt=new Date(now).toISOString(),expiresAt=new Date(now+30*86400000).toISOString();
  const issuer=process.env.APP_ORIGIN?.replace(/\/$/,"") || "http://localhost:3000";
  const payload=Buffer.from(JSON.stringify({v:1,digest,issuedAt,expiresAt,issuer})).toString("base64url");
  const signature=createHmac("sha256",key).update(`evidence-receipt:v1:${payload}`).digest("base64url");
  return {...record,receipt:{token:`${payload}.${signature}`,digest,issuedAt,expiresAt,issuer}};
}
export function verifyEvidenceReceipt(report: ScreenResponse, now=Date.now()): boolean {
  if(!report || typeof report!=="object")return false;
  const key=receiptKey(),receipt=report.receipt;
  if (!key || !receipt || typeof receipt.token!=="string" || receipt.token.length>2048) return false;
  try {
    const [payload,signature,extra]=receipt.token.split(".");
    if (!payload || !signature || extra) return false;
    const expected=createHmac("sha256",key).update(`evidence-receipt:v1:${payload}`).digest();
    const actual=Buffer.from(signature,"base64url");
    if (expected.length!==actual.length || !timingSafeEqual(expected,actual)) return false;
    const signed=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    const {receipt:_receipt,...record}=report;
    return signed.v===1 && signed.digest===digestRecord(record) && signed.digest===receipt.digest
      && signed.issuedAt===receipt.issuedAt && signed.expiresAt===receipt.expiresAt && signed.issuer===receipt.issuer
      && Date.parse(signed.expiresAt)>now && Date.parse(signed.issuedAt)<=now+5000;
  } catch { return false; }
}
