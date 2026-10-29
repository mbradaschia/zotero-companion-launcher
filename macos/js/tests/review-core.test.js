// The review table's logic (ZoteroLauncher/Review/ReviewCore.js, phase 11a): values, columns, the multi-key sort,
// the CSV, and its files.
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../../ZoteroLauncher/Review/ReviewCore.js");

const row = (key, o) => Object.assign({ key, libraryID: 1, itemType: "journalArticle", title: "T " + key, creator: "", year: "", publication: "", rank: null,
  pdfCount: 0, noteCount: 0, extracted: false, dateAdded: "", dateModified: "", facets: [], tags: [], tagCount: 0, status: "" }, o || {});
const ctx = {
  statuses: ["to read", "reading", "read"],
  taskStatuses: ["To read", "Next", "Reading", "Done"],
  tasks: { "1:BBBBBBBB": { name: "Reading" }, "1:CCCCCCCC": { name: "To read" } },
  taxonomies: [{ name: "Method", prefix: "method/", kind: "several" }, { name: "Theory", prefix: "theory/", kind: "one" }]
};
const own = { id: "c-0123456789", label: "Include?", kind: "own", type: "choice", options: ["include", "maybe", "exclude"], description: "" };
const notes = { id: "c-abcdefghij", label: "My notes", kind: "own", type: "text", options: [], description: "" };
const defs = { [own.id]: own, [notes.id]: notes };
const rand = () => 0.5;

test("values: what each column shows, from a /search row, the tasks and the cells", () => {
  const r = row("AAAAAAAA", { creator: "Sirmon et al.", year: "2011", publication: "Journal of Management", status: "s/reading", extracted: true,
    rank: { ajg: "4*", abdc: "A*", field: "General management", ft50: true, utd24: false }, facets: ["method/case study", "Method/survey", "theory/RBV"],
    dateAdded: "2025-02-11 10:00:00", pdfCount: 1, noteCount: 3, tagCount: 7 });
  const cols = R.columns({ columns: R.available(ctx, defs).map((c) => ({ id: c.id })) }, ctx, defs);
  const v = (id) => R.value(cols.find((c) => c.id === id), r, ctx, { [own.id]: { "1:AAAAAAAA": { v: "include" } } });
  assert.equal(v("authors"), "Sirmon et al.");
  assert.equal(v("year"), 2011);
  assert.equal(v("type"), "Journal article");
  assert.equal(v("added"), "2025-02-11");
  assert.equal(v("status"), "reading");
  assert.equal(v("abs"), "4*");
  assert.equal(v("ft50"), true);
  assert.equal(v("utd24"), "");
  assert.equal(v("text"), true);
  assert.equal(v("pdfs"), 1);
  assert.deepEqual(v("tax:method"), ["case study", "survey"]); // the prefix in any case
  assert.deepEqual(v("tax:theory"), ["RBV"]);
  assert.equal(v(own.id), "include");
  assert.equal(v(notes.id), "");
  assert.equal(v("task"), "");
  assert.equal(R.value(cols.find((c) => c.id === "task"), row("BBBBBBBB"), ctx, {}), "Reading");
  assert.equal(R.value(cols.find((c) => c.id === "status"), row("BBBBBBBB", { status: "\u0000" }), ctx, {}), ""); // (a bridge too old)
  assert.equal(R.text(cols[0], ["a", "b"]), "a; b");
  assert.equal(R.text(cols[0], true), "yes");
});

test("columns: the review's order and layout; a column whose file is gone is kept, marked missing", () => {
  const cols = R.columns({ columns: [{ id: "title" }, { id: "year", width: 90, lines: 1 }, { id: "c-zzzzzzzzzz" }, { id: "tax:method", hidden: true }] }, ctx, defs);
  assert.deepEqual(cols.map((c) => c.id), ["title", "year", "c-zzzzzzzzzz", "tax:method"]);
  assert.equal(cols[1].width, 90);
  assert.equal(cols[2].missing, true);
  assert.equal(cols[3].hidden, true);
  assert.equal(cols[3].label, "Method");
  const all = R.available(ctx, defs).map((c) => c.id);
  assert.ok(all.includes("tax:theory") && all.includes(own.id) && all.includes("ft50"));
});

