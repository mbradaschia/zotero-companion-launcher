// The fold reader's headings on journal layouts (docs/fold-reader/R5-SPEC.md 3.2 step 6, 6b): the PDF's own outline,
// IEEE's Roman numerals in hand-set small capitals and its lettered sub-sections, a number's title with a period in it,
// Medium-weight bold, a bold start that is no heading, a table's bold cell, and unnumbered levels told by the face.
// Synthetic lines only, every word made up (as fold-layouts.test.js).
const test = require("node:test")
const assert = require("node:assert/strict")
const M = require("../../ZoteroLauncher/Reader/FoldMake.js")

const W = 612, H = 792, L0 = 72, L1 = 540
const VOCAB = "folding reader level paragraph claim sentence model summary column method result analysis evidence reading layout".split(" ")
let seed = 11
const pick = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return VOCAB[seed % VOCAB.length] }

// Words at 0.5 × size a character from x0, their boxes size tall above the baseline y.
function words(text, x0, y, size, gap) {
  let x = x0
  return text.split(" ").map((w) => {
    const b = [w, x / W, (y - size) / H, (x + w.length * size * 0.5) / W, y / H]
    x += w.length * size * 0.5 + (gap == null ? size * 0.25 : gap)
    return b
  })
}
function line(ws, size, f, lb, fn) {
  const b = [Math.min(...ws.map((w) => w[1])), Math.min(...ws.map((w) => w[2])), Math.max(...ws.map((w) => w[3])), Math.max(...ws.map((w) => w[4]))]
  return { t: ws.map((w) => w[0]).join(" "), b: b, s: size, f: f || 0, lb: lb || 0, fn: fn || "Body", w: ws }
}
// A paragraph of n lines, 14 made-up words each, set in the body face at 10 pt, its last word ending a sentence.
function para(n) {
  return { para: true, lines: Array.from({ length: n }, (_, i) => {
    const ws = Array.from({ length: 14 }, () => pick())
    if (i === n - 1) ws[13] += "."
    return ws.join(" ")
  }) }
}
// Pages from blocks, top to bottom, 40 lines a page: a paragraph's lines 12 pt apart; a heading 18 pt below what is
// above it ({head, size, f, lb, fn, x, ws: words given as they are, also: lines beside or under it, after: the room it
// takes}).
function pages(blocks) {
  const out = [{ n: 1, size: [W, H], lines: [] }]
  let y = 90
  const room = (h) => { if (y + h > H - 80) { out.push({ n: out.length + 1, size: [W, H], lines: [] }); y = 90 } }
  const add = (l) => out[out.length - 1].lines.push(l)
  for (const b of blocks) {
    if (b.para) {
      for (const t of b.lines) { room(12); add(line(words(t, L0, y, 10), 10, 0, 0, "Body")); y += 12 }
      y += 6
    } else {
      room(30)
      y += 12
      const size = b.size || 10
      const ws = b.ws ? b.ws(y) : words(b.head, b.x != null ? b.x : L0, y, size)
      add(line(ws, b.s || size, b.f, b.lb == null ? (b.f & 1 ? ws.length : 0) : b.lb, b.fn || "Body"))
      if (b.also) for (const extra of b.also(y)) add(extra)
      y += b.after || size + 6
    }
  }
  return out
}
const meta = (ps, more) => Object.assign({ title: "Folding Made-Up Papers into Levels", abstract: "", lang: "en", pdf: { pages: ps.length } }, more || {})
const heads = (r) => { assert.ok(r.doc, "a doc, not " + r.problem); return r.doc.sections.filter((s) => s.id !== "Sx").map((s) => [s.depth, (s.num ? s.num + " " : "") + s.title]) }

test("a numbered title with a period in a word (a version, an abbreviation) is a heading", () => {
  const ps = pages([para(4), { head: "1 Introduction", size: 12, f: 1 }, para(5), { head: "2 Method", size: 12, f: 1 }, para(4),
    { head: "2.1 Reader v1.1 on folding" }, para(4), { head: "2.2 The U.S. layout" }, para(4)])
  assert.deepEqual(heads(M.read(ps, meta(ps))).slice(-3), [[1, "2 Method"], [2, "2.1 Reader v1.1 on folding"], [2, "2.2 The U.S. layout"]])
})

