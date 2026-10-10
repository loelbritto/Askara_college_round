import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachEvidenceReceipt, canonicalRecord, verifyEvidenceReceipt } from "../src/lib/server/evidence-receipt";
import type { ScreenResponse } from "../src/lib/screening/contracts";

const NOW = Date.parse("2026-10-11T12:00:00.000Z");
const DAY = 86400000;
const KEY = "test-only-receipt-secret-with-more-than-32-characters";
function record(): ScreenResponse {
  return {
    id: "screen-1", claim: "Regular exercise improves sleep quality.", subject: "health", createdAt: new Date(NOW).toISOString(), method: "evidence-discovery",
    sources: [{id: "source-1", title: "An example study", publisher: "Example journal", year: 2025, kind: "paper", url: "https://example.org/paper", abstract: "This is a test passage, not a real research result.", retrievedAt: new Date(NOW).toISOString()}],
    providers: [{name: "Example index", status: "ok", message: "One candidate source."}],
    notice: "Candidate evidence, not factual verification.",
  };
}
beforeEach(() => {vi.stubEnv("SESSION_SECRET", KEY); vi.stubEnv("APP_ORIGIN", "https://secondopinion-ten.vercel.app");});
afterEach(() => vi.unstubAllEnvs());

describe("evidence provenance receipts", () => {
  it("signs the complete discovery record and verifies it after a JSON export round trip", () => {
    const original = record();
    const signed = attachEvidenceReceipt(original, NOW);
    expect(original.receipt).toBeUndefined();
    expect(signed.receipt?.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(signed.receipt?.issuer).toBe("https://secondopinion-ten.vercel.app");
    expect(verifyEvidenceReceipt(JSON.parse(JSON.stringify(signed)), NOW + DAY)).toBe(true);
  });

  it.each(["claim", "abstract", "url", "provider", "notice", "source-order"])("rejects %s tampering", (field) => {
    const original = record();
    original.sources.push({...original.sources[0], id: "source-2", title: "Another study"});
    const changed = structuredClone(attachEvidenceReceipt(original, NOW));
    if (field === "claim") changed.claim = "Changed claim";
    if (field === "abstract") changed.sources[0].abstract = "Changed passage";
    if (field === "url") changed.sources[0].url = "https://example.org/other";
    if (field === "provider") changed.providers[0].status = "unavailable";
    if (field === "notice") changed.notice = "This is now certified true";
    if (field === "source-order") changed.sources.reverse();
    expect(verifyEvidenceReceipt(changed, NOW)).toBe(false);
  });

  it.each(["digest", "issuedAt", "expiresAt", "issuer", "token"] as const)("rejects altered receipt %s", (field) => {
    const signed = attachEvidenceReceipt(record(), NOW);
    signed.receipt![field] += "changed";
    expect(verifyEvidenceReceipt(signed, NOW)).toBe(false);
  });

  it("expires precisely at thirty days and rejects implausibly future issuance", () => {
    const signed = attachEvidenceReceipt(record(), NOW);
    expect(verifyEvidenceReceipt(signed, NOW + 30 * DAY - 1)).toBe(true);
    expect(verifyEvidenceReceipt(signed, NOW + 30 * DAY)).toBe(false);
    expect(verifyEvidenceReceipt(signed, NOW + 31 * DAY)).toBe(false);
    expect(verifyEvidenceReceipt(attachEvidenceReceipt(record(), NOW + 60000), NOW)).toBe(false);
  });

  it("does not attach or accept receipts without a sufficiently long signing key", () => {
    const signed = attachEvidenceReceipt(record(), NOW);
    for (const key of ["", "too-short"]) {
      vi.stubEnv("SESSION_SECRET", key);
      expect(attachEvidenceReceipt(record(), NOW).receipt).toBeUndefined();
      expect(verifyEvidenceReceipt(signed, NOW)).toBe(false);
    }
  });

  it("invalidates old receipts after key rotation and accepts newly issued ones", () => {
    const old = attachEvidenceReceipt(record(), NOW);
    vi.stubEnv("SESSION_SECRET", "rotated-test-secret-with-more-than-32-characters");
    expect(verifyEvidenceReceipt(old, NOW)).toBe(false);
    const replacement = attachEvidenceReceipt(old, NOW + 1);
    expect(replacement.receipt?.token).not.toBe(old.receipt?.token);
    expect(verifyEvidenceReceipt(replacement, NOW + 1)).toBe(true);
  });

  it("survives object key reordering but preserves meaningful array order", () => {
    const signed = attachEvidenceReceipt(record(), NOW);
    function reverseKeys(value: unknown): unknown {
      if (Array.isArray(value)) return value.map(reverseKeys);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reverseKeys(entry)]));
      return value;
    }
    const reordered = reverseKeys(signed) as ScreenResponse;
    expect(verifyEvidenceReceipt(reordered, NOW)).toBe(true);
    expect(canonicalRecord({b: 2, a: {z: 1, y: [2, 3]}})).toBe(canonicalRecord({a: {y: [2, 3], z: 1}, b: 2}));
    expect(canonicalRecord([1, 2])).not.toBe(canonicalRecord([2, 1]));
  });

  it.each([null, {}, {receipt: {}}, {receipt: {token: 42}}, {receipt: {token: "x".repeat(2049)}}, {receipt: {token: "not-a-receipt"}}])("fails closed for malformed imported records", (value) => {
    expect(() => verifyEvidenceReceipt(value as ScreenResponse, NOW)).not.toThrow();
    expect(verifyEvidenceReceipt(value as ScreenResponse, NOW)).toBe(false);
  });
});
