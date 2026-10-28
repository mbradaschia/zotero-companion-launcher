// The review table's page (phase 11a): draws what the app sends (RT.load), and sends what you do (a message on
// `review`). Runs after ReviewCore.js, inlined with it into one script (ReviewWebView: the CSP lets that script
// alone run). Every value is drawn as text, never as HTML. A click only selects: values change in the panel on the
// right, by editing a cell of your own, or with ⌥→← (status) and ⇧⌥→← (task).
var RT = (function () {
  var C = ReviewCore
  var D = { review: null, columns: {}, cells: {}, results: [], total: 0, ctx: {}, readOnly: false, problem: "", loading: true, pinned: false, preview: null }
  var review = null // the review as you arrange it (sent back on each change)
  var cols = [] // its columns, resolved (ReviewCore.columns)
  var rows = [] // the papers, in the sort's order (and grouped: the groups' order)
  var groups = [] // [{ label, rows }]: one group, its label "", when the papers aren't grouped
  var act = { pid: "", c: "title" } // the active cell: its paper and column
  var sel = {} // the selected papers (space, the checkboxes)
  var editing = null // { pid, c } while a cell of yours is being typed
  var flashText = ""
  var flashTimer = null
  var layoutTimer = null
  var press = null // a header pressed: { id, x, moving, to, after } (moved past a few px: the column moves)
  var noClick = false // the click that ends a move or a resize doesn't sort
  var previewing = false // the source's box has a query searched as you type, not kept yet
  var built = false
  var showKeys = false
  var $ = function (id) { return document.getElementById(id) }

  function post(type, o) {
    var m = Object.assign({ type: type }, o || {})
    try { window.webkit.messageHandlers.review.postMessage(m) } catch (e) { (window.RT_SENT = window.RT_SENT || []).push(m) } // (a browser, the checks)
  }

  // An element: el("div", { class: "x", text: "…", title: "…", "data-c": "id" }, [children]).
  function el(tag, attrs, kids) {
    var e = document.createElement(tag)
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k]
      if (v === undefined || v === null || v === false) return
      if (k === "text") e.textContent = String(v)
      else if (k === "class") e.className = v
      else if (k === "checked" || k === "disabled" || k === "value") e[k] = v
      else e.setAttribute(k, v === true ? "" : String(v))
    })
    ;(kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c) })
    return e
  }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); return e }

  // The toolbar's icons: strokes in the text's colour (an SVG drawn here: the page loads no images).
  var ICONS = {
    group: "M3 4h5v5H3z M11 6.5h10 M3 15h5v5H3z M11 17.5h10",
    sort: "M7 20V4 M3 8l4-4 4 4 M17 4v16 M13 16l4 4 4-4",
    asc: "M3 6h5 M3 12h8 M3 18h11 M18 20V5 M15 8l3-3 3 3",
    desc: "M3 6h11 M3 12h8 M3 18h5 M18 4v15 M15 16l3 3 3-3",
    lines: "M4 6h16 M4 10.5h16 M4 15h16 M4 19.5h9",
    columns: "M3 4h18v16H3z M9 4v16 M15 4v16",
    addcol: "M3 4h11v16H3z M8.5 4v16 M19 9v6 M16 12h6",
    export: "M12 15V3 M7 8l5-5 5 5 M5 12v8h14v-8",
    panel: "M3 4h18v16H3z M15 4v16 M17.5 8h1.5 M17.5 11h1.5",
    refresh: "M20 12a8 8 0 1 1-2.34-5.66 M20 4v5h-5",
    pin: "M9 3h6 M10 3v6.5L7 13h10l-3-3.5V3 M12 13v8"
  }
  function icon(name) {
    var ns = "http://www.w3.org/2000/svg"
    var svg = document.createElementNS(ns, "svg")
    svg.setAttribute("viewBox", "0 0 24 24")
    svg.setAttribute("aria-hidden", "true")
    svg.setAttribute("class", "ic ic-" + name)
    var path = document.createElementNS(ns, "path")
    path.setAttribute("d", ICONS[name])
    svg.appendChild(path)
    return svg
  }
  function iconButton(id, name, label, extra) {
    return el("button", Object.assign({ class: "tb icon", id: id, type: "button", title: label, "aria-label": label, "data-icon": name }, extra || {}), [icon(name)])
  }
  function setIcon(b, name) { if (b.getAttribute("data-icon") !== name) { b.setAttribute("data-icon", name); clear(b).appendChild(icon(name)) } }
  function label(b, text) { b.title = text; b.setAttribute("aria-label", text) }

  function flash(text) {
    flashText = String(text || "")
    clearTimeout(flashTimer)
    flashTimer = setTimeout(function () { flashText = ""; drawFoot() }, 4000)
    drawFoot()
  }

  // ------------------------------------------------------------ the data

  function load(data) {
    var first = !D.review || !data.review || D.review.id !== data.review.id
    D = Object.assign({ columns: {}, cells: {}, results: [], total: 0, ctx: {}, readOnly: false, problem: "", loading: false, pinned: false, preview: null }, data || {})
    // your arrangement while a change is on its way stays yours (the file comes back the same a moment later)
    if (first || !layoutTimer) review = JSON.parse(JSON.stringify(D.review))
    if (!built) build()
    if (first) { act = { pid: "", c: "title" }; sel = {} }
    resolve()
    drawAll()
  }

  function resolve() {
    cols = C.columns(review, D.ctx, D.columns)
    // grouped: the groups in the group column's order, descending when the sort has that column descending
    var down = review.sort.some(function (k) { return k.column === review.group && k.dir === "desc" })
    groups = C.groupRows(C.sortRows(D.results || [], review.sort, cols, D.ctx, D.cells), review.group, cols, D.ctx, D.cells, down)
    rows = [].concat.apply([], groups.map(function (g) { return g.rows }))
    var ids = {}
    rows.forEach(function (r) { ids[C.paperId(r)] = true })
    Object.keys(sel).forEach(function (k) { if (!ids[k]) delete sel[k] })
    if (!ids[act.pid]) act.pid = rows.length ? C.paperId(rows[0]) : ""
    if (!visible().some(function (c) { return c.id === act.c })) act.c = "title"
  }

  function visible() { return cols.filter(function (c) { return !c.hidden && !c.missing }) }
  function colById(id) { for (var i = 0; i < cols.length; i++) if (cols[i].id === id) return cols[i]; return null }
  function rowIndex(pid) { for (var i = 0; i < rows.length; i++) if (C.paperId(rows[i]) === pid) return i; return -1 }
  function actRow() { var i = rowIndex(act.pid); return i >= 0 ? rows[i] : null }

  // The review's arrangement changed: drawn now, saved a moment after the last change.
  function layoutChanged(redraw) {
    if (redraw !== false) { resolve(); drawAll() }
    clearTimeout(layoutTimer)
    layoutTimer = setTimeout(function () {
      layoutTimer = null
      post("layout", { review: { columns: review.columns, sort: review.sort, group: review.group, lines: review.lines, panel: review.panel } })
    }, 400)
  }

  function layoutOf(id) { for (var i = 0; i < review.columns.length; i++) if (review.columns[i].id === id) return review.columns[i]; return null }

  // ------------------------------------------------------------ the page

  function build() {
    built = true
    var app = clear($("app"))
    app.appendChild(el("div", { class: "toolbar" }, [
      el("button", { class: "source", id: "bSource", type: "button", title: "The papers: a saved search or a query. A click picks another, or renames the review", "aria-haspopup": "true" }),
      el("div", { class: "tools" }, [
        iconButton("bGroup", "group", "Group the papers", { "aria-haspopup": "true" }),
        iconButton("bSort", "sort", "Sort", { "aria-haspopup": "true" }),
        iconButton("bOrder", "asc", "Order"),
        el("span", { class: "tsep" }),
        iconButton("bLines", "lines", "Lines in each cell", { "aria-haspopup": "true" }),
        iconButton("bCols", "columns", "Show and hide columns", { "aria-haspopup": "true" }),
        iconButton("bAdd", "addcol", "Add a column"),
        el("span", { class: "tsep" }),
        iconButton("bExport", "export", "Export", { "aria-haspopup": "true" }),
        iconButton("bPanel", "panel", "Show or hide the panel on the right (⌥⌘I)", { "aria-controls": "panel" }),
        iconButton("bRefresh", "refresh", "Search again (⌘R)"),
        iconButton("bPin", "pin", "Pin")
      ])
    ]))
    app.appendChild(el("div", { class: "body", id: "body" }, [
      el("div", { class: "gridwrap", id: "gw", tabindex: "0", "aria-label": "Review table" }),
      el("aside", { class: "panel", id: "panel", "aria-live": "polite" })
    ]))
    app.appendChild(el("div", { class: "foot", id: "foot" }))
    wire()
  }

  function drawAll() { drawToolbar(); drawGrid(); drawPanel(); drawFoot() }

  function sourceKind(s) { return s.type === "search" ? "Saved search" : s.type === "collection" ? "Collection" : s.type === "tag" ? "Tag" : "Query" }

  function drawToolbar() {
    var s = review.source
    var saved = s.type === "search" ? (D.ctx.searches || []).filter(function (x) { return x.id === s.key })[0] : null
    var q = s.type === "search" ? (saved ? saved.query : s.query) : s.type === "query" ? s.query : ""
    if (D.preview) { q = D.preview } // (a query you're typing: shown, not kept yet)
    clear($("bSource")).appendChild(el("span", { class: "kind", text: D.preview ? "Typing (↵ keeps it)" : sourceKind(s) }))
    $("bSource").appendChild(el("span", { class: "what", text: review.name }))
    if (q) $("bSource").appendChild(el("span", { class: "q", text: q }))
    var g = colById(review.group), k = review.sort[0], kc = k ? colById(k.column) : null
    var grouped = !!(g && C.groupable(g))
    label($("bGroup"), "Group: " + (grouped ? g.label : "none") + " (a click picks another)")
    $("bGroup").className = "tb icon" + (grouped ? " on" : "")
    var sortNames = review.sort.map(function (x) { var c = colById(x.column); return c ? c.label : x.column })
    label($("bSort"), "Sort: " + (sortNames.length ? sortNames.join(", then ") : "none") + " (a click changes it)")
    $("bSort").className = "tb icon" + (review.sort.length ? " on" : "")
    // the order: the first sort key's direction (no sort, no order)
    setIcon($("bOrder"), k && k.dir === "desc" ? "desc" : "asc")
    $("bOrder").disabled = !k
    label($("bOrder"), k ? (k.dir === "desc" ? "Descending by " : "Ascending by ") + (kc ? kc.label : k.column) + ": a click turns it" : "Order: sort by a column first")
    $("bPanel").className = "tb icon" + (review.panel ? " on" : "")
    $("bPanel").setAttribute("aria-pressed", String(!!review.panel))
    $("bPin").className = "tb icon" + (D.pinned ? " on" : "")
    $("bPin").setAttribute("aria-pressed", String(!!D.pinned))
    label($("bPin"), D.pinned ? "Pinned: the table stays over other apps' windows. A click unpins it" : "Pin it: the table stays over other apps' windows")
    $("body").className = "body" + (review.panel ? "" : " nopanel")
  }

  function sortMark(id) {
    for (var i = 0; i < review.sort.length; i++) {
      if (review.sort[i].column !== id) continue
      return (review.sort[i].dir === "desc" ? "↓" : "↑") + (review.sort.length > 1 ? "¹²³⁴⁵⁶".charAt(i) : "")
    }
    return ""
  }

  function cellHeight(c) { return c.lines ? c.lines * 17 + 10 : 0 }

  function drawGrid() {
    var gw = clear($("gw"))
    if (!rows.length) {
      var msg = D.problem ? D.problem : D.loading ? "Searching…" : "No papers here. Pick another saved search or query in the box above, or open a collection or a tag in the launcher and press ⌘T."
      gw.appendChild(el("div", { class: "empty", text: msg }))
      return
    }
    var vc = visible()
    // (its width the columns' sum: a fixed layout keeps each column as wide as you made it, narrower than what it holds)
    var table = el("table", { class: "grid", id: "grid", style: "width:" + vc.reduce(function (t, c) { return t + c.width }, 30) + "px" })
    var cg = el("colgroup", {}, [el("col", { style: "width:30px" })])
    vc.forEach(function (c) { cg.appendChild(el("col", { style: "width:" + c.width + "px", "data-col": c.id })) })
    table.appendChild(cg)
    var allSel = rows.every(function (r) { return sel[C.paperId(r)] })
    var hr = el("tr", {}, [el("th", { class: "fz0" }, [el("div", { class: "ck" }, [el("input", { type: "checkbox", id: "ckall", "aria-label": "Select every paper", checked: allSel && rows.length > 0 })])])])
    vc.forEach(function (c, i) {
      var mark = sortMark(c.id)
      var s = null
      review.sort.forEach(function (k) { if (k.column === c.id) s = k.dir })
      hr.appendChild(el("th", { class: i === 0 ? "fz1" : "mv", "data-c": c.id, "aria-sort": s ? (s === "desc" ? "descending" : "ascending") : null }, [
        el("div", { class: "hcell" }, [
          el("span", { class: "hl", text: c.label, title: c.label + (c.description ? ": " + c.description : "") + " · a click sorts by it, ⇧-click adds it to the sort" + (i === 0 ? "" : ", a drag moves it") }),
          mark ? el("span", { class: "sortmark", text: mark }) : null,
          el("button", { class: "hmenu", type: "button", "data-menu": c.id, text: "▾", "aria-label": c.label + ": its menu" }),
          el("div", { class: "rz", "data-rz": c.id, title: "Drag to resize it; a double-click fits it" })
        ])
      ]))
    })
    table.appendChild(el("thead", {}, [hr]))
    var tb = el("tbody")
    groups.forEach(function (gr) {
      if (gr.label) {
        tb.appendChild(el("tr", { class: "grp" }, [el("td", { colspan: String(vc.length + 1) }, [
          el("div", { class: "gh" }, [el("span", { class: "gl", text: gr.label }), el("span", { class: "gn", text: String(gr.rows.length) })])
        ])]))
      }
      gr.rows.forEach(function (r) { tb.appendChild(paperRow(r, vc)) })
    })
    table.appendChild(tb)
    gw.appendChild(table)
    var box = $("edbox")
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length) }
  }

  function paperRow(r, vc) {
      var pid = C.paperId(r)
      var tr = el("tr", { class: sel[pid] ? "selrow" : "", "data-p": pid }, [
        el("td", { class: "fz0" }, [el("div", { class: "ck" }, [el("input", { type: "checkbox", "data-sel": pid, checked: !!sel[pid], "aria-label": "Select " + r.title })])])
      ])
      vc.forEach(function (c, i) {
        var td = el("td", { class: "cell" + (i === 0 ? " fz1" : "") + (act.pid === pid && act.c === c.id ? " active" : ""), "data-p": pid, "data-c": c.id })
        if (editing && editing.pid === pid && editing.c === c.id) {
          td.appendChild(el("textarea", { class: "ed", id: "edbox", "aria-label": c.label, value: C.value(c, r, D.ctx, D.cells) }))
        } else td.appendChild(cellView(c, r))
        tr.appendChild(td)
      })
      return tr
  }

  function cellView(c, r) {
    var v = C.value(c, r, D.ctx, D.cells)
    var h = cellHeight(c)
    var cv = el("div", { class: "cv" + (c.lines === 1 ? " one" : "") + (typeof v === "number" ? " num" : ""), style: h ? "max-height:" + h + "px" : null })
    if (C.isEmpty(v)) return cv
    if (c.id === "title") cv.appendChild(el("span", { class: "ptitle", text: v }))
    else if (c.id === "status") cv.appendChild(el("span", { class: "pill status", text: v }))
    else if (c.id === "task") cv.appendChild(el("span", { class: "pill task", text: v }))
    else if (c.order === "abs" || c.order === "abdc") cv.appendChild(el("span", { class: "pill rank", text: (c.order === "abs" ? "ABS " : "ABDC ") + v }))
    else if (v === true) cv.appendChild(el("span", { text: "✓", title: c.label }))
    else if (Array.isArray(v)) v.forEach(function (l) { cv.appendChild(el("span", { class: "pill tax", text: l })) })
    else if (c.type === "choice") cv.appendChild(el("span", { class: "pill own", text: v }))
    else cv.textContent = String(v)
    return cv
  }

  // The active cell moved: the old and new cells redrawn in place (a double-click stays on its cell), the panel too.
  function setActive(pid, c, scroll) {
    act = { pid: pid, c: c }
    var g = $("grid")
    if (g) {
      Array.prototype.forEach.call(g.querySelectorAll("td.active"), function (t) { t.classList.remove("active") })
      var td = cellEl(pid, c)
      if (td) {
        td.classList.add("active")
        if (scroll) td.scrollIntoView({ block: "nearest", inline: "nearest" })
      }
    }
    drawPanel()
    drawFoot()
  }

  function cellEl(pid, c) {
    var g = $("grid")
    if (!g) return null
    var list = g.querySelectorAll("td.cell")
    for (var i = 0; i < list.length; i++) if (list[i].getAttribute("data-p") === pid && list[i].getAttribute("data-c") === c) return list[i]
    return null
  }

  // ------------------------------------------------------------ the panel

  function pills(kind, list, current, cls) {
    return el("div", { class: "opts" }, list.map(function (o) {
      return el("button", { type: "button", class: "pill " + cls + (o.value === current ? " on" : ""), "data-set": kind, "data-val": o.value, "aria-pressed": String(o.value === current), text: o.label })
    }))
  }

  function drawPanel() {
    var p = clear($("panel"))
    var r = actRow()
    var c = colById(act.c)
    if (!r || !c) { p.appendChild(el("div", { class: "hint", text: "Pick a cell to see its paper, and to change its status, its task or your columns." })); return }
    var pid = C.paperId(r)
    p.appendChild(el("h3", { text: r.title || "Untitled" }))
    p.appendChild(el("div", { class: "sub", text: [r.creator, r.year, r.publication].filter(function (x) { return x }).join(" · ") }))
    var v = C.value(c, r, D.ctx, D.cells)
    if (c.id === "status" || c.id === "task") {
      var statuses = [{ value: "", label: "no status" }].concat((D.ctx.statuses || []).map(function (s) { return { value: s, label: s } }))
      p.appendChild(el("div", {}, [el("div", { class: "ilab" }, [el("span", { text: "Status" }), el("span", { class: "k", text: "⌥→ ⌥←" })]),
        (D.ctx.statuses || []).length ? pills("status", statuses, C.statusName(r.status).toLowerCase() === "" ? "" : matchCase(D.ctx.statuses, C.statusName(r.status)), "status")
          : el("div", { class: "hint", text: "No paper statuses: add some in Settings › Paper status" })]))
      var tasks = (D.ctx.taskStatusList || []).map(function (s) { return { value: s.id, label: s.name } })
      var cur = D.ctx.tasks && D.ctx.tasks[pid] ? D.ctx.tasks[pid].id : ""
      p.appendChild(el("div", {}, [el("div", { class: "ilab" }, [el("span", { text: "Task" }), el("span", { class: "k", text: "⇧⌥→ ⇧⌥←" })]), pills("task", tasks, cur, "task"),
        cur ? null : el("div", { class: "hint", text: "No task on this paper yet: picking a status makes one, as ⇧⌥→ does in the launcher." })]))
      p.appendChild(el("div", { class: "hint", text: "The launcher's own changes: the status is the paper's s/ tag in Zotero, saved a second after your last change; the task is in your tasks, with its t/ tag." }))
    } else if (c.own && c.type === "choice") {
      p.appendChild(el("div", {}, [el("div", { class: "ilab", text: c.label }),
        pills("own", [{ value: "", label: "not set" }].concat(c.options.map(function (o) { return { value: o, label: o } })), v, "own")]))
      p.appendChild(el("div", { class: "ibox you", text: "Your column. Pick its value here: a click on the cell only selects it." + (c.description ? " " + c.description : "") }))
    } else if (c.own) {
      p.appendChild(el("div", { class: "ilab", text: c.label }))
      p.appendChild(el("div", { class: "ibox you" }, [el("div", { class: "ptext", text: v || "Empty." }), el("div", { class: "hint", text: "↵ or a double-click edits it; ⌘↵ keeps it, esc drops it." })]))
    } else if (c.prefix) {
      p.appendChild(el("div", { class: "ilab", text: c.label }))
      p.appendChild(el("div", { class: "opts" }, (v.length ? v : ["none"]).map(function (l) { return el("span", { class: "pill tax", text: l }) })))
      p.appendChild(el("div", { class: "hint", text: "From the paper's " + c.prefix + " tags. Tag it from the paper's menu in the launcher (Taxonomies)." }))
    } else if (c.id !== "title") {
      p.appendChild(el("div", { class: "ilab", text: c.label }))
      p.appendChild(el("div", { class: "ibox" }, [el("div", { class: "ptext", text: C.text(c, v) || "Empty." }), el("div", { class: "hint", text: "From Zotero: read only here." })]))
    }
    p.appendChild(el("div", {}, [el("button", { class: "tb", type: "button", "data-act": "open", text: "Show in Zotero", title: "⌘O, or a double-click on the paper" })]))
  }

  function matchCase(list, name) {
    var n = String(name).toLowerCase()
    for (var i = 0; i < list.length; i++) if (list[i].toLowerCase() === n) return list[i]
    return name
  }

  function drawFoot() {
    var f = clear($("foot"))
    f.appendChild(el("span", { text: editing ? "⌘↵ keep · esc drop" : "↑↓←→ move · space select · ↵ edit · ⌥→← status · ⇧⌥→← task · ⌥⌘←→ move column · ⌥⌘I panel · ? keys" }))
    var n = rows.length
    var count = D.loading && !n ? "…" : n + (n === 1 ? " paper" : " papers") + (D.total > n ? " (the first " + n + " of " + D.total + ")" : "")
    var nsel = Object.keys(sel).length
    if (nsel) count += " · " + nsel + " selected"
    if (D.readOnly) count += " · read only: the sync folder isn't there"
    f.appendChild(el("span", { class: flashText ? "flash" : D.problem && n ? "problem" : "", text: flashText || (D.problem && n ? D.problem : count) }))
  }

  // ------------------------------------------------------------ changes

  function setStatus(r, name) {
    var from = r.status && r.status !== "\u0000" ? r.status : ""
    var to = name ? "s/" + name : ""
    if (from.toLowerCase() === to.toLowerCase()) return
    r.status = to
    post("status", { paper: { key: r.key, libraryID: Number(r.libraryID) || 1 }, from: from, to: to })
    flash("Now: " + (name || "no status"))
    redrawRow(r)
  }

  function setTask(r, id) {
    var s = (D.ctx.taskStatusList || []).filter(function (x) { return x.id === id })[0]
    if (!s) return
    D.ctx.tasks = D.ctx.tasks || {}
    var had = D.ctx.tasks[C.paperId(r)]
    D.ctx.tasks[C.paperId(r)] = { id: s.id, name: s.name }
    post("task", { paper: { key: r.key, libraryID: Number(r.libraryID) || 1, title: r.title, creator: r.creator || "", year: String(r.year || "") }, status: s.id })
    flash((had ? "Task now: " : "New task: ") + s.name)
    redrawRow(r)
  }

  function setCell(r, c, v) {
    var pid = C.paperId(r)
    D.cells[c.id] = D.cells[c.id] || {}
    var old = D.cells[c.id][pid] ? D.cells[c.id][pid].v : ""
    if (old === v) return
    D.cells[c.id][pid] = { v: v }
    post("cell", { column: c.id, paper: pid, value: v })
    flash(c.label + ": " + (v ? (v.length > 40 ? v.slice(0, 40) + "…" : v) : "cleared"))
    redrawRow(r)
  }

  // A paper's row drawn again where it is (the sort is applied at the next change of the arrangement or the data).
  function redrawRow(r) {
    var pid = C.paperId(r)
    visible().forEach(function (c) {
      var td = cellEl(pid, c.id)
      if (td) { clear(td).appendChild(cellView(c, r)) }
    })
    drawPanel()
  }

  // ⌥→← on any column: the paper's status, as the launcher's (none, then yours, round again).
  function cycleStatus(r, d) {
    var list = [""].concat(D.ctx.statuses || [])
    if (list.length < 2) return flash("No paper statuses: add some in Settings › Paper status")
    if (r.status === "\u0000") return flash("Update the Zotero Omarchy Bridge to see and change statuses (Settings › Setup)")
    var cur = C.statusName(r.status).toLowerCase()
    var i = 0
    for (var k = 0; k < list.length; k++) if (list[k].toLowerCase() === cur) i = k
    setStatus(r, list[(i + d + list.length) % list.length])
  }

  // ⇧⌥→← the default task's status, as the launcher's (no task yet: the first; past an end: done).
  function cycleTask(r, d) {
    var list = D.ctx.taskStatusList || []
    if (!list.length) return
    var t = D.ctx.tasks && D.ctx.tasks[C.paperId(r)]
    var i = -1
    for (var k = 0; k < list.length; k++) if (t && list[k].id === t.id) i = k
    var next
    if (i < 0) next = list[0]
    else {
      var j = i + d
      var done = list.filter(function (s) { return s.group === "completed" })[0]
      next = j >= 0 && j < list.length ? list[j] : done && done.id !== list[i].id ? done : list[((j % list.length) + list.length) % list.length]
    }
    setTask(r, next.id)
  }

  function startEdit() {
    var c = colById(act.c), r = actRow()
    if (!c || !r) return
    if (c.own && c.type === "text") {
      if (D.readOnly) return flash("Not saved: the sync folder isn't there")
      editing = { pid: act.pid, c: act.c }
      drawGrid()
      drawFoot()
      return
    }
    if (c.own) return flash("Pick its value in the panel on the right")
    if (c.id === "status" || c.id === "task") return flash("Pick it in the panel on the right, or ⌥→← (status) and ⇧⌥→← (task)")
    if (c.prefix) return flash("Tag it from the paper's menu in the launcher (Taxonomies)")
    flash("A Zotero field: change it in Zotero")
  }

  function endEdit(keep) {
    if (!editing) return
    var box = $("edbox")
    var e = editing
    editing = null
    var r = rows[rowIndex(e.pid)], c = colById(e.c)
    if (keep && box && r && c) setCell(r, c, box.value.replace(/\s+$/, ""))
    drawGrid()
    drawFoot()
    $("gw").focus({ preventScroll: true })
  }

  function moveColumn(id, d) {
    if (id === "title") return flash("The paper column stays first")
    var vc = visible().map(function (c) { return c.id })
    var i = vc.indexOf(id), j = i + d
    if (i < 0 || j < 1 || j >= vc.length) return
    var list = review.columns
    var a = list.indexOf(layoutOf(id)), b = list.indexOf(layoutOf(vc[j]))
    var item = list.splice(a, 1)[0]
    list.splice(b, 0, item)
    layoutChanged()
  }

  function setSort(sorts) {
    review.sort = sorts
    layoutChanged()
  }

  function exportCsv() {
    post("csv", { name: review.name, text: C.csv(rows, cols, D.ctx, D.cells) })
  }

  function openPaper(r) { if (r) post("open", { paper: { key: r.key, libraryID: Number(r.libraryID) || 1 } }) }

  // ------------------------------------------------------------ pop-ups

  var popEl = null
  // Closed: a query searched as you typed and not kept (↵) goes, the table back to its source.
  function closePop() {
    if (popEl) { popEl.remove(); popEl = null }
    if (previewing) { previewing = false; clearTimeout(previewTimer); post("preview", { query: null }) }
  }
  function openPop(anchor, kids, bind) {
    closePop()
    popEl = el("div", { class: "pop", role: "menu" }, kids)
    document.body.appendChild(popEl)
    var b = anchor.getBoundingClientRect()
    var w = popEl.offsetWidth
    popEl.style.top = Math.min(b.bottom + 4, window.innerHeight - popEl.offsetHeight - 8) + "px"
    popEl.style.left = Math.max(8, Math.min(b.left, window.innerWidth - w - 8)) + "px"
    if (bind) bind(popEl)
    var first = popEl.querySelector("input[type=search], input[type=text]")
    if (first) first.focus()
  }
  function item(label, attrs, small) { return el("button", Object.assign({ class: "pi", type: "button", role: "menuitem" }, attrs), [el("span", { text: label }), small ? el("small", { text: small }) : null]) }
  function linesSeg(current, attr) {
    return el("div", { class: "seg" }, C.LINES.map(function (n) { var a = { type: "button", class: current === n ? "on" : "", text: n ? String(n) : "All" }; a[attr] = String(n); return el("button", a) }))
  }

  function headerMenu(c, anchor) {
    var s = null
    review.sort.forEach(function (k) { if (k.column === c.id) s = k })
    var kids = [el("div", { class: "ph", text: c.label }),
      item("Sort ascending", { "data-m": "asc" }), item("Sort descending", { "data-m": "desc" }),
      s ? item("Remove it from the sort", { "data-m": "unsort" }) : item("Then by it", { "data-m": "then", disabled: !review.sort.length }, "⇧-click"),
      el("hr"), el("div", { class: "ph", text: "Lines in each cell" }), linesSeg(c.lines, "data-lines"), el("hr"),
      item("Move left", { "data-m": "left", disabled: c.id === "title" }, "⌥⌘←"), item("Move right", { "data-m": "right", disabled: c.id === "title" }, "⌥⌘→"),
      item("Fit its width", { "data-m": "fit" }), item("Hide it", { "data-m": "hide", disabled: c.id === "title" })]
    if (c.own) kids.push(item("Remove it from this review", { "data-m": "remove" }, "its values stay"))
    openPop(anchor, kids, function (p) {
      p.addEventListener("click", function (e) {
        var ln = e.target.closest("[data-lines]")
        if (ln) { layoutOf(c.id).lines = Number(ln.getAttribute("data-lines")); closePop(); return layoutChanged() }
        var b = e.target.closest("[data-m]")
        if (!b || b.disabled) return
        var m = b.getAttribute("data-m")
        closePop()
        if (m === "asc" || m === "desc") setSort([{ column: c.id, dir: m }])
        else if (m === "then") setSort(review.sort.concat([{ column: c.id, dir: "asc" }]).slice(0, 6))
        else if (m === "unsort") setSort(review.sort.filter(function (k) { return k.column !== c.id }))
        else if (m === "left" || m === "right") moveColumn(c.id, m === "left" ? -1 : 1)
        else if (m === "fit") fitColumn(c.id)
        else if (m === "hide") { layoutOf(c.id).hidden = true; layoutChanged(); flash("Hidden: “" + c.label + "” (the Columns button shows it again)") }
        else if (m === "remove") { review.columns = review.columns.filter(function (l) { return l.id !== c.id }); layoutChanged(); flash("Removed “" + c.label + "” from this review: its values stay, + Column adds it back") }
      })
    })
  }

  function groupPop(anchor) {
    var choices = visible().filter(C.groupable)
    var kids = [el("div", { class: "ph", text: "Group the papers by" }), item((review.group ? "" : "✓ ") + "None", { "data-g": "" })]
    choices.forEach(function (c) { kids.push(item((review.group === c.id ? "✓ " : "") + c.label, { "data-g": c.id })) })
    kids.push(el("div", { class: "ph", text: "The groups follow the column's order; sort by it descending to turn them." }))
    openPop(anchor, kids, function (p) {
      p.addEventListener("click", function (e) {
        var b = e.target.closest("[data-g]")
        if (!b) return
        closePop()
        review.group = b.getAttribute("data-g")
        layoutChanged()
        var c = colById(review.group)
        flash(c ? "Grouped by " + c.label : "Not grouped")
      })
    })
  }

  // The order button: the first sort key's direction turned.
  function turnOrder() {
    if (!review.sort.length) return
    setSort(review.sort.map(function (k, i) { return { column: k.column, dir: i === 0 ? (k.dir === "desc" ? "asc" : "desc") : k.dir } }))
  }

  function sortPop(anchor) {
    var kids = [el("div", { class: "ph", text: review.sort.length ? "Sorted by, in order" : "Not sorted: the papers in the search's order" })]
    review.sort.forEach(function (k, i) {
      var c = colById(k.column)
      kids.push(el("div", { class: "srow" }, [el("span", { class: "n", text: String(i + 1) }), el("span", { class: "l", text: c ? c.label : k.column }),
        el("button", { type: "button", "data-dir": String(i), text: k.dir === "desc" ? "↓ descending" : "↑ ascending" }),
        el("button", { type: "button", "data-up": String(i), text: "↑", "aria-label": "Move up", disabled: i === 0 }),
        el("button", { type: "button", "data-del": String(i), text: "✕", "aria-label": "Remove" })]))
    })
    var choices = visible().filter(function (c) { return !review.sort.some(function (k) { return k.column === c.id }) })
    if (choices.length && review.sort.length < 6) {
      kids.push(el("hr"), el("div", { class: "ph", text: review.sort.length ? "Then by" : "Sort by" }))
      choices.forEach(function (c) { kids.push(item(c.label, { "data-add": c.id })) })
    }
    kids.push(el("hr"), item("Clear the sort", { "data-clear": "1", disabled: !review.sort.length }),
      el("div", { class: "ph", text: "On a header: a click sorts by it alone; ⇧-click adds it as the next key." }))
    openPop(anchor, kids, function (p) {
      p.addEventListener("click", function (e) {
        var t = e.target.closest("button")
        if (!t || t.disabled) return
        var list = review.sort.map(function (k) { return { column: k.column, dir: k.dir } })
        if (t.hasAttribute("data-dir")) { var k = list[+t.getAttribute("data-dir")]; k.dir = k.dir === "asc" ? "desc" : "asc" }
        else if (t.hasAttribute("data-up")) { var i = +t.getAttribute("data-up"); list.splice(i - 1, 0, list.splice(i, 1)[0]) }
        else if (t.hasAttribute("data-del")) list.splice(+t.getAttribute("data-del"), 1)
        else if (t.hasAttribute("data-add")) list.push({ column: t.getAttribute("data-add"), dir: "asc" })
        else if (t.hasAttribute("data-clear")) list = []
        else return
        setSort(list)
        sortPop($("bSort"))
      })
    })
  }

  function colsPop(anchor) {
    var kids = [el("div", { class: "ph", text: "Show and hide (nothing is lost)" })]
    cols.forEach(function (c) {
      if (c.missing) return
      kids.push(el("label", { class: "pi" }, [el("span", { text: c.label }), el("input", { type: "checkbox", "data-show": c.id, checked: !c.hidden, disabled: c.id === "title" })]))
    })
    kids.push(el("hr"), item("Add columns…", { "data-addcols": "1" }))
    openPop(anchor, kids, function (p) {
      p.addEventListener("change", function (e) {
        var id = e.target.getAttribute("data-show")
        if (!id) return
        var l = layoutOf(id)
        if (e.target.checked) delete l.hidden; else l.hidden = true
        layoutChanged()
      })
      p.addEventListener("click", function (e) { if (e.target.closest("[data-addcols]")) { closePop(); addDialog() } })
    })
  }

  function linesPop(anchor) {
    openPop(anchor, [el("div", { class: "ph", text: "Every column shows" }), linesSeg(review.lines, "data-all"), el("div", { class: "ph", text: "lines per cell; a longer cell scrolls inside itself. A column's ▾ sets its own." })], function (p) {
      p.addEventListener("click", function (e) {
        var b = e.target.closest("[data-all]")
        if (!b) return
        var n = Number(b.getAttribute("data-all"))
        review.lines = n
        review.columns.forEach(function (l) { if (l.id === "title" && n === 1) return; l.lines = n })
        closePop()
        layoutChanged()
      })
    })
  }

  function exportPop(anchor) {
    openPop(anchor, [item("CSV…", { "data-x": "csv" }, "⌘E · as shown"), item("Excel (.xlsx)…", { disabled: true }, "a later version")], function (p) {
      p.addEventListener("click", function (e) { if (e.target.closest("[data-x=csv]")) { closePop(); exportCsv() } })
    })
  }

  // The source's box: a saved search, or a query typed as in the launcher's search box. The table searches as you
  // type; the query is read as the launcher reads it (its blocks: a:, y:, #tag, NOT…); ↵ keeps it, esc drops it, ⌘S
  // saves it as a search (the launcher's searches list it too).
  var previewTimer = null
  var segFor = ""
  function sourcePop(anchor) {
    var s = review.source
    var kids = [el("div", { class: "ph", text: "Saved searches" })]
    var list = D.ctx.searches || []
    if (!list.length) kids.push(el("div", { class: "ph", text: "None yet: type a query below, then ⌘S" }))
    list.forEach(function (x) { kids.push(item(x.name, { "data-search": x.id, class: "pi" + (s.type === "search" && s.key === x.id ? " hi" : "") }, x.query)) })
    kids.push(el("hr"), el("div", { class: "ph", text: "Or a query, as in the launcher's search box" }),
      el("input", { type: "search", id: "srcq", placeholder: "resilience a:teece y:2015.. !#excluded", value: s.type === "query" ? s.query : "", "aria-label": "A query", spellcheck: "false", autocomplete: "off" }),
      el("div", { class: "qsegs", id: "srcsegs", "aria-live": "polite" }),
      el("div", { class: "ph", text: "The table follows as you type · ↵ keeps it · esc goes back · ⌘S saves it as a search" }),
      item("Save it as a search…", { "data-savesearch": "1" }, "⌘S"),
      el("div", { class: "ph", text: "A collection or a tag: open it in the launcher, then ⌘T." }),
      el("hr"), item("Rename this review…", { "data-rename": "1" }))
    openPop(anchor, kids, function (p) {
      var box = $("srcq")
      segFor = ""
      if (box.value) askSegments(box)
      p.addEventListener("click", function (e) {
        var b = e.target.closest("[data-search]")
        if (b) {
          var x = list.filter(function (y) { return y.id === b.getAttribute("data-search") })[0]
          previewing = false
          closePop()
          if (x) post("source", { source: { type: "search", key: x.id, title: x.name, query: x.query } })
          return
        }
        if (e.target.closest("[data-savesearch]")) return saveSearchDialog(box.value)
        if (e.target.closest("[data-rename]")) { closePop(); renameDialog() }
      })
      box.addEventListener("input", function () {
        askSegments(box)
        previewing = true
        clearTimeout(previewTimer)
        previewTimer = setTimeout(function () { post("preview", { query: box.value }) }, 250)
      })
      box.addEventListener("keyup", function (e) { if (/^Arrow|^Home$|^End$/.test(e.key)) askSegments(box) })
      box.addEventListener("click", function () { askSegments(box) })
      p.addEventListener("keydown", function (e) {
        if (e.target.id !== "srcq") return
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); return saveSearchDialog(box.value) }
        if (e.key !== "Enter") return
        var q = box.value.trim()
        if (!q) return
        clearTimeout(previewTimer)
        previewing = false
        closePop()
        post("source", { source: { type: "query", query: q } })
      })
    })
  }

  // The query's blocks, from the app (the launcher's own reading of it: Views.querySegments).
  function askSegments(box) {
    var key = box.value + "\u0000" + box.selectionStart
    if (key === segFor) return
    segFor = key
    post("segments", { text: box.value, caret: box.selectionStart })
  }

  function segments(text, list) {
    var box = $("srcq"), out = $("srcsegs")
    if (!box || !out || box.value !== text) return // (an older answer)
    clear(out)
    var blocks = (list || []).filter(function (g) { return g && g.block })
    if (!blocks.length) return
    out.appendChild(el("span", { class: "qlab", text: "Reads as" }))
    ;(list || []).forEach(function (g) {
      if (!g || !String(g.text || "").trim()) return
      out.appendChild(el("span", { class: (g.block ? "qb" : "qt") + (g.role ? " r-" + g.role : ""), text: g.block ? g.label : g.text }))
    })
  }

  function saveSearchDialog(query) {
    var q = String(query || "").trim()
    if (!q) return flash("Type a query first; then ⌘S saves it as a search")
    var was = previewing
    previewing = false // (the table keeps showing it while you name it: it becomes the saved search)
    openModal([el("header", {}, [el("h2", { text: "Save the search" }), el("p", { text: q })]),
      el("div", { class: "sb" }, [el("label", {}, ["Its name", el("input", { type: "text", id: "ssname", value: q, maxlength: "120" })])]),
      el("footer", {}, [el("button", { class: "tb", type: "button", "data-close": "1", text: "Cancel" }), el("button", { class: "tb primary", type: "button", id: "sssave", text: "Save it" })])], function () {
      var go = function () { var n = $("ssname").value.trim(); onDrop = null; closeModal(); post("saveSearch", { name: n || q, query: q }) }
      onDrop = was ? function () { post("preview", { query: null }) } : null // cancelled: the table back to its source
      $("sssave").addEventListener("click", go)
      $("ssname").addEventListener("keydown", function (e) { if (e.key === "Enter") go() })
      $("ssname").select()
    })
  }

  // ------------------------------------------------------------ dialogs

  var modalEl = null
  var onDrop = null // what a dialog closed without its button does
  function closeModal() {
    if (modalEl) { modalEl.remove(); modalEl = null; $("gw").focus({ preventScroll: true }) }
    if (onDrop) { var f = onDrop; onDrop = null; f() }
  }
  function openModal(kids, bind) {
    closePop()
    closeModal()
    modalEl = el("div", { class: "modal" }, [el("div", { class: "sheet", role: "dialog", "aria-modal": "true" }, kids)])
    document.body.appendChild(modalEl)
    modalEl.addEventListener("click", function (e) { if (e.target === modalEl || e.target.closest("[data-close]")) closeModal() })
    if (bind) bind(modalEl)
    var f = modalEl.querySelector("input[type=text], textarea")
    if (f) f.focus()
  }

  function renameDialog() {
    openModal([el("header", {}, [el("h2", { text: "Rename the review" })]),
      el("div", { class: "sb" }, [el("label", {}, ["Its name", el("input", { type: "text", id: "rname", value: review.name, maxlength: "120" })])]),
      el("footer", {}, [el("button", { class: "tb", type: "button", "data-close": "1", text: "Cancel" }), el("button", { class: "tb primary", type: "button", id: "rsave", text: "Rename it" })])], function (m) {
      var go = function () { var n = $("rname").value.trim(); if (!n) return; review.name = n; closeModal(); drawToolbar(); post("rename", { name: n }) }
      $("rsave").addEventListener("click", go)
      $("rname").addEventListener("keydown", function (e) { if (e.key === "Enter") go() })
    })
  }

  function addDialog() {
    var have = {}
    review.columns.forEach(function (l) { have[l.id] = true })
    var all = C.available(D.ctx, D.columns).filter(function (c) { return !have[c.id] })
    var groups = []
    all.forEach(function (c) { if (groups.indexOf(c.group) < 0) groups.push(c.group) })
    var attrs = groups.length ? groups.map(function (g) {
      return el("div", {}, [el("div", { class: "agroup", text: g }), el("div", { class: "agrid" }, all.filter(function (c) { return c.group === g }).map(function (c) {
        return el("label", {}, [el("input", { type: "checkbox", "data-attr": c.id }), c.label])
      }))])
    }) : [el("div", { class: "hint", text: "Every attribute is in this review already." })]
    openModal([el("header", {}, [el("h2", { text: "Add columns" }), el("p", { text: "Attributes from Zotero and the launcher, or a column of your own." })]),
      el("div", { class: "sb" }, attrs.concat([
        el("div", { class: "agroup", text: "A column of your own" }),
        el("label", {}, ["Its name", el("input", { type: "text", id: "nname", placeholder: "Include?, My notes, Chapter…", maxlength: "80" })]),
        el("label", {}, ["It holds", el("select", { id: "ntype" }, [el("option", { value: "text", text: "Text" }), el("option", { value: "choice", text: "One of a list" })])]),
        el("label", { id: "noptsl", hidden: true }, ["The choices, separated by commas", el("input", { type: "text", id: "nopts", placeholder: "include, maybe, exclude" })]),
        el("div", { class: "err", id: "nerr" }),
        el("div", { class: "agroup", text: "AI columns" }),
        el("div", { class: "hint", text: "Not on the Mac yet: AI columns (a prompt, Jev's taxonomies and relevance) come in a later version." })
      ])),
      el("footer", {}, [el("button", { class: "tb", type: "button", "data-close": "1", text: "Cancel" }), el("button", { class: "tb primary", type: "button", id: "nadd", text: "Add" })])], function () {
      $("ntype").addEventListener("change", function () { $("noptsl").hidden = $("ntype").value !== "choice" })
      $("nadd").addEventListener("click", function () {
        var picked = Array.prototype.map.call(modalEl.querySelectorAll("[data-attr]:checked"), function (x) { return x.getAttribute("data-attr") })
        var name = $("nname").value.trim()
        var spec = null
        if (name) {
          if (D.readOnly) { $("nerr").textContent = "Not saved: the sync folder isn't there"; return }
          var made = C.newColumn({ label: name, type: $("ntype").value, options: $("nopts").value })
          if (made.error) { $("nerr").textContent = made.error; return }
          spec = made.column
        }
        if (!picked.length && !spec) { $("nerr").textContent = "Tick an attribute, or name a column of your own"; return }
        picked.forEach(function (id) { review.columns.push({ id: id }) })
        closeModal()
        if (spec) {
          D.columns[spec.id] = spec
          review.columns.push({ id: spec.id })
          post("addColumn", { column: spec })
          act.c = spec.id
        } else if (picked.length) act.c = picked[0]
        layoutChanged()
        flash("Added: " + picked.map(function (id) { var c = colById(id); return c ? c.label : id }).concat(spec ? [spec.label] : []).join(", "))
        var td = cellEl(act.pid, act.c)
        if (td) td.scrollIntoView({ block: "nearest", inline: "nearest" })
      })
    })
  }

  function keysPanel() {
    var old = $("keys")
    if (old) { old.remove(); showKeys = false; return }
    showKeys = true
    var K = [["↑↓←→", "Move between cells"], ["home end", "The row's first and last column"], ["pgup pgdn", "A page up or down"], ["space", "Select the paper's row"],
      ["↵", "Edit a cell of yours (text)"], ["⌘↵ esc", "Keep, or drop, what you typed"], ["⌥→ ⌥←", "The paper's status"], ["⇧⌥→ ⇧⌥←", "Its task's status"],
      ["⌥⌘← ⌥⌘→", "Move the column"], ["⌥⌘I", "Show or hide the panel"], ["⌘O", "Show the paper in Zotero"], ["⌘E", "Export as CSV"], ["⌘R", "Search again"],
      ["⇧-click", "A header: add it to the sort"], ["F1 ?", "Show or hide these keys"], ["⌘W", "Close the window"]]
    var dl = el("dl")
    K.forEach(function (k) { dl.appendChild(el("dt", { text: k[0] })); dl.appendChild(el("dd", { text: k[1] })) })
    document.body.appendChild(el("div", { class: "keys", id: "keys", role: "dialog", "aria-label": "Keys" }, [el("h3", { text: "The review table's keys" }), dl]))
  }

  function fitColumn(id) {
    var c = colById(id)
    if (!c) return
    var w = 0
    var probe = el("span", { style: "position:absolute;visibility:hidden;white-space:nowrap;font-weight:600" })
    document.body.appendChild(probe)
    probe.textContent = c.label
    w = probe.offsetWidth + 40
    probe.style.fontWeight = "400"
    rows.slice(0, 200).forEach(function (r) { probe.textContent = C.text(c, C.value(c, r, D.ctx, D.cells)).slice(0, 120); w = Math.max(w, probe.offsetWidth + 24) })
    probe.remove()
    layoutOf(id).width = Math.max(C.MIN_WIDTH, Math.min(480, w))
    layoutChanged()
  }

  // ------------------------------------------------------------ events

  function wire() {
    $("bSource").addEventListener("click", function (e) { sourcePop(e.currentTarget) })
    $("bGroup").addEventListener("click", function (e) { groupPop(e.currentTarget) })
    $("bSort").addEventListener("click", function (e) { sortPop(e.currentTarget) })
    $("bOrder").addEventListener("click", turnOrder)
    $("bLines").addEventListener("click", function (e) { linesPop(e.currentTarget) })
    $("bCols").addEventListener("click", function (e) { colsPop(e.currentTarget) })
    $("bAdd").addEventListener("click", addDialog)
    $("bExport").addEventListener("click", function (e) { exportPop(e.currentTarget) })
    $("bPanel").addEventListener("click", togglePanel)
    $("bRefresh").addEventListener("click", function () { post("refresh") })
    $("bPin").addEventListener("click", function () { D.pinned = !D.pinned; drawToolbar(); post("pin", { on: D.pinned }) })
    document.addEventListener("mousedown", function (e) { if (popEl && !popEl.contains(e.target) && !e.target.closest(".tools, #bSource, .hmenu")) closePop() })
    document.addEventListener("dragstart", function (e) { e.preventDefault() }) // (nothing here is dragged out: a drag moves a column)

    var gw = $("gw")
    gw.addEventListener("click", function (e) {
      var ck = e.target.closest("input[data-sel]")
      if (ck) { toggleSel(ck.getAttribute("data-sel"), ck.checked); return }
      if (e.target.id === "ckall") { rows.forEach(function (r) { if (e.target.checked) sel[C.paperId(r)] = true; else delete sel[C.paperId(r)] }); drawGrid(); drawFoot(); return }
      var mb = e.target.closest("[data-menu]")
      if (mb) { e.stopPropagation(); return headerMenu(colById(mb.getAttribute("data-menu")), mb) }
      if (e.target.closest(".rz") || noClick) return
      var th = e.target.closest("th[data-c]")
      if (th) return setSort(C.clickSort(review.sort, th.getAttribute("data-c"), e.shiftKey))
      var td = e.target.closest("td.cell")
      if (td && !editing) { setActive(td.getAttribute("data-p"), td.getAttribute("data-c")); gw.focus({ preventScroll: true }) }
    })
    gw.addEventListener("dblclick", function (e) {
      var rz = e.target.closest("[data-rz]")
      if (rz) return fitColumn(rz.getAttribute("data-rz"))
      var td = e.target.closest("td.cell")
      if (!td || editing) return
      act = { pid: td.getAttribute("data-p"), c: td.getAttribute("data-c") }
      if (act.c === "title") return openPaper(actRow())
      var c = colById(act.c)
      if (c && c.own && c.type === "text") startEdit()
    })
    gw.addEventListener("keydown", function (e) {
      if (e.target.id !== "edbox") return
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); endEdit(false) }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); endEdit(true) }
    })
    gw.addEventListener("focusout", function (e) { if (e.target.id === "edbox") setTimeout(function () { if (editing) endEdit(true) }, 0) })

    // resizing a column by its edge (the grip inside its own header, at its right), or moving it by its header
    gw.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return
      var rz = e.target.closest("[data-rz]")
      if (rz) return startResize(e, rz)
      var th = e.target.closest("th[data-c]")
      if (th && !e.target.closest(".hmenu")) press = { id: th.getAttribute("data-c"), x: e.clientX, moving: false, to: null, after: false }
    })
    document.addEventListener("pointermove", function (e) { if (press) moveTo(e) })
    document.addEventListener("pointerup", function () {
      var p = press
      press = null
      if (!p || !p.moving) return
      quiet()
      document.body.classList.remove("moving")
      if (!p.to || p.to === p.id) return drawGrid()
      var list = review.columns
      var item = list.splice(list.indexOf(layoutOf(p.id)), 1)[0]
      list.splice(list.indexOf(layoutOf(p.to)) + (p.after || p.to === "title" ? 1 : 0), 0, item)
      layoutChanged()
    })

    $("panel").addEventListener("click", function (e) {
      var b = e.target.closest("[data-set]")
      var r = actRow()
      if (b && r) {
        var k = b.getAttribute("data-set"), v = b.getAttribute("data-val")
        if (D.readOnly && k === "own") return flash("Not saved: the sync folder isn't there")
        if (k === "status") setStatus(r, v)
        else if (k === "task") setTask(r, v)
        else if (k === "own") setCell(r, colById(act.c), v)
        return
      }
      if (e.target.closest("[data-act=open]")) openPaper(r)
    })

    document.addEventListener("keydown", onKey)
  }

  // The click that ends a drag isn't a click on what's under it.
  function quiet() { noClick = true; setTimeout(function () { noClick = false }, 0) }

  function startResize(e, rz) {
    e.preventDefault()
    var id = rz.getAttribute("data-rz")
    var col = $("grid").querySelector('col[data-col="' + id + '"]')
    var start = e.clientX, w0 = colById(id).width
    rz.classList.add("on")
    rz.setPointerCapture(e.pointerId)
    var t0 = $("grid").offsetWidth
    var move = function (ev) {
      var w = Math.max(C.MIN_WIDTH, Math.min(C.MAX_WIDTH, w0 + ev.clientX - start))
      col.style.width = w + "px"
      $("grid").style.width = (t0 + w - w0) + "px"
      layoutOf(id).width = w
    }
    var up = function () { rz.classList.remove("on"); rz.removeEventListener("pointermove", move); rz.removeEventListener("pointerup", up); quiet(); layoutChanged() }
    rz.addEventListener("pointermove", move)
    rz.addEventListener("pointerup", up)
  }

  // A header held and moved past a few px: the column follows; the mark shows where it lands (left or right half of
  // the header under the pointer). The paper column stays first, and isn't moved.
  function moveTo(e) {
    var g = $("grid")
    if (!g) { press = null; return }
    if (!press.moving) {
      if (Math.abs(e.clientX - press.x) < 6) return
      if (press.id === "title") { press = null; return }
      press.moving = true
      document.body.classList.add("moving")
      var me = g.querySelector('th[data-c="' + press.id + '"]')
      if (me) me.classList.add("dragging")
    }
    Array.prototype.forEach.call(g.querySelectorAll("th.dropL, th.dropR"), function (t) { t.classList.remove("dropL", "dropR") })
    press.to = null
    var ths = g.querySelectorAll("thead th[data-c]")
    for (var i = 0; i < ths.length; i++) {
      var b = ths[i].getBoundingClientRect()
      if (e.clientX < b.left || e.clientX >= b.right) continue
      var id = ths[i].getAttribute("data-c")
      if (id === press.id) return
      press.to = id
      press.after = id === "title" || e.clientX >= b.left + b.width / 2
      ths[i].classList.add(press.after ? "dropR" : "dropL")
      return
    }
  }

  function togglePanel() {
    review.panel = !review.panel
    drawToolbar()
    layoutChanged(false)
    flash(review.panel ? "Panel shown" : "Panel hidden: ⌥⌘I or the Panel button brings it back")
  }

  function toggleSel(pid, on) {
    if (on) sel[pid] = true; else delete sel[pid]
    var tr = $("grid") && $("grid").querySelector('tr[data-p="' + pid + '"]')
    if (tr) {
      tr.classList.toggle("selrow", !!on)
      var ck = tr.querySelector("input[data-sel]")
      if (ck) ck.checked = !!on
    }
    drawFoot()
  }

  function onKey(e) {
    if (e.target && (e.target.id === "edbox")) return
    var typing = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")
    var meta = e.metaKey, alt = e.altKey, shift = e.shiftKey
    if (meta && alt && (e.code === "KeyI")) { e.preventDefault(); return togglePanel() }
    if (e.key === "Escape") {
      if (popEl) { closePop(); return }
      if (modalEl) { closeModal(); return }
      if ($("keys")) { keysPanel(); return }
      return
    }
    if (typing || modalEl) return
    if (e.key === "F1" || (e.key === "?" && !meta)) { e.preventDefault(); return keysPanel() }
    if (meta && !alt && e.key.toLowerCase() === "e") { e.preventDefault(); return exportCsv() }
    if (meta && !alt && e.key.toLowerCase() === "o") { e.preventDefault(); return openPaper(actRow()) }
    if (!rows.length) return
    var vc = visible()
    var ci = 0
    for (var k = 0; k < vc.length; k++) if (vc[k].id === act.c) ci = k
    var ri = Math.max(0, rowIndex(act.pid))
    var r = rows[ri]
    var arrow = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0
    if (arrow && meta && alt) { e.preventDefault(); return moveColumn(act.c, arrow) }
    if (arrow && alt && shift) { e.preventDefault(); return cycleTask(r, arrow) }
    if (arrow && alt) { e.preventDefault(); return cycleStatus(r, arrow) }
    if (meta) return
    var page = Math.max(1, Math.floor($("gw").clientHeight / 40))
    var nr = ri, nc = ci
    if (e.key === "ArrowDown") nr = Math.min(rows.length - 1, ri + 1)
    else if (e.key === "ArrowUp") nr = Math.max(0, ri - 1)
    else if (arrow) nc = Math.max(0, Math.min(vc.length - 1, ci + arrow))
    else if (e.key === "Home") nc = 0
    else if (e.key === "End") nc = vc.length - 1
    else if (e.key === "PageDown") nr = Math.min(rows.length - 1, ri + page)
    else if (e.key === "PageUp") nr = Math.max(0, ri - page)
    else if (e.key === "Enter") { e.preventDefault(); return startEdit() }
    else if (e.key === " ") { e.preventDefault(); return toggleSel(C.paperId(r), !sel[C.paperId(r)]) }
    else return
    e.preventDefault()
    setActive(C.paperId(rows[nr]), vc[nc].id, true)
  }

  return { load: load, flash: flash, segments: segments, ready: function () { post("ready") } }
})()

RT.ready()
