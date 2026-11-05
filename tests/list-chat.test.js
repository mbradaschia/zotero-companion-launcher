// A chat about a review table's list (the docked chat's List): what the model reads (lib/listchat.mjs), and a turn
// end to end, against a fake bridge and a fake OpenAI-compatible endpoint (no key, no network).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const RUNNER = path.join(__dirname, "../daemon/bin/oma-zotero-prompt.mjs");
const lib = () => import("../daemon/lib/listchat.mjs");

test("the table's list, checked: ids, each paper once, at most 200, cells with a label and a value", async () => {
  const { parseListInput } = await lib();
  assert.throws(() => parseListInput({ question: "  " }), /question/);
  const papers = [{ id: "1:AAAA0001", title: "A", cite: "(Feldman, 2000)", cells: [{ label: "Mechanisms", value: "• routines" }, { label: "Empty", value: "" }] },
    { id: "1:AAAA0001", title: "again" }, { id: "nope" }, { id: "2:BBBB0002", title: "B" }]
  const r = parseListInput({ question: " Which? ", display: "", list: { name: "Chapter 2", papers } });
  assert.equal(r.question, "Which?");
  assert.equal(r.list.name, "Chapter 2");
  assert.deepEqual(r.list.papers.map((p) => p.id), ["1:AAAA0001", "2:BBBB0002"]);
  assert.deepEqual(r.list.papers[0].cells, [{ label: "Mechanisms", value: "• routines" }]);
  const many = parseListInput({ question: "q", list: { papers: Array.from({ length: 250 }, (_, i) => ({ id: "1:" + String(i).padStart(8, "A") })) } });
  assert.equal(many.list.papers.length, 200);
  assert.equal(many.list.name, "the list");
});

test("a paper as the model reads it: Zotero's citation first, else the table's; the columns under it", async () => {
  const { paperEntry } = await lib();
  const p = { id: "1:AAAA0001", title: "Routines", cite: "(Feldman, 2000)", cells: [{ label: "Status", value: "read" }, { label: "Mechanisms", value: "• routines\n• habits" }] };
  const e = paperEntry(3, p, { citation: "(Feldman & Pentland, 2003)", reference: "Feldman, M. S., & Pentland, B. T. (2003). Reconceptualizing…", publication: "ASQ", year: "2003", abstract: "We study routines." });
  assert.match(e, /^## \[3\] \(Feldman & Pentland, 2003\)\n- Title: Routines\n- Reference: Feldman, M\. S\./);
  assert.match(e, /- Published: ASQ, 2003\n- Abstract: We study routines\.\n- Status: read\n- Mechanisms:\n  • routines\n  • habits$/);
  assert.match(paperEntry(1, p, {}), /^## \[1\] \(Feldman, 2000\)/); // (the bridge had nothing: the table's)
  assert.doesNotMatch(paperEntry(1, p, { abstract: "x" }, { abstract: 0 }), /Abstract/);
});

test("the list fits the model: abstracts shortened, then left out, then the columns cut, then papers dropped, said in the label", async () => {
  const { fitList } = await lib();
  const papers = Array.from({ length: 40 }, (_, i) => ({ id: "1:" + String(i).padStart(8, "A"), title: "T" + i, cite: `(A${i}, 2000)`, cells: [{ label: "Notes", value: "n".repeat(1000) }] }));
  const infos = {};
  papers.forEach((p) => (infos[p.id] = { abstract: "word ".repeat(500) }));
  const whole = fitList({ name: "L", papers }, infos, 1000000);
  assert.equal(whole.label, "40 papers: citations, abstracts and the table's columns");
  assert.deepEqual(whole.cut, { abstracts: false, cells: false, papers: 0 });
  const short = fitList({ name: "L", papers }, infos, 60000);
  assert.ok(short.cut.abstracts && /abstracts (shortened|left out)/.test(short.label));
  assert.ok(Math.ceil(short.text.length / 3.6) <= 60000 * 0.6);
  const tiny = fitList({ name: "L", papers }, infos, 6000);
  assert.ok(tiny.cut.papers > 0 && /only the first \d+ fit the model/.test(tiny.label));
  assert.match(tiny.text, /^## \[1\] \(A0, 2000\)/);
});

test("a list chat's thread: the list in its first message, the paper's chat unchanged", async () => {
  const { listContext } = await lib();
  const { threadMessages } = await import("../daemon/lib/context.mjs");
  const { groundingMessage } = await import("../daemon/lib/chat.mjs");
  const ctx = listContext({ name: "Chapter 2", papers: 2, label: "2 papers", text: "## [1] (A, 2000)\n\n## [2] (B, 2001)" });
  const session = { messages: [{ role: "user", text: "first?" }, { role: "assistant", text: "Yes (A, 2000)." }], thread: { provider: "lab", id: null, start: 0, summarized: false } };
  const m = threadMessages(session, ctx, "and then?");
  assert.equal(m.length, 3);
  assert.match(m[0].content, /^# The list: Chapter 2 \(2 papers\)\n\n<papers>\n## \[1\] \(A, 2000\)/);
  assert.match(m[0].content, /# The question\n\nfirst\?$/);
  assert.equal(m[2].content, "and then?");
  assert.match(groundingMessage({ title: "P", text: "body", grounding: { label: "x" } }, "q"), /^# The paper/);
});

// ---------------------------------------------------------------- end to end

function serve(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => handler(req, res, body ? JSON.parse(body) : {}));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function runner(args, env, stdin) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [RUNNER, ...args], { env: Object.assign({}, process.env, env) });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code, out, err }));
    p.stdin.end(stdin || "");
  });
}

const json = (res, o, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)) };

