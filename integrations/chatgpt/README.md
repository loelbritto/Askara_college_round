# Second Opinion for ChatGPT

This folder is the portable plugin package. It contains tool connection metadata and a bounded claim-review skill. It is **not** a public directory listing and has not been installed into your ChatGPT account automatically.

The easiest connection is a custom MCP server:

- Name: **Second Opinion**
- URL: **https://secondopinion-ten.vercel.app/api/mcp**
- Authentication: **None**
- Tool: **screen_claim**

Follow [the shared setup and test guide](../../docs/AI-CONNECTORS.md). The package's `plugin.json`, `mcp.json`, and `skills/` follow [OpenAI's portable plugin layout](https://developers.openai.com/plugins/build/plugins). Account and workspace policies control installation and availability.

No API key or paid inference is required by this evidence tool. The ChatGPT host has its own account limits. Only use public claims the user authorized for external research.
