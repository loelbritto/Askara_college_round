# Second Opinion for Claude

Claude connects to the same remote MCP service as ChatGPT. There is no local agent process, API key, or separate inference subscription to configure for this evidence tool.

In Claude, open **Customize → Connectors → Add custom connector**, enter **Second Opinion** and **https://secondopinion-ten.vercel.app/api/mcp**, then use **No sign in** when asked about authentication. Enable the connector for the conversation. Organization accounts may require an owner to add it first. Claude connects from Anthropic's servers, so a localhost URL will not work for this flow. See [Claude's official connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

`connector.json` is a reference for those setup fields, not a file to paste into `claude_desktop_config.json`. This code does not publish an official Anthropic directory integration or install anything into your account.

Try: “Use Second Opinion to research this public claim: regular exercise improves sleep quality. You may send that claim to the public research indexes. Show relevant sources and unresolved questions.”

Read [the workflow and limits](../../docs/AI-CONNECTORS.md) before testing private material. Optional on-device model comparison happens in the [web workspace](https://secondopinion-ten.vercel.app/screen); the MCP tool returns evidence rather than multiple model opinions.
