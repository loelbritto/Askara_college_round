# Individual accounts and explicit storage

Implemented 10 October 2026. Local PostgreSQL-in-WASM tests execute the migrations, roles, RLS policies, revoked-session checks, storage bounds, and version conflicts. API transport and account UI are tested with stubs. **A configured Supabase project, its actual JWT gateway, network concurrency, backup/retention settings, and hosted end-to-end behavior have not yet been verified.**

## What users can do now

In the workspace, choose **Save or open a review**. Downloading a review file requires no account or provider call. The JSON contains document text, historical reports, revision links, reviewer notes, and edited policy interpretations. It is not encrypted. Opening a file validates its schema, size, source identities, exact references and locations, claim links, and history. It asks before replacing the current workspace. A failed restore leaves current work intact. Session signatures are stripped on both save and restore. Restored live reports require a fresh audit before source comparisons.

Cloud saving is an optional explicitly configured path. Each account owns up to five reviews, each with up to twenty immutable saved versions; each version is at most 2 MiB. A global 200 MiB payload allowance bounds this small pilot. JSONB representation can be slightly larger than a downloaded compact JSON file; the database may reject a near-limit file. Save failures never replace local state. No automatic save or upload happens while editing.

Users can open earlier versions, save another version, save a separate copy, or delete a review and all its database versions. Optimistic version checks reject stale saves/deletes from another tab. Deleting cloud data does not delete local downloads, browser memory, or provider backups. Clearing browser memory does not delete cloud data. The operator must document actual provider backup retention before accepting non-public documents.

## Free account setup

1. Use a Supabase **Free** organization/project; do not activate a trial, paid plan, add-on, or billing upgrade. Verify its current limits and eligibility. No project has been created by this implementation.
2. Apply `supabase/migrations/202610100001_identity_limits.sql`, then `202610100002_saved_workspaces.sql`, using the project's SQL editor or migration tooling. Apply each migration once. Keep the default exposed schema as `public`; do not expose `second_opinion_private` or `auth`.
3. For this closed pilot, disable public sign-ups. Provision individual consenting pilot users through the operator's dashboard process. Configure the provider's password security and recovery process. This app does not send invitations or implement open registration/password recovery.
4. Set these only in the ignored local environment file or hosting secret configuration:

   ```text
   AUTH_MODE=supabase
   SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   SUPABASE_SECRET_KEY=YOUR_SERVER_SECRET_KEY
   SUPABASE_FREE_TIER_CONFIRMED=true
   SESSION_SECRET=YOUR_RANDOM_32_OR_MORE_CHARACTER_SECRET
   APP_ORIGIN=YOUR_EXACT_APPLICATION_ORIGIN
   ```

   The keys must use the current `sb_publishable_` and `sb_secret_` formats. Never use `NEXT_PUBLIC_` for the secret key, paste real keys into chat, or put them in shell command arguments. The Free confirmation is an operator declaration, not a billing API check.
5. Restart the application. Account storage can work independently of Gemini; live auditing still requires a verified unpaid Gemini project and its separate configuration.
6. Complete the hosted checks below before treating the managed path as released. Keep public/fictional documents until provider data handling is appropriate for the intended use.

## Identity and authorization

All auth/database requests originate on the application server. The browser receives only an HttpOnly, SameSite=Strict cookie, Secure in production. The access token is never returned as JSON or put in browser storage. The app intentionally does not retain refresh tokens: when the provider access token expires, users sign in again and their unsaved draft stays in the tab. Choose a practical provider access-token lifetime (normally around one hour). Session expiry invalidates the old comparison baseline.

`so_current_session` checks the authenticated JWT subject/session against `auth.sessions`, session deadlines, and user bans. This handles revocation even when a copied JWT has not expired. Every account-protected request checks this function; the database RLS policies repeat that boundary. A missing or unavailable account service denies access and does not fall back to pilot authentication. Invalid `AUTH_MODE` also fails closed.

Local sign-out revokes the current provider session before clearing local data. The save dialog also offers **Sign out on all devices**. An expired session cannot claim successful all-device revocation; the user must sign in again. A backend outage is reported as a failure rather than a successful logout.

Data RPCs always use the user's token and publishable key. They never use the service-role privilege to read or write a user's review. Owner IDs are derived from `auth.uid()`, never supplied by clients. Direct updates/deletes/inserts into saved tables are not granted to authenticated users. Version writes and deletion occur only through narrowly granted functions with explicit ownership checks and an empty `search_path`.

