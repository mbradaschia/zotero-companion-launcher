// Glue's wrappers for the fold reader (docs/fold-reader/SPEC.md 6.1, 7.1): marks.json read and written through
// FoldCore.js (the reader's page runs the same file), a cached link map checked, and the paper menu's row. Merged into
// Glue (Glue.js); JSON in, JSON out.
function GlueFold(FC, V) {
  // the first PDF on the paper that exists (the bridge's order, best first)
  function firstPdf(details) {
    return V.usableFiles(details, "external").filter(function (a) { return a.contentType === "application/pdf" || a.readerType === "pdf" })[0] || null
  }
  return {
    // marks.json's text → { store, dropped, damaged }
    foldMarksParse: function (text) { return FC.parseMarks(String(text == null ? "" : text)) },
    // a marks store (the page's) → { text, dropped } to write, or { error }
    foldMarksText: function (store) { return FC.marksText(store) },
    // a cached links.json still good for this doc and this PDF file
    foldLinksValid: function (links, doc, pdf) { return FC.linksValid(links, doc || {}, pdf || {}) },
    foldFirstPdf: function (details) { return firstPdf(details) },
    // The paper menu's row (This paper, after the window row): on a paper only (not a note or a file); a group
    // library's paper has it unavailable. null when there's no row.
    foldMenuRow: function (details) {
      var item = details && details.item
      if (!item || item.itemType === "note" || item.itemType === "attachment") return null
      var lib = details.library
      var group = lib && lib.type ? lib.type !== "user" : Number(item.libraryID || 1) !== 1
      var pdf = firstPdf(details)
      return V.listRow({ rowId: "fold-read", icon: "", label: "Read with folds", trailing: "window", available: !group,
        detail: group ? "Your own library's papers only, for now" : pdf ? "TextFold's five levels beside its PDF" : "TextFold's five levels (no PDF)" })
    }
  }
}

if (typeof module !== "undefined") module.exports = GlueFold
