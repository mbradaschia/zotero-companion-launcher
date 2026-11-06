// The Lists panel's sections (lib/Sidebar.js): what each list is, its count, the query it shows, the
// drop it takes, favorites, folding, the sections' order and a selection as one query.
const test = require("node:test");
const assert = require("node:assert/strict");
const SB = require("../lib/Sidebar.js");
const T = require("../lib/Todos.js");

const facets = {
  status: [
    { value: "none", label: "No status", count: 4, token: "status:none" },
    { value: "to read", label: "to read", count: 5, token: 'status:"to read"', detail: "to read" },
    { value: "reading", label: "reading", count: 3, token: 'status:"reading"', detail: "reading" },
    { value: "read", label: "read", count: 2, token: 'status:"read"', detail: "read" }
  ],
  task: [
    { value: "has", label: "Any task", count: 4, token: "has:task" },
    { value: "!has", label: "No task", count: 10, token: "!has:task" },
    { value: "Reading", label: "Reading", count: 2, token: 'task:"Reading"', detail: "active" },
    { value: "Waiting", label: "Waiting", count: 1, token: 'task:"Waiting"', detail: "waiting" }
  ],
  tag: [
    { value: "theory/resource-based view", label: "theory/resource-based view", count: 7, token: '#"theory/resource-based view"' },
    { value: "seminal", label: "seminal", count: 6, token: '#"seminal"' },
    { value: "reading", label: "reading", count: 3, token: '#"reading"' }, // a status tag
    { value: "t/check", label: "t/check", count: 2, token: '#"t/check"' }, // a task tag
    { value: "theory/stakeholder theory", label: "theory/stakeholder theory", count: 1, token: '#"theory/stakeholder theory"' }, // not in the taxonomy's list
    { value: "to-cite", label: "to-cite", count: 2, token: '#"to-cite"' }
  ],
  collection: [
    { value: "Thesis", label: "Thesis", count: 9, token: 'c:"Thesis"', detail: "" },
    { value: "Thesis / Ch2", label: "Thesis / Ch2", count: 6, token: 'c:"Thesis / Ch2"', detail: "" },
    { value: "SCM", label: "SCM", count: 2, token: 'c:"SCM"', detail: "" },
    { value: "Reading group", label: "Reading group", count: 1, token: 'c:"Reading group"', detail: "Strategy Lab" }
  ],
  has: [
    { value: "pdf", label: "A PDF", count: 11, token: "has:pdf" }, { value: "!pdf", label: "No PDF", count: 3, token: "!has:pdf" },
    { value: "notes", label: "Notes", count: 5, token: "has:notes" }, { value: "!notes", label: "No notes", count: 9, token: "!has:notes" },
    { value: "collection", label: "In a collection", count: 12, token: "has:collection" }, { value: "!collection", label: "In no collection", count: 2, token: "!has:collection" }
  ]
};
const input = {
  facets,
  searches: [{ id: "s1", name: "Thesis ch.2", query: 'c:"Thesis / Ch2"', pinned: true }, { id: "s2", name: "Empirical RBV", query: '#"type/empirical quantitative" #"theory/resource-based view"', pinned: false }],
  reviews: [{ id: "r-1", name: "Ch2 review", source: { type: "collection" } }],
  taxonomies: [
    { id: "theory", name: "Theories", prefix: "theory/", labels: ["resource-based view", { name: "dynamic capabilities" }] },
    { id: "hidden", name: "Hidden one", prefix: "h/", labels: ["x"], show: false }
  ],
  statusTags: ["to read", "reading", "read"],
  taskStatuses: T.statusesOf(null),
  groups: T.GROUPS,
  library: { recent: 20, open: 2 }
};

const ids = (section) => section.items.map((it) => it.id);
const sec = (sb, id) => sb.sections.find((s) => s.id === id);

test("the default sections, in order: More hidden, Tags folded", () => {
  const sb = SB.buildSidebar(input, {});
  assert.deepEqual(sb.sections.map((s) => s.id), ["favorites", "library", "status", "tasks", "taxonomies", "collections", "tags", "searches", "reviews"]);
  assert.equal(sec(sb, "tags").folded, true);
  assert.equal(sec(sb, "status").folded, false);
  assert.equal(sec(sb, "status").icon, "status"); // the kind's symbol (Icons.concept), never a colour
});

