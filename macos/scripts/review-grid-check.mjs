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
// (the panel's paper, said as the selection moves for the docked chat, left out unless asked for)
const sent = (all) => pg.evaluate(() => (window.RT_SENT || []).splice(0)).then((m) => (all ? m : m.filter((x) => x.type !== "chatPaper" && x.type !== "chatSlot")));
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

// dragged out to another app: a cell's text, plain (⌥: with its citation); a title, the paper's reference
const drag = (sel, alt) => pg.evaluate(([q, a]) => {
  const dt = new DataTransfer(), e = new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt, altKey: !!a });
  document.querySelector(q).dispatchEvent(e);
  return { text: dt.getData("text/plain"), stopped: e.defaultPrevented };
}, [sel, alt]);
ok((await pg.getAttribute(cell("AAAAAAAA", "year"), "draggable")) === "true", "a cell can be dragged");
ok((await drag(cell("AAAAAAAA", "c-0123456789"))).text === "include", "a cell dragged out carries its text");
ok((await drag(cell("AAAAAAAA", "c-0123456789"), true)).text === "include (Sirmon et al., 2011)", "with ⌥, its citation after it");
ok((await drag(cell("AAAAAAAA", "title"))).text === "Sirmon et al. (2011). Resource orchestration to create competitive advantage breadth.", "a title carries the paper's reference");
ok((await drag(cell("DDDDDDDD", "c-abcdefghij"))).stopped, "an empty cell doesn't drag");
ok((await drag("th[data-c=year]")).stopped, "nor a header (a drag moves a column)");
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
ok((await pg.textContent(".tools")).trim() === "" && (await pg.locator(".tools button svg").count()) === 12, "the toolbar is icons, each with its name");

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

// adding a column of your own: + Column asks who fills it in first; it lands right after the selected cell's column
await pg.click(cell("AAAAAAAA", "year"));
await sent();
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
heads = await pg.$$eval("thead th[data-c]", (t) => t.map((x) => x.getAttribute("data-c")));
ok(heads[heads.indexOf("year") + 1] === added.column.id && (await pg.getAttribute("td.cell.active", "data-c")) === added.column.id, "right after the selected cell's column, and selected: " + heads.join(","));

