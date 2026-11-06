// The fold reader's test data (docs/fold-reader/FIXTURE.md): the synthetic document's fake PDF words, a large
// generated document for the budgets, and a blank page image. Deterministic: no clock, no unseeded randomness.
// Used by the node tests (fold-*.test.js) and by scripts/fold-reader-check.mjs. Nothing here is a real paper's text.
"use strict"

const fs = require("node:fs")
const path = require("node:path")

const DOC_FILE = path.join(__dirname, "fixtures", "fold-reader", "doc.json")
const doc = () => JSON.parse(fs.readFileSync(DOC_FILE, "utf8"))

const units = (d) => d.sections.reduce((all, s) => all.concat(s.units || []), [])

// The document laid out on US Letter pages (612 by 792 points) the way a simple PDF would be: a running header on
// page 1, units in reading order, a page number at the foot of every page. Words are the units' full text split on
// spaces, raw. options: skip (units not written), garble (units whose words are replaced in place), garbleAll (every
// unit but the first two garbled). Returns one FR.words batch, { pages: [{ n, words }], done: true }, and sizes.
function fakeWords(d, options) {
  const o = options || {}
  const skip = o.skip || ["S2.SS1.p2.1"]
  const all = units(d).map((u) => u.id)
  const garble = o.garbleAll ? all.filter((id) => id !== "abstract1.1" && id !== "S1.p1.1") : (o.garble || ["A1.p1.1"])
  const W = 0.009, GAP = 0.008, LEFT = 0.12, RIGHT = 0.88, H = 0.014, LINE = 0.02, AFTER = 0.015, TOP = 0.08, BOTTOM = 0.92
  const pages = [{ n: 1, words: [] }]
  let page = pages[0], x = LEFT, y = 0.04
  const r4 = (v) => Math.round(v * 1e6) / 1e6
  const put = (text, at, top, width) => { page.words.push([text, r4(at), r4(top), r4(at + width), r4(top + H)]) }
  const newPage = () => {
    put(String(page.n), 0.5, 0.95, W * String(page.n).length)
    page = { n: pages.length + 1, words: [] }
    pages.push(page)
    y = TOP
  }
  ;["Rivera", "and", "Okafor", "2026"].forEach((w) => { put(w, x, y, W * w.length); x += W * w.length + GAP })
  y = TOP
  let cut = false
  for (const s of d.sections) {
    if (s.id === "S2") newPage()
    for (const u of s.units || []) {
      if (skip.indexOf(u.id) >= 0) continue
      const garbled = garble.indexOf(u.id) >= 0
      const ws = u.sentences.join(" ").split(/\s+/).filter(Boolean)
      x = LEFT
      ws.forEach((w, i) => {
        const shown = garbled ? ["lorem", "ipsum", "dolor"][i % 3] : w
        if (!cut && u.id === "S1.p1.1" && w === "skimming") {
          cut = true
          put("skim-", x, y, W * 5)
          x = LEFT
          y += LINE
          put("ming", x, y, W * 4)
          x += W * 4 + GAP
          return
        }
        const width = W * w.length
        if (x + width > RIGHT) {
          x = LEFT
          y += LINE
          if (y + H > BOTTOM) newPage()
        }
        put(shown, x, y, width)
        x += width + GAP
      })
      y += LINE + AFTER
      if (y + H > BOTTOM) newPage()
    }
  }
  put(String(page.n), 0.5, 0.95, W * String(page.n).length)
  return { pages, done: true, sizes: pages.map(() => [612, 792]) }
}

