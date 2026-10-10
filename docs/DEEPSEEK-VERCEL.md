# DeepSeek live demo on Vercel

The workspace now supports DeepSeek's official API as an explicit alternative to Gemini. This is prepaid usage, authorized for this project by its owner; it is not labelled free. No new provider SDK is required.

## Configure your existing Vercel project

In **Settings > Environment Variables**, choose **Production** and set:

| Name | Value |
| --- | --- |
| `AI_PROVIDER` | `deepseek` |
| `DEEPSEEK_API_KEY` | Your private DeepSeek API key |
| `DEEPSEEK_MODEL` | `deepseek-flash` |
| `AUTH_MODE` | `pilot` (unless you already configured Supabase accounts) |
| `PILOT_ACCESS_CODE` | Your private demo access code, at least 12 characters |
| `SESSION_SECRET` | A random secret, at least 32 characters |
| `APP_ORIGIN` | Your exact public HTTPS origin, without a path |
| `AUDITS_ENABLED` | `true` |

Keep all values server-side; do not add `NEXT_PUBLIC_`. Never put an API key in the answer composer, a policy, GitHub, or chat. Gemini's key and `FREE_TIER_CONFIRMED` are not required when `AI_PROVIDER=deepseek`. Supabase storage remains optional and retains its separate setup requirements.

Generate a signing secret locally if needed:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Save and **redeploy**. Environment changes do not modify existing deployments. Open `/api/health`: expect `configured: true`, `enabled: true`, `provider: "deepseek"`. `missing` contains setting names only. Readiness does not test the key, balance or live model. Use the domain matching `APP_ORIGIN`; a different deployment-preview hostname will be rejected by origin checks.

## Demonstrate it in about two minutes

1. Open `/workspace` and choose **Set up a live demo**. This only loads fictional policies and an answer; it does not spend credit.
2. Open a policy attachment and inspect its text. Point out the proposed answer's refund deadline and return conditions.
3. Choose **Check answer**. Enter the pilot access code if asked. A successful sign-in continues the requested check once.
4. Show the actual returned report, inspect the first flagged claim, and open its evidence. Do not promise a particular verdict before the live model runs.
5. Exclude a policy and explicitly compare. Corrections, new comparisons and re-audits may use another paid request. An empty source comparison uses no model.
6. Export the report or open **Present**. Use Save or open a review to keep a restorable file before refreshing.

**Explore an example** uses authored findings and no API credit. The interface clearly distinguishes that from a live result.

## Request and credit boundaries

- One server request per uncached audit; fixed official HTTPS endpoint, no tools, redirects, automatic retries or provider/model fallback.
- 45-second timeout; non-thinking mode; JSON output; maximum 10,000 output tokens. Schema, claim coverage and exact source references are checked before rendering.
- Incomplete or invalid output becomes an error, not fabricated results. Balance exhaustion and rate limits preserve the draft.
- Source, input, session and quota restrictions still apply. Pilot throttling is per server instance; it is not a global dollar budget. Configure the existing documented Vercel firewall rule for public demos.
- The app cannot enforce a precise $3 account-wide cap or control provider auto-recharge. Monitor the provider dashboard; disable auto-recharge if that is your intended limit. Cancelling a browser request may not reverse provider charges already incurred.
- No real DeepSeek credit has been consumed by automated tests. Tests use mocked provider responses; a deployed live smoke test with your private key remains necessary.

## API references checked for this implementation

- [DeepSeek first API call and current model names](https://api-docs.deepseek.com/)
- [Chat completions API](https://api-docs.deepseek.com/api/create-chat-completion/)
- [JSON output requirements](https://api-docs.deepseek.com/guides/json_mode/)
- [Vercel environment variables and redeployment](https://vercel.com/docs/environment-variables/managing-environment-variables)

This update supersedes Gemini-only setup instructions in older audit and release records. Those documents remain historical evidence, not proof that the DeepSeek deployment has been validated.
