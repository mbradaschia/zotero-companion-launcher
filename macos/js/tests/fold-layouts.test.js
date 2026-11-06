// The fold reader's extraction on journal layouts (docs/fold-reader/R5-SPEC.md section 3): synthetic lines only.
// fixtures/fold-reader/layouts/*.json are made-up two-column papers drawn with reportlab and read into lines the way
// FoldPDF gives them (layouts/make/gen.py, then make/extract.py PDF pdfkit OUT); every word in them is from gen.py's
// short made-up vocabulary. The other cases build their lines here.
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const C = require("../../ZoteroLauncher/Reader/FoldCore.js")
const M = require("../../ZoteroLauncher/Reader/FoldMake.js")

const DIR = path.join(__dirname, "fixtures", "fold-reader", "layouts")
const layout = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name + ".json"), "utf8"))
// (the abstract gen.py drew, as Zotero would hold it)
const ABSTRACT = "Figure design layout layout caption table model sentence approach caption heading measure section approach sentence. " +
  "Layout method claim level figure approach study measure reader. Layout measure system section measure sentence section folding caption level reader reader model summary. " +
  "Design layout result layout table model caption summary. Heading folding value level layout measure column reading figure level study column."
const meta = (pages, abstract) => ({ title: "Folding Made-Up Papers into Levels", abstract: abstract || "", lang: "en", pdf: { pages: pages.length } })
const units = (doc) => doc.sections.reduce((a, s) => a.concat(s.units), [])
const textOf = (u) => u.sentences.join(" ")
const BODY = ["INTRODUCTION", "METHOD", "RESULTS", "REFERENCES"]

function sectionsOf(r) {
  assert.ok(r.doc, "a doc, not " + r.problem)
  return r.doc.sections.map((s) => s.id + " " + s.title + " (" + s.units.length + ")")
}

for (const name of ["ieee", "elsevier"]) {
  for (const withMeta of [false, true]) {
    test("R5-6: the " + name + " layout's abstract is its own section " + (withMeta ? "with" : "without") + " Zotero's abstract; the numbered headings are sections", () => {
      const pages = layout(name)
      const r = M.read(pages, meta(pages, withMeta ? ABSTRACT : ""))
      const seen = sectionsOf(r)
      const abs = r.doc.sections[0]
      assert.equal(abs.id, "abstract", "the first section is the abstract: " + seen.join(", "))
      assert.deepEqual(abs.units.map((u) => u.kind), ["abstract"], seen.join(", "))
      assert.equal(textOf(abs.units[0]), ABSTRACT, "the abstract's text, without its label")
      assert.deepEqual(r.doc.sections.slice(1).map((s) => s.title), BODY, seen.join(", "))
      assert.deepEqual(r.doc.sections.slice(1, 4).map((s) => [s.id, s.units.length]), [["S1", 3], ["S2", 3], ["S3", 3]], seen.join(", "))
      const bib = r.doc.sections[4]
      assert.equal(bib.id, "bib")
      assert.ok(bib.units.length >= 4 && bib.units.every((u) => u.kind === "reference"), seen.join(", "))
      assert.ok(units(r.doc).every((u) => !/^(?:Abstract|A B S T R A C T|I\.|II\.|III\.)\b/.test(textOf(u))), "no label or heading inside a unit")
      assert.equal(C.check(r.doc), null)
    })
  }
}

test("R5-6: a paper with no Abstract heading has no abstract section, and Zotero's abstract finds it", () => {
  const pages = layout("unheaded")
  const bare = M.read(pages, meta(pages, ""))
  assert.ok(!bare.doc.sections.some((s) => s.id === "abstract"), sectionsOf(bare).join(", "))
  const r = M.read(pages, meta(pages, ABSTRACT))
  const seen = sectionsOf(r)
  assert.equal(r.doc.sections[0].id, "abstract", seen.join(", "))
  assert.equal(textOf(r.doc.sections[0].units[0]), ABSTRACT)
  assert.deepEqual(r.doc.sections.slice(1).map((s) => s.title), BODY, seen.join(", "))
})

// ---- lines built here: words at 0.5 × size a character, spaced to fill their column

