// The fold reader's own extraction (docs/fold-reader/R5-SPEC.md section 3, criteria R5-1 to R5-15): the synthetic
// paper's lines (FIXTURE.md section 6) read into the doc and its link map.
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const F = require("./fold-fixture.js")
const C = require("../../ZoteroLauncher/Reader/FoldCore.js")
const M = require("../../ZoteroLauncher/Reader/FoldMake.js")

const MADE = path.join(__dirname, "fixtures", "fold-reader", "made.json")
const paper = F.fakePaper()
const made = M.read(paper.pages, paper.meta)
const units = (doc) => doc.sections.reduce((a, s) => a.concat(s.units), [])
const textOf = (u) => u.sentences.join(" ")
const byId = (doc, id) => units(doc).find((u) => u.id === id)

test("R5-1: the sections and units of FIXTURE 6.3, in order, with their kinds, labels, texts and sentences", () => {
  assert.ok(made.doc, "a doc, not " + made.problem)
  assert.deepEqual(made.doc.sections.map((s) => [s.id, s.num, s.title, s.depth]), paper.expected.sections.map((s) => [s.id, s.num, s.title, s.depth]))
  for (const s of paper.expected.sections) {
    const got = made.doc.sections.find((x) => x.id === s.id)
    assert.deepEqual(got.units.map((u) => [u.id, u.kind, u.label || ""]), s.units.map((u) => [u.id, u.kind, u.label]), s.id)
    got.units.forEach((u, i) => {
      assert.equal(textOf(u), s.units[i].text, u.id + "'s text")
      if (s.units[i].sentences.length) assert.deepEqual(u.sentences, s.units[i].sentences, u.id + "'s sentences")
    })
  }
  assert.equal(units(made.doc).length, 14)
})

test("R5-2: reading order: the left column before the right, the abstract cutting the band; one column reads the same", () => {
  const ids = units(made.doc).map((u) => u.id)
  assert.deepEqual(ids.slice(0, 4), ["abstract.p1", "S1.p1", "S1.p2", "S2.p1"])
  const b = made.links.map["S1.p2"].boxes
  const firstRight = b.findIndex((x) => x[0] > 0.5)
  assert.ok(firstRight > 0 && b.slice(0, firstRight).every((x) => x[2] <= 0.5) && b.slice(firstRight).every((x) => x[0] > 0.5), "S1.p2: its left boxes, then its right")
  assert.ok(made.links.map["abstract.p1"].boxes.every((x) => x[1] < made.links.map["S1.p1"].boxes[0][1]), "the abstract above the columns")
  const one = F.fakePaper({ columns: 1 })
  const r1 = M.read(one.pages, one.meta)
  assert.deepEqual(units(r1.doc).map((u) => [u.id, u.kind, textOf(u)]), units(made.doc).map((u) => [u.id, u.kind, textOf(u)]))
})

test("R5-3: S1.p2 across the column break and S2.p1 across the page break are one unit each; page 2's boxes carry the page", () => {
  assert.equal(units(made.doc).filter((u) => /^S1\.p|^S2\.p/.test(u.id)).length, 3)
  const s1 = made.links.map["S1.p2"]
  assert.equal(s1.page, 1)
  assert.ok(s1.boxes.some((x) => x[0] < 0.5) && s1.boxes.some((x) => x[0] > 0.5), "both columns of page 1")
  const s2 = made.links.map["S2.p1"]
  assert.equal(s2.page, 1)
  const p2 = s2.boxes.filter((x) => x.length === 5)
  assert.ok(p2.length >= 1 && p2.every((x) => x[4] === 2), "its boxes on page 2 carry 2")
  assert.ok(s2.boxes.filter((x) => x.length === 4).length >= 1)
  assert.match(textOf(byId(made.doc, "S2.p1")), /beside the paper on this computer\. Nothing in the library/)
})

