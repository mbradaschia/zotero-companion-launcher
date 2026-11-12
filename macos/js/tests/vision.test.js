// The runner's OCR on a Mac (macos/runner/lib/vision.mjs, R5-SPEC 3.8): the app's executable reads a page with Apple's
// Vision and prints its lines; the runner puts them in reading order. No app, no PDF here: a fake process.
const test = require("node:test")
const assert = require("node:assert/strict")
const { EventEmitter } = require("node:events")
const { PassThrough } = require("node:stream")

const V = () => import("../../runner/lib/vision.mjs")

// {t, b} at (x0, y0) to (x1, y0 + 0.012): one line of a page
const L = (t, x0, y0, x1) => ({ t, b: [x0, y0, x1, y0 + 0.012] })

test("the app's OCR command: ZL_OCR on a Mac, when the file is there", async () => {
  const { visionCommand } = await V()
  assert.equal(visionCommand({ ZL_OCR: "/Applications/ZoteroLauncher.app/Contents/MacOS/ZoteroLauncher" }, "darwin", () => true), "/Applications/ZoteroLauncher.app/Contents/MacOS/ZoteroLauncher")
  assert.equal(visionCommand({ ZL_OCR: "/gone" }, "darwin", () => false), "")
  assert.equal(visionCommand({ ZL_OCR: "/x" }, "linux", () => true), "") // Omarchy: Tesseract
  assert.equal(visionCommand({}, "darwin", () => true), "") // an older app
})

test("reading order: one column top to bottom, a paragraph where the gap widens", async () => {
  const { readingOrder } = await V()
  const lines = [L("second line of it.", 0.1, 0.12, 0.9), L("A first paragraph,", 0.1, 0.1, 0.9), L("A new paragraph.", 0.1, 0.16, 0.9), L("its end.", 0.1, 0.178, 0.5)]
  assert.equal(readingOrder(lines), "A first paragraph,\nsecond line of it.\n\nA new paragraph.\nits end.")
  assert.equal(readingOrder([]), "")
  assert.equal(readingOrder([{ t: "  ", b: [0, 0, 1, 1] }, { t: "x" }]), "")
})

test("reading order: two columns, the left then the right; a line across both closes the band above it", async () => {
  const { readingOrder } = await V()
  const lines = [
    L("Supply Chain Metrics", 0.2, 0.05, 0.8),
    L("Left one", 0.08, 0.1, 0.46), L("Right one", 0.54, 0.1, 0.92),
    L("Left two", 0.08, 0.115, 0.46), L("Right two", 0.54, 0.115, 0.92),
    L("Left three", 0.08, 0.13, 0.46), L("Right three", 0.54, 0.13, 0.92),
    L("Figure 1. A framework across the page", 0.1, 0.5, 0.9),
    L("Left four", 0.08, 0.6, 0.46), L("Right four", 0.54, 0.6, 0.92)
  ]
  assert.equal(readingOrder(lines), "Supply Chain Metrics\n\nLeft one\nLeft two\nLeft three\n\nRight one\nRight two\nRight three\n\nFigure 1. A framework across the page\n\nLeft four\n\nRight four")
})