const W = 612, H = 792
function words(text, x0, x1, y, size, fill) {
  const ws = text.split(" ")
  const widths = ws.map((w) => w.length * size * 0.5)
  const natural = widths.reduce((a, b) => a + b, 0)
  const space = fill && ws.length > 1 ? (x1 - x0 - natural) / (ws.length - 1) : size * 0.25
  let x = x0
  return ws.map((w, i) => { const b = [w, x / W, (y - size) / H, (x + widths[i]) / W, y / H]; x += widths[i] + space; return b })
}
function line(ws, size, f, lb) {
  const b = [Math.min(...ws.map((w) => w[1])), Math.min(...ws.map((w) => w[2])), Math.max(...ws.map((w) => w[3])), Math.max(...ws.map((w) => w[4]))]
  return { t: ws.map((w) => w[0]).join(" "), b: b, s: size, f: f || 0, lb: lb || 0, w: ws }
}
const VOCAB = "folding reader level paragraph claim sentence model summary column method result analysis evidence reading layout".split(" ")
let seed = 7
const pick = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return VOCAB[seed % VOCAB.length] }
// A paragraph's lines: n words each, made-up, a sentence ending every 12 words unless bare.
function paragraph(lines, per, bare) {
  const out = []
  let k = 0
  for (let i = 0; i < lines; i++) {
    const ws = []
    for (let j = 0; j < per; j++) { k++; ws.push(pick() + (!bare && k % 12 === 0 ? "." : "")) }
    if (!bare && i === lines - 1 && !/\.$/.test(ws[ws.length - 1])) ws[ws.length - 1] += "."
    out.push(ws.join(" "))
  }
  return out
}

// A paragraph's lines set close, as a journal sets them: words until the column is full, drawn again until a
// justified line's spaces stay under 0.4 × the size.
function filled(lines, width) {
  const out = []
  const wide = (w) => w.length * 5
  for (let i = 0; i < lines; i++) {
    let ws
    for (let tries = 0; tries < 200; tries++) {
      ws = []
      let used = 0
      for (;;) {
        const w = pick()
        if (used + wide(w) + 2.5 * ws.length > width) break
        ws.push(w)
        used += wide(w)
      }
      if ((width - used) / (ws.length - 1) < 4) break
    }
    if (i === lines - 1) ws[ws.length - 1] += "."
    out.push(ws.join(" "))
  }
  return out
}

test("R5-2: two columns PDFKit gave as one line, across a 14.45 pt gutter, are cut again: no unit's box spans both", () => {
  const L0 = 54, GAP = 14.45, L1 = (W - GAP) / 2, R0 = L1 + GAP, R1 = W - 54
  const left = filled(40, L1 - L0), right = filled(40, R1 - R0)
  const lines = left.map((t, i) => {
    const y = 90 + i * 12
    return line(words(t, L0, L1, y, 10, i < 39).concat(words(right[i], R0, R1, y, 10, i < 39)), 10)
  })
  const pages = [{ n: 1, size: [W, H], lines: lines }]
  const segs = M._.segmentsOf(pages).segs
  const across = segs.filter((s) => s.x0 < W / 2 && s.x1 > W / 2).length
  assert.ok(across >= 39, across + ": the justified lines come as one segment across the gutter, under the 1.5 × size cut")
  const cut = M._.recut(segs, { two: true, mid: W / 2 })
  assert.equal(cut.length, segs.length + across, "each cut at the gutter")
  const r = M.read(pages, meta(pages, ""))
  assert.ok(r.doc, r.problem)
  for (const id of Object.keys(r.links.map)) {
    for (const b of r.links.map[id].boxes) assert.ok(b[2] <= 0.5 || b[0] >= 0.5, id + "'s box " + JSON.stringify(b) + " spans the gutter")
  }
  const all = units(r.doc).map(textOf).join(" ")
  assert.ok(all.indexOf(left[39].split(" ").slice(-3).join(" ")) < all.indexOf(right[0].split(" ").slice(0, 3).join(" ")), "the left column reads before the right")
  // (a justified line across one wide column is not cut: its spaces are alike)
  const wide = [line(words(paragraph(1, 14)[0], 54, 558, 90, 10, true), 10)]
  assert.equal(M._.recut(M._.segmentsOf([{ n: 1, size: [W, H], lines: wide }]).segs, { two: true, mid: W / 2 }).length, 1)
})