test("sort: by several keys, empties last either way, ties in the set's order", () => {
  const rows = [row("AAAAAAAA", { year: "2011", status: "s/read" }), row("BBBBBBBB", { year: "", status: "s/reading" }), row("CCCCCCCC", { year: "2003", status: "s/read" }),
    row("DDDDDDDD", { year: "2011", status: "" }), row("EEEEEEEE", { year: "2003", status: "s/to read" })];
  const cols = R.columns({ columns: [{ id: "title" }, { id: "year" }, { id: "status" }] }, ctx, {});
  const keys = (sorts) => R.sortRows(rows, sorts, cols, ctx, {}).map((r) => r.key[0]).join("");
  assert.equal(keys([{ column: "year", dir: "asc" }]), "CEADB");
  assert.equal(keys([{ column: "year", dir: "desc" }]), "ADCEB"); // the empty year still last
  assert.equal(keys([{ column: "status", dir: "asc" }]), "EBACD"); // your statuses' order, none last
  assert.equal(keys([{ column: "year", dir: "desc" }, { column: "status", dir: "asc" }]), "ADECB");
  assert.equal(keys([]), "ABCDE");
  assert.equal(keys([{ column: "gone", dir: "asc" }]), "ABCDE");
});

test("sort: grades, flags, choices and text as Finder compares it", () => {
  const rows = [row("AAAAAAAA", { rank: { ajg: "3" }, title: "item 10" }), row("BBBBBBBB", { rank: { ajg: "4*", ft50: true }, title: "Item 9" }),
    row("CCCCCCCC", { rank: { ajg: "4" }, title: "élan" }), row("DDDDDDDD", { title: "Alpha" })];
  const cols = R.columns({ columns: [{ id: "title" }, { id: "abs" }, { id: "ft50" }, { id: own.id }] }, ctx, defs);
  const keys = (sorts, cells) => R.sortRows(rows, sorts, cols, ctx, cells || {}).map((r) => r.key[0]).join("");
  assert.equal(keys([{ column: "abs", dir: "asc" }]), "BCAD"); // 4* first
  assert.equal(keys([{ column: "ft50", dir: "asc" }]), "BACD");
  assert.equal(keys([{ column: "title", dir: "asc" }]), "DCBA"); // accents and numbers as a person reads them
  const cells = { [own.id]: { "1:AAAAAAAA": { v: "exclude" }, "1:CCCCCCCC": { v: "include" }, "1:DDDDDDDD": { v: "maybe" } } };
  assert.equal(keys([{ column: own.id, dir: "asc" }], cells), "CDAB"); // the choices' order
});

test("clickSort: a click sorts by it alone (asc, desc, off); ⇧-click adds, turns, removes", () => {
  assert.deepEqual(R.clickSort([], "year", false), [{ column: "year", dir: "asc" }]);
  assert.deepEqual(R.clickSort([{ column: "year", dir: "asc" }], "year", false), [{ column: "year", dir: "desc" }]);
  assert.deepEqual(R.clickSort([{ column: "year", dir: "desc" }], "year", false), []);
  assert.deepEqual(R.clickSort([{ column: "year", dir: "desc" }, { column: "title", dir: "asc" }], "title", false), [{ column: "title", dir: "asc" }]);
  const two = R.clickSort([{ column: "year", dir: "desc" }], "status", true);
  assert.deepEqual(two, [{ column: "year", dir: "desc" }, { column: "status", dir: "asc" }]);
  assert.deepEqual(R.clickSort(two, "status", true), [{ column: "year", dir: "desc" }, { column: "status", dir: "desc" }]);
  assert.deepEqual(R.clickSort(R.clickSort(two, "status", true), "status", true), [{ column: "year", dir: "desc" }]);
});

