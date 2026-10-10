import { createHash, randomUUID } from "node:crypto";
import { screenRequestSchema, type EvidenceSource, type ScreenRequest, type ScreenResponse } from "../screening/contracts";
import { attachEvidenceReceipt } from "./evidence-receipt";

const MAX_UPSTREAM_BYTES = 512 * 1024;
const UPSTREAM_TIMEOUT_MS = 7000;
const MAX_RESULTS = 14;
const NOTICE = "These are possible evidence sources, not a truth verdict. Search ranking, a paper title, a DOI, or a publisher's rating does not establish whether your exact claim is true. Read the source and check its context, methods, date, and relevance. Supplied passages are unverified. No paid AI model was called.";
type ProviderResult = {sources: EvidenceSource[]; provider: ScreenResponse["providers"][number]};
type RecordValue = Record<string, unknown>;
let crossrefBusy = false;

function record(value: unknown): RecordValue { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {}; }
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function plain(value: unknown, limit = 4000): string {
  if (typeof value !== "string") return "";
  return value.slice(0, 20000).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/&(?:lt|gt|quot|apos|amp|nbsp);/g, (entity) => ({"&lt;":"<", "&gt;":">", "&quot;":'"', "&apos;":"'", "&amp;":"&", "&nbsp;":" "}[entity] ?? entity))
    .replace(/\s+/g, " ").trim().slice(0, limit);
}
function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
function doi(value: unknown): string | undefined {
  const valueString = typeof value === "string" ? value.trim() : "";
  return /^10\.\d{4,9}\/[^\s<>]+$/i.test(valueString) && valueString.length <= 200 ? valueString : undefined;
}
function doiUrl(value: string): string { return `https://doi.org/${value.split("/").map(encodeURIComponent).join("/")}`; }
function sourceId(provider: string, identity: string) { return `${provider}-${createHash("sha256").update(identity).digest("hex").slice(0, 16)}`; }
function year(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d{4}$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed >= 1600 && parsed <= new Date().getUTCFullYear() + 2 ? parsed : undefined;
}

export function inferSubject(claim: string, chosen: ScreenRequest["subject"]): ScreenResponse["subject"] {
  if (chosen !== "auto") return chosen;
  if (/\b(health|medical|medicine|disease|cancer|vaccine|vaccines|autism|diabetes|drug|diet|vitamin|heart|blood|sleep|patient|treatment|therapy|infection|antibiotic|antibiotics|virus|depression|exercise|nutrition)\b/i.test(claim)) return "health";
  if (/\b(software|computer|computing|artificial intelligence|ai|llm|algorithm|internet|encryption|blockchain|neural|machine learning|cybersecurity|battery|batteries)\b/i.test(claim)) return "technology";
  if (/\b(science|climate|carbon|planet|physics|quantum|chemical|chemistry|biology|gravity|evolution|ocean|species|astronomy|energy|temperature|warming)\b/i.test(claim)) return "science";
  return "general";
}

// Search syntax is generated from plain words, never from a supplied URL or query operator.
function queryWords(claim: string): string[] {
  const stop = new Set(["a", "an", "the", "is", "are", "was", "were", "be", "been", "being", "and", "or", "to", "of", "in", "on", "for", "that", "this", "it", "as", "by", "with", "from", "does", "do", "did", "can", "could", "will", "would", "should", "all", "every", "always", "never", "not", "no", "than", "more", "less"]);
  const words = claim.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const significant = words.filter((word) => word.length > 1 && !stop.has(word));
  return [...new Set(significant.length ? significant : words)].slice(0, 16);
}

async function fetchJson(url: URL, signal?: AbortSignal, headers: Record<string, string> = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(url, {method: "GET", headers: {Accept: "application/json", ...headers}, signal: combined, cache: "no-store", redirect: "error"});
    if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("json")) { await response.body?.cancel(); throw new Error("Source lookup unavailable"); }
    const contentLength = Number(response.headers.get("content-length"));
    if (contentLength > MAX_UPSTREAM_BYTES) { await response.body?.cancel(); throw new Error("Source response too large"); }
    reader = response.body?.getReader();
    if (!reader) throw new Error("Empty source response");
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPSTREAM_BYTES) { await reader.cancel(); throw new Error("Source response too large"); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { clearTimeout(timeout); reader?.releaseLock(); }
}

