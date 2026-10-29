// The review table's page, driven headless (phases 11a, 11b): the page as ReviewWebView builds it (the CSS, ReviewCore.js
// and ReviewGrid.js, the script allowed by its hash), loaded with a small paper set, then clicked and typed at.
// A developer's check where Playwright is installed (not CI's):
//   node macos/scripts/review-grid-check.mjs [--shot out.png]
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "ZoteroLauncher", "Review");
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.log("review-grid-check: Playwright isn't installed here; skipped");
  process.exit(0);
}

// The same page ReviewWebView.shell makes.
export function shell() {
  const script = readFileSync(join(dir, "ReviewCore.js"), "utf8") + "\n" + readFileSync(join(dir, "ReviewGrid.js"), "utf8");
  const hash = createHash("sha256").update(script, "utf8").digest("base64");
  const css = readFileSync(join(dir, "ReviewGrid.css"), "utf8");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${hash}'"><style>${css}</style></head><body><div id="app"></div><script>${script}</script></body></html>`;
}

const paper = (key, o) => Object.assign({ key, libraryID: 1, itemType: "journalArticle", title: "Paper " + key, creator: "", year: "", publication: "", rank: null, pdfCount: 1,
  noteCount: 0, extracted: false, dateAdded: "2025-01-01 00:00:00", dateModified: "", facets: [], tags: [], tagCount: 0, status: "" }, o);
const data = {
  review: { id: "r-0123456789", name: "Resilience core", source: { type: "search", key: "s1", libraryID: 1, title: "Resilience core", query: "" },
    columns: [{ id: "title" }, { id: "authors" }, { id: "year" }, { id: "abs" }, { id: "status" }, { id: "task" }, { id: "tax:method" }, { id: "c-0123456789" }, { id: "c-abcdefghij" }],
    sort: [], lines: 3, panel: true, created: "", updated: "" },
  columns: {
    "c-0123456789": { id: "c-0123456789", label: "Include?", kind: "own", type: "choice", options: ["include", "maybe", "exclude"], description: "" },
    "c-abcdefghij": { id: "c-abcdefghij", label: "My notes", kind: "own", type: "text", options: [], description: "" }
  },
  cells: { "c-0123456789": { "1:AAAAAAAA": { v: "include" } } },
  results: [
    paper("AAAAAAAA", { title: "Resource orchestration to create competitive advantage <b>breadth</b>", creator: "Sirmon et al.", year: "2011", rank: { ajg: "4*", abdc: "A*" }, status: "s/reading", facets: ["method/conceptual"] }),
    paper("BBBBBBBB", { title: "The dynamic resource-based view", creator: "Helfat & Peteraf", year: "2003", rank: { ajg: "4*" }, status: "s/read" }),
    paper("CCCCCCCC", { title: "Supply chain resilience", creator: "Ponomarov & Holcomb", year: "2009", rank: { ajg: "2" }, facets: ["method/review", "method/conceptual"] }),
    paper("DDDDDDDD", { title: "Untitled draft", creator: "", year: "" })
  ],
  total: 4,
  ctx: { statuses: ["to read", "reading", "read"], taskStatusList: [{ id: "to_read", name: "To read", group: "backlog" }, { id: "reading", name: "Reading", group: "active" }, { id: "done", name: "Done", group: "completed" }],
    taskStatuses: ["To read", "Reading", "Done"], tasks: { "1:BBBBBBBB": { id: "reading", name: "Reading" } }, taxonomies: [{ name: "Method", prefix: "method/", kind: "several" }],
    searches: [{ id: "s1", name: "Resilience core", query: "resilience #core" }, { id: "s2", name: "Theory", query: "theory/" }] },
  readOnly: false, problem: "", loading: false
};

const fail = (m) => { console.error("FAIL " + m); process.exitCode = 1; };
const ok = (cond, m) => (cond ? console.log("ok   " + m) : fail(m));

const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
pg.on("pageerror", (e) => errors.push(e.message));
pg.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await pg.setContent(shell());
await pg.evaluate((d) => RT.load(d), data);
const sent = () => pg.evaluate(() => (window.RT_SENT || []).splice(0));
const cell = (p, c) => `td.cell[data-p="1:${p}"][data-c="${c}"]`;
let heads = "";