test("R5-4: skim- / ming reads skimming, OCR- / free reads OCR-free; each joined word has both halves' boxes", () => {
  const p1 = textOf(byId(made.doc, "S1.p1"))
  assert.match(p1, /is skimming for the main claim/)
  assert.ok(!p1.includes("skim-"), "no hyphen left")
  assert.match(textOf(byId(made.doc, "A1.p1")), /The OCR-free files/)
  // (the halves sit on two lines, so the unit has a box on each: the boxes equal the lines the generator placed)
  const words = paper.pages[0].lines.reduce((a, l) => a.concat(l.w), [])
  const skim = words.find((w) => w[0] === "skim-"), ming = words.find((w) => w[0] === "ming")
  const boxes = made.links.map["S1.p1"].boxes
  const holds = (b, w) => b[0] <= w[1] + 1e-6 && b[1] <= w[2] + 1e-6 && b[2] >= w[3] - 1e-6 && b[3] >= w[4] - 1e-6
  assert.ok(boxes.some((b) => holds(b, skim)), "a box holds skim-")
  assert.ok(boxes.some((b) => holds(b, ming)), "a box holds ming")
  const w2 = paper.pages[1].lines.reduce((a, l) => a.concat(l.w), [])
  const ocr = w2.find((w) => w[0] === "OCR-"), free = w2.find((w) => w[0] === "free")
  assert.ok(made.links.map["A1.p1"].boxes.some((b) => holds(b, ocr)) && made.links.map["A1.p1"].boxes.some((b) => holds(b, free)))
})

test("R5-5: no unit holds the running head, a page number or the stamp; the title, names and affiliation are no unit", () => {
  const all = units(made.doc).map(textOf).join(" \n ")
  for (const s of ["Rivera and Okafor", "arXiv", "cs.HC", "Ana Rivera", "Example University", "ana@example.org", "A Small Synthetic Study"]) assert.ok(!all.includes(s), s)
  for (const u of units(made.doc)) assert.ok(!/^\d+$/.test(textOf(u)), u.id + " is no page number")
  assert.equal(made.doc.title, paper.meta.title)
  const noMeta = M.read(paper.pages, Object.assign({}, paper.meta, { title: "" }))
  assert.equal(noMeta.doc.title, "Folding a Paper: A Small Synthetic Study", "the title block, without Zotero's title")
})

test("R5-6: headings: numbered depths, the appendix by its size, the run-in Abstract split, References as bib", () => {
  const s = (id) => made.doc.sections.find((x) => x.id === id)
  assert.deepEqual([s("S1").num, s("S1").title, s("S1").depth], ["1", "Introduction", 1])
  assert.deepEqual([s("S2.SS1").num, s("S2.SS1").title, s("S2.SS1").depth], ["2.1", "Results", 2])
  assert.deepEqual([s("A1").num, s("A1").title, s("A1").depth], ["", "Appendix A: Materials", 1])
  assert.deepEqual([s("abstract").title, s("abstract").units[0].kind], ["Abstract", "abstract"])
  assert.ok(!textOf(s("abstract").units[0]).startsWith("Abstract"), "the run-in heading is not in its paragraph")
  assert.equal(made.links.map["abstract.p1"].boxes[0][0] > 54 / 612 + 0.01, true, "nor in its first box")
  assert.equal(s("bib").title, "References")
  assert.deepEqual([M._.depthOf("3 Results"), M._.depthOf("III. Results"), M._.depthOf("3.2 Data"), M._.depthOf("A.1 Proofs"), M._.depthOf("3.2.1 More")], [1, 1, 2, 2, 3])
})

test("R5-7: Figure 1's and Table 1's captions; the figure's labels and the table's cells in no unit", () => {
  assert.deepEqual(["kind", "label"].map((k) => byId(made.doc, "S2.F1.cap")[k]), ["caption", "Figure 1"])
  assert.deepEqual(["kind", "label"].map((k) => byId(made.doc, "S2.T1.cap")[k]), ["caption", "Table 1"])
  const words = units(made.doc).reduce((a, u) => a.concat(textOf(u).split(" ")), [])
  for (const w of ["0.5", "1.0", "Seconds", "Folded"]) assert.ok(!words.includes(w), w)
  for (const u of units(made.doc)) for (const t of ["0.5 1.0", "Level Seconds", "Full 68", "Folded 41"]) assert.ok(!textOf(u).includes(t), u.id + " holds " + t)
  assert.deepEqual(["Fig. 2.", "Figure 3:", "Table 4 |", "Tab. 5", "Scheme 1:"].map(M._.captionLabel), ["Figure 2", "Figure 3", "Table 4", "Table 5", "Scheme 1"])
})