async function provider(name: string, work: () => Promise<EvidenceSource[]>): Promise<ProviderResult> {
  try {
    const sources = await work();
    return {sources, provider: {name, status: "ok", message: sources.length ? `${sources.length} candidate source${sources.length === 1 ? "" : "s"} retrieved; relevance requires review.` : "No matching sources returned. This does not refute the claim."}};
  } catch {
    // Never return provider response bodies, query URLs, credentials, or raw errors.
    return {sources: [], provider: {name, status: "unavailable", message: "This source could not be reached or returned an unusable response. Other sources can still be reviewed."}};
  }
}

async function crossref(words: string[], retrievedAt: string, signal?: AbortSignal): Promise<EvidenceSource[]> {
  // Crossref's unauthenticated public pool permits one concurrent request per IP.
  // This guard is instance-local; distributed deployments still need an egress queue.
  if (crossrefBusy) throw new Error("Source lookup busy");
  crossrefBusy = true;
  try {
    const url = new URL("https://api.crossref.org/works");
    url.search = new URLSearchParams({"query.bibliographic": words.join(" "), rows: "4", select: "DOI,title,publisher,published,abstract,URL,type", filter: "type:journal-article"}).toString();
    const payload = record(await fetchJson(url, signal));
    const message = record(payload.message);
    if (!Array.isArray(message.items)) throw new Error("Unexpected source response");
    return message.items.slice(0, 4).flatMap((item: unknown) => {
      const entry = record(item), title = plain(list(entry.title)[0], 400), identifier = doi(entry.DOI);
      if (!title) return [];
      const abstract = plain(entry.abstract);
      const publicationYear = year(list(list(record(entry.published)["date-parts"])[0])[0]);
      return [{id: sourceId("crossref", identifier ?? title), title, publisher: plain(entry.publisher, 200) || "Publisher not supplied (Crossref)", kind: "paper" as const, retrievedAt,
        ...(identifier ? {doi: identifier, url: doiUrl(identifier)} : safeUrl(entry.URL) ? {url: safeUrl(entry.URL)} : {}),
        ...(abstract ? {abstract} : {}), ...(publicationYear ? {year: publicationYear} : {})}];
    });
  } finally { crossrefBusy = false; }
}

async function europePmc(words: string[], retrievedAt: string, signal?: AbortSignal): Promise<EvidenceSource[]> {
  const url = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
  // Quoted terms prevent claims from becoming Lucene field queries. OR widens recall;
  // the source's relevance ranking is only a retrieval signal, not evidential support.
  url.search = new URLSearchParams({query: words.map((word) => `"${word}"`).join(" OR "), format: "json", resultType: "core", pageSize: "4"}).toString();
  const payload = record(await fetchJson(url, signal)), results = record(payload.resultList);
  if (!Array.isArray(results.result)) throw new Error("Unexpected source response");
  return results.result.slice(0, 4).flatMap((item: unknown) => {
    const entry = record(item), title = plain(entry.title, 400), identifier = doi(entry.doi);
    if (!title) return [];
    const source = typeof entry.source === "string" && /^[A-Z]{2,6}$/.test(entry.source) ? entry.source : undefined;
    const publicationId = typeof entry.id === "string" && /^[A-Za-z0-9._-]{1,80}$/.test(entry.id) ? entry.id : undefined;
    const url = source && publicationId ? `https://europepmc.org/article/${source}/${publicationId}` : identifier ? doiUrl(identifier) : undefined;
    const abstract = plain(entry.abstractText), publicationYear = year(entry.pubYear);
    const journal = plain(record(record(entry.journalInfo).journal).title, 200);
    return [{id: sourceId("europepmc", identifier ?? `${source ?? ""}/${publicationId ?? title}`), title, publisher: journal || "Europe PMC indexed record", kind: "paper" as const, retrievedAt,
      ...(url ? {url} : {}), ...(identifier ? {doi: identifier} : {}), ...(abstract ? {abstract} : {}), ...(publicationYear ? {year: publicationYear} : {})}];
  });
}

