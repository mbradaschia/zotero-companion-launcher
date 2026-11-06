// The fold reader's marks (ZoteroLauncher/Reader/FoldCore.js; docs/fold-reader/SPEC.md 5.6; criteria 18 to 21):
// a selection's anchor, the pieces a mark colours at each level, re-anchoring on another fold, marks.json read and written.
const test = require("node:test")
const assert = require("node:assert/strict")
const C = require("../../ZoteroLauncher/Reader/FoldCore.js")
const F = require("./fold-fixture.js")

const m = C.model(F.doc())
const NOW = "2026-11-06T10:00:00.000Z"
let seed = 1
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
const at = (u, lv) => C.pieces(m.units[u], lv)

test("18: a selection's anchor: Brief pieces to their full indices, Key pieces with m to min and max, AI words without m to the whole unit", () => {
  const brief = at("S2.p1.1", "brief").filter((p) => ["S2.p1.1:3", "S2.p1.1:4", "S2.p1.1:5", "S2.p1.1:gap2", "S2.p1.1:34"].includes(p.id)).map((p) => p.id)
  const a = C.anchor(m, brief, "irrelevant")
  assert.deepEqual([a.unit, a.from, a.to, a.highlight], ["S2.p1.1", 3, 34, true])
  assert.equal(a.quote.split(" ")[0], "folded", "the quote is the anchored words")
  const key = at("abstract1.1", "key").slice(0, 5).map((p) => p.id) // 3 17 19 k3 21
  const b = C.anchor(m, key, "Readers who fold the text")
  assert.deepEqual([b.from, b.to, b.highlight], [3, 21, true])
  const ai = at("abstract1.1", "key").slice(10, 14).map((p) => p.id) // k10..k13
  const c = C.anchor(m, ai, "They moved   between a")
  assert.deepEqual([c.unit, c.from, c.to, c.highlight, c.quote], ["abstract1.1", null, null, false, "They moved between a"])
  assert.equal(C.anchor(m, [], ""), null)
  // a note on a whole unit is kept; a highlight can't be made of it (the page disables the button)
  const n = C.addMark(C.emptyStore({ paper: "1:ABCD1234" }), c, "note", NOW, rand)
  assert.equal(n.mark.from, null)
  assert.match(n.mark.id, /^m-[a-z0-9]{10}$/)
})

test("19: a highlight on full tokens 24-25 of the abstract is on its pieces at Full, Brief, Key, Takeaway and the Topic chip", () => {
  const s = C.toggleHighlight(C.emptyStore({}), { unit: "abstract1.1", from: 24, to: 25, quote: "main claims", highlight: true }, NOW, rand).store
  for (const lv of ["full", "brief", "key", "takeaway", "topic"]) {
    const on = C.marked(s.marks, "abstract1.1", at("abstract1.1", lv))
    assert.deepEqual(Object.keys(on).sort(), ["abstract1.1:24", "abstract1.1:25"], lv)
  }
  assert.equal(C.highlighted(s.marks, { unit: "abstract1.1", from: 24, to: 25 }), true)
  assert.equal(C.highlighted(s.marks, { unit: "abstract1.1", from: 23, to: 25 }), false)
  const off = C.toggleHighlight(s, { unit: "abstract1.1", from: 24, to: 25, quote: "main claims", highlight: true }, NOW, rand)
  assert.equal(off.removed, true)
  assert.equal(off.store.marks.length, 0)
})

