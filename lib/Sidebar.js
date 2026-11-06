// The Lists panel (the launcher's left column): every kind of list the launcher knows, in sections,
// with counts. Pure (node-tested), shared by both launchers. Each item is either a scope the
// launcher already opens (a collection, a tag, a saved search), a query of the search's own terms
// (status:reading, task:"Waiting", #"theory/x", !has:collection), a place (the top level's recent,
// open and pinned papers, a review table, the tags list), or a folder of items (a taxonomy, a task
// group, a collection with subcollections). So the panel keeps no lists of its own: only which are
// favorites, which sections are folded or hidden, and their order (prefs, in view.json).
//
// input: {
//   facets: { status, task, tag, collection, has, type, year }: the bridge's /facets values per field
//     ([{ value, label, count, token, detail, key?, parentKey?, libraryID? }]); a field left out has no counts,
//   searches: [{ id, name, query, pinned }], reviews: [{ id, name, source }],
//   taxonomies: [{ id, name, prefix, labels: [name | { name }], show }],
//   statusTags: ["to read", "reading", "read"], statusPrefix: "" (as the bridge's),
//   taskStatuses: [{ id, name, group }], groups: [[id, name]] (Todos.GROUPS),
//   library: { recent, open, pinned } (counts, optional),
//   tagsShown: 8 (plain tags before "All tags…")
// }
// prefs: { favorites: [item id], folded: { id: true|false }, hidden: [section id], order: [section id] }

var SIDEBAR_SECTIONS = [
  ["favorites", "Favorites", "pin"],
  ["library", "Library", "books"],
  ["status", "Reading status", "status"],
  ["tasks", "Tasks", "task"],
  ["taxonomies", "Taxonomies", "tax"],
  ["collections", "Collections", "collection"],
  ["tags", "Tags", "tag"],
  ["searches", "Saved searches", "search"],
  ["reviews", "Review tables", "review"],
  ["more", "More", "more"]
]
var SIDEBAR_HIDDEN = ["more"] // hidden until you show them
var SIDEBAR_FOLDED = { tags: true } // folded until you open them
var SIDEBAR_TAGS_SHOWN = 8
var SIDEBAR_YEARS_SHOWN = 10

