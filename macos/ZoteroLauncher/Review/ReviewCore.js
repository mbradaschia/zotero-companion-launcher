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
  // AI columns (phase 11b, macos/docs/superpowers/specs/2026-10-28-phase-11b-ai-columns-design.md)
  var AI_KINDS = ["prompt", "jev-several", "jev-one", "jev-relevance"]
  var KIND_NAMES = { prompt: "AI prompt", "jev-several": "Jev, several labels", "jev-one": "Jev, best fit", "jev-relevance": "Jev, relevance" }
  var SHAPES = ["text", "list", "number", "choice"]
  var BANDS = [[70, "high"], [40, "maybe"], [0, "low"]] // relevance: from 70, from 40
  var JEV_PRICE_IN = 0.042 // $ per million input tokens (the runner's taxonomies.mjs)

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
      else if (d && AI_KINDS.indexOf(d.kind) >= 0) out.push(aiColumn(d, ctx))
    })
    return out
  }

  // An AI column as the table shows it: how it draws, sorts and groups (a number, one of a list, labels, text), and
  // its fingerprint now (columnHash). A Jev column on a taxonomy that's gone says so (`problem`) and doesn't run.
  function aiColumn(d, ctx) {
    var t = d.taxonomy ? taxonomyOf(ctx, d.taxonomy) : null
    var type = d.kind === "jev-relevance" || (d.kind === "prompt" && d.shape === "number") ? "number"
      : d.kind === "jev-several" ? "pills" : (d.kind === "prompt" && d.shape === "choice") || d.kind === "jev-one" ? "choice" : "text"
    var wide = d.kind === "prompt" && (d.shape === "text" || d.shape === "list")
    var c = { id: d.id, label: d.label, group: "AI columns", type: type, options: d.kind === "jev-one" ? (t ? t.labels || [] : []) : d.options || [],
      width: wide ? 260 : d.kind === "jev-several" ? 180 : 120, lines: wide ? 3 : d.kind === "jev-several" ? 2 : 1, edit: d.kind === "prompt" && type === "text" ? "text" : "",
      ai: true, kind: d.kind, kindName: KIND_NAMES[d.kind], reads: d.kind === "prompt" ? d.reads : "tagging", shape: d.shape, length: d.length, evidence: !!d.evidence,
      model: d.model || "default", taxonomy: d.taxonomy || "", topic: d.topic || "", description: d.description || "", hash: columnHash(d, t) }
    if ((d.kind === "jev-several" || d.kind === "jev-one") && !t) c.problem = "Its taxonomy (" + d.taxonomy + ") isn't there any more: pick another in a new column"
    return c
  }

  function taxonomyOf(ctx, id) {
    var list = (ctx && ctx.taxonomies) || []
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i]
    return null
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
    if (col.ai) {
      var a = cellOf(cells, id, r)
      if (!a || a.v === undefined || a.v === null) return ""
      if (Array.isArray(a.v)) return a.v.slice()
      if (col.type === "number" && typeof a.v !== "number") { var n = parseFloat(a.v); return isNaN(n) ? str(a.v, 200) : n }
      return typeof a.v === "number" ? a.v : str(a.v, 20000)
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

  function cellOf(cells, colId, r) { return cells && cells[colId] && own(cells[colId], paperId(r)) ? cells[colId][paperId(r)] : null }

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
    if (AI_KINDS.indexOf(kind) >= 0) return aiDef(meta, kind, label, m[2], id)
    var type = COLUMN_TYPES.indexOf(meta.type) >= 0 ? meta.type : "text"
    var options = Array.isArray(meta.options) ? meta.options.map(function (o) { return str(o, 60).trim() }).filter(function (o, i, all) { return o && all.indexOf(o) === i }).slice(0, 20) : []
    if (type === "choice" && !options.length) type = "text"
    return { id: String(id || ""), label: label, kind: kind, type: type, options: type === "choice" ? options : [], description: m[2].replace(/\s+$/, "").slice(0, 20000) }
  }

  // An AI column's file, made whole: what's missing takes its default, what's wrong is left out.
  function aiDef(meta, kind, label, body, id) {
    var shape = SHAPES.indexOf(meta.shape) >= 0 ? meta.shape : "text"
    var options = cleanOptions(meta.options)
    if (shape === "choice" && options.length < 2) shape = "text"
    var length = Math.round(Number(meta.length) || 0)
    var d = { id: String(id || ""), label: label, kind: kind, description: String(body || "").replace(/\s+$/, "").slice(0, 20000) }
    if (kind === "prompt") {
      d.reads = meta.reads === "full" ? "full" : "abstract"
      d.shape = shape
      d.length = shape === "text" ? Math.max(5, Math.min(500, length || 60)) : shape === "list" ? Math.max(1, Math.min(30, length || 5)) : 0
      d.options = shape === "choice" ? options : []
      d.evidence = meta.evidence === true || meta.evidence === "true"
      d.model = str(meta.model, 120).trim() || "default"
    } else if (kind === "jev-relevance") {
      d.topic = str(meta.topic, 200).trim()
    } else {
      d.taxonomy = /^[a-z0-9][a-z0-9-]{0,59}$/.test(String(meta.taxonomy || "")) ? String(meta.taxonomy) : ""
    }
    return d
  }

  function cleanOptions(o) {
    var list = Array.isArray(o) ? o : String(o || "").split(",")
    return list.map(function (x) { return str(x, 60).trim() }).filter(function (x, i, all) { return x && all.indexOf(x) === i }).slice(0, 20)
  }

  function columnText(c) {
    if (AI_KINDS.indexOf(c.kind) >= 0) return aiColumnText(c)
    var lines = ["---", "label: " + JSON.stringify(str(c.label, 80).trim()), "kind: " + (c.kind || "own"), "type: " + (c.type === "choice" ? "choice" : "text")]
    if (c.type === "choice") lines.push("options: " + JSON.stringify(c.options || []))
    lines.push("---")
    return lines.join("\n") + "\n" + (c.description ? String(c.description).replace(/\s+$/, "") + "\n" : "")
  }

  function aiColumnText(c) {
    var d = aiDef(c, c.kind, str(c.label, 80).trim(), c.description, c.id)
    var lines = ["---", "label: " + JSON.stringify(d.label), "kind: " + d.kind]
    if (d.kind === "prompt") {
      lines.push("reads: " + d.reads, "shape: " + d.shape)
      if (d.length) lines.push("length: " + d.length)
      if (d.shape === "choice") lines.push("options: " + JSON.stringify(d.options))
      lines.push("evidence: " + (d.evidence ? "true" : "false"), "model: " + JSON.stringify(d.model))
    } else if (d.kind === "jev-relevance") lines.push("topic: " + JSON.stringify(d.topic))
    else lines.push("taxonomy: " + d.taxonomy)
    lines.push("---")
    return lines.join("\n") + "\n" + (d.description ? d.description + "\n" : "")
  }

  // A new AI column, checked: spec { label, kind, description (the prompt; relevance: what relevant means), reads,
  // shape, length, options, evidence, model, taxonomy, topic }; ctx: { taxonomies } (a Jev column's must be there,
  // of its kind). → { column } or { error }.
  function newAiColumn(spec, ctx, rand) {
    var s = isObject(spec) ? spec : {}
    var label = str(s.label, 80).trim()
    if (!label) return { error: "A column needs a name" }
    if (AI_KINDS.indexOf(s.kind) < 0) return { error: "Pick what the AI does" }
    var d = aiDef({ reads: s.reads, shape: s.shape, length: s.length, options: s.options, evidence: s.evidence ? "true" : "false", model: s.model, taxonomy: s.taxonomy, topic: s.topic },
      s.kind, label, str(s.description, 20000).trim(), randomId("c-", rand))
    if (s.kind === "prompt") {
      if (!d.description) return { error: "Write the prompt: what to ask of each paper" }
      if (s.shape === "choice" && d.shape !== "choice") return { error: "One of a list needs two choices or more, separated by commas" }
    }
    if (s.kind === "jev-relevance" && (!d.topic || !d.description)) return { error: "Name the topic, and say what relevant means" }
    if (s.kind === "jev-several" || s.kind === "jev-one") {
      var t = taxonomyOf(ctx, d.taxonomy)
      if (!t) return { error: "Pick one of your taxonomies" }
      if ((t.kind === "one") !== (s.kind === "jev-one")) return { error: s.kind === "jev-one" ? "Best fit takes a taxonomy of the one-label kind" : "Several labels takes a taxonomy of the several-labels kind" }
    }
    return { column: d }
  }

  // ---- AI cells: the column's fingerprint, a cell's state, the plan of a run

  // FNV-1a, 64 bits, as 16 hex (two 32-bit halves; ES5, no crypto in JavaScriptCore's page) → its first 12.
  function hash12(text) {
    var h1 = 0x811c9dc5, h2 = 0xcbf29ce4
    var s = String(text)
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i)
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
      h2 = Math.imul(h2 ^ (c + i), 0x01000193) >>> 0
      h2 = (h2 ^ (h1 >>> 7)) >>> 0
    }
    var hex = function (n) { return ("0000000" + n.toString(16)).slice(-8) }
    return (hex(h1) + hex(h2)).slice(0, 12)
  }

  // What decides a column's answers (the model doesn't: a switch of model is a Run it again). t: a Jev column's
  // taxonomy ({ id, hash }: the runner's fingerprint of it).
  function columnHash(d, t) {
    var what = d.kind === "prompt" ? [d.kind, d.description, d.reads, d.shape, d.length, d.options || [], !!d.evidence]
      : d.kind === "jev-relevance" ? [d.kind, d.topic, d.description] : [d.kind, d.taxonomy, t ? t.hash || "" : ""]
    return hash12(JSON.stringify(what))
  }

  // A cell's state: "empty" (not run), "ok" (up to date), "prompt" (the column changed since), "paper" (the column
  // reads the full text, and the paper's was extracted after the cell was made without it), "yours" (you edited it),
  // "failed" (the last run failed: rec.error).
  function cellState(col, rec, r) {
    if (!rec || (isEmpty(rec.v) && !rec.error && rec.by !== "ai")) return "empty"
    if (rec.error) return "failed"
    if (rec.by !== "ai") return "yours"
    if (rec.hash !== col.hash) return "prompt"
    var reads = col.kind === "prompt" ? col.reads === "full" : true // (the Jev kinds read the extracted text when there is one)
    if (reads && r && r.extracted && !(rec.input && rec.input.text === "note")) return "paper"
    return "ok"
  }

  var STATE_NAMES = { empty: "not run", ok: "up to date", prompt: "prompt changed", paper: "paper changed", yours: "yours", failed: "failed" }

  // What a run would do: cols (AI columns, as columns() resolves them), rows (the papers), cells; opts { yours: also
  // the cells you edited, again: up to date ones too }. → { counts: { <column id>: { empty, ok, … } }, jobs: [{ column,
  // paper }], papers, requests: { jev, prompt }, jevUsd, skipped: { ok, yours, problem } }. At most 200 papers.
  function runPlan(cols, rows, cells, opts) {
    var o = opts || {}
    var counts = {}, jobs = [], papers = {}, jevPapers = {}, promptGroups = {}, skipped = { ok: 0, yours: 0, problem: 0 }
    var ai = (cols || []).filter(function (c) { return c && c.ai && !c.missing })
    var list = (rows || []).slice(0, 200)
    ai.forEach(function (c) {
      var n = counts[c.id] = { empty: 0, ok: 0, prompt: 0, paper: 0, yours: 0, failed: 0 }
      list.forEach(function (r) {
        var st = cellState(c, cellOf(cells, c.id, r), r)
        n[st]++
        if (c.problem) { skipped.problem++; return }
        if (st === "ok" && !o.again) { skipped.ok++; return }
        if (st === "yours" && !o.yours) { skipped.yours++; return }
        var pid = paperId(r)
        jobs.push({ column: c.id, paper: pid })
        papers[pid] = true
        if (c.kind === "prompt") promptGroups[pid + "|" + c.model + "|" + c.reads] = true
        else jevPapers[pid] = true
      })
    })
    var nJev = Object.keys(jevPapers).length
    // (Jev reads about 6k tokens of a paper: its title, abstract and part of its text)
    return { counts: counts, jobs: jobs, papers: Object.keys(papers).length, requests: { jev: nJev, prompt: Object.keys(promptGroups).length },
      jevUsd: Math.round(nJev * 6000 * JEV_PRICE_IN / 1e6 * 10000) / 10000, skipped: skipped }
  }

  // An AI cell's band (relevance): "high", "maybe", "low".
  function band(score) {
    var n = Number(score)
    for (var i = 0; i < BANDS.length; i++) if (n >= BANDS[i][0]) return BANDS[i][1]
    return "low"
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
      out[k] = cellRecord(cells[k], true)
    })
    return out
  }

  // A cell's record, made safe: its value (text; an AI cell's may be a number or a list of labels), who and when,
  // and an AI cell's facts (the model, the column's fingerprint, what it read, probabilities, evidence, why it
  // failed, and an edited cell's last AI answer).
  function cellRecord(c, nested) {
    var v = c.v
    var out = { v: typeof v === "number" && isFinite(v) ? v : Array.isArray(v) ? v.slice(0, 60).map(function (x) { return str(x, 80) }) : str(v, 20000),
      updated: str(c.updated, 40), by: str(c.by, 80) }
    if (c.model) out.model = str(c.model, 120)
    if (c.hash) out.hash = str(c.hash, 20)
    if (isObject(c.input)) out.input = { text: str(c.input.text, 10) }
    if (typeof c.p === "number" && isFinite(c.p)) out.p = Math.max(0, Math.min(1, c.p))
    if (isObject(c.probs)) {
      out.probs = {}
      Object.keys(c.probs).slice(0, 60).forEach(function (l) { if (!unsafeKey(l) && typeof c.probs[l] === "number") out.probs[str(l, 80)] = Math.max(0, Math.min(1, c.probs[l])) })
    }
    if (Array.isArray(c.suggested)) out.suggested = c.suggested.slice(0, 30).map(function (x) { return str(x, 80) })
    if (Array.isArray(c.evidence)) out.evidence = c.evidence.filter(isObject).slice(0, 12).map(function (e) { return { quote: str(e.quote, 1500), page: str(e.page, 20), found: e.found === true } })
    if (c.error) out.error = str(c.error, 500)
    if (nested && isObject(c.ai)) out.ai = cellRecord(c.ai, false)
    return out
  }

  // A cell set (an empty value too: it stays, dated, so the other machine's older value doesn't come back). → the
  // file's new text, its papers in order.
  function setCell(textIn, paper, v, now, by) {
    if (!/^\d+:[A-Z0-9]{8}$/.test(String(paper))) return null
    var cells = parseCells(textIn)
    var was = cells[paper]
    var ai = was && was.by === "ai" && !was.error ? Object.assign({}, was) : was && was.ai ? was.ai : null // (an AI cell you edit: its answer kept)
    if (ai) delete ai.ai
    cells[paper] = { v: str(v, 20000), updated: str(now, 40), by: str(by, 80) }
    if (ai) cells[paper].ai = ai
    return cellsText(cells)
  }

  // Back to the AI's answer: an edited AI cell's last answer, as it was (its state with it). → the file's text, or null.
  function restoreCell(textIn, paper, now) {
    var cells = parseCells(textIn)
    var was = cells[paper]
    if (!was || !was.ai) return null
    cells[paper] = Object.assign({}, was.ai, { updated: str(now, 40) })
    return cellsText(cells)
  }

  function cellsText(cells) {
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
    parseColumn: parseColumn, columnText: columnText, newColumn: newColumn, parseCells: parseCells, setCell: setCell, restoreCell: restoreCell,
    AI_KINDS: AI_KINDS, KIND_NAMES: KIND_NAMES, STATE_NAMES: STATE_NAMES, aiColumn: aiColumn, newAiColumn: newAiColumn, columnHash: columnHash, hash12: hash12,
    cellOf: cellOf, cellState: cellState, runPlan: runPlan, band: band
  }
})()

if (typeof module !== "undefined") module.exports = ReviewCore
