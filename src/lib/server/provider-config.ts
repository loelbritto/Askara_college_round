export function providerConfig() {
  const provider = process.env.AI_PROVIDER || "gemini";
  const deepseek = provider === "deepseek";
  const agentrouter = provider === "agentrouter";
  const missing = [
    !["gemini", "deepseek", "agentrouter"].includes(provider) && "AI_PROVIDER (gemini, deepseek or agentrouter)",
    agentrouter ? !(process.env.AGENTROUTER_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim()) && "AGENTROUTER_API_KEY" : deepseek ? !process.env.DEEPSEEK_API_KEY?.trim() && "DEEPSEEK_API_KEY" : !process.env.GEMINI_API_KEY?.trim() && "GEMINI_API_KEY",
    provider === "gemini" && process.env.FREE_TIER_CONFIRMED !== "true" && "FREE_TIER_CONFIRMED",
  ].filter(Boolean) as string[];
  return {provider, missing, model: agentrouter ? process.env.AGENTROUTER_MODEL?.trim() || "deepseek-v4-flash" : deepseek ? process.env.DEEPSEEK_MODEL?.trim() || "deepseek-flash" : process.env.GEMINI_MODEL || "gemini-3.8-flash"};
}
