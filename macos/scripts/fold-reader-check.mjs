// The fold reader's page, driven headless (docs/fold-reader/SPEC.md criteria 24 to 44, R5-SPEC.md R5-27 to R5-34, and the page budgets of section 11):
// the page as FoldWebView builds it (the CSS, then FoldCore.js, FoldView.js and FoldBridge.js as one script allowed by
// its hash), loaded with the synthetic fixture (FIXTURE.md), then clicked, typed and scrolled at.
// A developer's check where Playwright is installed (not CI's):
//   node macos/scripts/fold-reader-check.mjs [--shot out.png]
//   node macos/scripts/fold-reader-check.mjs --doc <doc.json> | --gallery <page.html> [--bbox <pdftotext -bbox-layout output>]
// With --doc or --gallery (real data kept outside the repository, FIXTURE.md section 5) it prints the coverage and the
// budgets instead of the fixture's assertions.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
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
// What is painted, not only the classes: a screenshot of a few pixels (Playwright's PNG, 8-bit RGB or RGBA) read back.
function pngPixels(buf) {
  let at = 8, w = 0, h = 0, type = 0;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at), kind = buf.toString("ascii", at + 4, at + 8), data = buf.subarray(at + 8, at + 8 + len);
    if (kind === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9]; }
    if (kind === "IDAT") idat.push(data);
    at += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      out[y * stride + x] = (line[x] + pred) & 255;
    }
  }
  const px = [];
  for (let i = 0; i < out.length; i += bpp) px.push([out[i], out[i + 1], out[i + 2]]);
  return px;
}
// the pixels of a rectangle of the page (CSS px), as [r, g, b]s
const paint = async (r) => pngPixels(await pg.screenshot({ clip: { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.max(1, r.w), height: Math.max(1, r.h) } }));
const dark = (p) => p[0] + p[1] + p[2] < 200, bluish = (p) => p[2] > p[0] + 60;
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
const barAt = await pg.$eval('.u[data-u="S2.p1.1"] .ubox', (e) => { const r = e.getBoundingClientRect(), row = e.closest(".u").getBoundingClientRect(); return { x: Math.ceil(r.left), y: r.top + 10, w: 2, h: Math.min(12, r.height - 20), inside: r.left >= row.left }; });
const barPx = await paint(barAt);
ok(barAt.inside && barPx.length && barPx.every(dark), "29 the solid bar is painted (its pixels are the ink), inside its row");
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
const tickAt = await pg.$eval('.u[data-u="S1.p1.1"] .ubox', (e) => {
  const r = e.getBoundingClientRect(), row = e.closest(".u").getBoundingClientRect(), b = getComputedStyle(e, "::before"), x = r.left + parseFloat(getComputedStyle(e).borderLeftWidth) + parseFloat(b.left)
  return { x: Math.ceil(x), y: r.top + 6, w: 1, h: Math.min(30, r.height - 12), inside: x >= row.left }
});
const tickPx = await paint(tickAt);
ok(tickAt.inside && tickPx.filter(bluish).length >= 4 && tickPx.some((p) => !bluish(p)), "30 the dashed tick is painted (accent dashes and gaps), inside its row");
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
ok((await pdfW()) > 760, "37 past 760: no fixed cap, " + (await pdfW()));
const roomW = await pg.$eval(".panes", (e) => e.clientWidth);
for (let i = 0; i < 12; i++) await pg.keyboard.press("Shift+ArrowLeft");
ok((await pdfW()) === roomW - 7 - 110 - 420, "37 at most what leaves the text 420 px: " + (await pdfW()) + " of " + roomW);
ok(await pg.$eval("#text", (e) => e.getBoundingClientRect().width >= 530), "37 the text keeps its 420 px of words beside the widest PDF");
for (let i = 0; i < 12; i++) await pg.keyboard.press("Shift+ArrowRight");
ok((await pdfW()) === 300, "37 at least 300");
await pg.dblclick("#grip");
ok((await pdfW()) === 470, "37 a double-click resets it to 470");
m = await sent();
ok(m.some((y) => y.type === "prefs" && y.pdfWidth === 470) && m.some((y) => y.type === "prefs" && y.pdfLeft === true), "the widths and sides go to prefs");
await pg.click("#bTextLarger");
await pg.click("#bTextSmaller");
m = await sent();
ok(m.some((y) => y.type === "zoom" && y.step === 1) && m.some((y) => y.type === "zoom" && y.step === -1), "the text size buttons ask the window's zoom a step up and down");
ok(await pg.$eval("#bTextLarger", (e) => e.getAttribute("aria-label") === "Text larger · ⌘+" && !!e.querySelector("svg.ic-textlarger")), "the text size buttons are icons with names");
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
ok((await pg.textContent(".pbar .cover")) === "⚠︎ Linked 2 of 8 paragraphs (25%): this PDF may not be the one these levels were made from" && (await cls(".pbar .cover")).includes(" warn "), "41 the garbled words: the coverage warning with ⚠");
await load(full);
await words({ pages: [{ n: 1, words: [] }, { n: 2, words: [] }], sizes: fw.sizes });
ok((await pg.textContent(".pbar .cover")) === "This PDF has no text layer (a scan): the panes can't be linked, but you can read both", "no-text: the scan's line");
await load(payload(doc, fw, { pdf: { problem: "missing" } }));
ok((await pg.textContent("#pdf .pmsg")) === "The PDF file is missing from disk", "missing: its line");
ok((await pg.$$eval(".pbar .zb, .pbar .zlabel", (l) => l.filter((x) => x.offsetParent !== null || x.textContent).length)) === 0, "no PDF to zoom: no zoom buttons and no Fit");
await load(payload(doc, fw, { pdf: { problem: "unreadable", detail: "it is encrypted" } }));
ok((await pg.textContent("#pdf .pmsg")) === "Couldn't open the PDF: it is encrypted", "unreadable: its line");
await load(payload(doc, null));
ok((await pg.isDisabled("#bPdf")) && (await attr("#bPdf", "title")) === "This paper has no PDF attached: the text reads on its own" && (await pg.isHidden("#pdf")), "no PDF: the button disabled, its tooltip says so");
// a cached link map: no words needed
const lm = C.linkMap(C.model(doc), fw.pages, fw.sizes);
await load(payload(doc, fw, { links: C.linksFile(C.model(doc), lm, { bytes: 12345, modified: "2026-11-01T10:00:00Z", pages: 2 }) }));
ok((await pg.locator(".bx").count()) > 0 && (await pg.textContent(".pbar .cover")) === "6 of 8 linked", "a valid cached link map draws the boxes at once");

