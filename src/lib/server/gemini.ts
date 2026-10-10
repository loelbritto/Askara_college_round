import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { AuditError, modelOutputSchema, type AuditRequest, type ModelOutput, type Source } from "../contracts";
import { buildPrompt, SYSTEM_PROMPT } from "../prompt";

export async function callGemini(request: AuditRequest, sources: Source[], signal?: AbortSignal): Promise<{output: ModelOutput; usage: Record<string,number>; model: string}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || process.env.FREE_TIER_CONFIRMED !== "true") throw new AuditError("NOT_CONFIGURED", "Configure a verified unpaid Gemini project before running a live audit.",503);
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const client = new GoogleGenAI({apiKey});
  const abort = signal ? AbortSignal.any([signal,AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000);
  try {
    const interaction = await client.interactions.create({
      model, input: buildPrompt(request,sources), system_instruction: SYSTEM_PROMPT,
      response_format: {type:"text",mime_type:"application/json",schema:z.toJSONSchema(modelOutputSchema)},
      generation_config: {max_output_tokens:10000,thinking_level:"low"},
      store:false, stream:false,
    },{maxRetries:0,timeout:45000,signal:abort});
    if (interaction.status !== "completed") throw new AuditError("BLOCKED_RESPONSE", "The model did not complete the audit. Your original inputs and audit are preserved.",502);
    if (!interaction.output_text) throw new AuditError("BLOCKED_RESPONSE", "The model returned no usable text. Review the input and try again.",502);
    let parsed: unknown;
    try { parsed = JSON.parse(interaction.output_text); } catch { throw new AuditError("INVALID_OUTPUT", "The model returned an unreadable response. Retry explicitly; no extra request was made.",502); }
    const result = modelOutputSchema.safeParse(parsed);
    if (!result.success) throw new AuditError("INVALID_OUTPUT", "The model response failed validation. No unverified results were accepted.",502);
    const usage = Object.fromEntries(Object.entries(interaction.usage ?? {}).filter(([,v]) => typeof v === "number")) as Record<string,number>;
    return {output:result.data,usage,model};
  } catch(error) {
    if (error instanceof AuditError) throw error;
    if (abort.aborted || (error instanceof Error && /timeout|abort/i.test(error.name))) throw new AuditError("TIMEOUT", "The audit timed out or was cancelled. Your inputs are preserved; you can retry.",504);
    const status = error && typeof error === "object" ? Number((error as {status?:number;statusCode?:number}).status ?? (error as {statusCode?:number}).statusCode) : 0;
    if (status===429) throw new AuditError("QUOTA", "The free Gemini quota is currently exhausted or rate-limited. Wait for quota to reset; no paid fallback was used.",429);
    if ([401,403,404].includes(status)) throw new AuditError("MODEL_UNAVAILABLE", "The configured key cannot access this model. Check the project's free-tier model access.",503);
    throw new AuditError("MODEL_UNAVAILABLE", "Gemini is temporarily unavailable. Your inputs are preserved; retry when service returns.",503);
  }
}
