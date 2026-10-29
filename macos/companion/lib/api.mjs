// The companion's API: what the page asks, answered from the bridge, the runner and the sync folder, through the Mac
// app's own JavaScript (context.mjs). Each handler takes the context and the request's { query, body } and gives JSON
// back, or throws (Refused: its status and message; anything else: the bridge's or the runner's problem). A chat turn
// streams (its handler answers { stream }). Nothing here logs what's in the library.
import { Glue, Client, Todos, ReviewCore as RV, Refused } from "./context.mjs";

const PAPER = /^(\d+):([A-Z0-9]{8})$/;
const SESSION = /^[A-Za-z0-9_-]{1,80}$/;
const PROMPT = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function paperRef(id) {
  const m = PAPER.exec(String(id || ""));
  if (!m) throw new Refused("not a paper", 400, "bad-paper");
  return { id: m[1] + ":" + m[2], key: m[2], libraryID: Number(m[1]) };
}

const text = (v, max = 2000) => String(v == null ? "" : v).slice(0, max);
const tagNames = (tags) => (tags || []).map((t) => String(t && t.tag !== undefined ? t.tag : t));

// ---- what the runner says, kept a moment (several tabs ask at once)
function cached(ctx, name, ms, load) {
  ctx.cache = ctx.cache || new Map();
  const hit = ctx.cache.get(name);
  if (hit && ctx.now() - hit.at < ms) return hit.value;
  const value = load().catch((e) => { ctx.cache.delete(name); throw e; });
  ctx.cache.set(name, { at: ctx.now(), value });
  return value;
}
const forget = (ctx, ...names) => names.forEach((n) => ctx.cache && ctx.cache.delete(n));

async function taxonomies(ctx) {
  try {
    return (await cached(ctx, "taxonomies", 60000, () => ctx.runner.json(["taxonomies", "--json"]))).taxonomies || [];
  } catch {
    return []; // (no runner: a paper still shows, without its taxonomies)
  }
}

async function suggestions(ctx) {
  try {
    return (await cached(ctx, "review", 15000, () => ctx.runner.json(["classify-review", "--json"]))).items || [];
  } catch {
    return [];
  }
}

async function runnerTasks(ctx) {
  try {
    return (await cached(ctx, "tasks", 2000, () => ctx.runner.json(["tasks"]))).tasks || [];
  } catch {
    return [];
  }
}

// ---- settings in effect

function statusTags(settings) {
  return Glue.statusTags(settings.paperStatuses || []);
}

function taskStatuses(settings) {
  return Glue.todoStatuses(settings).map((s) => ({ id: s.id, name: s.name, group: s.group }));
}

// ---- the bridge's answers, as the page wants them

// A search row: what the list shows and what the paper's view reads later (dates, counts).
function rowView(r) {
  return { id: (Number(r.libraryID) || 1) + ":" + r.key, key: r.key, libraryID: Number(r.libraryID) || 1, itemType: r.itemType, title: text(r.title, 500),
    creator: text(r.creator, 300), year: text(r.year, 10), publication: text(r.publication, 300), status: Client.statusName(r.status || ""),
    rank: r.rank || null, pdfCount: r.pdfCount || 0, noteCount: r.noteCount || 0, extracted: !!r.extracted };
}

const isPaper = (r) => r && r.itemType !== "note" && r.itemType !== "attachment";

export async function search(ctx, { query }) {
  const settings = ctx.settings();
  const q = text(query.q, 500);
  const limit = Math.max(1, Math.min(60, parseInt(query.limit, 10) || 30));
  const r = await ctx.bridge().post("/search", { query: q, limit, statusTags: statusTags(settings), statusPrefix: Client.PAPER_TAG_PREFIX,
    emptyQuery: { recent: "latest", showOpen: false } });
  const raw = q.trim() ? r.results || [] : (r.recent || []).concat(r.open || []);
  const rows = raw.filter(isPaper);
  for (const row of rows) {
    const id = (Number(row.libraryID) || 1) + ":" + row.key;
    ctx.rows.set(id, row);
    if (ctx.rows.size > 2000) ctx.rows.delete(ctx.rows.keys().next().value);
  }
  return { query: q, recent: !q.trim(), rows: rows.map(rowView) };
}