// the Columns menu: one list, the shown ones first in the table's order (ticked), then the others; each row its kind's
// icon; ticking one adds it right after the selected cell's column; a row's handle drags it, ⌥⌘↑ ⌥⌘↓ move it
const shownCols = () => pg.$$eval(".pop .crow.on", (r) => r.map((x) => x.getAttribute("data-col")).join(","));
const headCols = () => pg.$$eval("thead th[data-c]", (t) => t.map((x) => x.getAttribute("data-c")).join(","));
await pg.click(cell("AAAAAAAA", "year"));
await pg.click("#bCols");
ok((await shownCols()) === (await headCols()) && (await pg.locator('.pop input[data-show="title"]').isChecked()) && (await pg.locator(".pop .ph.grp").count()) === 1, "Columns: one list, the shown ones first in the table's order, ticked");
ok((await pg.locator('.pop .crow[data-col="status"] svg.ic-status').count()) === 1 && (await pg.locator('.pop .crow[data-col="tax:method"] svg.ic-tax').count()) === 1 && (await pg.locator('.pop .crow[data-col="abs"] svg.ic-rank').count()) === 1, "each row has its kind's icon");
ok((await pg.locator('.pop .crow[data-col="title"] .grip svg').count()) === 0 && (await pg.locator('.pop .crow[data-col="year"] .grip svg').count()) === 1, "a handle on each shown row, but the paper's");
const unshown = await pg.$$eval(".pop input[data-show]", (b) => (b.find((x) => !x.checked) || {}).dataset?.show || "");
await pg.click(`.pop input[data-show="${unshown}"]`);
await pg.waitForTimeout(500);
m = await sent();
heads = (await headCols()).split(",");
ok(unshown && m.filter((x) => x.type === "layout").pop().review.columns.some((c) => c.id === unshown && !c.hidden), "ticking one adds it: " + unshown);
ok(heads[heads.indexOf("year") + 1] === unshown && (await pg.locator(".pop").count()) === 1 && (await shownCols()) === heads.join(","), "right after the selected cell's column; the menu stays open, its list in the new order");
const rowBox = (c) => pg.locator(`.pop .crow[data-col="${c}"]`).boundingBox();
const gb = await pg.locator(`.pop .crow[data-col="${unshown}"] .grip`).boundingBox(), tb = await rowBox("abs");
await pg.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
await pg.mouse.down();
await pg.mouse.move(gb.x + gb.width / 2, tb.y + 3, { steps: 8 });
ok((await pg.locator('.pop .crow[data-col="abs"].dropT').count()) === 1, "a drag marks where it lands");
await pg.mouse.up();
heads = (await headCols()).split(",");
ok(heads[heads.indexOf("abs") - 1] === unshown && (await shownCols()) === heads.join(","), "dragging a row by its handle moves its column: " + heads.join(","));
await pg.focus(`.pop input[data-show="${unshown}"]`);
await pg.keyboard.press("Meta+Alt+ArrowDown");
heads = (await headCols()).split(",");
ok(heads[heads.indexOf("abs") + 1] === unshown && (await pg.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-show"))) === unshown, "⌥⌘↓ moves it down one, its tick keeps the keys");
await pg.click(`.pop input[data-show="${unshown}"]`);
ok(!(await headCols()).split(",").includes(unshown) && !(await shownCols()).split(",").includes(unshown), "unticked: hidden, and out of the shown ones");
await pg.keyboard.press("Escape");

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
const picked = m.find((x) => x.type === "source"); // (a layout saved a moment before may come first)
ok(picked && picked.source.key === "s2", "a saved search picked in the box");

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
ok((await pg.locator(`th[data-c="${gap.id}"] .hl svg.ic-ai`).count()) === 1 && (await pg.locator('th[data-c="title"] .hl svg').count()) === 0, "an AI column's header has the AI's sparkle");
await pg.click("#bCols");
ok((await pg.locator(`.pop .crow[data-col="${gap.id}"] svg.ic-ai`).count()) === 1 && (await pg.locator(`.pop .crow[data-col="${rel.id}"] svg.ic-ai`).count()) === 1 && !(await pg.textContent(".pop")).includes("AI columns"), "and so has its row in Columns: no AI section");
await pg.keyboard.press("Escape");
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
ok((await pg.locator('input[name="rcol"]').count()) === 2 && (await pg.isChecked(`input[name="rcol"][value="${gap.id}"]`)) && !(await pg.isChecked(`input[name="rcol"][value="${rel.id}"]`)), "the columns, a box each: the selected cell's ticked");
await pg.click("#rcnone");
ok((await pg.isDisabled("#rgo")) && (await pg.textContent("#rplan")).includes("Tick a column"), "none ticked: nothing to run");
await pg.click("#rcall");
ok((await pg.textContent("#rplan")).includes("Jev request"), "every AI column ticked: Jev's requests too");
await pg.click("#rgo");
m = await sent();
const run = m.find((x) => x.type === "run");
ok(run && run.jobs.length === 5 && (await label("#bRun")).startsWith("Stop the AI run") && (await pg.getAttribute("#bRun", "data-icon")) === "stop", "Run sends the plan's cells, and the toolbar's button stops the run");
await pg.click("#bRun");
m = await sent();
ok(m.some((x) => x.type === "stop"), "■ stops it");
await pg.evaluate((d) => RT.load(d), ai);

// a run's cells: the one being asked turns, the ones after it wait (a symbol each, not a colour)
await pg.evaluate((d) => RT.load(d), Object.assign({}, ai, { run: { stage: "1 of 3 papers", started: "2026-11-04T10:00:00Z", done: 1, cells: [gap.id + "|1:AAAAAAAA", gap.id + "|1:BBBBBBBB", gap.id + "|1:CCCCCCCC"], queued: [rel.id + "|1:DDDDDDDD"] } }));
ok((await pg.locator(cell("BBBBBBBB", gap.id) + " .cv.rs-running .rmark svg.ic-running").count()) === 1, "the paper being asked: running, its turning symbol");
ok((await pg.locator(cell("CCCCCCCC", gap.id) + " .cv.rs-waiting .rmark svg.ic-waiting").count()) === 1 && (await pg.locator(cell("DDDDDDDD", rel.id) + " svg.ic-waiting").count()) === 1, "the ones after it, and one asked meanwhile: waiting");
ok((await pg.locator(cell("AAAAAAAA", gap.id) + " .rmark").count()) === 0, "a paper done: no mark");
ok((await label("#bRun")).includes("1 more waiting"), "the ■ says what waits");
await pg.click(cell("BBBBBBBB", gap.id), { button: "right" });
ok((await pg.textContent(".pop")).includes("Running now") && (await pg.locator('.pop [data-m="stop"]').count()) === 1, "its menu: running now, Stop the run");
await pg.click('.pop [data-m="stop"]');
ok((await sent()).some((x) => x.type === "stop"), "Stop the run, from a cell's menu");
await pg.evaluate((d) => RT.load(d), ai);
await sent();

// a right-click on a cell: copy it, with its citation (APA 7); an AI one: run it, its row, the selected
await pg.click(cell("BBBBBBBB", gap.id), { button: "right" });
const cm = await pg.textContent(".pop");
ok(cm.includes("Copy") && cm.includes("(Helfat & Peteraf, 2003)") && cm.includes("Run it again") && cm.includes("Run this paper's AI cells"), "a cell's menu: copy, with its citation, run it, its row");
ok((await pg.getAttribute("td.cell.active", "data-p")) === "1:BBBBBBBB", "the cell right-clicked is the one selected");
await pg.click('.pop [data-m="cite"]');
m = await sent();
ok(m.some((x) => x.type === "copy" && x.text === "stale (Helfat & Peteraf, 2003)"), "Copy with its citation: the text, then (author, year)");
await pg.click(cell("AAAAAAAA", "title"), { button: "right" });
await pg.click('.pop [data-m="copy"]');
m = await sent();
ok(m.some((x) => x.type === "copy" && x.text === "Resource orchestration to create competitive advantage breadth"), "a Zotero cell copies too (its plain text)");
await pg.click(cell("CCCCCCCC", gap.id), { button: "right" });
await pg.click('.pop [data-m="row"]');
m = await sent();
const rowRun = m.find((x) => x.type === "run");
ok(rowRun && rowRun.jobs.length === 2 && rowRun.jobs.every((j) => j.paper === "1:CCCCCCCC"), "Run this paper's AI cells: the row's, not up to date ones");
ok((await pg.locator(cell("CCCCCCCC", gap.id) + " .rmark").count()) === 1, "and they show as running at once");
await pg.evaluate((d) => RT.load(d), ai);
await sent();
// a header's: run the column now (what's not run or out of date), or Run… for the choices
await pg.click(`th[data-c="${gap.id}"]`, { button: "right" });
ok((await pg.textContent(".pop")).includes("Run this column") && (await pg.textContent(".pop")).includes("2 cells not run or out of date") && (await pg.locator('.pop [data-m="edit"]').count()) === 1, "a header's menu: run the column now, edit it");
await pg.click('.pop [data-m="runcol"]');
m = await sent();
const colRun = m.find((x) => x.type === "run");
ok(colRun && colRun.jobs.map((j) => j.paper).sort().join() === "1:BBBBBBBB,1:CCCCCCCC", "Run this column: the shown papers' cells that need it (not up to date, not yours)");
await pg.evaluate((d) => RT.load(d), ai);
await sent();
// Columns: a right-click or the pencil edits a column
await pg.click("#bCols");
await pg.click(`.pop .crow[data-col="${gap.id}"] label`, { button: "right" });
ok((await pg.textContent(".pop")).includes("Edit it…"), "a column's row in Columns: right-click, Edit it…");
await pg.click('.pop [data-edit]');
ok((await pg.inputValue("#aname")) === "Gap", "Edit it… opens the column's form");
await pg.keyboard.press("Escape");
await pg.click("#bCols");
ok((await pg.locator(`.pop .crow[data-col="${gap.id}"] .cedit`).count()) === 1 && (await pg.locator('.pop .crow[data-col="year"] .cedit').count()) === 0, "the pencil on yours and the AI's, not Zotero's");
await pg.keyboard.press("Escape");

// the panel: a cell read first, whole; Edit opens the box: type, ⌘↵ keeps it; esc drops it; unchanged isn't an edit
await pg.click(cell("AAAAAAAA", gap.id));
ok((await pg.locator("#pedbox").count()) === 0 && (await pg.locator("#pinfo .pread .ptext").count()) === 1 && (await pg.locator('#pinfo [data-act="pedit"]').count()) === 1, "the panel reads a cell first, with Edit");
await pg.click('#pinfo [data-act="pedit"]');
ok((await pg.evaluate(() => document.activeElement && document.activeElement.id)) === "pedbox", "Edit opens the box, focused");
await pg.keyboard.press("Meta+Enter");
m = await sent();
ok(!m.some((x) => x.type === "cell") && (await pg.locator("#pedbox").count()) === 0, "an edit that changed nothing: nothing kept, back to reading it");
await pg.click('#pinfo [data-act="pedit"]');
await pg.fill("#pedbox", "Orchestration, revised");
await pg.keyboard.press("Meta+Enter");
m = await sent();
ok(m.some((x) => x.type === "cell" && x.column === gap.id && x.paper === "1:AAAAAAAA" && x.value === "Orchestration, revised"), "the panel's editor: ⌘↵ keeps it");
ok((await pg.locator("#pedbox").count()) === 0 && (await pg.textContent("#pinfo .pread .ptext")) === "Orchestration, revised", "kept: read again, the new text");
await pg.click(cell("BBBBBBBB", gap.id));
await pg.dblclick("#pinfo .pread .ptext");
ok((await pg.locator("#pedbox").count()) === 1, "a double-click on the text edits it too");
await pg.fill("#pedbox", "never kept");
await pg.keyboard.press("Escape");
m = await sent();
await pg.waitForTimeout(50);
ok(!m.some((x) => x.type === "cell") && (await pg.locator("#pedbox").count()) === 0 && (await pg.textContent("#pinfo .pread .ptext")) === "stale", "esc drops it");
await pg.click(cell("BBBBBBBB", gap.id));
await pg.click('#pinfo [data-act="pedit"]');
await pg.fill("#pedbox", "typed, the table drawn again meanwhile");
await pg.evaluate((d) => RT.load(d), ai);
ok((await pg.inputValue("#pedbox")) === "typed, the table drawn again meanwhile", "what you're typing survives the table being drawn again");
await pg.click(cell("CCCCCCCC", "title"));
m = await sent();
ok(m.some((x) => x.type === "cell" && x.paper === "1:BBBBBBBB" && x.value === "typed, the table drawn again meanwhile"), "leaving the box keeps it");
await pg.evaluate((d) => RT.load(d), ai);
await sent();

// a cell whose column shows fewer lines than its row is tall fills the row (not cut short with a scroll bar of its own)
const tall = JSON.parse(JSON.stringify(ai));
tall.review.columns = [{ id: "title", lines: 0, width: 140 }, { id: gap.id, lines: 2, width: 140 }, { id: rel.id }];
tall.results[0].title = "A long title that wraps over many lines in a narrow column, so the row is tall: resource orchestration across the life cycle of firms";
tall.cells[gap.id]["1:AAAAAAAA"].v = "Orchestration over time, a long answer that goes on well past two lines in this narrow column, and on, and on, and on";
await pg.evaluate((d) => RT.load(d), tall);
const hs = await pg.evaluate(([g]) => ["title", g].map((c) => { const cv = document.querySelector(`td.cell[data-p="1:AAAAAAAA"][data-c="${c}"] .cv`); return [cv.offsetHeight, cv.scrollHeight - cv.clientHeight] }), [gap.id]);
ok(hs[1][0] > 44 && hs[1][0] <= hs[0][0] && hs[1][1] <= 1, "a cell shows as much as its row's height holds, not cut at its 2 lines (" + hs[1][0] + " of " + hs[0][0] + " px)");
await pg.evaluate((d) => RT.load(d), ai);

// a row's height: dragged by its edge, kept by paper; a double-click puts it back
const edge = await pg.locator('[data-rrz="1:AAAAAAAA"]').boundingBox();
await pg.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
await pg.mouse.down();
await pg.mouse.move(edge.x + edge.width / 2, edge.y + 120, { steps: 4 });
await pg.mouse.up();
await pg.waitForTimeout(500);
m = await sent();
const lay = m.filter((x) => x.type === "layout").pop();
const hA = lay && lay.review.heights["1:AAAAAAAA"];
ok(hA > 100 && (await pg.locator(cell("AAAAAAAA", gap.id) + " .cv.rh").count()) === 1, "dragged: the row's height kept for the paper (" + hA + " px)");
await pg.dblclick('[data-rrz="1:AAAAAAAA"]');
await pg.waitForTimeout(500);
m = await sent();
const lay2 = m.filter((x) => x.type === "layout").pop();
ok(lay2 && !lay2.review.heights["1:AAAAAAAA"] && (await pg.locator(cell("AAAAAAAA", gap.id) + " .cv.rh").count()) === 0, "a double-click: back to its lines");

// a list is bullets, tags are pills
const lst = { id: "c-lst0000000", label: "Findings", kind: "prompt", reads: "abstract", shape: "list", length: 5, options: [], evidence: false, model: "default", description: "Findings?" };
const tgs = { id: "c-tgs0000000", label: "Constructs", kind: "prompt", reads: "abstract", shape: "tags", length: 5, options: [], evidence: false, model: "default", description: "Constructs?" };
const shapes = JSON.parse(JSON.stringify(ai));
shapes.review.columns.push({ id: lst.id }, { id: tgs.id });
Object.assign(shapes.columns, { [lst.id]: lst, [tgs.id]: tgs });
shapes.cells[lst.id] = { "1:AAAAAAAA": { v: ["Firms adapt", "Managers sense"], by: "ai", hash: await hashOf(lst) } };
shapes.cells[tgs.id] = { "1:AAAAAAAA": { v: ["routines", "sensing"], by: "ai", hash: await hashOf(tgs) } };
await pg.evaluate((d) => RT.load(d), shapes);
ok((await pg.locator(cell("AAAAAAAA", lst.id) + " ul.blist li").count()) === 2 && (await pg.locator(cell("AAAAAAAA", lst.id) + " .pill").count()) === 0, "a list's answer: bullets");
ok((await pg.locator(cell("AAAAAAAA", tgs.id) + " .pill.tax").count()) === 2, "tags: pills");
await pg.click(cell("AAAAAAAA", lst.id));
ok((await pg.locator("#pinfo .pread ul.blist li").count()) === 2, "a list in the panel: read as bullets first");
await pg.click('#pinfo [data-act="pedit"]');
ok((await pg.inputValue("#pedbox")) === "Firms adapt\nManagers sense", "a list in the panel's editor: an item a line");
await pg.fill("#pedbox", "- Firms adapt\n- Managers sense change\n");
await pg.keyboard.press("Meta+Enter");
m = await sent();
ok(m.some((x) => x.type === "cell" && JSON.stringify(x.value) === JSON.stringify(["Firms adapt", "Managers sense change"])), "kept as items (its bullets dropped)");
await pg.evaluate((d) => RT.load(d), ai);
await sent();
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

// the panel: the paper's notes, asked once, in your order; a click opens one in its own window
const nd = JSON.parse(JSON.stringify(data));
nd.results[1].noteCount = 2;
nd.review.id = "r-notes00000"; // (another table: its own columns)
await pg.evaluate((d) => RT.load(d), nd);
await sent();
await pg.click(cell("AAAAAAAA", "year"));
ok((await pg.textContent("#panel .notes")).includes("No notes on this paper") && !(await sent()).some((x) => x.type === "notes"), "a paper without notes: says so, asks nothing");
await pg.click(cell("BBBBBBBB", "year"));
m = await sent();
ok(m.some((x) => x.type === "notes" && x.paper.key === "BBBBBBBB") && (await pg.textContent("#panel .notes")).includes("Listing them"), "one with notes: they're asked for");
await pg.evaluate(() => RT.notes("1:BBBBBBBB", { notes: [{ key: "N1", libraryID: 1, title: "Reading notes", dateModified: "2026-10-20 10:00:00", excerpt: "x" }, { key: "N2", libraryID: 1, title: "", dateModified: "" }] }));
ok((await pg.locator("#panel button.note").count()) === 2 && (await pg.locator("#panel button.note svg.ic-note").count()) === 2 && (await pg.textContent("#panel .notes")).includes("Untitled note"), "its notes listed, each with the note icon");
await pg.click(cell("BBBBBBBB", "authors"));
ok(!(await sent()).some((x) => x.type === "notes") && (await pg.locator("#panel button.note").count()) === 2, "another column of the paper: not asked again");
await pg.click("#panel button.note >> nth=0");
m = await sent();
ok(m.some((x) => x.type === "note" && x.note.key === "N1" && x.note.title === "Reading notes"), "a click opens it in its own window");
await pg.evaluate(() => RT.notes("1:BBBBBBBB", { error: "Zotero isn't running" }));
ok((await pg.textContent("#panel .notes")).includes("Couldn't list them: Zotero isn't running"), "or says why not");

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

// round 2: several of a list, Group without free text, Edit it…, Jev on labels of your own
const multi = { id: "c-multi00000", label: "Themes", kind: "own", type: "multi", options: ["trust", "power"], description: "" };
const notes2 = { id: "c-notes00000", label: "Remarks", kind: "own", type: "text", options: [], description: "" };
const gap2 = { id: "c-gapai00000", label: "Gap", kind: "prompt", reads: "abstract", shape: "text", length: 60, options: [], evidence: false, model: "default", description: "What gap?" };
const design = { id: "c-design0000", label: "Design", kind: "jev-one", taxonomy: "", labels: [{ name: "qualitative", definition: "interviews" }, { name: "quantitative", definition: "statistics" }], description: "" };
const r2 = JSON.parse(JSON.stringify(data));
r2.review.id = "r-round20000";
r2.review.columns = [{ id: "title" }, { id: "year" }, { id: multi.id }, { id: notes2.id }, { id: gap2.id }, { id: design.id }];
r2.columns = { [multi.id]: multi, [notes2.id]: notes2, [gap2.id]: gap2, [design.id]: design };
r2.cells = {};
await pg.evaluate((d) => RT.load(d), r2);
await sent();
await pg.click("#bGroup");
const gopts = await pg.$$eval(".pop [data-g]", (b) => b.map((x) => x.getAttribute("data-g")));
ok(gopts.includes(multi.id) && gopts.includes(design.id) && gopts.includes("year") && !gopts.includes(notes2.id) && !gopts.includes(gap2.id), "Group: no free text (yours, an AI's words); a choice, several of a list, a year: " + gopts.join(","));
await pg.keyboard.press("Escape");
ok(!(await pg.getAttribute(`th[data-c="${design.id}"] .hl`, "title")).includes("isn't there") && (await pg.locator(`th[data-c="${design.id}"] .hl svg.ic-ai`).count()) === 1, "a Jev column on your labels has no problem, and its sparkle");
await pg.click(cell("AAAAAAAA", multi.id));
await pg.click('#panel [data-set="multi"][data-val="trust"]');
m = await sent();
ok(m.some((x) => x.type === "cell" && JSON.stringify(x.value) === '["trust"]'), "several of a list: a pill turns one on");
ok((await pg.textContent('#panel [data-set="multi"][data-val="trust"]')).startsWith("✓") && (await pg.getAttribute('#panel [data-set="multi"][data-val="trust"]', "aria-pressed")) === "true", "it shows ✓ (not its colour alone)");
await pg.click('#panel [data-set="multi"][data-val="power"]');
m = await sent();
ok(m.some((x) => x.type === "cell" && JSON.stringify(x.value) === '["trust","power"]') && (await pg.locator(cell("AAAAAAAA", multi.id) + " .pill.own").count()) === 2, "another: both, in the column's order, a pill each in the cell");
await pg.click('#panel [data-set="multi"][data-val="trust"]');
m = await sent();
ok(m.some((x) => x.type === "cell" && JSON.stringify(x.value) === '["power"]'), "a click again takes it off");
// Edit it… on your column
await pg.click(`th[data-c="${notes2.id}"] .hmenu`);
await pg.click('.pop [data-m="edit"]');
ok((await pg.inputValue("#nname")) === "Remarks" && (await pg.inputValue("#ntype")) === "text" && (await pg.textContent("#nadd")) === "Save" && !(await pg.locator(".sheet [data-step]").count()), "Edit it…: the form, filled, Save, no Back");
await pg.fill("#nname", "Screening");
await pg.selectOption("#ntype", "multi");
await pg.fill("#nopts", "in, out");
await pg.click("#nadd");
m = await sent();
const ed1 = m.find((x) => x.type === "addColumn");
ok(ed1 && ed1.column.id === notes2.id && ed1.column.type === "multi" && ed1.column.options.join() === "in,out" && (await pg.textContent(`th[data-c="${notes2.id}"] .hl`)).includes("Screening"), "Save writes the same column over, the header follows");
// Edit it… on a Jev column of your labels
await pg.click(`th[data-c="${design.id}"] .hmenu`);
await pg.click('.pop [data-m="edit"]');
ok((await pg.inputValue("#atax")) === "" && (await pg.inputValue("#alabels")).startsWith("qualitative: interviews") && (await pg.isVisible("#alabels")) && (await pg.isDisabled('input[name="akind"][value="prompt"]')), "an AI column's form: its kind fixed, its own labels as lines");
await pg.fill("#alabels", "qualitative: interviews\nquantitative: statistics\nmixed: both");
await pg.click("#nadd");
m = await sent();
const ed2 = m.find((x) => x.type === "addColumn");
ok(ed2 && ed2.column.id === design.id && ed2.column.labels.length === 3 && (await pg.textContent("#foot")).includes("out of date"), "Save: its labels changed, its answers said out of date");
// + Column: Jev best fit on labels you write
await pg.click("#bAdd");
await pg.click('.sheet .choice[data-step="ai"]');
await pg.check('input[name="akind"][value="jev-one"]');
ok((await pg.inputValue("#atax")) === "" && (await pg.isVisible("#alabels")) && (await pg.isVisible("#aq")), "Jev best fit: your own labels first, a question if you like");
await pg.fill("#aname", "Level");
await pg.fill("#alabels", "firm");
await pg.click("#nadd");
ok((await pg.textContent("#nerr")).includes("two labels or more"), "one label isn't a best fit");
await pg.fill("#alabels", "firm: one firm studied\nindustry: an industry");
await pg.fill("#aq", "At what level is the study?");
await pg.click("#nadd");
m = await sent();
const lv = m.find((x) => x.type === "addColumn");
ok(lv && lv.column.kind === "jev-one" && lv.column.labels[1].name === "industry" && lv.column.description === "At what level is the study?", "Add: a Jev best fit on your labels, its question");

// the docked chat: a paper's (it follows the panel's paper) or the list's; Ask each paper
await pg.waitForTimeout(500);
await pg.evaluate((d) => RT.load(d), Object.assign({}, data, { chat: { open: false, mode: "paper" } }));
await sent();
await pg.click(cell("BBBBBBBB", "year"));
m = await sent(true);
ok(m.some((x) => x.type === "chatPaper" && x.paper.key === "BBBBBBBB" && x.paper.libraryID === 1), "the panel's paper is said as it moves (the chat follows it)");
await pg.click("#panel [data-act=chat]");
m = await sent();
ok(m.some((x) => x.type === "chat" && x.mode === "paper" && x.paper.key === "BBBBBBBB"), "the panel's chat icon opens the paper's chat");
await pg.evaluate((d) => RT.load(d), Object.assign({}, data, { chat: { open: true, mode: "paper" } }));
ok((await pg.getAttribute("#bChat", "aria-pressed")) === "true" && (await pg.getAttribute("#panel [data-act=chat]", "aria-selected")) === "true"
  && (await pg.getAttribute("#panel [data-act=info]", "aria-selected")) === "false", "open: the toolbar's icon is pressed and the pane's Chat tab selected (not by colour alone)");
ok(await pg.evaluate(() => !document.getElementById("pinfo") && !!document.getElementById("chatslot")), "the chat's tab: Info leaves its place to the app's chat (#chatslot)");
m = await sent(true);
const slot = m.filter((x) => x.type === "chatSlot").pop();
ok(slot && slot.slot && slot.slot.w > 200 && slot.slot.h > 200 && slot.slot.y > 30, "the chat's place is said to the app (under the tabs, the pane's width)");
ok((await pg.$$eval("#panel .ptab svg", (s) => s.length)) === 2, "each tab has its symbol");
await sent();
await pg.click("#bChat");
m = await sent();
ok(m.some((x) => x.type === "chat" && x.toggle === true), "the toolbar's icon toggles it");
// ⌥⌘I with the chat's tab showing: the whole pane goes, the chat too
await pg.keyboard.press("Alt+Meta+KeyI");
m = await sent();
ok(m.some((x) => x.type === "chat" && x.close === true), "⌥⌘I on the chat's tab hides the pane: the chat is closed");
await pg.waitForTimeout(500);
await sent();
await pg.evaluate((d) => RT.load(d), Object.assign({}, data, { review: Object.assign({}, data.review, { panel: false }), chat: { open: false, mode: "paper", width: 400 } }));
ok(await pg.evaluate(() => document.getElementById("body").classList.contains("nopanel")), "the pane hidden, the chat closed: nothing on the right");
await pg.evaluate(() => RT.showInfo());
ok(await pg.evaluate(() => !document.getElementById("body").classList.contains("nopanel")), "the Info tab (from the app's chat): the panel is back");
await pg.waitForTimeout(500);
m = await sent();
ok(m.some((x) => x.type === "layout" && x.review.panel === true), "and it's kept");
// the pane's edge: a drag sizes it (Info and Chat share the width: the app keeps it), a double-click puts it back
ok(Math.round(await pg.evaluate(() => document.getElementById("panel").getBoundingClientRect().width)) === 400, "the pane is as wide as the app says");
ok(await pg.evaluate(() => { const z = document.getElementById("prz").getBoundingClientRect(), p = document.getElementById("panel").getBoundingClientRect(); return z.width >= 8 && z.right <= p.left + 0.5 && getComputedStyle(document.getElementById("prz"), "::after").opacity > 0 }), "the pane's edge: its grip shown, wholly left of the pane (the app's chat never covers it)");
const pz = await pg.evaluate(() => { const r = document.getElementById("prz").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 40 } });
await pg.mouse.move(pz.x, pz.y);
await pg.mouse.down();
await pg.mouse.move(pz.x - 60, pz.y, { steps: 4 });
await pg.mouse.up();
m = await sent();
const pw = m.find((x) => x.type === "paneWidth");
ok(pw && pw.width === 460, "a drag of the pane's edge sizes it, and says its width to the app");
ok(Math.round(await pg.evaluate(() => document.getElementById("panel").getBoundingClientRect().width)) === 460, "drawn at its new width");
await pg.dblclick("#prz");
m = await sent();
ok(m.some((x) => x.type === "paneWidth" && x.width === 360), "a double-click puts it back");
// a tab dragged down onto the pane's lower half: split (Info above, the chat below)
await pg.evaluate((d) => RT.load(d), Object.assign({}, data, { chat: { open: false, mode: "paper", width: 360, split: false } }));
await sent();
const tg = await pg.evaluate(() => { const r = document.querySelector("#panel [data-drag=chat]").getBoundingClientRect(); const p = document.getElementById("panel").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, low: p.bottom - 60 } });
await pg.mouse.move(tg.x, tg.y);
await pg.mouse.down();
await pg.mouse.move(tg.x, tg.y + 30, { steps: 3 });
ok(!(await pg.$("#panel .drop")), "not yet over the lower half: no drop shown");
await pg.mouse.move(tg.x, tg.low, { steps: 6 });
ok(!!(await pg.$("#panel .drop")), "over the lower half: where it lands is shown (a dashed box and its words)");
await pg.mouse.up();
m = await sent();
ok(m.some((x) => x.type === "pane" && x.split === true) && m.some((x) => x.type === "chat" && x.mode === "paper"), "dropped: the pane is split, and the chat opened for its place");
ok(await pg.evaluate(() => !!document.getElementById("pinfo") && !!document.getElementById("chatslot") && !!document.getElementById("psplit")), "split: Info above, the divider, the chat's place below");
const sp = await pg.evaluate(() => { const r = document.getElementById("psplit").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } });
await pg.mouse.move(sp.x, sp.y);
await pg.mouse.down();
await pg.mouse.move(sp.x, sp.y - 80, { steps: 4 });
await pg.mouse.up();
m = await sent();
const rt = m.find((x) => x.type === "pane" && typeof x.ratio === "number");
ok(rt && rt.ratio < 0.5 && rt.ratio >= 0.2, "the divider dragged up: Info shorter, kept by the app");
await pg.click("#panel [data-act=split]");
m = await sent();
ok(m.some((x) => x.type === "pane" && x.split === false), "the pane's split button puts its tabs back");
ok(await pg.evaluate(() => !!document.querySelector("#panel .ptab")), "its tabs again");
await pg.evaluate(() => RT.chatList(7));
m = await sent();
const cl = m.find((x) => x.type === "chatList");
const first = cl && cl.list.papers[0];
ok(cl && cl.token === 7 && cl.list.name === "Resilience core" && cl.list.papers.length === 4 && first.id === "1:AAAAAAAA" && first.cite === "(Sirmon et al., 2011)"
  && first.cells.some((c) => c.label === "Include?" && c.value === "include") && !first.cells.some((c) => c.label === "Paper" || c.label === "Year"), "the list's chat: the rows as shown, each with its citation and the columns you see");
