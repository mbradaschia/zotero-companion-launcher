// The fold reader's page, driven headless (docs/fold-reader/SPEC.md criteria 24 to 44 and the page budgets of section 11):
// the page as FoldWebView builds it (the CSS, then FoldCore.js, FoldView.js and FoldBridge.js as one script allowed by
// its hash), loaded with the synthetic fixture (FIXTURE.md), then clicked, typed and scrolled at.
// A developer's check where Playwright is installed (not CI's):
//   node macos/scripts/fold-reader-check.mjs [--shot out.png]
//   node macos/scripts/fold-reader-check.mjs --doc <doc.json> | --gallery <page.html> [--bbox <pdftotext -bbox-layout output>]
// With --doc or --gallery (real data kept outside the repository, FIXTURE.md section 5) it prints the coverage and the
// budgets instead of the fixture's assertions.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "ZoteroLauncher", "Reader");
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.log("fold-reader-check: Playwright isn't installed here; skipped");
  process.exit(0);
}
const F = require("../js/tests/fold-fixture.js");
const C = require("../ZoteroLauncher/Reader/FoldCore.js");

// The same page FoldWebView.shell makes, but for img-src: data: here (the fixture's pages), zlfold: in the app.
export function script() {
  return ["FoldCore.js", "FoldView.js", "FoldBridge.js"].map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
}
export function shell(imgSrc = "data:") {
  const s = script();
  const hash = createHash("sha256").update(s, "utf8").digest("base64");
  const css = readFileSync(join(dir, "FoldReader.css"), "utf8");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${imgSrc}; script-src 'sha256-${hash}'"><style>${css}</style></head><body><div id="app"></div><script>${s}</script></body></html>`;
}

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const URL_PATTERN = F.blankPage(987654).replace("987654", "{n}");
function payload(doc, words, extra) {
  return Object.assign({
    paper: { key: "ABCD1234", libraryID: 1, title: doc ? doc.title : "A paper", authors: doc ? doc.authors : [], year: doc ? String(doc.date || "").slice(0, 4) : "", publication: "Journal of Folding", cite: "Rivera and Okafor (2026)" },
    status: { current: "s/reading", options: ["to read", "reading", "read"] },
    task: { current: "reading", description: "Read for the review", options: [{ id: "to_read", name: "To read" }, { id: "reading", name: "Reading" }, { id: "done", name: "Done" }] },
    taxonomies: [{ name: "Method", labels: ["review", "survey"] }],
    doc, state: { kind: "ready" }, saved: null, marks: null, links: null, prefs: {},
    pdf: words ? { pages: words.pages.length, sizes: words.sizes, name: "paper.pdf", urlPattern: URL_PATTERN, bytes: 12345, modified: "2026-11-01T10:00:00Z" } : { problem: "no-pdf" }
  }, extra || {});
}

const fail = (m) => { console.error("FAIL " + m); process.exitCode = 1; };
let oks = 0;
const ok = (cond, m) => (cond ? (oks++, console.log("ok   " + m)) : fail(m));
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1360, height: 820 } });
const pg = await ctx.newPage();
const errors = [], requests = [];
pg.on("pageerror", (e) => errors.push(e.message));
pg.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
pg.on("request", (r) => { if (!r.url().startsWith("data:")) requests.push(r.url()); });
await pg.setContent(shell());
requests.length = 0; // (the shell itself)
const sent = () => pg.evaluate(() => (window.FR_SENT || []).splice(0));
const load = (o) => pg.evaluate((x) => FR.load(x), o);
const words = (w) => pg.evaluate((x) => FR.words(x), { pages: w.pages, done: true });
const wait = (ms) => pg.waitForTimeout(ms);
const attr = (sel, a) => pg.getAttribute(sel, a);
const has = (sel) => pg.locator(sel).count().then((n) => n > 0);
const cls = (sel) => pg.getAttribute(sel, "class").then((c) => " " + (c || "") + " ");

// in-page: select the pieces from one id to another and let go of the mouse, as a reader's drag would
const selectPieces = (from, to) => pg.evaluate(([a, z]) => {
  const s = document.querySelector('#text .column [data-id="' + a + '"]'), e = document.querySelector('#text .column [data-id="' + z + '"]');
  const r = document.createRange();
  r.setStart(s.firstChild, 0); r.setEnd(e.firstChild, e.firstChild.length);
  const ws = window.getSelection(); ws.removeAllRanges(); ws.addRange(r);
  e.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  return ws.toString();
}, [from, to]);
const hlIds = (u) => pg.$$eval(`.u[data-u="${u}"] .pc.hl`, (l) => l.map((x) => x.getAttribute("data-id")));
const levelKey = async (k) => { await pg.keyboard.press(k); await pg.evaluate(() => new Promise((r) => { const t = () => (performance.getEntriesByName("fr:settled").length ? r() : setTimeout(t, 10)); t(); })); };

if (arg("--doc") || arg("--gallery")) {
  await realData();
  await b.close();
  process.exit(process.exitCode || 0);
}

const doc = F.doc(), fw = F.fakeWords(doc);
const full = payload(doc, fw);
await load(full);
await words(fw);
await wait(100);