// R5-27: every state of R5-SPEC 6.1, sent by FR.load (no doc yet); its buttons post retry
const MADE = require("../js/tests/fixtures/fold-reader/made.json");
const FM = require("../ZoteroLauncher/Reader/FoldMake.js");
const STATES = [
  ["loading", "Opening the paper…", "", null],
  [{ kind: "reading", done: 3, pages: 12 }, "Reading the PDF…", "3 of 12 pages.", null],
  ["no-pdf", "This paper has no PDF", "The reader folds a paper from its PDF: attach one in Zotero, then press ⌘R.", ["Try again", "retry"]],
  ["missing", "The PDF file is missing from disk", "Zotero lists it, but the file isn't there: sync or relink it in Zotero, then press ⌘R.", ["Try again", "retry"]],
  [{ kind: "unreadable", why: "It is encrypted with a password" }, "Couldn't open the PDF", "It is encrypted with a password", ["Try again", "retry"]],
  ["scan", "This PDF is a scan", "It has no text layer, so there are no words to fold. The PDF still shows.", null],
  [{ kind: "too-long", n: 6200 }, "This PDF is too long to fold", "It has 6200 paragraphs; the reader takes up to 5000.", null],
  ["group-library", "Your own library's papers only, for now", "Papers in group libraries come in a later version.", null]
];
const allText = [];
const SHARED_ICONS = await pg.evaluate(() => FoldView.SHARED);
const pageText = () => pg.evaluate(() => document.body.innerText + " " + [...document.querySelectorAll("[title],[aria-label]")].map((e) => (e.getAttribute("title") || "") + " " + (e.getAttribute("aria-label") || "")).join(" "));
for (const [s, title, sentence, button] of STATES) {
  const st = typeof s === "string" ? { kind: s } : s;
  await load(payload(null, fw, { state: st }));
  const got = await pg.evaluate(() => { const p = document.querySelector(".state"); return { hidden: p.hidden, h: p.querySelector("h2") && p.querySelector("h2").textContent, p: p.querySelector("p") ? p.querySelector("p").textContent : "", b: [...p.querySelectorAll("button")].map((x) => x.textContent + "/" + x.getAttribute("data-act")) }; });
  let pressed = true;
  if (button) {
    await sent();
    await pg.click(".state button.act");
    pressed = (await sent()).some((x) => x.type === button[1]);
  }
  allText.push(await pageText());
  ok(!got.hidden && got.h === title && got.p === sentence && got.b.join() === (button ? button.join("/") : "") && pressed, `R5-27 ${st.kind}: its title, sentence${button ? ", and " + button[0] + " posting " + button[1] : ""}`);
}
await load(payload(null, fw, { state: { kind: "scan" } }));
ok((await pg.isVisible("#bFold")) && (await pg.isDisabled("#bFold")) && (await attr("#bFold", "title")) === STATES[5][2], "R5-28 a scan: the Fold button disabled, its tooltip the state's sentence");
await load(payload(null, fw, { state: { kind: "reading", done: 1, pages: 2 } }));
ok(await pg.isVisible("#pdf"), "R5-27 the PDF pane shows the PDF meanwhile");

