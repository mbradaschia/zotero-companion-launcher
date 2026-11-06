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

module.exports = { DOC_FILE, doc, units, fakeWords, bigDoc, blankPage, madeUpWords }
