// The fold reader and scans (docs/fold-reader/R5-SPEC.md 3.8, criteria R5-59 to R5-63): which pages have no text of
// their own (a publisher's download stamp doesn't count), when a PDF is a scan, and the doc's word of the pages OCR read.
const test = require("node:test")
const assert = require("node:assert/strict")
const F = require("./fold-fixture.js")
const M = require("../../ZoteroLauncher/Reader/FoldMake.js")

// One line of words, each 5 pt a letter, at (x, y) in points on a 612 × 792 page: FoldPDF.lines' shape.
function line(text, x, y, size, opts) {
  const o = opts || {}
  let at = x
  const w = text.split(" ").map((t) => {
    const width = t.length * size * 0.5
    const box = o.up ? [x / 612, (y - at + x - width) / 792, (x + size) / 612, (y - at + x) / 792] : [at / 612, y / 792, (at + width) / 612, (y + size) / 792]
    at += width + size * 0.25
    return [t].concat(box)
  })
  return { t: text, b: [w[0][1], w[0][2], w[w.length - 1][3], w[w.length - 1][4]], s: size, f: 0, lb: 0, w }
}
const stamp = (n) => line("Downloaded from www.emerald.com/ijlm/article-pdf/12/1/" + n + "/898312/09574090110806190.pdf by FGV user on 12 November 2026", 60, 700, 7)
const watermark = () => line("Licensed copy for personal use only", 150, 400, 9)
const meta = (pages) => ({ title: "Supply Chain Metrics", pdf: { bytes: 1000, modified: "", pages, sha256: "" } })

// A page of body text: 30 lines of ten words.
function bodyPage(n) {
  const lines = []
  for (let i = 0; i < 30; i++) lines.push(line("The supply chain metric links each firm to the value it adds " + (n * 100 + i) + ".", 72, 80 + i * 20, 10))
  return { n, size: [612, 792], lines }
}

test("R5-59: pages whose only text is a download stamp have no text of their own: the PDF is a scan, every page to OCR", () => {
  const pages = []
  for (let n = 1; n <= 19; n++) pages.push({ n, size: [612, 792], lines: [stamp(n)] })
  const t = M.textless(pages, meta(19))
  assert.equal(t.scan, true)
  assert.deepEqual(t.pages, pages.map((p) => p.n))
  assert.equal(M.read(pages, meta(19)).problem, "scan", "read says scan too (before, the stamps' 2000 characters passed for text)")
})

test("R5-60: a watermark repeated mid-page, a few lines a page, doesn't count as text; a page of repeated lines does", () => {
  const pages = []
  for (let n = 1; n <= 6; n++) pages.push({ n, size: [612, 792], lines: [watermark(), line("Page header " + n, 260, 40, 8)] })
  const t = M.textless(pages, meta(6))
  assert.equal(t.scan, true)
  assert.equal(t.pages.length, 6)
  // (the fixture paper's lists repeat their words page after page: not stamps)
  const paper = F.fakePaper()
  assert.equal(M.textless(paper.pages, paper.meta).scan, false)
})

test("R5-61: a scan behind a cover sheet: the cover keeps its text, the pages behind it go to OCR", () => {
  const pages = [bodyPage(1)]
  for (let n = 2; n <= 8; n++) pages.push({ n, size: [612, 792], lines: [stamp(n)] })
  const t = M.textless(pages, meta(8))
  assert.equal(t.scan, true)
  assert.deepEqual(t.pages, [2, 3, 4, 5, 6, 7, 8])
})

test("R5-62: a born-digital paper with one page of figure is no scan: its page stays as it is", () => {
  const pages = [bodyPage(1), bodyPage(2), { n: 3, size: [612, 792], lines: [line("Figure", 300, 400, 8)] }, bodyPage(4)]
  const t = M.textless(pages, meta(4))
  assert.equal(t.scan, false)
  assert.deepEqual(t.pages, [3])
  assert.ok(M.read(pages, meta(4)).doc)
})

test("R5-63: the pages OCR read are in the doc's source, with the engine; a doc read without OCR says nothing", () => {
  const paper = F.fakePaper()
  const read = M.read(paper.pages, Object.assign({}, paper.meta, { ocr: [1, 2, 3], ocr_engine: "vision" }))
  assert.deepEqual(read.doc.source.ocr, [1, 2, 3])
  assert.equal(read.doc.source.ocr_engine, "vision")
  const plain = M.read(paper.pages, paper.meta)
  assert.equal(plain.doc.source.ocr, undefined)
  assert.equal(plain.doc.source.ocr_engine, undefined)
})