// R5-28: every fold kind of 6.2, sent by FR.fold, on the doc read from the synthetic paper (nothing folded)
const base = { kind: "unfolded", done: 0, total: 5, failed: [], error: "", model: "lab:m1", name: "Lab model", calls: 5, cached: 0, cost: "$0.12", disabled: "" };
const fk = (o) => Object.assign({}, base, o);
const left = JSON.stringify({ only: ["abstract", "S1", "S2", "S2.SS1", "A1"] });
const NAMED = "Fold with AI: Lab model writes Key, Takeaway and Topic (Settings › Defaults › Fold with AI changes the model and effort)";
const FOLDS = [
  [fk({ calls: null }), "Not folded yet", "Key, Takeaway and Topic show each paragraph's first sentence.", ["Fold with AI", "fold", "{}"], ["ai", "Fold with AI", NAMED, false]],
  [fk({}), "Not folded yet", "Key, Takeaway and Topic show each paragraph's first sentence. Fold with AI sends the paper's text to Lab model in 5 requests about $0.12 at its list price.", ["Fold with AI", "fold", "{}"], ["ai", "Fold with AI", NAMED, false]],
  [fk({ calls: 1, cached: 1, cost: "< $0.01" }), "Not folded yet", "Key, Takeaway and Topic show each paragraph's first sentence. Fold with AI sends the paper's text to Lab model in 1 request under $0.01 at its list price. 1 of them was answered before and costs nothing.", ["Fold with AI", "fold", "{}"], ["ai", "Fold with AI", NAMED, false]],
  [fk({ cost: "" }), "Not folded yet", "Key, Takeaway and Topic show each paragraph's first sentence. Fold with AI sends the paper's text to Lab model in 5 requests.", ["Fold with AI", "fold", "{}"], ["ai", "Fold with AI", NAMED, false]],
  [fk({ kind: "folding", done: 2 }), "Folding with AI", "2 of 5 sections, with Lab model. Each section shows its levels as it comes back.", ["Stop", "stop", "{}"], ["stop", "Stop folding", "Stop folding: what's done stays", false]],
  [fk({ kind: "stopped", done: 2 }), "Folding stopped", "2 of 5 sections are folded; the rest show first sentences. Finishing asks only for what's left.", ["Finish folding", "fold", left], ["ai", "Fold with AI", NAMED, false]],
  [fk({ kind: "partial", done: 3, failed: ["S2", "A1"], error: "the reply has no JSON." }), "2 sections weren't folded", "The reply has no JSON. They show first sentences.", ["Try them again", "fold", JSON.stringify({ only: ["S2", "A1"] })], ["ai", "Fold with AI", NAMED, false]],
  [fk({ kind: "partial", done: 4, failed: ["S2"], error: "it has no units" }), "1 section wasn't folded", "It has no units. It shows first sentences.", ["Try it again", "fold", JSON.stringify({ only: ["S2"] })], ["ai", "Fold with AI", NAMED, false]],
  [fk({ kind: "pdf-changed" }), "The PDF changed", "It was read again, so Key, Takeaway and Topic show first sentences until it's folded again.", ["Fold with AI", "fold", "{}"], ["ai", "Fold with AI", NAMED, false]],
  [fk({ kind: "no-ai", disabled: "no-ai", calls: null }), "No AI model is set up", "Folding needs one: Settings › Models & providers sets one up, Settings › Defaults › Fold with AI picks it.", null, ["ai", "Fold with AI", "Folding needs one: Settings › Models & providers sets one up, Settings › Defaults › Fold with AI picks it.", true]],
  [fk({ kind: "no-runner", disabled: "no-runner" }), "The AI features aren't installed", "Folding needs the AI features: Settings › Setup installs them.", null, ["ai", "Fold with AI", "Folding needs the AI features: Settings › Setup installs them.", true]],
  [fk({ kind: "old-runner", disabled: "old-runner" }), "The AI features are older than the app", "Settings › Setup › Install the AI features updates them.", null, ["ai", "Fold with AI", "Settings › Setup › Install the AI features updates them.", true]],
  [fk({ kind: "unfolded", disabled: "cjk" }), "Not folded yet", "Key, Takeaway and Topic show each paragraph's first sentence. Folding a paper in Chinese or Japanese comes in a later version.", null, ["ai", "Fold with AI", "Folding a paper in Chinese or Japanese comes in a later version", true]],
  [fk({ kind: "ai-key", error: "x".repeat(300) }), "The model's key was refused", "X" + "x".repeat(199) + ". Settings › Models & providers takes a new key.", ["Try again", "fold", "{}"], ["ai", "Fold with AI", NAMED, false]],
  [fk({ kind: "ai-key", done: 1, error: "the key was refused" }), "The model's key was refused", "The key was refused. Settings › Models & providers takes a new key.", ["Finish folding", "fold", left], ["ai", "Fold with AI", NAMED, false]],
  [fk({ kind: "ai-signin", error: "signed out" }), "Signed out of the model", "Signed out. Sign in again in Settings › Models & providers.", ["Try again", "fold", "{}"], ["ai", "Fold with AI", NAMED, false]],
  [fk({ kind: "ai-limit", error: "rate limited" }), "Rate limited or out of credit", "Rate limited. Wait a minute, or check your plan.", ["Try again", "fold", "{}"], ["ai", "Fold with AI", NAMED, false]],
  [fk({ kind: "ai-busy", error: "overloaded" }), "The model is overloaded", "Overloaded. Try again in a minute.", ["Try again", "fold", "{}"], ["ai", "Fold with AI", NAMED, false]],
  [fk({ kind: "ai-offline", error: "couldn't connect" }), "Couldn't reach the model", "Couldn't connect. Check the connection.", ["Try again", "fold", "{}"], ["ai", "Fold with AI", NAMED, false]],
  // (a Fold again that didn't finish: what it folded again, the others keep their levels, finishing folds again)
  [fk({ kind: "stopped", done: 1, again: true, left: ["S1", "S2", "S2.SS1", "A1"] }), "Folding stopped", "1 of 5 sections are folded again; the others keep their earlier levels. Finishing asks only for what's left.",
    ["Finish folding", "fold", JSON.stringify({ only: ["S1", "S2", "S2.SS1", "A1"], force: true })], ["ai", "Fold with AI", NAMED, false]],
  [fk({ kind: "partial", done: 4, again: true, failed: ["S2"], error: "the reply has no JSON" }), "1 section wasn't folded", "The reply has no JSON. It keeps its earlier levels.",
    ["Try it again", "fold", JSON.stringify({ only: ["S2"], force: true })], ["ai", "Fold with AI", NAMED, false]],
  [fk({ kind: "folded", done: 5 }), null, null, null, ["ai", "Fold again…", "Fold again: Lab model writes every section anew", false]]
];
const unf = MADE.doc;
await load(payload(unf, null, { fold: FOLDS[0][0] }));
for (const [f, title, sentence, btn, tool] of FOLDS) {
  if (!f.kind) f.kind = "unfolded";
  await pg.evaluate((x) => FR.fold(x), f);
  const got = await pg.evaluate(() => {
    const b = document.querySelector(".banners .banner");
    const a = b && b.querySelector("button");
    const fb = document.getElementById("bFold");
    return { state: b && b.getAttribute("data-state"), role: b && b.getAttribute("role"), t: b && b.querySelector("strong").textContent, s: b && b.querySelector("span").textContent,
      a: a ? [a.textContent, a.getAttribute("data-act"), a.getAttribute("data-payload")] : null, buttons: b ? b.querySelectorAll("button").length : 0,
      icon: fb.querySelector("svg path").getAttribute("d"), text: fb.querySelector(".lbl").textContent, tip: fb.title, dis: fb.disabled };
  });
  allText.push(await pageText());
  const label = f.kind + (f.disabled === "cjk" ? " (Chinese)" : "") + (f.calls === null ? " (before the plan)" : "") + (f.done && f.kind === "ai-key" ? " (some folded)" : "") + (f.failed.length === 1 ? " (one)" : "");
  const bannerOk = title === null ? got.state === null : got.state === f.kind && got.role === "note" && got.t === title && got.s === sentence && JSON.stringify(got.a) === JSON.stringify(btn) && got.buttons === (btn ? 1 : 0);
  const toolOk = got.icon === SHARED_ICONS[tool[0]] && got.text === tool[1] && got.tip === tool[2] && got.dis === tool[3];
  ok(bannerOk && toolOk, `R5-28 ${label}: the banner ${title ? "'" + title + "'" : "none"}, the Fold button '${tool[1]}'${tool[3] ? " disabled" : ""}`);
  if (!bannerOk || !toolOk) console.error(JSON.stringify(got));
}
// a banner's button posts its act and payload; the toolbar's button posts the same
await pg.evaluate((x) => FR.fold(x), fk({ kind: "partial", done: 3, failed: ["S2", "A1"], error: "no JSON" }));
await sent(); await pg.click(".banner button.act");
let got = await sent();
ok(got.length === 1 && got[0].type === "fold" && JSON.stringify(got[0].only) === '["S2","A1"]', "R5-28 Try them again posts fold with only the failed sections");
await pg.evaluate((x) => FR.fold(x), fk({ kind: "folding", done: 3 }));
ok((await pg.evaluate(() => document.activeElement && document.activeElement.id)) === "bFold", "R5-34 a banner's button drawn again as the fold goes: the focus on the Fold button");
await pg.evaluate((x) => FR.fold(x), fk({ kind: "folding", done: 1 }));
await pg.click("#bFold");
got = await sent();
ok(got.length === 1 && got[0].type === "stop", "R5-28 Stop folding posts stop");
await pg.evaluate((x) => FR.fold(x), fk({}));
await pg.click("#bFold");
got = await sent();
ok(got.length === 1 && got[0].type === "fold" && !got[0].force && !got[0].only, "R5-28 Fold with AI on a paper with nothing folded posts fold");
// one from FoldMake.foldView itself, the app's object
await pg.evaluate((x) => FR.fold(x), FM.foldView(unf, null, { model: "lab:m1", name: "Lab model", calls: 5, cached: 0, costUsd: 0.12 }, { runner: "ok" }));
ok((await pg.textContent(".banner span")) === FOLDS[1][2], "R5-28 FoldMake.foldView's object reads as the unfolded banner");