test("R5-8: an equation, a list item without its bullet, references by their hanging indent, a footnote in Notes", () => {
  assert.equal(byId(made.doc, "S2.e1").kind, "equation")
  assert.equal(byId(made.doc, "S2.SS1.i1").kind, "list item")
  assert.equal(textOf(byId(made.doc, "S2.SS1.i1")), "The study had only twelve readers, all from one field.")
  assert.deepEqual(["bib.r1", "bib.r2"].map((id) => byId(made.doc, id).kind), ["reference", "reference"])
  assert.equal(textOf(byId(made.doc, "bib.r1")), "[1] A. Author. A made-up paper on reading. Example Press, 2020.")
  const sx = made.doc.sections[made.doc.sections.length - 1]
  assert.deepEqual([sx.id, sx.title, sx.units.map((u) => [u.id, u.kind])], ["Sx", "Notes", [["Sx.n1", "footnote"]]])
})

test("R5-9: sentences: section 1's exactly, et al. inside one, the fillers one each; each the text between its tokens' a and b", () => {
  const doc = F.doc()
  const s = (id) => doc.sections.reduce((a, x) => a.concat(x.units), []).find((u) => u.id === id).sentences
  assert.deepEqual(byId(made.doc, "S1.p1").sentences, s("S1.p1.1"))
  assert.ok(byId(made.doc, "S1.p1").sentences.includes("Most of that reading is skimming for the main claim (Lee et al., 2021)."))
  assert.deepEqual(byId(made.doc, "S1.p2").sentences, s("S1.p2.1").concat(F.FILLERS.slice(0, 3)))
  assert.deepEqual(byId(made.doc, "abstract.p1").sentences, s("abstract1.1"))
  assert.deepEqual(byId(made.doc, "A1.p1").sentences, [s("A1.p1.1")[0], F.FILLERS[4]])
  for (const u of units(made.doc)) {
    const text = textOf(u)
    const toks = C.tokenize(text)
    const ranges = C.splitSentences(toks)
    assert.deepEqual(u.sentences, ranges.map((r) => text.slice(toks[r[0]].a, toks[r[1] - 1].b)), u.id)
  }
})

test("R5-10: before a fold: evidence [0], no key, takeaway or topic; local provenance; FoldCore reads it, Key shows the first sentence in the serif", () => {
  for (const u of units(made.doc)) assert.deepEqual([u.evidence, u.key, u.takeaway, u.topic, u.role], [[0], "", "", "", "context"], u.id)
  for (const s of made.doc.sections) assert.deepEqual([s.takeaway, s.topic], ["", ""])
  assert.equal(made.doc.provenance.local, true)
  assert.equal(made.doc.provenance.ai_generated, false)
  assert.equal(made.doc.id, "pdf-0123456789abcdef")
  assert.deepEqual(made.doc.written, ["topic", "takeaway", "key"])
  assert.equal(made.doc.source.extractor, M.EXTRACTOR)
  const m = C.model(made.doc)
  assert.ok(!m.problem, JSON.stringify(m.problem))
  const u = m.units["S1.p1"]
  assert.equal(C.plainText(C.pieces(u, "key")), "Researchers read many papers each week [1, 2].")
  assert.equal(C.font(u, "key"), "paper")
})

