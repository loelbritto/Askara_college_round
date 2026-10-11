import test from "node:test";
import assert from "node:assert/strict";
import { createReviewSession, STATE_KEY } from "../background.js";
const claim = "Regular physical activity improves sleep quality in adults.";
const result = { id: "report-1", claim, subject: "health", method: "evidence-discovery", sources: [{ id: "p1", title: "Sleep study", publisher: "Example", kind: "paper", url: "https://example.org/study" }], providers: [], notice: "Candidates for review." };
function memory(initial = {}) {
  let data = structuredClone(initial);
  return {
    async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, structuredClone(data[key]) ])); },
    async set(value) { data = { ...data, ...structuredClone(value) }; },
    async remove(key) { delete data[key]; },
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const get = (review) => review.dispatch({ type: "review:get" });
const start = (review, extra = {}) => review.dispatch({ type: "review:start", claim, subject: "health", ...extra });

test("draft and subject survive a new popup and a dormant worker without making a request", async () => {
  const storage = memory();
  let calls = 0;
  const discover = async () => { calls++; return result; };
  const review = createReviewSession({ storage, discover });
  await review.dispatch({ type: "review:draft", claim, subject: "health" });
  assert.equal((await get(review)).claim, claim);
  const restored = await get(createReviewSession({ storage, discover }));
  assert.equal(restored.claim, claim);
  assert.equal(restored.subject, "health");
  assert.equal(calls, 0);
});

test("search is acknowledged and persists before the request finishes; reopening does not restart it", async () => {
  const storage = memory(), network = deferred();
  let calls = 0;
  const review = createReviewSession({ storage, discover: () => { calls++; return network.promise; } });
  const running = await start(review);
  assert.equal(running.status, "running");
  assert.equal((await storage.get(STATE_KEY))[STATE_KEY].status, "running");
  assert.equal((await get(review)).runId, running.runId);
  assert.equal((await start(review)).runId, running.runId);
  assert.equal(calls, 1);
  network.resolve(result);
  await tick();
  assert.equal((await get(review)).status, "complete");
  const restored = await get(createReviewSession({ storage, discover: () => { throw new Error("No repeat request"); } }));
  assert.deepEqual(restored.result, result);
  assert.equal(restored.subject, "health");
});

test("clear erases draft and results and rejects a late response even if fetch ignores abort", async () => {
  const storage = memory(), network = deferred();
  let signal;
  const review = createReviewSession({ storage, discover: (_, __, value) => { signal = value; return network.promise; } });
  await start(review);
  const cleared = await review.dispatch({ type: "review:clear" });
  assert.equal(signal.aborted, true);
  assert.equal(cleared.claim, "");
  network.resolve(result);
  await tick();
  const after = await get(review);
  assert.equal(after.claim, "");
  assert.equal(after.result, null);
  assert.equal(after.status, "idle");
});

test("cancel retains the claim; late cancelled response cannot overwrite a new run", async () => {
  const first = deferred(), second = deferred();
  let calls = 0;
  const review = createReviewSession({ storage: memory(), discover: () => (++calls === 1 ? first.promise : second.promise) });
  await start(review);
  const cancelled = await review.dispatch({ type: "review:cancel" });
  assert.equal(cancelled.claim, claim);
  assert.equal(cancelled.status, "cancelled");
  const running = await start(review);
  first.resolve({ ...result, id: "old" });
  await tick();
  assert.equal((await get(review)).runId, running.runId);
  second.resolve({ ...result, id: "new" });
  await tick();
  assert.equal((await get(review)).result.id, "new");
});

test("a worker restart marks an orphaned running request interrupted and never retries automatically", async () => {
  const storage = memory({ [STATE_KEY]: { schema: 1, revision: 9, claim, subject: "health", status: "running", runId: "orphan" } });
  let calls = 0;
  const restored = await get(createReviewSession({ storage, discover: async () => { calls++; return result; } }));
  assert.equal(restored.status, "error");
  assert.match(restored.message, /interrupted/);
  assert.equal(restored.claim, claim);
  assert.equal(restored.runId, null);
  assert.equal(calls, 0);
});

test("timed out request becomes retryable and keeps draft", async () => {
  const review = createReviewSession({ storage: memory(), timeoutMs: 10, discover: (_, __, signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })) });
  await start(review);
  await new Promise(resolve => setTimeout(resolve, 25));
  const state = await get(review);
  assert.equal(state.status, "error");
  assert.match(state.message, /too long/);
  assert.equal(state.claim, claim);
});

test("stale popup updates cannot overwrite a newer context selection", async () => {
  const review = createReviewSession({ storage: memory() });
  const old = await get(review);
  await review.dispatch({ type: "review:selection", claim, subject: "health" });
  await assert.rejects(review.dispatch({ type: "review:draft", claim: "A stale different claim", subject: "auto", revision: old.revision }), /another extension window/);
  assert.equal((await get(review)).claim, claim);
});

test("rapid draft messages can finish after popup closure without losing newer keystrokes", async () => {
  const storage = memory();
  const review = createReviewSession({ storage });
  const { revision } = await get(review);
  const drafts = ["A", "A typed", "A typed complete claim"].map((text, index) => review.dispatch({ type: "review:draft", claim: text, subject: "health", revision, editorId: "popup-one", editId: index + 1 }));
  await Promise.all(drafts);
  assert.equal((await get(review)).claim, "A typed complete claim");
  await review.dispatch({ type: "review:draft", claim: "old late text", subject: "health", revision, editorId: "popup-one", editId: 2 });
  assert.equal((await get(review)).claim, "A typed complete claim");
  await review.dispatch({ type: "review:selection", claim, subject: "health" });
  await assert.rejects(review.dispatch({ type: "review:draft", claim: "old editor after selection", subject: "health", revision, editorId: "popup-one", editId: 4 }), /another extension window/);
});

test("invalid commands do not send requests and legacy handoff imports once", async () => {
  const storage = memory({ pendingClaim: { text: claim, at: 500, truncated: true } });
  let calls = 0;
  const review = createReviewSession({ storage, now: () => 1000, discover: async () => { calls++; return result; } });
  const state = await get(review);
  assert.equal(state.claim, claim);
  assert.match(state.message, /800/);
  assert.equal((await storage.get("pendingClaim")).pendingClaim, undefined);
  for (const invalid of [null, { type: "unknown" }, { type: "review:start", claim: "tiny", subject: "auto" }, { type: "review:start", claim, subject: "malicious" }]) await assert.rejects(review.dispatch(invalid));
  assert.equal(calls, 0);
});
