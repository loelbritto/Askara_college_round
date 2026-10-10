import { z } from "zod";

export const screeningSubjects = ["auto", "health", "science", "technology", "general"] as const;
export const screeningSubjectSchema = z.enum(screeningSubjects);

const publicLinkSchema = z.string().trim().max(2048).url().refine((value) => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
}, "Use an HTTP or HTTPS source link without credentials.");

export const screenRequestSchema = z.object({
  claim: z.string().trim().min(3, "Enter a claim with at least 3 characters.").max(800),
  subject: screeningSubjectSchema,
  discover: z.literal(true),
  passages: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    text: z.string().trim().min(1).max(3000),
    url: publicLinkSchema.optional(),
  }).strict()).max(3).optional(),
}).strict();

export type ScreenRequest = z.infer<typeof screenRequestSchema>;

export type EvidenceSource = {
  id: string;
  title: string;
  url?: string;
  publisher: string;
  year?: number;
  abstract?: string;
  kind: "paper" | "fact-check" | "supplied";
  retrievedAt: string;
  doi?: string;
  /** The external review publisher's wording; never Second Opinion's verdict. */
  publishedRating?: string;
  /** Claim reviewed by an external publisher; not evidence supporting that claim. */
  reviewedClaim?: string;
};

export type ScreenResponse = {
  id: string;
  claim: string;
  subject: Exclude<ScreenRequest["subject"], "auto">;
  createdAt: string;
  method: "evidence-discovery";
  sources: EvidenceSource[];
  providers: Array<{name: string; status: "ok" | "unavailable" | "not-configured"; message: string}>;
  notice: string;
  receipt?: {token: string; digest: string; issuedAt: string; expiresAt: string; issuer: string};
};