ok((await sent()).some((m) => m.type === "ready"), "the page says it's ready");
ok((await pg.locator("tbody tr").count()) === 4, "four rows");
ok(!(await pg.textContent(cell("AAAAAAAA", "title"))).includes("<b>"), "a title's markup isn't shown as text");
ok((await pg.textContent(cell("AAAAAAAA", "title") + " b")) === "breadth", "its bold drawn bold (an element, never the title's HTML)");
ok((await pg.locator(cell("AAAAAAAA", "status") + " .pill svg").count()) === 1, "a status pill has its symbol");
ok((await pg.locator(cell("AAAAAAAA", "tax:method") + " .pill svg").count()) === 1, "a taxonomy's too");

// a click only selects
const before = await pg.textContent(cell("AAAAAAAA", "c-0123456789"));
await pg.click(cell("AAAAAAAA", "c-0123456789"));
await pg.click(cell("AAAAAAAA", "c-0123456789"));
ok((await pg.textContent(cell("AAAAAAAA", "c-0123456789"))) === before, "clicking a choice cell changes nothing");
ok((await sent()).length === 0, "and sends nothing");
await pg.click('#panel [data-set="own"][data-val="exclude"]');
ok((await pg.textContent(cell("AAAAAAAA", "c-0123456789"))) === "exclude", "the panel's pill sets it");
let m = await sent();
ok(m.length === 1 && m[0].type === "cell" && m[0].value === "exclude" && m[0].paper === "1:AAAAAAAA", "a cell message");

// status and task in the panel, and by keys
await pg.click(cell("CCCCCCCC", "status"));
await pg.click('#panel [data-set="status"][data-val="to read"]');
m = await sent();
ok(m[0] && m[0].type === "status" && m[0].from === "" && m[0].to === "s/to read", "a status message from the panel");
ok((await pg.textContent("#foot")).includes("Now: to read"), "the footer says Now: to read");
await pg.keyboard.press("Alt+ArrowRight");
m = await sent();
ok(m[0] && m[0].to === "s/reading", "⌥→ moves the status on");
await pg.keyboard.press("Shift+Alt+ArrowRight");
m = await sent();
ok(m[0] && m[0].type === "task" && m[0].status === "to_read", "⇧⌥→ makes the task, at the first status");

// editing your text column
await pg.click(cell("BBBBBBBB", "c-abcdefghij"));
await pg.keyboard.press("Enter");
await pg.keyboard.type("Lifecycle, not shocks");
await pg.keyboard.press("Meta+Enter");
m = await sent();
ok(m[0] && m[0].type === "cell" && m[0].value === "Lifecycle, not shocks", "↵ edits, ⌘↵ keeps");
await pg.dblclick(cell("BBBBBBBB", "c-abcdefghij"));
await pg.keyboard.type(" (draft)");
await pg.keyboard.press("Escape");
ok((await sent()).length === 0, "esc drops it");

// sorting: a click, then ⇧-click
await pg.click('th[data-c="year"] .hl');
let order = await pg.$$eval("tbody tr", (t) => t.map((r) => r.getAttribute("data-p").slice(2, 3)).join(""));
ok(order === "BCAD", "a header's click sorts ascending, the empty year last: " + order);
await pg.click('th[data-c="year"] .hl');
order = await pg.$$eval("tbody tr", (t) => t.map((r) => r.getAttribute("data-p").slice(2, 3)).join(""));
ok(order === "ACBD", "again: descending, the empty year still last: " + order);
await pg.click('th[data-c="abs"] .hl');
await pg.click('th[data-c="year"] .hl', { modifiers: ["Shift"] });
order = await pg.$$eval("tbody tr", (t) => t.map((r) => r.getAttribute("data-p").slice(2, 3)).join(""));
ok(order === "BACD", "ABS, then year by ⇧-click: " + order);
await pg.waitForTimeout(500);
m = await sent();
const layout = m.filter((x) => x.type === "layout").pop();
ok(layout && layout.review.sort.length === 2 && layout.review.sort[1].column === "year", "the sort is saved with the review");
const label = (sel) => pg.getAttribute(sel, "aria-label");
ok((await label("#bSort")).startsWith("Sort: ABS, then Year") && (await label("#bOrder")).startsWith("Ascending by ABS"), "Sort names its keys, Order says its direction");
ok((await pg.textContent(".tools")).trim() === "" && (await pg.locator(".tools button svg").count()) === 11, "the toolbar is icons, each with its name");

