// The top level's Sort (Core/Glue.js): before you type, the recent papers or the library's first ones in a sort the
// bridge applies before it cuts the list; the pins and the open papers stay as they are. Title and first author sort
// the lists you browse too.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Glue = require("../../ZoteroLauncher/Core/Glue.js");

const empty = require(path.join(__dirname, "../../ZoteroLauncherTests/Fixtures/bridge/search-empty.json"));
const typed = require(path.join(__dirname, "../../ZoteroLauncherTests/Fixtures/bridge/search-typed.json"));
const top = (response, topSort, topOrder) => Glue.results(response, "#000000", { noCommands: true }, null,
  { group: "", sort: "relevance", order: "desc", info: {}, top: { topSort, topOrder } }, null);
const recentKeys = (rows) => rows.filter((r) => r.kind === "item" && r.section === "Papers").map((r) => r.key);

test("the top level's sort: Recent first, then the bridge's sorts; no relevance, grouping or manual", () => {
  const ids = Glue.topSortOptions().map((s) => s[0]);
  assert.deepEqual(ids, ["recent", "added", "modified", "year", "title", "author"]);
  assert.deepEqual(Glue.topArrangement({}), { group: "", sort: "recent", order: "desc" });
  assert.deepEqual(Glue.topArrangement({ topSort: "year", topOrder: "asc" }), { group: "", sort: "year", order: "asc" });
  assert.equal(Glue.topArrangement({ topSort: "manual" }).sort, "recent");
  assert.equal(Glue.topArrangement({ sort: "year" }).sort, "recent", "a list's sort isn't the top level's");
});

test("Recent: the papers as the bridge sent them", () => {
  const rows = top(empty, "recent", "desc");
  assert.deepEqual(rows.map((r) => r.key + r.section), Glue.results(empty, "#000000", { noCommands: true }, null, null, null).map((r) => r.key + r.section));
});

test("by year: the recent papers sorted and under Papers; pins and open papers where they were", () => {
  const plain = Glue.results(empty, "#000000", { noCommands: true }, null, null, null);
  const rows = top(empty, "year", "asc");
  const years = recentKeys(rows).map((k) => Number(empty.recent.find((x) => x.key === k).year) || 0);
  assert.equal(years.length, empty.recent.length);
  const dated = years.filter(Boolean);
  assert.deepEqual(years, dated.slice().sort((a, b) => a - b).concat(years.filter((y) => !y)), "no year: last");
  const others = (rs) => rs.filter((r) => r.section !== "Papers" && !["Recently added", "Recently modified", "Recent"].includes(r.section)).map((r) => r.key + r.section);
  assert.deepEqual(others(rows), others(plain));
  const desc = recentKeys(top(empty, "year", "desc")).map((k) => Number(empty.recent.find((x) => x.key === k).year) || 0);
  assert.deepEqual(desc, dated.slice().sort((a, b) => b - a).concat(years.filter((y) => !y)), "no year: last, either way");
});

test("by title, A to Z, case aside", () => {
  const titles = recentKeys(top(empty, "title", "asc")).map((k) => empty.recent.find((x) => x.key === k).title.trim().toLowerCase());
  assert.deepEqual(titles, titles.slice().sort());
});

test("what you type isn't touched by the top level's sort", () => {
  const plain = Glue.results(typed, "#000000", { noCommands: true }, null, null, null).map((r) => r.key);
  assert.deepEqual(top(typed, "year", "asc").map((r) => r.key), plain);
});

test("searchBody: the sort goes to the bridge for what's listed before you type, not for what you type", () => {
  const s = Glue.settings(null, {}).settings;
  const body = (q, scope, sort) => Glue.searchBody(q, scope, s, [], [], [], [], sort);
  assert.deepEqual(body("", null, { by: "year", order: "asc" }).sort, { by: "year", order: "asc" });
  assert.deepEqual(body("", { type: "collection", key: "COLL1234", libraryID: 1, title: "T" }, { by: "title", order: "x" }).sort, { by: "title", order: "desc" });
  assert.equal(body("kong", null, { by: "year", order: "asc" }).sort, undefined);
  assert.equal(body("", null, { by: "manual", order: "asc" }).sort, undefined);
  assert.equal(body("", { type: "search", key: "s1", libraryID: 0, title: "S", query: "y:2020" }, { by: "year", order: "asc" }).sort, undefined);
  assert.equal(body("", null, null).sort, undefined);
});

test("a list by title or first author", () => {
  const sorts = Glue.arrangeOptions([]).sorts.map((x) => x[0]);
  assert.ok(sorts.includes("title") && sorts.includes("author"));
  const scoped = { ...typed, query: "", collections: [], tags: [], scope: { type: "collection", key: "COLL1234", libraryID: 1, title: "Thesis" } };
  const rows = Glue.results(scoped, "#000000", { noCommands: true }, null, { group: "", sort: "author", order: "asc", info: {} }, null);
  const authors = rows.filter((r) => r.kind === "item").map((r) => String(typed.results.find((x) => x.key === r.key).creator || "").trim().toLowerCase());
  const named = authors.filter(Boolean);
  assert.deepEqual(named, named.slice().sort());
  assert.deepEqual(authors.slice(named.length), authors.filter((a) => !a), "no author: last");
});