// IEEE: "II. M ETHOD AND R ESULT", the capital 10 pt and the rest 8 pt, centred; "A. Folding" in italics on its own line.
function ieeeHead(text, y) {
  const parts = text.split(" ")
  const out = []
  let x = 0
  for (const p of parts) {
    if (/^[IVX]+\.$/.test(p) || /^[&]$/.test(p) || p.length === 1) out.push([p, 10])
    else { out.push([p[0], 10]); out.push([p.slice(1), 8]) }
  }
  const width = out.reduce((a, [t, s]) => a + t.length * s * 0.5, 0) + 2.5 * parts.length
  x = (L0 + L1) / 2 - width / 2
  const ws = []
  out.forEach(([t, s], i) => {
    const glued = i > 0 && s === 8 && out[i - 1][1] === 10 && out[i - 1][0].length === 1 && !/[IVX]\.$/.test(out[i - 1][0])
    if (glued) x -= 2.5 - 0.5 // (a capital and its small capitals stand 0.5 pt apart)
    ws.push([t, x / W, (y - s) / H, (x + t.length * s * 0.5) / W, y / H])
    x += t.length * s * 0.5 + 2.5
  })
  return ws
}
test("IEEE: Roman-numbered sections in hand-set small capitals and their lettered italic sub-sections nest", () => {
  const ps = pages([para(4),
    { head: "I. INTRODUCTION", ws: (y) => ieeeHead("I. INTRODUCTION", y), s: 8.5 }, para(6),
    { head: "II. METHOD & RESULT", ws: (y) => ieeeHead("II. METHOD & RESULT", y), s: 8.5 }, para(3),
    { head: "A. Folding layouts", f: 2 }, para(5),
    { head: "B. Reading evidence", f: 2 }, para(5),
    { head: "III. CONCLUSION", ws: (y) => ieeeHead("III. CONCLUSION", y), s: 8.5 }, para(4)])
  const segs = M._.segmentsOf(ps).segs
  assert.ok(segs.some((s) => s.text === "I. INTRODUCTION"), "the small capitals are one word: " + segs.slice(4, 6).map((s) => s.text).join(" | "))
  assert.deepEqual(heads(M.read(ps, meta(ps))), [[1, "I INTRODUCTION"], [1, "II METHOD & RESULT"], [2, "A Folding layouts"], [2, "B Reading evidence"], [1, "III CONCLUSION"]])
})

test("the PDF's outline gives the levels, its labels for headings set in capitals, and a bold label it doesn't name is text", () => {
  const ps = pages([para(4),
    { head: "1 INTRODUCTION", size: 12, f: 1 }, para(5),
    { head: "Folding layouts", f: 1 }, para(4),
    { head: "Column evidence", f: 1 }, para(1),
    { head: "2 METHOD", size: 12, f: 1 }, para(4),
    { head: "Summary claim", f: 1 }, para(4),
    { head: "Acknowledgments", f: 1 }, para(2)])
  const without = heads(M.read(ps, meta(ps)))
  assert.deepEqual(without.map((h) => h[1]), ["1 INTRODUCTION", "Folding layouts", "Column evidence", "2 METHOD", "Summary claim", "Acknowledgments"], "without an outline: every bold line")
  const outline = [{ t: "1 Introduction", l: 1, p: 1 }, { t: "Folding layouts", l: 2, p: 1 }, { t: "2 Method", l: 1, p: 0 }, { t: "Summary claim", l: 2, p: 0 }]
  const r = M.read(ps, meta(ps, { outline }))
  assert.deepEqual(heads(r), [[1, "1 Introduction"], [2, "Folding layouts"], [1, "2 Method"], [2, "Summary claim"], [2, "Acknowledgments"]])
  const intro = r.doc.sections.find((s) => s.title === "Folding layouts")
  assert.ok(intro.units.some((u) => u.sentences.join(" ").indexOf("Column evidence") === 0), "the bold line the outline doesn't name reads as a paragraph")
  // (an outline that names too few of the headings is not used)
  const few = M.read(ps, meta(ps, { outline: [{ t: "Nothing here", l: 1, p: 1 }, { t: "Nor here", l: 1, p: 1 }, { t: "2 Method", l: 1, p: 1 }] }))
  assert.deepEqual(heads(few), without)
})

test("bold: a line whose bold start runs into text, a bold table cell beside others and a list item are no headings", () => {
  const ps = pages([para(4),
    { head: "1 Introduction", size: 12, f: 1 }, para(3),
    { head: "Folding claim layouts and the reader runs on here", f: 1, lb: 4 }, para(3),
    { head: "Model", f: 1, x: L0 + 40, also: (y) => [line(words("12.5", L0 + 200, y, 10), 10), line(words("13.0", L0 + 300, y, 10), 10)] }, para(3),
    { head: "• Reading level", f: 1 }, para(3),
    { head: "Reading evidence", f: 1, fn: "Body-Medi" }, para(3)])
  assert.deepEqual(heads(M.read(ps, meta(ps))).map((h) => h[1]), ["1 Introduction", "Reading evidence"])
})