// the order and the groups
await pg.click("#bOrder");
ok((await label("#bOrder")).startsWith("Descending by ABS") && (await pg.getAttribute("#bOrder", "data-icon")) === "desc", "Order turns the first key: descending");
await pg.click("#bGroup");
await pg.click('.pop [data-g="year"]');
const heads2 = await pg.$$eval("tbody tr.grp .gl", (t) => t.map((x) => x.textContent));
ok(heads2.length >= 2 && heads2[heads2.length - 1] === "Year · none", "Group ▾ › Year: a header per year, the papers without one last: " + heads2.join(", "));
ok((await label("#bGroup")).startsWith("Group: Year"), "Group names the column");
await pg.waitForTimeout(500);
m = await sent();
ok(m.filter((x) => x.type === "layout").pop().review.group === "year", "the grouping is saved with the review");
await pg.keyboard.press("ArrowDown");
ok(!(await pg.locator("tbody tr.grp td.active").count()), "the arrows skip the headers");
await pg.click("#bGroup");
await pg.click('.pop [data-g=""]');
ok((await pg.locator("tbody tr.grp").count()) === 0, "Group ▾ › None: no headers");

// moving and hiding columns, the panel
await pg.click(cell("AAAAAAAA", "year"));
await pg.keyboard.press("Meta+Alt+ArrowRight");
heads = await pg.$$eval("thead th[data-c]", (t) => t.map((x) => x.getAttribute("data-c")).join(","));
ok(heads.startsWith("title,authors,abs,year"), "⌥⌘→ moves the column: " + heads);
// a header dragged moves its column; its edge resizes it and moves nothing; neither sorts
const sortNow = async () => JSON.stringify(await pg.evaluate(() => { RT_SENT.splice(0); return null }));
await sortNow();
const hb = async (c) => pg.locator(`th[data-c="${c}"]`).boundingBox();
let yb = await hb("year"), ab = await hb("authors");
await pg.mouse.move(yb.x + 12, yb.y + yb.height / 2);
await pg.mouse.down();
await pg.mouse.move(ab.x + 20, ab.y + ab.height / 2, { steps: 6 });
await pg.mouse.up();
heads = await pg.$$eval("thead th[data-c]", (t) => t.map((x) => x.getAttribute("data-c")).join(","));
ok(heads.startsWith("title,year,authors"), "dragging a header moves its column: " + heads);
ok((await label("#bOrder")).startsWith("Descending by ABS"), "and doesn't sort by it");
ab = await hb("authors");
const grip = { x: ab.x + ab.width - 3, y: ab.y + ab.height / 2 };
await pg.mouse.move(grip.x, grip.y);
await pg.mouse.down();
await pg.mouse.move(ab.x + 20, grip.y, { steps: 6 });
await pg.mouse.up();
const ab2 = await hb("authors");
heads = await pg.$$eval("thead th[data-c]", (t) => t.map((x) => x.getAttribute("data-c")).join(","));
ok(Math.round(ab2.width) < 40 && heads.startsWith("title,year,authors"), "its edge resizes it, narrower than before's floor, and moves nothing: " + Math.round(ab2.width) + " px");
ok((await label("#bOrder")).startsWith("Descending by ABS"), "and the resize doesn't sort");
await pg.waitForTimeout(500);
m = await sent();
ok(m.filter((x) => x.type === "layout").pop().review.columns.find((c) => c.id === "authors").width < 40, "the width is saved");
await pg.click('th[data-c="authors"] .hmenu');
await pg.click('.pop [data-m="hide"]');
heads = await pg.$$eval("thead th[data-c]", (t) => t.map((x) => x.getAttribute("data-c")).join(","));
ok(!heads.includes("authors"), "Hide it hides it");
const w0 = await pg.evaluate(() => document.getElementById("gw").clientWidth);
await pg.keyboard.press("Meta+Alt+KeyI");
const w1 = await pg.evaluate(() => document.getElementById("gw").clientWidth);
ok(w1 > w0 && !(await pg.isVisible("#panel")), "⌥⌘I folds the panel away, the grid takes the width");
await pg.click("#bPanel");
ok(await pg.isVisible("#panel"), "the Panel button brings it back");

