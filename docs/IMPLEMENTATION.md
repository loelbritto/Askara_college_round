# Roadmap implementation and evidence ledger

Scope: [unaltered user-approved roadmap](ROADMAP-SCOPE.md). Started 10 October 2026. The goal includes all three phases; local tests do not satisfy live, human-study, or hosted-release gates.

| Requirement | Status | Required completion evidence |
| --- | --- | --- |
| Real audit, citations, source removal, comparison and export | Pending external setup | Recorded run using a verified unpaid Gemini project |
| Existing development, held-out, paired and stability evaluations | Pending external setup | Actual model outputs, measured metrics and inspected failures |
| Incomplete and zero-claim results never imply success | Implemented and locally verified | Unit regressions and production browser checks passed |
| Five unfamiliar users complete the guided task | Participants needed | Consent, task observations, completion and comprehension results |
| Repeatable short demonstration | Script prepared; live run pending | STUDY-PROTOCOL.md includes a three-minute script |
| Inspectable structured policy conditions, exceptions and references | Implemented and locally verified | Validated exact references, separate human edits and browser checks |
| Actionable uncertainty, missing context and conflicts | Implemented; semantic quality pending live evaluation | Distinct next actions and model schema; authored examples checked |
| Proposed/manual corrections, diff, acceptance and fresh audit | Implemented and locally verified | Original preserved, new baseline, word diff, quota recovery; transport stubbed |
| Policy-version impact analysis | Implemented for linked individual audits | Explicit metadata and conservative exact-claim alignment; browser checked |
| Expanded 40-scenario / 160–200-claim evaluation material | Prepared, not human-labelled | 40 scenarios / 160 candidate claims, split integrity checks, blind packets |
| Independent annotation and adjudication | Human reviewers needed | Two genuine independent labels, disagreements and adjudication |
| Coverage, false support, citation relevance, conditions, stability and cost metrics | Runner implemented; measurements pending | Exact-alignment metrics, false support, per-verdict precision/recall, latency/usage, stability; semantic coverage and relevance require humans |
| Individual identity, revocation and authorization | Implemented; hosted integration pending | Account transport tests and actual local PostgreSQL roles/RLS/revocation tests passed |
| Explicit persistence, restore, versions and deletion | Implemented and locally verified; hosted integration pending | 26 browser scenarios passed, including file round trips and stubbed cloud version/delete flows; SQL isolation/delete tests passed; real cloud round trip pending |
| Privacy and retention configuration | Explicit-save behavior and disclosure implemented | Actual provider retention/backup/deployment settings still require verification |
| Limits shared across server instances | Atomic SQL implementation tested locally | PGlite has one connection; actual hosted multi-connection verification pending |
| Monitoring, tracing, disable control and rollback | Request tracing and local recovery verified; hosted operations pending | All handled API routes emit safe request references; eight compiled-HTTP checks cover disable/re-enable and pilot secret rotation. Hosted alerts, provider recovery and compatible-deployment rollback remain pending |
| Adversarial documents and output validation | Local application boundaries verified; live semantic/hosted evaluation pending | Five adversarial route/adapter tests and one compiled-browser restore/render/print/export test passed. Existing four injection scenarios retain their development/held-out splits. See ADVERSARIAL-VERIFICATION.md |
| Hosted end-to-end release | Hosting configuration needed | Actual deployed workflow, security and recovery verification |
| Preserve landing design, free examples, explicit calls and bounded input | Existing; maintain | Browser regressions and no paid or automatic fallback |

Configuration inspection on 10 October 2026 found no Gemini key/free-tier confirmation, Supabase configuration, or hosting token. Secret values were not printed. The user explicitly requested continued building and will configure Supabase later. Gemini setup and real participant/annotation arrangements remain pending. No live accuracy, human usability, independent annotation or hosted release is claimed.

Database verification uses PGlite as a development-only dependency; it executes the actual migrations against PostgreSQL with test auth claims and roles. It does not replace Supabase gateway checks or genuine multi-connection concurrency. See ACCOUNTS-AND-STORAGE.md for setup and remaining checks.

The opt-in `verify:supabase` script is prepared for two dedicated empty test accounts. Three local preflight tests verify no network access without live opt-in, configuration and Free-tier confirmation. Its real gateway checks, concurrent saves/quota reservations and copied-token revocation have not run. This does not change the pending hosted statuses above.

Retrieval at larger scale, OCR, multilingual support and external integrations are deferred in the approved roadmap until the small-document workflow performs well; they are not substitutes for the listed release gates.

## Release audit and required external inputs

The 10 October 2026 release audit re-read the approved scope, inspected current implementation/evidence files, checked credential-presence flags without printing values, and inspected the actual study packets. The local production health endpoint returned 200, with model and individual-account configuration both false. No live evaluation result files or Supabase integration result files were present. Reviewer A and B each have zero completed cases; the usability packet has zero completed participants; adjudication is not started. No project deployment linkage was present in this workspace.

The next required evidence cannot be supplied by additional authored fixtures or local tests:

1. A configured, verified unpaid Gemini project is needed for the live demonstration, original/expanded evaluations, semantic citation and condition checks, and live adversarial/stability results.
2. The user-deferred Supabase setup and two dedicated test accounts are needed for the prepared gateway verifier, followed by independent application-instance, expiry/ban/outage and retention checks.
3. Two genuine independent reviewers and five unfamiliar consenting participants are needed for annotation, adjudication, usability and manual-versus-assisted outcomes. Prepared blank packets are not observations.
4. An authenticated eligible free hosting destination is needed for deployment, actual hosted workflow/headers, monitoring configuration and compatible-release rollback verification.

The implementation and local preview are preserved. No paid fallback, fabricated human result, or simulated live-service result is an acceptable replacement for these gates. Resume the corresponding verification work when its external input is ready; preserve all three phases as the completion scope.
