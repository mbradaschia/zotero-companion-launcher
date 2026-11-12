// A scan's pages read by OCR on a Mac with Apple's Vision, through the app itself (docs/fold-reader/R5-SPEC.md 3.8):
// nothing to install, nothing sent anywhere. The app gives its executable as ZL_OCR; `<ZL_OCR> --ocr <pdf> <page>`
// prints the page's lines as JSON ({n, size, lines: [{t, b: [x0, y0, x1, y1]}]}, 0 to 1, origin top left, in Vision's
// order, `w` its words' boxes). readingOrder puts them in the order a reader reads them (its columns found from where
// its lines start and end) and makes paragraphs of them. Only the spawning (visionPage) isn't pure (node-tested).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { isMac } from "./platform.mjs";

export const VISION = "macOS Vision"; // what the note says read the pages

// The app's OCR command, "" when there is none (not a Mac, an app older than this, the file gone).
export function visionCommand(env = process.env, platform = process.platform, exists = existsSync) {
  const exe = String(env.ZL_OCR || "");
  return exe && isMac(platform) && exists(exe) ? exe : "";
}

// One page (1-based) read by Vision → its text, in reading order. Killed after `seconds`.
export function visionPage(exe, path, n, run = spawn, seconds = 120) {
  return new Promise((resolve, reject) => {
    let out = "", err = "", done = false;
    let p;
    try { p = run(exe, ["--ocr", path, String(n)], { stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { return reject(e); }
    const finish = (f) => { if (done) return; done = true; clearTimeout(timer); f(); };
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* gone */ } finish(() => reject(new Error(`OCR took over ${seconds} s on page ${n}`))); }, seconds * 1000);
    p.stdout.setEncoding && p.stdout.setEncoding("utf8");
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", (e) => finish(() => reject(new Error(e.code === "ENOENT" ? "the app's OCR isn't there (update Zotero Launcher)" : e.message))));
    p.on("close", (code) => finish(() => {
      if (code !== 0) return reject(new Error(`OCR failed on page ${n}: ${String(err).trim().split("\n").pop() || "exit " + code}`));
      let row;
      try { row = JSON.parse(out.trim().split("\n").pop() || "{}"); } catch { return reject(new Error(`OCR gave no answer for page ${n}`)); }
      if (row.error) return reject(new Error(row.error));
      resolve(readingOrder(row.lines || []));
    }));
  });
}

// Vision's lines → the page's text: its columns found by ocrColumns (one, two, a margin's), each band of the page
// (what lies between lines across the columns: a title, a figure's caption) read column by column, left to right, a
// margin's column after the text's; a line Vision read across two columns cut where they meet (its words' boxes, `w`,
// say where). A paragraph ends (a blank line) where the gap to the next line in a column is over 1.5 times its usual
// one, and at a column's end.
export function readingOrder(lines) {
  const ls = (Array.isArray(lines) ? lines : [])
    .filter((l) => l && typeof l.t === "string" && l.t.trim() && Array.isArray(l.b) && l.b.length === 4)
    .map((l) => {
      const ws = Array.isArray(l.w) ? l.w.filter((w) => Array.isArray(w) && w.length >= 5 && String(w[0]).trim()).map((w) => ({ t: String(w[0]), x0: w[1], y0: w[2], x1: w[3], y1: w[4] })) : []
      return { t: l.t.trim(), x0: l.b[0], y0: l.b[1], x1: l.b[2], y1: l.b[3], words: ws.length ? ws : null }
    });
  if (!ls.length) return "";
  const piece = (it, from, to) => {
    const ws = it.words.slice(from, to);
    return { t: ws.map((w) => w.t).join(" "), x0: Math.min(...ws.map((w) => w.x0)), x1: Math.max(...ws.map((w) => w.x1)), y0: it.y0, y1: it.y1, words: ws };
  };
  const { blocks } = ocrColumns(ls, 0.012, piece);
  const heights = ls.map((l) => l.y1 - l.y0).sort((a, b) => a - b);
  const high = heights[Math.floor(heights.length / 2)] || 0.01;
  return blocks.map(({ items: b }) => {
    const gaps = b.slice(1).map((l, i) => l.y0 - b[i].y1).filter((g) => g > 0).sort((a, c) => a - c);
    const usual = gaps.length ? gaps[Math.floor(gaps.length / 2)] : high * 0.3;
    return b.map((l, i) => (i && l.y0 - b[i - 1].y1 > Math.max(1.5 * usual, 0.6 * high) ? "\n" : "") + l.t).join("\n");
  }).join("\n\n");
}