// adding a column of your own: + Column asks who fills it in first
await pg.click("#bAdd");
ok((await pg.locator(".sheet .choice").count()) === 2 && !(await pg.locator("#nname").count()) && !(await pg.locator("#aprompt").count()), "+ Column: you or the AI, one at a time");
await pg.click('.sheet .choice[data-step="own"]');
await pg.fill("#nname", "Chapter");
await pg.selectOption("#ntype", "choice");
await pg.fill("#nopts", "2, 3");
await pg.click("#nadd");
m = await sent();
const added = m.find((x) => x.type === "addColumn");
ok(added && added.column.label === "Chapter" && added.column.options.join() === "2,3", "+ Column adds a column of your own");

// the Columns menu: every column there is, ticked when shown; ticking one not in the table adds it
await pg.click("#bCols");
ok((await pg.locator('.pop input[data-show="title"]').isChecked()) && (await pg.locator(".pop .ph.grp").count()) > 1, "Columns: every column, grouped, the shown ones ticked");
const unshown = await pg.$$eval(".pop input[data-show]", (b) => (b.find((x) => !x.checked) || {}).dataset?.show || "");
await pg.click(`.pop input[data-show="${unshown}"]`);
await pg.waitForTimeout(500);
m = await sent();
ok(unshown && m.filter((x) => x.type === "layout").pop().review.columns.some((c) => c.id === unshown && !c.hidden), "ticking one adds it: " + unshown);

// the toolbar's menus: their button again closes them, and so does a click outside
await pg.click("#bGroup");
ok(await pg.locator(".pop").count() === 1, "Group opens its menu");
await pg.click("#bGroup");
ok(await pg.locator(".pop").count() === 0, "and Group again closes it");
await pg.click("#bSort");
await pg.mouse.click(640, 700);
ok(await pg.locator(".pop").count() === 0, "a click outside closes it too");
await pg.click("#bSort");
await pg.click("#bGroup");
ok(await pg.locator(".pop").count() === 1, "another menu's button opens that one instead");
await pg.keyboard.press("Escape");

// a cell, a panel or a menu scrolled to its end doesn't scroll the table on
ok((await pg.evaluate(() => ["td.cell .cv", "#panel", "#gw"].map((q) => getComputedStyle(document.querySelector(q)).overscrollBehaviorY))).slice(0, 2).every((v) => v === "contain"), "a scrolled cell or panel stops at its end");

// the selected cell, when its text doesn't fit: the whole of it, over the cells below
const long = Array.from({ length: 40 }, (_, i) => "word" + i).join(" ");
const pk = JSON.parse(JSON.stringify(data));
pk.results[0].title = long;
await pg.evaluate((d) => RT.load(d), pk);
await sent();
await pg.click(cell("BBBBBBBB", "year"), { force: true }); // (the peek left from before may be over it: a click passes through)
ok(!(await pg.locator("#peek").count()), "a cell that fits: no peek");
await pg.click(cell("AAAAAAAA", "title"));
ok((await pg.locator("#peek").count()) === 1 && (await pg.textContent("#peek")).includes("word39"), "the selected cell's whole text, when it doesn't fit");
const pkb = await pg.locator("#peek").boundingBox(), below = await pg.locator(cell("BBBBBBBB", "title")).boundingBox();
if (pkb.y + pkb.height > below.y + 4) {
  await pg.mouse.click(below.x + 10, below.y + below.height / 2);
  ok((await pg.getAttribute(cell("BBBBBBBB", "title"), "class")).includes("active"), "a click on it over the cell below selects that cell");
}
await pg.click(cell("AAAAAAAA", "title"), { force: true });
ok((await pg.locator("#peek").count()) === 1, "back on the long cell: its whole text again");
await pg.keyboard.press("Escape");
ok(!(await pg.locator("#peek").count()) && (await pg.getAttribute(cell("AAAAAAAA", "title"), "class")).includes("active"), "esc puts it away, the cell still selected");
await pg.keyboard.press("ArrowDown");
await pg.keyboard.press("ArrowUp");
ok((await pg.locator("#peek").count()) === 1, "and it's back when the cell is selected again");
const pkt = await pg.locator("#peek").boundingBox(), own = await pg.locator(cell("AAAAAAAA", "title")).boundingBox();
await pg.mouse.click(pkt.x + 20, own.y + Math.min(own.height, pkt.height) / 2);
ok(!(await pg.locator("#peek").count()), "a click on it, over its own cell, puts it away too");
await pg.evaluate((d) => RT.load(d), data);
await sent();