// 24: ready, the header
let m = await sent();
ok(m[0] && m[0].type === "ready", "24 the page says it's ready");
ok(m.some((x) => x.type === "links" && x.links.format === "zl-fold-links" && x.links.coverage.linked === 6), "the words linked: a links message, 6 of 8");
ok((await pg.textContent(".hd .title")) === "Folding a Paper: A Small Synthetic Study", "24 the title");
ok((await pg.textContent(".hd .byline")) === "Rivera, Okafor · 2026 · Journal of Folding · 2 pages", "24 the byline: " + (await pg.textContent(".hd .byline")));
ok((await attr("#pStatus", "aria-label")) === "Status: reading" && (await has("#pStatus svg.ic-status")), "24 the status pill, with its flag");
ok((await attr("#pTask", "aria-label")) === "Task: Reading" && (await has("#pTask svg.ic-task")) && (await attr("#pTask", "title")) === "Task: Reading (Read for the review)", "24 the task pill, its tooltip with the description");
ok((await pg.$$eval(".taxes > *", (l) => l.map((x) => x.textContent).join("|"))) === "|Method|review|survey" && (await attr(".taxes .ticon", "title")) === "Taxonomies", "24 the taxonomy group: icon, name, pills");
await pg.click("#pStatus");
ok((await pg.$$eval('.menu [role="menuitemradio"]', (l) => l.map((x) => x.getAttribute("aria-checked") + ":" + x.textContent).join("|"))) === "false:No status|false:to read|true:✓reading|false:read", "the status menu, the current one checked");
await pg.keyboard.press("ArrowDown");
await pg.keyboard.press("Enter");
m = await sent();
ok(m.some((x) => x.type === "status" && x.from === "s/reading" && x.to === "s/read") && (await pg.textContent(".ft")).includes("Now: read"), "a pick posts status and flashes Now: read");
ok((await pg.evaluate(() => document.activeElement.id)) === "pStatus", "the menu gives focus back to its pill");
await pg.keyboard.press("Shift+Alt+ArrowRight");
m = await sent();
ok(m.some((x) => x.type === "task" && x.status === "done"), "⇧⌥→ moves the task on");
await pg.focus("#text");

// 25: keys 1-5
const say = Object.fromEntries(C.LEVELS.map((L) => [L.key, L]));
for (const k of ["2", "3", "4", "5", "1"]) {
  await levelKey(k);
  const pressed = await pg.$$eval(".dial [data-level]", (l) => l.filter((x) => x.getAttribute("aria-pressed") === "true").map((x) => x.getAttribute("data-level")));
  m = await sent();
  const pref = m.filter((x) => x.type === "prefs" && x.level).pop();
  ok(pressed.join() === say[k].id && pref && pref.level === say[k].id && (await pg.textContent('.sr[aria-live="polite"]')) === say[k].say, `25 key ${k}: ${say[k].id} pressed, a prefs message, the live region says "${say[k].say}"`);
}
ok((await attr('[data-level="key"]', "title")) === "Key: each paragraph's point and its reason · 3" && (await attr('.dial', "aria-label")) === "Level", "the dial's group and tooltips");

// 27: fonts
const fam = (sel) => pg.$eval(sel, (e) => getComputedStyle(e).fontFamily);
ok(/serif/.test(await fam('.u[data-u="S1.p1.1"] .body')) && !/system-ui/.test(await fam('.u[data-u="S1.p1.1"] .body')), "27 Full: the paper's words in the serif");
for (const k of ["3", "4"]) {
  await levelKey(k);
  ok(/system-ui/.test(await fam('.u[data-u="S1.p1.1"] .body')), `27 ${say[k].name}: the AI's words in the sans`);
}
await levelKey("5");
ok(/system-ui/.test(await fam(".chip")), "27 Topic: the chips in the sans");

// 39: the PDF at Topic
ok(await pg.locator("#pdf").isHidden(), "39 the PDF pane is hidden at Topic");
ok((await pg.isDisabled("#bPdf")) && (await attr("#bPdf", "title")) === "The PDF shows beside levels 1 to 4", "39 the PDF button disabled, its tooltip says why");

// 36: Topic's cards and the back matter
ok((await pg.$$eval(".tcard", (l) => l.map((x) => x.getAttribute("data-s")).join())) === "abstract,S1,S2,S2.SS1", "36 four cards: abstract, S1, S2, S2.SS1");
ok((await pg.locator(".tback button").count()) === 1 && (await pg.textContent(".tback button")) === "▸ Show appendices and back matter (1 section)" && (await attr(".tback button", "aria-expanded")) === "false", "36 one button: ▸ Show appendices and back matter (1 section)");
ok((await pg.$$eval('.chip[data-u="abstract1.1"] .pc', (l) => l.map((x) => x.getAttribute("data-id")).join())) === "abstract1.1:24,abstract1.1:25" && (await pg.textContent('.chip[data-u="abstract1.1"]')).includes("main claims"), "the abstract's chip: tokens 24 and 25, spaced");
await pg.click(".tback button");
ok((await has('.tcard[data-s="A1"]')) && (await pg.textContent(".tback button")).startsWith("▾ Hide appendices and back matter (1 section)") && (await attr(".tback button", "aria-expanded")) === "true", "36 pressed: A1's card shows, the button says ▾ Hide …");
for (const u of ["S2.SS1.p1.1", "S2.p1.1"]) {
  await levelKey("5");
  await pg.evaluate(() => performance.clearMarks());
  await pg.click(`.chip[data-u="${u}"]`);
  await pg.evaluate(() => new Promise((r) => { const t = () => (performance.getEntriesByName("fr:settled").length ? requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))) : setTimeout(t, 10)); t(); }));
  const top = await pg.evaluate((id) => document.querySelector(`.u[data-u="${id}"]`).getBoundingClientRect().top - document.getElementById("text").getBoundingClientRect().top, u);
  ok((await attr('[data-level="key"]', "aria-pressed")) === "true" && Math.abs(top - 120) <= 2 && (await cls(`.u[data-u="${u}"]`)).includes(" sel "), `36 the ${u} chip opens Key, its unit selected at ${Math.round(top)} px from the top`);
}
await pg.click(".tback button").catch(() => {}); // (not shown at Key)

