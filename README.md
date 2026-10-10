# Second Opinion

Second Opinion checks an AI answer against a selected packet of business policies. Reviewers inspect atomic claims, exact evidence passages, and hypothetical changes when a source is excluded. The answer and claim propositions stay fixed during comparison.

The repository contains a working local application, authored examples, DeepSeek and Gemini adapters, validation tests, browser tests, and live-evaluation tooling. **Provider accuracy, available credit and hosted integration are not established by authored samples or mocked tests.** See [release status](docs/RELEASE.md).

The cinematic homepage combines a clear starting action with layered policy visuals and an interactive evidence story. First-time visitors can open a filled-in example; the workspace opens with a chat-style answer composer, policy attachments and a single Check answer action. An optional step-by-step guide remains available. Six connected pages share the same dark visual identity, responsive navigation, and an in-memory workspace. See [design and visual records](docs/DESIGN.md).

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Cinematic product overview, interactive evidence story, guided example, and an entry for your own documents |
| `/workspace` | Source ingestion, audit, claim search, evidence comparison, reviewer notes, and exports |
| `/examples` | Searchable library of three authored cases, category filters, and a downloadable synthetic policy pack |
| `/lab` | Four interactive verdict challenges with explanations; no model request |
| `/methodology` | Workflow, research foundations, validation boundaries, and document-handling FAQ |
| `/present` | Claim-by-claim presentation of the current report, exact citations, reviewer notes, keyboard navigation, and full-screen controls |

Navigation preserves drafts, sources, reports, rule interpretations, and reviewer notes in React memory. Use **Save or open a review** to download and restore a complete review file, or explicitly save versions to an individually authenticated account when configured. Refreshing or clearing removes unsaved memory; it does not delete saved copies. Opening another library example asks before replacing the current workspace. Presentation links require a report in the same tab; they do not share or save a report.

## Start locally

Use Node.js 24 and npm. Dependencies are recorded in `package-lock.json`.

```sh
npm ci
node scripts/configure-local.mjs
npm run dev
```

Open http://127.0.0.1:3000. Choose **Try with an example**, then **Continue to answer**, **Continue to check**, and **Show example results**. Documents and an answer are pre-filled; no API key or model charge is needed. Sample findings are authored for the exact example packet and are labelled throughout the interface. Editing the packet requires a live audit; there is no simulated general-purpose verifier.

## DeepSeek live demo on Vercel

Follow [the DeepSeek deployment guide](docs/DEEPSEEK-VERCEL.md). Set `AI_PROVIDER=deepseek`, `DEEPSEEK_API_KEY` and `DEEPSEEK_MODEL=deepseek-flash`, plus the shared session/origin settings. This uses prepaid credit; it does not require a Gemini key or `FREE_TIER_CONFIRMED=true`. The server never retries or switches providers automatically.

Choose **Set up a live demo** to load fictional policies and an answer without an API call, then **Check answer** to request a real audit. Practice examples remain explicitly authored.

For Gemini live audits, edit the ignored `.env.local`:

1. Obtain a Gemini API key for a project **without an active billing account**. Verify the model's active request and token quotas in Google AI Studio.
2. Add the key as `GEMINI_API_KEY` and set `FREE_TIER_CONFIRMED=true` only after checking the project's unpaid status. This setting is an operator declaration, not a billing API check.
3. The local setup script already generates a random `PILOT_ACCESS_CODE` and `SESSION_SECRET`; keep both private. The code is at least 12 characters, and the signing secret at least 32.
4. Restart the server after changing environment variables. Enter the configured pilot code to open a live session.

The default model is `gemini-3.8-flash`. There are no model fallbacks, automatic retries, or paid search tools. Optional Supabase Free accounts and explicit database saves require separate configuration; see [accounts and storage](docs/ACCOUNTS-AND-STORAGE.md). Provider quotas limit use. Free availability can change and must be checked for the actual project. No unlimited-service or universal-zero-cost guarantee is made for an account with billing enabled.

## Workflow

