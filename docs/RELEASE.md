# DeepSeek and chat workspace update - 10 October 2026

- Added the explicit `AI_PROVIDER=deepseek` route to the official `deepseek-flash` chat completions API. Gemini remains available; there is no provider fallback. DeepSeek uses prepaid credit and does not require Gemini free-tier confirmation.
- New chat-style composer and sidebar; direct policy attachments/paste; live demo preparation without an API call; optional step-by-step guide; original landing page retained.
- Health reports missing configuration names, never values. A requested audit continues once after sign-in. Existing citation validation, report comparison, revision, storage and export controls remain in place.
- Validation: 117 unit tests across 18 files passed; production build and TypeScript passed. Browser regression: 29/30 passed in the reduced-concurrency full run; the remaining saved-review test passed separately after updating its old heading expectation. All three new composer tests passed, including desktop/mobile axe checks, no duplicate request after sign-in, and preserved draft on credit exhaustion. The initial eight-worker run encountered local resource contention and obsolete UI selectors; it is not claimed as passing.
- No real DeepSeek API call was made, no key was added to the repository, and no paid balance or model accuracy was verified. A real deployed smoke test is still needed. [Deployment and demo instructions](DEEPSEEK-VERCEL.md).

The records below describe the earlier Gemini-only release and its evidence at that time.

---

# Second Opinion release status

Verified locally on 10 October 2026 with Node.js 24. **The full three-phase roadmap remains incomplete.** Real Gemini evaluation, independent human annotation/usability, configured Supabase integration, and a hosted release are not yet established.

## Current verification

- **97 unit, route, archive, tracing and database tests passed across 15 files.** These include original evidence/baseline validation, incomplete results, rule interpretations, corrections, metric calculations, account transport failures, archive integrity, storage routes, request-reference correlation and log privacy. Gemini and Supabase HTTP transports are mocked in these tests.
- **Five additional adversarial tests passed** in a targeted run, bringing the repository to 102 deterministic tests across 16 files. They exercise real audit/adapter boundaries with a mocked SDK: role-like document text, access bypass attempts, fake source blocks, unknown action fields, forged completion/evidence, and action-only output. This is application-boundary evidence, not model injection accuracy.
- Three integration-verifier preflight tests passed in a separate targeted run (105 deterministic tests now present across 17 files). The new opt-in Supabase gateway verifier makes zero network requests by default and rejects missing configuration or Free-tier confirmation before network access. Its actual live checks remain unexecuted; this preparation is not gateway/concurrency evidence. Setup and scope are in [accounts and storage](ACCOUNTS-AND-STORAGE.md).
- **Seven of those tests execute the actual SQL migrations in PGlite (PostgreSQL in WASM).** They check roles/RLS, cross-user list/read/save/delete isolation, revoked/expired/banned sessions, immutable versions, stale writes/deletes, cascading deletion, payload/version/account limits, and quota admission. After adding null-argument checks, these seven tests were rerun and passed. Test gateway claims are simulated. PGlite has one exclusive connection, so this does not establish hosted JWT handling or independent-connection concurrency.
- **All 26 Playwright scenarios passed against the compiled production server** with one worker in about 2.4 minutes. This includes the original landing/onboarding/review/ingestion/comparison/export/error-recovery flows, rule editing, correction diffs, policy-version impact, account sign-in, complete file download/refresh/restore, corrupted evidence rejection, cloud version/conflict/deletion UI, and fresh-baseline enforcement after restore. Cloud and model responses are stubbed where used; file round trips exercise the real implementation.
- One additional adversarial browser scenario passed against that production app: hostile HTML/Markdown remained inert through archive restore, source inspection, review, print and exports. No injected element, script marker, external request or mutation request was observed. There are now 27 browser scenarios; the new scenario was run separately. [Threat-specific evidence and limitations](ADVERSARIAL-VERIFICATION.md).
- Production build and TypeScript passed. The route set includes the six product pages and audit/session/health/workspaces APIs.
- Eight additional HTTP checks passed against isolated compiled production processes: disable/re-enable, authenticated and anonymous rejection, signed no-evidence comparison recovery, missing-provider rejection, and pilot secret rotation. All eight response references matched one metadata-only application trace. [Recorded recovery evidence](../artifacts/verification-recovery.json). No cloud service or model call was used; this does not establish hosted rollback or Supabase recovery.
- Automated axe checks passed in the browser suite, including the mobile save dialog and account sign-in. A 390 px save-dialog screenshot was visually inspected. This is not a full accessibility certification.
- Production HTTP checks returned 200, no-store caching, a nonce CSP and frame denial. Health honestly reports pilot mode with model/account services unconfigured. Client chunks contained none of the searched server-secret key identifiers; no real account credentials were configured during this check.
- Installing the development-only PGlite package updated the lockfile; npm reported zero known vulnerabilities across 131 audited packages at installation time.
- CI configuration exists, but no remote CI run or remote deployment is claimed.

