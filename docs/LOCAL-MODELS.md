# Local passage comparison models

Second Opinion uses two separately trained natural-language-inference (NLI) models to compare a claim with a passage. The passage is the premise; the claim is the hypothesis. These models predict entailment, contradiction, or neutrality **relative to the supplied passage**. They cannot determine that the passage itself is true, current, applicable, or complete.

## Pinned weights and provenance

The source of truth is `src/lib/screening/local-models.ts`. Both model IDs and full Git revisions are pinned; the browser worker and verification script use those same definitions.

| Model | ONNX weights | Pinned revision | Original model |
| --- | --- | --- | --- |
| DeBERTa v3 xsmall | `Xenova/nli-deberta-v3-xsmall` | `2a4f614a701367a02d51389039afc998faeda637` | [cross-encoder/nli-deberta-v3-xsmall](https://huggingface.co/cross-encoder/nli-deberta-v3-xsmall) |
| RoBERTa base | `onnx-community/nli-roberta-base-ONNX` | `d0af16bf61a3740cc7744f16bc0b71ef9f9f3e47` | [cross-encoder/nli-roberta-base](https://huggingface.co/cross-encoder/nli-roberta-base) |

The upstream model cards list Apache-2.0 and describe training on SNLI and MultiNLI. Their upstream benchmark results are not results for this product or for these quantized browser builds. The [DeBERTa ONNX conversion](https://huggingface.co/Xenova/nli-deberta-v3-xsmall) and [RoBERTa ONNX conversion](https://huggingface.co/onnx-community/nli-roberta-base-ONNX) identify their source models. Keep attribution and applicable license notices when redistributing weights. We download pinned public artifacts; we do not include them in the Git repository.

## Reproducible CPU smoke test

Install the project's locked dependencies, then run from the repository root:

```sh
node --import tsx scripts/verify-local-models.ts
```

The first run downloads the two public q8 ONNX builds and tokenizer/config files (allow a few hundred MB and several minutes, depending on the connection). Models run sequentially on local CPU using `@huggingface/transformers`; no inference API key or paid model call is used. The script removes ambient authorization headers from public downloads. Downloads still contact Hugging Face and its storage infrastructure.

The model cache lives in ignored `tmp/local-model-cache/`. The detailed result is written to ignored `tmp/local-model-verification.json`, including revisions, raw label mapping, logits, normalized model scores, runtime version, load time, and per-case inference time. A repeat using only the completed cache is:

```sh
node --import tsx scripts/verify-local-models.ts --offline
```

The offline report is saved separately as `tmp/local-model-verification-offline.json`. It loads directly from the pinned revision's cache directory and blocks every remote fetch; this avoids a Transformers.js 4.3.1 tokenizer-discovery path that otherwise looks up repository metadata without forwarding cache/revision options.

The only inputs are these fixed fictional sentences:

- Passage: “The library opens at 9 AM on weekdays and is closed on Sundays.”
- Matching claim: “The library is closed on Sundays.” Expected relation: entailment.
- Contradictory claim: “The library is open on Sundays.” Expected relation: contradiction.

The script runs four inferences, validates finite three-label outputs with the application's `relationFromLogits`, preserves original labels, and exits unsuccessfully if loading/inference fails or a fixture's expected relation is not returned. This is a compatibility smoke test, not an accuracy evaluation. It does not read user documents or environment files.

## Interpretation and deployment limits

Two votes are not two independent pieces of factual evidence. The models use different architectures but share training task/data families and may share mistakes. Softmax scores are model outputs, not calibrated probabilities that a claim is true. Agreement and a conservative display threshold do not remove the need to inspect evidence.

The browser worker uses local inference after the user opts into model loading. Model files require substantial bandwidth, memory, and CPU; the browser may clear cached files. A successful Node CPU check does not establish browser/WASM support on every device. Browser checks remain necessary, and an unavailable model must stay visibly unavailable rather than become an invented vote. If input is shortened or a token limit is exceeded, the UI must make the reduced context explicit.

For a defensible quality claim, separately evaluate held-out passage/claim pairs across negation, quantities, exceptions, entity mismatch, dated evidence, irrelevant passages, and conflicting sources. Measure each model and the disagreement/abstention policy; do not report a two-example pass rate as product accuracy.

## Verification record

Executed 11 October 2026 (Asia/Calcutta) on Windows x64, Node 24.19.0, Transformers.js 4.3.1, CPU/q8, two intra-operation threads. Both pinned models downloaded and ran. The first run took 111.591 seconds including downloads and model initialization. The complete eight-file cache was 225,321,596 bytes (about 225 MB).

| Model | Raw label on matching claim | Raw label on contradictory claim | First-run inference times (matching / contradictory) |
| --- | --- | --- | --- |
| DeBERTa v3 xsmall | `entailment` | `contradiction` | 37 ms / 21 ms |
| RoBERTa base | `entailment` | `contradiction` | 34 ms / 22 ms |

Both configurations provided `0: contradiction, 1: entailment, 2: neutral`. A separate offline repeat completed all four comparisons with the same logits/labels in 3.386 seconds, including local initialization, and made zero download requests. These timings describe this machine and this short synthetic input, not a latency promise. Raw results remain in the two ignored JSON reports. This confirms model compatibility and label wiring for these fixtures; broader model quality and browser/WASM behavior require their own verification.

An actual isolated Edge browser run also completed both models using WASM on the matching library fixture: both displayed “Suggests support.” Cold downloads plus inference took 122.2 seconds on this machine. The check observed no research-search request and no claim/passage text in external requests. All selected runtime files were served from the application. The initial test caught a missing ORT asyncify variant; the build now copies each installed WASM variant so runtime selection does not depend on a third-party code CDN. Reproduce with `MODEL_TEST_URL=http://127.0.0.1:3000/screen node scripts/verify-browser-models.mjs` (set the environment variable using your shell's syntax). The script uses a separate browser test profile under ignored `output/` and does not touch the user's profile. Browser cache is origin-specific; a new deployment/origin may download again.