## Shared request limits

Only the server secret key can execute `so_take_limit`. It performs an atomic PostgreSQL upsert against a private table. Keys are HMAC digests, not raw emails or user IDs. The server applies 3 audits/minute/account, 10 audits/minute/project, 5 login attempts/minute/email, 20 login attempts/minute/project, and 20 storage operations/minute/account. Failed requests can consume these allowances. There are no automatic retries or paid fallbacks.

PGlite tests prove SQL behavior on its single connection, including queued limit attempts. They do **not** prove Supabase network concurrency, the provider's billing status, or end-to-end multi-instance behavior. Test those against the actual hosted project. The legacy `AUTH_MODE=pilot` path remains instance-local and is not the production identity boundary.

## Hosted acceptance checks still required

### Repeatable gateway verifier

`scripts/verify-supabase.ts` prepares the real gateway portion of these checks. It has **not run against Supabase yet**. Its preflight tests passed locally: complete credentials without `--live`, missing configuration, and missing Free-tier confirmation all made zero network requests.

After configuring the Free project and applying the migrations, provision two dedicated test accounts with no saved reviews. The verifier does not create accounts, send invitations, or apply migrations. Put their credentials in ignored `.env.local` using `SUPABASE_TEST_A_EMAIL`, `SUPABASE_TEST_A_PASSWORD`, `SUPABASE_TEST_B_EMAIL`, and `SUPABASE_TEST_B_PASSWORD`. Do not use a participant's normal account. Each run creates local-scope sessions and signs out those sessions during cleanup.

Run `npm run verify:supabase` first. It reports missing setup without printing credentials and performs no network requests or mutations. When the dedicated accounts and free plan are ready, explicitly run:

```sh
npm run verify:supabase -- --live --check-limit-reset
```

The live command uses the actual auth and Data API gateway. It tests two distinct active identities, anonymous denial, owner isolation through RPC and direct RLS reads, denied direct writes, a same-version save race, preservation of the old version, 12 simultaneous quota reservations against a fresh key, stale deletion, cascading deletion, and immediate rejection of a copied signed-out token. The optional reset flag waits 61 seconds after the reservations before checking expiry. It does not call Gemini, activate billing, or change provider settings.

The runner accepts only empty test accounts before creating a synthetic workspace. It waits for concurrent mutations to settle and attempts to remove only the workspace ID it created. It signs out its acquired sessions, caps requests at 80, sets timeouts, and makes no automatic retries. Each live attempt writes a credential-free result to `artifacts/supabase-integration-RUN-ID.json`. A failed check exits with status 2 and keeps the run incomplete. If a request's outcome is unknown or cleanup fails, inspect the named run ID and synthetic workspace in the test account; the tool does not claim cleanup succeeded. Private quota rows expire and are cleaned by later limiter calls.

This verifies observed gateway behavior, not a particular number of backend database connections. The separate application-instance, browser, ban/expiry, outage, billing and retention checks below still remain. A successful gateway run must not be presented as the complete hosted release.

- Sign in as two real test users; save as A; verify B cannot list/read/update/delete A's review, including guessed IDs and direct Data API calls.
- Copy a test session token only inside a private test harness; sign out; verify that both application routes and RLS reject it immediately. Never record the token in logs/artifacts.
- Verify local versus all-device logout, account ban, expiry, malformed credentials, provider outage, and configured origin rejection.
- Save, restore, choose an old version, race two saves with the same expected version, and confirm exactly one wins. Verify stale deletion fails and successful deletion removes every version.
- Submit concurrent audit-limit reservations through two independent connections/application instances. Confirm only the configured number are admitted; then verify expiry/reset. This check requires no Gemini calls.
- Check the actual provider schema, function grants, RLS, paused-project behavior, storage cap, and backup/retention configuration.
- Confirm secrets are absent from generated client bundles, HTTP responses, logs, and exported files.

## References

- [Supabase sessions and immediate revocation](https://supabase.com/docs/guides/auth/sessions)
- [Sign-out scopes](https://supabase.com/docs/guides/auth/signout)
- [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Current API key formats and privileges](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase pricing](https://supabase.com/pricing)
- [PGlite, including its single-connection boundary](https://pglite.dev/docs/)
