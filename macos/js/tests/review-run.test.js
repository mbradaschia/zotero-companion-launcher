// A review table's AI columns (runner/lib/reviews.mjs) and the runner's review-run: the job checked, Jev's cells
// and the prompt columns' answers made into cells, a run paper by paper with fakes, and end to end against a fake
// bridge and a fake Jev (no tags written).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const RV = () => import("../../runner/lib/reviews.mjs");
const RUNNER = path.join(__dirname, "../../runner/bin/oma-zotero-prompt.mjs");
const R = require("../../ZoteroLauncher/Review/ReviewCore.js");

const METHOD = { id: "method", name: "Method", prefix: "method/", kind: "several", question: "Which method?", threshold: 0.6, low: 0.3,
  labels: [{ name: "survey", definition: "A questionnaire" }, { name: "case study", definition: "One or a few cases" }, { name: "experiment", definition: "" }] };
const TYPE = { id: "paper-type", name: "Paper type", prefix: "type/", kind: "one", question: "What kind of paper?", threshold: 0.6, low: 0.3,
  labels: [{ name: "empirical", definition: "" }, { name: "conceptual", definition: "" }, { name: "not stated", definition: "" }] };
const col = (id, kind, extra) => Object.assign({ id: "c-" + id.padEnd(10, "0"), label: id, kind, hash: "h-" + id }, extra);

test("parseJob: AI columns only, papers in order, a paper's columns once, at most 200 papers", async () => {
  const { parseJob } = await RV();
  const a = col("a", "prompt"), b = col("b", "jev-several")
  const j = parseJob({ review: "r-0123456789", name: "Ch. 2", columns: [a, b, { id: "c-own0000000", kind: "own" }],
    jobs: [{ column: a.id, paper: "1:AAAA0001" }, { column: b.id, paper: "1:AAAA0001" }, { column: a.id, paper: "1:AAAA0001" }, { column: b.id, paper: "1:BBBB0002" },
      { column: "c-own0000000", paper: "1:CCCC0003" }, { column: a.id, paper: "../x" }] });
  assert.deepEqual(j.columns.map((c) => c.id), [a.id, b.id]);
  assert.deepEqual(j.papers, [{ id: "1:AAAA0001", columns: [a.id, b.id] }, { id: "1:BBBB0002", columns: [b.id] }]);
  const many = parseJob({ columns: [a], jobs: Array.from({ length: 250 }, (_, i) => ({ column: a.id, paper: "1:" + String(i).padStart(8, "A") })) });
  assert.equal(many.papers.length, 200);
  assert.throws(() => parseJob({ columns: [], jobs: [] }), /no AI columns/);
  assert.throws(() => parseJob({ columns: [a], jobs: [] }), /no cells/);
});

