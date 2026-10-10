import { callGemini } from "./gemini";
import { callDeepSeek } from "./deepseek";
import { providerConfig } from "./provider-config";
import { AuditError, type AuditRequest, type Source } from "../contracts";

export async function callModel(request: AuditRequest, sources: Source[], signal?: AbortSignal) {
  const config = providerConfig();
  if (config.missing.length) throw new AuditError("NOT_CONFIGURED", "The operator must finish the selected AI provider's server configuration.", 503);
  return config.provider === "deepseek" ? callDeepSeek(request, sources, signal) : callGemini(request, sources, signal);
}
