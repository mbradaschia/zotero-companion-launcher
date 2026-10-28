// A problem every paper would meet (Glue.fatalProblem, GlueRunner.js): what to fix, said once, and when the
// automation tries again; the patterns the runner's (runner/lib/fatal.mjs) in the same order.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Glue = require("../../ZoteroLauncher/Core/Glue.js");

test("fatalProblem: what to fix for each kind; a paper's own problem, or Zotero away, isn't one", () => {
  const f = (t) => Glue.fatalProblem(t)
  assert.deepEqual(f("Claude: Invalid API key · Please run /login"), { kind: "signin", message: "Claude isn't signed in (its login expired?): in Terminal, run claude, then /login", retryMin: 30, reason: "Claude: Invalid API key · Please run /login" });
  assert.equal(f("ChatGPT: 401 Unauthorized").message, "ChatGPT isn't signed in: in Terminal, run codex login");
  assert.equal(f("the API key was refused (401): bad").message, "An API key was refused: replace it in Settings › Models & providers");
  assert.deepEqual([f("Claude: Credit balance is too low").kind, f("Claude: Credit balance is too low").message], ["limit", "Claude is out of credit or over its usage limit: wait for the limit to reset, or add credit"]);
  assert.equal(f("rate limited or out of credit (429): x").message, "The AI is out of credit or over its usage limit: wait for the limit to reset, or add credit");
  assert.deepEqual([f("Claude: API Error: 529 overloaded").kind, f("Claude: API Error: 529 overloaded").retryMin], ["busy", 10]);
  assert.deepEqual([f("can't reach api.openai.com: ENOTFOUND").kind, f("can't reach api.openai.com: ENOTFOUND").message, f("can't reach api.openai.com: ENOTFOUND").retryMin],
    ["network", "Can't reach the AI: check the network connection", 5]);
  assert.equal(f("no AI model is set up: open Settings › Models & providers in the launcher").message, "The AI isn't ready: no AI model is set up: open Settings › Models & providers in the launcher");
  assert.equal(f("x".repeat(300)), null);
  assert.equal(f("Claude: " + "network ".repeat(40)).reason.length, 200);
  for (const own of ["the model sent an empty answer", "Claude took longer than 15 minutes", "this item has no PDF on disk to extract", "", null, "Zotero didn't answer /item: fetch failed"]) assert.equal(f(own), null, String(own));
});

test("the patterns are the runner's, in its order", () => {
  const src = (file, re) => [...fs.readFileSync(file, "utf8").matchAll(re)].map((m) => m[1] + " " + m[2]);
  const ours = src(path.join(__dirname, "../../ZoteroLauncher/Core/GlueRunner.js"), /^\s*\["(\w+)", (\/.*\/i)\],?$/gm);
  const runner = src(path.join(__dirname, "../../runner/lib/fatal.mjs"), /^\s*\["(\w+)", (\/.*\/i)\],?$/gm);
  assert.equal(ours.length, 6);
  assert.deepEqual(ours, runner);
});
