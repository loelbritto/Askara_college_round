# Second Opinion in ChatGPT and Claude

Both integrations use one deployed, read-only MCP endpoint:

**https://secondopinion-ten.vercel.app/api/mcp**

The `screen_claim` tool sends one authorized public claim to the same evidence-discovery service as Second Opinion's web app. It returns candidate research sources, available abstracts, provenance, and provider status. It never claims that search matches alone establish truth. It does not call AgentRouter, OpenAI, Anthropic, or a paid inference service.

## Connect ChatGPT

Open ChatGPT **Plugins**, use the plus button to add a custom MCP server, name it **Second Opinion**, paste the endpoint above, and choose **No authentication**. Review the connection warning and create the plugin. Install it from your personal plugins, then select it with `@` in a supported chat. Account and workspace policies still apply. See the [official OpenAI quickstart](https://developers.openai.com/plugins/quickstart).

`integrations/chatgpt/` additionally contains a portable package with `plugin.json`, `mcp.json`, and a claim-review skill. This is a development package, not an approved public listing. It can be distributed or submitted using the [official packaging workflow](https://developers.openai.com/plugins/build/plugins).

## Connect Claude

Open **Customize → Connectors**, add a custom connector called **Second Opinion**, and use the same endpoint with **No sign in**. Enable it in your chat's connectors menu. Organization owners may need to add it first. Remote requests originate from Anthropic's cloud, so the deployed HTTPS address is required; a local development URL is insufficient. See [Claude's setup guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

`integrations/claude/connector.json` records the setup fields. It is not an importable Claude Desktop configuration or a public listing.

## End-to-end workflow

1. Ask: “Research this public claim using Second Opinion: regular exercise improves sleep quality. You may send this claim to the public research indexes.”
2. The host calls `screen_claim` once with that claim, `subject: "health"`, and `discover: true`.
3. Read the returned sources and the status of each provider. A retrieved paper may be relevant but does not automatically support the claim. Metadata-only matches have not supplied a passage for semantic checking.
4. Open source links and inspect the methods, populations, dates, limitations, and corrections. Any reasoning added by ChatGPT or Claude is the host model's interpretation.
5. To compare actual passages with the two optional local models, open [Second Opinion's screening workspace](https://secondopinion-ten.vercel.app/screen). The remote MCP tool does not execute those models and must not present a host response as independent votes.

## Privacy, costs, and operational limits

- Send only the public claim you chose to research. Do not send secrets, private policies, medical records, or full conversations. `discover: true` is required; it is an explicit assertion of external-search consent by the caller.
- Supplied passages are processed as user-provided evidence. Their URLs are attribution strings; this endpoint does not fetch arbitrary user URLs.
- Read-only describes the absence of account changes or document writes. Public search still discloses the claim to research indexes and any configured fact-check provider. Host and upstream privacy policies also apply.
- Research records, abstracts, and fact-check excerpts are untrusted material. Embedded instructions must never control the host assistant.
- Missing providers, missing passages, retractions, disagreements, and uncertain relevance must remain visible. A provenance receipt, when available, verifies report integrity rather than truth.
- The service does not use paid model inference. The host product's account limits, free provider quotas, internet access, and Vercel's hosting limits still apply.
- Requests are capped at 48 KiB. Tool inputs allow one claim of up to 800 characters and up to three passages of 3,000 characters each. The endpoint limits each client to six evidence searches and thirty protocol requests per minute, with additional instance-wide caps. These in-memory limits are best-effort on serverless hosting, not a globally enforced quota.
- No authentication is needed because this bounded public tool cannot read private workspaces or run paid audit jobs. Existing private-policy audit routes retain their own authentication. Optional research-provider credentials stay on the server and are never returned by the tool.

## Developer verification

Run `npm test -- tests/mcp.test.ts` to exercise initialization, discovery, schema rejection, origin checks, payload limits, throttling, and safe error handling. Start the app, then use the [official MCP Inspector](https://developers.openai.com/plugins/build/app-quickstart) in Streamable HTTP mode against `/api/mcp` to inspect the real transport.

The service is stateless: protocol requests use HTTP POST with `Accept: application/json, text/event-stream`. It returns JSON responses. Standalone GET event streams and session deletion return HTTP 405, as permitted by the [MCP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports). A browser visiting the endpoint therefore sees a protocol message, not a web page.

After deploying changes, refresh the connection's tool metadata and rerun the public-claim example. Before describing the integration as installed, verify it inside the target ChatGPT or Claude account. Repository tests alone do not establish account installation or public marketplace approval.