// 28: open in place, fold back
await levelKey("3");
await pg.click('.u[data-u="S1.p2.1"] button.shape');
const fullN = C.model(doc).units["S1.p2.1"].toks.length;
ok((await cls('.u[data-u="S1.p2.1"]')).includes(" opened ") && (await pg.locator('.u[data-u="S1.p2.1"] .body [data-id]').count()) === fullN && /serif/.test(await fam('.u[data-u="S1.p2.1"] .body')), "28 the role shape opens the unit at Full, in place, in the serif");
ok((await pg.textContent('.u[data-u="S1.p2.1"] .openedline')).startsWith("Opened in place") && (await pg.isHidden('.u[data-u="S1.p1.1"] .openedline')), "28 its line says Opened in place; the others are unchanged");
await pg.keyboard.press("Escape");
ok(!(await cls('.u[data-u="S1.p2.1"]')).includes(" opened ") && (await pg.locator('.u[data-u="S1.p2.1"] .body [data-id]').count()) < fullN, "28 esc folds it back");
await levelKey("2");
await pg.dblclick('.u[data-u="S2.p1.1"] .body');
ok((await cls('.u[data-u="S2.p1.1"]')).includes(" opened "), "28 a double-click below Full opens it too");
await pg.click('.u[data-u="S2.p1.1"] .openedline button');
ok(!(await cls('.u[data-u="S2.p1.1"]')).includes(" opened "), "Fold back folds it back");
await levelKey("1");

// 29: a click selects
const pagesTop = () => pg.evaluate(() => document.getElementById("pages").scrollTop);
await pg.evaluate(() => { document.getElementById("pages").scrollTop = 0; });
await pg.click('.u[data-u="S2.p1.1"] .body', { position: { x: 30, y: 10 } });
await wait(700);
const selBg = await pg.$eval('.u[data-u="S2.p1.1"] .ubox', (e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).borderLeftStyle, getComputedStyle(e).borderLeftWidth].join());
ok((await cls('.u[data-u="S2.p1.1"]')).includes(" sel ") && /^rgb\(232, 240, 254\),solid,3px$/.test(selBg), "29 a click tints the paragraph and adds the solid bar: " + selBg);
const boxSel = await pg.$eval('.bx[data-u="S2.p1.1"]', (e) => [e.classList.contains("sel"), getComputedStyle(e).outlineStyle].join());
ok(boxSel === "true,solid", "29 its PDF box is outlined solid");
const bt = await pg.evaluate(() => { const p = document.getElementById("pages").getBoundingClientRect(), r = document.querySelector('.bx[data-u="S2.p1.1"]').getBoundingClientRect(); return (r.top - p.top) / p.height; });
ok((await pagesTop()) > 0 && Math.abs(bt - 0.18) < 0.03, "29 the PDF scrolled, the box at 18% of the pane: " + bt.toFixed(3));
ok((await pg.textContent(".pbar .plabel")) === "p. 2 of 2", "the page label: p. 2 of 2");

// 30: follow
await wait(1000); // (follow paused 900 ms after a programmatic scroll)
const follow = await pg.evaluate(async () => {
  const text = document.getElementById("text"), row = document.querySelector('.u[data-u="S1.p1.1"]')
  text.scrollTop = text.scrollTop + row.getBoundingClientRect().top - text.getBoundingClientRect().top - text.clientHeight * 0.3 + 8
  await new Promise((r) => setTimeout(r, 400))
  const line = text.getBoundingClientRect().top + text.clientHeight * 0.3
  const at = [...document.querySelectorAll(".u")].find((u) => { const r = u.getBoundingClientRect(); return r.top <= line && r.bottom > line })
  return { at: at && at.getAttribute("data-u"), fol: [...document.querySelectorAll(".u.fol")].map((u) => u.getAttribute("data-u")),
    box: [...document.querySelectorAll(".bx.fol")].map((b) => b.getAttribute("data-u") + ":" + getComputedStyle(b).outlineStyle),
    tick: getComputedStyle(document.querySelector('.u[data-u="S1.p1.1"] .ubox'), "::before").borderLeftStyle,
    sel: [...document.querySelectorAll(".bx.sel")].map((b) => b.getAttribute("data-u") + ":" + getComputedStyle(b).outlineStyle) }
});
ok(follow.at === "S1.p1.1" && follow.fol.join() === "S1.p1.1" && follow.box.length && follow.box.every((x) => x === "S1.p1.1:dashed") && follow.tick === "dashed", "30 scrolling moves the dashed box and the tick to the paragraph at 30%: " + JSON.stringify(follow));
ok(follow.sel.length && follow.sel.every((x) => x === "S2.p1.1:solid") && (await cls('.u[data-u="S2.p1.1"]')).includes(" sel "), "30 the solid one stays on the selection" + JSON.stringify(follow.sel) + (await cls('.u[data-u="S2.p1.1"]')));

// 31: a box selects its paragraph
await pg.evaluate(() => { document.getElementById("text").scrollTop = 0; });
await pg.click('.bx[data-u="S2.SS1.p1.1"]');
await wait(900);
const at31 = await pg.evaluate(() => document.querySelector('.u[data-u="S2.SS1.p1.1"]').getBoundingClientRect().top - document.getElementById("text").getBoundingClientRect().top);
ok((await cls('.u[data-u="S2.SS1.p1.1"]')).includes(" sel ") && Math.abs(at31 - 110) <= 2, "31 a unit box selects its paragraph and scrolls the text to it: " + Math.round(at31) + " px");
ok((await attr('.bx[data-u="S2.SS1.p1.1"]', "aria-label")) === "Go to this paragraph: Twelve readers found the main claim", "a box's name: its first six words");