test("chat --review: the list read once (abstracts, Zotero's citations), the answer streamed, the chat kept with the table's", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "list-chat-"));
  const asked = [];
  const items = [];
  const bridge = await serve((req, res, b) => {
    if (req.url === "/oma-zotero/item") {
      items.push(b.key);
      return json(res, { ok: true, item: { key: b.key, libraryID: 1, itemType: "journalArticle" }, paper: { key: b.key, title: "Title " + b.key, year: "2000", publication: "ASQ", abstract: "Abstract of " + b.key }, notes: [] });
    }
    if (req.url === "/oma-zotero/cite") return json(res, { ok: true, entries: b.keys.map((k) => ({ key: k, libraryID: 1, text: b.mode === "citation" ? `(Zot ${k}, 2000)` : `Ref ${k}.` })) });
    json(res, { ok: false, error: { code: "nope", message: req.url } }, 404);
  });
  const model = await serve((req, res, b) => {
    if (req.url.endsWith("/models")) return json(res, { data: [{ id: "m1" }] });
    asked.push(b);
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunk = (o) => res.write("data: " + JSON.stringify(Object.assign({ id: "x", object: "chat.completion.chunk", created: 1, model: "m1" }, o)) + "\n\n");
    chunk({ choices: [{ index: 0, delta: { role: "assistant", content: "Two papers agree " }, finish_reason: null }] });
    chunk({ choices: [{ index: 0, delta: { content: "(Zot AAAA0001, 2000)." }, finish_reason: null }] });
    chunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 900, completion_tokens: 20, total_tokens: 920 } });
    res.end("data: [DONE]\n\n");
  });
  fs.mkdirSync(path.join(tmp, "run/oma-zotero"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "run/oma-zotero/bridge.json"), JSON.stringify({ port: bridge.address().port, token: "a".repeat(64) }));
  const env = { HOME: tmp, XDG_RUNTIME_DIR: path.join(tmp, "run"), XDG_STATE_HOME: path.join(tmp, "state"), XDG_CONFIG_HOME: path.join(tmp, "config"), PATH: path.join(tmp, "bin") };
  const { settingsFile, paths } = await import("../daemon/lib/paths.mjs");
  const sf = settingsFile(env);
  fs.mkdirSync(path.dirname(sf), { recursive: true });
  fs.writeFileSync(sf, JSON.stringify({ providers: { compatible: [{ id: "lab", name: "Lab", baseURL: `http://127.0.0.1:${model.address().port}/v1`, context: 65536 }] }, defaults: { chat: { model: "lab:m1", effort: "" } } }));
  const list = { name: "Chapter 2", papers: [{ id: "1:AAAA0001", title: "A", cite: "(A, 2000)", cells: [{ label: "Mechanisms", value: "• routines" }] }, { id: "1:BBBB0002", title: "B", cite: "(B, 2001)", cells: [] }] };
  try {
    const out = await runner(["chat", "--review", "r-0123456789"], env, JSON.stringify({ question: "Which mechanisms?", list }));
    assert.equal(out.code, 0, out.err + out.out);
    const lines = out.out.trim().split("\n").map((l) => JSON.parse(l));
    const session = lines.find((l) => l.type === "session");
    assert.equal(session.grounding.label, "2 papers: citations, abstracts and the table's columns");
    assert.equal(lines.filter((l) => l.type === "delta").map((l) => l.text).join(""), "Two papers agree (Zot AAAA0001, 2000).");
    const done = lines.find((l) => l.type === "done");
    assert.ok(done && done.id === session.id);
    assert.deepEqual(items.sort(), ["AAAA0001", "BBBB0002"]);
    const sent = asked[0].messages.map((m) => (typeof m.content === "string" ? m.content : m.content.map((c) => c.text).join(""))).join("\n");
    assert.match(sent, /# The list: Chapter 2 \(2 papers\)/);
    assert.match(sent, /## \[1\] \(Zot AAAA0001, 2000\)\n- Title: Title AAAA0001\n- Reference: Ref AAAA0001\.\n- Published: ASQ, 2000\n- Abstract: Abstract of AAAA0001\n- Mechanisms: • routines/);
    assert.match(asked[0].messages[0].content, /a list of academic papers/);
    const dir = path.join(paths(env).chats, "review-r-0123456789");
    const saved = JSON.parse(fs.readFileSync(path.join(dir, session.id + ".json"), "utf8"));
    assert.equal(saved.list.papers, 2);
    assert.equal(saved.messages.length, 2);
    // the next question reads the list the chat kept (the bridge isn't asked again), the table's list ignored
    const again = await runner(["chat", "--review", "r-0123456789", "--session", session.id], env, JSON.stringify({ question: "And B?", list: { papers: [] } }));
    assert.equal(again.code, 0, again.err + again.out);
    assert.equal(items.length, 2);
    assert.match(JSON.stringify(asked[1].messages), /Abstract of BBBB0002/);
    const listed = JSON.parse((await runner(["chats", "--review", "r-0123456789"], env)).out).chats;
    assert.deepEqual(listed.map((c) => [c.id, c.turns]), [[session.id, 2]]);
    const shown = JSON.parse((await runner(["chat-show", "--review", "r-0123456789", "--session", session.id], env)).out);
    assert.equal(shown.list.name, "Chapter 2");
    // the papers' chats aren't the lists'
    assert.deepEqual(JSON.parse((await runner(["chats", "--all"], env)).out).chats, []);
    const bad = await runner(["chat", "--review", "nope"], env, JSON.stringify({ question: "q", list }));
    assert.match(bad.out, /"type":"error".*bad review id/);
    const empty = await runner(["chat", "--review", "r-0123456789"], env, JSON.stringify({ question: "q", list: { papers: [] } }));
    assert.match(empty.out, /the list has no papers/);
  } finally {
    bridge.close();
    model.close();
  }
});