// R5-29: Fold again asks first
const allMade = ["abstract", "S1", "S2", "S2.SS1", "A1"].reduce((d, id) => FM.foldMerge(d, { type: "section", id, model: "lab:m1", section: { takeaway: "Section " + id + " folded", topic: "Section" },
  units: d.sections.find((s) => s.id === id).units.filter((u) => !FM.APPARATUS[u.kind]).map((u) => ({ id: u.id, role: "claim", evidence: [0], key: "A short claim. Its reason.", takeaway: "A short claim", topic: "claim" })) }, "2026-11-06T10:00:00Z"), unf);
const doneFold = fk({ kind: "folded", done: 5 });
await load(payload(allMade, null, { fold: doneFold }));
await sent();
await pg.click("#bFold");
got = await pg.evaluate(() => { const b = document.querySelector('.banner[data-state="fold-again"]'); return b && { t: b.querySelector("strong").textContent, s: b.querySelector("span").textContent, b: [...b.querySelectorAll("button")].map((x) => x.textContent), focus: document.activeElement && document.activeElement.textContent }; });
ok(!!got && got.t === "Fold the whole paper again?" && got.s === "Lab model writes every section anew in 5 requests about $0.12 at its list price; your highlights and notes stay on the paper's words." && got.b.join() === "Fold again,Keep these" && got.focus === "Keep these", "R5-29 Fold again: the confirm's title, sentence, buttons; Keep these has the focus");
allText.push(await pageText());
await pg.keyboard.press("Escape");
ok(!(await has('.banner[data-state="fold-again"]')) && (await sent()).length === 0, "R5-29 esc closes it, posting nothing");
await pg.click("#bFold");
await pg.click("#bKeep");
ok(!(await has('.banner[data-state="fold-again"]')) && (await sent()).length === 0, "R5-29 Keep these closes it, posting nothing");
await pg.click("#bFold");
await pg.click('.banner[data-state="fold-again"] button[data-act="fold"]');
got = await sent();
ok(got.length === 1 && got[0].type === "fold" && got[0].force === true && !(await has('.banner[data-state="fold-again"]')), "R5-29 Fold again posts fold with force: true");

