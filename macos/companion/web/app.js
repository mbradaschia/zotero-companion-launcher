// The reading companion's page (mockup A): a paper picked (search or recent), its card (status and default task, the
// Mac app's pills), and six tabs: chat, notes, prompts, tasks, taxonomies and tags, columns. Plain DOM, no build: the
// state below, `render()` drawing it, one click and one input handler reading `data-act`. Everything comes from the
// app on the Mac where Zotero runs (/api/…); nothing of the library is kept here but the paper you had open and the tab.

// ---------------------------------------------------------------- icons

// A pill's kind and the review table's concepts: ReviewGrid's ICONS (the Mac app's icon map), path for path, so a kind
// looks the same here (tests/icons.test.mjs keeps them in step). Never told apart by colour alone.
const KIND = {
  status: "M5 21V4 M5 4h12l-2.5 4.5L17 13H5",
  task: "M4 4h16v16H4z M8 12l3 3 5-6",
  rank: "M12 3l2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.8z",
  tax: "M3 3h8l10 10-8 8L3 11z M7.5 7.5h.01",
  priority: "M12 4v10 M12 19v.5",
  own: "M4 20l1-4L16 5l3 3L8 19z",
  ai: "M10 4l1.8 5.2L17 11l-5.2 1.8L10 18l-1.8-5.2L3 11l5.2-1.8z M18.5 3v4 M16.5 5h4",
  note: "M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h7",
  columns: "M3 4h18v16H3z M9 4v16 M15 4v16",
  run: "M7 4.5l12 7.5-12 7.5z",
};

// The page's own (no kind of the app's): search, chat, the list of tasks, and the controls.
const I = {
  search: '<path d="M20 20l-4-4"/><circle cx="11" cy="11" r="7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  tasks: '<path d="M4 6l1.5 1.5L8 5"/><path d="M11 6h9"/><path d="M4 12l1.5 1.5L8 11"/><path d="M11 12h9"/><path d="M4 18l1.5 1.5L8 17"/><path d="M11 18h9"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  sliders: '<path d="M4 6h10"/><path d="M18 6h2"/><circle cx="16" cy="6" r="2"/><path d="M4 12h4"/><path d="M12 12h8"/><circle cx="10" cy="12" r="2"/><path d="M4 18h12"/><circle cx="18" cy="18" r="2"/>',
  send: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
  spin: '<path d="M12 3a9 9 0 1 0 9 9"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5"/><path d="M12 18v.5"/>',
  doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v6H4V6h6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  due: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16"/><path d="M9 3v4M15 3v4"/>',
};

const icon = (name, size = 14, extra = "") =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${KIND[name] ? `<path d="${KIND[name]}"/>` : I[name]}</svg>`;

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// The Mac serving this, by its name (Settings › General's machine name): “mini”, else "the Mac".
const mac = () => (S.health && S.health.machine ? `“${S.health.machine}”` : "the Mac");
const aiMissing = () => !!(S.health && S.health.runner && !S.health.runner.ok);
const needsAI = (what) => `${what} needs the AI features: Settings › Setup installs them`;

// ---------------------------------------------------------------- the server

class NoKey extends Error {}

async function call(path, body) {
  const opts = body === undefined ? { credentials: "same-origin" }
    : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Companion": "1" }, body: JSON.stringify(body) };
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new Error(`${mac() === "the Mac" ? "The Mac" : mac()} didn't answer: is it awake, with the Zotero Launcher open?`);
  }
  if (res.status === 401) throw new NoKey();
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error && data.error.message) || `It didn't work (${res.status})`);
  return data;
}

const get = (path, q = {}) => call(path + "?" + new URLSearchParams(q).toString());

// ---------------------------------------------------------------- state