test("R5-6: a numbered heading at the body's size, weight and pitch, left or centred, breaks the block and heads its section", () => {
  const x0 = 72, x1 = 540
  const rows = []
  const add = (t, opts) => rows.push(line(words(t, opts.centre ? (x0 + x1) / 2 - t.length * 2.5 : x0, opts.centre ? (x0 + x1) / 2 + t.length * 2.5 : x1, 90 + rows.length * 12, 10, opts.fill), 10))
  const para = () => paragraph(6, 12).forEach((t, i) => add(t, { fill: i < 5 }))
  para()
  add("1 Introduction", {})
  para()
  add("II. METHOD", { centre: true })
  para()
  const pages = [{ n: 1, size: [W, H], lines: rows }]
  const r = M.read(pages, meta(pages, ""))
  const seen = sectionsOf(r)
  assert.deepEqual(r.doc.sections.map((s) => [s.num, s.title]), [["1", "Introduction"], ["II", "METHOD"]], seen.join(", "))
  assert.equal(r.doc.sections[1].units.length, 1, seen.join(", "))
  assert.ok(units(r.doc).every((u) => !/Introduction|METHOD/.test(textOf(u))), "no heading inside a paragraph")
})

test("R5-5: running heads that alternate, one on odd pages and one on even, from page 2 of 9, are no unit", () => {
  const pages = []
  for (let n = 1; n <= 9; n++) {
    const lines = []
    if (n > 1) lines.push(line(words(n % 2 ? "Made-Up Journal of Folding Studies" : "Ana Example and Ben Sample", 220, 400, 40, 8, false), 8))
    paragraph(20, 12).forEach((t, i) => lines.push(line(words(t, 72, 540, 90 + i * 12, 10, i < 19), 10)))
    lines.push(line(words(String(n), 303, 309, 760, 9, false), 9))
    pages.push({ n: n, size: [W, H], lines: lines })
  }
  const kept = M._.dropFurniture(M._.segmentsOf(pages).segs, pages.length).filter((s) => /Made-Up Journal|Ana Example/.test(s.text))
  assert.deepEqual(kept.map((s) => s.page), [], "each head is on 4 of 9 pages, under half, but on every odd or every even page from 2")
  const r = M.read(pages, meta(pages, ""))
  assert.ok(r.doc, r.problem)
  for (const u of units(r.doc)) assert.ok(!/Made-Up Journal|Ana Example/.test(textOf(u)), u.id + " holds a running head")
})

test("R5-13: a paragraph of 5200 words with no end punctuation is cut at a word into units FoldCore takes", () => {
  const text = paragraph(434, 12, true)
  const pages = []
  for (let p = 0; p * 50 < text.length; p++) {
    pages.push({ n: p + 1, size: [W, H], lines: text.slice(p * 50, p * 50 + 50).map((t, i) => line(words(t, 72, 540, 80 + i * 12, 10, true), 10)) })
  }
  const r = M.read(pages, meta(pages, ""))
  assert.ok(r.doc, r.problem)
  const fm = C.model(r.doc)
  assert.ok(!fm.problem, "FoldCore reads the doc")
  const us = units(r.doc)
  assert.ok(us.length >= 2, "cut into " + us.length)
  for (const u of us) {
    assert.ok(u.sentences.reduce((a, x) => a + C.tokenize(x).length, 0) <= C.LIMITS.tokens, u.id + " is within FoldCore's 5000 tokens")
    for (const s of u.sentences) assert.ok(C.tokenize(s).length <= 3000, u.id + " has a sentence of " + C.tokenize(s).length + " tokens")
  }
  assert.equal(us.map(textOf).join(" "), text.join(" "), "every word kept, once, in order")
  const ss = M._.sentencesOf("one two three")
  assert.deepEqual(ss.map((s) => s.n), [3])
})

// A paragraph's lines set loosely, as a journal sets a line with few long words: spaces of 7 to 8.5 pt in a column.
function loose(lines, width) {
  const out = []
  for (let i = 0; i < lines; i++) {
    let ws
    for (let tries = 0; tries < 500; tries++) {
      ws = []
      let used = 0
      for (;;) {
        const w = pick()
        if (used + w.length * 5 + 7 * ws.length > width) break
        ws.push(w)
        used += w.length * 5
      }
      const space = (width - used) / (ws.length - 1)
      if (space >= 7 && space <= 8.5) break
    }
    if (i === lines - 1) ws[ws.length - 1] += "."
    out.push(ws.join(" "))
  }
  return out
}