async function factChecks(claim: string, retrievedAt: string, key: string, signal?: AbortSignal): Promise<EvidenceSource[]> {
  const url = new URL("https://factchecktools.googleapis.com/v1alpha1/claims:search");
  url.search = new URLSearchParams({query: claim, languageCode: "en", pageSize: "3"}).toString();
  const payload = record(await fetchJson(url, signal, {"X-Goog-Api-Key": key}));
  // An empty object is the API's valid empty-result response.
  if (payload.claims !== undefined && !Array.isArray(payload.claims)) throw new Error("Unexpected source response");
  return list(payload.claims).slice(0, 3).flatMap((item) => {
    const claimRecord = record(item);
    return list(claimRecord.claimReview).slice(0, 1).flatMap((review) => {
      const entry = record(review), title = plain(entry.title, 400), url = safeUrl(entry.url);
      if (!title || !url) return [];
      const rating = plain(entry.textualRating, 200), reviewedClaim = plain(claimRecord.text, 1000);
      const publicationYear = typeof entry.reviewDate === "string" ? year(entry.reviewDate.slice(0, 4)) : undefined;
      return [{id: sourceId("factcheck", url), title, url, publisher: plain(record(entry.publisher).name, 200) || "Publisher not supplied", kind: "fact-check" as const, retrievedAt,
        ...(reviewedClaim ? {reviewedClaim} : {}), ...(rating ? {publishedRating: rating} : {}), ...(publicationYear ? {year: publicationYear} : {})}];
    });
  });
}

export async function discoverEvidence(raw: ScreenRequest, signal?: AbortSignal): Promise<ScreenResponse> {
  const input = screenRequestSchema.parse(raw);
  const subject = inferSubject(input.claim, input.subject), createdAt = new Date().toISOString();
  const words = queryWords(input.claim);
  const lookups: Promise<ProviderResult>[] = [];
  if (words.length) {
    lookups.push(provider("Crossref", () => crossref(words, createdAt, signal)));
    if (subject === "health" || subject === "science") lookups.push(provider("Europe PMC", () => europePmc(words, createdAt, signal)));
  }
  const key = process.env.FACT_CHECK_API_KEY?.trim();
  if (key) lookups.push(provider("Google Fact Check", () => factChecks(input.claim, createdAt, key, signal)));
  const results = await Promise.all(lookups);
  const providers = results.map((result) => result.provider);
  if (!words.length) providers.push({name: "Research search", status: "unavailable", message: "The claim has no searchable words. Add a short, specific claim."});
  if (!key) providers.push({name: "Google Fact Check", status: "not-configured", message: "Optional published fact-check search is not configured. Research sources remain available without a key."});
  const supplied: EvidenceSource[] = (input.passages ?? []).map((passage, index) => ({
    id: sourceId("supplied", `${index}:${passage.title}:${passage.text}`), title: passage.title, ...(passage.url ? {url: passage.url} : {}),
    publisher: "Supplied by you · unverified", abstract: passage.text, kind: "supplied", retrievedAt: createdAt,
  }));
  // Prefer a record with passage text, keeping the full record's provenance.
  // Europe PMC is first and wins ties; never copy one index's abstract into
  // another index's metadata, which would misattribute the retrieved text.
  const candidates = [...supplied, ...results.filter((result) => result.provider.name === "Europe PMC").flatMap((result) => result.sources), ...results.filter((result) => result.provider.name !== "Europe PMC").flatMap((result) => result.sources)];
  const unique = new Map<string, EvidenceSource>();
  for (const source of candidates) {
    const identity = source.kind === "supplied" ? source.id : source.doi?.toLowerCase() ?? source.url ?? source.title.toLowerCase();
    const existing = unique.get(identity);
    if (!existing || (!existing.abstract && source.abstract)) unique.set(identity, source);
  }
  const sources = [...unique.values()].slice(0, MAX_RESULTS);
  return attachEvidenceReceipt({id: randomUUID(), claim: input.claim, subject, createdAt, method: "evidence-discovery", sources, providers, notice: NOTICE});
}
