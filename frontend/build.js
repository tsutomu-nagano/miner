const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const dist = path.join(root, "dist");
const apiBaseUrl = process.env.MINER_API_BASE_URL || "";

fs.rmSync(dist, { force: true, recursive: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of ["index.html", "app.js", "styles.css"]) {
  fs.copyFileSync(path.join(root, file), path.join(dist, file));
}

fs.writeFileSync(
  path.join(dist, "config.js"),
  `window.MINER_API_BASE_URL = ${JSON.stringify(apiBaseUrl)};\n`,
);