test("20: re-anchoring: an unchanged doc keeps every mark; a sentence moved to another unit moves it; a deleted quote is lost", () => {
  let s = C.emptyStore({ paper: "1:ABCD1234", doc: { id: m.id, lang: "en" } })
  const q = (u, from, to) => C.anchor(m, Array.from({ length: to - from + 1 }, (_, i) => u + ":" + (from + i)), "")
  s = C.addMark(s, q("S1.p2.1", 21, 33), "highlight", NOW, rand).store // No reader we know links each summary line back to the text.
  s = C.addMark(s, q("S2.SS1.p2.1", 0, 11), "note", NOW, rand).store // The study had only twelve readers, all from one field.
  s = C.addMark(s, { unit: "A1.p1.1", from: null, to: null, quote: "Readers read three papers", highlight: false }, "ask", NOW, rand).store
  const same = C.reanchor(m, s)
  assert.equal(same.moved, 0)
  assert.equal(same.lost, 0)
  assert.deepEqual(same.store.marks.map((k) => [k.unit, k.from, k.to]), s.marks.map((k) => [k.unit, k.from, k.to]))
  // the next fold: S1.p2.1's last sentence moved to S2.p1.1's start; the list item's sentence rewritten
  const d = F.doc()
  const moved = d.sections[1].units[1].sentences.pop()
  d.sections[1].units[1].evidence = [1]
  d.sections[2].units[0].sentences.unshift(moved)
  d.sections[3].units[1].sentences = ["The study was small."]
  d.provenance.levels_made = "2026-11-02T09:00:00"
  const r = C.reanchor(C.model(d), s)
  const [h, n, a] = r.store.marks
  assert.deepEqual([h.unit, h.from, h.to], ["S2.p1.1", 0, 12], "moved with its words")
  assert.equal(h.lost, undefined)
  assert.equal(n.lost, true, "its quote is gone: lost its place")
  assert.equal(a.lost, undefined, "a whole-unit mark stays while its unit does")
  assert.equal(r.moved, 1)
  assert.equal(r.lost, 1)
  assert.deepEqual(C.findQuote(m.units["S1.p1.1"], "papers  each week"), [3, 5])
  assert.equal(C.findQuote(m.units["S1.p1.1"], "apers each"), null, "a quote starts on a word's edge")
})

test("21: foldMarksParse drops invalid marks and unknown keys, caps at 5000, says a non-JSON text is damaged", () => {
  const good = { id: "m-abc123def", kind: "highlight", unit: "S1.p1.1", from: 3, to: 5, quote: "papers each week", text: "", created: NOW, updated: NOW, extra: 1 }
  const file = { format: "zl-fold-marks", version: 1, paper: "1:ABCD1234", doc: { id: "pdf-fixture0001", lang: "en" }, more: true, marks: [
    good,
    Object.assign({}, good, { id: "bad id" }),
    Object.assign({}, good, { id: "m-zzzzzz1", kind: "scribble" }),
    Object.assign({}, good, { id: "m-zzzzzz2", from: 6, to: 5 }),
    Object.assign({}, good, { id: "m-zzzzzz3", from: null, to: 5 }),
    Object.assign({}, good, { id: "m-zzzzzz4", quote: "x".repeat(2001) }),
    Object.assign({}, good, { id: "m-zzzzzz5", text: 7 }),
    Object.assign({}, good, { id: "m-zzzzzz6", unit: "S1 p1" }),
    Object.assign({}, good, { id: "m-zzzzzz7", from: null, to: null }),
    Object.assign({}, good) // (the same id twice)
  ] }
  const p = C.parseMarks(JSON.stringify(file))
  assert.equal(p.damaged, false)
  assert.equal(p.dropped, 8)
  assert.deepEqual(p.store.marks.map((k) => k.id), ["m-abc123def", "m-zzzzzz7"])
  assert.equal(p.store.marks[0].extra, undefined, "unknown keys dropped")
  assert.equal(p.store.more, undefined)
  const many = Object.assign({}, file, { marks: Array.from({ length: 5003 }, (_, i) => Object.assign({}, good, { id: "m-" + String(100000 + i) })) })
  const capped = C.parseMarks(JSON.stringify(many))
  assert.equal(capped.store.marks.length, 5000)
  assert.equal(capped.dropped, 3)
  for (const bad of ["{not json", "", "[]", JSON.stringify({ format: "other", version: 1, marks: [] }), JSON.stringify({ format: "zl-fold-marks", version: 2, marks: [] })]) {
    const d = C.parseMarks(bad)
    assert.equal(d.damaged, true, bad)
    assert.equal(d.store, null)
  }
  const out = C.marksText(p.store)
  assert.deepEqual(C.parseMarks(out.text).store, p.store, "written and read back the same")
  assert.ok(out.text.endsWith("\n"))
  assert.equal(C.marksText(null).error, "not a marks store")
  // the lost flag is the reader's, never written
  const lost = JSON.parse(JSON.stringify(p.store))
  lost.marks[0].lost = true
  assert.equal(JSON.parse(C.marksText(lost).text).marks[0].lost, undefined)
})
