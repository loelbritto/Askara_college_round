import { z } from "zod";

export const LIMITS = { documents: 5, pages: 20, fileBytes: 5 * 1024 * 1024, sourceChars: 60000, answerChars: 2000, contextChars: 1000, claims: 20, bodyBytes: 512 * 1024 } as const;
export const VERDICTS = ["supported", "contradicted", "insufficient", "ambiguous"] as const;
export type Verdict = typeof VERDICTS[number];
export const verdictLabels: Record<Verdict, string> = { supported: "Supported", contradicted: "Contradicted", insufficient: "Insufficient evidence", ambiguous: "Ambiguous / conflicting" };
export const issueLabels = { factual_mismatch: "Factual mismatch", missing_condition: "Missing condition", unsupported_assertion: "Unsupported assertion", reasoning_inconsistency: "Reasoning inconsistency", policy_risk: "Policy-risk recommendation" } as const;
export const issueSchema = z.enum(["factual_mismatch", "missing_condition", "unsupported_assertion", "reasoning_inconsistency", "policy_risk"]);
export const pageSchema = z.object({ number: z.number().int().min(1).max(LIMITS.pages), text: z.string().min(1).max(LIMITS.sourceChars) });
export const sourceInputSchema = z.object({ id: z.string().min(1).max(100), name: z.string().trim().min(1).max(150), kind: z.enum(["pdf", "txt", "paste", "sample"]), pages: z.array(pageSchema).min(1).max(LIMITS.pages) });
export type SourceInput = z.infer<typeof sourceInputSchema>;
export type Block = { id: string; sourceId: string; page: number; text: string };
export type Source = SourceInput & { hash: string; blocks: Block[] };
export type Segment = { id: string; text: string; start: number; end: number };
export const canonicalClaimSchema = z.object({ id: z.string().regex(/^c\d+$/), proposition: z.string().min(1).max(1000), segmentId: z.string().regex(/^s\d+$/), answerQuote: z.string().min(1).max(LIMITS.answerChars) });
export type CanonicalClaim = z.infer<typeof canonicalClaimSchema>;
export const auditRequestSchema = z.object({
  mode: z.enum(["audit", "compare"]),
  answer: z.string().min(1).max(LIMITS.answerChars).refine(v => v.trim().length > 0, "Add an answer."),
  context: z.string().max(LIMITS.contextChars).default(""),
  sources: z.array(sourceInputSchema).min(1).max(LIMITS.documents),
  selectedSourceIds: z.array(z.string().max(100)).max(LIMITS.documents),
  claims: z.array(canonicalClaimSchema).max(LIMITS.claims).optional(),
  baselineToken: z.string().max(400).optional(),
}).superRefine((v, ctx) => {
  const ids = v.sources.map(s => s.id);
  const error = (message: string) => ctx.addIssue({code: "custom", message});
  if (new Set(ids).size !== ids.length) error("Duplicate source identities are not allowed.");
  if (new Set(v.selectedSourceIds).size !== v.selectedSourceIds.length || v.selectedSourceIds.some(id => !ids.includes(id))) error("Invalid source selection.");
  if (v.mode === "audit" && !v.selectedSourceIds.length) error("Select at least one source.");
  if (v.mode === "compare" && (!v.claims?.length || !v.baselineToken)) error("Comparison requires an unchanged, signed baseline.");
  if (v.sources.reduce((n,s) => n + s.pages.length, 0) > LIMITS.pages) error(`Use no more than ${LIMITS.pages} total pages.`);
  if (v.sources.reduce((n,s) => n + s.pages.reduce((p,page) => p + page.text.length, 0), 0) > LIMITS.sourceChars) error(`Source text exceeds ${LIMITS.sourceChars.toLocaleString()} characters.`);
  for (const source of v.sources) {
    if (source.pages.some((p,i) => p.number !== i + 1)) error("Source page numbers must be consecutive, starting at 1.");
  }
});
export type AuditRequest = z.infer<typeof auditRequestSchema>;
export const rawEvidenceSchema = z.object({ blockId: z.string().min(1).max(150), quote: z.string().min(1).max(3000), relation: z.enum(["supports", "contradicts"]) });
export const uncertaintySchema = z.object({
  reason: z.enum(["missing_policy", "missing_context", "conflicting_policies", "unclear_interpretation"]),
  question: z.string().min(1).max(600),
});
export const policyRuleFieldsSchema = z.object({
  appliesTo: z.string().max(800), action: z.string().min(1).max(800), timeLimit: z.string().max(800),
  conditions: z.string().max(1200), exceptions: z.string().max(1200), scope: z.string().max(800), precedence: z.string().max(800),
});
export type PolicyRuleFields = z.infer<typeof policyRuleFieldsSchema>;
export const rawPolicyRuleSchema = policyRuleFieldsSchema.extend({
  id: z.string().regex(/^r\d+$/), claimIds: z.array(z.string().regex(/^c\d+$/)).min(1).max(LIMITS.claims),
  references: z.array(rawEvidenceSchema.omit({relation:true})).min(1).max(5),
});
export type RawPolicyRule = z.infer<typeof rawPolicyRuleSchema>;
export type RuleReview = { fields: PolicyRuleFields; confirmed: boolean; updatedAt: string };
export const rawFindingSchema = canonicalClaimSchema.extend({ verdict: z.enum(VERDICTS), issues: z.array(issueSchema).max(5), explanation: z.string().min(1).max(1600), strength: z.enum(["direct", "inference", "conflicting", "none"]), evidence: z.array(rawEvidenceSchema).max(8), uncertainty: uncertaintySchema.nullable().optional(), suggestedCorrection:z.string().max(LIMITS.answerChars).nullable().optional() });
export const modelOutputSchema = z.object({
  findings: z.array(rawFindingSchema).max(LIMITS.claims),
  nonfactualSegmentIds: z.array(z.string().regex(/^s\d+$/)).max(100),
  tooManyClaims: z.boolean(),
  rules: z.array(rawPolicyRuleSchema).max(20).optional(),
});
export type ModelOutput = z.infer<typeof modelOutputSchema>;
export type RawFinding = ModelOutput["findings"][number];
export type Evidence = z.infer<typeof rawEvidenceSchema> & { sourceId: string; sourceName: string; page: number; start: number; end: number; location: "exact" | "block" };
export type PolicyRule = Omit<RawPolicyRule,"references"> & { references: Omit<Evidence,"relation">[]; validation: "references_checked" | "unresolved"; warnings: string[] };
export type Finding = CanonicalClaim & { verdict: Verdict | null; issues: z.infer<typeof issueSchema>[]; explanation: string; strength: RawFinding["strength"]; evidence: Evidence[]; uncertainty?: z.infer<typeof uncertaintySchema> | null; suggestedCorrection?:string|null; validation: "verified" | "unresolved"; warnings: string[]; start: number | null; end: number | null };
export type Report = {
  id: string; mode: "audit" | "compare"; origin: "live" | "sample"; answer: string; context: string;
  sources: Source[]; selectedSourceIds: string[]; findings: Finding[]; segments: Segment[];
  complete: boolean; warnings: string[]; createdAt: string; model: string; promptVersion: string;
  elapsedMs: number; usage: Record<string, number>; baselineToken?: string; limitations: string[];
  rules?: PolicyRule[];
};
export type ApiErrorCode = "INVALID_INPUT" | "TOO_LARGE" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_CONFIGURED" | "DISABLED" | "QUOTA" | "TIMEOUT" | "MODEL_UNAVAILABLE" | "ACCOUNT_UNAVAILABLE" | "NOT_FOUND" | "SAVE_CONFLICT" | "BLOCKED_RESPONSE" | "INVALID_OUTPUT" | "STALE_BASELINE" | "INTERNAL";
export class AuditError extends Error {
  constructor(public code: ApiErrorCode, message: string, public status = 400) { super(message); this.name = "AuditError"; }
}