// The paper's search row: the one the list had, else one made from its details (no dates then).
function rowOf(ctx, ref, d, tags) {
  const paper = d.paper || {};
  const made = { key: ref.key, libraryID: ref.libraryID, itemType: d.item.itemType, title: paper.title || d.item.title, creator: paper.authors || "", year: paper.year || "",
    publication: paper.publication || "", rank: paper.rank || null, pdfCount: (d.attachments || []).filter((a) => /pdf/i.test(a.contentType || "")).length,
    noteCount: d.noteCount || 0, extracted: (d.notes || []).some((n) => n.fulltext), dateAdded: "", dateModified: "",
    facets: tags.filter((t) => /^[a-z][a-z0-9-]{0,19}\/./i.test(t) && !/^[st]\//i.test(t)), tagCount: tags.length };
  const had = ctx.rows.get(ref.id);
  return had ? Object.assign({}, made, { dateAdded: had.dateAdded || "", dateModified: had.dateModified || "" }) : made;
}

async function details(ctx, ref) {
  return ctx.bridge().post("/item", { key: ref.key, libraryID: ref.libraryID });
}

// The paper's default task, as the Mac app shows it (its pill): { todo, statusId, name } or null.
function defaultTask(todos, ref, statuses) {
  const t = Todos.defaultTaskOf(todos, { key: ref.key, libraryID: ref.libraryID }, statuses);
  if (!t) return null;
  const s = Todos.statusOfTodo(t, statuses);
  return { id: t.id, statusId: s.id, name: s.name, isDefault: !!t.isDefault };
}

function paperTodos(todos, ref) {
  return todos.filter((t) => t.item && String(t.item.key) === ref.key && (Number(t.item.libraryID) || 1) === ref.libraryID);
}

export async function paper(ctx, { query }) {
  const ref = paperRef(query.id);
  const settings = ctx.settings();
  const [d, tax, sugg] = await Promise.all([details(ctx, ref), taxonomies(ctx), suggestions(ctx)]);
  const tags = tagNames(d.tags);
  const statuses = Todos.statusesOf(settings);
  const todos = ctx.todos();
  const mine = paperTodos(todos, ref);
  const open = mine.filter((t) => Todos.statusOfTodo(t, statuses).group !== "completed");
  const prefixes = tax.map((t) => String(t.prefix || "").toLowerCase()).filter(Boolean);
  const lower = (t) => t.toLowerCase();
  const p = d.paper || {};
  return {
    id: ref.id, key: ref.key, libraryID: ref.libraryID,
    title: text(p.title || d.item.title, 500), authors: text(p.authors, 300), year: text(p.year, 10), publication: text(p.publication, 300),
    rank: p.rank || null, editable: !!(d.library && d.library.editable),
    status: Client.statusName(Glue.paperStatusOf(tags, statusTags(settings))),
    task: defaultTask(todos, ref, statuses),
    extracted: (d.notes || []).some((n) => n.fulltext), hasPdf: (d.attachments || []).some((a) => /pdf/i.test(a.contentType || "")),
    noteCount: (d.notes || []).length, openTasks: open.length,
    taxonomies: tax.filter((t) => t.show !== false).map((t) => {
      const pre = lower(String(t.prefix || ""));
      return { id: t.id, name: t.name, kind: t.kind, prefix: t.prefix,
        labels: tags.filter((g) => lower(g).startsWith(pre) && g.length > pre.length).map((g) => g.slice(pre.length)) };
    }),
    suggestions: sugg.filter((s) => s.id === ref.id).map((s) => ({ taxonomy: s.taxonomy, name: s.name, label: s.label, p: s.p })),
    tags: tags.filter((g) => !/^[st]\//i.test(g) && !prefixes.some((pre) => lower(g).startsWith(pre))).sort((a, b) => a.localeCompare(b)),
  };
}

export async function settingsView(ctx) {
  const settings = ctx.settings();
  const c = ctx.companion();
  return { paperStatuses: settings.paperStatuses || [], taskStatuses: taskStatuses(settings), hiddenColumns: hiddenColumns(c), machine: ctx.paths().machine || "" };
}

// ---- health: the header's pill

export async function health(ctx) {
  let zotero = { ok: true, message: "" };
  try {
    await ctx.bridge().post("/search", { query: "", limit: 1, emptyQuery: { recent: "none", showOpen: false } });
  } catch (e) {
    zotero = { ok: false, message: /no .*bridge\.json|isn't running/i.test(e.message) ? "Zotero isn't running on the Mac mini" : e.message };
  }
  const runner = ctx.runner.command() ? { ok: true, message: "" } : { ok: false, message: "The AI features aren't installed on the Mac mini" };
  const p = ctx.paths();
  return { zotero, runner, syncFolder: p.readOnly ? { ok: false, message: "The sync folder isn't there" } : { ok: true, message: "" }, machine: p.machine || "" };
}

// ---- status (s/ tags) and the default task (todos.json, t/ tags)

async function updateTags(ctx, ref, add, remove) {
  const a = add.filter(Boolean);
  const r = remove.filter((t) => t && !a.some((x) => x.toLowerCase() === t.toLowerCase()));
  if (!a.length && !r.length) return;
  await ctx.bridge().post("/tags/update", { key: ref.key, libraryID: ref.libraryID, add: a, remove: r });
}

// A status set: the new s/ tag on, the old one and any other status tag off (LauncherModel+Status's flushStatuses).
export async function setStatus(ctx, { body }) {
  const ref = paperRef(body.id);
  const settings = ctx.settings();
  const name = text(body.status, 100);
  const all = statusTags(settings);
  const want = name ? Glue.statusTag(name) : "";
  if (want && !all.some((t) => t.toLowerCase() === want.toLowerCase())) throw new Refused("not one of your paper statuses", 400, "bad-status");
  const d = await details(ctx, ref);
  const tags = tagNames(d.tags);
  const lowerAll = all.map((t) => t.toLowerCase());
  const off = tags.filter((t) => lowerAll.includes(t.toLowerCase()) && t.toLowerCase() !== want.toLowerCase());
  const has = tags.some((t) => t.toLowerCase() === want.toLowerCase());
  await updateTags(ctx, ref, want && !has ? [want] : [], off);
  return { status: name };
}

async function applyTaskTags(ctx, changes) {
  for (const c of changes || []) {
    if (!c.item || !c.item.key) continue;
    await updateTags(ctx, { key: String(c.item.key), libraryID: Number(c.item.libraryID) || 1 }, c.add || [], c.remove || []);
  }
}

// The default task moved to a status (Glue.setDefaultTasks, made on the first choice), or taken off ("": only one
// marked as the paper's default task; a task you wrote yourself is never removed from here).
export async function setTask(ctx, { body }) {
  const ref = paperRef(body.id);
  const settings = ctx.settings();
  const statuses = Todos.statusesOf(settings);
  const statusId = text(body.status, 80);
  if (statusId && !statuses.some((s) => s.id === statusId)) throw new Refused("not one of your task statuses", 400, "bad-status");
  let item = { key: ref.key, libraryID: ref.libraryID, title: "" };
  if (statusId) {
    const d = await details(ctx, ref);
    const p = d.paper || {};
    item = { key: ref.key, libraryID: ref.libraryID, title: p.title || d.item.title || "", cite: Glue.paperCite(p) };
  }
  const r = ctx.updateTodos((list) => {
    if (statusId) return Glue.setDefaultTasks(list, [{ item, status: statusId }], settings, ctx.now());
    const t = Todos.defaultTaskOf(list, item, statuses);
    if (!t) return { todos: list, text: Todos.serializeTodos(list) };
    if (!t.isDefault) throw new Refused("This paper's task is one you wrote: change or remove it in the Tasks tab", 409, "not-default");
    return Glue.removeTodo(list, t.id);
  });
  await applyTaskTags(ctx, Todos.taskTagChanges(r.before, statuses, r.after, statuses));
  return { task: defaultTask(r.after, ref, statuses) };
}

// ---- tasks

function todoView(t, statuses) {
  const s = Todos.statusOfTodo(t, statuses);
  return { id: t.id, description: text(t.description, 2000), statusId: s.id, statusName: s.name, group: s.group, done: s.group === "completed",
    priority: t.priority || "", priorityName: Todos.priorityName(t.priority || ""), due: t.due || "", isDefault: !!t.isDefault };
}

export async function tasks(ctx, { query }) {
  const ref = paperRef(query.id);
  const statuses = Todos.statusesOf(ctx.settings());
  const mine = paperTodos(ctx.todos(), ref).map((t) => todoView(t, statuses));
  return { tasks: mine.filter((t) => !t.done).concat(mine.filter((t) => t.done)) };
}

export async function addTask(ctx, { body }) {
  const ref = paperRef(body.id);
  const description = text(body.description, 2000).trim();
  if (!description) throw new Refused("A task needs a description", 400, "empty");
  const settings = ctx.settings();
  const statuses = Todos.statusesOf(settings);
  const d = await details(ctx, ref);
  const p = d.paper || {};
  const item = { key: ref.key, libraryID: ref.libraryID, title: p.title || d.item.title || "", cite: Glue.paperCite(p) };
  const r = ctx.updateTodos((list) => Glue.addTodo(list, { description, item }, settings, ctx.now()));
  await applyTaskTags(ctx, Todos.taskTagChanges(r.before, statuses, r.after, statuses));
  return { task: todoView(r.answer.todo, statuses) };
}

export async function toggleTask(ctx, { body }) {
  const id = text(body.todo, 80);
  const settings = ctx.settings();
  const statuses = Todos.statusesOf(settings);
  const r = ctx.updateTodos((list) => {
    if (!list.some((t) => t.id === id)) throw new Refused("That task isn't there any more", 404, "gone");
    return Glue.toggleDone(list, id, settings, ctx.now());
  });
  await applyTaskTags(ctx, Todos.taskTagChanges(r.before, statuses, r.after, statuses));
  const t = r.after.find((x) => x.id === id);
  return { task: t ? todoView(t, statuses) : null };
}

// ---- notes

export async function notes(ctx, { query }) {
  const ref = paperRef(query.id);
  const d = await details(ctx, ref);
  return { notes: (d.notes || []).map((n) => ({ id: (Number(n.libraryID) || ref.libraryID) + ":" + n.key, title: text(n.title, 300), excerpt: text(n.excerpt, 600),
    dateModified: n.dateModified || "", fulltext: !!n.fulltext })) };
}

export async function note(ctx, { query }) {
  const ref = paperRef(query.id);
  const n = await ctx.bridge().post("/note", { key: ref.key, libraryID: ref.libraryID, format: "html" });
  return { id: ref.id, title: n.title || "", html: n.html || "", truncated: !!n.truncated, dateModified: n.dateModified || "" };
}

export async function cite(ctx, { query }) {
  const ref = paperRef(query.id);
  const style = ctx.settings().citationStyle || "apa";
  const r = await ctx.bridge().post("/cite", { keys: [ref.key], libraryID: ref.libraryID, style, mode: "bibliography", format: "text" });
  return { text: text(r.text || r.bibliography || "", 4000).trim() };
}

export async function addNote(ctx, { body }) {
  const ref = paperRef(body.id);
  const markdown = text(body.markdown, 200000).trim();
  if (!markdown) throw new Refused("The note is empty", 400, "empty");
  const title = text(body.title, 200).replace(/\s+/g, " ").trim();
  const argv = ["note", "--key", ref.key, "--library", String(ref.libraryID), "--tag", "oma-companion"].concat(title ? ["--title", title] : []);
  const r = await ctx.runner.json(argv, { stdin: markdown, timeoutMs: 60000 });
  return { note: r.note ? ref.libraryID + ":" + r.note : "" };
}

// ---- chats

export async function chats(ctx, { query }) {
  const ref = paperRef(query.id);
  const r = await ctx.runner.json(["chats", "--key", ref.key, "--library", String(ref.libraryID)]);
  return { chats: (r.chats || []).map((c) => ({ id: c.id, title: text(c.title, 200), updated: c.updated || c.created || "", turns: c.turns || (c.messages ? c.messages.length : 0) })) };
}

export async function chat(ctx, { query }) {
  const ref = paperRef(query.id);
  const session = text(query.session, 80);
  if (!SESSION.test(session)) throw new Refused("not a chat", 400, "bad-session");
  const s = await ctx.runner.json(["chat-show", "--key", ref.key, "--library", String(ref.libraryID), "--session", session]);
  const turns = (s.messages || s.turns || []).filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({ role: m.role, text: text(typeof m.content === "string" ? m.content : m.text, 100000) }));
  return { id: s.id, title: text(s.title, 200), turns };
}

// A question: the runner's JSON lines, passed on as they come (server.mjs makes them server-sent events). It isn't
// stopped when the page goes: the answer is saved with the chat, and shows when you come back.
export async function ask(ctx, { body }) {
  const ref = paperRef(body.id);
  const question = text(body.question, 20000).trim();
  if (!question) throw new Refused("Ask something first", 400, "empty");
  const argv = ["chat", "--key", ref.key, "--library", String(ref.libraryID)];
  if (body.session) {
    if (!SESSION.test(String(body.session))) throw new Refused("not a chat", 400, "bad-session");
    argv.push("--session", String(body.session));
  }
  return {
    stream: (send) => {
      const s = ctx.runner.stream(argv, { stdin: question, onLine: (line) => send(line) });
      if (!s) {
        send(JSON.stringify({ type: "error", message: "The AI features aren't installed on the Mac mini" }));
        return Promise.resolve();
      }
      return s.done.then((r) => { if (r.status !== 0 && r.missing) send(JSON.stringify({ type: "error", message: "The AI features aren't installed on the Mac mini" })); });
    },
  };
}

// ---- prompts

// "Generated by … with the “…” prompt, version N (id@hash) …" → id.
export function promptIdOf(generated) {
  const m = /\(([a-z0-9][a-z0-9-]*)@[0-9a-f]+\)/.exec(String(generated || ""));
  return m ? m[1] : "";
}

export async function prompts(ctx, { query }) {
  const ref = paperRef(query.id);
  const [list, by, running] = await Promise.all([
    ctx.runner.json(["list", "--json"]),
    ctx.bridge().post("/notes/by-prompt", {}).catch(() => ({ notes: [] })),
    runnerTasks(ctx),
  ]);
  const last = {};
  for (const n of by.notes || []) {
    if (n.parentKey !== ref.key || Number(n.libraryID) !== ref.libraryID) continue;
    const id = promptIdOf(n.generated);
    if (id && (!last[id] || String(n.dateAdded) > last[id])) last[id] = String(n.dateAdded || "");
  }
  const here = (t) => t.status === "running" && String(t.key) === ref.key && (Number(t.libraryID) || 1) === ref.libraryID;
  return {
    prompts: (list.prompts || []).map((p) => ({ id: p.id, title: text(p.title, 200), excerpt: text(p.excerpt, 300), lastRun: last[p.id] || "",
      running: running.some((t) => here(t) && t.kind === "prompt" && t.promptId === p.id) })),
    classifying: running.some((t) => here(t) && t.kind === "classify"),
  };
}

export async function runPrompt(ctx, { body }) {
  const ref = paperRef(body.id);
  const prompt = text(body.prompt, 80);
  if (!PROMPT.test(prompt)) throw new Refused("not a prompt", 400, "bad-prompt");
  if (!ctx.runner.start(["run", prompt, "--key", ref.key, "--library", String(ref.libraryID), "--quiet"])) {
    throw new Refused("The AI features aren't installed on the Mac mini", 503, "runner-missing");
  }
  forget(ctx, "tasks");
  return { started: true };
}

export async function classify(ctx, { body }) {
  const ref = paperRef(body.id);
  if (!ctx.runner.start(["classify", "--items", ref.id])) throw new Refused("The AI features aren't installed on the Mac mini", 503, "runner-missing");
  forget(ctx, "tasks", "review");
  return { started: true };
}

// ---- tags and taxonomies

export async function changeTags(ctx, { body }) {
  const ref = paperRef(body.id);
  const clean = (list) => (Array.isArray(list) ? list : []).map((t) => text(t, 200).trim()).filter(Boolean).slice(0, 20);
  const add = clean(body.add), remove = clean(body.remove);
  if (add.concat(remove).some((t) => /^[st]\//i.test(t))) throw new Refused("Status and task tags change with their buttons", 400, "reserved");
  if (!add.length && !remove.length) throw new Refused("Nothing to change", 400, "empty");
  await updateTags(ctx, ref, add, remove);
  return { ok: true };
}

export async function decide(ctx, { body }) {
  const ref = paperRef(body.id);
  const taxonomy = text(body.taxonomy, 80), label = text(body.label, 200);
  if (!taxonomy || !label) throw new Refused("Which label?", 400, "bad-label");
  await ctx.runner.json(["classify-decide", "--item", ref.id, "--taxonomy", taxonomy, "--label", label, body.accept ? "--accept" : "--dismiss"], { timeoutMs: 60000 });
  forget(ctx, "review");
  return { ok: true };
}

// ---- columns (the review table's, ReviewCore's)

export const DEFAULT_HIDDEN = ["type", "added", "modified", "pdfs", "tags", "field"];

function hiddenColumns(c) {
  return Array.isArray(c.hiddenColumns) ? c.hiddenColumns.filter((x) => typeof x === "string").slice(0, 500) : DEFAULT_HIDDEN.slice();
}

async function reviewContext(ctx, settings) {
  const tax = await taxonomies(ctx);
  const statuses = Todos.statusesOf(settings);
  const tasksBy = Glue.defaultTasks(ctx.todos(), statuses);
  const taskMap = {};
  for (const id of Object.keys(tasksBy)) taskMap[id] = { id: tasksBy[id].id, name: tasksBy[id].name, group: tasksBy[id].group };
  return { statuses: settings.paperStatuses || [], taskStatusList: taskStatuses(settings), taskStatuses: statuses.map((s) => s.name), tasks: taskMap,
    taxonomies: tax.map((t) => ({ id: t.id, name: t.name, prefix: t.prefix, kind: t.kind, labels: t.labels || [], threshold: t.threshold, hash: t.hash || "" })),
    searches: [], jev: false, models: [] };
}

function cellText(col, v) {
  if (v === true) return "✓";
  return RV.text(col, v);
}

export async function columns(ctx, { query }) {
  const ref = paperRef(query.id);
  const settings = ctx.settings();
  const [d, rctx] = await Promise.all([details(ctx, ref), reviewContext(ctx, settings)]);
  const tags = tagNames(d.tags);
  const row = Object.assign(rowOf(ctx, ref, d, tags), { status: Glue.paperStatusOf(tags, statusTags(settings)) });
  const defs = ctx.columnDefs();
  const all = RV.available(rctx, defs).filter((c) => c.id !== "title");
  const cells = ctx.cells(all.filter((c) => c.ai || c.own).map((c) => c.id));
  const hidden = new Set(hiddenColumns(ctx.companion()));
  const reviewsRunning = (await runnerTasks(ctx)).some((t) => t.kind === "review" && t.status === "running");
  return {
    running: reviewsRunning,
    columns: all.map((c) => {
      const v = RV.value(c, row, rctx, cells);
      const rec = c.ai ? RV.cellOf(cells, c.id, row) : null;
      const state = c.ai ? RV.cellState(c, rec, row) : "";
      return { id: c.id, label: text(c.label, 120), group: c.group === "AI columns" ? "AI columns" : c.group, value: text(cellText(c, v), 20000),
        ai: !!c.ai, kind: c.ai ? c.kindName || c.kind : "", state, stateName: state ? RV.STATE_NAMES[state] || state : "", problem: c.problem || "",
        error: rec && rec.error ? text(rec.error, 300) : "", editable: !!(c.own && c.type === "text") || !!(c.ai && c.edit === "text"),
        choices: c.own && c.type === "choice" ? c.options || [] : null, runnable: !!c.ai && !c.problem, hidden: hidden.has(c.id) };
    }),
  };
}

export async function setHiddenColumns(ctx, { body }) {
  const list = (Array.isArray(body.hidden) ? body.hidden : []).map((x) => text(x, 80)).filter((x) => /^[a-z0-9:_-]{1,80}$/i.test(x)).slice(0, 500);
  ctx.saveCompanion({ hiddenColumns: list });
  return { hiddenColumns: list };
}

export async function setCell(ctx, { body }) {
  const ref = paperRef(body.id);
  const column = text(body.column, 40);
  const defs = ctx.columnDefs();
  const def = defs[column];
  if (!def) throw new Refused("That column isn't there any more", 404, "gone");
  const col = RV.available({ taxonomies: [] }, { [column]: def }).find((c) => c.id === column);
  const editable = (col.own && (col.type === "text" || col.type === "choice")) || (col.ai && col.edit === "text");
  if (!editable) throw new Refused("That column's values come from the AI only", 400, "not-editable");
  let value = text(body.value, 20000);
  if (col.own && col.type === "choice" && value && !(col.options || []).includes(value)) throw new Refused("not one of the column's choices", 400, "bad-choice");
  ctx.setCell(column, ref.id, value);
  return { ok: true };
}

export async function runCell(ctx, { body }) {
  const ref = paperRef(body.id);
  const column = text(body.column, 40);
  const settings = ctx.settings();
  const [d, rctx] = await Promise.all([details(ctx, ref), reviewContext(ctx, settings)]);
  ctx.writable();
  const defs = ctx.columnDefs();
  if (!defs[column]) throw new Refused("That column isn't there any more", 404, "gone");
  const tags = tagNames(d.tags);
  const row = rowOf(ctx, ref, d, tags);
  const cells = ctx.cells([column]);
  const col = RV.available(rctx, defs).find((c) => c.id === column);
  if (!col || !col.ai) throw new Refused("Only an AI column runs", 400, "not-ai");
  const seen = RV.cellState(col, RV.cellOf(cells, column, row), row);
  const job = Glue.reviewRunJob({ id: "", name: "Reading companion" }, defs, rctx, [{ column, paper: ref.id, seen: seen === "empty" ? "again" : seen }], cells);
  if (job.error) throw new Refused(job.error, 409, "not-run");
  delete job.skipped;
  if (!ctx.runner.start(["review-run"], JSON.stringify(job))) throw new Refused("The AI features aren't installed on the Mac mini", 503, "runner-missing");
  forget(ctx, "tasks");
  return { started: true };
}

// ---- processes: what runs now (the page polls while it waits for a prompt, a tagging or a column)

export async function processes(ctx) {
  forget(ctx, "tasks");
  const list = await runnerTasks(ctx);
  return { running: list.filter((t) => t.status === "running").map((t) => ({ kind: t.kind, title: text(t.title, 200), key: t.key || "", libraryID: t.libraryID || 0, promptId: t.promptId || "" })) };
}

export const ROUTES = {
  "GET /api/health": health,
  "GET /api/settings": settingsView,
  "GET /api/search": search,
  "GET /api/paper": paper,
  "POST /api/status": setStatus,
  "POST /api/task": setTask,
  "GET /api/tasks": tasks,
  "POST /api/tasks": addTask,
  "POST /api/tasks/toggle": toggleTask,
  "GET /api/notes": notes,
  "GET /api/note": note,
  "POST /api/notes": addNote,
  "GET /api/cite": cite,
  "GET /api/chats": chats,
  "GET /api/chat": chat,
  "POST /api/chat": ask,
  "GET /api/prompts": prompts,
  "POST /api/prompts/run": runPrompt,
  "POST /api/classify": classify,
  "POST /api/tags": changeTags,
  "POST /api/decide": decide,
  "GET /api/columns": columns,
  "POST /api/columns/hidden": setHiddenColumns,
  "POST /api/columns/cell": setCell,
  "POST /api/columns/run": runCell,
  "GET /api/processes": processes,
};
