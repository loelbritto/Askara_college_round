export const APP_ORIGIN = "https://secondopinion-ten.vercel.app";
export const MAX_CLAIM_LENGTH = 800;
export const SUBJECTS = ["auto", "health", "science", "technology", "general"];

export function normalizeClaim(value) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim() : "";
}

export function validateClaim(value) {
  const claim = normalizeClaim(value);
  if (claim.length < 10) throw new Error("Add a specific claim of at least 10 characters.");
  if (claim.length > MAX_CLAIM_LENGTH) throw new Error("Choose one claim of 800 characters or fewer.");
  return claim;
}

export function safeSourceUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function fullScreenUrl(claim) {
  const url = new URL("/screen", APP_ORIGIN);
  url.hash = new URLSearchParams({ claim: validateClaim(claim) }).toString();
  return url.href;
}

export function validateResponse(value) {
  if (!value || value.method !== "evidence-discovery" || !Array.isArray(value.sources) || !Array.isArray(value.providers)) {
    throw new Error("The evidence service returned an unexpected response. Try again later.");
  }
  return {
    ...value,
    sources: value.sources.slice(0, 20).filter((source) => source && typeof source.title === "string" && typeof source.publisher === "string" && ["paper", "fact-check", "supplied"].includes(source.kind)),
    providers: value.providers.slice(0, 10).filter((provider) => provider && typeof provider.name === "string" && typeof provider.message === "string"),
  };
}

export async function discoverEvidence(claim, subject, signal, fetchImpl = fetch) {
  const response = await fetchImpl(`${APP_ORIGIN}/api/screen`, {
    method: "POST",
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claim: validateClaim(claim), subject: SUBJECTS.includes(subject) ? subject : "auto", discover: true }),
    signal,
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error("Too many checks at once. Wait a minute, then try again.");
    if (response.status === 404) throw new Error("The evidence service is not deployed yet. Try again after the website update.");
    throw new Error("The evidence service could not finish this check. Your claim is still here; try again.");
  }
  if (!(response.headers.get("content-type") || "").includes("application/json")) {
    throw new Error("The service returned a webpage instead of evidence. Try again later.");
  }
  const body = response.body;
  if (!body) throw new Error("The evidence service returned an empty response.");
  const reader = body.getReader();
  const parts = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 262144) {
        await reader.cancel();
        throw new Error("The response was too large. Try a shorter, more specific claim.");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const part of parts) { buffer.set(part, offset); offset += part.byteLength; }
  try {
    return validateResponse(JSON.parse(new TextDecoder().decode(buffer)));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("The evidence service returned unreadable data. Try again later.");
    throw error;
  }
}
