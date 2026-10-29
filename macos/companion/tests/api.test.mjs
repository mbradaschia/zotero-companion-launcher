// The companion's API (lib/api.mjs) through the server, on the tests' Mac mini (helpers.mjs): what a paper shows, and
// each change written as the Mac app writes it (todos.json through Glue, t/ and s/ tags through the bridge, the review
// columns' cells files), refused while the sync folder is away.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { startServer, api } from "./helpers.mjs";
import { promptIdOf } from "../lib/api.mjs";

const tagsOf = (s, id) => s.bridge.lib[id].tags.map((t) => t.tag).sort();
const todosOf = (s) => JSON.parse(readFileSync(join(s.env.cdir, "todos.json"), "utf8")).todos;

test("search: papers only (no notes), recent and open when nothing is typed, the rows kept for later", async () => {
  const s = await startServer();
  try {
    const recent = await api(s.base, "/api/search");
    assert.equal(recent.status, 200);
    assert.equal(recent.json.recent, true);
    assert.deepEqual(recent.json.rows.map((r) => r.id), ["1:AAAA1111", "1:BBBB2222"]);
    assert.equal(recent.json.rows[0].status, "to read");
    const q = await api(s.base, "/api/search?q=resource");
    assert.deepEqual(q.json.rows.map((r) => r.title), ["A resource-based view of the firm"]);
    assert.ok(s.ctx.rows.has("1:BBBB2222"));
  } finally { await s.close(); }
});

test("paper: status, taxonomies by name with their labels, suggestions, and plain tags (no s/, t/ or taxonomy tags)", async () => {
  const s = await startServer();
  try {
    const r = await api(s.base, "/api/paper?id=1:AAAA1111");
    assert.equal(r.status, 200);
    const p = r.json;
    assert.equal(p.title, "Dynamic capabilities and strategic management");
    assert.equal(p.status, "to read");
    assert.deepEqual(p.ranks, ["ABS 4*", "FT50"]);
    assert.deepEqual(p.taxonomies.map((t) => [t.name, t.labels]), [["Theory", ["dynamic-capabilities"]], ["Method", ["case"]]]);
    assert.deepEqual(p.suggestions, [{ taxonomy: "theory", name: "Theory", label: "rbv", p: 0.71 }]);
    assert.deepEqual(p.tags, ["firm"]);
    assert.equal(p.noteCount, 1);
    assert.equal(p.extracted, true);
    assert.equal(p.task, null);
    assert.equal((await api(s.base, "/api/paper?id=nope")).status, 400);
  } finally { await s.close(); }
});

test("status: the new s/ tag on, the old one off; none takes it off; not one of yours is refused", async () => {
  const s = await startServer();
  try {
    assert.equal((await api(s.base, "/api/status", { body: { id: "1:AAAA1111", status: "reading" } })).status, 200);
    assert.ok(tagsOf(s, "1:AAAA1111").includes("s/reading"));
    assert.ok(!tagsOf(s, "1:AAAA1111").includes("s/to read"));
    await api(s.base, "/api/status", { body: { id: "1:AAAA1111", status: "" } });
    assert.ok(!tagsOf(s, "1:AAAA1111").some((t) => t.startsWith("s/")));
    const bad = await api(s.base, "/api/status", { body: { id: "1:AAAA1111", status: "nonsense" } });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, "bad-status");
  } finally { await s.close(); }
});

