import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const { discover } = vi.hoisted(() => ({discover: vi.fn()}));
vi.mock("../src/lib/server/evidence-search", () => ({discoverEvidence: discover}));
import { DELETE, GET, OPTIONS, POST } from "../src/app/api/mcp/route";
import { AuditError } from "../src/lib/contracts";

const URL = "https://secondopinion-ten.vercel.app/api/mcp";
const input = {claim: "Regular exercise improves sleep quality.", subject: "health", discover: true};
const result = {
  id: "screen-test", claim: input.claim, subject: "health", createdAt: "2026-10-11T00:00:00.000Z",
  method: "evidence-discovery", sources: [{id: "paper-1", title: "Exercise and sleep", publisher: "Test journal", url: "https://example.org/paper", kind: "paper", abstract: "An example passage.", retrievedAt: "2026-10-11T00:00:00.000Z"}],
  providers: [{name: "Test index", status: "ok", message: "One candidate source."}],
  notice: "Candidate evidence only; no factual verdict and no models were run.",
};
let test = 0;
let requestNumber = 0;

function request(body: unknown, extra: Record<string, string> = {}) {
  return new Request(URL, {method: "POST", headers: {
    "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25", "x-forwarded-for": `203.0.113.${test}`, ...extra,
  }, body: JSON.stringify(body)});
}
function rpc(method: string, params: unknown = {}, extra: Record<string, string> = {}) {
  return POST(request({jsonrpc: "2.0", id: ++requestNumber, method, params}, extra));
}

beforeEach(() => {
  test++;
  vi.stubEnv("APP_ORIGIN", "https://secondopinion-ten.vercel.app");
  vi.stubEnv("NODE_ENV", "production");
  discover.mockReset().mockResolvedValue(result);
});
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllEnvs();});