function sbFold(s) { return String(s == null ? "" : s).toLowerCase() }
function sbQuote(v) { return '"' + String(v).replace(/"/g, "") + '"' }
function sbLabelName(l) { return typeof l === "string" ? l : l && l.name ? String(l.name) : "" }

// A facet's values by their folded value (and label), for counts.
function sbIndex(values) {
  var out = {}
  ;(values || []).forEach(function (v) {
    if (!v) return
    out[sbFold(v.value)] = v
    if (v.label != null && out[sbFold(v.label)] === undefined) out[sbFold(v.label)] = v
  })
  return out
}
function sbCount(v) { return v && typeof v.count === "number" ? v.count : null }

function sbItem(o) {
  return {
    id: o.id, section: o.section, kind: o.kind, label: o.label, count: o.count === undefined ? null : o.count,
    depth: o.depth || 0, parent: o.parent || "", group: o.group || "", folder: !!o.folder,
    target: o.target || null, drop: o.drop || null, path: o.path || ""
  }
}

// A tag that is a paper status (with or without the bridge's prefix), a task tag (t/…) or a taxonomy's label.
function sbOwnTag(tag, input) {
  var t = sbFold(tag)
  var pre = sbFold(input.statusPrefix)
  if ((input.statusTags || []).some(function (s) { var f = sbFold(s); return t === f || (pre && t === pre + f) })) return true
  if (/^t\//.test(t)) return true
  return (input.taxonomies || []).some(function (x) { var p = sbFold(x.prefix); return p && t.indexOf(p) === 0 && t.length > p.length })
}

function sbLibrary(input) {
  var lib = input.library || {}
  var has = sbIndex(input.facets && input.facets.has)
  var n = function (v) { return typeof v === "number" ? v : null }
  return [
    sbItem({ id: "lib:recent", section: "library", kind: "library", label: "Recent", count: n(lib.recent), target: { type: "top", which: "recent" } }),
    sbItem({ id: "lib:open", section: "library", kind: "library", label: "Open in Zotero", count: n(lib.open), target: { type: "top", which: "open" } }),
    sbItem({ id: "lib:pinned", section: "library", kind: "library", label: "Pinned papers", count: n(lib.pinned), target: { type: "top", which: "pinned" } }),
    sbItem({ id: "lib:unfiled", section: "library", kind: "library", label: "Unfiled", count: sbCount(has["!collection"]), target: { type: "query", query: "!has:collection" } }),
    sbItem({ id: "lib:nopdf", section: "library", kind: "library", label: "No PDF", count: sbCount(has["!pdf"]), target: { type: "query", query: "!has:pdf" } })
  ]
}

function sbStatus(input) {
  var facet = input.facets && input.facets.status
  var by = sbIndex(facet)
  var names = ["none"].concat((input.statusTags || []).map(function (t) {
    var pre = input.statusPrefix || ""
    return pre && sbFold(t).indexOf(sbFold(pre)) === 0 ? String(t).slice(pre.length) : String(t)
  }))
  return names.map(function (name) {
    var none = name === "none"
    var v = by[sbFold(name)]
    return sbItem({ id: "status:" + sbFold(name), section: "status", kind: "status", label: none ? "No status" : name,
      count: facet ? sbCount(v) || 0 : null, target: { type: "query", query: v && v.token ? v.token : none ? "status:none" : "status:" + sbQuote(name) },
      drop: { kind: "status", value: none ? "" : name } })
  })
}

function sbTasks(input) {
  var facet = input.facets && input.facets.task
  var by = sbIndex(facet)
  var groups = (input.groups || []).filter(function (g) { return g[0] !== "completed" })
  var out = []
  groups.forEach(function (g) {
    var mine = (input.taskStatuses || []).filter(function (s) { return s.group === g[0] })
    if (!mine.length) return
    var gid = "taskgroup:" + g[0]
    out.push(sbItem({ id: gid, section: "tasks", kind: "taskgroup", label: g[1], folder: true, target: { type: "query", query: "task:" + g[0] } }))
    mine.forEach(function (s) {
      var v = by[sbFold(s.name)] || by[sbFold(s.id)]
      out.push(sbItem({ id: "task:" + s.id, section: "tasks", kind: "task", label: s.name, depth: 1, parent: gid,
        count: facet ? sbCount(v) || 0 : null, target: { type: "query", query: "task:" + sbQuote(s.name) }, drop: { kind: "task", status: s.id } }))
    })
  })
  return out
}

function sbTaxonomies(input) {
  var tags = (input.facets && input.facets.tag) || null
  var by = sbIndex(tags)
  var out = []
  ;(input.taxonomies || []).forEach(function (x) {
    if (x.show === false || !x.prefix) return
    var tid = "tax:" + (x.id || sbFold(x.prefix))
    out.push(sbItem({ id: tid, section: "taxonomies", kind: "taxonomy", label: x.name || x.prefix, folder: true, target: null }))
    var names = (x.labels || []).map(sbLabelName).filter(Boolean)
    // labels the papers have that the taxonomy doesn't list (yours, or an old name): after its own
    var pre = sbFold(x.prefix)
    ;(tags || []).forEach(function (v) {
      var f = sbFold(v.value)
      if (f.indexOf(pre) !== 0 || f.length <= pre.length) return
      var rest = String(v.value).slice(x.prefix.length)
      if (!names.some(function (n) { return sbFold(n) === sbFold(rest) })) names.push(rest)
    })
    names.forEach(function (n) {
      var tag = x.prefix + n
      out.push(sbItem({ id: tid + ":" + sbFold(n), section: "taxonomies", kind: "label", label: n, depth: 1, parent: tid, path: (x.name || x.prefix) + " › " + n,
        count: tags ? sbCount(by[sbFold(tag)]) || 0 : null, target: { type: "query", query: "#" + sbQuote(tag) }, drop: { kind: "tag", tag: tag } }))
    })
  })
  return out
}

// Collections in the tree's order (the facet's), under their library's name. A value with key and
// parentKey (the bridge's, from 0.2.6 on) places itself; one without, by its path ("A / B / C").
function sbCollections(input) {
  var values = (input.facets && input.facets.collection) || []
  var out = []
  var lastLib = null
  var idOf = {}
  var depthOf = {}
  var groups = values.some(function (v) { return v && v.detail })
  values.forEach(function (v) {
    var lib = v.detail || ""
    var parts = String(v.label || v.value || "").split(" / ")
    var name = parts[parts.length - 1]
    var libId = v.libraryID != null ? v.libraryID : lib
    var id = v.key ? "col:" + libId + ":" + v.key : "col:" + lib + ":" + sbFold(v.label || v.value)
    var parent = ""
    if (v.key && v.parentKey) parent = "col:" + libId + ":" + v.parentKey
    else if (!v.key && parts.length > 1) parent = idOf[lib + "\u0000" + sbFold(parts.slice(0, -1).join(" / "))] || ""
    idOf[lib + "\u0000" + sbFold(v.label || v.value)] = id
    var depth = parent && depthOf[parent] !== undefined ? depthOf[parent] + 1 : 0
    depthOf[id] = depth
    var group = groups && lib !== lastLib ? lib || "My Library" : ""
    lastLib = lib
    var target = v.key ? { type: "scope", scope: { type: "collection", key: v.key, libraryID: v.libraryID != null ? v.libraryID : 1, title: v.label } } : { type: "query", query: v.token || "c:" + sbQuote(v.label) }
    out.push(sbItem({ id: id, section: "collections", kind: "collection", label: name, depth: depth, parent: parent, group: group, path: v.label,
      count: sbCount(v), target: target, drop: v.key ? { kind: "collection", key: v.key, libraryID: v.libraryID != null ? v.libraryID : 1 } : null }))
  })
  // a collection with subcollections folds them
  out.forEach(function (o) { if (out.some(function (c) { return c.parent === o.id })) o.folder = true })
  return out
}

function sbTags(input) {
  var shown = input.tagsShown > 0 ? input.tagsShown : SIDEBAR_TAGS_SHOWN
  var plain = ((input.facets && input.facets.tag) || []).filter(function (v) { return !sbOwnTag(v.value, input) })
  var out = plain.slice(0, shown).map(function (v) {
    return sbItem({ id: "tag:" + sbFold(v.value), section: "tags", kind: "tag", label: v.label || v.value, count: sbCount(v),
      target: { type: "scope", scope: { type: "tag", key: v.value, libraryID: 1, title: "#" + v.value } }, drop: { kind: "tag", tag: v.value } })
  })
  out.push(sbItem({ id: "tags:all", section: "tags", kind: "more", label: "All tags…", target: { type: "view", view: "tags" } }))
  return out
}

function sbSearches(input) {
  return (input.searches || []).map(function (s) {
    return sbItem({ id: "search:" + s.id, section: "searches", kind: "search", label: s.name,
      target: { type: "scope", scope: { type: "search", key: s.id, libraryID: 0, title: s.name, query: s.query } } })
  })
}

function sbReviews(input) {
  return (input.reviews || []).map(function (r) {
    return sbItem({ id: "review:" + r.id, section: "reviews", kind: "review", label: r.name, target: { type: "review", id: r.id } })
  })
}

function sbMore(input) {
  var f = input.facets || {}
  var out = []
  var has = sbIndex(f.has)
  ;[["notes", "With notes"], ["chat", "With a chat"], ["task", "With a task"]].forEach(function (h) {
    out.push(sbItem({ id: "has:" + h[0], section: "more", kind: "has", label: h[1], count: f.has ? sbCount(has[h[0]]) || 0 : null, target: { type: "query", query: "has:" + h[0] } }))
  })
  ;(f.type || []).forEach(function (v, i) {
    out.push(sbItem({ id: "type:" + sbFold(v.value), section: "more", kind: "type", label: v.label || v.value, group: i === 0 ? "Item types" : "", count: sbCount(v),
      target: { type: "query", query: v.token || "type:" + sbQuote(v.value) } }))
  })
  ;(f.year || []).slice(0, SIDEBAR_YEARS_SHOWN).forEach(function (v, i) {
    out.push(sbItem({ id: "year:" + v.value, section: "more", kind: "year", label: String(v.label || v.value), group: i === 0 ? "Years" : "", count: sbCount(v),
      target: { type: "query", query: v.token || "y:" + v.value } }))
  })
  return out
}

// The favorites: your pinned saved searches first (as the badges were), then what you pinned, in your order.
function sbFavorites(input, prefs, all) {
  var ids = (input.searches || []).filter(function (s) { return s.pinned }).map(function (s) { return "search:" + s.id })
  ;(prefs.favorites || []).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id) })
  var out = []
  ids.forEach(function (id) {
    var it = all[id]
    if (!it || it.folder && !it.target) return // gone (a deleted search), or a folder of nothing to show
    var copy = sbItem(it)
    copy.section = "favorites"
    copy.depth = 0
    copy.parent = ""
    copy.group = ""
    copy.folder = false
    copy.of = id
    if (it.path && it.kind !== "collection") copy.label = it.path
    out.push(copy)
  })
  return out
}