test("task: the default task made with the paper's citation, moved, and taken off; its t/ tag follows", async () => {
  const s = await startServer();
  try {
    const st = await api(s.base, "/api/settings");
    const ids = Object.fromEntries(st.json.taskStatuses.map((x) => [x.name, x.id]));
    const set = await api(s.base, "/api/task", { body: { id: "1:BBBB2222", status: ids.Reading } });
    assert.equal(set.status, 200);
    assert.equal(set.json.task.name, "Reading");
    const list = todosOf(s);
    assert.equal(list.length, 1);
    assert.equal(list[0].isDefault, true);
    assert.equal(list[0].description, "Read Wernerfelt (1984)");
    assert.ok(tagsOf(s, "1:BBBB2222").includes("t/Reading"));
    await api(s.base, "/api/task", { body: { id: "1:BBBB2222", status: ids.Writing } });
    assert.ok(tagsOf(s, "1:BBBB2222").includes("t/Writing") && !tagsOf(s, "1:BBBB2222").includes("t/Reading"));
    assert.equal((await api(s.base, "/api/paper?id=1:BBBB2222")).json.task.name, "Writing");
    const off = await api(s.base, "/api/task", { body: { id: "1:BBBB2222", status: "" } });
    assert.equal(off.json.task, null);
    assert.ok(!tagsOf(s, "1:BBBB2222").some((t) => t.startsWith("t/")));
    // (removed, Merge's tombstone keeps it from coming back from another Mac's copy)
    assert.equal(todosOf(s).filter((t) => !t.deleted).length, 0);
  } finally { await s.close(); }
});

test("task: a task you wrote is never taken off from the status row", async () => {
  const s = await startServer();
  try {
    const add = await api(s.base, "/api/tasks", { body: { id: "1:BBBB2222", description: "Compare with Barney" } });
    assert.equal(add.status, 200);
    assert.equal(add.json.task.description, "Compare with Barney");
    const off = await api(s.base, "/api/task", { body: { id: "1:BBBB2222", status: "" } });
    assert.equal(off.status, 409);
    assert.equal(off.json.error.code, "not-default");
  } finally { await s.close(); }
});

test("tasks: added, listed open first, done and undone", async () => {
  const s = await startServer();
  try {
    const a = (await api(s.base, "/api/tasks", { body: { id: "1:AAAA1111", description: "First" } })).json.task;
    await api(s.base, "/api/tasks", { body: { id: "1:AAAA1111", description: "Second" } });
    assert.equal((await api(s.base, "/api/tasks", { body: { id: "1:AAAA1111", description: "  " } })).status, 400);
    const done = await api(s.base, "/api/tasks/toggle", { body: { todo: a.id } });
    assert.equal(done.json.task.done, true);
    const list = (await api(s.base, "/api/tasks?id=1:AAAA1111")).json.tasks;
    assert.deepEqual(list.map((t) => [t.description, t.done]), [["Second", false], ["First", true]]);
    assert.equal((await api(s.base, "/api/paper?id=1:AAAA1111")).json.openTasks, 1);
    assert.equal((await api(s.base, "/api/tasks/toggle", { body: { todo: "gone" } })).status, 404);
  } finally { await s.close(); }
});

test("tasks: a todos.json that isn't tasks (a sync conflict) is left alone", async () => {
  const s = await startServer();
  try {
    writeFileSync(join(s.env.cdir, "todos.json"), "<<<<<<< mine");
    const r = await api(s.base, "/api/tasks", { body: { id: "1:AAAA1111", description: "x" } });
    assert.equal(r.status, 409);
    assert.equal(readFileSync(join(s.env.cdir, "todos.json"), "utf8"), "<<<<<<< mine");
  } finally { await s.close(); }
});

test("the sync folder away: nothing is written, and the page is told why", async () => {
  const s = await startServer({ sync: true });
  try {
    const r = await api(s.base, "/api/tasks", { body: { id: "1:AAAA1111", description: "x" } });
    assert.equal(r.status, 503);
    assert.equal(r.json.error.code, "sync-unavailable");
    assert.equal((await api(s.base, "/api/health")).json.syncFolder.ok, false);
  } finally { await s.close(); }
});

test("notes: listed, one as HTML, a new one through the runner (Markdown on stdin, tagged), the citation", async () => {
  const s = await startServer();
  try {
    const list = (await api(s.base, "/api/notes?id=1:AAAA1111")).json.notes;
    assert.equal(list[0].id, "1:NAAA1111");
    assert.match((await api(s.base, "/api/note?id=1:NAAA1111")).json.html, /<h1>Extracted<\/h1>/);
    const add = await api(s.base, "/api/notes", { body: { id: "1:AAAA1111", title: "My  reading", markdown: "**Key** point" } });
    assert.equal(add.json.note, "1:NNNN9999");
    const call = s.runner.calls.find((c) => c.argv[0] === "note");
    assert.deepEqual(call.argv, ["note", "--key", "AAAA1111", "--library", "1", "--tag", "oma-companion", "--title", "My reading"]);
    assert.equal(call.stdin, "**Key** point");
    assert.match((await api(s.base, "/api/cite?id=1:AAAA1111")).json.text, /^Teece/);
  } finally { await s.close(); }
});