test("R5-11: the link map is exact: the boxes FIXTURE placed, within 1e-5; 14 of 14 linked; linksValid holds", () => {
  for (const s of paper.expected.sections) {
    for (const e of s.units) {
      const got = made.links.map[e.id]
      assert.ok(got, e.id + " is linked")
      assert.equal(got.page, e.page, e.id + "'s page")
      assert.equal(got.boxes.length, e.boxes.length, e.id + "'s box count")
      got.boxes.forEach((b, i) => {
        assert.equal(b.length, e.boxes[i].length, e.id + " box " + i)
        b.forEach((v, k) => assert.ok(Math.abs(v - e.boxes[i][k]) <= 1e-5, e.id + " box " + i + "[" + k + "] " + v + " vs " + e.boxes[i][k]))
      })
    }
  }
  assert.deepEqual(made.links.coverage, { linked: 14, total: 14 })
  const pdf = { bytes: paper.meta.pdf.bytes, modified: paper.meta.pdf.modified, pages: 3 }
  assert.ok(C.linksValid(made.links, { id: made.doc.id, lang: made.doc.lang, levels_made: "" }, pdf))
  assert.equal(made.links.crops.length, 3)
  const again = M.relink(made.links, Object.assign({}, made.doc, { provenance: Object.assign({}, made.doc.provenance, { levels_made: "2026-11-02T10:00:00" }) }))
  assert.ok(C.linksValid(again, { id: made.doc.id, lang: "en", levels_made: "2026-11-02T10:00:00" }, pdf), "relink: the doc's new identity")
  assert.deepEqual(again.map, made.links.map)
})

test("R5-12: two reads give byte-identical JSON; every id matches ID and is unique; made.json is the golden", () => {
  const again = M.read(F.fakePaper().pages, F.fakePaper().meta)
  assert.equal(JSON.stringify(again), JSON.stringify(made))
  const ids = made.doc.sections.map((s) => s.id).concat(units(made.doc).map((u) => u.id))
  for (const id of ids) assert.match(id, C.ID)
  assert.equal(new Set(ids).size, ids.length)
  if (process.env.FOLD_WRITE_MADE) fs.writeFileSync(MADE, JSON.stringify({ doc: made.doc, links: made.links }, null, 1) + "\n")
  assert.deepEqual(JSON.parse(fs.readFileSync(MADE, "utf8")), { doc: made.doc, links: made.links }, "made.json (a change to it is a reviewed change)")
})

// n one-line list items, 55 to a page, one column: for the too-long limit.
function manyUnits(n) {
  const pages = []
  for (let i = 0; i < n; i++) {
    const pn = Math.floor(i / 55)
    if (!pages[pn]) pages[pn] = { n: pn + 1, size: [612, 792], lines: [] }
    const top = (60 + (i % 55) * 12) / 792
    const words = ["•", "Item", String(i + 1), "ends", "here."]
    let x = 54
    const w = words.map((t) => { const o = [t, x / 612, top, (x + t.length * 5) / 612, top + 10 / 792]; x += t.length * 5 + 2.5; return o })
    pages[pn].lines.push({ t: words.join(" "), b: [w[0][1], top, w[4][3], top + 10 / 792], s: 10, f: 0, lb: 0, w })
  }
  return pages
}

test("R5-13: a scan gives scan; one empty page of three gives a doc; 5001 units give too-long", () => {
  const scan = F.fakePaper({ scan: true })
  assert.equal(M.read(scan.pages, scan.meta).problem, "scan")
  const gap = F.fakePaper({ scan: true, empty: [2] })
  const r = M.read(gap.pages, gap.meta)
  assert.ok(r.doc, "a doc")
  assert.equal(r.stats.textPages, 2)
  assert.ok(!units(r.doc).some((u) => u.id === "bib.r1"), "page 2's units are not there")
  const big = manyUnits(5001)
  const meta = Object.assign({}, paper.meta, { pdf: Object.assign({}, paper.meta.pdf, { pages: big.length }) })
  const t = M.read(big, meta)
  assert.equal(t.problem, "too-long")
  assert.equal(t.stats.units, 5001)
  assert.ok(M.read(manyUnits(5000), meta).doc, "5000 is still a doc")
})