test("csv: the columns shown, quoted where needed, no formulas, a BOM and CRLF", () => {
  const rows = [row("AAAAAAAA", { title: 'Say "hi", then go', year: "2011", facets: ["method/a", "method/b"] }), row("BBBBBBBB", { title: "=HYPERLINK(1)", year: "" })];
  const cols = R.columns({ columns: [{ id: "title" }, { id: "year" }, { id: "tax:method" }, { id: "status", hidden: true }, { id: notes.id }] }, ctx, defs);
  const out = R.csv(rows, cols, ctx, { [notes.id]: { "1:AAAAAAAA": { v: "two\nlines" } } });
  assert.ok(out.startsWith("﻿Paper,Year,Method,My notes,Zotero item\r\n"));
  const lines = out.slice(1).split("\r\n");
  assert.equal(lines[1], '"Say ""hi"", then go",2011,"a; b","two\nlines",1:AAAAAAAA');
  assert.equal(lines[2], "'=HYPERLINK(1),,,,1:BBBBBBBB");
  assert.equal(R.csvCell("-5 points"), "'-5 points");
  assert.equal(R.csvCell(-5), "-5");
});

test("a review's file: made whole, the paper column first, its id its file's name", () => {
  assert.equal(R.parseReview("not json", "r-0123456789"), null);
  const r = R.parseReview(JSON.stringify({ id: "r-elsewhere0", name: "  ", source: { type: "nope" }, lines: 7, panel: false,
    columns: [{ id: "year", width: 5000, lines: 4 }, { id: "year" }, { id: "../x" }, { id: "title", hidden: true }, { id: "tax:method" }, "x"],
    sort: [{ column: "year", dir: "down" }, { column: "missing" }] }), "r-0123456789");
  assert.equal(r.id, "r-0123456789");
  assert.equal(r.name, "Review");
  assert.deepEqual(r.source, { type: "query", query: "", key: "", libraryID: 1, title: "" });
  assert.deepEqual(r.columns, [{ id: "title" }, { id: "year", width: 1200 }, { id: "tax:method" }]);
  assert.deepEqual(r.sort, [{ column: "year", dir: "asc" }]);
  assert.equal(r.lines, 3);
  assert.equal(r.panel, false);
  const again = R.parseReview(R.reviewText(r, "2026-10-27T20:00:00Z"), r.id);
  assert.equal(again.updated, "2026-10-27T20:00:00Z");
  assert.deepEqual(Object.assign({}, again, { updated: "" }), Object.assign({}, r, { updated: "" }));
  const none = R.parseReview("{}", "r-0123456789");
  assert.deepEqual(none.columns, [{ id: "title" }]);
  // no width floor beyond a sliver: a column is as narrow as you drag it
  const thin = R.parseReview(JSON.stringify({ columns: [{ id: "title" }, { id: "year", width: 20 }, { id: "abs", width: 3 }] }), "r-0123456789");
  assert.deepEqual(thin.columns.map((c) => c.width), [undefined, 20, R.MIN_WIDTH]);
});

test("a new review: named after its source, the default columns and each taxonomy's", () => {
  const r = R.newReview({ type: "search", key: "s1", title: "Resilience core" }, ctx, "2026-10-27T20:00:00Z", rand);
  assert.match(r.id, /^r-[a-z0-9]{10}$/);
  assert.equal(r.name, "Resilience core");
  assert.deepEqual(r.columns.map((c) => c.id), ["title", "authors", "year", "publication", "abs", "status", "task", "tax:method", "tax:theory"]);
  assert.equal(R.sourceName({ type: "tag", key: "resilience" }), "#resilience");
  assert.equal(R.sourceName({ type: "query", query: "y:2020.. resilience" }), "“y:2020.. resilience”");
});

test("searchScope: the launcher's scope for a source; a saved search by its current query", () => {
  const searches = [{ id: "s1", name: "Core", query: "resilience #core" }];
  assert.deepEqual(R.searchScope({ type: "search", key: "s1", title: "Old", query: "old" }, searches),
    { scope: { type: "search", key: "s1", libraryID: 1, title: "Core", query: "resilience #core" }, query: "", gone: false });
  assert.equal(R.searchScope({ type: "search", key: "gone", query: "kept" }, searches).gone, true);
  assert.equal(R.searchScope({ type: "search", key: "gone", query: "kept" }, searches).scope.query, "kept");
  assert.deepEqual(R.searchScope({ type: "query", query: "rbv" }, searches), { scope: null, query: "rbv" });
  assert.deepEqual(R.searchScope({ type: "tag", key: "core", libraryID: 1, title: "core" }).scope, { type: "tag", key: "core", libraryID: 1, title: "core" });
});