// 32: the selection bar, Highlight
await pg.evaluate(() => { document.getElementById("text").scrollTop = 0; });
await selectPieces("abstract1.1:24", "abstract1.1:25");
await wait(50);
ok(await pg.isVisible(".selbar"), "32 a selection shows the bar");
ok((await pg.$$eval(".selbar button", (l) => l.map((x) => x.getAttribute("aria-label")).join("|"))) === "Highlight · h|Note · n|Ask · c" && (await attr(".selbar", "role")) === "toolbar", "32 three labelled buttons in a toolbar");
await pg.click(".selbar button >> nth=0");
ok((await hlIds("abstract1.1")).join() === "abstract1.1:24,abstract1.1:25", "32 Highlight adds .hl to its pieces");
await wait(450);
m = await sent();
const posted = m.filter((x) => x.type === "marks").pop();
ok(posted && posted.marks.marks.length === 1 && posted.marks.marks[0].kind === "highlight" && posted.marks.marks[0].from === 24 && posted.marks.marks[0].to === 25, "32 and posts marks (400 ms later)");
ok((await pg.textContent(".ft")).includes("Highlighted"), "the flash says Highlighted");
for (const k of ["2", "3", "4"]) {
  await levelKey(k);
  ok((await hlIds("abstract1.1")).join() === "abstract1.1:24,abstract1.1:25", `32 at ${say[k].name} the same ids are highlighted`);
}
await levelKey("5");
ok((await pg.$$eval('.chip .pc.hl', (l) => l.map((x) => x.getAttribute("data-id")).join())) === "abstract1.1:24,abstract1.1:25", "32 and on the Topic chip");
await levelKey("1");
const hlStyle = await pg.$eval('[data-id="abstract1.1:24"]', (e) => getComputedStyle(e).backgroundColor + "," + getComputedStyle(e).boxShadow);
ok(hlStyle.startsWith("rgb(255, 241, 184)") && hlStyle.includes("inset"), "a highlight is a fill plus an underline: " + hlStyle);
// the same selection again: pressed, and h removes it
await selectPieces("abstract1.1:24", "abstract1.1:25");
await wait(50);
ok((await attr(".selbar button >> nth=0", "aria-pressed")) === "true" && (await attr(".selbar button >> nth=0", "aria-label")) === "Remove the highlight · h", "a highlighted selection: Highlight is pressed");
await pg.keyboard.press("h");
ok((await hlIds("abstract1.1")).length === 0 && (await pg.textContent(".ft")).includes("Highlight removed"), "h removes it");
// AI words without m: no highlight
await levelKey("3");
await selectPieces("abstract1.1:k10", "abstract1.1:k12");
await wait(50);
ok(await pg.isDisabled(".selbar button >> nth=0"), "Highlight is disabled on the AI's words alone");
await pg.keyboard.press("Escape");
ok(await pg.isHidden(".selbar"), "esc hides the bar");
await levelKey("1");

// 33: Note and Ask
await pg.click("#bMargin");
ok((await attr("#bMargin", "aria-pressed")) === "false", "the margin hidden");
await selectPieces("S2.p1.1:3", "S2.p1.1:5");
await wait(50);
await pg.click(".selbar button >> nth=1");
const card = '.u[data-u="S2.p1.1"] aside .card';
ok((await attr("#bMargin", "aria-pressed")) === "true" && (await pg.locator(card).count()) === 1, "33 Note opens the margin and adds a card");
ok((await pg.textContent(card + " .quote")) === "“folded into five”", "33 the card has the quote: " + (await pg.textContent(card + " .quote")));
ok((await pg.evaluate(() => document.activeElement.closest(".card") && document.activeElement.tagName)) === "TEXTAREA" && (await attr(card + " textarea", "placeholder")) === "Your note…", "33 its box is focused");
ok((await pg.textContent(".ft")).includes("Note added: type it in the margin"), "the flash says Note added");
await pg.keyboard.type("Check the sample size");
await pg.focus("#text");
await selectPieces("S1.p1.1:3", "S1.p1.1:5");
await wait(50);
await pg.keyboard.press("c");
const askCard = '.u[data-u="S1.p1.1"] aside .card';
ok((await pg.locator(askCard).count()) === 1 && (await pg.textContent(askCard + " .later")) === "Kept here: asking the chat from the reader comes in a later version" && (await attr(askCard + " textarea", "placeholder")) === "Ask about this passage…", "33 Ask adds an Ask card with the later-version line");
ok((await pg.textContent(".ft")).includes("Question kept in the margin"), "the flash says Question kept in the margin");

// 34: removing a card with text
await pg.click(card + " .x");
ok((await pg.textContent(card + " .ask span")) === "Delete this note?", "34 removing a card with text asks Delete this note?");
await pg.click(card + ' .ask button:has-text("Keep it")');
ok((await pg.locator(card).count()) === 1 && (await pg.locator(card + " .ask").count()) === 0, "34 Keep it keeps it");
await pg.click(card + " .x");
await pg.click(card + ' .ask button:has-text("Delete it")');
ok((await pg.locator(card).count()) === 0, "34 Delete it removes it");
await pg.click(askCard + " .x");
ok((await pg.locator(askCard).count()) === 0, "an empty card goes at once");
await wait(450);
m = await sent();
ok(m.filter((x) => x.type === "marks").pop().marks.marks.length === 0, "the store posted, empty");

// 35: the role filter
await pg.click('.roles [data-role="method"]');
await wait(100);
const stubs = await pg.$$eval(".stub", (l) => l.map((x) => x.children[1].textContent));
ok((await attr('.roles [data-role="method"]', "aria-pressed")) === "true" && (await pg.locator(".u:not(.stub)").count()) === 1 && stubs.length >= 3 && stubs.includes("2 paragraphs not shown: gap, context"), "35 the role filter leaves method, stubs naming the roles: " + stubs.join(" | "));
await pg.click('.stub button:has-text("Show them")');
await wait(100);
ok((await pg.locator(".stub").count()) === 0 && (await pg.locator(".u").count()) === 8 && (await attr('.roles [data-role="method"]', "aria-pressed")) === "false", "35 Show them clears it");

