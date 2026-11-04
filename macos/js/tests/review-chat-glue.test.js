// The chat's glue for a review table's docked chat (Core/GlueChat.js): a list's turn, its saved questions, its page.
const test = require("node:test");
const assert = require("node:assert/strict");
const Glue = require("../../ZoteroLauncher/Core/Glue.js");

test("a list's turn: --review, no paper flags; a paper's as before", () => {
  assert.deepEqual(Glue.chatArgs({ review: "r-0123456789" }, { model: "lab:m1", effort: "high", sessionId: "" }), ["chat", "--review", "r-0123456789", "--model", "lab:m1", "--effort", "high"]);
  assert.deepEqual(Glue.chatArgs({ review: "r-0123456789" }, { sessionId: "2026-11-04T10-00-00-000-abcdef" }).slice(-2), ["--session", "2026-11-04T10-00-00-000-abcdef"]);
  assert.deepEqual(Glue.chatArgs({ key: "AAAA0001", libraryID: 1 }, { source: "note" }), ["chat", "--key", "AAAA0001", "--library", "1", "--model", "default", "--effort", "default", "--source", "note"]);
  assert.deepEqual(Glue.chatArgs({ key: "AAAA0001", libraryID: 1 }, { source: "meta" }).slice(-2), ["--source", "meta"]);
  assert.deepEqual(Glue.chatArgs({ key: "AAAA0001", libraryID: 1 }, { source: "odd" }).slice(-2), ["--source", "pdf"]);
});

test("a saved list chat shows what you asked (Ask each paper's line), not the answers the model was given", () => {
  const ms = Glue.sessionMessages({ messages: [{ role: "user", text: "I asked each paper… (long)", display: "Asked each paper: “Which?”" }, { role: "assistant", text: "Two agree (A, 2000)." }] }, []);
  assert.equal(ms[0].text, "Asked each paper: “Which?”");
  assert.equal(ms[1].text, "Two agree (A, 2000).");
});

test("an empty list chat says what it reads, and that Ask each paper reads the full texts", () => {
  const html = Glue.chatHtml([], { cite: "Chapter 2", list: "the papers of “Chapter 2”" });
  assert.match(html, /Ask anything across the papers of “Chapter 2”/);
  assert.match(html, /Ask each paper reads every full text/);
  assert.match(Glue.chatHtml([], { cite: "(A, 2000)" }), /Ask anything about \(A, 2000\)/);
});