test("a column's file: front matter both ways; a choice without choices is text; junk is no column", () => {
  const text = R.columnText(own);
  assert.equal(text, '---\nlabel: "Include?"\nkind: own\ntype: choice\noptions: ["include","maybe","exclude"]\n---\n');
  assert.deepEqual(R.parseColumn(text, own.id), own);
  assert.equal(R.parseColumn("no front matter", "c-0123456789"), null);
  assert.equal(R.parseColumn("---\nkind: own\n---\n", "c-0123456789"), null); // no label
  const c = R.parseColumn("---\r\nlabel: Notes\r\nkind: own\r\ntype: choice\r\n__proto__: x\r\n---\r\nWhat I think.\r\n", "c-0123456789");
  assert.equal(c.type, "text");
  assert.equal(c.description, "What I think.");
  assert.equal(Object.prototype.hasOwnProperty.call(c, "__proto__"), false);
});

test("newColumn: a name, and two choices or more for one of a list", () => {
  assert.equal(R.newColumn({ label: " " }).error, "A column needs a name");
  assert.match(R.newColumn({ label: "Inc", type: "choice", options: "yes" }).error, /two choices/);
  const c = R.newColumn({ label: "Include?", type: "choice", options: "include, maybe, include, exclude" }, rand).column;
  assert.match(c.id, /^c-[a-z0-9]{10}$/);
  assert.deepEqual(c.options, ["include", "maybe", "exclude"]);
  assert.deepEqual(R.newColumn({ label: "Notes", options: "a,b" }, rand).column.options, []);
});

test("cells: set by paper, an emptied one kept and dated, papers in order, junk left out", () => {
  let t = R.setCell("", "1:BBBBBBBB", "maybe", "2026-10-27T10:00:00Z", "Mac mini");
  t = R.setCell(t, "1:AAAAAAAA", "include", "2026-10-27T11:00:00Z", "Mac mini");
  t = R.setCell(t, "1:BBBBBBBB", "", "2026-10-27T12:00:00Z", "MacBook");
  assert.deepEqual(Object.keys(JSON.parse(t).cells), ["1:AAAAAAAA", "1:BBBBBBBB"]);
  assert.deepEqual(R.parseCells(t)["1:BBBBBBBB"], { v: "", updated: "2026-10-27T12:00:00Z", by: "MacBook" });
  assert.equal(R.setCell(t, "../x", "v", "", ""), null);
  assert.deepEqual(R.parseCells('{"cells":{"x":{"v":1},"1:AAAAAAAA":"no","__proto__":{"v":2}}}'), {});
});

// ---------------------------------------------------------------- AI columns (phase 11b)

const TAX = [{ id: "method", name: "Method", prefix: "method/", kind: "several", labels: ["survey", "case study"], threshold: 0.6, hash: "t-method" },
  { id: "paper-type", name: "Paper type", prefix: "type/", kind: "one", labels: ["empirical", "conceptual", "not stated"], threshold: 0.6, hash: "t-type" }];

test("an AI column's file both ways: each kind's keys, what's missing its default, what's wrong left out", () => {
  const p = R.newAiColumn({ label: "Gap", kind: "prompt", description: "What gap does it fill?", reads: "full", shape: "text", length: 9999, evidence: true }, { taxonomies: TAX }, rand).column;
  assert.match(p.id, /^c-[a-z0-9]{10}$/);
  assert.deepEqual([p.reads, p.shape, p.length, p.evidence, p.model], ["full", "text", 500, true, "default"]);
  const text = R.columnText(p);
  assert.match(text, /^---\nlabel: "Gap"\nkind: prompt\nreads: full\nshape: text\nlength: 500\nevidence: true\nmodel: "default"\n---\nWhat gap does it fill\?\n$/);
  assert.deepEqual(R.parseColumn(text, p.id), p);
  const list = R.parseColumn("---\nlabel: Constructs\nkind: prompt\nshape: list\nreads: sideways\n---\nWhich constructs?\n", "c-0123456789");
  assert.deepEqual([list.reads, list.shape, list.length, list.evidence], ["abstract", "list", 5, false]);
  assert.equal(R.parseColumn("---\nlabel: L\nkind: prompt\nshape: choice\noptions: [\"one\"]\n---\nQ\n", "c-0123456789").shape, "text"); // (one choice isn't a list)
  const rel = R.newAiColumn({ label: "Relevant?", kind: "jev-relevance", topic: "routines", description: "It studies routines" }, {}, rand).column;
  assert.deepEqual(R.parseColumn(R.columnText(rel), rel.id), rel);
  const several = R.newAiColumn({ label: "Method", kind: "jev-several", taxonomy: "method" }, { taxonomies: TAX }, rand).column;
  assert.equal(R.parseColumn(R.columnText(several), several.id).taxonomy, "method");
  assert.equal(R.parseColumn("---\nlabel: M\nkind: jev-one\ntaxonomy: ../x\n---\n", "c-0123456789").taxonomy, "");
});