// The large document of FIXTURE.md section 4: twelve sections of twenty units, twelve sentences of twelve words.
const ROLES = ["claim", "gap", "method", "setup", "result", "analysis", "limitation", "context"]
const LETTERS = "bcdfghjklmnprstvwz"
const VOWELS = "aeiou"
function madeUpWords() {
  const out = []
  for (let i = 0; i < 200; i++) {
    const n = (i % 8) + 2
    let w = ""
    for (let k = 0; k < n; k++) w += k % 2 === 0 ? LETTERS[(i * 7 + k * 5) % LETTERS.length] : VOWELS[(i * 3 + k) % VOWELS.length]
    out.push(w)
  }
  return out
}
function bigDoc() {
  const words = madeUpWords()
  let x = 1n
  const next = () => {
    x = (1103515245n * x + 12345n) % 2147483648n
    return words[Number(x % 200n)]
  }
  const sections = []
  let n = 0
  for (let i = 1; i <= 12; i++) {
    const us = []
    for (let j = 1; j <= 20; j++) {
      const sents = []
      for (let s = 0; s < 12; s++) {
        const w = []
        for (let k = 0; k < 12; k++) w.push(next())
        sents.push(w)
      }
      const take = sents[0].slice(0, 8)
      us.push({
        id: "S" + i + ".p" + j + ".1", kind: "paragraph", role: ROLES[n++ % ROLES.length],
        sentences: sents.map((w) => w.join(" ") + "."),
        evidence: [0, 1],
        key: take.join(" ") + ". " + sents[1].slice(0, 6).join(" ") + ".",
        takeaway: take.join(" "), topic: take[2] + " " + take[3]
      })
    }
    sections.push({ id: "S" + i, num: String(i), title: "Section " + i, depth: 1, takeaway: us[0].takeaway, topic: us[0].topic, units: us })
  }
  return {
    format: "textfold/doc", version: 0, id: "pdf-fixturebig1", lang: "en", title: "A Large Synthetic Paper", authors: ["Rivera, Ana"], date: "2026-01-15",
    provenance: { made_with: "fixture", ai_generated: true, model: "fixture/model", levels_made: "2026-11-01T09:00:00", local: false },
    sections, links: []
  }
}

// A white US Letter page with its number written small in a corner, as a data: URL (the check's CSP allows data:).
function blankPage(n) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="612" height="792" viewBox="0 0 612 792"><rect width="612" height="792" fill="#ffffff"/>' +
    '<text x="596" y="780" font-size="9" text-anchor="end" fill="#999999">' + Number(n) + "</text></svg>"
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)
}

// ---- R5 (FIXTURE.md section 6): a paper's lines as PDFKit gives them, and a long section for the prompts

const FILLERS = [
  "Each level keeps the words that the next level needs.",
  "A reader can open any paragraph in place to see all of it.",
  "The folds are stored beside the paper on this computer.",
  "Nothing in the library changes when a paper is folded.",
  "The OCR-free files were used as they were."
]
const TITLE = "Folding a Paper: A Small Synthetic Study"
const PAGE_W = 612, PAGE_H = 792

