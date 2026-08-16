// Copies the built Nonomy MCP server (../dist) into ./server/dist so the
// extension can ship and spawn it without depending on the sibling project
// folder at runtime. Run automatically as part of `npm run build`.
const fs = require("fs");
const path = require("path");

const rootDist = path.join(__dirname, "..", "..", "dist");
const targetDist = path.join(__dirname, "..", "server", "dist");
const rootConnector = path.join(__dirname, "..", "..", "connector.luau");
const targetConnector = path.join(__dirname, "..", "server", "connector.luau");

if (!fs.existsSync(rootDist)) {
  console.error(
    `[copy-server] ../dist not found. Run "npm run build" in the root project first (produces dist/index.js).`
  );
  process.exit(1);
}

fs.mkdirSync(targetDist, { recursive: true });

for (const file of fs.readdirSync(rootDist)) {
  if (!file.endsWith(".js")) continue; // skip .d.ts, source maps not needed at runtime
  fs.copyFileSync(path.join(rootDist, file), path.join(targetDist, file));
}

if (fs.existsSync(rootConnector)) {
  fs.copyFileSync(rootConnector, targetConnector);
}

console.log(`[copy-server] Copied server build into ${path.relative(process.cwd(), targetDist)}`);
