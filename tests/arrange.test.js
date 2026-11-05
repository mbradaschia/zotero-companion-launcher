// The results' Group, Sort and Order, the top level's sort and a list's manual order (lib/Views.js, moved from the Mac
// app's Glue.js so both launchers arrange the same way; the Mac's tests run them through its Glue on its fixtures).
const test = require("node:test");
const assert = require("node:assert/strict");
const V = require("../lib/Views.js");

const item = (key, section, extra) => Object.assign({ kind: "item", key, libraryID: 1, section }, extra);
const raw = (key, o) => Object.assign({ key, libraryID: 1 }, o);

test("arrangement: view.json's group, sort and order, checked; the older one-key grouping read when none is set", () => {
  assert.deepEqual(V.arrangement({}), { group: "", sort: "relevance", order: "desc" });
  assert.deepEqual(V.arrangement({ group: "status", sort: "year", order: "asc" }), { group: "status", sort: "year", order: "asc" });
  assert.deepEqual(V.arrangement({ group: "tax:method", sort: "manual" }), { group: "tax:method", sort: "manual", order: "desc" });
  assert.deepEqual(V.arrangement({ group: "nonsense", sort: "nonsense", order: "sideways" }), { group: "", sort: "relevance", order: "desc" });
  assert.deepEqual(V.arrangement({ grouping: "year:asc" }), { group: "", sort: "year", order: "asc" });
  assert.deepEqual(V.arrangement({ grouping: "task" }), { group: "task", sort: "relevance", order: "desc" });
  assert.deepEqual(V.arrangement({ sort: "title", grouping: "year:asc" }).sort, "title", "the new keys win");
});

test("topArrangement: Recent, or one of the bridge's sorts; never relevance or manual", () => {
  assert.deepEqual(V.topArrangement({}), { group: "", sort: "recent", order: "desc" });
  assert.deepEqual(V.topArrangement({ topSort: "author", topOrder: "asc" }), { group: "", sort: "author", order: "asc" });
  assert.equal(V.topArrangement({ topSort: "manual" }).sort, "recent");
  assert.equal(V.topArrangement({ topSort: "relevance" }).sort, "recent");
  assert.deepEqual(V.TOP_SORTS.map((s) => s[0]), ["recent", "added", "modified", "year", "title", "author"]);
  for (const s of V.BRIDGE_SORTS) assert.ok(V.TOP_SORTS.some((t) => t[0] === s), s);
});

test("arrange: papers sorted (none last either way, ties as they came); pins and other rows stay put", () => {
  const rows = [item("PIN", "Pinned"), { kind: "place", key: "go", section: "Go to" }, item("A", "Papers"), item("B", "Papers"), item("C", "Papers"), item("D", "Papers")];
  const results = [raw("A", { year: "2001", title: "beta", creator: "Smith" }), raw("B", { year: "", title: "Alpha", creator: "adams" }),
    raw("C", { year: "1999", title: "gamma", creator: "Jones" }), raw("D", { year: "2001", title: "delta", creator: "" })];
  const keys = (a) => V.arrange(rows, a, { results }).map((r) => r.key);
  assert.deepEqual(keys({ group: "", sort: "relevance", order: "desc" }), ["PIN", "go", "A", "B", "C", "D"]);
  assert.deepEqual(keys({ group: "", sort: "year", order: "desc" }), ["PIN", "go", "A", "D", "C", "B"]);
  assert.deepEqual(keys({ group: "", sort: "year", order: "asc" }), ["PIN", "go", "C", "A", "D", "B"]);
  assert.deepEqual(keys({ group: "", sort: "title", order: "asc" }), ["PIN", "go", "B", "A", "D", "C"]);
  assert.deepEqual(keys({ group: "", sort: "author", order: "asc" }), ["PIN", "go", "B", "C", "A", "D"]);
});

test("arrange, Manual: your order for the list, papers you haven't placed after it as they came; ids listed twice count once", () => {
  const rows = [item("PIN", "Pinned"), item("A", "Papers"), item("B", "Papers"), item("C", "Papers"), item("D", "Papers")];
  const out = V.arrange(rows, { group: "", sort: "manual", order: "desc" }, { manual: ["1:C", "1:A", "1:C", "1:GONE"] });
  assert.deepEqual(out.map((r) => r.key), ["PIN", "C", "A", "B", "D"]);
  assert.deepEqual(V.arrange(rows, { group: "", sort: "manual", order: "desc" }, {}).map((r) => r.key), ["PIN", "A", "B", "C", "D"]);
});

test("arrangeTop: the recent papers in the top sort, under Papers; Recent leaves them as the bridge sent them", () => {
  const rows = [item("PIN", "Pinned"), item("OPEN", "Open in Zotero"), item("A", "Recently added"), item("B", "Recently added"), item("C", "Recently added")];
  const response = { recent: [raw("A", { dateAdded: "2026-01-02" }), raw("B", { dateAdded: "2026-03-01" }), raw("C", { dateAdded: "2025-12-31" })] };
  assert.equal(V.arrangeTop(rows, V.topArrangement({}), response), rows);
  const out = V.arrangeTop(rows, V.topArrangement({ topSort: "added", topOrder: "asc" }), response);
  assert.deepEqual(out.map((r) => r.key + ":" + r.section), ["PIN:Pinned", "OPEN:Open in Zotero", "C:Papers", "A:Papers", "B:Papers"]);
});

test("arrangeOptions: None and the groupings that group; every sort, Manual last", () => {
  const o = V.arrangeOptions([{ id: "method", name: "Method" }]);
  assert.deepEqual(o.groups[0], ["", "None"]);
  assert.ok(o.groups.every((g) => g[0] === "" || V.isArrangeGroup(g[0])));
  assert.ok(o.groups.some((g) => g[0] === "status"));
  assert.deepEqual(o.sorts.map((s) => s[0]), ["relevance", "added", "modified", "year", "title", "author", "manual"]);
});
