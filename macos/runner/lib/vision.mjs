// A scan's pages read by OCR on a Mac with Apple's Vision, through the app itself (docs/fold-reader/R5-SPEC.md 3.8):
// nothing to install, nothing sent anywhere. The app gives its executable as ZL_OCR; `<ZL_OCR> --ocr <pdf> <page>`
// prints the page's lines as JSON ({n, size, lines: [{t, b: [x0, y0, x1, y1]}]}, 0 to 1, origin top left, in Vision's
// order). readingOrder puts them in the order a reader reads them (one column, or two, with what spans both between
// them) and makes paragraphs of them. Only the spawning (visionPage) isn't pure (node-tested).
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

// Vision's lines → the page's text: top to bottom; on a page in two columns, the left column then the right, a line
// across both (a title, a figure's caption) closing the band above it. A paragraph ends (a blank line) where the gap
// to the next line in a column is over 1.5 times its usual one, at a band's end, and at a column's.
export function readingOrder(lines) {
  const ls = (Array.isArray(lines) ? lines : [])
    .filter((l) => l && typeof l.t === "string" && l.t.trim() && Array.isArray(l.b) && l.b.length === 4)
    .map((l) => ({ t: l.t.trim(), x0: l.b[0], y0: l.b[1], x1: l.b[2], y1: l.b[3] }));
  if (!ls.length) return "";
  // (two columns: 3 or more lines a side, each within its half)
  const left = ls.filter((l) => l.x1 <= 0.53), right = ls.filter((l) => l.x0 >= 0.47);
  const two = left.length >= 3 && right.length >= 3;
  const across = (l) => two && l.x0 < 0.47 && l.x1 > 0.53;
  ls.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const blocks = []; // [[line]]: a column of a band, or a line across
  let band = { left: [], right: [] };
  const flush = () => { if (band.left.length) blocks.push(band.left); if (band.right.length) blocks.push(band.right); band = { left: [], right: [] }; };
  for (const l of ls) {
    if (across(l)) { flush(); blocks.push([l]); continue; }
    if (!two || (l.x0 + l.x1) / 2 < 0.5) band.left.push(l); else band.right.push(l);
  }
  flush();
  const heights = ls.map((l) => l.y1 - l.y0).sort((a, b) => a - b);
  const high = heights[Math.floor(heights.length / 2)] || 0.01;
  return blocks.map((b) => {
    const gaps = b.slice(1).map((l, i) => l.y0 - b[i].y1).filter((g) => g > 0).sort((a, c) => a - c);
    const usual = gaps.length ? gaps[Math.floor(gaps.length / 2)] : high * 0.3;
    return b.map((l, i) => (i && l.y0 - b[i - 1].y1 > Math.max(1.5 * usual, 0.6 * high) ? "\n" : "") + l.t).join("\n");
  }).join("\n\n");
}
