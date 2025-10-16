const fs = require("fs");
const path = require("path");

const files = process.argv.slice(2);
const targets = files.length
  ? files
  : ["dist/bot.js", "dist/bot.cjs", "scripts/tmp-entry.cjs"];

for (const f of targets) {
  const p = path.resolve(process.cwd(), f);
  try {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { force: true });
      console.log(`[cleanup] removed ${p}`);
    }
  } catch (e) {
    console.warn(`[cleanup] failed to remove ${p}: ${e.message}`);
  }
}