// → { sections: [{ id, title, icon, folded, items }], items: { id: item } } in your order, hidden
// sections left out (an empty section too, but Saved searches and Review tables keep a hint row).
function buildSidebar(input, prefs) {
  input = input || {}
  prefs = prefs || {}
  var made = {
    library: sbLibrary(input), status: sbStatus(input), tasks: sbTasks(input), taxonomies: sbTaxonomies(input),
    collections: sbCollections(input), tags: sbTags(input), searches: sbSearches(input), reviews: sbReviews(input), more: sbMore(input)
  }
  var all = {}
  Object.keys(made).forEach(function (k) { made[k].forEach(function (it) { all[it.id] = it }) })
  made.favorites = sbFavorites(input, prefs, all)
  if (!made.searches.length) made.searches = [sbItem({ id: "searches:none", section: "searches", kind: "hint", label: "None yet: ⌘S saves what you typed" })]
  if (!made.reviews.length) made.reviews = [sbItem({ id: "reviews:none", section: "reviews", kind: "hint", label: "None yet: ⌘T opens a list as one" })]
  var hidden = Array.isArray(prefs.hidden) ? prefs.hidden : SIDEBAR_HIDDEN
  var folded = prefs.folded || {}
  var sections = sidebarOrder(prefs).filter(function (id) { return hidden.indexOf(id) < 0 && made[id] && made[id].length }).map(function (id) {
    var def = SIDEBAR_SECTIONS.filter(function (s) { return s[0] === id })[0]
    return { id: id, title: def[1], icon: def[2], folded: folded[id] !== undefined ? !!folded[id] : !!SIDEBAR_FOLDED[id], items: made[id] }
  })
  return { sections: sections, items: all }
}

