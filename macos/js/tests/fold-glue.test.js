// The fold reader in the launcher's Glue (docs/fold-reader/SPEC.md 6.1, 7.1; criterion 54): the paper menu's row after
// the window row, for a paper only; the v key row after each o  w row; the marks and links wrappers.
const test = require("node:test")
const assert = require("node:assert/strict")
const Glue = require("../../ZoteroLauncher/Core/Glue.js")
const Views = require("../../js/lib/Views.js")
const F = require("./fold-fixture.js")
const C = require("../../ZoteroLauncher/Reader/FoldCore.js")

const pdf = { key: "ATTACH01", libraryID: 1, exists: true, contentType: "application/pdf", readerType: "pdf", filename: "paper.pdf", title: "PDF" }
const details = (itemType, o) => Object.assign({ item: { key: "ABCD1234", libraryID: 1, itemType, title: "A paper" }, paper: null, openAction: "open-pdf",
  attachments: [pdf], notes: [], tags: [], library: { libraryID: 1, name: "My Library", type: "user", editable: true } }, o || {})
const rowsOf = (d) => Glue.menu({ details: d }).rows

test("54: Glue.menu puts fold-read after window in This paper, for a paper only", () => {
  const rows = rowsOf(details("journalArticle"))
  const at = rows.findIndex((r) => r.rowId === "fold-read")
  assert.ok(at > 0, "the row is there")
  assert.equal(rows[at - 1].rowId, "window")
  const r = rows[at]
  assert.deepEqual([r.section, r.label, r.detail, r.trailing, r.available], ["This paper", "Read with folds", "TextFold's five levels beside its PDF", "window", true])
  assert.equal(rowsOf(details("journalArticle", { attachments: [] })).find((x) => x.rowId === "fold-read").detail, "TextFold's five levels (no PDF)")
  const missing = Object.assign({}, pdf, { exists: false })
  assert.equal(rowsOf(details("journalArticle", { attachments: [missing] })).find((x) => x.rowId === "fold-read").detail, "TextFold's five levels (no PDF)", "a missing file is no PDF")
  const group = rowsOf(details("journalArticle", { item: { key: "ABCD1234", libraryID: 5, itemType: "journalArticle" }, library: { libraryID: 5, name: "Lab", type: "group", editable: true } })).find((x) => x.rowId === "fold-read")
  assert.deepEqual([group.available, group.detail], [false, "Your own library's papers only, for now"])
  for (const t of ["note", "attachment"]) assert.ok(!rowsOf(details(t)).some((x) => x.rowId === "fold-read"), "none on a " + t)
  assert.ok(Glue.actions(details("book"), "", null, "", false, false, {}).some((x) => x.rowId === "fold-read"), "Glue.actions has it too")
  assert.ok(!Views.buildActions(details("book"), "", null, "", false, false, {}).some((x) => x.rowId === "fold-read"), "lib/Views.js (shared with the Linux launcher) unchanged")
})

test("54: Glue.keyRows has the v row after each o  w row, ⌥v in Alt mode", () => {
  const check = (rows) => {
    let n = 0
    rows.forEach((r, i) => {
      if (!/^(⌥)?o {2}(⌥)?w( |$)/.test(r.trailing)) return
      n++
      const v = rows[i + 1]
      assert.equal(v.label, "Read it with folds, in its own window", r.section)
      assert.equal(v.trailing, r.trailing.startsWith("⌥") ? "⌥v" : "v")
      assert.equal(v.section, r.section)
    })
    return n
  }
  assert.equal(check(Glue.keyRows("", null)), 1)
  assert.equal(check(Glue.keyRows("", { group: "results", alt: false })), 2)
  const alt = Glue.keyRows("", { group: "actions", alt: true })
  assert.equal(check(alt), 2)
  assert.ok(alt.some((r) => r.trailing === "⌥v"))
  assert.ok(Glue.keyRows("folds", null).some((r) => r.trailing === "v"), "found by its words")
})

test("the marks and links wrappers are FoldCore's", () => {
  const m = C.model(F.doc())
  const store = C.addMark(C.emptyStore({ paper: "1:ABCD1234", doc: { id: m.id, lang: "en" } }), { unit: "S1.p1.1", from: 3, to: 5, quote: "papers each week", highlight: true }, "highlight", "2026-11-06T10:00:00.000Z", () => 0.5).store
  const out = Glue.foldMarksText(store)
  assert.ok(out.text.endsWith("\n"))
  assert.deepEqual(Glue.foldMarksParse(out.text).store, store)
  assert.equal(Glue.foldMarksParse("{oops").damaged, true)
  assert.equal(Glue.foldMarksText({}).error, "not a marks store")
  const w = F.fakeWords(F.doc())
  const pdfId = { bytes: 1, modified: "2026-11-01T10:00:00Z", pages: 2 }
  const links = C.linksFile(m, C.linkMap(m, w.pages, w.sizes), pdfId)
  const docId = { id: m.id, lang: "en", levels_made: "2026-11-01T09:00:00" }
  assert.equal(Glue.foldLinksValid(JSON.parse(JSON.stringify(links)), docId, pdfId), true)
  assert.equal(Glue.foldLinksValid(links, docId, Object.assign({}, pdfId, { bytes: 2 })), false)
  assert.equal(Glue.foldFirstPdf(details("journalArticle")).key, "ATTACH01")
  assert.equal(Glue.foldFirstPdf(details("journalArticle", { attachments: [] })), null)
})
