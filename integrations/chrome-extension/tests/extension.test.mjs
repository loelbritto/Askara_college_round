import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { APP_ORIGIN, discoverEvidence, fullScreenUrl, safeSourceUrl, validateClaim, validateResponse } from "../shared.js";

const claim = "Antibiotics are effective against viral infections.";
const evidence = { id: "screen-example", claim, subject: "health", createdAt: "2026-10-11T12:00:00Z", method: "evidence-discovery", sources: [], providers: [], notice: "Review candidates, not a verdict." };

test("calls only the app evidence API with the edited claim, consent and no credentials", async () => {
  let called = 0;
  const result = await discoverEvidence(`  ${claim}  `, "health", undefined, async (url, options) => {
    called++;
    assert.equal(url, `${APP_ORIGIN}/api/screen`);
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    assert.equal(options.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(options.body), { claim, subject: "health", discover: true });
    return Response.json(evidence);
  });
  assert.equal(called, 1);
  assert.equal(result.method, "evidence-discovery");
});

test("refuses empty, ambiguous and oversized input before a network request", async () => {
  for (const value of ["", "tiny", "x".repeat(801)]) {
    await assert.rejects(discoverEvidence(value, "auto", undefined, () => { throw new Error("Network must not be called"); }), /at least 10|800 characters/);
  }
  assert.equal(validateClaim("a long\u0000 enough claim"), "a long enough claim");
});

test("uses only an allowlisted subject", async () => {
  await discoverEvidence(claim, "other-\"payload", undefined, async (_, options) => {
    assert.equal(JSON.parse(options.body).subject, "auto");
    return Response.json(evidence);
  });
});

test("does not allow executable or credential-bearing citation links", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,test", "file:///tmp/private", "https://user:secret@example.org", "not a url", "https://x.test/" + "x".repeat(2048)]) assert.equal(safeSourceUrl(value), null);
  assert.equal(safeSourceUrl("https://doi.org/10.1000/test"), "https://doi.org/10.1000/test");
});

test("claim handoff uses a URL fragment, never a request query", () => {
  const url = new URL(fullScreenUrl(`${claim} & # 100%`));
  assert.equal(url.origin, APP_ORIGIN);
  assert.equal(url.pathname, "/screen");
  assert.equal(url.search, "");
  assert.equal(new URLSearchParams(url.hash.slice(1)).get("claim"), `${claim} & # 100%`);
});

test("shows meaningful errors on rate limiting, HTML gateways and invalid JSON", async () => {
  await assert.rejects(discoverEvidence(claim, "auto", undefined, async () => new Response("wait", { status: 429 })), /Wait a minute/);
  await assert.rejects(discoverEvidence(claim, "auto", undefined, async () => new Response("<html>Gateway</html>", { headers: { "content-type": "text/html" } })), /webpage instead/);
  await assert.rejects(discoverEvidence(claim, "auto", undefined, async () => new Response("invalid", { headers: { "content-type": "application/json" } })), /unreadable data/);
  assert.throws(() => validateResponse({ verdict: "true" }), /unexpected response/);
});

test("bounds the response even when content-length is absent", async () => {
  await assert.rejects(discoverEvidence(claim, "auto", undefined, async () => new Response("x".repeat(262145), { headers: { "content-type": "application/json" } })), /too large/);
});

test("keeps permissions narrow and ships no remote executable scripts", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions, [`${APP_ORIGIN}/*`]);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.permissions.includes("cookies"), false);
  assert.match(manifest.content_security_policy.extension_pages, /script-src 'self'/);
  const html = await readFile(new URL("../popup.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /<script[^>]*src=["']https?:/);
  const script = await readFile(new URL("../popup.js", import.meta.url), "utf8");
  assert.doesNotMatch(script, /innerHTML|outerHTML|insertAdjacentHTML|eval\(/);
});