test("chat: the list, one chat's questions and answers, a question streamed as events", async () => {
  const s = await startServer();
  try {
    assert.equal((await api(s.base, "/api/chats?id=1:AAAA1111")).json.chats[0].id, "s1");
    const one = (await api(s.base, "/api/chat?id=1:AAAA1111&session=s1")).json;
    assert.deepEqual(one.turns.map((t) => t.role), ["user", "assistant"]);
    assert.equal((await api(s.base, "/api/chat?id=1:AAAA1111&session=../x")).status, 400);
    const r = await api(s.base, "/api/chat", { body: { id: "1:AAAA1111", question: "What are dynamic capabilities?" } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/event-stream/);
    const events = r.text.split("\n\n").filter((x) => x.startsWith("data: ")).map((x) => JSON.parse(x.slice(6)));
    assert.deepEqual(events.map((e) => e.type), ["session", "delta", "delta", "done"]);
    assert.match(r.text, /event: end/);
    assert.equal(s.runner.calls.find((c) => c.argv[0] === "chat").stdin, "What are dynamic capabilities?");
  } finally { await s.close(); }
});

test("chat: no runner on the Mac mini says so in the stream", async () => {
  const s = await startServer({ missing: true });
  try {
    const r = await api(s.base, "/api/chat", { body: { id: "1:AAAA1111", question: "x" } });
    assert.match(r.text, /aren't installed on the Mac mini/);
    assert.equal((await api(s.base, "/api/health")).json.runner.ok, false);
    // (a paper still shows, without its taxonomies)
    assert.deepEqual((await api(s.base, "/api/paper?id=1:AAAA1111")).json.taxonomies, []);
  } finally { await s.close(); }
});

test("prompts: each with its last run on this paper and whether it runs now; run starts it and leaves it", async () => {
  const s = await startServer();
  try {
    assert.equal(promptIdOf("… version 2 (summary@abc123) on …"), "summary");
    const p = (await api(s.base, "/api/prompts?id=1:AAAA1111")).json.prompts;
    assert.deepEqual(p.map((x) => [x.id, x.lastRun, x.running]), [["summary", "2026-10-20 09:00:00", false], ["critique", "", true]]);
    assert.equal((await api(s.base, "/api/prompts/run", { body: { id: "1:AAAA1111", prompt: "summary" } })).status, 200);
    assert.deepEqual(s.runner.started.at(-1).argv, ["run", "summary", "--key", "AAAA1111", "--library", "1", "--quiet"]);
    assert.equal((await api(s.base, "/api/prompts/run", { body: { id: "1:AAAA1111", prompt: "--evil" } })).status, 400);
  } finally { await s.close(); }
});

test("tags: added and removed; status and task tags only through their buttons; a suggestion decided by the runner", async () => {
  const s = await startServer();
  try {
    await api(s.base, "/api/tags", { body: { id: "1:AAAA1111", add: ["to-cite"], remove: ["firm"] } });
    assert.ok(tagsOf(s, "1:AAAA1111").includes("to-cite") && !tagsOf(s, "1:AAAA1111").includes("firm"));
    assert.equal((await api(s.base, "/api/tags", { body: { id: "1:AAAA1111", add: ["s/read"] } })).status, 400);
    await api(s.base, "/api/decide", { body: { id: "1:AAAA1111", taxonomy: "theory", label: "rbv", accept: true } });
    assert.deepEqual(s.runner.calls.find((c) => c.argv[0] === "classify-decide").argv,
      ["classify-decide", "--item", "1:AAAA1111", "--taxonomy", "theory", "--label", "rbv", "--accept"]);
    await api(s.base, "/api/classify", { body: { id: "1:AAAA1111" } });
    assert.deepEqual(s.runner.started.at(-1).argv, ["classify", "--items", "1:AAAA1111"]);
  } finally { await s.close(); }
});

function writeColumns(s) {
  const dir = join(s.env.cdir, "reviews", "columns");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "c-aaaaaaaaaa.md"), "---\nlabel: My take\nkind: own\ntype: text\n---\n");
  writeFileSync(join(dir, "c-bbbbbbbbbb.md"), "---\nlabel: Contribution\nkind: prompt\nshape: text\nreads: abstract\n---\nWhat does it contribute?\n");
}