test("reading status: No status first, then yours, with the bridge's counts and tokens; a drop sets it", () => {
  const st = sec(SB.buildSidebar(input, {}), "status").items;
  assert.deepEqual(st.map((i) => [i.label, i.count, i.target.query]), [["No status", 4, "status:none"], ["to read", 5, 'status:"to read"'], ["reading", 3, 'status:"reading"'], ["read", 2, 'status:"read"']]);
  assert.deepEqual(st[2].drop, { kind: "status", value: "reading" });
  assert.deepEqual(st[0].drop, { kind: "status", value: "" });
  assert.equal(SB.sidebarDropText(st[2]), "Status: reading");
});

test("status names lose the bridge's prefix; without the facet there are no counts (not zeros)", () => {
  const st = sec(SB.buildSidebar({ statusTags: ["s/to read", "s/read"], statusPrefix: "s/" }, {}), "status").items;
  assert.deepEqual(st.map((i) => [i.label, i.count]), [["No status", null], ["to read", null], ["read", null]]);
  assert.equal(st[1].target.query, 'status:"to read"');
});

test("tasks: each open group as a folder of its statuses (Completed left out); counts by status name", () => {
  const tk = sec(SB.buildSidebar(input, {}), "tasks").items;
  assert.deepEqual(tk.filter((i) => i.folder).map((i) => i.label), ["Backlog", "Next", "Active", "Waiting"]);
  const reading = tk.find((i) => i.id === "task:reading");
  assert.equal(reading.count, 2);
  assert.equal(reading.parent, "taskgroup:active");
  assert.equal(reading.target.query, 'task:"Reading"');
  assert.deepEqual(reading.drop, { kind: "task", status: "reading" });
  assert.equal(tk.find((i) => i.id === "task:idea").count, 0); // known statuses with no task count 0
  assert.equal(tk.find((i) => i.id === "taskgroup:active").target.query, "task:active"); // a group is a list too
  assert.ok(!tk.some((i) => i.id === "task:done"));
});

test("taxonomies: a folder per shown taxonomy, its labels by name (never the raw prefixed tag), papers' own labels after", () => {
  const sb = SB.buildSidebar(input, {});
  const tx = sec(sb, "taxonomies").items;
  assert.deepEqual(tx.map((i) => i.label), ["Theories", "resource-based view", "dynamic capabilities", "stakeholder theory"]);
  const rbv = tx[1];
  assert.equal(rbv.count, 7);
  assert.equal(rbv.target.query, '#"theory/resource-based view"');
  assert.deepEqual(rbv.drop, { kind: "tag", tag: "theory/resource-based view" });
  assert.equal(rbv.path, "Theories › resource-based view");
  assert.equal(SB.sidebarDropText(rbv), "Add Theories › resource-based view");
  assert.equal(tx[2].count, 0);
  // a taxonomy folds its labels until you open it
  assert.equal(SB.sidebarFolded(rbv, sb, {}), true);
  assert.equal(SB.sidebarFolded(rbv, sb, { folded: { "tax:theory": false } }), false);
});

test("tags: plain ones only (no status, task or taxonomy tags), then All tags…", () => {
  const tg = sec(SB.buildSidebar(input, {}), "tags").items;
  assert.deepEqual(tg.map((i) => i.label), ["seminal", "to-cite", "All tags…"]);
  assert.deepEqual(tg[0].target, { type: "scope", scope: { type: "tag", key: "seminal", libraryID: 1, title: "#seminal" } });
  assert.deepEqual(tg[2].target, { type: "view", view: "tags" });
  assert.equal(SB.buildSidebar(Object.assign({}, input, { tagsShown: 1 }), {}).sections.find((s) => s.id === "tags").items.length, 2);
});