test("R5-14: references, footnotes and equations have no pieces below Full; Topic shows bib and Sx only as heading rows", () => {
  const m = C.model(made.doc)
  for (const id of ["bib.r1", "bib.r2", "Sx.n1", "S2.e1"]) {
    assert.ok(C.pieces(m.units[id], "full").length > 0, id + " at Full")
    for (const lv of ["brief", "key", "takeaway", "topic"]) assert.deepEqual(C.pieces(m.units[id], lv), [], id + " at " + lv)
  }
  const closed = C.topicCards(m, false)
  assert.ok(!closed.some((c) => c.id === "bib" || c.id === "Sx"), "behind the back-matter toggle")
  const open = C.topicCards(m, true)
  assert.deepEqual(open.filter((c) => c.id === "bib" || c.id === "Sx").map((c) => c.kind), ["head", "head"])
  const s2 = open.find((c) => c.id === "S2")
  assert.ok(!s2.chips.some((c) => c.unit === "S2.e1"), "no chip for the equation")
})

test("R5-15: the budget: 40 pages read within 400 ms", () => {
  const p = F.fakePaper({ pages: 40 })
  M.read(p.pages, p.meta)
  const t0 = process.hrtime.bigint()
  const r = M.read(p.pages, p.meta)
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  assert.ok(r.doc && r.stats.pages === 40)
  assert.ok(ms < 400, ms + " ms")
})

test("the read's edges: ligatures and soft hyphens cleaned; nothing given is no text", () => {
  assert.equal(M._.clean("eﬃcient re­ad"), "efficientread")
  assert.equal(M.read([], {}).problem, "scan")
  assert.equal(M.read(null, null).problem, "scan")
})

// ---- the app's glue (R5-SPEC 5.3, criterion R5-26)

const Glue = require("../../ZoteroLauncher/Core/Glue.js")
const INPUT = path.join(__dirname, "fixtures", "fold-reader", "fold-input.json")
const event = (id, units, extra) => Object.assign({ type: "section", id, model: "lab:m1", cached: false, section: { takeaway: "Section " + id + " folded", topic: "Section" },
  units: units.map((u) => ({ id: u, role: "claim", evidence: [0], key: "A short claim. Its reason.", takeaway: "A short claim", topic: "claim" })), warnings: [] }, extra || {})

test("R5-26: foldInput: the foldable sections and units only, the paper and model; fold-input.json is its golden; over 4 MB is an error", () => {
  const input = Glue.foldInput(made.doc, { paper: "1:ABCD1234", model: "default" })
  assert.deepEqual(Object.keys(input), ["paper", "model", "force", "only", "doc"])
  assert.deepEqual([input.paper, input.model, input.force, input.only], ["1:ABCD1234", "default", false, null])
  assert.deepEqual(input.doc.sections.map((s) => s.id), ["abstract", "S1", "S2", "S2.SS1", "A1"], "bib and Sx hold only apparatus")
  const s2 = input.doc.sections.find((s) => s.id === "S2")
  assert.deepEqual(s2.units.map((u) => [u.id, u.kind, u.label]), [["S2.p1", "paragraph", undefined], ["S2.F1.cap", "caption", "Figure 1"], ["S2.T1.cap", "caption", "Table 1"]])
  assert.deepEqual(Object.keys(s2.units[0]), ["id", "kind", "sentences"])
  if (process.env.FOLD_WRITE_MADE) fs.writeFileSync(INPUT, JSON.stringify(input, null, 1) + "\n")
  assert.deepEqual(JSON.parse(fs.readFileSync(INPUT, "utf8")), input)
  assert.deepEqual(Glue.foldInput(made.doc, { paper: "1:ABCD1234", model: "lab:m1", force: true, only: ["S1"] }).only, ["S1"])
  const huge = JSON.parse(JSON.stringify(made.doc))
  huge.sections[1].units[0].sentences = [new Array(4.2e6).join("x")]
  assert.match(Glue.foldInput(huge, { paper: "1:ABCD1234" }).error, /4 MB/)
})