// 37: swap and dividers
const x = (sel) => pg.$eval(sel, (e) => e.getBoundingClientRect().left);
const pdfW = () => pg.$eval("#pdf", (e) => Math.round(e.getBoundingClientRect().width));
await pg.click("#bSwap");
ok((await x("#pdf")) < (await x("#text")) && (await attr("#bSwap", "aria-label")) === "Move the PDF to the right", "37 swap moves the PDF left");
await pg.click("#bSwap");
ok((await x("#pdf")) > (await x("#text")), "37 and back");
const g = await pg.locator("#grip").boundingBox();
await pg.mouse.move(g.x + g.width / 2, g.y + 100);
await pg.mouse.down();
await pg.mouse.move(g.x + g.width / 2 - 100, g.y + 100, { steps: 5 });
await pg.mouse.up();
ok((await pdfW()) === 570, "37 the PDF divider drags: " + (await pdfW()));
await pg.focus("#grip");
await pg.keyboard.press("ArrowLeft");
ok((await pdfW()) === 590, "37 ← widens it 20 px");
await pg.keyboard.press("Shift+ArrowRight");
ok((await pdfW()) === 510, "37 ⇧→ narrows it 80 px");
for (let i = 0; i < 12; i++) await pg.keyboard.press("Shift+ArrowLeft");
ok((await pdfW()) === 760, "37 at most 760");
for (let i = 0; i < 12; i++) await pg.keyboard.press("Shift+ArrowRight");
ok((await pdfW()) === 300, "37 at least 300");
await pg.dblclick("#grip");
ok((await pdfW()) === 470, "37 a double-click resets it to 470");
m = await sent();
ok(m.some((y) => y.type === "prefs" && y.pdfWidth === 470) && m.some((y) => y.type === "prefs" && y.pdfLeft === true), "the widths and sides go to prefs");
const asideW = () => pg.$eval('.u[data-u="S1.p1.1"] aside', (e) => Math.round(e.getBoundingClientRect().width));
await pg.focus(".mgrip");
await pg.keyboard.press("ArrowLeft");
ok((await asideW()) === 240, "37 the margin's divider: ← widens it");
for (let i = 0; i < 6; i++) await pg.keyboard.press("Shift+ArrowLeft");
ok((await asideW()) === 420, "37 at most 420");
for (let i = 0; i < 6; i++) await pg.keyboard.press("Shift+ArrowRight");
ok((await asideW()) === 160, "37 at least 160");
const mg = await pg.locator(".mgrip").boundingBox();
await pg.mouse.move(mg.x + mg.width / 2, mg.y + 40);
await pg.mouse.down();
await pg.mouse.move(mg.x + mg.width / 2 - 60, mg.y + 40, { steps: 4 });
await pg.mouse.up();
ok((await asideW()) === 220, "37 and drags: " + (await asideW()));
await pg.dblclick(".mgrip");
ok((await asideW()) === 220, "37 a double-click resets it");

// 38: ⌘ scroll
const wheel = (sel, dy) => pg.evaluate(([s, d]) => { const e = new WheelEvent("wheel", { deltaY: d, metaKey: true, bubbles: true, cancelable: true }); document.querySelector(s).dispatchEvent(e); return e.defaultPrevented; }, [sel, dy]);
ok((await wheel("#pages", -100)) && (await pg.textContent(".pbar .zlabel")) === "125%", "38 ⌘ scroll over the PDF zooms it, the event cancelled");
ok((await attr('.pbar [aria-label="Fit the page width"]', "aria-pressed")) === "false", "Fit unpressed");
await pg.focus("#pages");
await pg.keyboard.press("0");
ok((await pg.textContent(".pbar .zlabel")) === "Fit", "0 fits it again");
const imgW = await pg.$eval(".page img", (e) => new URL(e.src).protocol);
ok(imgW === "data:", "the page images come from the urlPattern");
ok((await wheel("#text", 80)) && (await attr('[data-level="brief"]', "aria-pressed")) === "true", "38 over the text it changes the level");
await levelKey("1");

// 41: coverage
ok((await pg.textContent(".pbar .cover")) === "6 of 8 linked" && !(await cls(".pbar .cover")).includes(" warn "), "6 of 8: no warning");
const gw = F.fakeWords(doc, { garbleAll: true });
await load(full);
await words(gw);
ok((await pg.textContent(".pbar .cover")) === "⚠︎ Linked 2 of 8 paragraphs (25%): this PDF may not be the text TextFold folded" && (await cls(".pbar .cover")).includes(" warn "), "41 the garbled words: the coverage warning with ⚠");
await load(full);
await words({ pages: [{ n: 1, words: [] }, { n: 2, words: [] }], sizes: fw.sizes });
ok((await pg.textContent(".pbar .cover")) === "This PDF has no text layer (a scan): the panes can't be linked, but you can read both", "no-text: the scan's line");
await load(payload(doc, fw, { pdf: { problem: "missing" } }));
ok((await pg.textContent("#pdf .pmsg")) === "The PDF file is missing from disk", "missing: its line");
await load(payload(doc, fw, { pdf: { problem: "unreadable", detail: "it is encrypted" } }));
ok((await pg.textContent("#pdf .pmsg")) === "Couldn't open the PDF: it is encrypted", "unreadable: its line");
await load(payload(doc, null));
ok((await pg.isDisabled("#bPdf")) && (await attr("#bPdf", "title")) === "This paper has no PDF attached: the text reads on its own" && (await pg.isHidden("#pdf")), "no PDF: the button disabled, its tooltip says so");
// a cached link map: no words needed
const lm = C.linkMap(C.model(doc), fw.pages, fw.sizes);
await load(payload(doc, fw, { links: C.linksFile(C.model(doc), lm, { bytes: 12345, modified: "2026-11-01T10:00:00Z", pages: 2 }) }));
ok((await pg.locator(".bx").count()) > 0 && (await pg.textContent(".pbar .cover")) === "6 of 8 linked", "a valid cached link map draws the boxes at once");

