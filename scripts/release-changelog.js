#!/usr/bin/env node
// CHANGELOG.md for a release of the bridge, the Omarchy plugin and the runner (scripts/release.sh).
//
// The Mac app's sections ("### The Mac app (…)") sit under [Unreleased] for good: the app has releases
// and notes of its own, and no vX.Y.Z tag covers it. So a release leaves them where they are; only the
// rest of [Unreleased] becomes the new version's section. (Before this, a release would have moved every
// Mac section under the new version, and its notes with them into the bridge's GitHub release.)
//
//   release-changelog.js pending [FILE]                      what a release would publish ("" when nothing)
//   release-changelog.js cut VERSION DATE PREV REPO [FILE]   [Unreleased] → [VERSION] - DATE, links updated
const fs = require("node:fs");

const MAC = /^### The Mac app\b/;

// [Unreleased]'s body in two: the Mac app's sections, and everything else (in the order written).
function split(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^## \[Unreleased\][ \t]*$/.test(l));
  if (start < 0) throw new Error("CHANGELOG.md has no [Unreleased] section");
  let end = lines.findIndex((l, i) => i > start && /^## \[/.test(l));
  if (end < 0) end = lines.findIndex((l, i) => i > start && /^\[[^\]]+\]: /.test(l)); // (no release yet: the links)
  if (end < 0) end = lines.length;
  const mac = [];
  const rest = [];
  let into = rest;
  for (const line of lines.slice(start + 1, end)) {
    if (/^### /.test(line)) into = MAC.test(line) ? mac : rest;
    into.push(line);
  }
  return { before: lines.slice(0, start), mac: trim(mac), rest: trim(rest), after: lines.slice(end) };
}

// Without the blank lines at either end.
function trim(lines) {
  let a = 0;
  let b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b);
}

// What a release would publish: [Unreleased] without the Mac app's sections.
function pending(text) {
  return split(text).rest.join("\n");
}

function cut(text, version, date, prev, repo) {
  const p = split(text);
  const out = p.before.concat(["## [Unreleased]", ""]);
  if (p.mac.length) out.push(...p.mac, "");
  out.push(`## [${version}] - ${date}`, "", ...p.rest, "", ...p.after);
  let s = out.join("\n");
  const link = prev ? `${repo}/compare/${prev}...v${version}` : `${repo}/releases/tag/v${version}`;
  s = s.replace(/^\[Unreleased\]: .*$/m, `[Unreleased]: ${repo}/compare/v${version}...HEAD\n[${version}]: ${link}`);
  return s;
}

module.exports = { split, pending, cut };

if (require.main === module) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "pending") {
    process.stdout.write(pending(fs.readFileSync(args[0] || "CHANGELOG.md", "utf8")));
  } else if (cmd === "cut" && args.length >= 4) {
    const file = args[4] || "CHANGELOG.md";
    fs.writeFileSync(file, cut(fs.readFileSync(file, "utf8"), args[0], args[1], args[2], args[3]));
  } else {
    console.error("usage: release-changelog.js pending [FILE] | cut VERSION DATE PREV REPO [FILE]");
    process.exit(2);
  }
}
