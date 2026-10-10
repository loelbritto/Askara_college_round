# Free screening release — 11 October 2026

## Delivered

- `/screen`: one-claim public research search with subject override, explicit disclosure consent, original source links, optional private local passage, up to three selected passages, two on-device NLI models, disagreement/abstention, exact excerpt inspection, reviewer notes and JSON export.
- `/api/screen`: bounded credential-free Crossref/Europe PMC discovery. Optional Google Fact Check configuration stays visibly absent when no key exists. It does not call AgentRouter, DeepSeek, Gemini, or a paid inference provider.
- `/api/mcp`: official SDK Streamable HTTP tool for ChatGPT and Claude, with portable ChatGPT plugin metadata and account-specific setup instructions. MCP returns evidence; it does not claim to run the browser models.
- `/connect`: Chrome extension download and connector installation guide. MV3 source and reproducible ZIP packaging are in `integrations/` and `scripts/`.
- Signed server research receipts with verification and tamper rejection. Local models/notes are outside the signature. See [defensibility](DEFENSIBILITY.md) for precise limits; software is not copyproof.

## Measured verification

- 203 deterministic tests passed across 22 files before final DOI deduplication; the final affected suites passed 83 tests including the added deduplication regression, bringing the suite to 204 cases. Tests use mocked upstream transports where specified.
- All 35 Playwright scenarios passed against the compiled production app on Node 24, including existing landing, review, evidence, accounts, export, error recovery and new claim workflows. New views passed automated desktop/mobile accessibility checks and explicit stylesheet/layout assertions. Account and hosted language-model flows in this suite are simulated.
- Eight extension tests passed. The real unpacked extension was loaded in an isolated Edge profile; explicit request, selection handling, safe rendering, no cookies and no silent transmission were verified.
- Both pinned q8 models completed real CPU inference for one matching and one contradictory fictional library claim. A network-disabled repeat returned identical logits. This is a smoke test, not a quality benchmark.
- Both models completed actual browser/WASM inference on the matching fictional claim under the production CSP. The cold production browser run took 106.1 seconds including model downloads. No claim/passage text was found in external requests; no research request occurred for local-only mode. Runtime files were served by the application.
- One real request through the locally served production evidence API returned eight research records, including three abstracts. Receipt verification accepted the unchanged record and rejected a changed claim. This confirms reachability and record integrity, not evidence relevance or factual accuracy.

## Boundaries still visible

The original full-answer policy audit still requires a provider that accepts this application. The existing AgentRouter token/client restriction is not bypassed; the new free path runs independently. Optional Google fact-check search, hosted Supabase account integration, and ChatGPT/Claude account installation are not proven by these checks. The extension is manually installable and not store-published.

Search ranking, source quality, model agreement and receipt validity do not certify truth. The compact English NLI models share training families; they do not replace a domain expert. Larger independent evaluation and durable shared rate limiting remain necessary before claiming broad production quality or reliable public-scale availability. No paid service or new cloud account was purchased.

See [research foundations](SCREENING-RESEARCH.md), [model verification](LOCAL-MODELS.md), [connector setup](AI-CONNECTORS.md), and [extension setup](CHROME-EXTENSION.md). Older [release notes](RELEASE.md) remain historical and describe separate uncompleted roadmap gates.