// 40: every state
const STATES = [
  ["loading", "Opening the paper…", "", null],
  ["no-textfold", "TextFold isn't running", "The reader shows the levels TextFold writes. Start TextFold on this Mac, then try again.", ["Try again", "retry"]],
  ["zotero-off", "TextFold can't reach Zotero", "Start Zotero, and in Zotero turn on Settings › Advanced › Allow other applications on this computer to communicate with Zotero.", ["Try again", "retry"]],
  ["not-folded", "TextFold hasn't folded this paper yet", "Folding reads the paper and asks TextFold's model to write its levels. It uses TextFold's model and can take a few minutes.", ["Fold it with TextFold", "fold"]],
  [{ kind: "folding", stage: "levels", done: 3, total: 12 }, "TextFold is folding this paper", "Levels: 3 of 12. You can read the PDF meanwhile.", null],
  [{ kind: "folding", status: "queued" }, "TextFold is folding this paper", "Waiting for TextFold's other work.", null],
  ["needs-engine", "This PDF is a scan", "TextFold needs its PDF engine to read it: install the engine in TextFold's Settings, then fold again.", ["Fold it with TextFold", "fold"]],
  ["no-model", "TextFold has no model", "Choose a model in TextFold's Settings, then fold again.", ["Fold it with TextFold", "fold"]],
  ["no-file", "TextFold found nothing to read", "This paper has no PDF TextFold can read and no text online.", null],
  [{ kind: "fold-failed", error: "x".repeat(400) }, "TextFold couldn't fold this paper", "x".repeat(300), ["Try again", "fold"]],
  ["group-library", "Your own library's papers only, for now", "Papers in group libraries come in a later version.", null],
  [{ kind: "bad-format", format: "textfold/doc", version: 1 }, "This TextFold is newer than the reader", "It writes format textfold/doc version 1: update the Zotero Launcher to read it.", null]
];
await load(payload(null, fw, { state: { kind: "loading" } }));
for (const [s, title, sentence, button] of STATES) {
  const st = typeof s === "string" ? { kind: s } : s;
  await pg.evaluate((x) => FR.state(x), st);
  const got = await pg.evaluate(() => { const p = document.querySelector(".state"); return { hidden: p.hidden, h: p.querySelector("h2") && p.querySelector("h2").textContent, p: p.querySelector("p") ? p.querySelector("p").textContent : "", b: [...p.querySelectorAll("button")].map((x) => x.textContent + "/" + x.getAttribute("data-act")) }; });
  let pressed = true;
  if (button) {
    await sent();
    await pg.click(".state button.act");
    pressed = (await sent()).some((x) => x.type === button[1]);
  }
  ok(!got.hidden && got.h === title && got.p === sentence && got.b.join() === (button ? button.join("/") : "") && pressed, `40 ${st.kind}${st.status ? " (queued)" : ""}: its title, sentence${button ? ", and " + button[0] + " posting " + button[1] : ""}`);
}
ok(await pg.isVisible("#pdf"), "40 the PDF pane shows the PDF meanwhile");
// the banners: a cached doc while TextFold is away, and local levels
await load(payload(doc, fw, { state: { kind: "no-textfold" }, saved: "2026-11-01T09:30:00Z" }));
ok((await pg.textContent('.banner[data-state="no-textfold"] span')) === "TextFold isn't running: these are the levels saved on 1 November 2026." && (await attr('.banner[data-state="no-textfold"] button', "data-act")) === "retry", "40 no TextFold with a cached doc: the banner and Try again");
const local = F.doc();
local.provenance.local = true;
await load(payload(local, fw));
ok((await pg.textContent('.banner[data-state="local-only"] span')) === "No model has written these levels yet: Key, Takeaway and Topic show the paper's first sentences." && (await attr('.banner[data-state="local-only"] button', "data-act")) === "fold", "40 local levels: the banner and Fold it with TextFold");
ok((await attr(".cap.ai", "title")) === "Not written by a model yet: the paper's first sentences", "the AI caption says it's local");
await load(full);
await words(fw);
ok((await attr(".cap.ai", "title")) === "Written by AI (fixture/model, 1 November 2026)", "the AI caption names the model and the date");

// keys panel, j/k, Enter
await pg.focus("#text");
await pg.keyboard.press("?");
ok((await pg.isVisible(".keys")) && (await pg.$$eval(".keys tr", (l) => l[l.length - 1].textContent)) === "⌘Wclose", "? shows the keys, ending with ⌘W close");
await pg.keyboard.press("Escape");
ok(await pg.isHidden(".keys"), "esc hides them");
await pg.keyboard.press("j");
await pg.keyboard.press("j");
ok((await cls('.u[data-u="S1.p1.1"]')).includes(" sel "), "j j selects the second paragraph");
await levelKey("2");
await pg.keyboard.press("j");
await pg.keyboard.press("Enter");
ok((await cls('.u[data-u="S1.p1.1"]')).includes(" opened ") || (await cls('.u[data-u="S1.p2.1"]')).includes(" opened "), "↵ opens the selected paragraph in place");
await levelKey("1");