test("R5-2: two columns' loosely justified lines given as one (spaces of 7 to 8.5 pt, a 14.45 pt gutter) are cut at the gutter", () => {
  const L0 = 54, GAP = 14.45, L1 = (W - GAP) / 2, R0 = L1 + GAP, R1 = W - 54
  // (one line in three set loosely, the others close, as a column of short and long words comes out)
  const mixed = (width) => { const l = loose(40, width), c = filled(40, width); return l.map((t, i) => (i % 3 === 0 ? t : c[i])) }
  const left = mixed(L1 - L0), right = mixed(R1 - R0)
  const lines = left.map((t, i) => line(words(t, L0, L1, 90 + i * 12, 10, i < 39).concat(words(right[i], R0, R1, 90 + i * 12, 10, i < 39)), 10))
  const pages = [{ n: 1, size: [W, H], lines: lines }]
  const segs = M._.segmentsOf(pages).segs
  const across = (ss) => ss.filter((s) => s.x0 < W / 2 - 10 && s.x1 > W / 2 + 10)
  const once = M._.recut(segs, { two: true, mid: W / 2 })
  const spaces = (s) => s.words.slice(1).map((w, i) => (w.x0 - s.words[i].x1).toFixed(1)).join(",")
  assert.ok(across(once).length >= 10, across(once).length + " lines recut's twice keeps whole, as " + (across(once)[0] ? spaces(across(once)[0]) : "none"))
  const fr = { two: true, mid: W / 2 }
  const twice = M._.cutGutter(once, fr)
  assert.deepEqual(across(twice).map(spaces), [], "every line cut at the gutter")
  assert.ok(M._.frameOf(twice, 10).two, "the frame then reads as two columns")
  const r = M.read(pages, meta(pages, ""))
  assert.ok(r.doc, r.problem)
  for (const id of Object.keys(r.links.map)) {
    for (const b of r.links.map[id].boxes) assert.ok(b[2] <= 0.5 || b[0] >= 0.5, id + "'s box " + JSON.stringify(b) + " spans the gutter")
  }
  assert.equal(units(r.doc).length, 2, "the left column's paragraph and the right's: " + units(r.doc).map((u) => u.id).join(", "))
  // (a loosely justified line across one wide column keeps its spaces alike, so it stays whole)
  const wide = { words: words(loose(1, 504)[0], 54, 558, 300, 10, true).map((w) => ({ t: w[0], x0: w[1] * W, y0: w[2] * H, x1: w[3] * W, y1: w[4] * H })), size: 10, page: 1, W: W, H: H, f: 0, lb: 0 }
  wide.x0 = wide.words[0].x0; wide.x1 = wide.words[wide.words.length - 1].x1; wide.y0 = wide.words[0].y0; wide.y1 = wide.words[0].y1; wide.text = wide.words.map((w) => w.t).join(" ")
  assert.equal(M._.cutGutter(twice.concat([wide]), fr).length, twice.length + 1, "a wide line stays whole: " + spaces(wide))
})

test("R5-2: a line cut in two gives each side its own size and weight: a bold 9 pt abstract line beside a 10 pt one", () => {
  const ws = words("claim evidence measure reader level figure model", 54, 298, 200, 9, true).concat(words("approach system analysis level paragraph study", 313, 558, 200, 10, true))
  // (the line's size its characters' mean, bold for most of them, its first 7 words bold: as a line PDFKit gave whole)
  const chars = ws.map((w) => w[0].length), sizes = ws.map((_, i) => (i < 7 ? 9 : 10))
  const mean = chars.reduce((a, c, i) => a + c * sizes[i], 0) / chars.reduce((a, c) => a + c, 0)
  const pages = [{ n: 1, size: [W, H], lines: [line(ws, Math.round(mean * 2) / 2, 1, 7)] }]
  const segs = M._.segmentsOf(pages).segs
  assert.deepEqual(segs.map((s) => [s.words.length, s.size, s.f & 1, s.lb]), [[7, 9, 1, 7], [6, 10, 0, 0]], "line size " + Math.round(mean * 2) / 2)
})