## Implemented behavior

| Area | Evidence and boundary |
| --- | --- |
| Cinematic landing and guided start | Preserved; desktop/mobile/reduced-motion regressions passed |
| Audit, fixed-claim evidence comparison and exports | Local sample and stubbed transport checks; actual model quality pending |
| Rules and actionable uncertainty | References validated; separate human annotations; semantic quality pending |
| Answer/context/policy revisions | New audit baseline, word diff, original/history preserved, failure recovery checked |
| Policy version impact | Explicit version metadata and exact unique-claim alignment; unmatched wording requires review |
| Evaluation material | Original 12 development claims, 24 held-out claims, eight paired scenarios; expanded 40 scenarios/160 candidate claims and blind reviewer packets prepared |
| Evaluation metrics | Exact-alignment proxy, per-verdict precision/recall, false-support denominators, stability, latency and usage implemented; real measurements pending |
| Download/open review files | Real round trip of documents, reports, rule edits and notes; bounded schema/reference checks; no saved session tokens |
| Individual identity | Optional Supabase mode implemented; revocation/RLS SQL and transport tests pass; hosted integration pending |
| Explicit account storage | Owner-scoped immutable versions, stale-write checks, deletion and caps implemented; actual cloud round trip pending |
| Shared quota reservations | Atomic private-table SQL implementation; actual multi-connection verification pending |
| Privacy | Explicit save only, destination and deletion disclosures; actual provider retention/backup settings pending |
| Adversarial input/output | Local access, source reconstruction, output schema and inert-rendering boundaries verified; actual model manipulation and hosted checks pending |
| Operations | Every handled API route has metadata-only completion/failure traces and response references. Local disable/re-enable and pilot secret-rotation rehearsal passed; hosted alerting, provider recovery and deployment rollback remain |

## Outstanding completion gates

1. Configure a verified unpaid Gemini project and run a real audit → source comparison → correction → fresh audit → export workflow.
2. Run development, untouched held-out, paired and stability evaluations within verified quotas; inspect failures and obtain human semantic citation/coverage/condition judgments.
3. Have two actual reviewers independently annotate the expanded material and adjudicate disagreements. Observe five unfamiliar participants; report real completion/comprehension observations and manual-versus-assisted task results.
4. The user will configure Supabase later. Apply both migrations and verify the actual auth gateway, user isolation, revocation, separate-connection save/quota races, retention settings and failure recovery. Follow [accounts and storage](ACCOUNTS-AND-STORAGE.md).
5. Complete hosted monitoring/alerting, provider recovery and deployment rollback exercises, plus live model and hosted adversarial evaluation. Local tracing, process recovery and application-boundary adversarial checks have passed; they do not fulfill the remaining hosted or semantic gates.
6. Authenticate suitable free hosting, deploy, configure the intended firewall limits, and verify the complete workflow and headers at the actual hosted URL. Reassess plan eligibility before commercial use.

No paid service, cloud database, real user account, model call, email invitation, or deployment was created by these local checks. The last configuration inspection found no Gemini/free-tier confirmation, Supabase setup, or hosting token. Remaining integration requirements are not fulfilled by authored examples, mocks, or local SQL tests.

Scope and progress: [full roadmap](ROADMAP-SCOPE.md), [implementation ledger](IMPLEMENTATION.md), [study protocol](STUDY-PROTOCOL.md), [operations](OPERATIONS.md).

Visual records: [mobile save dialog](../artifacts/save-review-mobile.png), [policy next action](../artifacts/policy-next-action.png), [desktop landing](../artifacts/landing-desktop.png), [mobile landing](../artifacts/landing-mobile.png).
