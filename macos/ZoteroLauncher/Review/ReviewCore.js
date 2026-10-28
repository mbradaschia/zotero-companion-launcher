// The review table's logic (phase 11a, macos/docs/superpowers/specs/2026-10-27-phase-11a-review-table-design.md):
// the fields a paper has and their values, the columns a review shows, the multi-key sort, the CSV, and the
// review's files (reviews/<id>.json, columns/<id>.md, cells/<column>.cells.json) read and written. Pure and ES5:
// one file for JavaScriptCore (Glue, the files), the grid page (inlined into it) and Node (the tests).
var ReviewCore = (function () {
  var STATUS_PREFIX = "s/"
  var ABS = ["4*", "4", "3", "2", "1"]
  var ABDC = ["A*", "A", "B", "C"]
  var LINES = [1, 2, 3, 6, 0] // 0: all of it
  var MIN_WIDTH = 16, MAX_WIDTH = 1200 // a column's width, in px: as narrow as a sliver (it's yours to judge)
  var MAX_COLUMNS = 80
  var MAX_SORT = 6

  // The attributes every paper has, in the order Columns ▾ and + Column list them. type: how a value
  // compares and shows (text, number, date, flag, pills); order: a sort of its own (statuses, grades).
  var FIELDS = [
    { id: "title", label: "Paper", group: "Zotero", type: "text", width: 300, lines: 3 },
    { id: "authors", label: "Authors", group: "Zotero", type: "text", width: 150, lines: 1 },
    { id: "year", label: "Year", group: "Zotero", type: "number", width: 64, lines: 1 },
    { id: "publication", label: "Publication", group: "Zotero", type: "text", width: 180, lines: 2 },
    { id: "type", label: "Item type", group: "Zotero", type: "text", width: 120, lines: 1 },
    { id: "added", label: "Added", group: "Zotero", type: "date", width: 96, lines: 1 },
    { id: "modified", label: "Modified", group: "Zotero", type: "date", width: 96, lines: 1 },
    { id: "pdfs", label: "PDFs", group: "Zotero", type: "number", width: 60, lines: 1 },
    { id: "notes", label: "Notes", group: "Zotero", type: "number", width: 64, lines: 1 },
    { id: "tags", label: "Tags", group: "Zotero", type: "number", width: 60, lines: 1 },
    { id: "text", label: "Text extracted", group: "Zotero", type: "flag", width: 100, lines: 1 },
    { id: "status", label: "Status", group: "Yours", type: "text", order: "status", width: 104, lines: 1, edit: "status" },
    { id: "task", label: "Task", group: "Yours", type: "text", order: "task", width: 104, lines: 1, edit: "task" },
    { id: "abs", label: "ABS", group: "Rankings", type: "text", order: "abs", width: 64, lines: 1 },
    { id: "abdc", label: "ABDC", group: "Rankings", type: "text", order: "abdc", width: 64, lines: 1 },
    { id: "ft50", label: "FT50", group: "Rankings", type: "flag", width: 60, lines: 1 },
    { id: "utd24", label: "UTD24", group: "Rankings", type: "flag", width: 64, lines: 1 },
    { id: "field", label: "ABS field", group: "Rankings", type: "text", width: 140, lines: 1 }
  ]
  var DEFAULT_COLUMNS = ["title", "authors", "year", "publication", "abs", "status", "task"]

  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k) }
  function isObject(x) { return !!x && typeof x === "object" && !Array.isArray(x) }
  function unsafeKey(k) { return k === "__proto__" || k === "constructor" || k === "prototype" }
  function str(x, max) { return x === undefined || x === null ? "" : String(x).slice(0, max || 2000) }
  function parseJSON(text) {
    try {
      var j = JSON.parse(String(text || ""), function (k, v) { return unsafeKey(k) ? undefined : v })
      return isObject(j) ? j : null
    } catch (e) {
      return null
    }
  }
  function fieldById(id) {
    for (var i = 0; i < FIELDS.length; i++) if (FIELDS[i].id === id) return FIELDS[i]
    return null
  }

  // A paper's id, as every synced file keys it: "libraryID:key".
  function paperId(r) { return (Number(r && r.libraryID) || 1) + ":" + str(r && r.key, 40) }

  // "journalArticle" → "Journal article"
  function itemTypeName(t) {
    var s = str(t, 60).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""
  }

  function statusName(tag) {
    var t = str(tag, 200)
    if (t === "\u0000") return "" // (a bridge too old to say)
    return t.toLowerCase().indexOf(STATUS_PREFIX) === 0 ? t.slice(STATUS_PREFIX.length) : t
  }

  // ------------------------------------------------------------ columns

  // A taxonomy's column: "tax:<prefix without the slash>".
  function taxonomyColumn(t) {
    var prefix = str(t && t.prefix, 40)
    return { id: "tax:" + prefix.replace(/\/$/, ""), label: str(t && t.name, 80) || prefix, group: "Taxonomies", type: "pills", width: 180, lines: 2,
      prefix: prefix, several: !(t && t.kind === "one") }
  }

  // Every column a review can add: the fields, each taxonomy, your own columns. ctx: { taxonomies },
  // defs: { <column id>: a column file's definition }.
  function available(ctx, defs) {
    var out = FIELDS.slice()
    ;((ctx && ctx.taxonomies) || []).forEach(function (t) { if (t && t.prefix) out.push(taxonomyColumn(t)) })
    Object.keys(defs || {}).sort().forEach(function (id) {
      var d = defs[id]
      if (d && d.kind === "own") out.push(ownColumn(d))
    })
    return out
  }

  function ownColumn(d) {
    return { id: d.id, label: d.label, group: "Your columns", type: d.type === "choice" ? "choice" : "text", options: d.options || [],
      width: d.type === "choice" ? 110 : 220, lines: d.type === "choice" ? 1 : 3, edit: d.type === "choice" ? "choice" : "text", own: true, description: d.description || "" }
  }

  // The columns a review shows, in its order, with its layout; a column whose definition is gone (its file deleted on
  // another machine) is `missing`, kept in the review but not drawn.
  function columns(review, ctx, defs) {
    var all = available(ctx, defs)
    var byId = {}
    all.forEach(function (c) { byId[c.id] = c })
    return (review.columns || []).map(function (l) {
      var c = own(byId, l.id) ? byId[l.id] : { id: l.id, label: l.id, group: "", type: "text", width: 120, lines: 1, missing: true }
      return Object.assign({}, c, { width: l.width || c.width, lines: l.lines === undefined || l.lines === null ? c.lines : l.lines, hidden: !!l.hidden })
    })
  }

  // ------------------------------------------------------------ values

  // A column's value for a paper: text, a number, true, an array of labels, or "" (empty). r: a /search row;
  // ctx: { tasks: { id: { status } } }; cells: { <column id>: { <paper id>: { v } } }.
  function value(col, r, ctx, cells) {
    var id = col.id
    var rank = (r && r.rank) || {}
    if (col.own) {
      var c = cells && cells[id] && own(cells[id], paperId(r)) ? cells[id][paperId(r)] : null
      return c && c.v !== undefined && c.v !== null ? str(c.v, 20000) : ""
    }
    if (col.prefix) {
      var p = col.prefix.toLowerCase()
      return ((r && r.facets) || []).filter(function (t) { return String(t).toLowerCase().indexOf(p) === 0 }).map(function (t) { return String(t).slice(p.length) })
    }
    switch (id) {
      case "title": return str(r.title, 2000)
      case "authors": return str(r.creator, 500)
      case "year": var y = parseInt(r.year, 10); return isNaN(y) ? "" : y
      case "publication": return str(r.publication, 500)
      case "type": return itemTypeName(r.itemType)
      case "added": return str(r.dateAdded, 10)
      case "modified": return str(r.dateModified, 10)
      case "pdfs": return Number(r.pdfCount) || ""
      case "notes": return Number(r.noteCount) || ""
      case "tags": return Number(r.tagCount) || ""
      case "text": return r.extracted ? true : ""
      case "status": return statusName(r.status)
      case "task":
        var t = ctx && ctx.tasks && own(ctx.tasks, paperId(r)) ? ctx.tasks[paperId(r)] : null
        return t ? str(t.name, 100) : ""
      case "abs": return str(rank.ajg, 10)
      case "abdc": return str(rank.abdc, 10)
      case "ft50": return rank.ft50 ? true : ""
      case "utd24": return rank.utd24 ? true : ""
      case "field": return str(rank.field, 100)
    }
    return ""
  }

  function isEmpty(v) { return v === "" || v === null || v === undefined || (Array.isArray(v) && !v.length) }

  // A value as text (the cell's, the CSV's).
  function text(col, v) {
    if (isEmpty(v)) return ""
    if (v === true) return "yes"
    if (Array.isArray(v)) return v.join("; ")
    return String(v)
  }

  // ------------------------------------------------------------ sort

  var collator = null
  function collate(a, b) {
    if (!collator) collator = typeof Intl !== "undefined" && Intl.Collator ? new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }) : { compare: function (x, y) { return x < y ? -1 : x > y ? 1 : 0 } }
    return collator.compare(a, b)
  }

  function indexIn(list, v) {
    var s = String(v).toLowerCase()
    for (var i = 0; i < list.length; i++) if (String(list[i]).toLowerCase() === s) return i
    return list.length // an unknown value after the known ones
  }

  // a before b (< 0) as the column orders them, both not empty, ascending.
  function compareValues(col, a, b, ctx) {
    if (col.order === "status") return indexIn((ctx && ctx.statuses) || [], a) - indexIn((ctx && ctx.statuses) || [], b) || collate(String(a), String(b))
    if (col.order === "task") return indexIn((ctx && ctx.taskStatuses) || [], a) - indexIn((ctx && ctx.taskStatuses) || [], b) || collate(String(a), String(b))
    if (col.order === "abs") return indexIn(ABS, a) - indexIn(ABS, b)
    if (col.order === "abdc") return indexIn(ABDC, a) - indexIn(ABDC, b)
    if (col.type === "choice") return indexIn(col.options || [], a) - indexIn(col.options || [], b) || collate(String(a), String(b))
    if (typeof a === "number" && typeof b === "number") return a - b
    if (a === true || b === true) return 0
    if (Array.isArray(a) || Array.isArray(b)) return collate(text(col, a), text(col, b))
    return collate(String(a), String(b))
  }

  // The rows in the sort's order: each key in turn, empty values last whichever the direction, ties in the set's
  // order. sorts: [{ column, dir }]; cols: the review's columns. → a new array.
  function sortRows(rows, sorts, cols, ctx, cells) {
    var keys = (sorts || []).map(function (s) {
      var col = null
      for (var i = 0; i < cols.length; i++) if (cols[i].id === s.column) col = cols[i]
      return col && !col.missing ? { col: col, desc: s.dir === "desc" } : null
    }).filter(Boolean)
    var decorated = (rows || []).map(function (r, i) { return { r: r, i: i, v: keys.map(function (k) { return value(k.col, r, ctx, cells) }) } })
    if (!keys.length) return rows.slice()
    decorated.sort(function (x, y) {
      for (var k = 0; k < keys.length; k++) {
        var a = x.v[k], b = y.v[k], ea = isEmpty(a), eb = isEmpty(b)
        if (ea && eb) continue
        if (ea !== eb) return ea ? 1 : -1
        var c = compareValues(keys[k].col, a, b, ctx)
        if (c) return keys[k].desc ? -c : c
      }
      return x.i - y.i
    })
    return decorated.map(function (d) { return d.r })
  }

  // ------------------------------------------------------------ group

  // A column the papers can be grouped by: one whose values repeat (not the paper, its authors, a date, your text).
  function groupable(col) {
    return !!col && !col.missing && col.id !== "title" && col.id !== "authors" && col.type !== "date" && !(col.own && col.type !== "choice")
  }

  // The rows (already sorted) in groups by a column's value: [{ label, value, rows }], the groups in the column's
  // order (descending with desc), the papers without a value last; the rows keep their order inside each. No
  // group (or one that can't group): one group, its label "".
  function groupRows(rows, groupId, cols, ctx, cells, desc) {
    var col = null
    for (var i = 0; i < (cols || []).length; i++) if (cols[i].id === groupId) col = cols[i]
    if (!groupId || !groupable(col)) return [{ label: "", value: "", rows: (rows || []).slice() }]
    var byKey = {}, groups = []
    ;(rows || []).forEach(function (r) {
      var v = value(col, r, ctx, cells), t = text(col, v)
      if (!own(byKey, t)) { byKey[t] = { label: col.label + " · " + (t || "none"), value: v, rows: [] }; groups.push(byKey[t]) }
      byKey[t].rows.push(r)
    })
    groups.sort(function (a, b) {
      var ea = isEmpty(a.value), eb = isEmpty(b.value)
      if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1
      var c = compareValues(col, a.value, b.value, ctx)
      return desc ? -c : c
    })
    return groups
  }

  // A header's click (alone: this key only, ascending, then descending, then none) or ⇧-click (added as the next key,
  // or its direction turned, or taken out). → the new sort.
  function clickSort(sorts, column, add) {
    var list = (sorts || []).map(function (s) { return { column: s.column, dir: s.dir } })
    var at = -1
    for (var i = 0; i < list.length; i++) if (list[i].column === column) at = i
    if (!add) {
      if (at < 0 || list.length > 1) return [{ column: column, dir: "asc" }]
      return list[0].dir === "asc" ? [{ column: column, dir: "desc" }] : []
    }
    if (at < 0) return list.concat([{ column: column, dir: "asc" }]).slice(0, MAX_SORT)
    if (list[at].dir === "asc") { list[at].dir = "desc"; return list }
    list.splice(at, 1)
    return list
  }

  // ------------------------------------------------------------ CSV

  // A spreadsheet takes a cell that starts with = + - @ as a formula: such text gets a leading apostrophe.
  function csvCell(v) {
    if (typeof v === "number") return String(v)
    var s = String(v)
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
    return /[",\r\n;]/.test(s) || s !== s.trim() ? '"' + s.replace(/"/g, '""') + '"' : s
  }

  // The rows as shown (their order, the columns shown in theirs), as CSV: UTF-8 with a BOM (Excel reads the accents),
  // CRLF lines, and the paper's id last (libraryID:key).
  function csv(rows, cols, ctx, cells) {
    var shown = cols.filter(function (c) { return !c.hidden && !c.missing })
    var lines = [shown.map(function (c) { return csvCell(c.label) }).concat(["Zotero item"]).join(",")]
    ;(rows || []).forEach(function (r) {
      lines.push(shown.map(function (c) {
        var v = value(c, r, ctx, cells)
        return typeof v === "number" ? String(v) : csvCell(text(c, v))
      }).concat([csvCell(paperId(r))]).join(","))
    })
    return "﻿" + lines.join("\r\n") + "\r\n"
  }

  // ------------------------------------------------------------ files

  function randomId(prefix, rand) {
    var r = rand || Math.random
    var s = ""
    for (var i = 0; i < 10; i++) s += "0123456789abcdefghijklmnopqrstuvwxyz".charAt(Math.floor(r() * 36) % 36)
    return prefix + s
  }
  function validId(id, prefix) { return new RegExp("^" + prefix + "[a-z0-9]{10}$").test(String(id || "")) }

  function normalizeSource(s) {
    var o = isObject(s) ? s : {}
    var type = ["query", "search", "collection", "tag"].indexOf(o.type) >= 0 ? o.type : "query"
    return { type: type, query: str(o.query, 2000), key: str(o.key, 200), libraryID: Number(o.libraryID) || 1, title: str(o.title, 200) }
  }

  function normalizeLayout(l) {
    var o = isObject(l) ? l : {}
    var width = Math.round(Number(o.width) || 0)
    var lines = LINES.indexOf(Number(o.lines)) >= 0 ? Number(o.lines) : null
    var out = { id: str(o.id, 60) }
    if (width) out.width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width))
    if (lines !== null) out.lines = lines
    if (o.hidden) out.hidden = true
    return out
  }

  // A review as its file holds it, made whole: what is missing gets its default, what is wrong is left out. Its id is
  // its file's name, whatever the file says.
  function normalizeReview(raw, id) {
    var o = isObject(raw) ? raw : {}
    var seen = {}
    var cols = (Array.isArray(o.columns) ? o.columns : []).map(normalizeLayout).filter(function (c) {
      if (!/^(?:[a-z0-9]+|tax:[a-z][a-z0-9-]{0,19}|c-[a-z0-9]{10})$/.test(c.id) || seen[c.id]) return false
      return (seen[c.id] = true)
    }).slice(0, MAX_COLUMNS)
    if (!seen.title) cols.unshift({ id: "title" }) // the paper column is always there, first
    else {
      var t = cols.filter(function (c) { return c.id === "title" })[0]
      cols = [t].concat(cols.filter(function (c) { return c.id !== "title" }))
      delete t.hidden
    }
    var sorts = (Array.isArray(o.sort) ? o.sort : []).filter(function (s) { return isObject(s) && seen[s.column] }).map(function (s) {
      return { column: String(s.column), dir: s.dir === "desc" ? "desc" : "asc" }
    }).slice(0, MAX_SORT)
    return {
      id: String(id || o.id || ""),
      name: str(o.name, 120).trim() || "Review",
      source: normalizeSource(o.source),
      columns: cols,
      sort: sorts,
      group: typeof o.group === "string" && seen[o.group] && o.group !== "title" ? o.group : "",
      lines: LINES.indexOf(Number(o.lines)) >= 0 ? Number(o.lines) : 3,
      panel: o.panel !== false,
      created: str(o.created, 40),
      updated: str(o.updated, 40)
    }
  }

  // A review file's text → the review, or null when it isn't one (not JSON, not an object).
  function parseReview(text, id) {
    var j = parseJSON(text)
    return j ? normalizeReview(j, id) : null
  }

  function reviewText(review, now) {
    var r = normalizeReview(review, review.id)
    if (now) r.updated = now
    return JSON.stringify(r, null, 2) + "\n"
  }

  // A source's name, for a new review and the window's title: the saved search's, the collection's, #tag, “query”.
  function sourceName(s) {
    var o = normalizeSource(s)
    if (o.type === "tag") return "#" + (o.title || o.key)
    if (o.type === "query") return o.query ? "“" + o.query.slice(0, 60) + "”" : "Review"
    return o.title || o.key || "Review"
  }

  // A new review of a paper set: the default columns, then each taxonomy's.
  function newReview(source, ctx, now, rand) {
    var cols = DEFAULT_COLUMNS.map(function (id) { return { id: id } })
    ;((ctx && ctx.taxonomies) || []).forEach(function (t) { if (t && t.prefix) cols.push({ id: taxonomyColumn(t).id }) })
    return normalizeReview({ name: sourceName(source), source: source, columns: cols, created: now, updated: now }, randomId("r-", rand))
  }

  // The launcher's /search scope for a review's source (Glue.searchBody's), and the query typed with it.
  function searchScope(source, searches) {
    var s = normalizeSource(source)
    if (s.type === "search") {
      var saved = (searches || []).filter(function (x) { return x && x.id === s.key })[0]
      return { scope: { type: "search", key: s.key, libraryID: 1, title: saved ? saved.name : s.title, query: saved ? saved.query : s.query }, query: "", gone: !saved }
    }
    if (s.type === "collection") return { scope: { type: "collection", key: s.key, libraryID: s.libraryID, title: s.title }, query: "" }
    if (s.type === "tag") return { scope: { type: "tag", key: s.key, libraryID: s.libraryID, title: s.title }, query: "" }
    return { scope: null, query: s.query }
  }

  // ---- a column file (columns/<id>.md): front matter, then its description

  var COLUMN_TYPES = ["text", "choice"]

  function parseColumn(textIn, id) {
    var t = String(textIn || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n")
    var m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(t)
    if (!m) return null
    var meta = {}
    m[1].split("\n").forEach(function (line) {
      var kv = /^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/.exec(line)
      if (!kv || unsafeKey(kv[1])) return
      var v = kv[2].trim()
      if (/^\[.*\]$/.test(v)) { try { v = JSON.parse(v) } catch (e) { v = [] } }
      else if (/^".*"$/.test(v)) { try { v = JSON.parse(v) } catch (e) { v = v.slice(1, -1) } }
      meta[kv[1]] = v
    })
    var kind = meta.kind === "own" ? "own" : str(meta.kind, 20)
    var label = str(meta.label, 80).trim()
    if (!label || !kind) return null
    var type = COLUMN_TYPES.indexOf(meta.type) >= 0 ? meta.type : "text"
    var options = Array.isArray(meta.options) ? meta.options.map(function (o) { return str(o, 60).trim() }).filter(function (o, i, all) { return o && all.indexOf(o) === i }).slice(0, 20) : []
    if (type === "choice" && !options.length) type = "text"
    return { id: String(id || ""), label: label, kind: kind, type: type, options: type === "choice" ? options : [], description: m[2].replace(/\s+$/, "").slice(0, 20000) }
  }

  function columnText(c) {
    var lines = ["---", "label: " + JSON.stringify(str(c.label, 80).trim()), "kind: " + (c.kind || "own"), "type: " + (c.type === "choice" ? "choice" : "text")]
    if (c.type === "choice") lines.push("options: " + JSON.stringify(c.options || []))
    lines.push("---")
    return lines.join("\n") + "\n" + (c.description ? String(c.description).replace(/\s+$/, "") + "\n" : "")
  }

  // A new column of your own, checked: → { column } or { error }.
  function newColumn(spec, rand) {
    var s = isObject(spec) ? spec : {}
    var label = str(s.label, 80).trim()
    if (!label) return { error: "A column needs a name" }
    var type = s.type === "choice" ? "choice" : "text"
    var options = type === "choice" ? (Array.isArray(s.options) ? s.options : String(s.options || "").split(",")).map(function (o) { return str(o, 60).trim() })
      .filter(function (o, i, all) { return o && all.indexOf(o) === i }).slice(0, 20) : []
    if (type === "choice" && options.length < 2) return { error: "One of a list needs two choices or more, separated by commas" }
    return { column: { id: randomId("c-", rand), label: label, kind: "own", type: type, options: options, description: str(s.description, 2000).trim() } }
  }

  // ---- a column's cells (cells/<column id>.cells.json)

  function parseCells(textIn) {
    var j = parseJSON(textIn)
    var cells = j && isObject(j.cells) ? j.cells : {}
    var out = {}
    Object.keys(cells).forEach(function (k) {
      if (unsafeKey(k) || !/^\d+:[A-Z0-9]{8}$/.test(k) || !isObject(cells[k])) return
      out[k] = { v: str(cells[k].v, 20000), updated: str(cells[k].updated, 40), by: str(cells[k].by, 80) }
    })
    return out
  }

  // A cell set (an empty value too: it stays, dated, so the other machine's older value doesn't come back). → the
  // file's new text, its papers in order.
  function setCell(textIn, paper, v, now, by) {
    if (!/^\d+:[A-Z0-9]{8}$/.test(String(paper))) return null
    var cells = parseCells(textIn)
    cells[paper] = { v: str(v, 20000), updated: str(now, 40), by: str(by, 80) }
    var sorted = {}
    Object.keys(cells).sort().forEach(function (k) { sorted[k] = cells[k] })
    return JSON.stringify({ cells: sorted }, null, 2) + "\n"
  }

  return {
    FIELDS: FIELDS, DEFAULT_COLUMNS: DEFAULT_COLUMNS, LINES: LINES, MIN_WIDTH: MIN_WIDTH, MAX_WIDTH: MAX_WIDTH, ABS: ABS, ABDC: ABDC,
    paperId: paperId, itemTypeName: itemTypeName, statusName: statusName,
    fieldById: fieldById, taxonomyColumn: taxonomyColumn, available: available, ownColumn: ownColumn, columns: columns,
    value: value, isEmpty: isEmpty, text: text, compareValues: compareValues, sortRows: sortRows, clickSort: clickSort,
    groupable: groupable, groupRows: groupRows,
    csvCell: csvCell, csv: csv,
    randomId: randomId, validId: validId, normalizeReview: normalizeReview, parseReview: parseReview, reviewText: reviewText,
    sourceName: sourceName, newReview: newReview, searchScope: searchScope,
    parseColumn: parseColumn, columnText: columnText, newColumn: newColumn, parseCells: parseCells, setCell: setCell
  }
})()

if (typeof module !== "undefined") module.exports = ReviewCore
