# Second Opinion operating instructions

## Local configuration

Use Node.js 24. `node scripts/configure-local.mjs` creates `.env.local` only when absent and never prints credentials. Add an API key for a project without linked billing; verify active model quotas in AI Studio. Set `FREE_TIER_CONFIRMED=true` after verification. Do not copy private keys into chat, screenshots, commits, or public issue reports.

`PILOT_ACCESS_CODE` must have at least 12 characters and `SESSION_SECRET` at least 32. The generated values exceed these limits. `AUDITS_ENABLED=false` disables the audit endpoint. `APP_ORIGIN` is the exact allowed origin (no path); local development accepts localhost/127.0.0.1 port 3000 when unset.

## Vercel Hobby deployment

No Codex plugin is required. Deployment can use the official Vercel CLI from this directory, without a Git remote, or a repository import through the Vercel website.

For the CLI path, use an interactive terminal with Node.js 24:

```sh
npx vercel login
npx vercel link
```

Complete sign-in in your own browser and select the intended Hobby account/project. Before deploying, configure the production environment values in the Vercel dashboard, or use `npx vercel env add NAME production` for each variable in `.env.example`. Enter secrets at the interactive prompt; do not put secret values in command arguments or shell history. Set `APP_ORIGIN` to the project's assigned HTTPS production domain. Use distinct production session credentials.

Then deploy from the project directory:

```sh
npx vercel deploy --prod
```

The first deployment is public at the assigned domain, with live auditing behind the application access code. `.vercelignore` excludes local environment files, credentials directories, generated outputs, and test artifacts from the source upload. The PDF worker is recreated during the build. CLI authentication and an actual deployment have not yet been completed for this workspace.

