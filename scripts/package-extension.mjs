import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Deliberately fixed contents: no environment files, tokens, build caches or tests.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extension = resolve(root, "integrations/chrome-extension");
const files = ["00-START-HERE.html", "manifest.json", "background.js", "shared.js", "popup.html", "popup.css", "popup.js", "PRIVACY.md", "icons/icon16.png", "icons/icon32.png", "icons/icon48.png", "icons/icon128.png"];
const argument = process.argv.indexOf("--out");
if (argument !== -1 && !process.argv[argument + 1]) throw new Error("--out requires a ZIP file path.");
const destination = resolve(root, argument === -1 ? "output/chrome-extension/second-opinion-chrome.zip" : process.argv[argument + 1]);
if (!destination.endsWith(".zip")) throw new Error("The output path must end in .zip.");

const crcTable = Array.from({ length: 256 }, (_, number) => {
  let crc = number;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const localEntries = [];
const centralEntries = [];
let offset = 0;
for (const relative of files) {
  const data = await readFile(resolve(extension, relative));
  const name = Buffer.from(relative);
  const crc = crc32(data);
  // Stored ZIP entries are portable and keep packaging dependency-free.
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(0x0021, 12); // Fixed 1980-01-01 for reproducible output.
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(0x0021, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  localEntries.push(local, name, data);
  centralEntries.push(central, name);
  offset += local.length + name.length + data.length;
}
const centralDirectory = Buffer.concat(centralEntries);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralDirectory.length, 12);
end.writeUInt32LE(offset, 16);
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, Buffer.concat([...localEntries, centralDirectory, end]));
console.log(`Packaged ${files.length} extension files: ${destination}`);