// CSV
await pg.keyboard.press("Meta+e");
m = await sent();
const csv = m.find((x) => x.type === "csv");
ok(csv && csv.text.startsWith("﻿Paper,") && csv.text.includes("1:AAAAAAAA"), "⌘E sends the CSV");

// the source picker
await pg.click("#bSource");
await pg.click('.pop [data-search="s2"]');
m = await sent();
ok(m[0] && m[0].type === "source" && m[0].source.key === "s2", "a saved search picked in the box");

// the query box: the table follows as you type, read as the launcher reads it; esc goes back, ↵ keeps, ⌘S saves
await pg.click("#bSource");
await pg.fill("#srcq", "resilience y:2015..");
await pg.waitForTimeout(400);
m = await sent();
ok(m.some((x) => x.type === "segments" && x.text === "resilience y:2015..") && m.some((x) => x.type === "preview" && x.query === "resilience y:2015.."), "typing asks for its blocks and searches as you type");
await pg.evaluate(() => RT.segments("resilience y:2015..", [{ text: "resilience", label: "resilience", block: false, role: "" }, { text: " ", label: " ", block: false, role: "" }, { text: "y:2015..", label: "Year: 2015..", block: true, role: "field" }]));
ok((await pg.textContent("#srcsegs")).includes("Year: 2015..") && (await pg.locator("#srcsegs .qb").count()) === 1, "the query's blocks, as the launcher shows them");
await pg.keyboard.press("Escape");
m = await sent();
ok(m.some((x) => x.type === "preview" && x.query === null) && !(await pg.locator(".pop").count()), "esc closes it, and the table goes back to its source");
await pg.click("#bSource");
await pg.fill("#srcq", "teece");
await pg.keyboard.press("Enter");
m = await sent();
ok(m.some((x) => x.type === "source" && x.source.type === "query" && x.source.query === "teece") && !m.some((x) => x.type === "preview" && x.query === null), "↵ keeps the query");
await pg.click("#bSource");
await pg.fill("#srcq", "capabilities a:teece");
await pg.keyboard.press("Meta+s");
await pg.fill("#ssname", "Teece on capabilities");
await pg.click("#sssave");
m = await sent();
const saved = m.find((x) => x.type === "saveSearch");
ok(saved && saved.name === "Teece on capabilities" && saved.query === "capabilities a:teece" && !m.some((x) => x.type === "preview" && x.query === null), "⌘S saves it as a search, named");

// pinned over other apps' windows
await pg.click("#bPin");
m = await sent();
ok(m.some((x) => x.type === "pin" && x.on === true) && (await pg.getAttribute("#bPin", "aria-pressed")) === "true", "the pin asks for the window on top");