test("collections: the tree from the paths, under their library when there's more than one", () => {
  const col = sec(SB.buildSidebar(input, {}), "collections").items;
  assert.deepEqual(col.map((i) => [i.label, i.depth, i.group]), [["Thesis", 0, "My Library"], ["Ch2", 1, ""], ["SCM", 0, ""], ["Reading group", 0, "Strategy Lab"]]);
  assert.equal(col[0].folder, true);
  assert.equal(col[1].parent, col[0].id);
  assert.equal(col[1].target.query, 'c:"Thesis / Ch2"');
  assert.equal(col[1].drop, null); // adding to a collection needs its key (the bridge's 0.2.6 facet)
});

test("collections with keys (the newer bridge): a scope, a drop, the parent by key", () => {
  const values = [
    { value: "Thesis", label: "Thesis", count: 9, token: 'c:"Thesis"', key: "AAAA0001", parentKey: null, libraryID: 1, detail: "" },
    { value: "Thesis / Ch2", label: "Thesis / Ch2", count: 6, token: 'c:"Thesis / Ch2"', key: "AAAA0002", parentKey: "AAAA0001", libraryID: 1, detail: "" }
  ];
  const col = sec(SB.buildSidebar({ facets: { collection: values } }, {}), "collections").items;
  assert.equal(col[1].parent, "col:1:AAAA0001");
  assert.equal(col[1].depth, 1);
  assert.equal(col[0].group, ""); // one library: no heading
  assert.deepEqual(col[1].target, { type: "scope", scope: { type: "collection", key: "AAAA0002", libraryID: 1, title: "Thesis / Ch2" } });
  assert.deepEqual(col[1].drop, { kind: "collection", key: "AAAA0002", libraryID: 1 });
  assert.equal(SB.sidebarDropText(col[1]), "Add to “Ch2”");
});

test("library: recent, open and pinned are places; unfiled and no PDF are queries with the has: counts", () => {
  const lib = sec(SB.buildSidebar(input, {}), "library").items;
  assert.deepEqual(lib.map((i) => [i.label, i.count]), [["Recent", 20], ["Open in Zotero", 2], ["Pinned papers", null], ["Unfiled", 2], ["No PDF", 3]]);
  assert.deepEqual(lib[0].target, { type: "top", which: "recent" });
  assert.equal(lib[3].target.query, "!has:collection");
  assert.ok(lib.every((i) => !i.drop)); // searches take no drop
});

test("favorites: pinned saved searches first, then yours; a taxonomy label by its path; a gone one skipped", () => {
  const sb = SB.buildSidebar(input, { favorites: ["status:reading", "tax:theory:dynamic capabilities", "search:gone"] });
  const fav = sec(sb, "favorites").items;
  assert.deepEqual(fav.map((i) => [i.of, i.label]), [["search:s1", "Thesis ch.2"], ["status:reading", "reading"], ["tax:theory:dynamic capabilities", "Theories › dynamic capabilities"]]);
  assert.equal(fav[2].depth, 0);
  assert.equal(SB.sidebarFolded(fav[2], sb, {}), false);
  assert.ok(SB.sidebarRows(sb, {}).some((r) => r.key === "favorites:tax:theory:dynamic capabilities"));
  assert.equal(SB.sidebarFavoriteAt(sb, 2), "status:reading");
  assert.equal(SB.sidebarFavoriteAt(sb, 9), "");
  assert.equal(SB.sidebarNextFavorite(sb, "", 1), "search:s1");
  assert.equal(SB.sidebarNextFavorite(sb, "search:s1", -1), "");
  assert.equal(SB.sidebarNextFavorite(sb, "", -1), "tax:theory:dynamic capabilities");
});

test("pinning: a saved search's own pin, anything else's in prefs", () => {
  assert.deepEqual(SB.sidebarToggleFavorite("search:s2", input, {}), { search: "s2", pinned: true });
  assert.deepEqual(SB.sidebarToggleFavorite("search:s1", input, {}), { search: "s1", pinned: false });
  assert.deepEqual(SB.sidebarToggleFavorite("status:read", input, { favorites: ["tag:seminal"] }), { favorites: ["tag:seminal", "status:read"] });
  assert.deepEqual(SB.sidebarToggleFavorite("tag:seminal", input, { favorites: ["tag:seminal"] }), { favorites: [] });
});