// 43: names and Tab order
const unnamed = await pg.$$eval("button, [role=button]", (l) => l.filter((x) => x.offsetParent !== null && !(x.getAttribute("aria-label") || x.textContent).trim()).map((x) => x.outerHTML.slice(0, 80)));
ok(unnamed.length === 0, "43 every button and pill has an accessible name" + (unnamed.length ? ": " + unnamed.join(" ") : ""));
// (Tab from a sentinel before the page, until focus leaves the page)
await pg.evaluate(() => { const s = document.createElement("button"); s.id = "sentinel"; s.textContent = "start"; document.body.insertBefore(s, document.body.firstChild); s.focus(); });
const seen = [], reached = new Set();
for (let i = 0; i < 400; i++) {
  await pg.keyboard.press("Tab");
  const r = await pg.evaluate(() => {
    const e = document.activeElement
    if (!e || e === document.body || e.id === "sentinel") return null
    const reg = e.closest(".hd") ? 0 : e.closest(".tools") ? 1 : e.closest("#text") ? 2 : e.id === "grip" ? 3 : e.closest("#pdf") ? 4 : e.closest(".ft") ? 5 : -1
    if (!e.dataset.tabSeen) e.dataset.tabSeen = String(Math.random())
    const cs = getComputedStyle(e)
    return { reg, id: e.dataset.tabSeen, ring: cs.outlineStyle + " " + cs.outlineWidth, what: e.tagName + "." + e.className + (e.id ? "#" + e.id : "") }
  });
  if (!r || reached.has(r.id)) break;
  reached.add(r.id);
  seen.push(r);
}
await pg.evaluate(() => document.getElementById("sentinel").remove());
const regs = seen.map((r) => r.reg);
ok(regs.length > 20 && regs.every((r, i) => r >= 0 && (i === 0 || r >= regs[i - 1])), "43 Tab goes header, toolbar, text (with its margin), the divider, the PDF, in order: " + [...new Set(regs)].join(","));
const tabbable = await pg.$$eval("button:not([disabled]), [tabindex]:not([tabindex='-1']), textarea", (l) => l.filter((x) => x.offsetParent !== null && x.tabIndex >= 0 && !x.closest("[hidden]") && x.id !== "sentinel").length);
ok(reached.size === tabbable, `43 Tab reaches every control: ${reached.size} of ${tabbable}`);
const noRing = seen.filter((r) => r.ring !== "solid 2px").map((r) => r.what + " " + r.ring);
ok(noRing.length === 0, "every control shows the 2 px ring on focus" + (noRing.length ? ": " + [...new Set(noRing)].join(", ") : ""));

// 26: the morph in the band, none with reduced motion (the large document, scrolled to its middle)
const big = F.bigDoc(), bw = F.fakeWords(big, { skip: [], garble: [] }), bigLoad = payload(big, bw);
await load(bigLoad);
await words(bw);
await pg.evaluate(() => { const t = document.getElementById("text"); t.scrollTop = t.scrollHeight / 2; });
await wait(300);
for (const k of ["2", "3"]) {
  await pg.keyboard.press(k);
  const an = await pg.evaluate(() => {
    const t = document.getElementById("text").getBoundingClientRect(), list = document.getAnimations()
    const pieces = list.filter((a) => a.effect && a.effect.target && a.effect.target.hasAttribute("data-id"))
    const out = pieces.filter((a) => { const r = a.effect.target.getBoundingClientRect(); return r.bottom < t.top - 300 || r.top > t.bottom + 300 }).length
    return { all: list.length, pieces: pieces.length, out }
  });
  ok(an.pieces > 50 && an.pieces <= 1500 && an.out === 0 && an.all === an.pieces, `26 key ${k}: ${an.pieces} pieces animate, all within 300 px of the viewport`);
  await levelKey("1"); await wait(700);
}
await pg.emulateMedia({ reducedMotion: "reduce" });
await pg.keyboard.press("3");
ok((await pg.evaluate(() => document.getAnimations().length)) === 0, "26 with reduced motion nothing animates");
await levelKey("1");
await pg.emulateMedia({ reducedMotion: "no-preference" });

// 44: budgets (the large document, median of 5)
await budgets(bigLoad, bw, true);

