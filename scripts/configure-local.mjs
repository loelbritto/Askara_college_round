import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
const content = `GEMINI_API_KEY=\nGEMINI_MODEL=gemini-3.8-flash\nFREE_TIER_CONFIRMED=false\nPILOT_ACCESS_CODE=${randomBytes(18).toString("base64url")}\nSESSION_SECRET=${randomBytes(32).toString("hex")}\nAUDITS_ENABLED=true\nAPP_ORIGIN=\n`;
try {
  await writeFile(new URL("../.env.local",import.meta.url),content,{flag:"wx",mode:0o600});
  console.log("Created ignored .env.local with random session credentials. Add the API key and confirm the project's unpaid tier. No secrets were printed.");
} catch(error) {
  if(error.code === "EEXIST") console.log(".env.local already exists; left unchanged.");
  else throw error;
}
