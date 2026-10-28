// The review table's page, driven headless (phase 11a): the page as ReviewWebView builds it (the CSS, ReviewCore.js
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

ok((await sent()).some((m) => m.type === "ready"), "the page says it's ready");
ok((await pg.locator("tbody tr").count()) === 4, "four rows");
ok((await pg.textContent(cell("AAAAAAAA", "title"))).includes("<b>breadth</b>"), "a title's markup is shown as text");
ok((await pg.locator(cell("AAAAAAAA", "title") + " b").count()) === 0, "and never as HTML");

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

// moving and hiding columns, the panel
await pg.click(cell("AAAAAAAA", "year"));
await pg.keyboard.press("Meta+Alt+ArrowRight");
let heads = await pg.$$eval("thead th[data-c]", (t) => t.map((x) => x.getAttribute("data-c")).join(","));
ok(heads.startsWith("title,authors,abs,year"), "⌥⌘→ moves the column: " + heads);
await pg.click('th[data-c="authors"] .hmenu');
await pg.click('.pop [data-m="hide"]');
heads = await pg.$$eval("thead th[data-c]", (t) => t.map((x) => x.getAttribute("data-c")).join(","));
ok(!heads.includes("authors"), "Hide it hides it");
const w0 = await pg.evaluate(() => document.getElementById("gw").clientWidth);
await pg.keyboard.press("Meta+Alt+KeyI");
const w1 = await pg.evaluate(() => document.getElementById("gw").clientWidth);
ok(w1 > w0 && !(await pg.isVisible("#panel")), "⌥⌘I folds the panel away, the grid takes the width");
await pg.click("#bPanel");
ok(await pg.isVisible("#panel"), "◨ Panel brings it back");

// adding a column of your own
await pg.click("#bAdd");
await pg.fill("#nname", "Chapter");
await pg.selectOption("#ntype", "choice");
await pg.fill("#nopts", "2, 3");
await pg.click("#nadd");
m = await sent();
const added = m.find((x) => x.type === "addColumn");
ok(added && added.column.label === "Chapter" && added.column.options.join() === "2,3", "+ Column adds a column of your own");

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

// narrow
await pg.setViewportSize({ width: 520, height: 700 });
ok(!(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "no page-wide horizontal scroll at 520 px");
const at = process.argv.indexOf("--shot");
if (at > 0) { await pg.setViewportSize({ width: 1280, height: 760 }); await pg.screenshot({ path: process.argv[at + 1] }); }
ok(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join("; ") : ""));
await b.close();