Official command references: [login](https://vercel.com/docs/cli/login), [deployment](https://vercel.com/docs/cli/deploy), [environment variables](https://vercel.com/docs/cli/env).

1. Sign in to the intended Vercel Hobby account. Verify that the project is eligible personal, noncommercial use and remains on Hobby. Do not start a Pro trial or enable metered external add-ons.
2. Deploy this Next.js repository using Node.js 24, install command `npm ci`, and build command `npm run build`. The same-version PDF worker is copied during installation/build.
3. Use the assigned `vercel.app` domain. Configure the six server environment values from `.env.example` and set `APP_ORIGIN` to the exact HTTPS production origin. Use separate production secrets; never expose a `NEXT_PUBLIC_` API key.
4. Redeploy after setting the final origin. A deployment without complete environment configuration still exposes the clearly labelled sample; it must not be described as a working live verifier.
5. In the project's **Firewall → Configure → New Rule**, create one rule matching **Request Method = POST** and **Request Path starts with /api/**. Choose **Rate Limit**, **Fixed Window**, **60 seconds**, **15 requests**, counting key **IP**, and the default **429** action. Review and publish the rule. Confirm the account is on Hobby and the pricing screen reflects its included allowance before accepting any pricing terms. Do not enable paid usage to satisfy this step.
6. Verify the firewall with non-sensitive, invalid login requests in a controlled test; requests above the configured limit must receive 429. Counters are per region, so this is not a global quota or an exact total request ceiling. The app's instance-local limiter is an additional control, not a replacement for the hosted rule.
7. Run health, session, live audit, citation navigation, fixed-claim comparison, empty-selection, expired access, input-limit, export, print, and mobile checks against the deployed URL.

As of 10 October 2026, Vercel documents one Hobby rate-limit rule per project and an included allowance of 1,000,000 allowed requests. Verify those limits in the actual account before release. [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)

Hobby includes usage caps and noncommercial restrictions. Verify current terms: [Hobby](https://vercel.com/docs/plans/hobby), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Gemini quotas](https://ai.google.dev/gemini-api/docs/rate-limits), [provider data terms](https://ai.google.dev/gemini-api/terms). Do not promise that hosting or AI service continues after free allowances are exhausted.

## Monitoring and recovery

Every handled API response has a server-generated `X-Request-Id`, including success, access denial, quota errors, and storage conflicts. Error bodies include the same `error.requestId`. Use this reference to find the corresponding JSON application log; do not ask reviewers to send documents or credentials to diagnose a transport failure. Client-supplied request IDs are ignored. Framework failures before the route handler runs may not have this application trace.

The application emits `request_completed` or `request_failed`, request ID, fixed operation name, status and elapsed milliseconds. Audit traces may also include audit/compare mode, completeness and allowlisted nonnegative integer token counts. Failure traces include the application error code. It does not log URLs, email addresses, user/session IDs, document titles/text, answers, model output, exceptions/stacks, tokens or API keys. A logging sink exception does not change a completed save into a failed response. Infrastructure and provider logs have separate retention and metadata settings; these application controls do not imply zero provider logging.

No hosted collector or alert is configured yet. At release, verify the hosting account's included logging/alert capabilities and retention before enabling them. If alerts require payment, retain manual inspection until a free option is verified. Suggested initial operational checks are three consecutive health-transport failures, five `INTERNAL`/`MODEL_UNAVAILABLE`/`ACCOUNT_UNAVAILABLE` failures in ten minutes, and any sustained quota rejection. Tune these to observed pilot traffic. HTTP 200 health is liveness only: inspect `configured`, `enabled`, and `accountsConfigured`; health does not call Gemini. Expected 401, 409 and deliberate `DISABLED` results should not be counted as unexpected service failures.

On quota errors, preserve user inputs and reports, show the quota message, and wait for the provider reset. Do not rotate keys/projects to evade quotas, enable billing, retry in a hidden loop, or switch to a paid model.

On invalid model output, preserve the original report and ask the reviewer to retry explicitly. On comparison-integrity failure, start a fresh audit. On suspected credential disclosure, set `AUDITS_ENABLED=false`, rotate the exposed key/access code/signing secret, redeploy, and retest. Signing-secret rotation invalidates existing session and baseline signatures.

The disable flag takes effect in restarted/redeployed processes and rejects new authenticated audit requests before quota reservation or model access. It does not cancel requests already in flight, disable account storage, or update an older deployment still receiving traffic. Verify every active deployment after changing it. For an immediate provider credential incident, also revoke the affected provider key through its controls.

Run `npm run build` and then `npm run verify:recovery` for the repeatable local rehearsal. The script launches and stops only its own isolated production processes on a temporary loopback port, explicitly clears provider credentials, uses random temporary signing secrets and synthetic documents, and leaves `.env.local` unchanged. It checks disabled health/audits, anonymous rejection, re-enable after restart, a signed comparison without selected evidence, rejection when no provider is configured, and session/baseline invalidation after signing-secret rotation. It also checks response-to-log correlation and that captured application traces omit the synthetic private values. Results are written to `artifacts/verification-recovery.json` only after all assertions pass. This is a local process-recovery check, not a hosted deployment rollback or a live provider test.

For a bad release, use the previous verified compatible application deployment as rollback. Optional account storage now has additive SQL migrations; do not drop saved tables as a rollback shortcut. Preserve stored versions and migration history. Keep public/synthetic test fixtures and the lockfile with the release. A local startup still needs internet and Gemini quota for live analysis.

Before claiming hosted rollback verified, record both deployment IDs and the database migration version, verify that the chosen previous release understands the stored archive/schema version, disable new audits, route to that release, and inspect its actual response headers and readiness. Using synthetic consenting test accounts, verify login, owner isolation, an existing saved version, a new save and deletion, then re-enable and run the bounded live-audit workflow. Record failures and restoration evidence. A successful local restart does not satisfy this gate.

## Individual accounts and saved reviews

The default `AUTH_MODE=pilot` remains the original shared-code path. For real individual accounts, revocation, explicit cloud save/restore and shared request limits, follow [accounts and storage](ACCOUNTS-AND-STORAGE.md). The optional Supabase path is implemented and locally tested, but is not yet configured or verified on a hosted project. The user will configure it later.

Rotating `SESSION_SECRET` invalidates pilot sessions and all comparison signatures. It does not revoke Supabase-issued JWTs; revoke those sessions through provider sign-out/admin controls. Account-protected routes and database RLS check session revocation. A failed provider logout must not be treated as successful revocation.

The current database tests use PGlite, an actual PostgreSQL engine with one connection and simulated gateway claims. Hosted gateway behavior, independent connection races, project pause/recovery, and actual backup retention remain release gates. No cloud database has been created, charged, or populated by the local checks.

## Release evidence

Run type checking, deterministic tests, the production build, browser tests, and a dependency audit. CI repeats type/test/build/browser checks; CI itself must run before claiming a green remote check. Record live evaluation separately from fixtures/mocks. See `docs/RELEASE.md` for the current verified and outstanding items.