// The sections' order: yours, then any you never placed, in the default order.
function sidebarOrder(prefs) {
  var ids = SIDEBAR_SECTIONS.map(function (s) { return s[0] })
  var mine = ((prefs && prefs.order) || []).filter(function (id) { return ids.indexOf(id) >= 0 })
  return mine.concat(ids.filter(function (id) { return mine.indexOf(id) < 0 }))
}

// Whether an item is folded away (a folded section, or a folded folder above it). Folders start
// open, except a taxonomy (they're long) unless you opened it.
function sidebarFolded(item, sidebar, prefs) {
  var folded = (prefs && prefs.folded) || {}
  var p = item.parent
  while (p) {
    var parent = sidebar.items[p]
    var shut = folded[p] !== undefined ? !!folded[p] : parent && parent.kind === "taxonomy"
    if (shut) return true
    p = parent ? parent.parent : ""
  }
  return false
}

// The rows as the panel draws them, in order: [{ row: "section", section } | { row: "group", label } |
// { row: "item", item, key }]. key = section:id, unique (a favorite is also in its own section).
function sidebarRows(sidebar, prefs) {
  var out = []
  sidebar.sections.forEach(function (s) {
    out.push({ row: "section", section: s, key: "section:" + s.id })
    if (s.folded) return
    s.items.forEach(function (it) {
      if (it.section !== "favorites" && sidebarFolded(it, sidebar, prefs)) return
      if (it.group) out.push({ row: "group", label: it.group, key: "group:" + s.id + ":" + it.id })
      out.push({ row: "item", item: it, key: s.id + ":" + it.id })
    })
  })
  return out
}