test("R5-26: foldMerge sets a section's units and made, keeps local until the last foldable section, lists the models, sets levels_made", () => {
  let d = Glue.foldMerge(made.doc, event("S1", ["S1.p1", "S1.p2", "nope"]), "2026-11-06T10:00:00.123Z")
  const s1 = d.sections.find((s) => s.id === "S1")
  assert.deepEqual([s1.made, s1.model, s1.takeaway, s1.topic], ["ai", "lab:m1", "Section S1 folded", "Section"])
  assert.deepEqual(["role", "evidence", "key", "takeaway", "topic"].map((k) => s1.units[0][k]), ["claim", [0], "A short claim. Its reason.", "A short claim", "claim"])
  assert.deepEqual([d.provenance.ai_generated, d.provenance.model, d.provenance.levels_made, d.provenance.local], [true, "lab:m1", "2026-11-06T10:00:00", true])
  assert.equal(made.doc.sections[1].made, undefined, "the doc given is not changed")
  assert.ok(!units(d).some((u) => u.id === "nope"))
  d = Glue.foldMerge(d, event("abstract", ["abstract.p1"], { model: "other:m2" }), "2026-11-06T10:01:00Z")
  d = Glue.foldMerge(d, event("S2", ["S2.p1", "S2.F1.cap", "S2.T1.cap"]), "2026-11-06T10:02:00Z")
  d = Glue.foldMerge(d, event("S2.SS1", ["S2.SS1.p1", "S2.SS1.i1"]), "2026-11-06T10:03:00Z")
  assert.equal(d.provenance.local, true, "A1 still to fold")
  d = Glue.foldMerge(d, event("A1", ["A1.p1", "A1.p2"]), "2026-11-06T10:04:00Z")
  assert.deepEqual([d.provenance.local, d.provenance.model, d.provenance.levels_made], [false, "other:m2, lab:m1", "2026-11-06T10:04:00"])
  assert.equal(d.sections.find((s) => s.id === "bib").made, undefined, "bib holds only apparatus: never folded")
  assert.deepEqual(Glue.foldMerge(made.doc, event("S9", ["S9.p1"]), "2026-11-06T10:00:00Z"), made.doc, "a section the doc doesn't have: nothing")
  const m = C.model(d)
  assert.ok(!m.problem)
  assert.equal(C.font(m.units["S1.p1"], "key"), "ui", "folded words are in the sans")
  // the marks made on the unfolded doc keep their place on the folded one
  const m0 = C.model(made.doc)
  let store = C.emptyStore({ paper: "1:ABCD1234", doc: { id: m0.id, lang: "en" } })
  const anchors = [["S1.p1", 2, 4], ["S2.p1", 0, 3], ["A1.p2", 1, 2], ["bib.r1", 0, 1]]
  anchors.forEach(([u, from, to], i) => {
    const quote = C.plainText(C.pieces(m0.units[u], "full").slice(from, to + 1).map((p, k, all) => (k === all.length - 1 ? Object.assign({}, p, { sp: "" }) : p)))
    store = C.addMark(store, { unit: u, from, to, quote, highlight: true }, "highlight", "2026-11-06T10:00:00.000Z", () => (i + 1) / 10).store
  })
  const re = C.reanchor(m, store)
  assert.deepEqual([re.lost, re.moved], [0, 0])
})