test("newAiColumn: what each kind needs", () => {
  const c = { taxonomies: TAX };
  assert.equal(R.newAiColumn({ kind: "prompt" }, c).error, "A column needs a name");
  assert.equal(R.newAiColumn({ label: "X", kind: "magic" }, c).error, "Pick what the AI does");
  assert.match(R.newAiColumn({ label: "X", kind: "prompt" }, c).error, /Write the prompt/);
  assert.match(R.newAiColumn({ label: "X", kind: "prompt", description: "Q", shape: "choice", options: "a" }, c).error, /two choices/);
  assert.match(R.newAiColumn({ label: "X", kind: "jev-relevance", topic: "t" }, c).error, /what relevant means/);
  assert.match(R.newAiColumn({ label: "X", kind: "jev-one", taxonomy: "gone" }, c).error, /Pick one of your taxonomies/);
  assert.match(R.newAiColumn({ label: "X", kind: "jev-one", taxonomy: "method" }, c).error, /one-label kind/);
  assert.match(R.newAiColumn({ label: "X", kind: "jev-several", taxonomy: "paper-type" }, c).error, /several-labels kind/);
  assert.deepEqual(R.newAiColumn({ label: "X", kind: "prompt", description: "Q", shape: "choice", options: "firm, industry, firm" }, c, rand).column.options, ["firm", "industry"]);
});

