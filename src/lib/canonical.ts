import { AuditError, type Source, type SourceInput, type Segment, LIMITS } from "./contracts";

export function normalizeText(text: string) { return text.normalize("NFC").replace(/\s+/g, " ").trim(); }
export async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
export async function createSource(name: string, pages: SourceInput["pages"], kind: SourceInput["kind"] = "paste"): Promise<Source> {
  const canonicalPages = pages.map(p => ({number: p.number, text: normalizeText(p.text)}));
  if (canonicalPages.some(p => !p.text)) throw new AuditError("INVALID_INPUT", "One or more pages contain no readable text. Paste the policy text instead.");
  const hash = await sha256(JSON.stringify(canonicalPages));
  const id = `doc-${hash.slice(0,24)}`;
  const blocks = pages.flatMap(p => {
    const paragraphs = p.text.split(/\n\s*\n/).map(normalizeText).filter(Boolean);
    return paragraphs.map((text,index) => ({id: `${id}-p${p.number}-b${index+1}`, sourceId: id, page: p.number, text}));
  });
  return {id, hash, name: name.trim(), kind, pages, blocks};
}
export async function canonicalizeSources(inputs: SourceInput[]): Promise<Source[]> {
  const sources = await Promise.all(inputs.map(s => createSource(s.name, s.pages, s.kind)));
  if (sources.some((s,i) => s.id !== inputs[i].id)) throw new AuditError("STALE_BASELINE", "A source changed. Prepare a new audit before comparing.", 409);
  return sources;
}
export function segmentAnswer(answer: string): Segment[] {
  const segmenter = new Intl.Segmenter("en", {granularity: "sentence"});
  return [...segmenter.segment(answer)].filter(s => s.segment.trim()).map((s,i) => {
    const start = s.index + s.segment.length - s.segment.trimStart().length;
    return {id: `s${i+1}`, text: s.segment.trim(), start, end: start + s.segment.trim().length};
  });
}
export function validateSourceCollection(sources: SourceInput[]) {
  if (sources.length > LIMITS.documents) throw new Error(`You can add up to ${LIMITS.documents} sources.`);
  if (new Set(sources.map(s => s.id)).size !== sources.length) throw new Error("This document is already in the evidence packet.");
  if (sources.reduce((n,s) => n+s.pages.length,0) > LIMITS.pages) throw new Error(`The packet can contain up to ${LIMITS.pages} pages.`);
  if (sources.reduce((n,s) => n+s.pages.reduce((m,p) => m+p.text.length,0),0) > LIMITS.sourceChars) throw new Error(`The packet exceeds ${LIMITS.sourceChars.toLocaleString()} characters. Shorten it before continuing.`);
}