test("R5-26: foldView gives every kind of 6.2 from its situation", () => {
  const plan = { model: "lab:m1", name: "Lab model", provider: "Lab", sections: 5, calls: 5, cached: 1, inputTokens: 4000, outputTokens: 900, costUsd: 0.123 }
  const v = (doc, run, pl, live) => Glue.foldView(doc, run, pl, live)
  const partly = Glue.foldMerge(made.doc, event("S1", ["S1.p1", "S1.p2"]), "2026-11-06T10:00:00Z")
  let all = made.doc
  for (const id of ["abstract", "S1", "S2", "S2.SS1", "A1"]) all = Glue.foldMerge(all, event(id, []), "2026-11-06T10:00:00Z")
  const u = v(made.doc, null, plan, { runner: "ok" })
  assert.deepEqual(u, { kind: "unfolded", done: 0, total: 5, failed: [], error: "", again: false, left: ["abstract", "S1", "S2", "S2.SS1", "A1"], model: "lab:m1", name: "Lab model",
    calls: 5, cached: 1, cost: "$0.12", disabled: "" })
  assert.equal(v(made.doc, null, null, {}).calls, null, "before the plan")
  assert.equal(v(partly, { status: "folding" }, plan, { folding: true, runner: "ok" }).kind, "folding")
  assert.deepEqual(["kind", "done"].map((k) => v(partly, { status: "stopped", sections: { S1: "done" } }, plan, { runner: "ok" })[k]), ["stopped", 1])
  assert.equal(v(partly, { status: "folding", sections: { S1: "done" } }, plan, { runner: "ok" }).kind, "stopped", "a run left folding reads as stopped")
  const part = v(partly, { status: "partial", sections: { S1: "done", S2: "failed" }, errors: { S2: "the model refused" } }, plan, { runner: "ok" })
  assert.deepEqual([part.kind, part.failed, part.error], ["partial", ["S2"], "the model refused"])
  assert.equal(v(made.doc, null, plan, { runner: "ok", pdfChanged: true }).kind, "pdf-changed")
  assert.equal(v(partly, null, plan, { runner: "ok", pdfChanged: true }).kind, "stopped", "pdf-changed only when nothing is folded")
  const noAi = v(made.doc, null, { error: "no AI model is set up", kind: "setup" }, { runner: "ok" })
  assert.deepEqual([noAi.kind, noAi.disabled], ["no-ai", "no-ai"])
  assert.deepEqual(["kind", "disabled"].map((k) => v(made.doc, null, null, { runner: "missing" })[k]), ["no-runner", "no-runner"])
  assert.deepEqual(["kind", "disabled"].map((k) => v(made.doc, null, null, { runner: "old" })[k]), ["old-runner", "old-runner"])
  const kinds = { key: "ai-key", signin: "ai-signin", limit: "ai-limit", busy: "ai-busy", network: "ai-offline", setup: "no-ai" }
  for (const k of Object.keys(kinds)) {
    const x = v(partly, { status: "stopped", stop: { kind: k, error: "it said no" } }, plan, { runner: "ok" })
    assert.deepEqual([x.kind, x.error], [kinds[k], "it said no"], k)
    assert.equal(v(made.doc, null, plan, { runner: "ok", stop: { kind: k, error: "now" } }).kind, kinds[k], "live " + k)
  }
  assert.equal(v(made.doc, null, { error: "the key was refused", kind: "key" }, { runner: "ok" }).kind, "ai-key", "a plan's error")
  const f = v(all, null, plan, { runner: "ok" })
  assert.deepEqual([f.kind, f.done, f.total, f.disabled], ["folded", 5, 5, ""])
  assert.equal(v(all, null, plan, { runner: "missing" }).kind, "folded", "a folded paper stays folded without the runner")
  const d9 = Object.assign({}, F.doc(), { provenance: { made_with: "TextFold 0.9", ai_generated: true, model: "x", levels_made: "2026-11-01T09:00:00" } })
  assert.equal(v(d9, null, plan, { runner: "ok" }).kind, "folded", "an earlier doc with AI levels counts as folded (D9)")
  assert.equal(v(Object.assign({}, made.doc, { lang: "zh" }), null, plan, { runner: "ok" }).disabled, "cjk")
  assert.equal(v(Object.assign({}, made.doc, { lang: "ja" }), null, plan, { runner: "ok" }).disabled, "cjk")
  assert.equal(v(made.doc, null, plan, { runner: "ok", scan: true }).disabled, "scan")
  assert.equal(v(made.doc, null, Object.assign({}, plan, { costUsd: null }), { runner: "ok" }).cost, "")
})