test("columns: the review table's columns as rows, values, AI states; the hidden ones saved", async () => {
  const s = await startServer();
  try {
    writeColumns(s);
    const r = await api(s.base, "/api/columns?id=1:AAAA1111");
    assert.equal(r.status, 200);
    const by = Object.fromEntries(r.json.columns.map((c) => [c.label, c]));
    assert.equal(by.Year.value, "1997");
    assert.equal(by.Status.value, "to read");
    assert.equal(by["My take"].editable, true);
    assert.equal(by.Contribution.ai, true);
    assert.equal(by.Contribution.state, "empty");
    assert.equal(by.Contribution.runnable, true);
    assert.equal(by["Date added"] ? by["Date added"].hidden : true, true);
    await api(s.base, "/api/columns/hidden", { body: { hidden: ["year", "bad id!"] } });
    assert.deepEqual((await api(s.base, "/api/settings")).json.hiddenColumns, ["year"]);
    assert.equal(JSON.parse(readFileSync(join(s.env.cdir, "companion.json"), "utf8")).key.length, 43);
  } finally { await s.close(); }
});

test("columns: a cell edited (credited to this Mac), an AI cell run through review-run", async () => {
  const s = await startServer();
  try {
    writeColumns(s);
    assert.equal((await api(s.base, "/api/columns/cell", { body: { id: "1:AAAA1111", column: "c-aaaaaaaaaa", value: "Seminal" } })).status, 200);
    const cells = JSON.parse(readFileSync(join(s.env.cdir, "reviews", "cells", "c-aaaaaaaaaa.cells.json"), "utf8"));
    assert.equal(JSON.stringify(cells).includes("Seminal"), true);
    assert.equal(JSON.stringify(cells).includes("mini"), true);
    const by = Object.fromEntries((await api(s.base, "/api/columns?id=1:AAAA1111")).json.columns.map((c) => [c.label, c]));
    assert.equal(by["My take"].value, "Seminal");
    const run = await api(s.base, "/api/columns/run", { body: { id: "1:AAAA1111", column: "c-bbbbbbbbbb" } });
    assert.equal(run.status, 200);
    const started = s.runner.started.at(-1);
    assert.deepEqual(started.argv, ["review-run"]);
    const job = JSON.parse(started.stdin);
    assert.deepEqual(job.jobs, [{ column: "c-bbbbbbbbbb", paper: "1:AAAA1111" }]);
    assert.equal(job.columns[0].id, "c-bbbbbbbbbb");
    assert.equal((await api(s.base, "/api/columns/run", { body: { id: "1:AAAA1111", column: "c-aaaaaaaaaa" } })).status, 400);
    assert.equal((await api(s.base, "/api/columns/cell", { body: { id: "1:AAAA1111", column: "c-zzzzzzzzzz", value: "x" } })).status, 404);
    assert.equal(existsSync(join(s.env.cdir, "reviews", "cells", "c-zzzzzzzzzz.cells.json")), false);
  } finally { await s.close(); }
});

test("processes and health", async () => {
  const s = await startServer();
  try {
    assert.equal((await api(s.base, "/api/processes")).json.running[0].promptId, "critique");
    const h = (await api(s.base, "/api/health")).json;
    assert.equal(h.zotero.ok, true);
    assert.equal(h.machine, "mini");
  } finally { await s.close(); }
});
