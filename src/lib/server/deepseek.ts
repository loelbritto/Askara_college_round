import { z } from "zod";
import { AuditError, modelOutputSchema, type AuditRequest, type Source } from "../contracts";
import { buildPrompt, SYSTEM_PROMPT } from "../prompt";
import { providerConfig } from "./provider-config";

const envelopeSchema = z.object({
  choices: z.array(z.object({finish_reason:z.string().nullable(),message:z.object({content:z.string().nullable()})})).min(1),
  usage: z.record(z.string(),z.unknown()).optional(),
});

export async function callDeepSeek(request: AuditRequest, sources: Source[], signal?: AbortSignal, systemPrompt=SYSTEM_PROMPT) {
  const config = providerConfig();
  const routed = config.provider === "agentrouter";
  const provider = routed ? "AgentRouter" : "DeepSeek";
  // Explicit opt-in only. Reuse the existing server key slot during migration;
  // never retry a rejected credential against a different provider.
  const apiKey = routed ? process.env.AGENTROUTER_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim() : process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new AuditError("NOT_CONFIGURED", `Add the ${provider} API key in server settings to enable live checking.`, 503);
  const model = config.model;
  const abort = signal ? AbortSignal.any([signal,AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000);
  try {
    const response = await fetch(routed ? "https://agentrouter.org/v1/chat/completions" : "https://api.deepseek.com/chat/completions", {
      method:"POST", redirect:"error", signal:abort, cache:"no-store",
      headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
      body:JSON.stringify({model,stream:false,thinking:{type:"disabled"},temperature:0,max_tokens:10000,response_format:{type:"json_object"},
        messages:[{role:"system",content:`${systemPrompt}\nReturn only a JSON object matching this JSON schema: ${JSON.stringify(z.toJSONSchema(modelOutputSchema))}`},{role:"user",content:buildPrompt(request,sources)}]}),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 402) throw new AuditError("QUOTA", `${provider} credit is exhausted. The operator needs to check the account balance. No retry was made.`, 429);
      if (response.status === 429) throw new AuditError("QUOTA", `${provider} is rate-limiting requests. Wait before trying again. No automatic retry was made.`, 429);
      if (response.status === 401) throw new AuditError("MODEL_UNAVAILABLE", `${provider} rejected the API key (401). Check that the key was issued by ${provider}, is active, and was saved without extra text.`, 503);
      if (response.status === 403) throw new AuditError("MODEL_UNAVAILABLE", `${provider} denied access (403). Check the token's model permissions and provider access restrictions.`, 503);
      if (response.status === 404) throw new AuditError("MODEL_UNAVAILABLE", `${provider} could not find the configured model or endpoint (404). Check the exact model ID.`, 503);
      if ([400,422].includes(response.status)) throw new AuditError("MODEL_UNAVAILABLE", `${provider} rejected the model or request settings (${response.status}). Check the exact model ID and supported request options.`, 503);
      throw new AuditError("MODEL_UNAVAILABLE", `${provider} is temporarily unavailable. Your inputs are preserved.`, 503);
    }
    if ((response.headers.get("content-type") || "").toLowerCase().includes("text/html")) {
      await response.body?.cancel();
      throw new AuditError("MODEL_UNAVAILABLE", `${provider} returned a web page instead of API JSON. Its gateway may be challenging or blocking server requests. Ask the provider to enable API access from this deployment. No retry was made.`, 503);
    }
    // Bound the provider response, including malformed or unexpectedly large output.
    const reader=response.body?.getReader();
    if (!reader) throw new AuditError("INVALID_OUTPUT", `${provider} returned an empty response.`, 502);
    const chunks:Uint8Array[]=[];let size=0;
    try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576){await reader.cancel();throw new AuditError("INVALID_OUTPUT",`${provider} returned an oversized response. No results were accepted.`,502);}chunks.push(value);}} finally {reader.releaseLock();}
    let envelope:unknown;
    try { envelope=JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new AuditError("INVALID_OUTPUT", `${provider}'s API returned a non-JSON response. No model result was accepted. Check provider gateway compatibility.`, 502); }
    const parsed=envelopeSchema.safeParse(envelope);
    if (!parsed.success) throw new AuditError("INVALID_OUTPUT", `${provider} returned an unreadable response. No unverified results were accepted.`, 502);
    const choice=parsed.data.choices[0];
    if (choice.finish_reason!=="stop" || !choice.message.content?.trim()) throw new AuditError("BLOCKED_RESPONSE", `${provider} did not finish the audit. Your inputs are preserved; no partial results were accepted.`, 502);
    const output=modelOutputSchema.safeParse(JSON.parse(choice.message.content));
    if (!output.success) throw new AuditError("INVALID_OUTPUT", "The model response failed validation. No unverified results were accepted.", 502);
    const usage=Object.fromEntries(Object.entries(parsed.data.usage??{}).filter(([,v])=>typeof v==="number"&&Number.isFinite(v)&&v>=0)) as Record<string,number>;
    return {output:output.data,usage,model};
  } catch(error) {
    if (error instanceof AuditError) throw error;
    if (abort.aborted) throw new AuditError("TIMEOUT", "The audit timed out or was cancelled. Your inputs are preserved.", 504);
    if (error instanceof SyntaxError) throw new AuditError("INVALID_OUTPUT", `${provider}'s model returned invalid audit JSON. No results were accepted; retry only when ready.`, 502);
    throw new AuditError("MODEL_UNAVAILABLE", `${provider} could not be reached. Your inputs are preserved; no automatic retry was made.`, 503);
  }
}