test("an AI column in the table: how it draws and sorts, its fingerprint (the model left out), a taxonomy that's gone", () => {
  const p = R.parseColumn("---\nlabel: N\nkind: prompt\nshape: number\nmodel: \"openai:gpt-5.5\"\n---\nSample size?\n", "c-0123456789");
  const col = R.aiColumn(p, { taxonomies: TAX });
  assert.deepEqual([col.type, col.ai, col.group, col.kindName, col.edit, col.model], ["number", true, "AI columns", "AI prompt", "", "openai:gpt-5.5"]);
  assert.equal(col.hash, R.aiColumn(Object.assign({}, p, { model: "claude:sonnet" }), {}).hash); // (another model: Run it again, not "changed")
  assert.notEqual(col.hash, R.aiColumn(Object.assign({}, p, { description: "Sample size, in firms?" }), {}).hash);
  assert.match(col.hash, /^[0-9a-f]{12}$/);
  assert.equal(R.aiColumn(Object.assign({}, p, { shape: "text" }), {}).edit, "text");
  const one = R.aiColumn({ id: "c-1111111111", label: "Type", kind: "jev-one", taxonomy: "paper-type", description: "" }, { taxonomies: TAX });
  assert.deepEqual([one.type, one.options, one.reads], ["choice", ["empirical", "conceptual", "not stated"], "tagging"]);
  assert.notEqual(one.hash, R.aiColumn(one, { taxonomies: [Object.assign({}, TAX[1], { hash: "t-type-2" })] }).hash); // (the taxonomy changed)
  const gone = R.aiColumn(one, { taxonomies: [] });
  assert.match(gone.problem, /isn't there any more/);
  assert.deepEqual(R.available({ taxonomies: TAX }, { "c-0123456789": p }).filter((c) => c.ai).map((c) => c.id), ["c-0123456789"]);
  const cells = { "c-0123456789": { "1:AAAAAAAA": { v: 120, by: "ai" }, "1:BBBBBBBB": { v: "not stated", by: "ai" } } };
  assert.equal(R.value(col, row("AAAAAAAA"), ctx, cells), 120);
  assert.equal(R.value(col, row("BBBBBBBB"), ctx, cells), "not stated");
  assert.deepEqual(R.value(R.aiColumn({ id: "c-2222222222", label: "M", kind: "jev-several", taxonomy: "method" }, { taxonomies: TAX }), row("AAAAAAAA"), ctx,
    { "c-2222222222": { "1:AAAAAAAA": { v: ["survey"], by: "ai" } } }), ["survey"]);
  assert.equal(R.band(70), "high");
  assert.equal(R.band(69), "maybe");
  assert.equal(R.band(10), "low");
});

test("a cell's state: not run, up to date, prompt changed, paper changed, yours, failed", () => {
  const full = { ai: true, kind: "prompt", reads: "full", hash: "h1" }, abs = { ai: true, kind: "prompt", reads: "abstract", hash: "h1" };
  const ai = { v: "x", by: "ai", hash: "h1", input: { text: "pdf" } };
  assert.equal(R.cellState(full, null, row("A")), "empty");
  assert.equal(R.cellState(full, ai, row("A")), "ok");
  assert.equal(R.cellState(Object.assign({}, full, { hash: "h2" }), ai, row("A")), "prompt");
  assert.equal(R.cellState(full, ai, row("A", { extracted: true })), "paper");
  assert.equal(R.cellState(full, Object.assign({}, ai, { input: { text: "note" } }), row("A", { extracted: true })), "ok");
  assert.equal(R.cellState(abs, ai, row("A", { extracted: true })), "ok"); // (the abstract doesn't change with the text)
  assert.equal(R.cellState(full, { v: "mine", by: "Mac mini" }, row("A")), "yours");
  assert.equal(R.cellState(full, { v: "", by: "ai", error: "no answer" }, row("A")), "failed");
  assert.equal(R.cellState(full, { v: "", by: "ai", hash: "h1" }, row("A")), "ok"); // (an empty answer is an answer)
});

test("runPlan: the counts per state, what's skipped, the requests (Jev once a paper, prompts per model and reads), Jev's cost", () => {
  const a = { id: "c-aaaaaaaaaa", ai: true, kind: "prompt", reads: "abstract", model: "default", hash: "h" }, b = Object.assign({}, a, { id: "c-bbbbbbbbbb" });
  const m = { id: "c-mmmmmmmmmm", ai: true, kind: "jev-several", hash: "j" }, r = { id: "c-rrrrrrrrrr", ai: true, kind: "jev-relevance", hash: "k" };
  const x = { id: "c-xxxxxxxxxx", ai: true, kind: "jev-one", hash: "z", problem: "gone" };
  const rows = [row("AAAAAAAA"), row("BBBBBBBB")];
  const cells = { "c-aaaaaaaaaa": { "1:AAAAAAAA": { v: "up", by: "ai", hash: "h" }, "1:BBBBBBBB": { v: "mine", by: "Mac" } } };
  const plan = R.runPlan([a, b, m, r, x, { id: "title" }], rows, cells, {});
  assert.deepEqual(plan.counts["c-aaaaaaaaaa"], { empty: 0, ok: 1, prompt: 0, paper: 0, yours: 1, failed: 0 });
  assert.deepEqual(plan.skipped, { ok: 1, yours: 1, problem: 2 });
  assert.equal(plan.jobs.length, 6);
  assert.deepEqual(plan.requests, { jev: 2, prompt: 2 });
  assert.equal(plan.papers, 2);
  assert.equal(plan.jevUsd, Math.round(2 * 6000 * 0.042 / 1e6 * 10000) / 10000);
  const again = R.runPlan([a], rows, cells, { again: true, yours: true });
  assert.equal(again.jobs.length, 2);
  assert.equal(R.runPlan([a], Array.from({ length: 250 }, (_, i) => row(String(i).padStart(8, "A"))), {}, {}).papers, 200);
});

test("an AI cell you edit keeps the AI's answer; Back to the AI's answer brings it back", () => {
  const ai = { v: "the AI's", updated: "2026-10-28T10:00:00Z", by: "ai", model: "claude:sonnet", hash: "h", input: { text: "pdf" }, evidence: [{ quote: "q", page: "3", found: true }] };
  const start = JSON.stringify({ cells: { "1:AAAAAAAA": ai } });
  const edited = R.setCell(start, "1:AAAAAAAA", "mine", "2026-10-28T11:00:00Z", "Mac mini");
  const c = R.parseCells(edited)["1:AAAAAAAA"];
  assert.deepEqual([c.v, c.by], ["mine", "Mac mini"]);
  assert.deepEqual(c.ai, ai);
  const again = R.parseCells(R.setCell(edited, "1:AAAAAAAA", "mine, again", "2026-10-28T12:00:00Z", "Mac mini"))["1:AAAAAAAA"];
  assert.deepEqual(again.ai, ai); // (still the AI's, not your first edit)
  const back = R.parseCells(R.restoreCell(edited, "1:AAAAAAAA", "2026-10-28T13:00:00Z"))["1:AAAAAAAA"];
  assert.deepEqual(back, Object.assign({}, ai, { updated: "2026-10-28T13:00:00Z" }));
  assert.equal(R.restoreCell(start, "1:AAAAAAAA", "x"), null); // (nothing to go back to)
  assert.deepEqual(R.parseCells(JSON.stringify({ cells: { "1:AAAAAAAA": { v: [1, "a"], p: 7, probs: { a: 2, __proto__: 1 }, by: "ai" } } }))["1:AAAAAAAA"], { v: ["1", "a"], updated: "", by: "ai", p: 1, probs: { a: 1 } });
});

test("reviewFor: ⌘T on a list with a review opens that one (the newest changed); else none", () => {
  const reviews = [
    { id: "r-aaaaaaaaaa", source: { type: "query", query: "dynamic  capabilities" }, updated: "2026-10-27T10:00:00Z" },
    { id: "r-bbbbbbbbbb", source: { type: "query", query: "dynamic capabilities" }, updated: "2026-10-28T10:00:00Z" },
    { id: "r-cccccccccc", source: { type: "collection", key: "WXYZ9876", libraryID: 2 }, updated: "2026-10-28T11:00:00Z" },
    { id: "r-dddddddddd", source: { type: "search", key: "s1", libraryID: 1 }, updated: "" },
    { id: "../x", source: { type: "tag", key: "to-read", libraryID: 1 } }
  ];
  assert.equal(R.reviewFor(reviews, { type: "query", query: " dynamic capabilities " }), "r-bbbbbbbbbb");
  assert.equal(R.reviewFor(reviews, { type: "collection", key: "WXYZ9876", libraryID: 2 }), "r-cccccccccc");
  assert.equal(R.reviewFor(reviews, { type: "collection", key: "WXYZ9876", libraryID: 1 }), "", "the same key in another library is another list");
  assert.equal(R.reviewFor(reviews, { type: "search", key: "s1", libraryID: 3 }), "r-dddddddddd", "a saved search is the same whatever the library");
  assert.equal(R.reviewFor(reviews, { type: "tag", key: "to-read", libraryID: 1 }), "", "a review with a bad id isn't one");
  assert.equal(R.reviewFor(reviews, { type: "query", query: "" }), "");
  assert.equal(R.reviewFor(null, { type: "query", query: "x" }), "");
  assert.ok(!R.sameSource({ type: "tag", key: "a" }, { type: "collection", key: "a" }));
});

test("a title's rich text: italics, bold, sub- and superscripts read, other tags left out, never shown as markup", () => {
  assert.deepEqual(R.titleRuns("Resource orchestration <b>breadth</b>"), [
    { text: "Resource orchestration ", i: false, b: false, sub: false, sup: false }, { text: "breadth", i: false, b: true, sub: false, sup: false }]);
  assert.deepEqual(R.titleRuns("CO<sub>2</sub> and <i>E. coli</i>").map((r) => [r.text, r.sub, r.i]), [["CO", false, false], ["2", true, false], [" and ", false, false], ["E. coli", false, true]]);
  assert.equal(R.plainTitle('A <span class="nocase">iPhone</span> study &amp; <span style="font-variant:small-caps;">more</span>'), "A iPhone study & more");
  assert.equal(R.plainTitle("p < 0.05 when n > 30"), "p < 0.05 when n > 30", "a < of the title's own stays");
  assert.equal(R.plainTitle("<script>x</script>"), "<script>x</script>", "an unknown tag is text, drawn as text");
  assert.deepEqual(R.titleRuns(""), []);
  assert.equal(R.value({ id: "title" }, { title: "The <i>dynamic</i> view" }, {}, {}), "The dynamic view", "sorted, filtered and exported as read");
});
