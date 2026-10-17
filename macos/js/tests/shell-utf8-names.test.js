// The one-line install runs in your Terminal's locale. There macOS's bash 3.2 (UTF-8) reads a letter-like byte right
// after a variable as part of its name: "$TAG…" is the variable "TAG…", unset, and `set -u` stops the install
// ("TAG?: unbound variable"). A variable just before a non-ASCII character is written ${NAME}.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dir = path.join(__dirname, "../../scripts");

test("no shell variable runs into a non-ASCII character", () => {
  const scripts = fs.readdirSync(dir).filter((f) => f.endsWith(".sh"));
  assert.ok(scripts.includes("install.sh"));
  for (const f of scripts) {
    fs.readFileSync(path.join(dir, f), "utf8").split("\n").forEach((line, i) => {
      assert.doesNotMatch(line, /\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]/, `${f}:${i + 1}: write \${NAME} before a non-ASCII character`);
    });
  }
});