// R5-30: the section lines and the fonts
const partFold = fk({ kind: "partial", done: 3, failed: ["S2"], error: "no JSON" });
const s1Only = FM.foldMerge(unf, { type: "section", id: "S1", model: "lab:m1", section: { takeaway: "Section S1 folded", topic: "Section" },
  units: ["S1.p1", "S1.p2"].map((id) => ({ id, role: "claim", evidence: [0], key: "A short claim. Its reason.", takeaway: "A short claim", topic: "claim" })) }, "2026-11-06T10:00:00Z");
await load(payload(unf, null, { fold: partFold }));
await pg.focus("#text");
await levelKey("3");
const lineOf = (id) => pg.evaluate((i) => { const t = document.querySelector('.sec[data-s="' + i + '"] + .stake'); return t ? { text: t.textContent, fs: t.classList.contains("fs"), shown: !t.hidden && t.offsetParent !== null, italic: getComputedStyle(t).fontStyle } : null; }, id);
const fontOf = (u) => pg.evaluate((i) => { const b = document.querySelector('.u[data-u="' + i + '"] .body'); return b ? [...b.classList].filter((c) => c === "paper" || c === "ui").join() + "/" + getComputedStyle(b).fontFamily : ""; }, u);
const serif = (await fontOf("S1.p1"));
let l1 = await lineOf("S1"), l2 = await lineOf("S2");
ok(l1.text === "First sentences: not folded yet" && l1.fs && l1.shown && l1.italic === "italic" && l2.text === "First sentences: this section wasn't folded" && l2.shown, "R5-30 at Key: an unfolded section's line, a failed one's line, muted in italics");
ok(serif.startsWith("paper/"), "R5-30 an unfolded section's words are in the serif");
for (const k of ["4", "5"]) {
  await levelKey(k);
  if (k === "4") { l1 = await lineOf("S1"); ok(l1.text === "First sentences: not folded yet" && l1.shown, "R5-30 at Takeaway too"); }
  else ok((await pg.textContent('.tcard[data-s="S1"] .take')) === "First sentences: not folded yet" && (await pg.textContent('.tcard[data-s="S2"] .take')) === "First sentences: this section wasn't folded", "R5-30 a Topic card shows the line in place of its takeaway");
}
await levelKey("1");
ok(!(await lineOf("S1")).shown, "R5-30 at Full no section line");
await levelKey("3");
await load(payload(s1Only, null, { fold: fk({ kind: "stopped", done: 1 }) }));
await wait(50);
l1 = await lineOf("S1");
ok(l1.text === "Section S1 folded" && !l1.fs && (await fontOf("S1.p1")).startsWith("ui/") && (await fontOf("S2.p1")).startsWith("paper/"), "R5-30 after FR.load with S1 folded: its line gone, its words in the sans, the others still serif");
ok((await attr(".cap.ai", "title")) === "Written by AI (Lab model, 6 November 2026) for 1 of 5 sections; the others show first sentences", "R5-30 the AI caption: partly folded");
const foot = () => pg.textContent(".ft .lv");
ok((await foot()) === "Key · written by AI for 1 of 5 sections, the others first sentences", "R5-30 the footer at Key: partly folded");
await load(payload(unf, null, { fold: fk({}) }));
ok((await attr(".cap.ai", "title")) === "Not written by AI yet: each paragraph's first sentence", "R5-30 the AI caption: nothing folded");
ok((await foot()) === "Key · first sentences until folded", "R5-30 the footer at Key: nothing folded, never written by AI");
await load(payload(allMade, null, { fold: doneFold }));
ok((await attr(".cap.ai", "title")) === "Written by AI (Lab model, 6 November 2026)", "R5-30 the AI caption: all folded");
ok((await foot()) === "Key · written by AI, each line opens to the paper", "R5-30 the footer at Key: all folded");

