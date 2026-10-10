import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screenRequestSchema, type ScreenRequest } from "../src/lib/screening/contracts";
import { discoverEvidence, inferSubject } from "../src/lib/server/evidence-search";
import { OPTIONS, POST } from "../src/app/api/screen/route";

const fetchMock = vi.fn();
const base: ScreenRequest = {claim: "Vaccines cause autism", subject: "auto", discover: true};
let clientNumber = 0;
const crossrefPayload = {message: {items: [{DOI: "10.1234/research", title: ["<jats:p>Vaccine research</jats:p>"], publisher: "Research Press", published: {"date-parts": [[2024, 1, 2]]}, abstract: "<p>Bibliographic abstract.</p>"}]}};
const pmcPayload = {resultList: {result: [{id: "123456", source: "MED", doi: "10.1234/RESEARCH", title: "Vaccine research", pubYear: "2024", abstractText: "<p>An abstract with <b>context</b>.</p>", journalInfo: {journal: {title: "Research Journal"}}}]}};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
  vi.stubEnv("FACT_CHECK_API_KEY", ""); vi.stubEnv("SESSION_SECRET", ""); vi.stubEnv("APP_ORIGIN", "https://example.test");
  fetchMock.mockImplementation((url: URL) => Promise.resolve(Response.json(String(url).includes("europepmc") ? pmcPayload : crossrefPayload)));
});
afterEach(() => {vi.unstubAllEnvs(); vi.unstubAllGlobals();});

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/screen", {method: "POST", headers: {"Content-Type": "application/json", Origin: "https://example.test", "X-Forwarded-For": `test-client-${++clientNumber}`, ...headers}, body: typeof body === "string" ? body : JSON.stringify(body)});
}

describe("free evidence discovery", () => {
  it("requires explicit discovery consent and enforces request limits before any network call", async () => {
    for (const invalid of [{...base, discover: false}, {...base, discover: undefined}, {...base, claim: "x".repeat(801)}, {...base, passages: [{title: "Paper", text: "x".repeat(3001)}]}, {...base, passages: Array.from({length: 4}, () => ({title: "Paper", text: "Extract"}))}, {...base, passages: [{title: "Paper", text: "Extract", url: "javascript:alert(1)"}]}, {...base, endpoint: "https://untrusted.test"}]) {
      expect(screenRequestSchema.safeParse(invalid).success).toBe(false);
      await expect(discoverEvidence(invalid as ScreenRequest)).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves subject overrides and makes auto routing a simple, inspectable heuristic", () => {
    expect(inferSubject(base.claim, "auto")).toBe("health");
    expect(inferSubject("Quantum computing is advancing", "auto")).toBe("technology");
    expect(inferSubject("Carbon warms the climate", "auto")).toBe("science");
    expect(inferSubject("A new museum opened", "auto")).toBe("general");
    expect(inferSubject(base.claim, "general")).toBe("general");
  });

  it("deduplicates DOI records, preserves provenance, and makes no truth verdict", async () => {
    const result = await discoverEvidence(base);
    expect(result).toMatchObject({claim: base.claim, subject: "health", method: "evidence-discovery"});
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({title: "Vaccine research", abstract: "An abstract with context .", year: 2024, publisher: "Research Journal", url: "https://europepmc.org/article/MED/123456", kind: "paper"});
    expect(result.notice).toContain("not a truth verdict");
    expect(result.sources[0]).not.toHaveProperty("verdict");
    expect(result).not.toHaveProperty("confidence");
    expect(result.providers).toContainEqual(expect.objectContaining({name: "Google Fact Check", status: "not-configured"}));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options).toMatchObject({method: "GET", cache: "no-store", redirect: "error"});
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(options.headers).not.toHaveProperty("Authorization");
    }
  });

  it("keeps supplied passages unverified and never fetches their URLs or sends their text upstream", async () => {
    const supplied = {title: "My excerpt", text: "private attached excerpt", url: "https://127.0.0.1/internal"};
    const result = await discoverEvidence({...base, subject: "general", passages: [supplied]});
    expect(result.sources[0]).toMatchObject({title: supplied.title, abstract: supplied.text, url: supplied.url, kind: "supplied", publisher: "Supplied by you · unverified"});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.origin).toBe("https://api.crossref.org");
    expect(JSON.stringify([String(url), options])).not.toContain("private attached excerpt");
  });

  it("retains Crossref's complete record when a duplicate Europe PMC record has no passage", async () => {
    const metadataOnly = {resultList: {result: [{...pmcPayload.resultList.result[0], title: "PMC metadata title", abstractText: undefined}]}};
    fetchMock.mockImplementation((url: URL) => Promise.resolve(Response.json(String(url).includes("europepmc") ? metadataOnly : crossrefPayload)));
    const result = await discoverEvidence(base);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      id: expect.stringMatching(/^crossref-/),
      title: "Vaccine research", abstract: "Bibliographic abstract.",
      publisher: "Research Press", doi: "10.1234/research", url: "https://doi.org/10.1234/research",
    });
    expect(result.providers.filter((provider) => provider.status === "ok")).toHaveLength(2);
  });

  it("continues with partial evidence on a provider outage without exposing its error body", async () => {
    fetchMock.mockImplementation((url: URL) => Promise.resolve(String(url).includes("crossref") ? new Response("private provider failure", {status: 429}) : Response.json(pmcPayload)));
    const result = await discoverEvidence(base);
    expect(result.sources).toHaveLength(1);
    expect(result.providers).toContainEqual(expect.objectContaining({name: "Crossref", status: "unavailable"}));
    expect(JSON.stringify(result)).not.toContain("private provider failure");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps empty searches inconclusive", async () => {
    fetchMock.mockResolvedValue(Response.json({message: {items: []}}));
    const result = await discoverEvidence({...base, subject: "general"});
    expect(result.sources).toEqual([]);
    expect(result.providers[0]).toMatchObject({status: "ok", message: expect.stringContaining("does not refute")});
  });

  it.each([
    () => new Response("<html>challenge</html>", {headers: {"Content-Type": "text/html"}}),
    () => Response.json({unexpected: "schema"}),
    () => new Response("x".repeat(512 * 1024 + 1), {headers: {"Content-Type": "application/json"}}),
    () => new Response("{}", {headers: {"Content-Type": "application/json", "Content-Length": String(512 * 1024 + 1)}}),
  ])("rejects unusable upstream responses without retrying", async (factory) => {
    fetchMock.mockResolvedValue(factory());
    const result = await discoverEvidence({...base, subject: "general"});
    expect(result.sources).toEqual([]); expect(result.providers[0].status).toBe("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not let one canceled network request fail the whole evidence response", async () => {
    fetchMock.mockRejectedValue(new DOMException("private aborted query", "AbortError"));
    const controller = new AbortController(); controller.abort();
    const result = await discoverEvidence({...base, subject: "general"}, controller.signal);
    expect(result.providers[0].status).toBe("unavailable");
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private aborted query");
  });

  it("caps results and text, strips upstream markup, and removes unsafe links", async () => {
    fetchMock.mockResolvedValue(Response.json({message: {items: Array.from({length: 50}, (_, index) => ({title: [`Title ${index}<script>private executable text</script>`], publisher: "P".repeat(400), URL: "javascript:alert(1)", abstract: "x".repeat(9000)}))}}));
    const result = await discoverEvidence({...base, subject: "general"});
    expect(result.sources).toHaveLength(4);
    expect(result.sources.every((source) => source.abstract!.length <= 4000 && source.publisher.length <= 200 && !source.url)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private executable text");
  });

  it("uses optional Google lookup only with an explicit key and attributes external ratings", async () => {
    vi.stubEnv("FACT_CHECK_API_KEY", "private-fact-check-key");
    fetchMock.mockImplementation((url: URL) => Promise.resolve(Response.json(String(url).includes("googleapis") ? {claims: [{text: "The indexed original claim", claimReview: [{title: "Published check", url: "https://publisher.test/check", publisher: {name: "Review Publisher"}, reviewDate: "2024-08-03", textualRating: "Misleading"}]}]} : crossrefPayload)));
    const result = await discoverEvidence({...base, subject: "general"});
    const factCheck = result.sources.find((source) => source.kind === "fact-check");
    expect(factCheck).toMatchObject({publisher: "Review Publisher", publishedRating: "Misleading", reviewedClaim: "The indexed original claim"});
    expect(factCheck).not.toHaveProperty("abstract");
    const [url, options] = fetchMock.mock.calls.find(([url]) => String(url).includes("googleapis"))!;
    expect(url.origin).toBe("https://factchecktools.googleapis.com");
    expect(String(url)).not.toContain("private-fact-check-key");
    expect(options.headers["X-Goog-Api-Key"]).toBe("private-fact-check-key");
    expect(JSON.stringify(result)).not.toContain("private-fact-check-key");
  });

  it("bounds simultaneous Crossref calls within one instance", async () => {
    let complete!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => {complete = resolve;}));
    const first = discoverEvidence({...base, subject: "general"});
    const second = await discoverEvidence({...base, subject: "general"});
    expect(second.providers[0].status).toBe("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    complete(Response.json(crossrefPayload));
    expect((await first).sources).toHaveLength(1);
  });
});