// AI columns (11b): a cell's state, the panel's evidence, + Column's AI form, Run…'s plan
const gap = { id: "c-gap0000000", label: "Gap", kind: "prompt", reads: "full", shape: "text", length: 60, options: [], evidence: true, model: "default", description: "What gap?" };
const rel = { id: "c-rel0000000", label: "Relevant?", kind: "jev-relevance", topic: "resilience", description: "About supply chain resilience" };
const hashOf = (d) => pg.evaluate((x) => ReviewCore.aiColumn(x, {}).hash, d);
const gh = await hashOf(gap), rh = await hashOf(rel);
const ai = JSON.parse(JSON.stringify(data));
ai.review.columns = [{ id: "title" }, { id: gap.id }, { id: rel.id }];
ai.columns = { [gap.id]: gap, [rel.id]: rel };
ai.ctx.jev = true;
ai.cells = {
  [gap.id]: { "1:AAAAAAAA": { v: "Orchestration over time", by: "ai", hash: gh, model: "claude:sonnet", updated: "2026-10-28T10:00:00Z", input: { text: "pdf" }, evidence: [{ quote: "we extend resource management", page: "4", found: true }, { quote: "an invented line", page: "", found: false }] },
    "1:BBBBBBBB": { v: "stale", by: "ai", hash: "000000000000" }, "1:CCCCCCCC": { v: "", by: "ai", error: "the model took longer than 300 s" },
    "1:DDDDDDDD": { v: "mine", by: "Mac mini", ai: { v: "the AI's", by: "ai", hash: gh } } },
  [rel.id]: { "1:AAAAAAAA": { v: 82, p: 0.82, by: "ai", hash: rh, model: "jev:jev-1" } }
};
await pg.evaluate((d) => RT.load(d), ai);
await sent();
ok((await pg.textContent(cell("BBBBBBBB", gap.id))).startsWith("●") && (await pg.locator(cell("BBBBBBBB", gap.id) + " .cv.st-prompt").count()) === 1, "a cell made by an older version of its column: prompt changed");
ok((await pg.textContent(cell("CCCCCCCC", gap.id))).startsWith("⚠") && (await pg.getAttribute(cell("CCCCCCCC", gap.id) + " .smark", "title")).includes("took longer"), "a failed cell says why");
ok((await pg.textContent(cell("DDDDDDDD", gap.id))).startsWith("✎"), "an edited one is yours");
ok((await pg.textContent(cell("AAAAAAAA", rel.id))) === "82 high", "relevance: its score and band");
await pg.click(cell("AAAAAAAA", gap.id));
ok((await pg.locator("#panel .ev").count()) === 2 && (await pg.locator("#panel .ev.nf").count()) === 1 && (await pg.textContent("#panel")).includes("By claude:sonnet on 2026-10-28, from the PDF"), "the panel: evidence, found or not, who made it and when");
await pg.click(cell("DDDDDDDD", gap.id));
await pg.click('#panel [data-act="restore"]');
m = await sent();
ok(m.some((x) => x.type === "restore" && x.column === gap.id && x.paper === "1:DDDDDDDD"), "Back to the AI's answer");
await pg.click(cell("BBBBBBBB", gap.id));
await pg.click('#panel [data-act="run1"]');
m = await sent();
ok(m.some((x) => x.type === "run" && x.jobs.length === 1 && x.jobs[0].paper === "1:BBBBBBBB"), "Run it again: that cell");
await pg.evaluate((d) => RT.load(d), ai);
await pg.click(cell("BBBBBBBB", gap.id));
await pg.keyboard.press("Meta+Shift+KeyR");
const plan = await pg.textContent("#rplan");
ok(plan.includes("1 failed") && plan.includes("1 prompt changed") && plan.includes("1 up to date") && plan.includes("Left as they are: 1 up to date, 1 of yours"), "⇧⌘R on an AI column: the plan, by state, what's left as it is");
ok(plan.includes("2 cells on 2 papers") && plan.includes("1 prompt request") === false && plan.includes("2 prompt requests"), "its requests");
await pg.click('input[name="rcols"][value="all"]');
ok((await pg.textContent("#rplan")).includes("Jev request"), "every AI column: Jev's requests too");
await pg.click("#rgo");
m = await sent();
const run = m.find((x) => x.type === "run");
ok(run && run.jobs.length === 5 && (await label("#bRun")).startsWith("An AI run is going"), "Run sends the plan's cells, and the toolbar shows the run");
await pg.evaluate((d) => RT.load(d), ai);
await pg.click("#bAdd");
await pg.click('.sheet .choice[data-step="ai"]');
await pg.check('input[name="akind"][value="prompt"]');
ok(await pg.isVisible("#aprompt") && !(await pg.isVisible("#atopic")), "+ Column: the AI prompt's fields");
await pg.fill("#adesc", "how many firms each study looked at");
await pg.click("#adraft");
m = await sent();
const dr = m.find((x) => x.type === "draftColumn");
ok(dr && dr.kind === "prompt" && dr.request === "how many firms each study looked at" && (await pg.isDisabled("#adraft")), "Write it with AI asks for the column, described");
await pg.evaluate(() => RT.drafted({ column: { label: "Firms studied", prompt: "How many firms did the study look at? A number.", reads: "full", shape: "number", length: 1, options: [], evidence: true }, notes: "Read from the method section." }));
ok((await pg.inputValue("#aname")) === "Firms studied" && (await pg.inputValue("#aprompt")).startsWith("How many firms") && (await pg.inputValue("#ashape")) === "number" && (await pg.textContent("#adraft")) === "Write it again", "and its answer fills the form, to change before Add");
await pg.fill("#aname", "Sample size");
await pg.fill("#aprompt", "How many firms?");
await pg.selectOption("#ashape", "number");
await pg.click("#nadd");
m = await sent();
const aic = m.find((x) => x.type === "addColumn");
ok(aic && aic.column.kind === "prompt" && aic.column.shape === "number" && aic.column.description === "How many firms?", "+ Column adds an AI prompt column");
await pg.click("#bAdd");
await pg.click('.sheet .choice[data-step="ai"]');
await pg.check('input[name="akind"][value="jev-several"]');
ok((await pg.textContent("#atax")).includes("Method (method/)") === false, "a taxonomy without an id isn't offered");
await pg.keyboard.press("Escape");

