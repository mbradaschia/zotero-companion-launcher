// The fold reader's link map (ZoteroLauncher/Reader/FoldCore.js; docs/fold-reader/SPEC.md 5.4, 5.5; criteria 12 to 17):
// the PDF's words indexed, each unit found by its runs of three words, its boxes, the crops, the coverage, links.json.
const test = require("node:test")
const assert = require("node:assert/strict")
const C = require("../../ZoteroLauncher/Reader/FoldCore.js")
const F = require("./fold-fixture.js")

const m = C.model(F.doc())
const words = F.fakeWords(F.doc())
const map = C.linkMap(m, words.pages, words.sizes)

test("12: on the fake words every unit but the left-out and the garbled one is linked: 6 of 8", () => {
  assert.deepEqual(map.coverage, { linked: 6, total: 8 })
  const pages = {}
  for (const [id, e] of Object.entries(map.map)) pages[id] = e.page
  assert.deepEqual(pages, { "abstract1.1": 1, "S1.p1.1": 1, "S1.p2.1": 1, "S2.p1.1": 2, "S2.F1.cap": 2, "S2.SS1.p1.1": 2 })
  assert.equal(map.map["S2.SS1.p2.1"], undefined)
  assert.equal(map.map["A1.p1.1"], undefined)
  assert.equal(map.warn, false)
  assert.equal(C.coverageText(map.coverage), "Linked 6 of 8 paragraphs")
})

test("13: the hyphenated skim- / ming is joined, and S1.p1.1 still links", () => {
  const ix = C.indexWords(words.pages, words.sizes)
  const at = ix.words.findIndex((w) => w.w === "skimming")
  assert.ok(at >= 0, "skimming is one word")
  assert.equal(ix.words[at].boxes.length, 2, "with the boxes of both pieces")
  assert.ok(!ix.words.some((w) => w.w === "skim" || w.w === "ming"))
  assert.ok(map.map["S1.p1.1"])
  // a word the PDF wrote in two pieces on one line is one word too; one farther away is two
  const two = C.indexWords([{ n: 1, words: [["infor", 0.1, 0.1, 0.15, 0.114], ["mation", 0.1501, 0.1, 0.2, 0.114], ["next", 0.22, 0.1, 0.26, 0.114]] }], [[612, 792]])
  assert.deepEqual(two.words.map((w) => w.w), ["information", "next"])
  assert.equal(C.pdfNorm("Ｆｕｌｌ\u2014Text!"), "fulltext")
})

test("14: garbleAll words: coverage under 30% and the warning", () => {
  const g = F.fakeWords(F.doc(), { garbleAll: true })
  const r = C.linkMap(m, g.pages, g.sizes)
  assert.deepEqual(r.coverage, { linked: 2, total: 8 })
  assert.equal(r.warn, true)
  assert.equal(C.coverageText(r.coverage), "⚠︎ Linked 2 of 8 paragraphs (25%): this PDF may not be the text TextFold folded")
  const none = C.linkMap(m, [{ n: 1, words: [] }], [[612, 792]])
  assert.equal(none.noText, true)
  assert.deepEqual(none.crops, [[0.06, 0.05, 0.94, 0.95]])
})

test("15: every box is within 0 to 1 and on the unit's page (or carries its page); crops hold their page's words", () => {
  for (const [id, e] of Object.entries(map.map)) {
    for (const b of e.boxes) {
      assert.ok(b.length === 4 || b.length === 5, id)
      for (const v of b.slice(0, 4)) assert.ok(v >= 0 && v <= 1, id)
      assert.ok(b[0] <= b[2] && b[1] <= b[3], id)
      if (b.length === 5) assert.notEqual(b[4], e.page)
      const page = b.length === 5 ? b[4] : e.page
      const c = map.crops[page - 1]
      assert.ok(b[0] >= c[0] && b[1] >= c[1] && b[2] <= c[2] && b[3] <= c[3], id + " inside its page's crop")
    }
  }
  assert.equal(map.crops.length, 2)
  for (const p of words.pages) {
    const c = map.crops[p.n - 1]
    for (const w of p.words) assert.ok(w[1] >= c[0] && w[2] >= c[1] && w[3] <= c[2] && w[4] <= c[3], "page " + p.n + " " + w[0])
  }
  // a unit running onto the next page: its boxes there carry that page
  const d = F.doc()
  const pages = [{ n: 1, words: [] }, { n: 2, words: [] }]
  const ws = d.sections[1].units[0].sentences.join(" ").split(" ")
  ws.forEach((w, i) => { const p = i < 14 ? 0 : 1, y = p ? 0.1 : 0.85 + Math.floor(i / 7) * 0.02; pages[p].words.push([w, 0.1 + (i % 7) * 0.1, y, 0.18 + (i % 7) * 0.1, y + 0.014]) })
  const r = C.linkMap(C.model(d), pages, [[612, 792], [612, 792]])
  const e = r.map["S1.p1.1"]
  assert.ok(e)
  assert.equal(e.page, 1)
  assert.ok(e.boxes.some((b) => b[4] === 2), "a box on page 2 says so")
})

test("16: the map round-trips through links.json; another doc's or PDF's file is refused", () => {
  const pdf = { bytes: 12345, modified: "2026-11-01T10:00:00Z", pages: 2 }
  const file = C.linksFile(m, map, pdf)
  assert.equal(file.format, "zl-fold-links")
  assert.deepEqual(file.doc, { id: "pdf-fixture0001", lang: "en", levels_made: "2026-11-01T09:00:00" })
  const back = JSON.parse(JSON.stringify(file))
  const doc = { id: "pdf-fixture0001", lang: "en", levels_made: "2026-11-01T09:00:00" }
  assert.equal(C.linksValid(back, doc, pdf), true)
  assert.deepEqual(back.map, map.map)
  assert.equal(C.linksValid(back, Object.assign({}, doc, { id: "pdf-other" }), pdf), false, "another doc")
  assert.equal(C.linksValid(back, Object.assign({}, doc, { levels_made: "2026-11-02T09:00:00" }), pdf), false, "a refold")
  assert.equal(C.linksValid(back, doc, Object.assign({}, pdf, { bytes: 12346 })), false, "another PDF")
  assert.equal(C.linksValid(back, doc, Object.assign({}, pdf, { modified: "2026-11-02T10:00:00Z" })), false, "the PDF changed")
  const broken = JSON.parse(JSON.stringify(file))
  broken.map["S1.p1.1"].boxes[0][0] = 1.5
  assert.equal(C.linksValid(broken, doc, pdf), false, "a box out of the page")
  const page = JSON.parse(JSON.stringify(file))
  page.map["S1.p1.1"].page = 3
  assert.equal(C.linksValid(page, doc, pdf), false, "a page the PDF hasn't")
  assert.equal(C.linksValid(null, doc, pdf), false)
})

test("17: linkMap for the large doc's pages within 500 ms (median of 5)", () => {
  const big = F.bigDoc(), bm = C.model(big), bw = F.fakeWords(big, { skip: [], garble: [] })
  assert.ok(bw.pages.length >= 40)
  C.linkMap(bm, bw.pages, bw.sizes)
  const times = []
  let r
  for (let i = 0; i < 5; i++) { const t = process.hrtime.bigint(); r = C.linkMap(bm, bw.pages, bw.sizes); times.push(Number(process.hrtime.bigint() - t) / 1e6) }
  times.sort((a, b) => a - b)
  assert.ok(times[2] < 500, "linkMap took " + times[2].toFixed(1) + " ms on " + bw.pages.length + " pages")
  assert.ok(r.coverage.linked >= 230, "linked " + r.coverage.linked)
})