await pg.evaluate(() => RT.askEach({ question: "Which fatigue mechanisms does it test?" }));
m = await sent();
const ask = m.find((x) => x.type === "addColumn");
ok(ask && ask.column.kind === "prompt" && ask.column.reads === "full" && ask.column.label === "Ask: Which fatigue mechanisms does it…" && /not addressed/.test(ask.column.description), "Ask each paper: the question as an AI column that reads each full text");
ok((await pg.locator('input[name="rcol"]:checked').count()) === 1 && (await pg.isChecked(`input[name="rcol"][value="${ask.column.id}"]`)), "its run's plan shown first, only it ticked");
await pg.click("#rgo");
m = await sent();
ok(m.some((x) => x.type === "run" && x.jobs.length === 4 && x.jobs.every((j) => j.column === ask.column.id)), "Run: its cells, every paper shown");
const withAsk = JSON.parse(JSON.stringify(data));
withAsk.columns[ask.column.id] = ask.column;
withAsk.review.columns.push({ id: ask.column.id });
await pg.evaluate((d) => RT.load(d), Object.assign({}, withAsk, { run: { stage: "0 of 4 papers", started: "2026-11-04T10:00:00Z", cells: [], queued: [] } }));
ok(!(await sent()).some((x) => x.type === "askedEach"), "while it runs, nothing goes to the chat");
withAsk.cells[ask.column.id] = { "1:AAAAAAAA": { v: "glycogen depletion", by: "ai" }, "1:BBBBBBBB": { v: "not addressed", by: "ai" } };
await pg.evaluate((d) => RT.load(d), withAsk);
m = await sent();
const asked = m.find((x) => x.type === "askedEach");
ok(asked && asked.question === "Which fatigue mechanisms does it test?" && asked.papers === 4 && asked.answers.length === 2 && asked.answers[0].cite === "(Sirmon et al., 2011)" && asked.answers[0].value === "glycogen depletion",
  "the run done: its answers, each with its citation, go to the chat");