// the paper's letters, as the launcher's, and / to filter the rows
await pg.keyboard.press("Escape");
await sent();
await pg.click(cell("BBBBBBBB", "title"));
await sent();
for (const [k, what] of [["i", "citation"], ["r", "bibliography"], ["o", "external"], ["n", "notes"]]) {
  await pg.keyboard.press(k);
  const got = (await sent()).find((x) => x.type === "paper");
  ok(got && got.what === what && got.paper.key === "BBBBBBBB" && got.paper.title === "The dynamic resource-based view", k + ": the paper's " + what);
}
await pg.keyboard.press("z");
ok((await sent()).some((x) => x.type === "open" && x.paper.key === "BBBBBBBB"), "z: the paper in Zotero");
await pg.keyboard.press("/");
ok(await pg.evaluate(() => document.activeElement && document.activeElement.id === "find"), "/ opens the filter's box");
await pg.evaluate(() => RT.flash("")); // (the last flash gone)
await pg.keyboard.type("dynamic");
ok((await pg.locator("tbody tr[data-p]").count()) === 1, "the rows it keeps: a word in a column shown");
const fc = await pg.textContent("#fcount");
ok(fc === "1 of 4 papers", "the footer says how many of how many (" + fc + ")");
await pg.keyboard.press("Enter");
ok(await pg.evaluate(() => document.activeElement && document.activeElement.id === "gw"), "↵ back to the table, still filtered");
ok((await pg.locator("tbody tr[data-p]").count()) === 1, "(still one)");
await pg.keyboard.press("Escape");
ok((await pg.locator("tbody tr[data-p]").count()) === 4, "esc clears it");

// Delete this table…: asked first (Keep it is the default), then sent
await pg.click("#bSource");
await pg.click("[data-delete]");
ok((await pg.textContent(".sheet h2, .modal h2")).startsWith("Delete the table “"), "Delete this table… asks first");
ok(await pg.evaluate(() => document.activeElement && document.activeElement.id === "dkeep"), "Keep it has the keys");
await pg.click("#dkeep");
ok(!(await sent()).some((x) => x.type === "delete"), "Keep it keeps it");
await pg.click("#bSource");
await pg.click("[data-delete]");
await pg.click("#ddel");
ok((await sent()).some((x) => x.type === "delete"), "Delete it deletes it");

// narrow
await pg.setViewportSize({ width: 520, height: 700 });
ok(!(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "no page-wide horizontal scroll at 520 px");
const at = process.argv.indexOf("--shot");
if (at > 0) { await pg.setViewportSize({ width: 1280, height: 760 }); await pg.screenshot({ path: process.argv[at + 1] }); }
ok(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join("; ") : ""));
await b.close();