const keep = {
  get(k, d) { try { const v = localStorage.getItem("zc." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("zc." + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const S = {
  login: false,
  health: null,
  settings: null,
  showProblems: false,
  query: "",
  results: null, // null: not searched; { recent, rows }
  picking: false, // the list shown over the paper
  id: keep.get("paper", ""),
  paper: null,
  paperError: "",
  cardOpen: keep.get("cardOpen", true),
  tab: keep.get("tab", "chat"),
  busy: {}, // what's being sent: "status", "task", …
  chat: { list: [], session: "", turns: [], streaming: false, status: "", error: "" },
  notes: null, openNote: "", noteHtml: {}, composing: false,
  prompts: null, classifying: false, runningPrompts: {},
  tasks: null,
  addingTag: false,
  cols: null, chooser: false, editing: "", running: false, runningCols: {},
};

// What you typed survives a redraw: the drafts, by field.
const drafts = {};

let toastTimer = 0;
function toast(text) {
  const t = document.getElementById("toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}

function failed(e) {
  if (e instanceof NoKey) { S.login = true; render(); return; }
  toast(e.message);
}

// ---------------------------------------------------------------- loading

async function start() {
  try {
    const [health, settings] = await Promise.all([get("/api/health"), get("/api/settings")]);
    Object.assign(S, { health, settings, login: false });
  } catch (e) {
    if (e instanceof NoKey) { S.login = true; return render(); }
    S.health = { zotero: { ok: false, message: e.message }, runner: { ok: true }, syncFolder: { ok: true }, machine: "" };
  }
  const fromHash = /^#paper=(\d+:[A-Z0-9]{8})$/.exec(location.hash);
  if (fromHash) S.id = fromHash[1];
  if (S.id) openPaper(S.id); else { S.picking = true; search(""); }
  render();
}

let searchSeq = 0;
async function search(q) {
  const seq = ++searchSeq;
  try {
    const r = await get("/api/search", { q, limit: 30 });
    if (seq !== searchSeq) return;
    S.results = r;
  } catch (e) { if (seq === searchSeq) { S.results = { recent: !q, rows: [], error: e.message }; failed(e); } }
  render();
}

async function openPaper(id) {
  S.id = id;
  S.picking = false;
  S.paperError = "";
  keep.set("paper", id);
  history.replaceState(null, "", "#paper=" + id);
  Object.assign(S, { paper: null, notes: null, prompts: null, tasks: null, cols: null, openNote: "", noteHtml: {}, composing: false, editing: "", addingTag: false,
    runningPrompts: {}, runningCols: {}, classifying: false });
  S.chat = { list: [], session: "", turns: [], streaming: false, status: "", error: "" };
  render();
  await loadPaper();
  loadTab();
}

async function loadPaper() {
  const id = S.id;
  try {
    const p = await get("/api/paper", { id });
    if (id === S.id) { S.paper = p; S.paperError = ""; }
  } catch (e) {
    if (e instanceof NoKey) return failed(e);
    if (id === S.id && !S.paper) S.paperError = e.message;
    else toast(e.message);
  }
  render();
}

async function loadTab() {
  if (!S.id) return;
  const id = S.id, tab = S.tab;
  try {
    if (tab === "chat") {
      const r = await get("/api/chats", { id });
      if (id !== S.id) return;
      S.chat.list = r.chats;
      if (!S.chat.session && r.chats.length && !S.chat.streaming) await openChat(r.chats[0].id);
    } else if (tab === "notes") {
      S.notes = (await get("/api/notes", { id })).notes;
    } else if (tab === "prompts" || tab === "tags") {
      if (tab === "prompts" || S.prompts == null) await loadPrompts();
    } else if (tab === "tasks") {
      S.tasks = (await get("/api/tasks", { id })).tasks;
    } else if (tab === "cols") {
      const r = await get("/api/columns", { id });
      S.cols = r.columns;
      S.running = r.running;
      if (r.running) poll("cols");
    }
  } catch (e) { failed(e); }
  render();
}

async function loadPrompts() {
  const r = await get("/api/prompts", { id: S.id });
  S.prompts = r.prompts;
  S.classifying = r.classifying;
  r.prompts.filter((p) => p.running).forEach((p) => { S.runningPrompts[p.id] = p.title; });
  if (r.prompts.some((p) => p.running) || r.classifying) poll("prompts");
}

// While a prompt, a tagging or a column runs: asked again every few seconds; when it ends, what it made shows and a
// sentence says so.
const polls = {};
function poll(what) {
  if (polls[what]) return;
  polls[what] = setTimeout(async () => {
    polls[what] = 0;
    if (!S.id) return;
    try {
      if (what === "prompts") {
        const wasTagging = S.classifying;
        const r = await get("/api/prompts", { id: S.id });
        S.prompts = r.prompts;
        S.classifying = r.classifying;
        for (const [pid, title] of Object.entries(S.runningPrompts)) {
          const p = r.prompts.find((x) => x.id === pid);
          if (p && p.running) continue;
          delete S.runningPrompts[pid];
          toast(`“${title}” is done: ${p && p.output !== "note" ? "a " + p.outputLabel.toLowerCase() + " in the paper's artifacts (on the Mac)" : "a note on this paper"}`);
          if (!p || p.output === "note") { S.notes = null; loadPaper(); }
        }
        if (wasTagging && !r.classifying) { toast("Tagging by taxonomies is done"); await loadPaper(); }
        if (r.prompts.some((p) => p.running) || r.classifying || Object.keys(S.runningPrompts).length) poll("prompts");
      } else if (what === "cols") {
        const r = await get("/api/columns", { id: S.id });
        S.cols = r.columns;
        S.running = r.running;
        if (r.running) poll("cols");
        else {
          for (const cid of Object.keys(S.runningCols)) {
            const c = r.columns.find((x) => x.id === cid);
            delete S.runningCols[cid];
            if (c) toast(c.state === "failed" ? `Couldn't fill “${c.label}”: ${c.error || "it failed"}` : `“${c.label}” is done`);
          }
        }
      }
    } catch (e) { failed(e); }
    render();
  }, 4000);
}

// ---------------------------------------------------------------- changes

async function busy(name, fn) {
  if (S.busy[name]) return;
  S.busy[name] = true;
  render();
  try { await fn(); } catch (e) { failed(e); }
  S.busy[name] = false;
  render();
}

const setStatus = (status) => busy("status", async () => {
  const before = S.paper.status;
  S.paper.status = status;
  render();
  try { await call("/api/status", { id: S.id, status }); } catch (e) { S.paper.status = before; throw e; }
});

const setTask = (status) => busy("task", async () => {
  const r = await call("/api/task", { id: S.id, status });
  S.paper.task = r.task;
  S.tasks = null;
  if (S.tab === "tasks") loadTab();
  loadPaper();
});

async function openChat(session) {
  S.chat.session = session;
  S.chat.error = "";
  if (!session) { S.chat.turns = []; return render(); }
  try {
    const r = await get("/api/chat", { id: S.id, session });
    if (S.chat.session === session) S.chat.turns = r.turns;
  } catch (e) { failed(e); }
  render();
  scrollChat();
}

function scrollChat() {
  requestAnimationFrame(() => { const m = document.querySelector(".msgs"); if (m) m.scrollTop = m.scrollHeight; });
}

// A question: the answer streamed (server-sent events from the runner's lines), the chat saved on the Mac.
async function ask() {
  const question = (drafts.ask || "").trim();
  if (!question || S.chat.streaming || aiMissing()) return;
  drafts.ask = "";
  const c = S.chat;
  c.turns = c.turns.concat([{ role: "user", text: question }, { role: "assistant", text: "", live: true }]);
  c.streaming = true;
  c.status = "";
  c.error = "";
  render();
  scrollChat();
  const live = c.turns[c.turns.length - 1];
  try {
    const res = await fetch("/api/chat", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Companion": "1" },
      body: JSON.stringify({ id: S.id, question, session: c.session || undefined }) });
    if (res.status === 401) throw new NoKey();
    if (!res.ok || !res.body) { const d = await res.json().catch(() => null); throw new Error((d && d.error && d.error.message) || "The chat didn't start"); }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    let drawn = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const line = block.split("\n").find((l) => l.startsWith("data: "));
        if (!line || block.startsWith("event: end")) continue;
        let ev;
        try { ev = JSON.parse(line.slice(6)); } catch { continue; }
        if (ev.type === "session") { c.session = ev.id; }
        else if (ev.type === "delta") { live.text += ev.text || ""; c.status = ""; }
        else if (ev.type === "status") { c.status = ev.text || ""; }
        else if (ev.type === "note") { c.turns.splice(c.turns.length - 1, 0, { role: "note", text: ev.text }); }
        else if (ev.type === "done") { live.text = ev.text || live.text; }
        else if (ev.type === "error") { c.error = ev.message || "The answer stopped"; }
      }
      if (Date.now() - drawn > 120) { drawn = Date.now(); renderChat(); }
    }
  } catch (e) {
    if (e instanceof NoKey) return failed(e);
    c.error = e.message;
  }
  live.live = false;
  if (!live.text) c.turns = c.turns.filter((t) => t !== live);
  c.streaming = false;
  c.status = "";
  try { c.list = (await get("/api/chats", { id: S.id })).chats; } catch { /* the list stays */ }
  render();
  scrollChat();
}

async function saveNote() {
  const markdown = (drafts.note || "").trim();
  if (!markdown) return toast("Not saved: the note is empty");
  await busy("note", async () => {
    await call("/api/notes", { id: S.id, title: drafts.noteTitle || "", markdown });
    drafts.note = "";
    drafts.noteTitle = "";
    S.composing = false;
    toast("Saved: a note on this paper, in Zotero");
    S.notes = (await get("/api/notes", { id: S.id })).notes;
    loadPaper();
  });
}

async function toggleNote(id) {
  S.openNote = S.openNote === id ? "" : id;
  render();
  if (S.openNote && S.noteHtml[id] == null) {
    try { S.noteHtml[id] = (await get("/api/note", { id })).html; } catch (e) { failed(e); }
    render();
  }
}

async function copyNote(id) {
  try {
    const [n, c] = await Promise.all([S.noteHtml[id] != null ? { html: S.noteHtml[id] } : get("/api/note", { id }), get("/api/cite", { id: S.id })]);
    const div = document.createElement("div");
    div.innerHTML = clean(n.html);
    await navigator.clipboard.writeText(div.innerText.trim() + "\n\n" + c.text);
    toast("Copied: the note and its bibliography entry");
  } catch (e) { failed(e); }
}

const runPrompt = (prompt) => busy("prompt:" + prompt, async () => {
  await call("/api/prompts/run", { id: S.id, prompt });
  const p = (S.prompts || []).find((x) => x.id === prompt);
  if (p) p.running = true;
  S.runningPrompts[prompt] = p ? p.title : prompt;
  toast(`Started: “${p ? p.title : prompt}” on this paper (in Processes on ${mac()})`);
  poll("prompts");
});

async function addTask() {
  const description = (drafts.task || "").trim();
  if (!description) return;
  await busy("addTask", async () => {
    await call("/api/tasks", { id: S.id, description });
    drafts.task = "";
    S.tasks = (await get("/api/tasks", { id: S.id })).tasks;
    loadPaper();
  });
}

const toggleTask = (todo) => busy("todo:" + todo, async () => {
  await call("/api/tasks/toggle", { todo });
  S.tasks = (await get("/api/tasks", { id: S.id })).tasks;
  loadPaper();
});

const decide = (taxonomy, label, accept) => busy("decide", async () => {
  await call("/api/decide", { id: S.id, taxonomy, label, accept });
  toast(accept ? `Tagged “${label}”` : "Dismissed");
  await loadPaper();
});

const classify = () => busy("classify", async () => {
  await call("/api/classify", { id: S.id });
  S.classifying = true;
  toast(`Started: tagging by taxonomies (in Processes on ${mac()})`);
  poll("prompts");
});

async function addTag() {
  const tag = (drafts.tag || "").trim();
  if (!tag) return;
  await busy("tag", async () => {
    await call("/api/tags", { id: S.id, add: [tag] });
    drafts.tag = "";
    S.addingTag = false;
    await loadPaper();
  });
}

const removeTag = (tag) => busy("tag", async () => {
  await call("/api/tags", { id: S.id, remove: [tag] });
  await loadPaper();
});

async function toggleColumn(id, on) {
  const before = (S.cols || []).filter((c) => c.hidden).map((c) => c.id);
  const hidden = new Set(before);
  if (on) hidden.delete(id); else hidden.add(id);
  (S.cols || []).forEach((c) => { if (c.id === id) c.hidden = !on; });
  render();
  try {
    const r = await call("/api/columns/hidden", { hidden: [...hidden] });
    if (S.settings) S.settings.hiddenColumns = r.hiddenColumns;
  } catch (e) {
    (S.cols || []).forEach((c) => { if (c.id === id) c.hidden = on; });
    failed(e);
  }
}

const saveCell = (column) => busy("cell", async () => {
  await call("/api/columns/cell", { id: S.id, column, value: drafts["cell:" + column] ?? "" });
  S.editing = "";
  S.cols = (await get("/api/columns", { id: S.id })).columns;
});

// An AI cell run: the button stays at Running until the run ends (a second tap would pay twice for one cell).
const runCell = (column) => busy("run:" + column, async () => {
  await call("/api/columns/run", { id: S.id, column });
  S.runningCols[column] = true;
  S.running = true;
  const c = (S.cols || []).find((x) => x.id === column);
  toast(`Started: “${c ? c.label : "the column"}” on this paper (in Processes on ${mac()})`);
  poll("cols");
});

async function login() {
  const key = (drafts.key || "").trim();
  try {
    await call("/api/login", { key });
    drafts.key = "";
    S.login = false;
    start();
  } catch (e) { toast(e instanceof NoKey ? "That isn't this companion's key" : e.message); }
}

// ---------------------------------------------------------------- HTML from notes and answers, kept to plain tags

// Built again from the parsed tree, element by element: only these tags, no attributes but a link's web address, and
// nothing of what's dropped (a style, a form, a meta refresh, an SVG) survives inside what's kept. The bridge sends a
// note's HTML sanitized already: this is the second lock, and the first for a chat answer.
const ALLOWED = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "S", "SUB", "SUP", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE",
  "PRE", "CODE", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "A", "SPAN", "DIV", "HR"]);
const DROPPED = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "META", "LINK", "BASE", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT",
  "TEMPLATE", "NOSCRIPT", "SVG", "MATH", "IMG", "VIDEO", "AUDIO", "TITLE", "HEAD"]);

