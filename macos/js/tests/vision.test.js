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
