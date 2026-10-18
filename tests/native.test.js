// daemon/lib/native.mjs: the Claude and Codex binaries for this machine npm left out (an optional
// package whose download failed), which install-runner.sh downloads again.
const test = require("node:test");
const assert = require("node:assert/strict");

const N = () => import("../daemon/lib/native.mjs");

const lock = {
  packages: {
    "": { name: "oma-zotero-prompt" },
    "node_modules/@openai/codex-sdk": { optional: true },
    "node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64": { optional: true, os: ["darwin"], cpu: ["arm64"] },
    "node_modules/@anthropic-ai/claude-agent-sdk-darwin-x64": { optional: true, os: ["darwin"], cpu: ["x64"] },
    "node_modules/@anthropic-ai/claude-agent-sdk-linux-x64": { optional: true, os: ["linux"], cpu: ["x64"], libc: ["glibc"] },
    "node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl": { optional: true, os: ["linux"], cpu: ["x64"], libc: ["musl"] },
    "node_modules/@openai/codex-darwin-arm64": { optional: true, os: ["darwin"], cpu: ["arm64"] },
    "node_modules/fsevents": { optional: true, dev: true, os: ["darwin"] },
    "node_modules/zod": {},
  },
};

test("a Mac's binary npm skipped is missing; other machines' and the ones there aren't", async () => {
  const { missingNative } = await N();
  const have = (p) => p.endsWith("claude-agent-sdk-darwin-arm64");
  assert.deepEqual(missingNative(lock, have, { platform: "darwin", arch: "arm64" }), ["@openai/codex-darwin-arm64"]);
  assert.deepEqual(missingNative(lock, () => true, { platform: "darwin", arch: "arm64" }), []);
});

test("on Linux, the binary for its C library", async () => {
  const { missingNative } = await N();
  assert.deepEqual(missingNative(lock, () => false, { platform: "linux", arch: "x64", c: "glibc" }), ["@anthropic-ai/claude-agent-sdk-linux-x64"]);
  assert.deepEqual(missingNative(lock, () => false, { platform: "linux", arch: "x64", c: "musl" }), ["@anthropic-ai/claude-agent-sdk-linux-x64-musl"]);
});

test("install-runner.sh checks for them after npm ci and tries again over IPv4", () => {
  const fs = require("node:fs");
  const t = fs.readFileSync(require("node:path").join(__dirname, "../scripts/install-runner.sh"), "utf8");
  assert.match(t, /missingIn\(process\.argv\[2\]\)/);
  assert.match(t, /--dns-result-order=ipv4first" packages/);
  assert.match(t, /task fail "\$TASK" "npm didn't download/);
});