test("R5-26: after Fold again, a Stop, a refused key and failed sections show how that run ended, not folded", () => {
  const plan = { model: "lab:m1", name: "Lab model", provider: "Lab", sections: 5, calls: 5, cached: 0, inputTokens: 4000, outputTokens: 900, costUsd: 0.123 }
  const v = (doc, run, live) => Glue.foldView(doc, run, plan, Object.assign({ runner: "ok" }, live || {}))
  let all = made.doc
  for (const id of ["abstract", "S1", "S2", "S2.SS1", "A1"]) all = Glue.foldMerge(all, event(id, []), "2026-11-06T10:00:00Z")
  assert.equal(v(all, null).kind, "folded")
  // Fold again, stopped after one section: stopped, 1 of 5, the four others left to finish
  const stopped = v(all, { force: true, status: "stopped", sections: { abstract: "done" } })
  assert.deepEqual([stopped.kind, stopped.done, stopped.total, stopped.again, stopped.left], ["stopped", 1, 5, true, ["S1", "S2", "S2.SS1", "A1"]])
  // Fold again, the key refused midway (live, and as fold.json kept it)
  for (const run of [{ force: true, status: "stopped", sections: { abstract: "done" }, stop: { kind: "key", error: "the key was refused" } }]) {
    const k = v(all, run)
    assert.deepEqual([k.kind, k.error, k.done], ["ai-key", "the key was refused", 1])
    assert.equal(v(all, { force: true, status: "folding", sections: {} }, { stop: { kind: "key", error: "now" } }).kind, "ai-key", "live")
  }
  // Fold again, two sections failed: partial, those two
  const part = v(all, { force: true, status: "partial", sections: { abstract: "done", S1: "done", S2: "failed", "S2.SS1": "done", A1: "failed" }, errors: { S2: "the reply has no JSON" } })
  assert.deepEqual([part.kind, part.failed, part.error, part.done], ["partial", ["S2", "A1"], "the reply has no JSON", 3])
  // Fold again that finished: folded; a first fold that stopped counts the doc's sections as before
  assert.equal(v(all, { force: true, status: "done", sections: { abstract: "done", S1: "done", S2: "done", "S2.SS1": "done", A1: "done" } }).kind, "folded")
  const first = v(Glue.foldMerge(made.doc, event("S1", ["S1.p1", "S1.p2"]), "2026-11-06T10:00:00Z"), { status: "stopped", sections: { S1: "done" } })
  assert.deepEqual([first.kind, first.done, first.again, first.left], ["stopped", 1, false, ["abstract", "S2", "S2.SS1", "A1"]])
  // Finish after that stop carries the abstract (FoldWindowModel.carried), so a second stop after S1 counts both, and
  // the next Finish asks for the three left; a stopped Try it again of S2 after a partial counts the four it had
  const second = v(all, { force: true, status: "stopped", sections: { abstract: "done", S1: "done" } })
  assert.deepEqual([second.kind, second.done, second.left], ["stopped", 2, ["S2", "S2.SS1", "A1"]])
  const retry = v(all, { force: true, status: "stopped", sections: { abstract: "done", S1: "done", "S2.SS1": "done", A1: "done" } })
  assert.deepEqual([retry.kind, retry.done, retry.left], ["stopped", 4, ["S2"]])
  // a Fold again that stopped, then no runner or an old one: that wins, as it can't fold now (6.2), and disables
  for (const [runner, kind] of [["missing", "no-runner"], ["old", "old-runner"]]) {
    const gone = v(all, { force: true, status: "stopped", sections: { abstract: "done" } }, { runner: runner })
    assert.deepEqual([gone.kind, gone.disabled, gone.again, gone.done], [kind, kind, true, 1], runner + ": " + JSON.stringify(gone))
  }
})

test("R5-26: costText is Settings' money: under a cent, two decimals, nothing when unknown", () => {
  assert.equal(Glue.foldCost(0.004), "< $0.01")
  assert.equal(Glue.foldCost(0.123), "$0.12")
  assert.equal(Glue.foldCost(1.5), "$1.50")
  assert.equal(Glue.foldCost(null), "")
  assert.equal(M.costText(undefined), "")
  assert.equal(M.costText(0), "< $0.01")
})
