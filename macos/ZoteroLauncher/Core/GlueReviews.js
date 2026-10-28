// Glue's wrappers for the review tables (phases 11a, 11b): a review's files read and written through ReviewCore.js (the
// grid page runs the same file for what it draws). Merged into Glue (Glue.js); JSON in, JSON out.
function GlueReviews(RV) {
  return {
    reviewParse: function (text, id) { return RV.parseReview(text, id) },
    reviewText: function (review, now) { return RV.reviewText(review, now || "") },
    reviewNew: function (source, ctx, now) { return RV.newReview(source || {}, ctx || {}, now || "") },
    reviewSourceName: function (source) { return RV.sourceName(source || {}) },
    // ⌘T on a list with a review already: its id (the newest changed), else "".
    reviewFor: function (reviews, source) { return RV.reviewFor(reviews || [], source || {}) },
    // A review's source as the launcher's search scope (Glue.searchBody's) and query; `gone`: its saved search deleted.
    reviewScope: function (source, searches) { return RV.searchScope(source || {}, searches || []) },
    reviewColumnParse: function (text, id) { return RV.parseColumn(text, id) },
    reviewColumnText: function (column) { return RV.columnText(column || {}) },
    reviewCells: function (text) { return RV.parseCells(text) },
    reviewSetCell: function (text, paper, value, now, by) { return RV.setCell(text, paper, value, now || "", by || "") },
    reviewValidId: function (id, prefix) { return RV.validId(id, prefix) },
    // Back to the AI's answer (an AI cell you edited): the file's new text, or null.
    reviewRestoreCell: function (text, paper, now) { return RV.restoreCell(text, paper, now || "") },
    // The job review-run reads (stdin), from what the page's Run asked: the AI columns as the files define them
    // (their fingerprint now, from the taxonomies in force), the cells asked for that are one of them. → the job, or
    // { error }.
    reviewRunJob: function (review, defs, ctx, jobs) {
      var r = review || {}
      var byId = {}
      RV.available(ctx || {}, defs || {}).forEach(function (c) { if (c.ai && !c.problem) byId[c.id] = c })
      var used = {}
      var list = (jobs || []).filter(function (j) { return j && byId[j.column] && /^\d+:[A-Z0-9]{8}$/.test(String(j.paper)) }).map(function (j) { used[j.column] = true; return { column: j.column, paper: j.paper } })
      if (!list.length) return { error: "Nothing to run: no AI cell was asked for" }
      var keys = ["id", "label", "kind", "reads", "shape", "length", "options", "evidence", "model", "taxonomy", "topic", "description", "hash"]
      var columns = Object.keys(used).sort().map(function (id) { var o = {}; keys.forEach(function (k) { if (byId[id][k] !== undefined) o[k] = byId[id][k] }); return o })
      return { review: String(r.id || ""), name: String(r.name || "Review"), columns: columns, jobs: list.slice(0, 200 * columns.length) }
    }
  }
}

if (typeof module !== "undefined") module.exports = GlueReviews
