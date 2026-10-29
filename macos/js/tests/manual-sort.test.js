// Sort › Manual (Core/Glue.js arrange): a list you browse in your order (view.json's paperOrder), the papers you haven't
// placed after it as they came; what you type stays by relevance.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Glue = require("../../ZoteroLauncher/Core/Glue.js");

const typed = require(path.join(__dirname, "../../ZoteroLauncherTests/Fixtures/bridge/search-typed.json"));
const scoped = { ...typed, query: "", collections: [], tags: [], scope: { type: "collection", key: "COLL1234", libraryID: 1, title: "Thesis" } };
const papers = (rows) => rows.filter((r) => r.kind === "item" && r.section !== "Pinned").map((r) => r.libraryID + ":" + r.key);
const manual = (response, order, group) => Glue.results(response, "#000000", { noCommands: true }, null, { group: group || "", sort: "manual", order: "desc", info: { manual: order, statuses: [] } }, null);

test("Manual is the last sort offered", () => {
  const sorts = Glue.arrangeOptions([]).sorts;
  assert.deepEqual(sorts[sorts.length - 1], ["manual", "Manual"]);
  assert.equal(Glue.arrangement({ sort: "manual" }).sort, "manual");
});

test("a list in your order, the papers you haven't placed after it as they came", () => {
  const plain = papers(Glue.results(scoped, "#000000", { noCommands: true }, null, null, null));
  assert.ok(plain.length >= 4);
  const mine = [plain[3], plain[1], "1:GONEAWAY"]; // (a paper no longer in the list is skipped)
  assert.deepEqual(papers(manual(scoped, mine)), [plain[3], plain[1]].concat(plain.filter((id) => id !== plain[3] && id !== plain[1])));
});

test("with nothing placed, the list as it came", () => {
  const plain = papers(Glue.results(scoped, "#000000", { noCommands: true }, null, null, null));
  assert.deepEqual(papers(manual(scoped, [])), plain);
  assert.deepEqual(papers(manual(scoped, undefined)), plain);
});

test("what you type is by relevance, whatever the order", () => {
  const plain = papers(Glue.results(typed, "#000000", { noCommands: true }, null, null, null));
  assert.deepEqual(papers(manual(typed, plain.slice().reverse())), plain);
});

test("grouped, your order holds within each group", () => {
  const plain = papers(Glue.results(scoped, "#000000", { noCommands: true }, null, null, null));
  const reversed = plain.slice().reverse();
  const rows = manual(scoped, reversed, "status").filter((r) => r.kind === "item");
  const sections = [...new Set(rows.map((r) => r.section))];
  for (const s of sections) {
    const inGroup = rows.filter((r) => r.section === s).map((r) => r.libraryID + ":" + r.key);
    assert.deepEqual(inGroup, reversed.filter((id) => inGroup.includes(id)));
  }
});