// R5-31: FR.fold changes the count without drawing the text again
await load(payload(s1Only, null, { fold: fk({ kind: "folding", done: 1 }) }));
await pg.focus("#text");
await levelKey("1");
await pg.click('.u[data-u="S2.p1"] .body', { position: { x: 20, y: 8 } });
await pg.evaluate(() => { const t = document.getElementById("text"); t.scrollTop = 60; document.querySelector('.u[data-u="S2.p1"]').__probe = 1; });
const before = await pg.evaluate(() => ({ top: document.getElementById("text").scrollTop, sel: [...document.querySelectorAll(".u.sel")].map((e) => e.getAttribute("data-u")).join() }));
await pg.evaluate((x) => FR.fold(x), fk({ kind: "folding", done: 2 }));
const after = await pg.evaluate(() => ({ top: document.getElementById("text").scrollTop, sel: [...document.querySelectorAll(".u.sel")].map((e) => e.getAttribute("data-u")).join(), probe: document.querySelector('.u[data-u="S2.p1"]').__probe, s: document.querySelector(".banner span").textContent }));
ok(after.probe === 1 && after.top === before.top && after.sel === before.sel && before.sel === "S2.p1" && after.s.startsWith("2 of 5 sections"), "R5-31 FR.fold: the count changes, the text isn't drawn again, the scroll and the selection stay");

// R5-32: apparatus at Full only; the bib section's heading at Full only
await load(payload(unf, null, { fold: fk({}) }));
await pg.focus("#text");
const vis = (sel) => pg.evaluate((q) => { const e = document.querySelector(q); return !!e && !e.hidden && e.offsetParent !== null; }, sel);
await levelKey("1");
ok((await vis('.u[data-u="bib.r1"]')) && (await vis('.u[data-u="Sx.n1"]')) && (await vis('.sec[data-s="bib"]')), "R5-32 at Full: references, the footnote and the bib heading show");
for (const k of ["2", "3", "4"]) {
  await levelKey(k);
  ok(!(await vis('.u[data-u="bib.r1"]')) && !(await vis('.u[data-u="Sx.n1"]')) && !(await vis('.sec[data-s="bib"]')) && (await vis('.u[data-u="S1.p1"]')), `R5-32 at ${["", "", "Brief", "Key", "Takeaway"][k]}: no apparatus and no bib heading`);
}
await levelKey("1");

// R5-33: no TextFold in any state, banner, tooltip or the keys panel; ⌘R's row
await pg.keyboard.press("?");
const keyRow = await pg.$$eval(".keys tr", (l) => l.map((r) => r.textContent).find((t) => t.startsWith("⌘R")));
allText.push(await pageText());
await pg.keyboard.press("Escape");
ok(keyRow === "⌘RRead the paper and its PDF again", "R5-33 the keys panel's ⌘R row");
ok(allText.length >= 30 && !allText.some((t) => /textfold/i.test(t)), `R5-33 no TextFold in ${allText.length} states, banners, tooltips and the keys panel`);

// R5-34: the Fold button and every banner button reachable by Tab and named; Stop's text beside its square
const tabReach = async (sel) => {
  await pg.evaluate(() => document.activeElement && document.activeElement.blur());
  for (let i = 0; i < 80; i++) {
    await pg.keyboard.press("Tab");
    if (await pg.evaluate((q) => document.activeElement === document.querySelector(q), sel)) return true;
  }
  return false;
};
const named = (sel) => pg.evaluate((q) => { const e = document.querySelector(q); return !!e && ((e.getAttribute("aria-label") || e.textContent || "").trim().length > 2); }, sel);
let reach = true;
for (const f of [fk({}), fk({ kind: "folding", done: 1 }), fk({ kind: "stopped", done: 2 }), fk({ kind: "partial", done: 3, failed: ["S2"], error: "x" }), fk({ kind: "ai-busy", error: "x" }), fk({ kind: "pdf-changed" })]) {
  await pg.evaluate((x) => FR.fold(x), f);
  const r = [await tabReach("#bFold"), await named("#bFold"), await tabReach(".banner button.act"), await named(".banner button.act")];
  if (r.some((x) => !x)) console.error("R5-34 " + f.kind + " " + r.join());
  reach = reach && r.every(Boolean);
}
await load(payload(allMade, null, { fold: doneFold }));
await pg.click("#bFold");
const r2 = [await tabReach('.banner[data-state="fold-again"] button[data-act="fold"]'), await tabReach("#bKeep")];
if (r2.some((x) => !x)) console.error("R5-34 confirm " + r2.join());
reach = reach && r2.every(Boolean);
await pg.keyboard.press("Escape");
ok(reach, "R5-34 the Fold button and every banner button are reached by Tab and named");
await pg.evaluate((x) => FR.fold(x), fk({ kind: "folding", done: 1 }));
const stopBox = await pg.evaluate(() => { const b = document.getElementById("bFold"), i = b.querySelector("svg").getBoundingClientRect(), t = b.querySelector(".lbl").getBoundingClientRect(); return { beside: t.left >= i.right - 1 && Math.abs((t.top + t.bottom) / 2 - (i.top + i.bottom) / 2) < 6, text: b.querySelector(".lbl").textContent, shown: t.width > 20 }; });
ok(stopBox.beside && stopBox.shown && stopBox.text === "Stop folding", "R5-34 the stop button has its text beside the square");
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