// narrow, 42
await pg.setViewportSize({ width: 760, height: 480 });
ok(!(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "no page-wide horizontal scroll at 760 × 480");
const at = process.argv.indexOf("--shot");
if (at > 0) { await pg.setViewportSize({ width: 1360, height: 820 }); await load(full); await words(fw); await wait(300); await pg.screenshot({ path: process.argv[at + 1] }); }
ok(requests.length === 0, "42 no request leaves the page" + (requests.length ? ": " + requests.slice(0, 3).join(" ") : ""));
ok(errors.length === 0, "42 no console errors" + (errors.length ? ": " + errors.join("; ") : ""));
console.log(`fold-reader-check: ${oks} ok${process.exitCode ? ", some failed" : ""}`);
await b.close();

async function budgets(o, w, assert) {
  const loads = [], firsts = [], settles = [], counts = [];
  for (let i = 0; i < 5; i++) {
    const t = await pg.evaluate((x) => new Promise((r) => {
      performance.clearMarks()
      const t0 = performance.now()
      FR.load(x)
      requestAnimationFrame(() => setTimeout(() => { const p = performance.getEntriesByName("fr:painted")[0]; r(p ? p.startTime - t0 : 1e9) }, 0))
    }), o);
    loads.push(t);
  }
  await words(w);
  await pg.evaluate(() => { const t = document.getElementById("text"); t.scrollTop = t.scrollHeight / 3; });
  await wait(300);
  const keys = ["2", "3", "2", "1", "2"];
  for (const k of keys) {
    await pg.evaluate(() => { performance.clearMarks(); window.__kd = 0; document.addEventListener("keydown", () => { window.__kd = performance.now() }, { capture: true, once: true }) });
    await pg.keyboard.press(k);
    const r = await pg.evaluate(() => new Promise((res) => {
      const t = () => { const s = performance.getEntriesByName("fr:settled")[0]; if (!s) return setTimeout(t, 5); const a = performance.getEntriesByName("fr:animate")[0]; res({ first: a.startTime - window.__kd, settled: s.startTime - window.__kd, n: document.getAnimations().length }) }
      t()
    }));
    firsts.push(r.first); settles.push(r.settled); counts.push(r.n);
    await wait(650);
  }
  const f = (a) => median(a).toFixed(1) + " ms";
  if (!assert) { console.log(`budgets: load to painted ${f(loads)}, keydown to animate ${f(firsts)}, to settled ${f(settles)}, at most ${Math.max(...counts)} pieces animated`); return; }
  ok(median(loads) < 300, "44 FR.load to the first screen painted: " + f(loads) + " (300)");
  ok(median(firsts) < 100, "44 keydown to the first animate(): " + f(firsts) + " (100)");
  ok(median(settles) < 1000, "44 keydown to every unit drawn: " + f(settles) + " (1000)");
  ok(Math.max(...counts) <= 1500, "44 at most 1500 pieces animated: " + Math.max(...counts));
}

// Real data kept outside the repository (FIXTURE.md section 5): coverage and budgets, printed.
async function realData() {
  let d;
  if (arg("--doc")) d = JSON.parse(readFileSync(arg("--doc"), "utf8"));
  else d = galleryDoc(readFileSync(arg("--gallery"), "utf8"));
  const mod = C.model(d);
  if (mod.problem) { console.log("the doc is refused: " + JSON.stringify(mod.problem)); process.exitCode = 1; return; }
  let w = null;
  if (arg("--bbox")) w = bboxWords(readFileSync(arg("--bbox"), "utf8"));
  const o = payload(d, w);
  await load(o);
  if (w) {
    await words(w);
    const r = C.linkMap(mod, w.pages, w.sizes);
    console.log(C.coverageText(r.coverage) + ` (${mod.order.length} units, ${w.pages.length} pages)`);
  }
  await budgets(o, w || { pages: [], sizes: [] }, false);
  console.log(errors.length ? "errors: " + errors.join("; ") : "no console errors");
}
// A TextFold gallery page's paper-data, as a doc (fold.py's rules): sentences from the tokens (atoms as their text,
// math as $alt$), key the brief's text, takeaway its first tn tokens, topic the topic tokens, evidence ev, role lad.role.
function galleryDoc(html) {
  const raw = /<script[^>]*id="paper-data"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  const p = JSON.parse(raw ? raw[1] : html);
  const atoms = p.atoms || {};
  const tok = (t) => { const a = t.a && atoms[t.a]; return a ? (a.kind === "math" ? "$" + (a.alt || a.text || "") + "$" : a.text || "") : t.t || ""; };
  const text = (toks) => (toks || []).map((t) => tok(t) + (t.s ? " " : "")).join("").replace(/\s+/g, " ").trim();
  const kinds = { para: "paragraph", item: "list item", caption: "caption", abstract: "abstract" };
  const unitsOf = (c) => (c.units || []).map((u) => (typeof u === "string" ? Object.assign({ id: u }, p.units[u]) : u));
  const sections = p.chunks.map((c) => {
    const lad = c.lad || {}, take = lad.take ? text(lad.take) : c.take || "";
    const topic = lad.take && Array.isArray(lad.topic) ? text(lad.take.slice(lad.topic[0], lad.topic[1] + 1)) : c.topic || "";
    return { id: c.id, num: c.num || "", title: c.title || "", depth: Math.max(1, (c.level || c.depth + 1 || 2) - 1), takeaway: take, topic,
      units: unitsOf(c).filter((u) => Array.isArray(u.toks) && Array.isArray(u.sents)).map((u) => {
        const l = u.lad || u, brief = l.brief || [];
        return { id: u.id, kind: kinds[u.role] || kinds[u.kind] || "paragraph", role: l.role || "context",
          sentences: u.sents.map(([a0, z]) => text(u.toks.slice(a0, z))), evidence: l.ev || [], key: text(brief),
          takeaway: text(brief.slice(0, l.tn || brief.length)), topic: text(l.topic || []) };
      }) };
  });
  const meta = p.meta || {};
  return { format: "textfold/doc", version: 0, id: "pdf-" + String(meta.id || "gallery0001").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40), lang: "en",
    title: meta.title || "", authors: meta.authors || [], date: String(meta.date || "").replace(/\//g, "-"),
    source: { kind: "pdf", url: "", label: "", snapshot: "", license: "" }, levels: ["topic", "takeaway", "key", "brief", "full"], written: ["topic", "takeaway", "key"],
    provenance: { made_with: "TextFold", exported: "", ai_generated: true, model: "", levels_made: "", local: false }, sections,
    links: (p.edges || p.links || []).filter((l) => l.tk !== "chunk").map((l) => ({ from: l.f, to: l.t, rel: l.rel })) };
}
// pdftotext -bbox-layout's output as the words payload: each word's box over its page's width and height.
function bboxWords(html) {
  const pages = [], sizes = [];
  const re = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g;
  let pm;
  while ((pm = re.exec(html))) {
    const W = Number(pm[1]), H = Number(pm[2]), ws = [];
    const wr = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g;
    let w;
    while ((w = wr.exec(pm[3]))) {
      const t = w[5].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      ws.push([t, Number(w[1]) / W, Number(w[2]) / H, Number(w[3]) / W, Number(w[4]) / H]);
    }
    pages.push({ n: pages.length + 1, words: ws });
    sizes.push([W, H]);
  }
  return { pages, sizes, done: true };
}