test("a download stamp is furniture on a page of text too", () => {
  const p = bodyPage(1)
  p.lines.push(line("Downloaded by [FGV] at 10:21 05 March 2024", 200, 380, 10))
  const pages = [p, bodyPage(2)]
  const read = M.read(pages, meta(2))
  const text = read.doc.sections.map((s) => s.units.map((u) => u.sentences.join(" ")).join(" ")).join(" ")
  assert.doesNotMatch(text, /Downloaded by/)
})

// A scanned page as Vision reads it (fn "ocr"): two columns with no gutter, one row in four read across both as one
// line, a margin column of a pull quote; the margin on the left of page 1 and the right of page 2 (facing pages).
function ocrLine(words, x0, x1, y, opts) {
  const o = opts || {}
  const n = words.length, room = x1 - x0, chars = words.reduce((a, w) => a + w.length, 0)
  const per = (room - 2.5 * (n - 1)) / chars
  let at = x0
  const w = words.map((t) => { const box = [t, at / 612, y / 792, (at + t.length * per) / 612, (y + 10) / 792]; at += t.length * per + 2.5; return box })
  return { t: words.join(" "), b: [w[0][1], w[0][2], w[n - 1][3], w[n - 1][4]], s: 10, f: o.bold ? 1 : 0, lb: o.bold ? n : 0, li: 0, fn: "ocr", w }
}
function scanPage(n, margin) {
  const L = margin === "left" ? [153, 361] : [37, 245], R = margin === "left" ? [361, 575] : [245, 459]
  const M = margin === "left" ? [25, 135] : [475, 590]
  const lines = []
  const tok = (side, k) => side + String(n) + String(k).padStart(3, "0")
  for (let i = 0; i < 40; i++) {
    const y = 80 + i * 14
    const left = [0, 1, 2, 3, 4].map((j) => tok("wl", i * 5 + j)), right = [0, 1, 2, 3, 4].map((j) => tok("wr", i * 5 + j))
    if (n === 1 && i === 20) { lines.push(ocrLine(["Problems", "with", "Existing", "Metrics"], L[0], L[0] + 150, y, { bold: true })); lines.push(ocrLine(right, R[0], R[1], y)); continue }
    if (i % 4 === 2) {
      const a = ocrLine(left, L[0], L[1], y), b = ocrLine(right, R[0], R[1], y)
      lines.push({ t: a.t + " " + b.t, b: [a.b[0], a.b[1], b.b[2], b.b[3]], s: 10, f: 0, lb: 0, li: 0, fn: "ocr", w: a.w.concat(b.w) })
    } else { lines.push(ocrLine(right, R[0], R[1], y)); lines.push(ocrLine(left, L[0], L[1], y)) }
  }
  for (let i = 0; i < 4; i++) lines.push(ocrLine(["mq" + n + i + "a", "mq" + n + i + "b", "mq" + n + i + "c"], M[0], M[1], 200 + i * 14))
  return { n, size: [612, 792], lines }
}

test("R5-68: a scan's columns with no gutter and a margin column read in order: the left column, the right, the margin's", () => {
  const pages = [scanPage(1, "left"), scanPage(2, "right")]
  const read = M.read(pages, Object.assign(meta(2), { ocr: [1, 2], ocr_engine: "vision" }))
  assert.ok(read.doc, read.problem)
  const text = read.doc.sections.map((s) => s.units.map((u) => u.sentences.join(" ")).join(" ")).join(" ")
  const toks = text.match(/\b(?:wl|wr|mq)\d\w*/g)
  const want = []
  for (const n of [1, 2]) {
    for (let k = 0; k < 200; k++) if (!(n === 1 && k >= 100 && k < 105)) want.push("wl" + n + String(k).padStart(3, "0"))
    for (let k = 0; k < 200; k++) want.push("wr" + n + String(k).padStart(3, "0"))
    for (let i = 0; i < 4; i++) for (const c of "abc") want.push("mq" + n + i + c)
  }
  assert.deepEqual(toks, want)
  assert.ok(read.doc.sections.some((s) => s.title === "Problems with Existing Metrics"), read.doc.sections.map((s) => s.title).join(" | "))
})
