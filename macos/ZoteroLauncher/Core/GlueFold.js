// Glue's wrappers for the fold reader (docs/fold-reader/SPEC.md 6.1, 7.1; R5-SPEC.md 5.3): marks.json read and
// written through FoldCore.js (the reader's page runs the same file), a cached link map checked, the fold's input,
// merge and page object through FoldMake.js, and the paper menu's row. Merged into Glue (Glue.js); JSON in, JSON out.
function GlueFold(FC, V, FM) {
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
    // the fold command's stdin: { paper, model, force, only, doc } or { error }
    foldInput: function (doc, o) { return FM.foldInput(doc, o || {}) },
    // the doc with a fold's section event merged in (now: an ISO time)
    foldMerge: function (doc, event, now) { return FM.foldMerge(doc, event, now) },
    // the page's fold object (FR.fold) from the doc, fold.json, the plan and the window's live state
    foldView: function (doc, run, plan, live) { return FM.foldView(doc, run || null, plan || null, live || {}) },
    // links.json kept with a doc written again
    foldRelink: function (links, doc) { return FM.relink(links, doc) },
    foldCost: function (usd) { return FM.costText(usd) },
    // The paper menu's row (This paper, after the window row): on a paper only (not a note or a file); a group
    // library's paper has it unavailable. null when there's no row.
    foldMenuRow: function (details) {
      var item = details && details.item
      if (!item || item.itemType === "note" || item.itemType === "attachment") return null
      var lib = details.library
      var group = lib && lib.type ? lib.type !== "user" : Number(item.libraryID || 1) !== 1
      var pdf = firstPdf(details)
      return V.listRow({ rowId: "fold-read", icon: "", label: "Read with folds", trailing: "window", available: !group && !!pdf,
        detail: group ? "Your own library's papers only, for now" : pdf ? "Five levels, from every word to a map of the paper, beside its PDF" : "It has no PDF: the reader folds a paper from its PDF" })
    }
  }
}

if (typeof module !== "undefined") module.exports = GlueFold
