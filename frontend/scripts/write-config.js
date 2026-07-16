import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, "public");
const apiBaseUrl =
  process.env.MINER_API_BASE_URL || process.env.VITE_MINER_API_BASE_URL || "";

if (!apiBaseUrl && process.env.ALLOW_EMPTY_API_BASE_URL !== "1") {
  throw new Error(
    "MINER_API_BASE_URL or VITE_MINER_API_BASE_URL is required for frontend builds.",
  );
}

mkdirSync(publicDir, { recursive: true });
writeFileSync(
  join(publicDir, "config.js"),
  `window.MINER_API_BASE_URL = ${JSON.stringify(apiBaseUrl)};\n`,
);
console.log(
  `Wrote public/config.js with ${
    apiBaseUrl ? "configured" : "empty"
  } MINER_API_BASE_URL.`,
);
