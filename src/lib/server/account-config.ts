export function accountMode() { return process.env.AUTH_MODE === "supabase"; }
export function accountConfiguration() {
  let validUrl = false;
  try { const url = new URL(process.env.SUPABASE_URL || ""); validUrl = url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash; } catch {}
  const missing = [
    !validUrl && "SUPABASE_URL (HTTPS origin)",
    !process.env.SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_") && "SUPABASE_PUBLISHABLE_KEY",
    !process.env.SUPABASE_SECRET_KEY?.startsWith("sb_secret_") && "SUPABASE_SECRET_KEY",
    process.env.SUPABASE_FREE_TIER_CONFIRMED !== "true" && "SUPABASE_FREE_TIER_CONFIRMED",
  ].filter(Boolean) as string[];
  return {configured:missing.length===0,missing};
}
