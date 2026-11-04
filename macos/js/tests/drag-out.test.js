// A drag out of the app carries text (2026-11-04): a paper's reference line and a note's text (ReviewCore.js, used by
// the launcher through JavaScriptCore and by the review table's page), a chat message's grip (Core/GlueChat.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../../ZoteroLauncher/Review/ReviewCore.js");
const Glue = require("../../ZoteroLauncher/Core/Glue.js");

test("a paper's reference: APA 7's shape from the first creator, year, title and journal", () => {
  assert.equal(R.reference({ creator: "Sirmon et al.", year: "2011", title: "Resource orchestration to create <i>value</i>", publication: "Journal of Management" }),
    "Sirmon et al. (2011). Resource orchestration to create value. Journal of Management.");
  assert.equal(R.reference({ creator: "Sirmon and Hitt", year: "2011-03-01", title: "Managing resources.", publication: "" }), "Sirmon & Hitt (2011). Managing resources.");
  assert.equal(R.reference({ creator: "Doe", year: "2020", title: "Why firms fail?", publication: "AMR." }), "Doe (2020). Why firms fail? AMR.");
  assert.equal(R.reference({ creator: "", year: "", title: "A report", publication: "" }), "A report. (n.d.).");
  assert.equal(R.references([{ creator: "A", year: "2000", title: "X" }, { creator: "B", year: "2001", title: "Y" }]), "A (2000). X.\nB (2001). Y.");
});

test("a note's HTML as plain text: blocks on their lines, lists with dashes, entities read, no tags", () => {
  assert.equal(R.htmlText("<div data-schema-version=\"9\"><h1>Reading notes</h1><p>One &amp; two&nbsp;<b>bold</b><br>next</p><ul><li>a</li><li>b</li></ul><p>&#8220;q&#x201D; &lt;tag&gt;</p></div>"),
    "Reading notes\n\nOne & two bold\nnext\n\n- a\n- b\n\n“q” <tag>");
  assert.equal(R.htmlText("<table><tr><td>a</td><td>b</td></tr></table>"), "a\tb");
  assert.equal(R.htmlText("<style>p{}</style><p>x</p>"), "x");
  assert.equal(R.htmlText(""), "");
});

test("a chat message has a grip carrying its text as written (an answer's Markdown, escaped in the attribute)", () => {
  const html = Glue.chatHtml([{ role: "user", text: "Why \"this\" <now>?" }, { role: "assistant", text: "**A** & b", pending: false, failed: false, info: "" }], { cite: "D" });
  const grips = html.match(/<span class="grip" draggable="true"[^>]*data-text="[^"]*"/g) || [];
  assert.equal(grips.length, 2);
  assert.match(grips[0], /data-text="Why &quot;this&quot; &lt;now&gt;\?"/);
  assert.match(grips[1], /data-text="\*\*A\*\* &amp; b"/);
  assert.match(html, /<div class="body"><p><strong>A<\/strong>/);
  // still being written, or failed: no grip (nothing to carry yet)
  assert.doesNotMatch(Glue.chatHtml([{ role: "assistant", text: "partial", pending: true }], {}), /class="grip"/);
});