describe("public discovery route boundaries", () => {
  it("accepts known site and extension origins without cookies or a pilot login", async () => {
    for (const origin of ["https://example.test", `chrome-extension://${"a".repeat(32)}`]) {
      const response = await POST(request({...base, subject: "general"}, {Origin: origin}));
      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
      expect(response.headers.has("Access-Control-Allow-Credentials")).toBe(false);
      expect(response.headers.has("Set-Cookie")).toBe(false);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect((await response.json()).method).toBe("evidence-discovery");
    }
  });

  it("rejects arbitrary websites, extension-looking origins, and credentialed preflights", async () => {
    for (const origin of ["https://evil.test", "https://example.test.evil.test", "chrome-extension://not-an-id", `chrome-extension://${"a".repeat(32)}.evil.test`]) {
      const response = await POST(request(base, {Origin: origin}));
      expect(response.status).toBe(403); expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    }
    const preflight = OPTIONS(new Request("https://example.test/api/screen", {method: "OPTIONS", headers: {Origin: "https://example.test", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,authorization"}}));
    expect(preflight.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("supports a minimal extension preflight", () => {
    const origin = `chrome-extension://${"b".repeat(32)}`;
    const response = OPTIONS(new Request("https://example.test/api/screen", {method: "OPTIONS", headers: {Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"}}));
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  });

  it("rejects missing consent, malformed JSON, wrong content types, and streamed oversized bodies", async () => {
    expect((await POST(request({...base, discover: false}))).status).toBe(400);
    expect((await POST(request("{bad json"))).status).toBe(400);
    expect((await POST(request(base, {"Content-Type": "text/plain"}))).status).toBe(415);
    expect((await POST(request(JSON.stringify({...base, claim: "x".repeat(50 * 1024)})))).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rate limits repeated requests before upstream work", async () => {
    const headers = {"X-Forwarded-For": "one-rate-limited-client"};
    for (let index = 0; index < 6; index++) expect((await POST(request({...base, discover: false}, headers))).status).toBe(400);
    const response = await POST(request(base, headers));
    expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("60");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