describe("Second Opinion stateless MCP transport", () => {
  it("completes the official SDK client handshake, tool discovery and tool call", async () => {
    const transport = new StreamableHTTPClientTransport(new globalThis.URL(URL), {
      requestInit: {headers: {"x-forwarded-for": `203.0.113.${test}`}},
      fetch: async (url, init) => {
        const value = new Request(url, init);
        return value.method === "POST" ? POST(value) : GET(value);
      },
    });
    const client = new Client({name: "second-opinion-integration-test", version: "1.0.0"});
    try {
      await client.connect(transport);
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["screen_claim"]);
      const response = await client.callTool({name: "screen_claim", arguments: input});
      expect(response.structuredContent).toEqual(result);
      expect(transport.sessionId).toBeUndefined();
      expect(discover).toHaveBeenCalledExactlyOnceWith(input, expect.any(AbortSignal));
    } finally { await client.close(); }
  });

  it("initializes without authentication or cross-request session state", async () => {
    const response = await rpc("initialize", {protocolVersion: "2025-11-25", capabilities: {}, clientInfo: {name: "protocol-test", version: "1"}});
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("mcp-session-id")).toBeNull();
    const payload = await response.json();
    expect(payload.result.serverInfo.name).toBe("second-opinion");
    expect(payload.result.capabilities.tools).toBeDefined();
    expect(payload.result.instructions).toContain("does not run multiple AI models");
    expect(discover).not.toHaveBeenCalled();
  });

  it("advertises bounded inputs and truthful read-only tool metadata", async () => {
    const response = await rpc("tools/list");
    expect(response.status).toBe(200);
    const {result: {tools}} = await response.json();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("screen_claim");
    expect(tools[0].annotations).toMatchObject({readOnlyHint: true, destructiveHint: false, openWorldHint: true});
    expect(tools[0].inputSchema.properties.claim.maxLength).toBe(800);
    expect(tools[0].inputSchema.required).toContain("discover");
    expect(tools[0].description).toContain("external research indexes");
    expect(discover).not.toHaveBeenCalled();
  });

  it("routes a public claim once and preserves the exact evidence report", async () => {
    const response = await rpc("tools/call", {name: "screen_claim", arguments: input});
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.result.isError).not.toBe(true);
    expect(payload.result.structuredContent).toEqual(result);
    expect(JSON.parse(payload.result.content[0].text)).toEqual(result);
    expect(discover).toHaveBeenCalledExactlyOnceWith(input, expect.any(AbortSignal));
  });

  it.each([
    {...input, discover: false},
    {claim: input.claim, subject: "health"},
    {...input, claim: "x".repeat(801)},
    {...input, subject: "invented"},
    {...input, passages: [{title: "Too long", text: "x".repeat(3001)}]},
    {...input, passages: [{title: "Unsafe attribution", text: "Claim passage", url: "file:///etc/passwd"}]},
    {...input, arbitraryEndpoint: "https://example.org"},
  ])("rejects invalid tool arguments before evidence discovery", async (argumentsValue) => {
    const response = await rpc("tools/call", {name: "screen_claim", arguments: argumentsValue});
    const payload = await response.json();
    expect(payload.result?.isError || payload.error).toBeTruthy();
    expect(discover).not.toHaveBeenCalled();
  });

  it("does not invent a report on provider exceptions or leak internal error text", async () => {
    discover.mockRejectedValue(new Error("internal provider URL?key=secret"));
    const response = await rpc("tools/call", {name: "screen_claim", arguments: input});
    const payload = await response.json();
    expect(payload.result.isError).toBe(true);
    expect(payload.result.structuredContent).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("secret");
    expect(payload.result.content[0].text).toContain("could not finish");
  });

  it("surfaces a safe explicit quota error as a tool failure", async () => {
    discover.mockRejectedValue(new AuditError("QUOTA", "Research provider is busy. Try again later.", 429));
    const response = await rpc("tools/call", {name: "screen_claim", arguments: input});
    const payload = await response.json();
    expect(payload.result.isError).toBe(true);
    expect(payload.result.content[0].text).toContain("provider is busy");
  });

  it("validates Origin on POST, GET, DELETE and OPTIONS", async () => {
    const response = await rpc("tools/list", {}, {Origin: "https://untrusted.example"});
    expect(response.status).toBe(403);
    for (const handler of [GET, DELETE, OPTIONS]) {
      expect((await handler(new Request(URL, {headers: {Origin: "https://untrusted.example"}}))).status).toBe(403);
    }
    const allowed = await rpc("tools/list", {}, {Origin: "https://chatgpt.com"});
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe("https://chatgpt.com");
    expect(allowed.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("rejects malformed JSON, unsupported content and large payloads", async () => {
    const malformed = new Request(URL, {method: "POST", headers: {"Content-Type": "application/json", "x-forwarded-for": `203.0.113.${test}`}, body: "{"});
    const bad = await POST(malformed);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe(-32700);
    expect((await POST(request({}, {"Content-Type": "text/plain"}))).status).toBe(415);
    expect((await POST(request({payload: "x".repeat(49 * 1024)}))).status).toBe(413);
    expect(discover).not.toHaveBeenCalled();
  });

  it("obeys the Streamable HTTP accept and notification rules", async () => {
    expect((await rpc("tools/list", {}, {Accept: "text/plain"})).status).toBe(406);
    const response = await POST(request({jsonrpc: "2.0", method: "notifications/initialized"}));
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
    expect((await GET(new Request(URL))).status).toBe(405);
    expect((await DELETE(new Request(URL))).status).toBe(405);
  });

  it("limits repeated evidence calls before contacting upstreams", async () => {
    for (let i = 0; i < 6; i++) {
      const response = await rpc("tools/call", {name: "screen_claim", arguments: input});
      expect((await response.json()).result.isError).not.toBe(true);
    }
    const limited = await rpc("tools/call", {name: "screen_claim", arguments: input});
    expect((await limited.json()).result.isError).toBe(true);
    expect(discover).toHaveBeenCalledTimes(6);
  });

  it("rejects unknown tools and methods without running a search", async () => {
    const tool = await rpc("tools/call", {name: "paid_audit", arguments: input});
    const method = await rpc("write/delete");
    const payload = await tool.json();
    expect(payload.result?.isError || payload.error).toBeTruthy();
    expect((await method.json()).error.code).toBe(-32601);
    expect(discover).not.toHaveBeenCalled();
  });
});
