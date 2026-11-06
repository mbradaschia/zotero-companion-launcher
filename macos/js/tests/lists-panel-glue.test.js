// The Lists panel on the Mac (Core/Glue.js's listsPanel, Core/GlueSettings.js's switch): lib/Sidebar.js's rows with the
// settings' statuses and task statuses filled in, the favorites, the sections for the rail; Settings › General's switch.
const test = require("node:test");
const assert = require("node:assert/strict");
const Glue = require("../../ZoteroLauncher/Core/Glue.js");

const s = Glue.settings(null, {}).settings;

test("the rows: your statuses (without their tag prefix) and task statuses under their groups, counted", () => {
  const facets = { status: [{ value: "reading", label: "reading", count: 2, token: 'status:"reading"' }], task: [{ value: "Waiting", count: 1 }] };
  const r = Glue.listsPanel(facets, [], [], [], s, {});
  const items = r.rows.filter((x) => x.row === "item").map((x) => x.item);
  const reading = items.find((it) => it.id === "status:reading");
  assert.equal(reading.count, 2);
  assert.deepEqual(reading.target, { type: "query", query: 'status:"reading"' });
  assert.ok(items.some((it) => it.id === "taskgroup:waiting" && it.folder));
  assert.equal(items.find((it) => it.id === "task:waiting").count, 1);
  assert.ok(!items.some((it) => it.label.startsWith("s/")), "never a raw status tag");
  // headings carry no items (the rail's sections do)
  assert.equal(r.rows.find((x) => x.row === "section").section.items, undefined);
  assert.ok(Array.isArray(r.sections[0].items));
});

test("favorites: your pinned saved searches first, then what you pinned; each knows the list it stands for", () => {
  const searches = [{ id: "a", name: "Caps", query: "caps", pinned: true, updated: "x" }, { id: "b", name: "Other", query: "o" }];
  const r = Glue.listsPanel({}, searches, [{ id: "r-1", name: "T", updated: "y" }], [], s, { favorites: ["status:reading", "gone:1"] });
  assert.deepEqual(r.favorites.map((f) => f.of), ["search:a", "status:reading"]);
  assert.equal(r.rows[0].section.id, "favorites");
  assert.ok(r.rows.some((x) => x.item && x.item.id === "review:r-1"));
});

test("bad prefs are no prefs; a section moved", () => {
  assert.equal(Glue.listsPanel({}, [], [], [], s, []).rows[0].section.id, "searches");
  assert.equal(Glue.listsPanel({}, [], [], [], s, "x").rows[0].section.id, "searches");
  assert.deepEqual(Glue.listsMoveSection({}, "searches", -1).slice(0, 2), ["searches", "favorites"]);
});

test("Settings › General: the Lists panel's switch, this Mac's, after the Dock's", () => {
  const rows = Glue.settingsPage("general", s, {}, { openAsWindow: false, dock: true, lists: true });
  assert.deepEqual(rows.slice(0, 3).map((r) => r.value), ["mac.openAsWindow", "mac.dock", "mac.listsPanel"]);
  const on = rows[2];
  assert.equal(on.label, "Lists panel");
  assert.equal(on.checked, true);
  assert.match(on.detail, /^On · your lists beside the results/);
  const off = Glue.settingsPage("general", s, {}, { lists: false }).find((r) => r.value === "mac.listsPanel");
  assert.equal(off.checked, false);
  assert.match(off.detail, /^Off · no lists beside the results: your pinned searches are badges/);
  assert.equal(Glue.settingsPage("general", s, {}, {}).find((r) => r.value === "mac.listsPanel"), undefined);
  assert.ok(Glue.settingsIndex(s, {}, [], { lists: true }).some((r) => r.value === "mac.listsPanel"));
});

test("with the panel on, a pinned search is a favorite in its words, not a badge (the keys, Shift+Enter's menu, saving)", () => {
  const ctx = (lists) => Glue.keysContext("search", { lists }, false);
  const line = (lists) => Glue.keyRows("", ctx(lists)).map((r) => r.label).join("\n");
  assert.doesNotMatch(line(true), /the badges/);
  assert.match(line(true), /Next \/ previous favorite \(the Lists panel's\)/);
  assert.match(line(false), /the badges/);
  const menu = Glue.searchMenuRows({ id: "s1", name: "Mine", query: "a:smith", pinned: false }, true);
  assert.equal(menu.find((r) => r.rowId === "search-pin").label, "Pin to Favorites");
  assert.match(menu.find((r) => r.rowId === "search-pin").detail, /^A favorite in the Lists panel/);
  assert.equal(Glue.searchMenuRows({ id: "s1", name: "Mine", query: "a:smith" }).find((r) => r.rowId === "search-pin").label, "Pin above the results");
  const save = Glue.searchEditRows("save", "", "a:smith", true);
  assert.match(save.find((r) => r.rowId === "search-save-pin").detail, /^A favorite in the Lists panel/);
});
