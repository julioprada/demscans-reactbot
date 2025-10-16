const fs = require("fs");
const path = require("path");

const dist = path.resolve(process.cwd(), "dist");
const keep = new Set(["demscans-reactbot.exe", "credentials.json"]);

if (!fs.existsSync(dist)) process.exit(0);
for (const name of fs.readdirSync(dist)) {
  if (!keep.has(name)) {
    const p = path.join(dist, name);
    try {
      fs.rmSync(p, { recursive: true, force: true });
      console.log(`[prune] removed ${p}`);
    } catch (e) {
      console.warn(`[prune] failed to remove ${p}: ${e.message}`);
    }
  }
}
