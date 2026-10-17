// A shell's UTF-8 locale can read a letter-like byte right after a variable as part of its name ("$TAG…" is the
// variable "TAG…", unset under `set -u`): a variable just before a non-ASCII character is written ${NAME}.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const dirs = ["scripts", "bin", "daemon/bin"];

test("no shell variable runs into a non-ASCII character", () => {
  let checked = 0;
  for (const d of dirs) {
    const dir = path.join(root, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const file = path.join(dir, f);
      if (!fs.statSync(file).isFile()) continue;
      const text = fs.readFileSync(file, "utf8");
      if (!f.endsWith(".sh") && !/^#!.*\b(ba)?sh\b/.test(text)) continue;
      checked++;
      text.split("\n").forEach((line, i) => {
        assert.doesNotMatch(line, /\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]/, `${d}/${f}:${i + 1}: write \${NAME} before a non-ASCII character`);
      });
    }
  }
  assert.ok(checked > 0);
});