test("no numbers: sub-sections set at the sections' size in another face nest under them", () => {
  const ps = pages([para(4),
    { head: "Introduction", size: 12, f: 1, fn: "Helvetica" }, para(4),
    { head: "Background", size: 12, f: 1, fn: "Helvetica" }, para(3),
    { head: "Folding layouts", size: 12, f: 1, fn: "Minion Pro" }, para(3),
    { head: "Reading evidence", size: 12, f: 1, fn: "Minion Pro" }, para(3),
    { head: "Conclusion", size: 12, f: 1, fn: "Helvetica" }, para(3)])
  assert.deepEqual(heads(M.read(ps, meta(ps))), [[1, "Introduction"], [1, "Background"], [2, "Folding layouts"], [2, "Reading evidence"], [1, "Conclusion"]])
})

// AMR: sections in bold capitals at the body's size, centred (one wrapped to a second, centred line), sub-sections in
// bold at the column's edge, the same face and size, one right under its section's title; a turned table's label read
// large ("High-"), a figure's caption in bold capitals (or its label alone, its title in bold under it) and its
// smaller bold labels are none.
function centredWords(text, y) {
  const width = text.length * 5 + 2.5 * (text.split(" ").length - 1)
  return words(text, (L0 + L1) / 2 - width / 2, y, 10)
}
test("no numbers, one face and size: bold capitals are sections, bold title case their sub-sections; a wrapped section title is one", () => {
  const ps = pages([para(4),
    { head: "CONCEPTUALIZATIONS OF FOLDING REPRESENTATIONS ACROSS INTERDISCIPLINARY", f: 1,
      also: (y) => [line(centredWords("READING LAYOUTS", y + 12), 10, 1, 2, "Body"), line(words("Folding layouts", L0, y + 31, 10), 10, 1, 2, "Body")], after: 40 }, para(4),
    { head: "FIGURE 1 Reading model of layouts", f: 1, ws: (y) => centredWords("FIGURE 1 Reading model of layouts", y) },
    { head: "FIGURE 2", f: 1, ws: (y) => centredWords("FIGURE 2", y), after: 4 },
    { head: "Evidence of folding layouts", f: 1, ws: (y) => centredWords("Evidence of folding layouts", y + 2) },
    { head: "Claim level", f: 1, size: 8 }, para(2),
    { head: "High-", size: 16.5 }, para(3),
    { head: "Reading evidence", f: 1 }, para(4),
    { head: "COLUMN METHOD", f: 1, ws: (y) => centredWords("COLUMN METHOD", y) }, para(4),
    { head: "Summary claim", f: 1 }, para(4)])
  assert.deepEqual(heads(M.read(ps, meta(ps))), [[1, "CONCEPTUALIZATIONS OF FOLDING REPRESENTATIONS ACROSS INTERDISCIPLINARY READING LAYOUTS"],
    [2, "Folding layouts"], [2, "Reading evidence"], [1, "COLUMN METHOD"], [2, "Summary claim"]])
})

test("an appendix's lettered sub-sections at the body's size and weight, one of them wrapped to a second line, are headings", () => {
  // (as PDFKit reads a paper whose heading font it can't name: no bold, the body's size)
  const wrapped = "A.2 Reconstructing multilayered paragraph summaries across evidence"
  const ps = pages([para(4), { head: "1 Introduction", size: 12, f: 1 }, para(5), { head: "References", size: 12, f: 1 },
    { para: true, lines: ["Made Up. 2020. Folding reader levels. In Proceedings of the Reading Layout Workshop."] },
    { head: "A Appendix of folding", size: 12, f: 1 }, para(3),
    { head: "A.1 Folding the claim layouts" }, para(4),
    { head: wrapped, after: 28, also: (y) => [line(words("column layouts", L0 + 17.5, y + 12, 10), 10)] }, para(4),
    { head: "A.3 Summary of the reader" }, para(3)])
  assert.deepEqual(heads(M.read(ps, meta(ps))).slice(-3).map((h) => h[1]),
    ["A.1 Folding the claim layouts", wrapped + " column layouts", "A.3 Summary of the reader"])
})