// The app's next FR.load of the same paper (the PDF opened, a fold's progress, ⌘R): what the reader did stays, a mark
// made in the 400 ms before it included
await load(full);
await words(fw);
await levelKey("2");
await pg.click('.u[data-u="S2.p1.1"] .body', { position: { x: 30, y: 10 } });
await pg.dblclick('.u[data-u="S1.p2.1"] .body');
await pg.evaluate(() => { document.getElementById("text").scrollTop = 120; });
await wait(1000);
await sent();
await selectPieces("S2.p1.1:3", "S2.p1.1:5");
await wait(30);
await pg.keyboard.press("h");
const view = () => pg.evaluate(() => ({ top: document.getElementById("text").scrollTop, level: document.querySelector('.dial [aria-pressed="true"]').getAttribute("data-level"),
  sel: [...document.querySelectorAll(".u.sel")].map((u) => u.getAttribute("data-u")).join(), opened: [...document.querySelectorAll(".u.opened")].map((u) => u.getAttribute("data-u")).join(),
  hl: [...document.querySelectorAll("#text .column .pc.hl")].map((x) => x.getAttribute("data-id")).join() }));
const v0 = await view();
await load(Object.assign({}, full, { prefs: { level: "full" }, marks: null }));
await words(fw);
await wait(500);
const v1 = await view();
ok(JSON.stringify(v1) === JSON.stringify(v0) && v0.level === "brief" && v0.sel === "S1.p2.1" && v0.opened === "S1.p2.1" && v0.hl === "S2.p1.1:3,S2.p1.1:4,S2.p1.1:5", "a reload of the same doc keeps the level, the place, the selection, the paragraph opened and the highlight: " + JSON.stringify(v1));
m = (await sent()).filter((x) => x.type === "marks");
ok(m.length === 1 && m[0].marks.marks.length === 1 && m[0].marks.marks[0].kind === "highlight", "the mark made just before it is posted, and no store without it");
const newer = F.doc();
newer.provenance.levels_made = "2026-11-05T10:00:00Z";
await load(payload(newer, fw, { marks: null }));
await words(fw);
await wait(500);
m = (await sent()).filter((x) => x.type === "marks");
ok((await hlIds("S2.p1.1")).join() === "S2.p1.1:3,S2.p1.1:4,S2.p1.1:5" && m.length && m.pop().marks.marks.length === 1, "a new doc of the same paper keeps the marks held, re-anchored and posted");
// notes where the margin doesn't show them: a count
await levelKey("1");
await selectPieces("S1.p1.1:3", "S1.p1.1:5");
await wait(30);
await pg.keyboard.press("n");
await pg.keyboard.type("A note");
await pg.focus("#text");
await levelKey("4");
ok((await pg.isVisible('.u[data-u="S1.p1.1"] .ncount')) && (await pg.textContent('.u[data-u="S1.p1.1"] .ncount')) === "1", "at Takeaway a paragraph's notes show as a count");
await pg.click('.u[data-u="S1.p1.1"] .ncount');
ok((await cls('.u[data-u="S1.p1.1"]')).includes(" opened ") && (await pg.locator('.u[data-u="S1.p1.1"] aside .card').count()) === 1, "the count opens the paragraph, its note in the margin");
await levelKey("1");
await pg.click('.u[data-u="S1.p1.1"] aside .card .x');
await pg.click('.u[data-u="S1.p1.1"] aside .card .ask button:has-text("Delete it")');
await wait(450);
await sent();

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
  ok(an.pieces > 50 && an.pieces <= 1500 && an.out === 0 && an.all === an.pieces, `26 key ${k}: ${an.pieces} pieces animate, all within 300 px of the viewport` + (an.out || an.all !== an.pieces ? " " + JSON.stringify(an) : ""));
  await levelKey("1"); await wait(700);
}
await pg.emulateMedia({ reducedMotion: "reduce" });
await pg.keyboard.press("3");
ok((await pg.evaluate(() => document.getAnimations().length)) === 0, "26 with reduced motion nothing animates");
await levelKey("1");
await pg.emulateMedia({ reducedMotion: "no-preference" });