test("Jev's cells: several labels from the threshold (the rest suggested), the best fit or not stated, relevance as 0-100", async () => {
  const { jevTaxonomy, jevCell } = await RV();
  const several = col("m", "jev-several", { taxonomy: "method" }), one = col("t", "jev-one", { taxonomy: "paper-type" })
  const rel = col("r", "jev-relevance", { topic: "dynamic capabilities", description: "It theorizes or tests them" })
  const tm = jevTaxonomy(several, [METHOD, TYPE])
  assert.equal(tm.id, several.id) // (two columns may share a taxonomy)
  assert.deepEqual(jevCell(several, tm, { survey: 0.81, "case study": 0.4, experiment: 0.1 }), { v: ["survey"], probs: { survey: 0.81, "case study": 0.4, experiment: 0.1 }, suggested: ["case study"] })
  const tt = jevTaxonomy(one, [METHOD, TYPE])
  assert.equal(jevCell(one, tt, { empirical: 0.9, conceptual: 0.1 }).v, "empirical")
  const unsure = jevCell(one, tt, { empirical: 0.45, conceptual: 0.35, "not stated": 0.2 })
  assert.equal(unsure.v, "not stated")
  assert.deepEqual(unsure.suggested, ["empirical"])
  const tr = jevTaxonomy(rel, [])
  assert.equal(tr.kind, "several")
  assert.deepEqual(tr.labels, [{ name: "dynamic capabilities", definition: "It theorizes or tests them" }])
  assert.deepEqual(jevCell(rel, tr, { "dynamic capabilities": 0.734 }), { v: 73, p: 0.734 })
  assert.throws(() => jevTaxonomy(col("x", "jev-one", { taxonomy: "gone" }), [METHOD]), /isn't there any more/)
  assert.throws(() => jevTaxonomy(col("x", "jev-one", { taxonomy: "method" }), [METHOD]), /other kind/)
});

test("a Jev column on labels of its own: a taxonomy made of them, its description the question", async () => {
  const { jevTaxonomy, jevCell } = await RV();
  const labels = [{ name: "qualitative", definition: "Interviews, cases, ethnography" }, { name: "quantitative", definition: "Statistics on a sample" }]
  const one = col("o", "jev-one", { taxonomy: "", labels, description: "How does the study collect its data?" })
  const t = jevTaxonomy(one, [])
  assert.equal(t.kind, "one")
  assert.equal(t.id, one.id)
  assert.equal(t.question, "How does the study collect its data?")
  assert.deepEqual(t.labels, labels)
  assert.equal(jevCell(one, t, { qualitative: 0.88, quantitative: 0.12 }).v, "qualitative")
  const several = jevTaxonomy(col("s", "jev-several", { labels: [{ name: "firm" }] }), [])
  assert.equal(several.kind, "several")
  assert.equal(several.question, "Which of these fits the paper?")
  assert.deepEqual(several.labels, [{ name: "firm", definition: "" }])
});

test("a prompt's answers: the shapes, not stated, the quotes checked word for word, a malformed part an error", async () => {
  const { promptMessage, parseAnswers, shapeValue } = await RV();
  const text = col("x", "prompt", { shape: "text", length: 40, evidence: true, description: "What is the gap?" })
  const list = col("l", "prompt", { shape: "list", length: 2, description: "Constructs?" })
  const num = col("n", "prompt", { shape: "number", description: "Sample size?" })
  const choice = col("c", "prompt", { shape: "choice", options: ["firm", "industry"], description: "Level?" })
  const msg = promptMessage([text, list, num, choice], "PAPER TEXT")
  assert.match(msg, /^<paper>\nPAPER TEXT\n<\/paper>/)
  assert.match(msg, /## c-x000000000: x\nWhat is the gap\?\nAnswer: text of at most 40 words\.\nEvidence:/)
  assert.match(msg, /exactly one of "firm", "industry", or "not stated"/)
  const paper = "We find that firms that reconfigure their resources quickly outperform their rivals in turbulent markets [p. 4]."
  const out = parseAnswers("Here: " + JSON.stringify({
    [text.id]: { answer: "Speed of reconfiguration.", evidence: [{ quote: "firms that reconfigure their resources quickly outperform", page: "p. 4" }, { quote: "an invented sentence about something else", page: "9" }] },
    [list.id]: { answer: ["- sensing", "seizing", "transforming"] }, [num.id]: { answer: "1,204" }, [choice.id]: { answer: "Region" },
  }), [text, list, num, choice], paper)
  assert.equal(out[text.id].v, "Speed of reconfiguration.")
  assert.deepEqual(out[text.id].evidence, [{ quote: "firms that reconfigure their resources quickly outperform", page: "4", found: true }, { quote: "an invented sentence about something else", page: "9", found: false }])
  assert.deepEqual(out[list.id], { v: ["sensing", "seizing"] })
  assert.deepEqual(out[num.id], { v: 1204 })
  assert.match(out[choice.id].error, /isn't one of the choices/)
  assert.equal(shapeValue(num, null), "not stated")
  assert.equal(shapeValue(choice, "FIRM"), "firm")
  assert.equal(shapeValue(text, "N/A"), "N/A") // (text keeps what it says)
  assert.match(parseAnswers("{}", [text], "")[text.id].error, /left this column out/)
  assert.throws(() => parseAnswers("no json", [text], ""), /no JSON/)
});

test("writeCell: the column's file read again, the paper set, papers in order, as ReviewCore reads it; a damaged file isn't written over", async () => {
  const { writeCell, readCell, cellsPath } = await RV();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reviews-"))
  const p = cellsPath(dir, "c-abcdefghij")
  assert.throws(() => cellsPath(dir, "../x"), /not a column id/)
  writeCell(p, "1:BBBBBBBB", { v: ["survey"], updated: "2026-10-28T10:00:00Z", by: "ai", model: "jev:jev-1", hash: "abc", input: { text: "note" }, probs: { survey: 0.8 } })
  fs.writeFileSync(p, R.setCell(fs.readFileSync(p, "utf8"), "1:AAAAAAAA", "mine", "2026-10-28T10:01:00Z", "Mac mini")) // (the app, meanwhile)
  writeCell(p, "1:CCCCCCCC", { v: 3, updated: "2026-10-28T10:02:00Z", by: "ai" })
  const text = fs.readFileSync(p, "utf8")
  assert.deepEqual(Object.keys(JSON.parse(text).cells), ["1:AAAAAAAA", "1:BBBBBBBB", "1:CCCCCCCC"])
  const cells = R.parseCells(text)
  assert.deepEqual(cells["1:BBBBBBBB"], { v: ["survey"], updated: "2026-10-28T10:00:00Z", by: "ai", model: "jev:jev-1", hash: "abc", input: { text: "note" }, probs: { survey: 0.8 } })
  assert.equal(cells["1:AAAAAAAA"].v, "mine")
  assert.equal(readCell(p, "1:CCCCCCCC").v, 3)
  fs.writeFileSync(p, "{ half")
  assert.throws(() => writeCell(p, "1:DDDDDDDD", { v: 1 }), /isn't valid/)
  assert.equal(fs.readFileSync(p, "utf8"), "{ half")
});

function fakes(over) {
  const written = {}, asked = [], classified = []
  const deps = Object.assign({
    taxonomies: [METHOD, TYPE],
    paper: async (id) => ({ title: "Title " + id, abstract: "The abstract.", extracted: id === "1:AAAA0001" ? "Extracted text. firms adapt their routines over time" : "", full: async () => ({ text: "Full text. firms adapt their routines over time", source: "pdf" }) }),
    classify: async (ts, text) => { classified.push({ ids: ts.map((t) => t.id), text }); const probs = {}; ts.forEach((t) => { probs[t.id] = {}; t.labels.forEach((l, i) => (probs[t.id][l.name] = i === 0 ? 0.9 : 0.1)) }); return { probs, by: "jev:jev-1", costUsd: 0.0001 } },
    ask: async (a) => { asked.push(a); const ids = [...a.message.matchAll(/^## (c-[a-z0-9]{10}):/gm)].map((m) => m[1]); const o = {}; ids.forEach((id) => (o[id] = { answer: "An answer for " + id, evidence: [{ quote: "firms adapt their routines over time", page: "" }] })); return { text: JSON.stringify(o), spec: a.model === "default" ? "claude:sonnet" : a.model, costUsd: 0.01 } },
    previous: (c, p) => (written[c] && written[c][p]) || null,
    write: (c, p, rec) => { (written[c] = written[c] || {})[p] = rec },
    now: () => "2026-10-28T12:00:00Z",
  }, over || {})
  return { deps, written, asked, classified }
}

test("runReview: one Jev request per paper for every Jev cell, one request per model and what it reads, cells written per paper", async () => {
  const { parseJob, runReview } = await RV();
  const m = col("m", "jev-several", { taxonomy: "method" }), r = col("r", "jev-relevance", { topic: "routines", description: "About routines" })
  const a = col("a", "prompt", { reads: "abstract", shape: "text", model: "default", evidence: true }), b = col("b", "prompt", { reads: "abstract", shape: "text", model: "default" })
  const f = col("f", "prompt", { reads: "full", shape: "text", model: "openai:gpt-5.5" })
  const job = parseJob({ name: "T", columns: [m, r, a, b, f], jobs: ["1:AAAA0001", "1:BBBB0002"].flatMap((p) => [m, r, a, b, f].map((c) => ({ column: c.id, paper: p }))) })
  const x = fakes()
  const progress = []
  x.deps.progress = (s) => progress.push(s.done)
  const out = await runReview(job, x.deps)
  assert.deepEqual([out.papers, out.cells, out.failed, out.stopped], [2, 10, 0, ""])
  assert.deepEqual(progress, [1, 2])
  assert.equal(x.classified.length, 2)
  assert.deepEqual(x.classified[0].ids, [m.id, r.id])
  assert.match(x.classified[0].text, /Full text:\nExtracted text/) // (Jev reads what tagging reads: the extracted note)
  assert.equal(x.asked.length, 4) // per paper: the abstract pair together, the full one alone
  assert.deepEqual(x.written[m.id]["1:AAAA0001"], { updated: "2026-10-28T12:00:00Z", by: "ai", model: "jev:jev-1", hash: "h-m", input: { text: "note" }, v: ["survey"], probs: { survey: 0.9, "case study": 0.1, experiment: 0.1 }, suggested: [] })
  assert.equal(x.written[m.id]["1:BBBB0002"].input.text, "abstract")
  assert.equal(x.written[r.id]["1:AAAA0001"].v, 90)
  assert.equal(x.written[a.id]["1:AAAA0001"].evidence[0].found, false) // (it read the abstract: the quote isn't there)
  assert.equal(x.written[f.id]["1:AAAA0001"].evidence, undefined)
  assert.deepEqual(x.written[f.id]["1:AAAA0001"].input, { text: "pdf" })
  assert.equal(x.written[f.id]["1:AAAA0001"].model, "openai:gpt-5.5")
  // the state the table shows: up to date
  const shown = R.aiColumn(R.parseColumn(R.columnText(Object.assign({}, m, { taxonomy: "method" })), m.id), { taxonomies: [{ id: "method", hash: "t1", kind: "several" }] })
  assert.equal(R.cellState(Object.assign(shown, { hash: "h-m" }), x.written[m.id]["1:BBBB0002"], { extracted: false }), "ok")
  assert.equal(R.cellState(Object.assign(shown, { hash: "h-m" }), x.written[m.id]["1:BBBB0002"], { extracted: true }), "paper")
});

test("runReview: a malformed part asked again alone; a failed cell keeps what it held, with why; a problem every paper meets stops the run", async () => {
  const { parseJob, runReview } = await RV();
  const a = col("a", "prompt", { shape: "number" }), b = col("b", "prompt", { shape: "text" })
  let calls = 0
  const x = fakes({ ask: async (q) => { calls++; return { text: calls === 1 ? JSON.stringify({ [a.id]: { answer: "many" }, [b.id]: { answer: "fine" } }) : JSON.stringify({ [a.id]: { answer: 12 } }), spec: "claude:sonnet" } } })
  const job = parseJob({ columns: [a, b], jobs: [{ column: a.id, paper: "1:AAAA0001" }, { column: b.id, paper: "1:AAAA0001" }] })
  const out = await runReview(job, x.deps)
  assert.equal(calls, 2)
  assert.equal(out.cells, 2)
  assert.equal(x.written[a.id]["1:AAAA0001"].v, 12)
  // yours, failed: your text stays, the error with it
  const y = fakes({ ask: async () => { throw new Error("the model took longer than 300 s") } })
  y.written[b.id] = { "1:AAAA0001": { v: "my words", updated: "x", by: "Mac mini" } }
  const out2 = await runReview(parseJob({ columns: [b], jobs: [{ column: b.id, paper: "1:AAAA0001" }, { column: b.id, paper: "1:BBBB0002" }] }), y.deps)
  assert.deepEqual([out2.cells, out2.failed, out2.stopped], [0, 2, ""])
  assert.deepEqual(y.written[b.id]["1:AAAA0001"], { v: "my words", updated: "2026-10-28T12:00:00Z", by: "Mac mini", error: "the model took longer than 300 s" })
  assert.equal(R.cellState({ ai: true, hash: "h-b" }, y.written[b.id]["1:AAAA0001"], {}), "failed")
  // out of credit: the rest stopped, not failed one by one
  const z = fakes({ classify: async () => { throw new Error("Jev refused (402): out of credit") } })
  const m = col("m", "jev-several", { taxonomy: "method" })
  const out3 = await runReview(parseJob({ columns: [m], jobs: ["1:AAAA0001", "1:BBBB0002", "1:CCCC0003"].map((p) => ({ column: m.id, paper: p })) }), z.deps)
  assert.equal(out3.failed, 1)
  assert.match(out3.stopped, /out of credit/)
  assert.equal(z.written[m.id]["1:BBBB0002"], undefined)
});

// ---------------------------------------------------------------- the runner, end to end

function serve(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const out = handler(req.url, body ? JSON.parse(body) : {});
        res.writeHead(out.status || 200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(out.body));
      });
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

test("review-run: Jev's cells in the column's file, no tags written, one task for the run", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "review-run-"));
  const urls = [];
  const bridge = await serve((url, b) => {
    urls.push(url);
    if (url === "/oma-zotero/item") return { body: { ok: true, item: { key: b.key, libraryID: 1, itemType: "journalArticle", title: "Routines" }, paper: { key: b.key, title: "Routines", authors: "Feldman", year: "2000", abstract: "We study routines." }, notes: [], tags: [] } };
    return { status: 404, body: { ok: false, error: { code: "nope", message: url } } };
  });
  let asked = null;
  const jev = await serve((url, b) => {
    asked = b;
    const answers = {};
    Object.keys(b.questions).forEach((k) => (answers[k] = { type: "noul", noul: /__0$/.test(k) ? 0.8 : 0.1 }));
    return { body: { model: "jev-1.13.0", answers, usage: { input_tokens: 1000 } } };
  });
  fs.mkdirSync(path.join(tmp, "run/oma-zotero"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "run/oma-zotero/bridge.json"), JSON.stringify({ port: bridge.address().port, token: "a".repeat(64) }));
  const env = { HOME: tmp, XDG_RUNTIME_DIR: path.join(tmp, "run"), XDG_STATE_HOME: path.join(tmp, "state"), XDG_CONFIG_HOME: path.join(tmp, "config"), JEV_API_KEY: "test-key", OMA_JEV_URL: `http://127.0.0.1:${jev.address().port}/v1`, PATH: path.join(tmp, "bin") };
  const { paths } = await import("../../runner/lib/paths.mjs");
  const dir = paths(env).reviews;
  const m = { id: "c-method0001", label: "Method", kind: "jev-several", taxonomy: "method", hash: "aaaaaaaaaaaa" };
  const r = { id: "c-relevant01", label: "Relevant?", kind: "jev-relevance", topic: "routines", description: "It studies organizational routines", hash: "bbbbbbbbbbbb" };
  try {
    const out = await runner(["review-run", "--quiet"], env, JSON.stringify({ review: "r-0123456789", name: "Chapter 2", columns: [m, r], jobs: [{ column: m.id, paper: "1:AAAA0001" }, { column: r.id, paper: "1:AAAA0001" }] }));
    assert.equal(out.code, 0, out.err);
    assert.deepEqual(JSON.parse(out.out), { papers: 1, done: 1, cells: 2, failed: 0, stopped: "", error: "", costUsd: 0.000042 });
    assert.ok(!urls.includes("/oma-zotero/tags/update"));
    assert.match(asked.state, /^Title: Routines\n\nAbstract: We study routines\./);
    assert.ok(Object.keys(asked.questions).some((k) => k.indexOf(m.id + "__") === 0) && asked.questions[r.id + "__0"]);
    assert.match(asked.questions[r.id + "__0"].instructions, /routines: It studies organizational routines/);
    const mc = R.parseCells(fs.readFileSync(path.join(dir, "cells", m.id + ".cells.json"), "utf8"))["1:AAAA0001"];
    assert.equal(mc.by, "ai");
    assert.equal(mc.hash, "aaaaaaaaaaaa");
    assert.equal(mc.model, "jev:jev-1.13.0");
    assert.equal(mc.v.length, 1);
    const rc = R.parseCells(fs.readFileSync(path.join(dir, "cells", r.id + ".cells.json"), "utf8"))["1:AAAA0001"];
    assert.equal(rc.v, 80);
    const tasks = JSON.parse(fs.readFileSync(path.join(paths(env).runnerTasks, "tasks.json"), "utf8")).tasks;
    assert.equal(tasks.length, 1);
    assert.deepEqual([tasks[0].kind, tasks[0].status, tasks[0].title, tasks[0].paper, tasks[0].detail], ["review", "done", "Review “Chapter 2”", "2 columns, 2 cells", "2 cells filled"]);
    const bad = await runner(["review-run", "--quiet"], env, "{}");
    assert.equal(bad.code, 1);
    assert.match(bad.err, /no AI columns/);
  } finally {
    bridge.close();
    jev.close();
  }
});

test("Write it with AI: what you describe, and the column as it is, go to the model; its answer becomes a column", async () => {
  const { draftMessage, parseColumnDraft } = await RV();
  const m = draftMessage("prompt", "the sample size and countries", { label: "Sample", description: "How many firms?", shape: "number" })
  assert.match(m, /the sample size and countries/)
  assert.match(m, /"prompt":"How many firms\?"/) // (to change, not start over)
  assert.doesNotMatch(draftMessage("prompt", "x", {}), /as it is now/)
  const c = parseColumnDraft('Sure.\n```json\n{"label":"Sample","prompt":"How many firms or people did the study use, and from which countries? Say not stated when the paper doesn\'t say.","reads":"full","shape":"list","length":4,"evidence":true,"notes":"The body has it."}\n```', "prompt")
  assert.deepEqual(c.column, { label: "Sample", prompt: "How many firms or people did the study use, and from which countries? Say not stated when the paper doesn't say.", reads: "full", shape: "list", length: 4, options: [], evidence: true })
  assert.equal(c.notes, "The body has it.")
  // a choice with fewer than two choices is text; odd lengths fall back; nothing usable is an error
  assert.equal(parseColumnDraft('{"label":"X","prompt":"Q?","shape":"choice","options":["a"]}', "prompt").column.shape, "text")
  assert.equal(parseColumnDraft('{"label":"X","prompt":"Q?","shape":"text","length":9000}', "prompt").column.length, 60)
  assert.deepEqual(parseColumnDraft('{"label":"X","prompt":"Q?","shape":"choice","options":"firm, industry, firm"}', "prompt").column.options, ["firm", "industry"])
  assert.match(parseColumnDraft("no json here", "prompt").error, /no JSON/)
  assert.match(parseColumnDraft('{"label":"X"}', "prompt").error, /no question/)
  // relevance: a topic and what relevant means
  assert.match(draftMessage("jev-relevance", "dynamic capabilities", {}), /"topic"/)
  assert.deepEqual(parseColumnDraft('{"topic":"dynamic capabilities","definition":"It theorizes or tests them."}', "jev-relevance").column, { label: "dynamic capabilities", topic: "dynamic capabilities", definition: "It theorizes or tests them." })
  assert.match(parseColumnDraft('{"definition":"x"}', "jev-relevance").error, /no topic/)
})