// The synthetic paper set the way a two-column PDF sets it (FIXTURE.md 6.2): returns { pages (FoldPDF.lines'
// payload), sizes, meta, expected } where expected is 6.3 with each unit's line boxes as they were placed.
// options: columns (1 or 2), pages (40: parts added until that many), scan, empty (page numbers with no lines).
function fakePaper(options) {
  const o = options || {}
  const one = o.columns === 1
  const d = doc()
  const sents = {}
  units(d).forEach((u) => { sents[u.id] = u.sentences.map((s) => s.replace(/\$/g, "")) })
  const COLS = one ? [[54, 558]] : [[54, 297], [315, 558]]
  const SPAN = [54, 558]
  const r6 = (v) => Math.round(v * 1e6) / 1e6
  const pages = []
  const exp = {}
  const order = []
  let page = null, col = 0, y = 0
  const bottomOf = () => {
    if (page.n === 1 && !one) return 380
    if (page.n === 2 && col === 0) return 700
    return 720
  }
  const unitOf = (id, kind, label, sentences) => {
    if (!exp[id]) { exp[id] = { id, kind, label: label || "", sentences, text: sentences.join(" "), boxes: [], page: 0 }; order.push(id) }
    return exp[id]
  }
  // A line: [{ t, x }] at y, size; unit: the expected unit its words (from `from` on) belong to.
  const line = (words, top, size, f, lb, unit, from) => {
    const ws = words.map((w) => ({ t: w.t, x0: w.x, x1: w.x + w.t.length * size * 0.5, y0: top, y1: top + size }))
    page.lines.push({ words: ws, size, f, lb })
    if (unit) {
      const mine = ws.slice(from || 0)
      if (!mine.length) return
      if (!unit.page) unit.page = page.n
      const box = [Math.min(...mine.map((w) => w.x0)) / PAGE_W, top / PAGE_H, Math.max(...mine.map((w) => w.x1)) / PAGE_W, (top + size) / PAGE_H].map(r6)
      if (page.n !== unit.page) box.push(page.n)
      unit.boxes.push(box)
    }
  }
  const centred = (text, top, size, f) => {
    const ws = text.split(" ")
    const width = text.length * size * 0.5
    let x = (PAGE_W - width) / 2
    line(ws.map((t) => { const w = { t, x }; x += (t.length + 0.5) * size * 0.5; return w }), top, size, f, f ? ws.length : 0)
  }
  const newPage = () => {
    page = { n: pages.length + 1, lines: [] }
    pages.push(page)
    col = 0
    y = 60
    if (page.n > 1) centred("Rivera and Okafor · Folding a Paper", 30, 9, 0)
    centred(String(page.n), 760, 9, 0)
    if (page.n === 2 && !one) {
      const u = unitOf("Sx.n1", "footnote", "", ["1 The readers were volunteers from one department."])
      let x = 54
      line(u.text.split(" ").map((t) => { const w = { t, x }; x += (t.length + 0.5) * 4; return w }), 712, 8, 0, 0, u)
    }
  }
  const nextColumn = () => {
    if (col < COLS.length - 1) { col++; y = page.n === 1 ? 240 : 60 } else newPage()
  }
  const room = (size) => { if (y + size > bottomOf()) nextColumn() }
  // A paragraph: words laid out greedily, justified but for its last line and a line a split word ends.
  // opts: size, f, indent (first line), hang (the others), lead (words before the unit's: a bullet, a run-in
  // heading), split ({ word: [first, second] }: the first occurrence cut at a line end), span (the page's width).
  const para = (unit, text, opts) => {
    const size = opts.size || 10, cw = size * 0.5, sp = size * 0.25
    const toks = []
    const split = Object.assign({}, opts.split || {})
    ;(opts.lead || []).forEach((t) => toks.push({ t, lead: true, bold: true }))
    text.split(" ").forEach((t) => {
      if (split[t]) { toks.push({ t: split[t][0], cut: true }, { t: split[t][1] }); delete split[t] } else toks.push({ t })
    })
    let first = true, cur = []
    const emit = (justify) => {
      room(size)
      const range = opts.span ? SPAN : COLS[col]
      const xs = range[0] + (first ? (opts.indent || 0) : (opts.hang || 0))
      const natural = cur.reduce((a, w) => a + w.t.length * cw, 0) + sp * (cur.length - 1)
      const gap = justify && cur.length > 1 ? sp + Math.min((range[1] - xs - natural) / (cur.length - 1), size) : sp
      let x = xs
      const ws = cur.map((w) => { const o2 = { t: w.t, x }; x += w.t.length * cw + gap; return o2 })
      const lead = cur.filter((w) => w.lead).length
      line(ws, y, size, opts.f || 0, opts.f ? ws.length : lead, unit, lead)
      y += size * 1.2
      first = false
      cur = []
    }
    for (const tk of toks) {
      const range = opts.span ? SPAN : COLS[col]
      const xs = range[0] + (first ? (opts.indent || 0) : (opts.hang || 0))
      const width = cur.reduce((a, w) => a + w.t.length * cw, 0) + sp * cur.length + tk.t.length * cw
      if (cur.length && xs + width > range[1]) emit(true)
      cur.push(tk)
      if (tk.cut) emit(false)
    }
    if (cur.length) emit(false)
  }
  const heading = (text) => {
    y += 8
    room(12)
    const ws = text.split(" ")
    let x = COLS[col][0]
    line(ws.map((t) => { const w = { t, x }; x += (t.length + 0.5) * 6; return w }), y, 12, 1, ws.length)
    y += 14.4
  }
  const body = (id, sentences, opts) => para(unitOf(id, "paragraph", "", sentences), sentences.join(" "), Object.assign({ size: 10 }, opts || {}))

  newPage()
  // page 1: the stamp set vertically, the title, the names, the abstract across both columns
  {
    const stamp = ["arXiv:2601.01234v1", "[cs.HC]", "15", "Jan", "2026"]
    let at = 600
    page.lines.push({ size: 10, f: 0, lb: 0, words: stamp.map((t) => { const w = { t, x0: 20, x1: 30, y0: at - t.length * 5, y1: at }; at -= t.length * 5 + 2.5; return w }) })
  }
  centred(TITLE, 80, 18, 1)
  centred("Ana Rivera Ben Okafor", 110, 11, 0)
  centred("Example University · Sample Institute · ana@example.org", 125, 9, 0)
  y = 150
  const abs = sents["abstract1.1"]
  para(unitOf("abstract.p1", "abstract", "", abs), abs.join(" "), { size: 10, span: true, lead: ["Abstract."] })
  y = 240
  heading("1 Introduction")
  body("S1.p1", sents["S1.p1.1"], { split: { skimming: ["skim-", "ming"] } })
  body("S1.p2", sents["S1.p2.1"].concat(FILLERS.slice(0, 3)), { indent: 10 })
  heading("2 Method")
  body("S2.p1", sents["S2.p1.1"].concat(FILLERS.slice(0, 4)))
  {
    // (in a PDF the formula is its letters: "... by s = n / N." ends in a single capital, which TextFold's splitter
    // reads as an initial, so that sentence and the next are one; FoldCore splits a doc's sentences the same way)
    const u = exp["S2.p1"]
    u.sentences = [u.sentences[0], u.sentences[1] + " " + u.sentences[2]].concat(u.sentences.slice(3))
  }
  if (one && page.n === 1) newPage()
  // page 2: a figure's labels and caption, an equation, a table, the results, a list item
  y += 4
  room(7)
  line([{ t: "0.5", x: COLS[col][0] + 20 }, { t: "1.0", x: COLS[col][0] + 80 }, { t: "Topic", x: COLS[col][0] + 140 }], y, 7, 0, 0)
  y += 8.4 + 4
  const cap1 = sents["S2.F1.cap"]
  para(unitOf("S2.F1.cap", "caption", "Figure 1", cap1), cap1.join(" "), { size: 9 })
  y += 6
  room(10)
  {
    const eq = unitOf("S2.e1", "equation", "", ["s = n / N (1)"])
    const ws = eq.text.split(" ")
    const range = COLS[col]
    let x = (range[0] + range[1]) / 2 - eq.text.length * 2.5
    line(ws.map((t) => { const w = { t, x }; x += (t.length + 0.5) * 5; return w }), y, 10, 0, 0, eq)
    y += 12 + 6
  }
  const cap2 = ["Table 1: Reading times by level."]
  para(unitOf("S2.T1.cap", "caption", "Table 1", cap2), cap2[0], { size: 9 })
  for (const row of [["Level", "Seconds", "Readers"], ["Full", "68", "12"], ["Folded", "41", "12"]]) {
    room(9)
    line(row.map((t, i) => ({ t, x: COLS[col][0] + 60 * i })), y, 9, 0, 0)
    y += 10.8
  }
  heading("2.1 Results")
  body("S2.SS1.p1", sents["S2.SS1.p1.1"])
  {
    const li = sents["S2.SS1.p2.1"]
    para(unitOf("S2.SS1.i1", "list item", "", li), li.join(" "), { size: 10, lead: ["•"], hang: 10 })
    // (the bullet is not bold: its line's lb is 0)
    const last = page.lines.filter((l) => l.words[0].t === "•")
    last.forEach((l) => { l.lb = 0 })
  }
  if (o.pages) {
    let n = 3
    while (page.n < o.pages - 1) {
      heading(n + " Part " + n)
      for (let k = 1; k <= 3; k++) body("S" + n + ".p" + k, FILLERS.slice(0, 4), { indent: k > 1 ? 10 : 0 })
      n++
    }
  }
  // the references in the right column, a hanging indent; the appendix after them
  if (!one) { if (col === 0) nextColumn(); else newPage() } else y += 8
  heading("References")
  const refs = ["[1] A. Author. A made-up paper on reading. Example Press, 2020.", "[2] B. Writer. Another made-up paper. Sample Journal, 2021."]
  refs.forEach((r, i) => {
    const u = unitOf("bib.r" + (i + 1), "reference", "", [])
    u.text = r
    para(u, r, { size: 10, hang: 10 })
    y += 4
  })
  heading("Appendix A: Materials")
  body("A1.p1", [sents["A1.p1.1"][0], FILLERS[4]], { split: { "OCR-free": ["OCR-", "free"] } })
  newPage()
  body("A1.p2", [sents["A1.p1.1"][1], FILLERS[3]], { indent: 10 })
  if (one && !exp["Sx.n1"]) {
    // (one column: the footnote at the foot of page 2)
    const p2 = pages[1]
    const keep = page
    page = p2
    const u = unitOf("Sx.n1", "footnote", "", ["1 The readers were volunteers from one department."])
    let x = 54
    line(u.text.split(" ").map((t) => { const w = { t, x }; x += (t.length + 0.5) * 4; return w }), 712, 8, 0, 0, u)
    page = keep
  }

  // PDFKit's lines: one per row, the two columns' lines merged when they share a top (and a size and style)
  const empty = o.empty || (o.scan ? pages.map((p) => p.n) : [])
  const out = pages.map((p) => {
    const ls = p.lines.slice().sort((a, b) => a.words[0].y0 - b.words[0].y0 || a.words[0].x0 - b.words[0].x0)
    const merged = []
    for (const l of ls) {
      const prev = merged[merged.length - 1]
      if (prev && Math.abs(prev.words[0].y0 - l.words[0].y0) < 0.01 && prev.size === l.size && prev.f === l.f && !l.lb &&
          prev.words[0].x1 - prev.words[0].x0 > 0 && l.words[0].x0 > prev.words[prev.words.length - 1].x1) {
        prev.words = prev.words.concat(l.words)
      } else merged.push({ words: l.words.slice(), size: l.size, f: l.f, lb: l.lb })
    }
    const lines = empty.indexOf(p.n) >= 0 ? [] : merged.map((l) => {
      const w = l.words.map((x) => [x.t, r6(x.x0 / PAGE_W), r6(x.y0 / PAGE_H), r6(x.x1 / PAGE_W), r6(x.y1 / PAGE_H)])
      const b = [Math.min(...w.map((x) => x[1])), Math.min(...w.map((x) => x[2])), Math.max(...w.map((x) => x[3])), Math.max(...w.map((x) => x[4]))]
      return { t: w.map((x) => x[0]).join(" "), b, s: l.size, f: l.f, lb: l.lb, w }
    })
    return { n: p.n, size: [PAGE_W, PAGE_H], lines }
  })
  const SECTIONS = [
    ["abstract", "", "Abstract", 1], ["S1", "1", "Introduction", 1], ["S2", "2", "Method", 1], ["S2.SS1", "2.1", "Results", 2]
  ]
  if (o.pages) for (const id of order) { const m = /^S(\d+)\.p1$/.exec(id); if (m && Number(m[1]) >= 3) SECTIONS.push(["S" + m[1], m[1], "Part " + m[1], 1]) }
  SECTIONS.push(["bib", "", "References", 1], ["A1", "", "Appendix A: Materials", 1], ["Sx", "", "Notes", 1])
  const expected = {
    title: TITLE,
    sections: SECTIONS.map(([id, num, title, depth]) => ({
      id, num, title, depth,
      units: order.filter((u) => u.slice(0, u.lastIndexOf(".", u.endsWith(".cap") ? u.length - 5 : u.length)) === id).map((u) => exp[u])
    }))
  }
  const abstract = abs.join(" ")
  const meta = {
    title: TITLE, authors: ["Rivera, Ana", "Okafor, Ben"], date: "2026-01-15", abstract, cite: "Rivera and Okafor, 2026", lang: "en",
    pdf: { sha256: "0123456789abcdef".repeat(4), bytes: 123456, modified: "2026-01-15T09:00:00Z", pages: out.length, sizes: out.map(() => [PAGE_W, PAGE_H]) },
    made_with: "Zotero Launcher test", exported: "2026-11-01T09:00:00Z"
  }
  return { pages: out, sizes: meta.pdf.sizes, meta, expected }
}