// On a long paper: follow names the paragraph really at 30% wherever the text is scrolled (its rows' places read as they
// are, never a stale table), a far box puts its paragraph at 110 px at once, and 1 to 4 and back keeps the reading line
const settle = async (k) => { await pg.evaluate(() => performance.clearMarks()); await pg.keyboard.press(k); await pg.evaluate(() => new Promise((r) => { const t = () => (performance.getEntriesByName("fr:settled").length ? r() : setTimeout(t, 10)); t(); })); };
await load(bigLoad);
await words(bw);
await wait(400);
let misses = 0, tries = 0;
for (let y = 600; y < 60000; y += 2300) {
  const r = await pg.evaluate(async (yy) => {
    const t = document.getElementById("text")
    t.scrollTop = yy
    await new Promise((res) => setTimeout(res, 320))
    const line = t.getBoundingClientRect().top + t.clientHeight * 0.3
    const at = [...document.querySelectorAll("#text .u")].find((u) => u.getBoundingClientRect().bottom > line)
    return { st: t.scrollTop, at: at && at.getAttribute("data-u"), fol: [...document.querySelectorAll(".u.fol")].map((u) => u.getAttribute("data-u")).join() }
  }, y);
  if (r.st < y - 5) break;
  tries++;
  if (r.at !== r.fol) misses++;
}
ok(tries >= 10 && misses === 0, `follow on the long paper: the paragraph at 30% at ${tries - misses} of ${tries} places`);
const far = await pg.evaluate(() => { const bs = [...document.querySelectorAll(".bx")]; return bs[bs.length - 30].getAttribute("data-u"); });
await pg.evaluate(() => { document.getElementById("text").scrollTop = 0; });
await pg.$eval(`.bx[data-u="${far}"]`, (e) => e.scrollIntoView({ block: "center" }));
await wait(200);
await pg.click(`.bx[data-u="${far}"]`);
await wait(300);
const farTop = await pg.evaluate((u) => document.querySelector(`.u[data-u="${u}"]`).getBoundingClientRect().top - document.getElementById("text").getBoundingClientRect().top, far);
ok(Math.abs(farTop - 110) <= 2 && (await cls(`.u[data-u="${far}"]`)).includes(" sel "), "a box near the paper's end: its paragraph selected at 110 px within 300 ms: " + Math.round(farTop));
await pg.evaluate(() => { const t = document.getElementById("text"); t.scrollTop = t.scrollHeight * 0.45; });
await wait(400);
const a0 = await pg.evaluate(() => { const t = document.getElementById("text"), cr = t.getBoundingClientRect(), line = cr.top + Math.min(140, cr.height * 0.25); const u = [...document.querySelectorAll("#text .u")].find((x) => x.getBoundingClientRect().bottom > line); return { u: u.getAttribute("data-u"), off: u.getBoundingClientRect().top - cr.top }; });
const offs = [];
for (const k of ["2", "3", "4", "3", "2", "1"]) {
  await settle(k);
  await wait(650);
  offs.push(Math.round(await pg.evaluate((u) => document.querySelector(`.u[data-u="${u}"]`).getBoundingClientRect().top - document.getElementById("text").getBoundingClientRect().top, a0.u)));
}
ok(offs.every((o) => Math.abs(o - a0.off) <= 2), `1 to 4 and back keeps the reading line's paragraph in its place (${Math.round(a0.off)} px): ${offs.join(" ")}`);
await settle("3");
const stops = await pg.$$eval("#text button, #text [tabindex], #text textarea", (l) => l.filter((x) => x.tabIndex >= 0 && !x.disabled && x.offsetParent !== null && x.id !== "text").length);
ok(stops <= 6, "at Key one paragraph's controls are Tab stops, not every paragraph's: " + stops);
await settle("1");

// 44: budgets (the large document, median of 5)
await budgets(bigLoad, bw, true);

// narrow windows: the paper's words keep 420 px (the margin folds away, then the PDF narrows), the widths kept come back
await load(full);
await words(fw);
const widths = () => pg.evaluate(() => ({ body: Math.round(document.querySelector("#text .u .body").getBoundingClientRect().width), pdf: Math.round(document.getElementById("pdf").getBoundingClientRect().width),
  aside: document.querySelector("#text .u aside").hidden ? 0 : Math.round(document.querySelector("#text .u aside").getBoundingClientRect().width), margin: document.getElementById("bMargin").getAttribute("aria-pressed") }));
for (const [W, H] of [[900, 640], [760, 480]]) {
  await pg.setViewportSize({ width: W, height: H });
  await wait(150);
  const w = await widths();
  ok(w.body >= 420 && w.aside === 0 && w.margin === "false" && w.pdf >= 220, `at ${W} × ${H} the text keeps ${w.body} px (the margin folded away, the PDF ${w.pdf} px)`);
}
await pg.click("#bMargin");
const asked = await widths();
ok(asked.aside >= 160 && asked.margin === "true", `at 760 the margin asked for shows (${asked.aside} px), the text ${asked.body} px`);
await pg.setViewportSize({ width: 1360, height: 820 });
await wait(150);
const back = await widths();
ok(back.pdf === 470 && back.aside === 220 && back.margin === "true", "wide again: the PDF and the margin at their widths kept: " + JSON.stringify(back));
const boxStops = await pg.$$eval("#pages .bx", (l) => l.filter((x) => x.tabIndex >= 0).length);
await pg.focus('#pages .bx[tabindex="0"]');
const firstBox = await pg.evaluate(() => document.activeElement.getAttribute("data-u"));
await pg.keyboard.press("ArrowDown");
const nextBox = await pg.evaluate(() => document.activeElement.getAttribute("data-u"));
ok(boxStops === 1 && nextBox && nextBox !== firstBox && (await pg.$$eval("#pages .bx", (l) => l.filter((x) => x.tabIndex >= 0).length)) === 1, `the PDF's boxes are one Tab stop, ↓ to the next paragraph's (${firstBox} → ${nextBox})`);
await pg.setViewportSize({ width: 760, height: 480 });
await wait(150);
const heights = await pg.evaluate(() => ({ tools: document.querySelector(".tools").offsetHeight, text: document.getElementById("text").offsetHeight }));
ok(heights.tools <= 70 && heights.text >= 290, `at 760 × 480 the toolbar keeps one row (${heights.tools} px) and the text ${heights.text} px of the height`);
await pg.setViewportSize({ width: 1360, height: 820 });

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