function clean(html) {
  const doc = new DOMParser().parseFromString("<!doctype html><body>" + String(html || "") + "</body>", "text/html");
  const out = document.createElement("div");
  const copy = (from, to) => {
    for (const n of from.childNodes) {
      if (n.nodeType === 3) { to.appendChild(document.createTextNode(n.nodeValue)); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toUpperCase();
      if (DROPPED.has(tag)) continue;
      if (!ALLOWED.has(tag)) { copy(n, to); continue; } // (its text and allowed tags, without it)
      const el = document.createElement(tag);
      if (tag === "A") {
        const href = (n.getAttribute("href") || "").trim();
        if (/^(https?:|mailto:|zotero:)/i.test(href)) { el.setAttribute("href", href); el.setAttribute("target", "_blank"); el.setAttribute("rel", "noopener noreferrer"); }
      }
      copy(n, el);
      to.appendChild(el);
    }
  };
  copy(doc.body, out);
  return out.innerHTML;
}

// An answer's Markdown, as the Mac app's chat draws it: tags in it shown as text, images not loaded (safeMarkdown).
function markdown(text) {
  const m = window.marked;
  const safe = String(text || "").replace(/!\[/g, "!​[").replace(/<(?=[A-Za-z!?/])/g, "<​");
  if (!m) return esc(safe).replace(/\n/g, "<br>");
  return clean(m.parse(safe, { gfm: true, breaks: false }));
}

// ---------------------------------------------------------------- drawing

function pill(kind, text, iconName, extra = "") {
  return `<span class="pill ${kind}"${extra}>${iconName ? icon(iconName, 12) : ""}${esc(text)}</span>`;
}

// A ranking: ★ and the rank colour for a top one (FT50, UTD24, ABS 4*/4, ABDC A*/A), the others plain, as the Mac app.
const rankPill = (r) => (r.top ? pill("rank", r.label, "rank") : pill("plain", r.label));

function dateText(s) {
  if (!s) return "";
  const d = new Date(String(s).replace(" ", "T"));
  if (isNaN(d)) return String(s).slice(0, 10);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

function problems() {
  const h = S.health;
  return h ? [h.zotero, h.syncFolder, h.runner].filter((x) => x && !x.ok) : [];
}

function healthPill() {
  if (!S.health) return "";
  const list = problems();
  const name = S.health.machine || "Mac";
  if (!list.length) return `<span class="health ok">${icon("check", 12)}${esc(name)}, live</span>`;
  return `<button class="health bad" data-act="health" aria-expanded="${S.showProblems}">${icon("warn", 12)}${esc(name)}: ${list.length === 1 ? "a problem" : list.length + " problems"}</button>`;
}

function header() {
  const list = problems();
  return `<header class="top">
    <div class="top-row"><h1>Companion</h1>${healthPill()}</div>
    ${S.showProblems && list.length ? list.map((p) => `<p class="problem">${icon("warn", 12)} ${esc(p.message)}</p>`).join("") : ""}
    <label class="search">${icon("search", 18)}<span class="sr">Search your library</span>
      <input type="search" data-keep="query" placeholder="Search your library" value="${esc(S.query)}" autocomplete="off" autocorrect="off" enterkeyhint="search">
      ${S.picking && S.paper ? `<button data-act="unpick" aria-label="Back to the paper" title="Back to the paper">${icon("close", 16)}</button>` : ""}
    </label>
  </header>`;
}

function results() {
  const r = S.results;
  if (!r) return `<div class="empty">Searching…</div>`;
  if (r.error) return `<div class="results"><p class="problem">Couldn't search: ${esc(r.error)}</p></div>`;
  if (!r.rows.length) return `<div class="empty">${r.recent ? "No recent papers" : "Nothing matches"}</div>`;
  return `<div class="results"><h2>${r.recent ? "Recent papers" : "Results"}</h2>${r.rows.map((row) => `
    <button class="result" data-act="pick" data-id="${esc(row.id)}">
      <span class="t">${esc(row.title)}</span>
      <span class="m">${esc([row.creator, row.year].filter(Boolean).join(", "))}${row.publication ? " · " + esc(row.publication) : ""}</span>
      ${row.status || row.task || row.ranks.length ? `<span class="pills">${row.status ? pill("status", row.status, "status") : ""}${row.task ? pill("task", row.task, "task") : ""}${row.ranks.map(rankPill).join("")}</span>` : ""}
    </button>`).join("")}</div>`;
}

// The card's footer pills, the Mac app's (Views.paperFooter): the text, and the taxonomies' state.
function footerPills(p) {
  const out = [p.extracted ? pill("plain", "✓ text extracted") : pill("plain", p.hasPdf ? "text not extracted" : "no PDF")];
  if (p.taxonomies.length) {
    const labels = p.taxonomies.reduce((n, t) => n + t.labels.length, 0);
    const st = p.taxStatus;
    out.push(S.classifying ? pill("tax", "taxonomies: tagging…", "tax")
      : st && !st.classified ? pill("prio", "⚠ taxonomies: not tagged" + (labels ? ` (${labels} labels by hand)` : ""), "priority")
      : st && st.stale.length ? pill("prio", `⚠ taxonomies: update needed (${st.stale.length === p.taxonomies.length ? "all" : st.stale.join(", ")})`, "priority")
      : pill("tax", `✓ taxonomies: ${labels} label${labels === 1 ? "" : "s"}`, "tax"));
  }
  return out.join("");
}

// The taxonomy strip: a caption, each taxonomy's name before its label pills (the Mac app's, only those with labels).
function taxStrip(p) {
  const withLabels = p.taxonomies.filter((t) => t.labels.length);
  if (!withLabels.length) return "";
  return `<div class="strip"><span class="cap">Taxonomies</span>${withLabels.map((t) => `<span class="tx"><span class="nm">${esc(t.name)}</span>${t.labels.map((l) => pill("tax", l, "tax")).join("")}</span>`).join("")}</div>`;
}

function card() {
  const p = S.paper;
  if (!p) return `<article class="card">${S.paperError ? `<p class="problem">Couldn't read the paper: ${esc(S.paperError)}</p><button class="btn" data-act="retry">Try again</button>` : `<span class="muted">Loading the paper…</span>`}</article>`;
  const statuses = (S.settings && S.settings.paperStatuses) || [];
  const taskStatuses = (S.settings && S.settings.taskStatuses) || [];
  const open = S.cardOpen;
  const ro = !p.editable;
  const off = (b) => (b || ro ? " disabled" : "");
  return `<article class="card" aria-label="The paper">
    <h2>${esc(p.title)}</h2>
    <div class="by"><span>${esc([p.authors, p.year].filter(Boolean).join(", "))}${p.publication ? " · " + esc(p.publication) : ""}</span>
      <button class="round" data-act="card" aria-expanded="${open}" aria-label="${open ? "Show less" : "Show more"}">${icon("chevron", 16)}</button></div>
    ${!open ? `<div class="pills"><button class="pill-btn" data-act="card" aria-label="Status: ${esc(p.status || "none")}, change it">${pill("status", p.status || "No status", "status")}</button>
      <button class="pill-btn" data-act="card" aria-label="Task: ${esc(p.task ? p.task.name : "none")}, change it">${pill("task", p.task ? p.task.name : "No task", "task")}</button></div>` : `
    ${p.ranks.length ? `<div class="pills">${p.ranks.map(rankPill).join("")}</div>` : ""}
    ${taxStrip(p)}
    <div class="pills">${footerPills(p)}</div>
    ${ro ? `<p class="hint">${icon("warn", 12)} “${esc(p.library || "This library")}” is read-only: nothing here can change it</p>` : ""}
    <div class="choice status" role="group" aria-label="Status"><span class="lbl">${icon("status")}Status</span>${statuses.length ? `<div class="grid">
      ${[""].concat(statuses).map((s) => `<button class="opt" data-act="status" data-v="${esc(s)}" aria-pressed="${(p.status || "").toLowerCase() === s.toLowerCase()}"${off(S.busy.status)}>${esc(s || "None")}</button>`).join("")}
    </div>` : `<span class="hint" style="padding-top:5px">No paper statuses: add some in Settings › Paper status</span>`}</div>
    <div class="choice task" role="group" aria-label="Task"><span class="lbl">${icon("task")}Task</span><div class="grid">
      ${[{ id: "", name: "None" }].concat(taskStatuses).map((s) => `<button class="opt" data-act="task" data-v="${esc(s.id)}" aria-pressed="${(p.task ? p.task.statusId : "") === s.id}"${off(S.busy.task)}>${esc(s.name)}</button>`).join("")}
    </div></div>`}
  </article>`;
}

function tabs() {
  const p = S.paper;
  const list = [
    ["chat", "chat", "Chat", 0],
    ["notes", "note", "Notes", p ? p.noteCount : 0],
    ["prompts", "ai", "Prompts", 0],
    ["tasks", "tasks", "Tasks", p ? p.openTasks : 0],
    ["tags", "tax", "Taxonomies and tags", 0],
    ["cols", "columns", "Columns", 0],
  ];
  return `<nav class="tabs" role="tablist" aria-label="The paper's sections">${list.map(([id, ic, name, n]) =>
    `<button class="tab" role="tab" data-act="tab" data-v="${id}" aria-selected="${S.tab === id}" aria-label="${esc(name)}${n ? ", " + n : ""}" title="${esc(name)}">${icon(ic, 20, ' stroke-width="1.8"')}${n ? `<span class="badge" aria-hidden="true">${n}</span>` : ""}</button>`).join("")}</nav>`;
}

const missingAI = (what) => `<p class="problem">${icon("warn", 12)} ${esc(needsAI(what))} (on ${esc(mac())})</p>`;

function chatPane() {
  const c = S.chat;
  const msgs = c.turns.map((t) => t.role === "user" ? `<div class="msg user">${esc(t.text)}</div>`
    : t.role === "note" ? `<div class="msg note">${esc(t.text)}</div>`
    : t.live && !t.text ? `<div class="msg assistant wait">${icon("spin", 16, ' class="spin"')}${esc(c.status || "Writing the answer…")}</div>`
    : `<div class="msg assistant">${markdown(t.text)}</div>`).join("");
  const options = [`<option value="">New chat</option>`].concat(c.list.map((x) => `<option value="${esc(x.id)}"${x.id === c.session ? " selected" : ""}>${esc(x.title || "Chat")} · ${esc(dateText(x.updated))}</option>`));
  if (c.session && !c.list.some((x) => x.id === c.session)) options.push(`<option value="${esc(c.session)}" selected>This chat</option>`);
  const noAI = aiMissing();
  return `<div class="chat">
    <div class="chat-bar"><label class="sr" for="chat-pick">Chat</label><select id="chat-pick" data-act="chat-pick"${c.streaming ? " disabled" : ""}>${options.join("")}</select></div>
    <div class="msgs" aria-live="polite">${noAI ? missingAI("Chat") : ""}${msgs || (noAI ? "" : `<div class="empty">Ask about this paper. The answer reads its text and your highlights; the chat is kept with your chats on ${esc(mac())}.</div>`)}
      ${c.error ? `<p class="problem">${icon("warn", 12)} ${esc(c.error)}</p>` : ""}</div>
    <div class="composer"><div class="ask">
      <label class="sr" for="ask">Ask about this paper</label>
      <textarea id="ask" data-keep="ask" rows="1" placeholder="Ask about this paper" enterkeyhint="send"${noAI ? " disabled" : ""}>${esc(drafts.ask || "")}</textarea>
      <button class="send" data-act="ask" aria-label="Send"${c.streaming || noAI ? " disabled" : ""}>${icon("send", 20, ' stroke-width="2.2"')}</button>
    </div></div>
  </div>`;
}

function notesPane() {
  if (!S.notes) return `<div class="pane"><span class="hint">Loading the notes…</span></div>`;
  const n = S.notes.length;
  const ro = S.paper && !S.paper.editable;
  const inUser = S.id.startsWith("1:"); // (zotero://select/library/… is your own library's; a group's needs its group id)
  const compose = S.composing ? `<div class="box">
      <label class="sr" for="note-title">Title</label><input id="note-title" class="field" data-keep="noteTitle" placeholder="Title (optional)" value="${esc(drafts.noteTitle || "")}">
      <label class="sr" for="note-text">The note</label><textarea id="note-text" class="field" data-keep="note" rows="7" placeholder="Your note. Markdown works: **bold**, lists, > quotes">${esc(drafts.note || "")}</textarea>
      <div class="btns"><button class="btn primary" data-act="note-save"${S.busy.note ? " disabled" : ""}>Save to Zotero</button><button class="btn quiet" data-act="note-cancel">Cancel</button></div>
    </div>` : "";
  return `<div class="pane">
    <div class="row-between"><span class="hint">${n ? `${n} note${n === 1 ? "" : "s"} on this paper, in your order` : "No notes on this paper yet"}</span>
      ${S.composing || ro ? "" : `<button class="btn primary" data-act="note-new">${icon("plus")}New note</button>`}</div>
    ${compose}
    ${S.notes.map((x) => `<div class="box">
      <button class="note-head" data-act="note-open" data-id="${esc(x.id)}" aria-expanded="${S.openNote === x.id}">
        <span class="row-between" style="width:100%"><h3>${esc(x.title || "Untitled note")}</h3><span class="meta">${esc(dateText(x.dateModified))}</span></span>
        ${S.openNote === x.id ? "" : x.excerpt ? `<span class="ex">${esc(x.excerpt)}</span>` : ""}
      </button>
      ${S.openNote === x.id ? `<div class="note-body">${S.noteHtml[x.id] != null ? clean(S.noteHtml[x.id]) : `<span class="muted">Loading…</span>`}</div>
        <div class="btns">${inUser ? `<a class="btn" href="zotero://select/library/items/${esc(x.id.split(":")[1])}">${icon("external")}Open in Zotero</a>` : ""}
        <button class="btn" data-act="note-copy" data-id="${esc(x.id)}">${icon("copy")}Copy with its bibliography entry</button></div>` : ""}
    </div>`).join("")}
  </div>`;
}

// Tag by taxonomies, as the Mac app words it (Views.classifyRow): by the paper's state.
function classifyButton(p) {
  if (!p || !p.taxonomies.length) return "";
  const st = p.taxStatus;
  const label = S.classifying ? "Tagging by taxonomies…" : st && st.classified ? (st.stale.length ? "Tag again by taxonomies: out of date" : "Tag again by taxonomies") : "Tag by taxonomies";
  return `<button class="btn wide" data-act="classify"${S.classifying || S.busy.classify || aiMissing() || !p.editable ? " disabled" : ""}>${S.classifying ? icon("spin", 14, ' class="spin"') : icon("tax")}${esc(label)}</button>`;
}

function promptsPane() {
  if (!S.prompts) return `<div class="pane"><span class="hint">Loading your prompts…</span></div>`;
  const noAI = aiMissing();
  const ro = S.paper && !S.paper.editable;
  return `<div class="pane">${noAI ? missingAI("Running a prompt") : ""}
    <span class="hint">Your saved prompts, run on this paper (in Processes on ${esc(mac())}).</span>
    ${S.prompts.length ? "" : `<div class="empty">No prompts yet: make one in the launcher's Prompts</div>`}
    ${S.prompts.map((p) => {
      const busyNow = p.running || S.busy["prompt:" + p.id];
      const detail = p.running ? "Running…" : p.output !== "note" ? p.outputLabel : p.lastRun ? "Ran " + dateText(p.lastRun) + " · Zotero note" : "Not run on this paper · Zotero note";
      return `<div class="box"><div class="row-between">
        <div style="display:flex;flex-direction:column;gap:3px;min-width:0"><h3>${esc(p.title)}</h3>
          <span class="${p.lastRun && !p.running ? "okline" : "hint"}">${p.lastRun && !p.running ? icon("check", 12) + " " : ""}${esc(detail)}</span></div>
        <button class="btn" data-act="prompt-run" data-id="${esc(p.id)}"${busyNow || noAI || ro ? " disabled" : ""}>${busyNow ? icon("spin", 14, ' class="spin"') + "Running" : icon("run", 12) + (p.lastRun ? "Run again" : "Run")}</button>
      </div></div>`;
    }).join("")}
    ${classifyButton(S.paper)}
  </div>`;
}

function tasksPane() {
  const list = S.tasks;
  return `<div class="pane">
    <div style="display:flex;gap:8px;align-items:center">
      <label class="sr" for="new-task">New task for this paper</label>
      <input id="new-task" class="field" data-keep="task" placeholder="New task for this paper" value="${esc(drafts.task || "")}" enterkeyhint="done">
      <button class="btn primary" data-act="task-add" style="height:44px;border-radius:10px"${S.busy.addTask ? " disabled" : ""}>Add</button>
    </div>
    ${!list ? `<span class="hint">Loading the tasks…</span>` : !list.length ? `<div class="empty">No tasks for this paper</div>` : `<span class="hint">For this paper</span>` + list.map((t) => `
      <label class="box todo${t.done ? " done" : ""}">
        <input type="checkbox" data-act="todo" data-id="${esc(t.id)}"${t.done ? " checked" : ""}${S.busy["todo:" + t.id] ? " disabled" : ""}>
        <span style="display:flex;flex-direction:column;gap:6px;flex-grow:1"><span class="d">${esc(t.description)}</span>
          ${t.done ? "" : `<span class="pills">${pill("task", t.statusName, "task")}${t.priority ? pill("prio", t.priorityName, "priority") : ""}${t.due ? pill("plain", "Due " + dateText(t.due), "due") : ""}</span>`}
        </span>
      </label>`).join("")}
  </div>`;
}

function tagsPane() {
  const p = S.paper;
  if (!p) return "";
  const ro = !p.editable;
  const rows = p.taxonomies.map((t) => {
    const sugg = p.suggestions.filter((s) => s.taxonomy === t.id);
    return `<div class="tax-row">
      <div class="row-between"><span class="name">${esc(t.name)} <span class="kind">${t.kind === "one" ? "unique (one label per paper)" : "several labels per paper"}</span></span>
        ${t.labels.length ? `<span class="pills">${t.labels.map((l) => pill("tax", l, "tax")).join("")}</span>` : `<span class="hint">No label</span>`}</div>
      ${sugg.map((s) => `<div class="row-between"><span style="font-size:13px">Suggested: ${esc(s.label)} <span class="muted">${Math.round(s.p * 100)}%</span></span>
        <span class="btns"><button class="btn" data-act="decide" data-tax="${esc(t.id)}" data-label="${esc(s.label)}" data-accept="1"${S.busy.decide || ro ? " disabled" : ""}>${icon("check", 12)}Tag it</button>
        <button class="btn" data-act="decide" data-tax="${esc(t.id)}" data-label="${esc(s.label)}" data-accept=""${S.busy.decide || ro ? " disabled" : ""}>${icon("close", 12)}Dismiss it</button></span></div>`).join("")}
    </div>`;
  }).join("");
  return `<div class="pane">
    <span class="hint">Taxonomies</span>
    ${p.taxonomyError ? `<p class="problem">${icon("warn", 12)} ${esc(p.taxonomyError)}</p>` : ""}
    ${p.taxonomies.length ? `<div class="box tax-list">${rows}</div>` : p.taxonomyError ? "" : `<div class="empty">No taxonomies yet: Settings › Taxonomies</div>`}
    ${classifyButton(p)}
    <span class="hint" style="margin-top:4px">Tags</span>
    <div class="box" style="flex-direction:row;flex-wrap:wrap;gap:6px;align-items:center">
      ${p.tags.map((t) => `<span class="pill plain">${esc(t)}${ro ? "" : `<button data-act="tag-remove" data-tag="${esc(t)}" aria-label="Remove ${esc(t)}">${icon("close", 12)}</button>`}</span>`).join("")}
      ${ro ? (p.tags.length ? "" : `<span class="hint">No tags</span>`) : S.addingTag ? `<span class="add-tag"><label class="sr" for="new-tag">New tag</label><input id="new-tag" data-keep="tag" placeholder="A tag" value="${esc(drafts.tag || "")}" enterkeyhint="done" autocapitalize="off">
        <button class="btn" data-act="tag-add"${S.busy.tag ? " disabled" : ""}>Add</button><button class="btn quiet" data-act="tag-cancel">Cancel</button></span>`
        : `<button class="btn dashed" data-act="tag-new">${icon("plus")}Add tag</button>`}
    </div>
  </div>`;
}

// A column's kind, by its icon (the review table's Columns): status, task, ranking, taxonomy, yours, AI.
function colKind(c) {
  if (c.ai) return "ai";
  if (c.id === "status") return "status";
  if (c.id === "task") return "task";
  if (c.own) return "own";
  if (c.group === "Rankings") return "rank";
  if (c.group === "Taxonomies") return "tax";
  return "";
}

function colsPane() {
  if (!S.cols) return `<div class="pane"><span class="hint">Loading the columns…</span></div>`;
  const shown = S.cols.filter((c) => !c.hidden);
  const head = `<div class="row-between"><span class="hint">${S.chooser ? "Tick the columns to show for every paper" : `${shown.length} of ${S.cols.length} columns, as in your review tables`}</span>
    <button class="btn" data-act="chooser" aria-pressed="${S.chooser}">${icon("columns")}${S.chooser ? "Done" : "Columns"}</button></div>`;
  if (S.chooser) {
    const item = (c) => `<label><input type="checkbox" data-act="col-toggle" data-id="${esc(c.id)}"${c.hidden ? "" : " checked"}>
      <span class="ck">${colKind(c) ? icon(colKind(c), 14) : ""}</span><span class="grow">${esc(c.label)}</span>${c.ai ? `<span class="hint">${esc(c.kind)}</span>` : ""}</label>`;
    const hidden = S.cols.filter((c) => c.hidden);
    return `<div class="pane">${head}
      <div class="group chooser">${shown.map(item).join("")}${hidden.length ? `<div class="gh">Not shown</div>${hidden.map(item).join("")}` : ""}</div></div>`;
  }
  const groups = [];
  const by = {};
  for (const c of shown) {
    if (!by[c.group]) { by[c.group] = []; groups.push(c.group); }
    by[c.group].push(c);
  }
  return `<div class="pane">${head}
    ${groups.map((g) => `<div class="group"><div class="gh">${esc(g)}</div>${by[g].map(colRow).join("")}</div>`).join("") || `<div class="empty">No columns shown: tick some in Columns</div>`}
  </div>`;
}

const MARKS = { yours: "✎", failed: "⚠" };

function colRow(c) {
  const editing = S.editing === c.id;
  const ro = S.paper && !S.paper.editable;
  const runBusy = S.busy["run:" + c.id] || S.runningCols[c.id];
  let value = c.pills ? `<span class="pills">${c.pills.values.map((v) => c.pills.kind === "plain" ? pill("plain", v) : pill(c.pills.kind === "prio" ? "prio" : c.pills.kind, v, c.pills.kind)).join("")}</span>`
    : c.value ? esc(c.value) : "";
  if (c.id === "status" || c.id === "task") value = `<button class="pill-btn" data-act="to-card" aria-label="${esc(c.label)}: change it on the card">${value || `<span class="muted">none</span>`}</button>`;
  if (editing) {
    const draft = drafts["cell:" + c.id] ?? c.value;
    value = c.choices ? `<label class="sr" for="cell-${esc(c.id)}">${esc(c.label)}</label><select id="cell-${esc(c.id)}" data-keep="cell:${esc(c.id)}">
        ${[""].concat(c.choices).map((o) => `<option value="${esc(o)}"${o === draft ? " selected" : ""}>${esc(o || "None")}</option>`).join("")}</select>`
      : `<label class="sr" for="cell-${esc(c.id)}">${esc(c.label)}</label><textarea id="cell-${esc(c.id)}" data-keep="cell:${esc(c.id)}" rows="3">${esc(draft)}</textarea>`;
  }
  const st = c.ai && c.state && c.state !== "ok" && c.state !== "empty" ? c.state : "";
  const mark = st ? `<span class="smark" title="${esc(c.stateName)}">${MARKS[st] || "●"} ${esc(c.stateName)}</span>` : "";
  const note = c.problem || c.error;
  const canRun = c.runnable && !aiMissing() && !ro;
  const actions = !ro && (c.runnable || c.editable || c.choices) ? `<div class="btns">
      ${c.runnable && !editing ? `<button class="btn small" data-act="col-run" data-id="${esc(c.id)}"${runBusy || !canRun ? " disabled" : ""}>${runBusy ? icon("spin", 12, ' class="spin"') + "Running" : icon("run", 10) + (c.value ? "Run again" : "Run")}</button>` : ""}
      ${c.editable || c.choices ? editing ? `<button class="btn small" data-act="col-save" data-id="${esc(c.id)}"${S.busy.cell ? " disabled" : ""}>Save</button><button class="btn small quiet" data-act="col-cancel">Cancel</button>`
        : `<button class="btn small" data-act="col-edit" data-id="${esc(c.id)}">${icon("own", 10)}Edit</button>` : ""}
    </div>` : "";
  return `<div class="crow"><span class="k">${colKind(c) ? `<span class="kl">${icon(colKind(c), 12)}${esc(c.label)}</span>` : esc(c.label)}${c.ai ? `<small>${esc(c.kind)}</small>` : ""}</span>
    <div class="v">${mark}<span>${value}</span>${note ? `<span class="hint" style="font-size:12px">${icon("warn", 10)} ${esc(note)}</span>` : ""}${actions}</div></div>`;
}

function loginView() {
  return `<header class="top"><div class="top-row"><h1>Companion</h1></div></header>
  <div class="login">
    <h2>Open the link from your Mac</h2>
    <p class="muted">On the Mac where Zotero runs: the menu bar's Zotero Launcher › Reading Companion › Show the iPad Link…, then scan its code with the iPad's camera. Or type the key from that link (what follows <code>key=</code>).</p>
    <label class="sr" for="key">The key</label>
    <input id="key" class="field" data-keep="key" placeholder="The key" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(drafts.key || "")}">
    <button class="btn primary" data-act="login">Open</button>
  </div>`;
}

function pane() {
  return { chat: chatPane, notes: notesPane, prompts: promptsPane, tasks: tasksPane, tags: tagsPane, cols: colsPane }[S.tab]();
}

// The page drawn from the state; the field you were typing in keeps its focus and caret.
function render() {
  const root = document.getElementById("app");
  const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.keep : null;
  let sel = null;
  if (focused) { try { sel = [document.activeElement.selectionStart, document.activeElement.selectionEnd]; } catch { /* a select */ } }
  const scroller = root.querySelector(".body");
  const scroll = scroller ? scroller.scrollTop : 0;
  if (S.login) root.innerHTML = loginView();
  else {
    const picking = S.picking || !S.id;
    const chatMode = !picking && S.tab === "chat" && S.paper;
    root.innerHTML = header() + `<div class="body${chatMode ? " chat-mode" : ""}">` + (picking ? results() : card() + (S.paper ? tabs() + pane() : "")) + `</div>`;
  }
  const b = root.querySelector(".body");
  if (b) b.scrollTop = scroll;
  if (focused) {
    const el = root.querySelector(`[data-keep="${CSS.escape(focused)}"]`);
    if (el) {
      el.focus({ preventScroll: true });
      if (sel && sel[0] != null) try { el.setSelectionRange(sel[0], sel[1]); } catch { /* not text */ }
    }
  }
  growAsk();
}

// Only the messages, while an answer streams (the rest of the page stays as it is).
function renderChat() {
  const m = document.querySelector(".msgs");
  if (!m || S.tab !== "chat") return render();
  const atEnd = m.scrollHeight - m.scrollTop - m.clientHeight < 60;
  const tmp = document.createElement("div");
  tmp.innerHTML = chatPane();
  m.innerHTML = tmp.querySelector(".msgs").innerHTML;
  if (atEnd) m.scrollTop = m.scrollHeight;
}

function growAsk() {
  const t = document.getElementById("ask");
  if (!t) return;
  t.style.height = "auto";
  t.style.height = Math.min(160, t.scrollHeight + 2) + "px";
}

// ---------------------------------------------------------------- events

let queryTimer = 0;
document.addEventListener("input", (e) => {
  const k = e.target.dataset && e.target.dataset.keep;
  if (!k) return;
  if (k === "query") {
    S.query = e.target.value;
    S.picking = true;
    clearTimeout(queryTimer);
    queryTimer = setTimeout(() => { render(); search(S.query.trim()); }, 250);
    return;
  }
  drafts[k] = e.target.value;
  if (k === "ask") growAsk();
});

document.addEventListener("focusin", (e) => {
  if (e.target.dataset && e.target.dataset.keep === "query" && !S.picking) {
    S.picking = true;
    if (!S.results) search(S.query.trim());
    render();
  }
});

document.addEventListener("keydown", (e) => {
  const k = e.target.dataset && e.target.dataset.keep;
  if (e.key !== "Enter" || e.isComposing) return;
  if (k === "ask" && !e.shiftKey) { e.preventDefault(); ask(); }
  else if (k === "task") { e.preventDefault(); addTask(); }
  else if (k === "tag") { e.preventDefault(); addTag(); }
  else if (k === "key") { e.preventDefault(); login(); }
  else if (k === "query") { e.preventDefault(); e.target.blur(); }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  const act = t.dataset && t.dataset.act;
  if (act === "chat-pick") openChat(t.value);
  else if (act === "todo") toggleTask(t.dataset.id);
  else if (act === "col-toggle") toggleColumn(t.dataset.id, t.checked);
  else if (t.dataset && t.dataset.keep && t.tagName === "SELECT") drafts[t.dataset.keep] = t.value;
});

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.tagName === "SELECT" || (el.tagName === "INPUT" && el.type === "checkbox")) return;
  const act = el.dataset.act, v = el.dataset.v, id = el.dataset.id;
  switch (act) {
    case "pick": S.query = ""; openPaper(id); break;
    case "unpick": S.picking = false; S.query = ""; render(); break;
    case "retry": openPaper(S.id); break;
    case "health": S.showProblems = !S.showProblems; render(); break;
    case "card": S.cardOpen = !S.cardOpen; keep.set("cardOpen", S.cardOpen); render(); break;
    case "to-card": S.cardOpen = true; keep.set("cardOpen", true); render(); document.querySelector(".body").scrollTop = 0; break;
    case "status": if ((S.paper.status || "").toLowerCase() !== v.toLowerCase()) setStatus(v); break;
    case "task": if ((S.paper.task ? S.paper.task.statusId : "") !== v) setTask(v); break;
    case "tab": S.tab = v; keep.set("tab", v); render(); loadTab(); if (v === "chat") scrollChat(); break;
    case "ask": ask(); break;
    case "note-new": S.composing = true; render(); document.getElementById("note-text")?.focus(); break;
    case "note-cancel": S.composing = false; render(); break;
    case "note-save": saveNote(); break;
    case "note-open": toggleNote(id); break;
    case "note-copy": copyNote(id); break;
    case "prompt-run": runPrompt(id); break;
    case "task-add": addTask(); break;
    case "decide": decide(el.dataset.tax, el.dataset.label, !!el.dataset.accept); break;
    case "classify": classify(); break;
    case "tag-new": S.addingTag = true; render(); document.getElementById("new-tag")?.focus(); break;
    case "tag-cancel": S.addingTag = false; drafts.tag = ""; render(); break;
    case "tag-add": addTag(); break;
    case "tag-remove": removeTag(el.dataset.tag); break;
    case "chooser": S.chooser = !S.chooser; render(); break;
    case "col-edit": S.editing = id; delete drafts["cell:" + id]; render(); document.getElementById("cell-" + id)?.focus(); break;
    case "col-cancel": S.editing = ""; render(); break;
    case "col-save": saveCell(id); break;
    case "col-run": runCell(id); break;
    case "login": login(); break;
  }
});

// Back from Zotero (the iPad's other half, another app): what changed there shows.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && S.id && !S.login && !S.chat.streaming) { loadPaper(); loadTab(); }
});

start();