// A section of n units (95 by default) of one made-up twelve-word sentence each, for the parts and the section line.
function bigSection(n) {
  const count = n === undefined ? 95 : n
  const words = madeUpWords()
  let x = 7n
  const next = () => { x = (1103515245n * x + 12345n) % 2147483648n; return words[Number(x % 200n)] }
  const us = []
  for (let i = 1; i <= count; i++) {
    const w = []
    for (let k = 0; k < 12; k++) w.push(next())
    w[0] = w[0].charAt(0).toUpperCase() + w[0].slice(1)
    us.push({ id: "S1.p" + i, kind: "paragraph", role: "context", sentences: [w.join(" ") + "."], evidence: [0], key: "", takeaway: "", topic: "" })
  }
  return {
    format: "textfold/doc", version: 0, id: "pdf-fixturesection", lang: "en", title: "A Long Synthetic Section", authors: ["Rivera, Ana"], date: "2026-01-15",
    provenance: { made_with: "fixture", ai_generated: false, model: "", levels_made: "", local: true },
    sections: [{ id: "S1", num: "1", title: "A long section", depth: 1, takeaway: "", topic: "", units: us }], links: []
  }
}

module.exports = { DOC_FILE, doc, units, fakeWords, bigDoc, blankPage, madeUpWords, fakePaper, bigSection, FILLERS }