await pg.evaluate((d) => RT.load(d), withAsk);
ok(!(await sent()).some((x) => x.type === "askedEach"), "once");

// the list is live: a paper that leaves it gives its place to the next one (the selection doesn't jump to the top)
await pg.waitForTimeout(500);
await pg.evaluate((d) => RT.load(d), data);
const rowsNow = () => pg.$$eval("tbody tr[data-p]", (t) => t.map((r) => r.getAttribute("data-p")));
const was = await rowsNow();
await pg.click(`td.cell[data-p="${was[2]}"][data-c="year"]`);
await pg.evaluate((d) => RT.load(d), Object.assign({}, data, { results: data.results.filter((r) => "1:" + r.key !== was[2]), total: 3 }));
const now = await rowsNow();
ok(now.length === 3 && (await pg.getAttribute("td.cell.active", "data-p")) === now[2], "a paper gone from the list: the one after it is selected");

// narrow
await pg.setViewportSize({ width: 520, height: 700 });
ok(!(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "no page-wide horizontal scroll at 520 px");
const at = process.argv.indexOf("--shot");
if (at > 0) { await pg.setViewportSize({ width: 1280, height: 760 }); await pg.screenshot({ path: process.argv[at + 1] }); }
ok(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join("; ") : ""));
await b.close();
