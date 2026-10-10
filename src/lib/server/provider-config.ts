export function providerConfig() {
  const provider = process.env.AI_PROVIDER || "gemini";
  const deepseek = provider === "deepseek";
  const missing = [
    !["gemini", "deepseek"].includes(provider) && "AI_PROVIDER (gemini or deepseek)",
    deepseek ? !process.env.DEEPSEEK_API_KEY?.trim() && "DEEPSEEK_API_KEY" : !process.env.GEMINI_API_KEY?.trim() && "GEMINI_API_KEY",
    provider === "gemini" && process.env.FREE_TIER_CONFIRMED !== "true" && "FREE_TIER_CONFIRMED",
  ].filter(Boolean) as string[];
  return {provider, missing, model: deepseek ? process.env.DEEPSEEK_MODEL || "deepseek-flash" : process.env.GEMINI_MODEL || "gemini-3.8-flash"};
}