1. Choose **Try with an example** or **I have my own documents**.
2. In step 1, add PDF, TXT, or pasted policies. Open **View text** to inspect extraction, then continue. PDF extraction happens in the browser using the same-version, same-origin PDF.js worker.
3. In step 2, paste the AI answer and optionally its original question. Step 3 summarizes the selected policies and answer before checking. Unavailable live checking is explained before submission; a configured live service requests a pilot code when needed.
4. Choose **Review first issue** on the results. Select a statement to inspect its judgment, qualifiers, exact quotations, issue category, and evidence strength.
5. Exclude sources and click **Compare selected sources**. The original report remains available. Before/after findings show changed judgments, remaining evidence, and excluded original passages.
6. Search claims, record a note beside the evidence, and mark reviewed claims. These annotations are scoped to each report and do not modify the model's findings or certify correctness.
7. Inspect policy conditions and record any human interpretation separately. Use **Revise answer**, **Add context**, or **Update a policy** to prepare a change and run a fresh audit. Review history preserves the original.
8. Choose **Present**, export a brief/JSON, or print. Use **Save or open a review** for a complete restorable file, including history and notes. Configured accounts can save immutable versions, open older versions, or explicitly delete saved reviews.

Supported inputs are English selectable-text PDFs and UTF-8 TXT/pasted text: 5 documents, 20 total pages, 5 MB per file, 60,000 source characters, 2,000 answer characters, 1,000 context characters, 20 claims, and a 512 KiB API body. Scanned/empty pages, encrypted or corrupt PDFs, duplicate document identities, and oversized inputs are rejected without silent truncation.

## Verify

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run evaluate -- --suite heldout
```

The last command is a dry run and makes no API request. Local Windows browser tests use installed Microsoft Edge. On Linux/macOS, install the test browser once with `npx playwright install chromium`. CI uses Chromium and the production build.

Live evaluation is opt-in and uses only synthetic fixtures:

```sh
npm run evaluate -- --suite development --live --max-calls 4 --gap-ms 6000
npm run evaluate -- --suite heldout --live --max-calls 8 --gap-ms 6000
npm run evaluate -- --suite paired --live --max-calls 10 --gap-ms 6000
npm run evaluate -- --suite stability --live --max-calls 9 --gap-ms 6000
```

Choose the gap using your actual free-tier RPM/TPM limits; six seconds is a starting value, not a guarantee. Run suites only when quota permits. Errors or the explicit call budget stop evaluation; no automatic retry occurs. Results go to ignored `evaluation-results/`. Citation relevance and ambiguous claim alignment require independent human review. See [evaluation protocol](docs/RESEARCH.md).

## Deployment

See [operations](docs/OPERATIONS.md) for Vercel Hobby deployment, secure environment configuration, quota handling, and rollback. Set Node.js to 24 and use `npm run build`. Use the included `vercel.app` address. Do not enable Pro trials, paid add-ons, a custom domain, or linked Gemini billing for the ₹0 demonstration.

The project assumes personal, noncommercial Hobby use. A commercial launch requires reassessing host eligibility, provider terms, and operating requirements. The default shared-code pilot is not enterprise identity; the optional account path still requires hosted integration verification.

## Data handling

Documents and reports start in browser memory. Explicit downloads create unencrypted JSON files on the user’s device. Optional account saves send document text, reports, and notes to Supabase; clearing the tab does not delete saved versions. Restores validate references and strip access signatures, and historical live reports require a fresh audit before comparisons. Live audits send extracted text through the application server to Gemini. There is no automatic document retention or raw-payload logging. Saved account history is opt-in; actual provider backup retention must be verified before confidential use. Gemini requests use `store:false`, no Files API, no tools, and no explicit provider cache. This does not eliminate all provider retention or processing. Unpaid Gemini terms can permit product improvement and human review; do not submit confidential, sensitive, or personal information.

Research and technical details: [research](docs/RESEARCH.md), [architecture](docs/ARCHITECTURE.md), [release checklist](docs/RELEASE.md).
