// scripts/release-changelog.js: a release of the bridge dates [Unreleased]'s own entries and leaves the Mac
// app's sections under [Unreleased], where they live (the app has releases and notes of its own).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pending, cut } = require("../scripts/release-changelog.js");

const REPO = "https://example.test/repo";
const LOG = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "### Added",
  "",
  "- **A new route.** It answers.",
  "",
  "### The Mac app (`macos-v0.4.2`)",
  "",
  "- **A window.** It opens.",
  "",
  "### The Mac app (`macos-v0.4.1`)",
  "",
  "- **A fix.**",
  "",
  "### Fixed",
  "",
  "- **The search** finds it.",
  "",
  "## [0.2.7] - 2026-11-06",
  "",
  "### Added",
  "",
  "- **Older.**",
  "",
  `[Unreleased]: ${REPO}/compare/v0.2.7...HEAD`,
  `[0.2.7]: ${REPO}/compare/v0.2.6...v0.2.7`,
  "",
].join("\n");

const section = (text, heading) => {
  const lines = text.split("\n");
  const a = lines.indexOf(heading);
  assert.ok(a >= 0, `${heading} is there`);
  const b = lines.findIndex((l, i) => i > a && /^## \[/.test(l));
  return lines.slice(a + 1, b < 0 ? lines.length : b).join("\n");
};

test("pending: [Unreleased] without the Mac app's sections", () => {
  const p = pending(LOG);
  assert.match(p, /A new route/);
  assert.match(p, /The search/);
  assert.doesNotMatch(p, /The Mac app|A window|A fix/);
});

test("pending: nothing when only the Mac app's sections are there (a release is refused)", () => {
  const onlyMac = LOG.replace(/### Added\n\n- \*\*A new route[^\n]*\n\n/, "").replace(/### Fixed\n\n- \*\*The search[^\n]*\n\n/, "");
  assert.equal(pending(onlyMac).trim(), "");
});

test("cut: the entries move under the version; the Mac app's sections stay under [Unreleased]", () => {
  const out = cut(LOG, "0.2.8", "2026-11-12", "v0.2.7", REPO);
  const unreleased = section(out, "## [Unreleased]");
  const released = section(out, "## [0.2.8] - 2026-11-12");
  assert.match(unreleased, /macos-v0\.4\.2[\s\S]*A window[\s\S]*macos-v0\.4\.1[\s\S]*A fix/);
  assert.doesNotMatch(unreleased, /A new route|The search/);
  assert.match(released, /### Added[\s\S]*A new route[\s\S]*### Fixed[\s\S]*The search/);
  assert.doesNotMatch(released, /The Mac app/);
  assert.match(section(out, "## [0.2.7] - 2026-11-06"), /Older/);
  assert.ok(out.indexOf("## [Unreleased]") < out.indexOf("## [0.2.8]") && out.indexOf("## [0.2.8]") < out.indexOf("## [0.2.7]"));
});

test("cut: the links name the new version", () => {
  const out = cut(LOG, "0.2.8", "2026-11-12", "v0.2.7", REPO);
  assert.match(out, new RegExp(`^\\[Unreleased\\]: ${REPO}/compare/v0\\.2\\.8\\.\\.\\.HEAD$`, "m"));
  assert.match(out, new RegExp(`^\\[0\\.2\\.8\\]: ${REPO}/compare/v0\\.2\\.7\\.\\.\\.v0\\.2\\.8$`, "m"));
  assert.match(out, new RegExp(`^\\[0\\.2\\.7\\]: ${REPO}/compare/v0\\.2\\.6\\.\\.\\.v0\\.2\\.7$`, "m"));
  assert.match(cut(LOG, "0.2.8", "2026-11-12", "", REPO), new RegExp(`^\\[0\\.2\\.8\\]: ${REPO}/releases/tag/v0\\.2\\.8$`, "m"));
});

test("cut: without Mac sections, as before", () => {
  const plain = LOG.replace(/### The Mac app \(`macos-v0\.4\.2`\)[\s\S]*?(?=### Fixed)/, "");
  const out = cut(plain, "0.2.8", "2026-11-12", "v0.2.7", REPO);
  assert.equal(section(out, "## [Unreleased]").trim(), "");
  assert.match(section(out, "## [0.2.8] - 2026-11-12"), /A new route[\s\S]*The search/);
});

test("the real CHANGELOG.md: every Mac section is still under [Unreleased] after a cut", () => {
  const real = fs.readFileSync(path.join(__dirname, "..", "CHANGELOG.md"), "utf8");
  const count = (s) => (s.match(/^### The Mac app\b/gm) || []).length;
  const out = cut(real, "99.0.0", "2026-11-12", "v0.2.7", REPO);
  assert.ok(count(real) > 0);
  assert.equal(count(section(out, "## [Unreleased]")), count(real));
  assert.equal(count(section(out, "## [99.0.0] - 2026-11-12")), 0);
  for (const v of real.match(/^## \[\d[^\n]*$/gm).slice(0, -1)) assert.equal(section(out, v), section(real, v), `${v} untouched`); // (the last one ends with the links, which change)
});