// ---- a scanned page's columns (R5-SPEC 3.8): from where its lines start and end, not from a gap between them,
// as a scan's gutter can be nil (Emerald's 2001 pages: the left column ends at 0.590 of the page, the right starts
// at 0.590) and a page can carry a margin column of pull quotes and notes beside its text.
// items: [{x0, x1, y0, y1, words: [{x0, x1}] or null}] in one unit, tol: its slack (about 7 pt). A cut is where a
// column starts: an x where lines end before it and start after it (3 or more a side, 2 when a side is cut again),
// and few cross it. A line past it by 4 tol at most, mostly on one side, is on that side (a label, a line Vision boxed
// a little wide); a line read across both columns, with a gap between its words there, is on both. The best cut has
// the most lines on its smaller side, and the most lines starting at it; each side is then cut again, twice at most,
// no column under 8 tol wide. A column with under a third of the biggest one's text is a minor one (a margin's).
// → { cuts, blocks in reading order: [{kind: "span" | "major" | "minor", col, items}] }, each item whole or a piece
// of one cut at a column's edge (piece(item, from, to) makes it).
export function ocrColumns(items, tol, piece) {
  var hs = items.map(function (it) { return it.y1 - it.y0 }).sort(function (a, b) { return a - b })
  var hMed = hs.length ? hs[Math.floor(hs.length / 2)] : 0
  var splitAt = function (it, c) {
    var ws = it.words
    if (!ws || ws.length < 2 || it.y1 - it.y0 > 1.3 * hMed) return -1
    for (var i = 1; i < ws.length; i++) if (ws[i - 1].x1 <= c + tol && ws[i].x0 >= c - tol && ws[i - 1].x0 < c - tol && ws[i].x1 > c + tol) return i
    return -1
  }
  // (which side of x = c a line lies: within tol of it, or past it by 4 tol at most and mostly on one side, as a
  // label or a line Vision boxed a little wide sits; "X" across it)
  var sideOf = function (it, c) {
    if (it.x1 <= c + tol) return "L"
    if (it.x0 >= c - tol) return "R"
    var l = c - it.x0, r = it.x1 - c
    if (Math.min(l, r) <= 4 * tol) return l >= r ? "L" : "R"
    return "X"
  }
  var cuts = []
  var find = function (set, depth) {
    var minSide = depth ? 2 : 3
    if (depth > 2 || set.length < 2 * minSide) return
    var xs = set.map(function (it) { return it.x0 }).sort(function (a, b) { return a - b })
    var lo = xs[0], hi = Math.max.apply(null, set.map(function (it) { return it.x1 }))
    var best = null, last = -Infinity
    xs.forEach(function (c) {
      if (c - last < tol / 4) return
      last = c
      if (c - lo < 8 * tol || hi - c < 8 * tol) return // (a column 8 tol wide at least: a tenth of the page)
      var L = 0, R = 0, X = 0, at = 0
      set.forEach(function (it) {
        var w = sideOf(it, c)
        if (Math.abs(it.x0 - c) <= tol) at++
        if (w === "L") L++
        else if (w === "R") R++
        else if (splitAt(it, c) > 0) { L++; R++ }
        else X++
      })
      if (L < minSide || R < minSide || X > Math.max(2, 0.12 * (L + R))) return
      var score = Math.min(L, R) - 2 * X + at // (a column starts where lines start)
      if (!best || score > best.score) best = { c: c, score: score }
    })
    if (!best) return
    var c = best.c
    cuts.push(c)
    find(set.filter(function (it) { return sideOf(it, c) === "L" }), depth + 1)
    find(set.filter(function (it) { return sideOf(it, c) === "R" }), depth + 1)
  }
  find(items.filter(function (it) { return it.x1 - it.x0 >= 3 * tol }), 0)
  cuts.sort(function (a, b) { return a - b })
  var colOf = function (it) {
    for (var k = 0; k <= cuts.length; k++) {
      if ((k === 0 || sideOf(it, cuts[k - 1]) === "R") && (k === cuts.length || sideOf(it, cuts[k]) === "L")) return k
    }
    return -1
  }
  // (each item whole in its column, or cut at the column edges it crosses, or across them: a span)
  var placed = []
  items.forEach(function (it) {
    var k = colOf(it)
    if (k >= 0) { placed.push({ col: k, it: it }); return }
    var at = [], ok = true
    cuts.forEach(function (c) {
      if (sideOf(it, c) !== "X") return
      var i = splitAt(it, c)
      if (i > 0) at.push(i); else ok = false
    })
    if (!ok || !at.length) { placed.push({ col: -1, it: it }); return }
    at.push(0, it.words.length)
    at.sort(function (a, b) { return a - b })
    for (var j = 1; j < at.length; j++) {
      if (at[j] === at[j - 1]) continue
      var p = piece(it, at[j - 1], at[j])
      placed.push({ col: colOf(p), it: p })
    }
  })
  var chars = []
  placed.forEach(function (p) { if (p.col >= 0) chars[p.col] = (chars[p.col] || 0) + (p.it.x1 - p.it.x0) })
  var most = Math.max.apply(null, [0].concat(chars.filter(Boolean)))
  var major = function (k) { return (chars[k] || 0) >= most / 3 }
  placed.sort(function (a, b) { return a.it.y0 - b.it.y0 || a.it.x0 - b.it.x0 })
  var blocks = [], band = {}
  var flush = function () {
    var ks = Object.keys(band).map(Number).sort(function (a, b) { return a - b })
    ks.filter(major).concat(ks.filter(function (k) { return !major(k) })).forEach(function (k) {
      blocks.push({ kind: major(k) ? "major" : "minor", col: k, items: band[k] })
    })
    band = {}
  }
  placed.forEach(function (p) {
    if (p.col < 0) { flush(); blocks.push({ kind: "span", col: -1, items: [p.it] }); return }
    (band[p.col] = band[p.col] || []).push(p.it)
  })
  flush()
  return { cuts: cuts, blocks: blocks }
}