// What a selection shows, as one query: [{ id, mode: "and" | "not" }] → 'status:reading !#"theory/x"'.
// A place (recent, a review table, a folder without a query) adds nothing.
function sidebarQuery(selection, sidebar) {
  return (selection || []).map(function (s) {
    var it = sidebar.items[s.id]
    var q = it && it.target ? it.target.type === "query" ? it.target.query : it.target.type === "scope" ? sbScopeQuery(it.target.scope) : "" : ""
    if (!q) return ""
    if (s.mode !== "not") return q
    if (q.charAt(0) === "!") return q.slice(1)
    if (q.charAt(0) === "(") return "NOT " + q
    if (/\s/.test(q) && !/^#?"[^"]*"$|^[a-z]+:"[^"]*"$/i.test(q)) return "NOT (" + q + ")"
    return "!" + q
  }).filter(Boolean).join(" ")
}

// A scope's own query terms (as Views.scopeQuery): a collection's c:"path", a tag's #"name", a saved search's (query).
function sbScopeQuery(scope) {
  if (!scope) return ""
  if (scope.type === "search") return "(" + String(scope.query || "") + ")"
  if (scope.type === "tag") return "#" + sbQuote(scope.key)
  return "c:" + sbQuote(scope.title || "")
}

// One click on an item: alone it shows just that one (again: none); with ⌘ it joins (again: leaves),
// with ⌥ it's left out (again: back in).
function sidebarSelect(selection, id, how) {
  var sel = (selection || []).slice()
  var at = -1
  sel.forEach(function (s, i) { if (s.id === id) at = i })
  if (how === "and" || how === "not") {
    if (at >= 0 && sel[at].mode === how) sel.splice(at, 1)
    else if (at >= 0) sel[at] = { id: id, mode: how }
    else sel.push({ id: id, mode: how })
    return sel
  }
  return at >= 0 && sel.length === 1 ? [] : [{ id: id, mode: "and" }]
}

// p on an item: a saved search's pin is its own (the searches file's `pinned`); anything else's is in prefs.
// → { search: id, pinned } or { favorites: [...] }.
function sidebarToggleFavorite(id, input, prefs) {
  if (id.indexOf("search:") === 0) {
    var sid = id.slice(7)
    var s = (input.searches || []).filter(function (x) { return x.id === sid })[0]
    if (s) return { search: sid, pinned: !s.pinned }
  }
  var fav = ((prefs && prefs.favorites) || []).slice()
  var i = fav.indexOf(id)
  if (i >= 0) fav.splice(i, 1)
  else fav.push(id)
  return { favorites: fav }
}

// Tab / Shift+Tab over the favorites (and "" for none, as the badges' All), round and round.
function sidebarNextFavorite(sidebar, currentId, delta) {
  var fav = sidebar.sections.filter(function (s) { return s.id === "favorites" })[0]
  var ids = [""].concat(fav ? fav.items.map(function (it) { return it.of }) : [])
  var i = Math.max(0, ids.indexOf(currentId || ""))
  return ids[((i + delta) % ids.length + ids.length) % ids.length]
}

// ⌘1…⌘9: the nth favorite's id, or "".
function sidebarFavoriteAt(sidebar, n) {
  var fav = sidebar.sections.filter(function (s) { return s.id === "favorites" })[0]
  var it = fav && fav.items[n - 1]
  return it ? it.of : ""
}

// A section moved up or down (⌃⇧↑↓): the new order.
function sidebarMoveSection(prefs, id, delta) {
  var order = sidebarOrder(prefs)
  var i = order.indexOf(id)
  var j = i + delta
  if (i < 0 || j < 0 || j >= order.length) return order
  order.splice(i, 1)
  order.splice(j, 0, id)
  return order
}

// What a paper dropped on an item does, said (the drop target's line), or "" when it takes no drop.
function sidebarDropText(item) {
  var d = item && item.drop
  if (!d) return ""
  if (d.kind === "status") return d.value ? "Status: " + d.value : "No status"
  if (d.kind === "task") return "Task: " + item.label
  if (d.kind === "collection") return "Add to “" + item.label + "”"
  if (item.kind === "label") return "Add " + (item.path || item.label)
  return "Add #" + d.tag
}

if (typeof module !== "undefined") {
  module.exports = {
    SECTIONS: SIDEBAR_SECTIONS, HIDDEN: SIDEBAR_HIDDEN, FOLDED: SIDEBAR_FOLDED,
    buildSidebar: buildSidebar, sidebarOrder: sidebarOrder, sidebarFolded: sidebarFolded, sidebarRows: sidebarRows, sidebarQuery: sidebarQuery,
    sidebarSelect: sidebarSelect, sidebarToggleFavorite: sidebarToggleFavorite, sidebarNextFavorite: sidebarNextFavorite,
    sidebarFavoriteAt: sidebarFavoriteAt, sidebarMoveSection: sidebarMoveSection, sidebarDropText: sidebarDropText
  }
}
