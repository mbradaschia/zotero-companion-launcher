#!/bin/bash
# The two launchers in this repository share only contracts/ (and the bridge, over HTTP): macos/
# reads nothing of the Omarchy launcher's (lib/, daemon/, scripts/, tests/, its QML), and the Omarchy
# launcher reads nothing under macos/. Prints each crossing as file:line, exits 1 on any.
# One folder is a copy kept identical by hand, the view logic (lib/*.js = macos/js/lib/*.js): a file that
# differs, or is in one folder only, is printed and fails the check too.
#   check-boundaries.sh [ROOT]
set -euo pipefail
ROOT=$(cd "${1:-$(dirname "${BASH_SOURCE[0]}")/..}" && pwd)
exec node - "$ROOT" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[2];
const CODE = /\.(js|mjs|cjs|qml|sh|swift|yml|yaml|json)$|^Makefile$/;
const SKIP = new Set(["node_modules", ".git", "build", "DerivedData", ".superpowers", "docs", "reference"]);
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP.has(e.name) || (e.name.startsWith(".") && e.name !== ".github")) return []; // worktrees, tool folders
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : CODE.test(e.name) ? [p] : [];
  });
}
const bad = [];
const report = (file, i, line) => bad.push(`${path.relative(root, file)}:${i + 1}: ${line.trim()}`);
const macos = path.join(root, "macos");
// macos/: a relative path that climbs out of macos/ must land in contracts/.
if (fs.existsSync(macos)) {
  for (const file of files(macos)) {
    fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      const climbs = [...line.matchAll(/(?:\$ROOT\/|\$\{ROOT\}\/)?((?:\.\.\/)+)([\w.-]+)/g)];
      for (const m of climbs) {
        const base = /^\$\{?ROOT/.test(m[0]) ? macos : path.dirname(file);
        const target = path.resolve(base, m[1] + m[2]);
        // The Omarchy launcher's code is what's off limits: lib/, daemon/, scripts/, tests/, its QML.
        const rel = path.relative(root, target);
        const top = rel.split(path.sep)[0];
        const outside = !(target === macos || target.startsWith(macos + path.sep)) && !rel.startsWith("..");
        if (outside && (["lib", "daemon", "scripts", "tests"].includes(top) || /^[^/]+\.qml$/.test(rel))) report(file, i, line);
      }
    });
  }
}
// The Omarchy launcher (everything outside macos/): never names macos/.
for (const file of files(root)) {
  if (file.startsWith(macos + path.sep) || file.startsWith(path.join(root, ".github") + path.sep)) continue;
  if (path.basename(file) === "check-boundaries.sh" || path.basename(file) === "check-boundaries.test.js") continue;
  fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => { if (/(^|[^\w-])macos\//.test(line)) report(file, i, line); });
}
for (const b of bad) console.log(b);
// The view logic's two copies: the same files, byte for byte (edit both together).
const drift = [];
const ours = path.join(root, "lib");
const theirs = path.join(macos, "js", "lib");
if (fs.existsSync(ours) && fs.existsSync(theirs)) {
  const js = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
  for (const f of [...new Set([...js(ours), ...js(theirs)])].sort()) {
    const a = path.join(ours, f);
    const b = path.join(theirs, f);
    if (!fs.existsSync(a)) drift.push(`lib/${f}: missing (macos/js/lib/${f} has no twin)`);
    else if (!fs.existsSync(b)) drift.push(`macos/js/lib/${f}: missing (lib/${f} has no twin)`);
    else if (!fs.readFileSync(a).equals(fs.readFileSync(b))) drift.push(`lib/${f} and macos/js/lib/${f} differ`);
  }
}
for (const d of drift) console.log(d);
if (bad.length) console.log(`check-boundaries: ${bad.length} crossing(s) between the launchers`);
if (drift.length) console.log(`check-boundaries: ${drift.length} file(s) of the view logic differ between lib/ and macos/js/lib/: make the same edit in both`);
if (bad.length || drift.length) process.exit(1);
NODE
