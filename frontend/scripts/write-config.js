import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, "public");
const apiBaseUrl = process.env.MINER_API_BASE_URL || "";

mkdirSync(publicDir, { recursive: true });
writeFileSync(
  join(publicDir, "config.js"),
  `window.MINER_API_BASE_URL = ${JSON.stringify(apiBaseUrl)};\n`,
);