test("rows: folded sections and folders leave their items out; group headings before their first item", () => {
  const sb = SB.buildSidebar(input, {});
  const rows = SB.sidebarRows(sb, {});
  const keys = rows.map((r) => r.key);
  assert.ok(keys.includes("section:tags"));
  assert.ok(!keys.some((k) => k.startsWith("tags:"))); // Tags is folded
  assert.ok(!keys.includes("taxonomies:tax:theory:resource-based view"));
  assert.ok(keys.includes("taxonomies:tax:theory"));
  assert.ok(keys.includes("group:collections:col::thesis"));
  const open = SB.sidebarRows(sb, { folded: { "col::thesis": true } }).map((r) => r.key);
  assert.ok(!open.includes("collections:col::thesis / ch2"));
  assert.equal(new Set(keys).size, keys.length); // every key once
});

test("a selection as one query: AND by a space, NOT as ! (or NOT ( ) for a whole query)", () => {
  const sb = SB.buildSidebar(input, {});
  const q = (sel) => SB.sidebarQuery(sel, sb);
  assert.equal(q([{ id: "status:reading", mode: "and" }, { id: "tax:theory:resource-based view", mode: "and" }]), 'status:"reading" #"theory/resource-based view"');
  assert.equal(q([{ id: "status:to read", mode: "not" }]), '!status:"to read"');
  assert.equal(q([{ id: "lib:nopdf", mode: "not" }]), "has:pdf");
  assert.equal(q([{ id: "search:s2", mode: "not" }]), 'NOT (#"type/empirical quantitative" #"theory/resource-based view")');
  assert.equal(q([{ id: "tag:seminal", mode: "and" }, { id: "lib:recent", mode: "and" }]), '#"seminal"');
  assert.equal(q([{ id: "col::thesis", mode: "and" }]), 'c:"Thesis"');
});

test("clicks: alone replaces (again: none); ⌘ joins and leaves; ⌥ excludes and comes back", () => {
  let sel = SB.sidebarSelect([], "a");
  assert.deepEqual(sel, [{ id: "a", mode: "and" }]);
  assert.deepEqual(SB.sidebarSelect(sel, "a"), []);
  sel = SB.sidebarSelect(sel, "b", "and");
  assert.deepEqual(sel, [{ id: "a", mode: "and" }, { id: "b", mode: "and" }]);
  sel = SB.sidebarSelect(sel, "b", "not");
  assert.deepEqual(sel[1], { id: "b", mode: "not" });
  assert.deepEqual(SB.sidebarSelect(sel, "b", "not"), [{ id: "a", mode: "and" }]);
  assert.deepEqual(SB.sidebarSelect(sel, "c"), [{ id: "c", mode: "and" }]);
});

test("sections: your order first, the rest after in the default order; a move stops at the ends; hidden ones out", () => {
  assert.deepEqual(SB.sidebarOrder({ order: ["tags", "nope", "status"] }).slice(0, 4), ["tags", "status", "favorites", "library"]);
  assert.deepEqual(SB.sidebarMoveSection({}, "status", -1).slice(0, 3), ["favorites", "status", "library"]);
  assert.deepEqual(SB.sidebarMoveSection({}, "favorites", -1), SB.sidebarOrder({}));
  const sb = SB.buildSidebar(input, { hidden: ["library", "tags"] });
  assert.ok(!sb.sections.some((s) => s.id === "library" || s.id === "tags"));
  assert.ok(sb.sections.some((s) => s.id === "more")); // hidden [] of yours replaces the default
});

test("empty: no saved searches or review tables keep a hint row; nothing breaks without input", () => {
  const sb = SB.buildSidebar({}, {});
  assert.deepEqual(sec(sb, "searches").items.map((i) => i.kind), ["hint"]);
  assert.deepEqual(sec(sb, "reviews").items.map((i) => i.label), ["None yet: ⌘T opens a list as one"]);
  assert.ok(!sb.sections.some((s) => s.id === "favorites" || s.id === "taxonomies" || s.id === "collections"));
});
