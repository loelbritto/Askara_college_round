import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AutoModelForSequenceClassification, AutoTokenizer, env } from "@huggingface/transformers";
import { LOCAL_MODELS, relationFromLogits, type Relation } from "../src/lib/screening/local-models";

// Fixed fictional inputs only. This script never reads documents, .env files, or API keys.
const passage = "The library opens at 9 AM on weekdays and is closed on Sundays.";
const fixtures: Array<{id: string; claim: string; expected: Relation}> = [
  {id: "matching", claim: "The library is closed on Sundays.", expected: "entailment"},
  {id: "contradictory", claim: "The library is open on Sundays.", expected: "contradiction"},
];
const offline = process.argv.includes("--offline");
assert(process.argv.slice(2).every((argument) => argument === "--offline"), "Only the optional --offline flag is supported.");
const cacheDir = resolve("tmp/local-model-cache");
const outputFile = resolve(offline ? "tmp/local-model-verification-offline.json" : "tmp/local-model-verification.json");
await mkdir(cacheDir, {recursive: true});
env.allowLocalModels = offline;
env.allowRemoteModels = !offline;
env.useFSCache = true;
env.cacheDir = cacheDir;
let downloadRequests = 0;
// The fixed models are public. Avoid implicitly forwarding an ambient Hugging Face token.
env.fetch = (input, init = {}) => {
  if (offline) throw new Error("Remote requests are disabled for the offline verification.");
  downloadRequests++;
  const headers = new Headers(init.headers);
  headers.delete("Authorization"); headers.delete("Cookie");
  return fetch(input, {...init, headers, signal: AbortSignal.timeout(180_000)});
};

type ModelResult = {
  id: string; revision: string; dtype: "q8"; device: "cpu"; loadMs: number;
  labelMapping: Record<string, string>;
  cases: Array<{id: string; expected: Relation; rawLabel: string; label: Relation; logits: number[]; scores: Record<Relation, number>; elapsedMs: number; matchesExpected: boolean}>;
  error?: string;
};
const results: ModelResult[] = [];
const runStarted = performance.now();
for (const spec of LOCAL_MODELS) {
  const result: ModelResult = {id: spec.id, revision: spec.revision, dtype: "q8", device: "cpu", loadMs: 0, labelMapping: {}, cases: []};
  results.push(result);
  console.log(JSON.stringify({event: "loading", id: spec.id, revision: spec.revision, offline}));
  let model: Awaited<ReturnType<typeof AutoModelForSequenceClassification.from_pretrained>> | undefined;
  try {
    const loadStarted = performance.now();
    const options = {revision: spec.revision, cache_dir: cacheDir, local_files_only: offline};
    // Transformers.js 4.3.1's tokenizer file discovery does not forward cache/revision
    // options. A direct pinned cache path avoids remote discovery in offline mode.
    const modelLocation = offline ? resolve(cacheDir, spec.id, spec.revision) : spec.id;
    const tokenizer = await AutoTokenizer.from_pretrained(modelLocation, options);
    model = await AutoModelForSequenceClassification.from_pretrained(modelLocation, {
      ...options, device: "cpu", dtype: "q8",
      session_options: {intraOpNumThreads: 2, interOpNumThreads: 1, logSeverityLevel: 3},
    });
    result.loadMs = Math.round(performance.now() - loadStarted);
    const config = model.config as unknown as {id2label?: Record<string, string>};
    assert(config.id2label && typeof config.id2label === "object", "The pinned model must publish its label mapping.");
    result.labelMapping = {...config.id2label};
    for (const fixture of fixtures) {
      const started = performance.now();
      const inputs = tokenizer(passage, {text_pair: fixture.claim, padding: false, truncation: false});
      const output = await model(inputs);
      const logits = Array.from(output.logits.data as Float32Array, Number);
      const mapped = relationFromLogits(logits, result.labelMapping);
      const rawLabel = result.labelMapping[String(logits.indexOf(Math.max(...logits)))];
      const row = {id: fixture.id, expected: fixture.expected, rawLabel, ...mapped, logits, elapsedMs: Math.round(performance.now() - started), matchesExpected: mapped.label === fixture.expected};
      result.cases.push(row);
      console.log(JSON.stringify({event: "inference", model: spec.id, ...row}));
    }
  } catch (error) {
    // Only fixed synthetic inputs are used; keep failure diagnostics brief and bounded.
    result.error = error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 600) : "Unknown local model failure";
    console.error(JSON.stringify({event: "model-failed", model: spec.id, error: result.error}));
  } finally { await model?.dispose(); }
}
const complete = results.every((result) => !result.error && result.cases.length === fixtures.length);
const matchesExpected = complete && results.every((result) => result.cases.every((row) => row.matchesExpected));
const report = {
  checkedAt: new Date().toISOString(), runtime: {node: process.version, platform: process.platform, arch: process.arch, transformers: env.version},
  offline, downloadRequests, complete, matchesExpected, elapsedMs: Math.round(performance.now() - runStarted),
  fixtures: {passage, claims: fixtures}, models: results,
  interpretation: "Four fixed passage/claim inferences verify installation, pinned weights, input ordering, and label handling only. They are not an accuracy benchmark, calibrated probability estimate, or real-world truth test.",
};
await writeFile(outputFile, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({event: "complete", complete, matchesExpected, elapsedMs: report.elapsedMs, outputFile}));
if (!matchesExpected) process.exitCode = 1;
