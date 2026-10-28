// Glue's wrappers for the review tables (phase 11a): a review's files read and written through ReviewCore.js (the
// grid page runs the same file for what it draws). Merged into Glue (Glue.js); JSON in, JSON out.
function GlueReviews(RV) {
  return {
    reviewParse: function (text, id) { return RV.parseReview(text, id) },
    reviewText: function (review, now) { return RV.reviewText(review, now || "") },
    reviewNew: function (source, ctx, now) { return RV.newReview(source || {}, ctx || {}, now || "") },
    reviewSourceName: function (source) { return RV.sourceName(source || {}) },
    // A review's source as the launcher's search scope (Glue.searchBody's) and query; `gone`: its saved search deleted.
    reviewScope: function (source, searches) { return RV.searchScope(source || {}, searches || []) },
    reviewColumnParse: function (text, id) { return RV.parseColumn(text, id) },
    reviewColumnText: function (column) { return RV.columnText(column || {}) },
    reviewCells: function (text) { return RV.parseCells(text) },
    reviewSetCell: function (text, paper, value, now, by) { return RV.setCell(text, paper, value, now || "", by || "") },
    reviewValidId: function (id, prefix) { return RV.validId(id, prefix) }
  }
}

if (typeof module !== "undefined") module.exports = GlueReviews
