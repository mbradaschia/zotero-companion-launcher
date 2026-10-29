// What Swift calls in the view logic, JSON in and JSON out: each wrapper takes plain values,
// supplies what JSON can't carry, and calls into the modules (globals here, as JSCore loads them;
// required in Node, for scripts/goldens.mjs). One wrapper per builder a phase needs.
var Glue = (function () {
  var V = typeof Views !== "undefined" ? Views : require("../../js/lib/Views.js")
  var C = typeof Client !== "undefined" ? Client : require("../../js/lib/Client.js")
  var T = typeof Todos !== "undefined" ? Todos : require("../../js/lib/Todos.js")
  var P = typeof Paths !== "undefined" ? Paths : require("../../../contracts/Paths.js")
  var F = typeof Fuzzy !== "undefined" ? Fuzzy : require("../../js/lib/Fuzzy.js")
  var S = typeof Settings !== "undefined" ? Settings : require("../../js/lib/Settings.js")
  var M = typeof Merge !== "undefined" ? Merge : require("../../../contracts/Merge.js")
  var lists = (typeof GlueLists !== "undefined" ? GlueLists : require("./GlueLists.js"))(V, C, T, P, F, S)
  var todos = (typeof GlueTodos !== "undefined" ? GlueTodos : require("./GlueTodos.js"))(V, C, T, M, F)
  var search = (typeof GlueSearch !== "undefined" ? GlueSearch : require("./GlueSearch.js"))(V, C, T, F)
  var runnerGlue = (typeof GlueRunner !== "undefined" ? GlueRunner : require("./GlueRunner.js"))(V, C, S, F)
  var settingsGlue = (typeof GlueSettings !== "undefined" ? GlueSettings : require("./GlueSettings.js"))(V, C, T, P, S)
  var Mk = typeof Marked !== "undefined" ? Marked : require("../../js/vendor/marked.umd.js")
  var chatGlue = (typeof GlueChat !== "undefined" ? GlueChat : require("./GlueChat.js"))(V, F, Mk)
  var taxGlue = (typeof GlueTaxonomies !== "undefined" ? GlueTaxonomies : require("./GlueTaxonomies.js"))(V, S)
  var RV = typeof ReviewCore !== "undefined" ? ReviewCore : require("../Review/ReviewCore.js")
  var reviewGlue = (typeof GlueReviews !== "undefined" ? GlueReviews : require("./GlueReviews.js"))(RV)

  // Go to with only the places the Mac has (`have`: their kinds; a Settings row found by name
  // stays): the rest of the launcher's places come in later phases. With none left above the
  // papers, the papers lose their heading, as lib/Views.js's buildRows does.
  // ---- the results' Group, Sort and Order
  var SORTS = [["relevance", "Relevance"], ["added", "Date added"], ["modified", "Date changed"], ["year", "Year published"], ["title", "Title"],
    ["author", "First author"], ["manual", "Manual"]]
  // Before you type (view.json's topSort, topOrder): the recent papers, or the library's first ones in a sort the bridge
  // applies before it cuts the list (bridge 0.2.6; an older one sorts only the recent few)
  var TOP_SORTS = [["recent", "Recent"], ["added", "Date added"], ["modified", "Date changed"], ["year", "Year published"], ["title", "Title"],
    ["author", "First author"]]
  var BRIDGE_SORTS = ["added", "modified", "year", "title", "author"]
  var topArrangement = function (values) {
    var v = values && typeof values === "object" ? values : {}
    var a = { group: "", sort: "recent", order: v.topOrder === "asc" ? "asc" : "desc" }
    for (var i = 0; i < TOP_SORTS.length; i++) if (TOP_SORTS[i][0] === v.topSort) a.sort = v.topSort
    return a
  }
  // A paper's value for a sort (a row's answer from the bridge): "" when it has none.
  var sortKey = function (by, x) {
    if (by === "year") { var y = Number(x.year) || 0; return y > 0 ? ("000" + y).slice(-4) : "" }
    if (by === "title") return String(x.title || "").trim().toLowerCase()
    if (by === "author") return String(x.creator || "").trim().toLowerCase()
    return String((by === "added" ? x.dateAdded : x.dateModified) || "")
  }
  var bySortKey = function (order) {
    return function (p, q) {
      if (p.k !== q.k) {
        if (!p.k || !q.k) return p.k ? -1 : 1
        return (p.k < q.k ? -1 : 1) * (order === "asc" ? 1 : -1)
      }
      return p.i - q.i
    }
  }
  var RECENT_SECTIONS = ["Recently added", "Recently modified", "Recent"]
  // The top level's recent papers in its sort, under Papers; the pins and the open papers stay as they are.
  var arrangeTop = function (rows, a, response) {
    if (a.sort === "recent") return rows
    var raw = {}
    ;(response.recent || []).forEach(function (x) { raw[(Number(x.libraryID) || 1) + ":" + x.key] = x })
    var isRecent = function (r) { return r.kind === "item" && RECENT_SECTIONS.indexOf(r.section) >= 0 }
    var papers = rows.filter(isRecent).map(function (r, i) { return { r: r, i: i, k: sortKey(a.sort, raw[r.libraryID + ":" + r.key] || {}) } })
    papers.sort(bySortKey(a.order))
    var n = 0
    return rows.map(function (r) { return isRecent(r) ? Object.assign({}, papers[n++].r, { section: "Papers" }) : r })
  }
  var isGroup = function (id) { return id === "status" || id === "task" || id === "taskgroup" || /^tax:./.test(String(id)) }
  var arrangement = function (values) {
    var v = values && typeof values === "object" ? values : {}
    var a = { group: isGroup(v.group) ? v.group : "", sort: "relevance", order: v.order === "asc" ? "asc" : "desc" }
    for (var i = 0; i < SORTS.length; i++) if (SORTS[i][0] === v.sort) a.sort = v.sort
    if (!("group" in v) && !("sort" in v) && !("order" in v) && typeof v.grouping === "string") { // (before 0.4.10: one key for both)
      var g = v.grouping.replace(/:asc$/, "")
      if (g === "added" || g === "modified" || g === "year") { a.sort = g; a.order = /:asc$/.test(v.grouping) ? "asc" : "desc" }
      else if (isGroup(g)) a.group = g
    }
    return a
  }
  // The papers sorted (none last, either way; relevance within a tie), then grouped: the rest stay where they were.
  // Manual: your order for this list (info.manual: ["libraryID:key"], view.json's paperOrder), the papers you haven't
  // placed after it, as they came.
  var arrange = function (rows, a, info) {
    if (a.sort === "manual") {
      var place = {}
      ;(info.manual || []).forEach(function (id, i) { if (!(id in place)) place[id] = i })
      var isListed = function (r) { return r.kind === "item" && r.section !== "Pinned" }
      var listed = rows.filter(isListed).map(function (r, i) {
        var at = place[r.libraryID + ":" + r.key]
        return { r: r, i: i, at: at === undefined ? Infinity : at }
      })
      listed.sort(function (p, q) { return p.at !== q.at ? (p.at < q.at ? -1 : 1) : p.i - q.i })
      var m = 0
      rows = rows.map(function (r) { return isListed(r) ? listed[m++].r : r })
    } else if (a.sort !== "relevance") {
      var raw = {}
      ;(info.results || []).forEach(function (x) { raw[(Number(x.libraryID) || 1) + ":" + x.key] = x })
      var isPaper = function (r) { return r.kind === "item" && r.section !== "Pinned" }
      var papers = rows.filter(isPaper).map(function (r, i) { return { r: r, i: i, k: sortKey(a.sort, raw[r.libraryID + ":" + r.key] || {}) } })
      papers.sort(bySortKey(a.order))
      var n = 0
      rows = rows.map(function (r) { return isPaper(r) ? papers[n++].r : r })
    }
    return a.group ? V.groupRows(rows, a.group, info) : rows
  }

  var onlyHave = function (rows, have, response) {
    var out = rows.filter(function (r) { return r.section !== "Go to" || r.kind === "setting" || have.indexOf(r.kind) >= 0 })
    var above = out.some(function (r) { return r.section === "Go to" || r.section === V.SECTION_COLLECTIONS || r.section === "Tags" })
    if (!above && !(response && response.scope)) out.forEach(function (r) { if (r.section === V.SECTION_PAPERS) r.section = "" })
    return out
  }

  var core = {
    resolvePaths: function (env, machineSettings, probe) { return P.resolve(env, machineSettings, probe) },

    // The settings in effect: the machine file and the shared one, combined and normalized
    // (Service.qml's applySettings). → { settings, problems }
    settings: function (machineRaw, sharedRaw) {
      var file = machineRaw === null && sharedRaw === null ? null : P.combineSettings(machineRaw, sharedRaw)
      return C.normalizeSettings(file)
    },
    // The same, the settings as JSON text (their keys in order: what the app passes back).
    settingsText: function (machineRaw, sharedRaw) { return JSON.stringify(core.settings(machineRaw, sharedRaw).settings) },

    // The /search body (Service.qml's _sendSearch). scope: { type, key, libraryID, title, query } or null.
    // sort: { by, order } for what's listed before you type (the bridge sorts before it cuts the list), or null.
    searchBody: function (query, scope, settings, pins, todos, chats, todoStatuses, sort) {
      var q = String(query || "")
      var body = { query: q, limit: settings.maxResults, statusTags: C.statusTags(settings.paperStatuses), statusPrefix: C.PAPER_TAG_PREFIX,
        marks: C.searchMarks(todos || [], todoStatuses || [], chats || [], T.statusOfTodo) }
      if (scope && scope.type === "search") body.within = { id: scope.key, title: scope.title, query: scope.query }
      else if (scope && scope.type === "tag") body.tag = { name: scope.key, libraryID: scope.libraryID }
      else if (scope) body.collection = { key: scope.key, libraryID: scope.libraryID }
      else if (!q.trim()) {
        if (settings.emptyQuery) body.emptyQuery = settings.emptyQuery
        if ((pins || []).length) body.pinned = pins.map(function (p) { return { key: p.key, libraryID: p.libraryID, type: p.type } })
      }
      if (sort && BRIDGE_SORTS.indexOf(sort.by) >= 0 && !(scope && scope.type === "search") && !q.trim()) body.sort = { by: sort.by, order: sort.order === "asc" ? "asc" : "desc" }
      return body
    },

    // A /search answer's rows, matches highlighted in `color`.
    searchRows: function (response, color, extras) { return V.buildRows(response, color, extras || {}) },

    // The results as shown (ZoteroSearch.qml's rebuildSearch for what exists): the rows, your
    // section order, the papers grouped (g: { mode, info }), a paper's notes under it (Space).
    results: function (response, color, extras, sectionOrder, grouping, expanded) {
      var built = V.buildRows(response, color, extras || {})
      if (extras && extras.have) built = onlyHave(built, extras.have, response)
      var rows = V.orderSections(built, sectionOrder || null)
      // (a list you browse: a collection, a tag or a saved search with nothing typed; what you type is by relevance)
      var groupable = !!(response && response.scope && !String(response.query || "").trim())
      if (grouping && groupable) rows = arrange(rows, arrangement(grouping), Object.assign({ results: response.results, groups: T.GROUPS }, grouping.info || {}))
      // (the top level, nothing typed: its recent papers in their own sort)
      if (grouping && grouping.top && response && !response.scope && !String(response.query || "").trim()) rows = arrangeTop(rows, topArrangement(grouping.top), response)
      return V.withNoteRows(rows, expanded || null)
    },
    // The results' Group, Sort and Order (view.json's group, sort, order; the older one-key grouping read when
    // none of them is set): { group: "" or a grouping, sort: "relevance" or a date, order: "desc" or "asc" }.
    arrangement: function (values) { return arrangement(values) },
    // The top level's sort (view.json's topSort, topOrder): { group: "", sort: "recent" or a sort, order }.
    topArrangement: function (values) { return topArrangement(values) },
    topSortOptions: function () { return TOP_SORTS.map(function (s) { return s.slice() }) },
    // What the Group and Sort menus offer: [[id, name]] each.
    arrangeOptions: function (taxonomies) {
      return { groups: [["", "None"]].concat(V.groupings(taxonomies || []).filter(function (g) { return isGroup(g[0]) }).map(function (g) {
        var n = String(g[1]).replace(/^by /, "")
        return [g[0], n.charAt(0).toUpperCase() + n.slice(1)]
      })), sorts: SORTS.map(function (s) { return s.slice() }) }
    },
    nextGrouping: function (id, delta, taxonomies) { return V.nextGrouping(id, delta, taxonomies || []) },
    groupingName: function (id, taxonomies) { return V.groupingName(id, taxonomies || []) },
    groupingDirection: function (id) { return V.groupingDirection(id) },

    // A paper's menu (Tab). `pinned`: whether it is pinned; `setup`: whether setup is unfinished.
    actions: function (details, viewerName, prompts, promptsProblem, pinned, setup, extras) {
      return V.buildActions(details, viewerName, prompts, promptsProblem, pinned, setup, extras || {})
    },

    // A paper's menu as shown (ZoteroSearch.qml:946-960): its rows in your order, your pins on top,
    // Other at the bottom, the filter, the section order. m: { details, viewerName, prompts,
    // promptsProblem, pinned, setup, extras, order, pins, others, sections, filter }.
    // → { ordered (before the pins and the filter: what Shift+↑↓ moves within), rows }
    menu: function (m) {
      var act = V.buildActions(m.details, m.viewerName || "", m.prompts === undefined ? null : m.prompts, m.promptsProblem || "", !!m.pinned, !!m.setup, m.extras || {})
      // the paper's tasks, after its notes and chats (ZoteroSearch.qml:950-955)
      if (m.todoRows && m.todoRows.length) {
        var at = -1
        for (var i = 0; i < act.length; i++) if (act[i].section === "Prompts and chat" || act[i].section === "This paper") { at = i; break }
        if (at < 0) at = act.length
        Array.prototype.splice.apply(act, [at, 0].concat(m.todoRows))
      }
      var ordered = V.orderRows(act, m.order || null)
      var rows = V.filterRows(V.otherRows(V.pinRows(ordered, m.pins || []), m.others || []), m.filter || "")
      return { ordered: ordered, rows: V.orderSections(rows, m.sections || null) }
    },

    orderRows: function (rows, order) { return V.orderRows(rows, order) },
    pinRows: function (rows, pins) { return V.pinRows(rows, pins) },
    otherRows: function (rows, others) { return V.otherRows(rows, others) },
    filterRows: function (rows, text) { return V.filterRows(rows, text) },
    orderSections: function (rows, order) { return V.orderSections(rows, order) },
    fileRows: function (details, purpose, filter) { return V.filterRows(V.buildFileRows(details, purpose), filter || "") },
    usableFiles: function (details, purpose) { return V.usableFiles(details, purpose) },
    selectionAfter: function (rows, previousKey, followTop, query) { return V.selectionAfter(rows, previousKey, followTop, query) },

    // The confirm view's two rows (ZoteroSearch.qml:4273). ask: { yes, no, detail, noDetail }.
    confirmRows: function (ask) {
      var a = ask || {}
      return [
        V.listRow({ rowId: "confirm-yes", icon: "", label: a.yes || "Yes", detail: a.detail || "", available: true }),
        V.listRow({ rowId: "confirm-no", icon: "", label: a.no || "No", detail: a.noDetail || "", available: true })
      ]
    },

    // pins.json and a menu's arrangement.
    parsePins: function (text) { return V.parsePins(text) },
    togglePin: function (pins, item) { return V.togglePin(pins || [], item) },
    isPinned: function (pins, item) { return V.isPinned(pins || [], item) },
    movePin: function (pins, item, other) { return V.movePin(pins || [], item, other) },
    toggleIdentity: function (list, id) { return V.toggleIdentity(list || [], id) },
    moveIdentity: function (list, id, other) { return V.moveIdentity(list || [], id, other) },
    moveSection: function (rows, name, delta) { return V.moveSection(rows, name, delta) },
    rowIdentity: function (row) { return V.rowIdentity(row) },

    // Text for the chrome.
    contextLabel: function (placeholder) { return V.contextLabel(placeholder) },
    typeHint: function (placeholder, textEntry) { return V.typeHint(placeholder, !!textEntry) },
    rankLabels: function (rank) { return V.rankLabels(rank) },
    paperFooter: function (p) { return V.paperFooter(p || {}) },
    statusName: function (tag) { return C.statusName(tag) },
    countText: function (response, total) { return V.countText(response, total) },
    citationStyle: function (settings) { return C.citationStyle(settings) },
    shortDate: function (iso) { return V.shortDate(iso) },
    // The Tasks view's count: "3 open · 12 tasks".
    todoCount: function (todos, settings) {
      var all = todos || [], sts = T.statusesOf(settings)
      var open = all.filter(function (t) { return T.statusOfTodo(t, sts).group !== "completed" }).length
      return open + " open · " + all.length + (all.length === 1 ? " task" : " tasks")
    }
  }
  for (var k in lists) core[k] = lists[k]
  for (var t in todos) core[t] = todos[t]
  for (var s in search) core[s] = search[s]
  for (var g in settingsGlue) core[g] = settingsGlue[g]
  for (var r in runnerGlue) core[r] = runnerGlue[r]
  for (var ch in chatGlue) core[ch] = chatGlue[ch]
  for (var tg in taxGlue) core[tg] = taxGlue[tg]
  for (var rg in reviewGlue) core[rg] = reviewGlue[rg]

  // The Mac's key notation (decision 9) in the texts the view logic writes for the launcher's own
  // rows: modifiers as ⌥ ⇧ ⌃ ⌘ (⌘V pastes, as Ctrl+V does). Never on a paper's or a task's own text.
  // (and the AI features named one way, in the place that installs them: Settings › Setup)
  var MAC_KEYS = [[/Settings › Install AI features/g, "Settings › Setup installs them"], [/Settings › Requirements › Install AI features/g, "Settings › Setup"],
    [/Install the AI features first \(below\)/g, "Install the AI features first (Settings › Setup, below)"], [/Alt\+key\b/g, "⌥ and a key"], [/\bwith Alt\b/g, "with ⌥"], [/Shift\+Enter\b/g, "⇧↵"], [/Ctrl\+Enter\b/g, "⌃↵"], [/Shift\+Alt\+/g, "⇧⌥"], [/Alt\+Shift\+/g, "⇧⌥"], [/Ctrl\+V\b/g, "⌘V"], [/Ctrl\+S\b/g, "⌘S"], [/[Aa]lt\+/g, "⌥"], [/Shift\+/g, "⇧"], [/[Cc]trl\+/g, "⌃"]]
  var macKeys = function (t) {
    if (typeof t !== "string") return t
    for (var i = 0; i < MAC_KEYS.length; i++) t = t.replace(MAC_KEYS[i][0], MAC_KEYS[i][1])
    return t
  }
  var macRow = function (r, fields) {
    var x = Object.assign({}, r)
    fields.forEach(function (f) { if (typeof x[f] === "string") x[f] = macKeys(x[f]) })
    return x
  }
  // (the saved searches list: only its info row is the launcher's words; a search's name is yours)
  var ownSearchRows = core.savedSearchRows
  core.savedSearchRows = function () { return ownSearchRows.apply(null, arguments).map(function (r) { return r.available === false ? macRow(r, ["detail"]) : r }) }
  ;["settingsPage", "statusSettings", "entryRows", "settingMenuRows", "settingsIndex"].forEach(function (name) {
    var f = core[name]
    core[name] = function () { var rows = f.apply(null, arguments); return Array.isArray(rows) ? rows.map(function (r) { return macRow(r, ["label", "labelHtml", "detail", "pageTitle"]) }) : rows }
  })
  // The rows that mix the launcher's words with yours (a paper's menu, tags, prompts, processes):
  // their details only, and never a row that is your content (a note, a task, a chat, a tag).
  var CONTENT = ["note", "read", "chat-session", "artifact", "todo", "task"] // (their details are yours, or a runner's report)
  ;["menu", "actions", "tagRows", "promptRows", "promptEditor", "promptModels", "promptEfforts", "promptOutputs", "titleRows", "extractMenu"].forEach(function (name) {
    var f = core[name]
    core[name] = function () {
      var out = f.apply(null, arguments)
      var fix = function (rows) { return rows.map(function (r) { return CONTENT.indexOf(r.rowId) >= 0 ? r : macRow(r, ["detail"]) }) }
      if (Array.isArray(out)) return fix(out)
      if (out && Array.isArray(out.rows)) return Object.assign({}, out, { rows: fix(out.rows), ordered: Array.isArray(out.ordered) ? fix(out.ordered) : out.ordered })
      return out
    }
  })
  var results = core.results
  core.results = function () {
    return results.apply(null, arguments).map(function (r) { return r.section === "Go to" ? macRow(r, ["subtitle"]) : r })
  }
  core.macKeys = function (text) { return macKeys(text) }

  // The keybindings (Views.KEYBINDINGS, VIEW_KEYS) as a Mac has them: its notation in the keys' column; Omarchy's
  // hotkey and its window close become the app's.
  // (Alt+Backspace clears the box on Omarchy; on the Mac ⌥⌫ deletes a word and ⌃U clears it)
  var MAC_KEY_COLUMN = [[/Super\+Shift\+Z/g, "⌃⌥Z"], [/Super\+W/g, "⌘W"], [/Alt\+Backspace/g, "⌃U"], [/\bPgUp\b/g, "pgup"], [/\bPgDn\b/g, "pgdn"],
    [/\bHome\b/g, "home"], [/\bEnd\b/g, "end"], [/Ctrl\+S\b/g, "⌘S"], [/Ctrl\+V\b/g, "⌘V"], [/Ctrl\+C\b/g, "⌘C"],
    [/Ctrl\+-/g, "⌘-"], [/Ctrl\+\+/g, "⌘+"], [/Ctrl\+0/g, "⌘0"], [/Shift\+Alt\+/g, "⇧⌥"], [/Alt\+Shift\+/g, "⇧⌥"], [/Ctrl\+Shift\+/g, "⌃⇧"],
    [/[Aa]lt\+/g, "⌥"], [/Shift\+/g, "⇧"], [/[Cc]trl\+/g, "⌃"], [/\bEnter\b/g, "↵"], [/\bEsc\b/g, "esc"], [/\bBackspace\b/g, "⌫"], [/\bDelete\b/g, "⌘⌫"], // (⌘⌫ the Mac's delete in a list; ⌦ works too)
    [/\bTab\b/g, "tab"], [/\bSpace\b/g, "space"]]
  var MAC_KEY_LINES = [["(your Hyprland keybinding)", "(the app's hotkey: menu bar icon › Hotkey and Login…)"], ["Close the launcher when it's open (with the README's rebinding)", "Close the launcher"],
    ["Clear the search box", "Clear the search box (⌥⌫ deletes a word)"], ["Stop the answer, or close a menu", "Stop the answer, or hide these keys"],
    ["The launcher as a window, and back as the overlay", "The launcher as a window or as the overlay, for this opening"],
    // (g and G: the Mac's results have Group, Sort and Order, 0.4.10)
    ["Group or sort the papers: by paper status, task status or group, a taxonomy, date added, changed, published; relevance",
      "Sort the papers (g: relevance, date added, changed, published, manual) or group them (G: paper status, task status or group, a taxonomy); the order is the bar's ↓ Desc / ↑ Asc"],
    ["Group or sort the papers / back a step", "The next sort / the next grouping"], ["Group or sort the papers", "Sort the papers (g), group them (G)"],
    // (Sort › Manual: a list you browse in your order)
    ["Move a pinned paper, collection or tag (before you type)", "Move a pinned paper, collection or tag (before you type), or a paper in a collection, tag or saved search (Sort › Manual; drag works too)"],
    ["Move a pinned item (before you type)", "Move a pinned item (before you type), or a paper in a list you browse (Sort › Manual; drag works too)"]]
  var macKeyColumn = function (t) {
    if (typeof t !== "string") return t
    for (var i = 0; i < MAC_KEY_COLUMN.length; i++) t = t.replace(MAC_KEY_COLUMN[i][0], MAC_KEY_COLUMN[i][1])
    return t
  }
  var macKeyLine = function (t) {
    if (typeof t !== "string") return t
    MAC_KEY_LINES.forEach(function (w) { t = t.split(w[0]).join(w[1]) })
    return macKeys(t).replace(/\bEnter\b/g, "↵").replace(/\bSpace\b/g, "space") // (a line's keys, in the column's notation)
  }
  // Where you are, for the keys' first section (Views.keysContext).
  core.keysContext = function (view, ctx, alt) { return Object.assign(V.keysContext(view, ctx || {}), { alt: !!alt }) }
  // The ⌥-key mode's keys as the hints write them (keyName): ⌥t, a capital ⌥⇧W, so g and G stay apart.
  var macAlt = function (keys) {
    return String(keys).split("  ").map(function (part) {
      return part.split(" ").map(function (k) { return !/^[a-zA-Z.;#!]$/.test(k) ? k : /[A-Z]/.test(k) ? "⌥⇧" + k : "⌥" + k }).join(" ")
    }).join("  ")
  }
  // What a search in the keys view also finds a symbol by.
  var SYMBOL_WORDS = [["⌘", "cmd command"], ["⌥", "option opt alt"], ["⌃", "control ctrl"], ["⇧", "shift"], ["↵", "enter return"], ["⌫", "backspace"],
    ["⌘⌫", "delete del"], ["esc", "escape"]]
  // The keys view (? or F1): Here first, then every section, in the Mac's notation; typing finds a key by the words
  // shown (and the symbols' names), never by Omarchy's.
  var REVIEW_KEY = "Open the results as a review table, in its own window"
  core.keyRows = function (query, here) {
    var alt = !!(here && here.alt)
    var rows = V.buildKeyRows("", here ? Object.assign({}, here, { alt: false }) : null).map(function (r) {
      var mine = alt && r.section.indexOf("Here · ") === 0
      var label = macKeyLine(r.label) // (and the HTML the row draws, from it)
      return Object.assign({}, r, { trailing: macKeyColumn(mine ? macAlt(r.trailing) : r.trailing), label: label, labelHtml: V.escapeHtml(label), section: macKeyLine(r.section) })
    })
    // the Mac's own: ⌘T, after ⌘S, wherever ⌘S is (phase 11a's review tables)
    rows = rows.reduce(function (out, r) {
      out.push(r)
      if (r.trailing === "⌘S") out.push(Object.assign({}, r, { trailing: "⌘T", label: REVIEW_KEY, labelHtml: V.escapeHtml(REVIEW_KEY) }))
      return out
    }, [])
    var words = String(query || "").toLowerCase().split(/\s+/).filter(function (w) { return w })
    if (!words.length) return rows
    return rows.filter(function (r) {
      var hay = (r.section + " " + r.trailing + " " + r.label).toLowerCase()
      SYMBOL_WORDS.forEach(function (s) { if (r.trailing.indexOf(s[0]) >= 0) hay += " " + s[1] })
      return words.every(function (w) { return hay.indexOf(w) >= 0 })
    })
  }
  // A window's keys (note-window, chat-window): [[keys, what]], and ⌘W, which closes either.
  core.windowKeys = function (group) {
    if (!V.VIEW_KEYS[group]) return []
    return V.VIEW_KEYS[group].map(function (k) {
      // (the chat window's box takes ? and esc as text; F1, and ? outside it, show the keys)
      if (group === "chat-window" && k[0] === "F1  Esc") return ["F1  ?", "Show or hide these keys (? outside the box)"]
      return [macKeyColumn(k[0]), macKeyLine(k[1])]
    }).concat([["⌘W", "Close the window" + (group === "chat-window" ? " (a running answer stops)" : "")]])
  }
  return core
})()

if (typeof module !== "undefined") module.exports = Glue