test("R5-6: a bold start that names an abstract or the references mid-paper starts a paragraph, not a section", () => {
  for (const lead of [["Summary", "statistics."], ["Abstract", "reasoning", "tasks."], ["References", "to", "earlier", "work."], ["Summary."]]) {
    const rows = []
    const add = (t, o) => rows.push(line(words(t, 72 + (o.indent || 0), 540, 90 + rows.length * 12, 10, o.fill), 10, o.f, o.lb))
    const para = () => paragraph(4, 12).forEach((t, i) => add(t, { fill: i < 3, indent: i ? 0 : 10 }))
    add("1 Introduction", {}); para()
    add("2 Methods", {}); para()
    paragraph(4, 12).forEach((t, i) => add(i ? t : lead.join(" ") + " " + t.split(" ").slice(lead.length).join(" "), { fill: i < 3, indent: i ? 0 : 10, lb: i ? 0 : lead.length }))
    para()
    add("3 Results", {}); para()
    const pages = [{ n: 1, size: [W, H], lines: rows }]
    const r = M.read(pages, meta(pages, ""))
    const seen = sectionsOf(r)
    assert.deepEqual(r.doc.sections.map((s) => s.title), ["Introduction", "Methods", "Results"], lead.join(" ") + ": " + seen.join(", "))
    assert.equal(r.doc.sections[1].units.length, 3, lead.join(" ") + ": " + seen.join(", "))
    assert.ok(textOf(r.doc.sections[1].units[1]).startsWith(lead.join(" ")), "the bold start stays in its paragraph")
  }
  // (before the body's first heading, "Abstract:" run in names the abstract; "Summary statistics" with no stop after
  // its first word does not)
  for (const [start, ids] of [["Abstract: text", ["abstract", "S1"]], ["Summary statistics", ["S1"]]]) {
    const rows = []
    const add = (t, o) => rows.push(line(words(t, 72, 540, 90 + rows.length * 12, 10, o.fill), 10, o.f, o.lb))
    paragraph(4, 12).forEach((t, i) => add(i ? t : start + " " + t, { fill: i < 3, lb: i ? 0 : 2 }))
    add("1 Introduction", {}); paragraph(4, 12).forEach((t, i) => add(t, { fill: i < 3 }))
    const pages = [{ n: 1, size: [W, H], lines: rows }]
    const r = M.read(pages, meta(pages, ""))
    assert.deepEqual(r.doc.sections.map((s) => s.id), ids, start + ": " + sectionsOf(r).join(", "))
  }
})

test("R5-6: a short ragged line starting with a number mid-paragraph is no heading; one after a paragraph's end is", () => {
  const rows = []
  const add = (t, x1, fill) => rows.push(line(words(t, 72, x1, 90 + rows.length * 12, 10, fill), 10))
  add("1 Introduction", 150, false)
  paragraph(5, 12).forEach((t) => add(t, 540, true))
  add("2 Methods", 130, false)
  // (ragged right: no line filled, its sentences ending only at the paragraph's end)
  paragraph(6, 12, true).forEach((t, i) => add(i === 2 ? "12 Patients were seen in" : i === 5 ? t + "." : t, i === 2 ? 220 : 470, false))
  add("3 Results", 130, false)
  paragraph(5, 12).forEach((t) => add(t, 540, true))
  const pages = [{ n: 1, size: [W, H], lines: rows }]
  const r = M.read(pages, meta(pages, ""))
  assert.deepEqual(r.doc.sections.map((s) => s.title), ["Introduction", "Methods", "Results"], sectionsOf(r).join(", "))
  assert.ok(textOf(r.doc.sections[1].units[0]).includes("12 Patients were seen in"), "the line stays in its paragraph")
  // (1.3 line pitches below the line above, or a new paragraph after it, it is one)
  for (const how of ["gap", "indent"]) {
    const rs = []
    let y = 90
    const put = (t, x0, x1, fill) => { rs.push(line(words(t, x0, x1, y, 10, fill), 10)); y += 12 }
    paragraph(4, 12, true).forEach((t) => put(t, 72, 540, true))
    if (how === "gap") y += 6
    put("4 Discussion", 72, 150, false)
    paragraph(4, 12).forEach((t, i) => put(t, how === "indent" && i === 0 ? 82 : 72, 540, i < 3))
    const ps = [{ n: 1, size: [W, H], lines: rs }]
    const rr = M.read(ps, meta(ps, ""))
    assert.ok(rr.doc.sections.some((s) => s.title === "Discussion"), how + ": " + sectionsOf(rr).join(", "))
  }
})