test("a page read: the app run with --ocr, its JSON in reading order; its errors as errors", async () => {
  const { visionPage } = await V()
  const calls = []
  const proc = (out, code = 0, err = "") => (cmd, args) => {
    calls.push([cmd, args.join(" ")])
    const p = new EventEmitter()
    p.stdout = new PassThrough()
    p.stderr = new PassThrough()
    p.kill = () => {}
    setImmediate(() => { p.stdout.end(out); p.stderr.end(err); setImmediate(() => p.emit("close", code)) })
    return p
  }
  const row = JSON.stringify({ n: 3, size: [612, 792], lines: [L("Second.", 0.1, 0.12, 0.5), L("First,", 0.1, 0.1, 0.5)] })
  assert.equal(await visionPage("/app", "/x.pdf", 3, proc(row + "\n")), "First,\nSecond.")
  assert.deepEqual(calls[0], ["/app", "--ocr /x.pdf 3"])
  await assert.rejects(visionPage("/app", "/x.pdf", 9, proc(JSON.stringify({ n: 9, error: "no page 9" }))), /no page 9/)
  await assert.rejects(visionPage("/app", "/x.pdf", 1, proc("", 3, "couldn't read x.pdf as a PDF")), /OCR failed on page 1: couldn't read x\.pdf as a PDF/)
  await assert.rejects(visionPage("/app", "/x.pdf", 1, proc("not json")), /no answer/)
  const missing = () => { const p = new EventEmitter(); p.stdout = new PassThrough(); p.stderr = new PassThrough(); p.kill = () => {}; setImmediate(() => p.emit("error", Object.assign(new Error("spawn"), { code: "ENOENT" }))); return p }
  await assert.rejects(visionPage("/gone", "/x.pdf", 1, missing), /isn't there/)
})

// A line Vision read with its words' boxes: each word 0.012 a letter wide, a space of 0.006
const W = (t, x0, y0) => {
  let at = x0
  const w = t.split(" ").map((s) => { const box = [s, at, y0, at + s.length * 0.012, y0 + 0.012]; at += s.length * 0.012 + 0.006; return box })
  return { t, b: [x0, y0, w[w.length - 1][3], y0 + 0.012], w }
}

test("reading order: columns with no gutter between them and a margin column of pull quotes (Emerald's 2001 scans)", async () => {
  const { readingOrder, ocrColumns } = await V()
  // left column 0.25 to 0.5899, right 0.5897 to 0.94, a pull quote in the margin 0.04 to 0.22; two rows Vision read
  // across both columns as one line
  const lines = []
  for (let i = 0; i < 12; i++) {
    const y = 0.1 + i * 0.02
    if (i === 3 || i === 7) {
      const w = [["left" + i, 0.25, y, 0.5899, y + 0.012], ["right" + i, 0.5897, y, 0.94, y + 0.012]]
      lines.push({ t: "left" + i + " right" + i, b: [0.25, y, 0.94, y + 0.012], w })
    } else {
      lines.push({ t: "right" + i, b: [0.5897, y, 0.94, y + 0.012], w: [["right" + i, 0.5897, y, 0.94, y + 0.012]] })
      lines.push({ t: "left" + i, b: [0.25, y, 0.5899, y + 0.012], w: [["left" + i, 0.25, y, 0.5899, y + 0.012]] })
    }
  }
  for (let i = 0; i < 4; i++) lines.push(L("quote" + i, 0.04, 0.15 + i * 0.02, 0.22))
  const want = [...Array(12).keys()].map((i) => "left" + i).join("\n") + "\n\n" + [...Array(12).keys()].map((i) => "right" + i).join("\n") + "\n\n" + [0, 1, 2, 3].map((i) => "quote" + i).join("\n")
  assert.equal(readingOrder(lines), want)
  const cols = ocrColumns(lines.map((l) => ({ x0: l.b[0], y0: l.b[1], x1: l.b[2], y1: l.b[3], words: null })), 0.012, () => null)
  assert.deepEqual(cols.cuts.map((c) => Math.round(c * 100) / 100), [0.25, 0.59])
})

test("reading order: one column with indented paragraphs and a ragged right edge has no columns", async () => {
  const { readingOrder } = await V()
  const lines = []
  for (let i = 0; i < 20; i++) lines.push(W(i % 5 === 0 ? "Indented start of a paragraph here" : i % 5 === 4 ? "short end" : "a full line of the body text runs on", i % 5 === 0 ? 0.13 : 0.1, 0.1 + i * 0.02))
  const out = readingOrder(lines)
  assert.equal(out.split("\n").filter(Boolean).length, 20)
  assert.ok(out.startsWith("Indented start"))
  assert.ok(!out.includes("\n\n\n"))
})

test("ocrColumns is the same in the runner and the reader (FoldMake.js)", async () => {
  const fs = require("node:fs")
  const path = require("node:path")
  const body = (file) => {
    const s = fs.readFileSync(path.join(__dirname, file), "utf8")
    const a = s.search(/^ *(?:export )?function ocrColumns/m)
    const lines = s.slice(a).split("\n")
    const ind = lines[0].match(/^ */)[0].length
    const end = lines.findIndex((l, i) => i > 0 && l === " ".repeat(ind) + "}")
    return lines.slice(0, end + 1).map((l) => l.slice(ind)).join("\n").replace(/^export /, "")
  }
  assert.equal(body("../../runner/lib/vision.mjs"), body("../../ZoteroLauncher/Reader/FoldMake.js"))
})
