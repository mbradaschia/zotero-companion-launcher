// The review table's page (phases 11a, 11b): draws what the app sends (RT.load), and sends what you do (a message on
// `review`). Runs after ReviewCore.js, inlined with it into one script (ReviewWebView: the CSP lets that script
// alone run). Every value is drawn as text, never as HTML. A click only selects: values change in the panel on the
// right, by editing a cell of your own, or with ⌥→← (status) and ⇧⌥→← (task).
var RT = (function () {
  var C = ReviewCore
  var D = { review: null, columns: {}, cells: {}, results: [], total: 0, ctx: {}, readOnly: false, problem: "", loading: true, pinned: false, preview: null, run: null }
  var review = null // the review as you arrange it (sent back on each change)
  var cols = [] // its columns, resolved (ReviewCore.columns)
  var rows = [] // the papers, in the sort's order (and grouped: the groups' order)
  var groups = [] // [{ label, rows }]: one group, its label "", when the papers aren't grouped
  var act = { pid: "", c: "title" } // the active cell: its paper and column
  var sel = {} // the selected papers (space, the checkboxes)
  var editing = null // { pid, c } while a cell of yours is being typed
  var peekShut = "" // the cell whose whole text esc put away (until another is selected)
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
    pin: "M9 3h6 M10 3v6.5L7 13h10l-3-3.5V3 M12 13v8",
    run: "M7 4.5l12 7.5-12 7.5z"
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
    D = Object.assign({ columns: {}, cells: {}, results: [], total: 0, ctx: {}, readOnly: false, problem: "", loading: false, pinned: false, preview: null, run: null }, data || {})
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
        iconButton("bRun", "run", "Run the AI columns… (⇧⌘R)"),
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
    var nai = visible().filter(function (c) { return c.ai }).length
    $("bRun").className = "tb icon" + (D.run ? " on" : "")
    label($("bRun"), D.run ? "An AI run is going (" + (D.run.stage || "starting") + "): it's in the launcher's Processes" : nai ? "Run the AI columns… (⇧⌘R): the plan first, nothing starts before Run" : "Run the AI columns: + Column adds one first (An AI column)")
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
          el("span", { class: "hl" + (c.ai ? " ai" : ""), text: c.label, title: c.label + (c.ai ? " (" + c.kindName + ")" : "") + (c.problem ? ". " + c.problem : c.description ? ": " + c.description : "") + " · a click sorts by it, ⇧-click adds it to the sort" + (i === 0 ? "" : ", a drag moves it") }),
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
    showPeek()
  }

  // The selected cell, when what it holds doesn't fit (its lines, its width): the whole of it, over the cells below.
  // It scrolls inside itself (the table doesn't scroll on past its end), and moves with the table.
  function showPeek() {
    var old = $("peek")
    if (old) old.remove()
    if (peekShut !== act.pid + "|" + act.c) peekShut = ""
    if (editing || peekShut) return
    var td = cellEl(act.pid, act.c), c = colById(act.c), r = actRow()
    var cv = td && td.querySelector(".cv")
    // (a pill's few pixels over the line's height isn't text cut off: half a line is)
    if (!cv || !c || !r) return
    var lh = parseFloat(getComputedStyle(cv).lineHeight) || 16
    if ((cv.scrollHeight - cv.clientHeight < lh / 2 && cv.scrollWidth <= cv.clientWidth + 1)) return
    var gw = $("gw"), g = gw.getBoundingClientRect(), b = td.getBoundingClientRect()
    var full = cellView(c, r)
    full.classList.remove("one")
    full.style.maxHeight = ""
    var pk = el("div", { class: "peek", id: "peek", "aria-hidden": "true" }, [full])
    pk.style.left = (b.left - g.left + gw.scrollLeft) + "px"
    pk.style.top = (b.top - g.top + gw.scrollTop) + "px"
    pk.style.minWidth = b.width + "px"
    pk.style.maxWidth = Math.max(b.width, 440) + "px"
    gw.appendChild(pk)
  }

  // The cell under the peek where it was clicked (it covers the cells below the selected one), unless that click
  // ended a selection of its text.
  function cellUnder(e) {
    var pk = $("peek")
    if (!pk || selecting()) return null
    pk.style.pointerEvents = "none"
    var at = document.elementFromPoint(e.clientX, e.clientY)
    pk.style.pointerEvents = ""
    var td = at && at.closest("td.cell")
    return td && !(td.getAttribute("data-p") === act.pid && td.getAttribute("data-c") === act.c) ? td : null
  }

  // (a click that ended a selection of the whole text's words leaves it be)
  function selecting() {
    var pk = $("peek"), s = window.getSelection()
    return !!(pk && s && !s.isCollapsed && pk.contains(s.anchorNode))
  }

  // esc, or a click on it: the whole text put away, until another cell is selected
  function shutPeek() {
    var pk = $("peek")
    if (!pk) return false
    peekShut = act.pid + "|" + act.c
    pk.remove()
    return true
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
    if (c.ai) { aiCell(c, r, cv, v); return cv }
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

  // An AI cell: its value, and its state when it isn't up to date (amber: the column or the paper changed since; ✎
  // yours; ⚠ failed, with why).
  function aiCell(c, r, cv, v) {
    var rec = C.cellOf(D.cells, c.id, r)
    var st = C.cellState(c, rec, r)
    cv.className += " st-" + st
    if (st !== "ok" && st !== "empty") cv.appendChild(el("span", { class: "smark", text: st === "yours" ? "✎" : st === "failed" ? "⚠" : "●", title: stateText(st, rec) }))
    if (C.isEmpty(v)) return
    if (c.kind === "jev-relevance" && typeof v === "number") cv.appendChild(el("span", { class: "pill band b-" + C.band(v), text: v + " " + C.band(v) }))
    else if (Array.isArray(v)) v.forEach(function (l) { cv.appendChild(el("span", { class: "pill tax", text: l })) })
    else if (c.type === "choice") cv.appendChild(el("span", { class: "pill tax", text: String(v) + (c.kind === "jev-one" && rec && typeof rec.p === "number" ? " " + Math.round(rec.p * 100) + "%" : "") }))
    else cv.appendChild(document.createTextNode(String(v)))
  }

  var READS = { note: "the extracted text", pdf: "the PDF, read on the fly", zotero: "Zotero's full-text index", abstract: "the title and abstract", none: "no text" }
  function stateText(st, rec) {
    return st === "empty" ? "Run… (⇧⌘R) or Run it fills it" : st === "ok" ? "Up to date" : st === "prompt" ? "The column changed since this ran: run it again"
      : st === "paper" ? "The paper's text was extracted since: run it again to read it" : st === "yours" ? "Yours: you edited it" + (rec && rec.ai ? " (the AI's answer is kept)" : "")
        : "Failed" + (rec && rec.error ? ": " + rec.error : "")
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
      showPeek()
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
    } else if (c.ai) {
      aiPanel(p, c, r, v)
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

  // An AI cell whole: its value, its state, the labels' probabilities, its evidence (each quote, its page, found
  // word for word or not), who made it and when; Run it again, and Back to the AI's answer for one you edited.
  function aiPanel(p, c, r, v) {
    var rec = C.cellOf(D.cells, c.id, r)
    var st = C.cellState(c, rec, r)
    p.appendChild(el("div", { class: "ilab" }, [el("span", { text: c.label }), el("span", { class: "k", text: c.kindName })]))
    if (c.problem) p.appendChild(el("div", { class: "ibox warn", text: c.problem }))
    var box = el("div", { class: "ibox ai st-" + st })
    if (Array.isArray(v)) box.appendChild(el("div", { class: "opts" }, v.length ? v.map(function (l) { return el("span", { class: "pill tax", text: l }) }) : [el("span", { class: "hint", text: "No label from the threshold." })]))
    else box.appendChild(el("div", { class: "ptext", text: C.isEmpty(v) ? (st === "empty" ? "Not run yet." : "Empty.") : c.kind === "jev-relevance" && typeof v === "number" ? v + " of 100: " + C.band(v) : C.text(c, v) }))
    box.appendChild(el("div", { class: "hint stl", text: stateText(st, rec) }))
    p.appendChild(box)
    if (rec && rec.probs) {
      var probs = Object.keys(rec.probs).map(function (l) { return [l, rec.probs[l]] }).sort(function (a, b) { return b[1] - a[1] }).slice(0, 10)
      p.appendChild(el("div", { class: "probs" }, probs.map(function (x) {
        return el("div", { class: "prob" }, [el("span", { text: x[0] }), el("span", { class: "bar" }, [el("i", { style: "width:" + Math.round(x[1] * 100) + "%" })]), el("span", { class: "pct", text: Math.round(x[1] * 100) + "%" })])
      })))
    }
    if (rec && rec.suggested && rec.suggested.length) p.appendChild(el("div", { class: "hint", text: "Below the threshold, likely: " + rec.suggested.join(", ") }))
    if (rec && rec.evidence && rec.evidence.length) {
      p.appendChild(el("div", { class: "ilab", text: "Evidence" }))
      rec.evidence.forEach(function (e) {
        p.appendChild(el("div", { class: "ev" + (e.found ? "" : " nf") }, [el("div", { class: "evq", text: "“" + e.quote + "”" }),
          el("div", { class: "hint", text: (e.page ? "p. " + e.page + " · " : "") + (e.found ? "found word for word in the paper's text" : "not found word for word in the text it read: check it before citing") })]))
      })
    }
    var made = rec && rec.by === "ai" ? rec : rec && rec.ai
    if (made && made.model) p.appendChild(el("div", { class: "hint", text: "By " + made.model + (made.updated ? " on " + String(made.updated).slice(0, 10) : "") + (made.input && READS[made.input.text] ? ", from " + READS[made.input.text] : "") }))
    if (c.edit === "text") p.appendChild(el("div", { class: "hint", text: "↵ or a double-click edits it; it's yours then, and the AI's answer is kept." }))
    p.appendChild(el("div", { class: "acts" }, [
      el("button", { class: "tb", type: "button", "data-act": "run1", text: st === "empty" ? "Run it" : "Run it again", disabled: !!c.problem || !!D.run || D.readOnly }),
      rec && rec.ai ? el("button", { class: "tb", type: "button", "data-act": "restore", text: "Back to the AI's answer", disabled: D.readOnly }) : null
    ]))
  }

  function matchCase(list, name) {
    var n = String(name).toLowerCase()
    for (var i = 0; i < list.length; i++) if (list[i].toLowerCase() === n) return list[i]
    return name
  }

  function drawFoot() {
    var f = clear($("foot"))
    f.appendChild(el("span", { text: editing ? "⌘↵ keep · esc drop" : "↑↓←→ move · space select · ↵ edit · ⌥→← status · ⇧⌥→← task · ⌥⌘←→ move column · ⌥⌘I panel · ⌘- ⌘+ text · ⇧⌘R run · ? keys" }))
    var n = rows.length
    var count = D.loading && !n ? "…" : n + (n === 1 ? " paper" : " papers") + (D.total > n ? " (the first " + n + " of " + D.total + ")" : "")
    var nsel = Object.keys(sel).length
    if (nsel) count += " · " + nsel + " selected"
    if (D.readOnly) count += " · read only: the sync folder isn't there"
    if (D.run) count += " · AI run: " + (D.run.stage || "starting")
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
    var was = D.cells[c.id][pid]
    var ai = was && was.by === "ai" && !was.error ? was : was && was.ai // (an AI cell you edit: its answer kept, as the file keeps it)
    D.cells[c.id][pid] = ai ? { v: v, by: "you", ai: ai } : { v: v, by: "you" }
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
    showPeek()
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
    if (c.edit === "text") {
      if (D.readOnly) return flash("Not saved: the sync folder isn't there")
      editing = { pid: act.pid, c: act.c }
      drawGrid()
      drawFoot()
      return
    }
    if (c.own) return flash("Pick its value in the panel on the right")
    if (c.ai) return flash("An AI column: Run… fills it (⇧⌘R); the panel on the right has its evidence")
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
  var popFor = null // the button the pop-up hangs from: a second click on it closes it
  // Closed: a query searched as you typed and not kept (↵) goes, the table back to its source.
  function closePop() {
    if (popEl) { popEl.remove(); popEl = null; popFor = null }
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
    popFor = anchor
    if (bind) bind(popEl)
    var first = popEl.querySelector("input[type=search], input[type=text]")
    if (first) first.focus()
  }
  // A toolbar button's pop-up: opened by a click, closed by the next click on the same button (or anywhere outside).
  function toggle(open) {
    return function (e) {
      var b = e.currentTarget
      if (popEl && popFor === b) return closePop()
      open(b)
    }
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
    if (c.ai) kids.splice(1, 0, item("Run this column…", { "data-m": "run", disabled: !!c.problem }, "⇧⌘R"), el("hr"))
    if (c.own || c.ai) kids.push(item("Remove it from this review", { "data-m": "remove" }, "its values stay"))
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
        else if (m === "run") runDialog(c)
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

  // Every column there is, by its group: ticked, it's shown; unticked, hidden (it keeps its place, its width and its
  // values). Zotero's fields, the rankings, your taxonomies, your own columns and the AI ones, this review's or not.
  function colsPop(anchor) {
    var kids = [el("div", { class: "ph", text: "Show and hide columns (nothing is lost)" })]
    var shown = {}
    cols.forEach(function (c) { if (!c.missing) shown[c.id] = !c.hidden })
    var all = C.available(D.ctx, D.columns)
    var last = ""
    all.forEach(function (c) {
      if (c.group !== last) { last = c.group; kids.push(el("div", { class: "ph grp", text: c.group })) }
      kids.push(el("label", { class: "pi" }, [el("span", { text: c.label }), el("input", { type: "checkbox", "data-show": c.id, checked: !!shown[c.id], disabled: c.id === "title" })]))
    })
    kids.push(el("hr"), item("A new column…", { "data-addcols": "1" }, "yours, or an AI one"))
    openPop(anchor, kids, function (p) {
      p.addEventListener("change", function (e) {
        var id = e.target.getAttribute("data-show")
        if (!id) return
        var l = layoutOf(id)
        if (!l) { if (!e.target.checked) return; l = { id: id }; review.columns.push(l); act.c = id }
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

  // + Column: first what fills it, yours or the AI; then that kind's fields. (Zotero's fields, the rankings and your
  // taxonomies aren't made: the Columns button lists them all, to tick.)
  var KIND_HINTS = { prompt: "your question, asked of each paper", "jev-several": "the labels of one of your taxonomies", "jev-one": "the best fit of one of your taxonomies", "jev-relevance": "how relevant each paper is to a topic, 0 to 100" }
  function addDialog(step) {
    if (D.readOnly) return flash("Not saved: the sync folder isn't there")
    var back = el("button", { class: "tb", type: "button", "data-step": "", text: "‹ Back" })
    var foot = function (go) { return el("footer", {}, [step ? back : null, el("span", { class: "fill" }), el("button", { class: "tb", type: "button", "data-close": "1", text: "Cancel" }), go]) }
    if (!step) {
      return openModal([el("header", {}, [el("h2", { text: "Add a column" }), el("p", { text: "Who fills it in?" })]),
        el("div", { class: "sb" }, [
          el("button", { class: "choice", type: "button", "data-step": "own" }, [el("b", { text: "You: a column of your own" }), el("span", { text: "Text, or one of a list (include, maybe, exclude…), filled in by you" })]),
          el("button", { class: "choice", type: "button", "data-step": "ai" }, [el("b", { text: "The AI: an AI column" }), el("span", { text: "Your question asked of each paper, Jev's labels from a taxonomy, or how relevant each paper is to a topic" })]),
          el("div", { class: "hint", text: "Zotero's fields, the rankings and your taxonomies are there already: tick them in the Columns button's list." })
        ]), foot(null)], function (m) {
        m.addEventListener("click", function (e) { var b = e.target.closest("[data-step]"); if (b) addDialog(b.getAttribute("data-step")) })
        var first = m.querySelector(".choice")
        if (first) first.focus()
      })
    }
    if (step === "own") {
      return openModal([el("header", {}, [el("h2", { text: "A column of your own" }), el("p", { text: "You fill it in: a click on a cell selects it, the panel on the right sets it." })]),
        el("div", { class: "sb" }, [
          el("label", {}, ["Its name", el("input", { type: "text", id: "nname", placeholder: "Include?, My notes, Chapter…", maxlength: "80" })]),
          el("label", {}, ["It holds", el("select", { id: "ntype" }, [el("option", { value: "text", text: "Text" }), el("option", { value: "choice", text: "One of a list" })])]),
          el("label", { id: "noptsl", hidden: true }, ["The choices, separated by commas", el("input", { type: "text", id: "nopts", placeholder: "include, maybe, exclude" })]),
          el("div", { class: "err", id: "nerr" })
        ]), foot(el("button", { class: "tb primary", type: "button", id: "nadd", text: "Add" }))], function (m) {
        m.addEventListener("click", function (e) { var b = e.target.closest("[data-step]"); if (b) addDialog(b.getAttribute("data-step")) })
        $("ntype").addEventListener("change", function () { $("noptsl").hidden = $("ntype").value !== "choice" })
        var go = function () {
          var made = C.newColumn({ label: $("nname").value.trim(), type: $("ntype").value, options: $("nopts").value })
          if (made.error) { $("nerr").textContent = made.error; return }
          addMade(made.column)
        }
        $("nadd").addEventListener("click", go)
        $("nname").addEventListener("keydown", function (e) { if (e.key === "Enter") go() })
      })
    }
    // an AI column: its kind, then its fields (data-for: the kinds a field is for); a prompt or a relevance can be
    // written by the AI from what you describe (Write it with AI), then changed before Add
    openModal([el("header", {}, [el("h2", { text: "An AI column" }), el("p", { text: "The AI fills it, paper by paper, when you Run it (⇧⌘R): nothing runs before." })]),
      el("div", { class: "sb" }, [
        el("div", { class: "kinds", role: "radiogroup", "aria-label": "What the AI does" }, C.AI_KINDS.map(function (k, i) {
          return el("label", { class: "kind" }, [el("input", { type: "radio", name: "akind", value: k, checked: i === 0 }), el("b", { text: C.KIND_NAMES[k] }), el("span", { text: KIND_HINTS[k] })])
        })),
        el("div", { class: "draft", "data-for": "prompt jev-relevance" }, [
          el("label", {}, ["Describe what you want to know, and the AI writes the column", el("textarea", { id: "adesc", rows: "2", placeholder: "" })]),
          el("div", { class: "arow" }, [el("button", { class: "tb", type: "button", id: "adraft", text: "Write it with AI" }), el("span", { class: "hint", id: "adnote" })])
        ]),
        el("div", { id: "aform", class: "aform" }, aiFields()),
        el("div", { class: "err", id: "nerr" })
      ]), foot(el("button", { class: "tb primary", type: "button", id: "nadd", text: "Add" }))], function (m) {
      m.addEventListener("click", function (e) { var b = e.target.closest("[data-step]"); if (b) addDialog(b.getAttribute("data-step")) })
      var kind = function () { return (m.querySelector("input[name=akind]:checked") || {}).value || "prompt" }
      var showAi = function () {
        var k = kind()
        Array.prototype.forEach.call(m.querySelectorAll("[data-for]"), function (x) { x.hidden = x.getAttribute("data-for").split(" ").indexOf(k) < 0 })
        if (k === "prompt") $("aoptsl").hidden = $("ashape").value !== "choice"
        if (k === "prompt") $("alenl").hidden = !($("ashape").value === "text" || $("ashape").value === "list")
        $("adesc").placeholder = k === "jev-relevance" ? "Papers on how firms build dynamic capabilities, not ones that only cite the idea" : "Each study's sample: how many firms or people, and from which countries"
        if (k === "jev-several" || k === "jev-one") {
          var ts = (D.ctx.taxonomies || []).filter(function (t) { return t.id && (t.kind === "one") === (k === "jev-one") })
          clear($("atax"))
          ts.forEach(function (t) { $("atax").appendChild(el("option", { value: t.id, text: t.name + " (" + t.prefix + ")" })) })
          if (!ts.length) $("atax").appendChild(el("option", { value: "", text: k === "jev-one" ? "No taxonomy of the one-label kind" : "No taxonomy of the several-labels kind" }))
        }
        $("anote").textContent = k !== "prompt" ? (D.ctx.jev ? "Jev answers, as tagging does (it reads the title, abstract and extracted text). No tags are written: the result stays in the column." : "No Jev key: your prompts model answers, as tagging does without one (Settings › Taxonomies sets the key). No tags are written.") : ""
      }
      m.addEventListener("change", function (e) { if (e.target.name === "akind" || e.target.id === "ashape") showAi() })
      showAi()
      $("adraft").addEventListener("click", function () {
        var ask = $("adesc").value.trim()
        if (!ask) { $("adnote").textContent = "Describe it first: what should the column tell you about each paper?"; return $("adesc").focus() }
        $("adraft").disabled = true
        $("adraft").textContent = "Writing…"
        $("adnote").textContent = "Your prompts model is writing it (a few seconds)."
        $("nerr").textContent = ""
        post("draftColumn", { kind: kind(), request: ask, current: aiValues(kind()) })
      })
      $("nadd").addEventListener("click", function () {
        var ai = C.newAiColumn(aiValues(kind()), D.ctx)
        if (ai.error) { $("nerr").textContent = ai.error; return }
        addMade(ai.column)
      })
      $("adesc").focus()
    })
  }

  // What the AI column's fields hold, as C.newAiColumn reads them.
  function aiValues(k) {
    return { label: $("aname").value, kind: k, description: k === "prompt" ? $("aprompt").value : $("adef").value, reads: $("areads").value, shape: $("ashape").value,
      length: $("alen").value, options: $("aopts").value, evidence: $("aev").checked, model: $("amodel").value, taxonomy: $("atax").value, topic: $("atopic").value }
  }

  // Write it with AI's answer (review-draft): the fields filled with it, to change before Add; or why not.
  function drafted(out) {
    var b = $("adraft")
    if (!b) return // (the dialog was closed meanwhile)
    b.disabled = false
    b.textContent = "Write it again"
    var o = out || {}
    if (o.error || !o.column) { $("adnote").textContent = ""; $("nerr").textContent = "The AI couldn't: " + (o.error || "no answer"); return }
    var c = o.column
    var set = function (id, v) { if (v !== undefined && v !== null && $(id)) $(id).value = Array.isArray(v) ? v.join(", ") : String(v) }
    set("aname", c.label)
    set("aprompt", c.prompt)
    set("areads", c.reads === "full" ? "full" : c.reads ? "abstract" : undefined)
    if (["text", "list", "number", "choice"].indexOf(c.shape) >= 0) set("ashape", c.shape)
    set("alen", c.length)
    set("aopts", c.options)
    if (typeof c.evidence === "boolean") $("aev").checked = c.evidence
    set("atopic", c.topic)
    set("adef", c.definition)
    $("ashape").dispatchEvent(new Event("change", { bubbles: true }))
    $("adnote").textContent = (o.notes ? o.notes + " " : "") + "Change anything, then Add; or describe it again."
  }

  // A column made in + Column: saved (its file), added to this review and selected.
  function addMade(spec) {
    closeModal()
    D.columns[spec.id] = spec
    review.columns.push({ id: spec.id })
    post("addColumn", { column: spec })
    act.c = spec.id
    layoutChanged()
    flash("Added “" + spec.label + "”" + (spec.kind !== "own" ? ": Run… (⇧⌘R) fills it" : ""))
    var td = cellEl(act.pid, act.c)
    if (td) td.scrollIntoView({ block: "nearest", inline: "nearest" })
  }

  // + Column's AI column: each kind's fields (shown for its kind: data-for).
  function aiFields() {
    var models = [el("option", { value: "default", text: "Your prompts model (Settings › Defaults)" })].concat((D.ctx.models || []).map(function (m) { return el("option", { value: m.value, text: m.label + (m.group ? " · " + m.group : "") }) }))
    return [
      el("label", {}, ["Its name", el("input", { type: "text", id: "aname", placeholder: "Research gap, Sample size, Relevant?…", maxlength: "80" })]),
      el("label", { "data-for": "prompt" }, ["The prompt: what to ask of each paper", el("textarea", { id: "aprompt", rows: "3", placeholder: "What research gap does the paper say it fills?" })]),
      el("div", { class: "arow", "data-for": "prompt" }, [
        el("label", {}, ["It reads", el("select", { id: "areads" }, [el("option", { value: "abstract", text: "The title and abstract" }), el("option", { value: "full", text: "The full text (the extracted text, else the PDF)" })])]),
        el("label", {}, ["The answer", el("select", { id: "ashape" }, [el("option", { value: "text", text: "Text" }), el("option", { value: "list", text: "A list" }), el("option", { value: "number", text: "A number" }), el("option", { value: "choice", text: "One of a list" })])]),
        el("label", { id: "alenl" }, ["At most (words, or items)", el("input", { type: "text", id: "alen", placeholder: "60 words, 5 items", inputmode: "numeric", size: "6" })])
      ]),
      el("label", { id: "aoptsl", "data-for": "prompt", hidden: true }, ["The choices, separated by commas", el("input", { type: "text", id: "aopts", placeholder: "firm, industry, country" })]),
      el("label", { class: "row", "data-for": "prompt" }, [el("input", { type: "checkbox", id: "aev" }), "Evidence: quotes with their page, each checked word for word against the paper"]),
      el("label", { "data-for": "prompt" }, ["The model", el("select", { id: "amodel" }, models)]),
      el("label", { "data-for": "jev-several jev-one" }, ["The taxonomy", el("select", { id: "atax" })]),
      el("label", { "data-for": "jev-relevance" }, ["The topic", el("input", { type: "text", id: "atopic", placeholder: "dynamic capabilities", maxlength: "200" })]),
      el("label", { "data-for": "jev-relevance" }, ["Relevant means", el("textarea", { id: "adef", rows: "2", placeholder: "It theorizes, measures or tests dynamic capabilities, not only mentions them" })]),
      el("div", { class: "hint", id: "anote" })
    ]
  }

  // Run… (the toolbar's ▷, a column's menu, ⇧⌘R): the plan before anything starts. Which papers (the selected ones, or
  // every one shown), which columns (this one, or every AI column), each column's cells by state, what's skipped and
  // why, the requests it makes and Jev's cost. Run posts the plan's cells; the app hands them to the runner.
  function runDialog(only) {
    var all = visible().filter(function (c) { return c.ai })
    if (!all.length) return flash("No AI column here yet: + Column adds one (An AI column)")
    if (D.readOnly) return flash("Not run: the sync folder isn't there")
    if (D.run) return flash("An AI run is going (" + (D.run.stage || "starting") + "): it's in the launcher's Processes")
    var selected = rows.filter(function (r) { return sel[C.paperId(r)] })
    var radio = function (name, value, on, text) { return el("label", { class: "row" }, [el("input", { type: "radio", name: name, value: value, checked: on }), text]) }
    var n = function (k, one, many) { return k + " " + (k === 1 ? one : many) }
    openModal([el("header", {}, [el("h2", { text: "Run the AI columns" }), el("p", { text: "What it would do: nothing starts before Run. It's one row in the launcher's Processes, and Stop all stops it." })]),
      el("div", { class: "sb" }, [
        el("div", { class: "agroup", text: "The papers" }),
        selected.length ? radio("rrows", "sel", true, "The selected ones (" + selected.length + ")") : null,
        radio("rrows", "all", !selected.length, "Every paper shown (" + rows.length + ")"),
        el("div", { class: "agroup", text: "The columns" }),
        only ? radio("rcols", "one", true, "“" + only.label + "”") : null,
        radio("rcols", "all", !only, "Every AI column (" + all.length + ")"),
        el("div", { class: "agroup", text: "Also" }),
        el("label", { class: "row" }, [el("input", { type: "checkbox", id: "ryours" }), "Run the cells you edited again (the AI's new answer replaces yours)"]),
        el("label", { class: "row" }, [el("input", { type: "checkbox", id: "ragain" }), "Run the up-to-date ones again (another model, say)"]),
        el("div", { class: "plan", id: "rplan" })
      ]),
      el("footer", {}, [el("button", { class: "tb", type: "button", "data-close": "1", text: "Cancel" }), el("button", { class: "tb primary", type: "button", id: "rgo", text: "Run" })])], function (m) {
      var plan = null
      var draw = function () {
        var rr = (m.querySelector("input[name=rrows]:checked") || {}).value === "sel" ? selected : rows
        var cc = (m.querySelector("input[name=rcols]:checked") || {}).value === "one" ? [only] : all
        plan = C.runPlan(cc, rr, D.cells, { yours: $("ryours").checked, again: $("ragain").checked })
        var box = clear($("rplan"))
        cc.forEach(function (c) {
          var k = plan.counts[c.id] || {}
          var bits = Object.keys(C.STATE_NAMES).filter(function (st) { return k[st] }).map(function (st) { return k[st] + " " + C.STATE_NAMES[st] })
          box.appendChild(el("div", { class: "pl" }, [el("b", { text: c.label }), el("span", { text: c.problem ? c.problem : bits.join(" · ") || "no cells" })]))
        })
        var sk = []
        if (plan.skipped.ok) sk.push(n(plan.skipped.ok, "up to date", "up to date"))
        if (plan.skipped.yours) sk.push(n(plan.skipped.yours, "of yours", "of yours"))
        if (plan.skipped.problem) sk.push(plan.skipped.problem + " on a taxonomy that's gone")
        if (sk.length) box.appendChild(el("div", { class: "hint", text: "Left as they are: " + sk.join(", ") + "." }))
        var req = []
        if (plan.requests.jev) req.push(n(plan.requests.jev, "Jev request", "Jev requests") + (D.ctx.jev ? " (about $" + plan.jevUsd.toFixed(4) + ")" : " (on your prompts model: no Jev key)"))
        if (plan.requests.prompt) req.push(n(plan.requests.prompt, "prompt request", "prompt requests"))
        box.appendChild(el("div", { class: "pl total" }, [el("b", { text: plan.jobs.length ? n(plan.jobs.length, "cell", "cells") + " on " + n(plan.papers, "paper", "papers") : "Nothing to run" }),
          el("span", { text: req.join(" · ") })]))
        if (rr.length > 200) box.appendChild(el("div", { class: "hint", text: "At most 200 papers a run: the first 200 here." }))
        $("rgo").disabled = !plan.jobs.length
      }
      m.addEventListener("change", draw)
      draw()
      $("rgo").addEventListener("click", function () {
        if (!plan || !plan.jobs.length) return
        var jobs = plan.jobs
        closeModal()
        D.run = { stage: "starting" }
        drawToolbar()
        drawFoot()
        post("run", { jobs: jobs })
      })
    })
  }

  function keysPanel() {
    var old = $("keys")
    if (old) { old.remove(); showKeys = false; return }
    showKeys = true
    var K = [["↑↓←→", "Move between cells"], ["home end", "The row's first and last column"], ["pgup pgdn", "A page up or down"], ["space", "Select the paper's row"],
      ["↵", "Edit a cell of yours (text)"], ["⌘↵ esc", "Keep, or drop, what you typed"], ["⌥→ ⌥←", "The paper's status"], ["⇧⌥→ ⇧⌥←", "Its task's status"],
      ["⌥⌘← ⌥⌘→", "Move the column"], ["⌥⌘I", "Show or hide the panel"], ["⌘- ⌘+ ⌘0", "Smaller, larger text, its size (⌃ too)"], ["⇧⌘R", "Run the AI columns…"], ["⌘O", "Show the paper in Zotero"], ["⌘E", "Export as CSV"], ["⌘R", "Search again"],
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
    $("bSource").addEventListener("click", toggle(sourcePop))
    $("bGroup").addEventListener("click", toggle(groupPop))
    $("bSort").addEventListener("click", toggle(sortPop))
    $("bOrder").addEventListener("click", turnOrder)
    $("bLines").addEventListener("click", toggle(linesPop))
    $("bCols").addEventListener("click", toggle(colsPop))
    $("bAdd").addEventListener("click", function () { addDialog("") })
    $("bRun").addEventListener("click", function () { runDialog(null) })
    $("bExport").addEventListener("click", toggle(exportPop))
    $("bPanel").addEventListener("click", togglePanel)
    $("bRefresh").addEventListener("click", function () { post("refresh") })
    $("bPin").addEventListener("click", function () { D.pinned = !D.pinned; drawToolbar(); post("pin", { on: D.pinned }) })
    // a press outside the pop-up closes it; on its own button the click that follows does (toggle)
    document.addEventListener("mousedown", function (e) { if (popEl && !popEl.contains(e.target) && !(popFor && popFor.contains(e.target))) closePop() })
    document.addEventListener("dragstart", function (e) { e.preventDefault() }) // (nothing here is dragged out: a drag moves a column)

    var gw = $("gw")
    gw.addEventListener("click", function (e) {
      var ck = e.target.closest("input[data-sel]")
      if (ck) { toggleSel(ck.getAttribute("data-sel"), ck.checked); return }
      if (e.target.id === "ckall") { rows.forEach(function (r) { if (e.target.checked) sel[C.paperId(r)] = true; else delete sel[C.paperId(r)] }); drawGrid(); drawFoot(); return }
      var mb = e.target.closest("[data-menu]")
      if (mb) { e.stopPropagation(); if (popEl && popFor === mb) return closePop(); return headerMenu(colById(mb.getAttribute("data-menu")), mb) }
      if (e.target.closest(".rz") || noClick) return
      var th = e.target.closest("th[data-c]")
      if (th) return setSort(C.clickSort(review.sort, th.getAttribute("data-c"), e.shiftKey))
      if (e.target.closest("#peek") && !editing) { // a click on the whole text: the cell under it, else it's put away
        var under = cellUnder(e)
        if (under) { setActive(under.getAttribute("data-p"), under.getAttribute("data-c")); gw.focus({ preventScroll: true }) }
        else if (!selecting()) shutPeek()
        return
      }
      var td = e.target.closest("td.cell")
      if (td && !editing) { setActive(td.getAttribute("data-p"), td.getAttribute("data-c")); gw.focus({ preventScroll: true }) }
    })
    gw.addEventListener("dblclick", function (e) {
      var rz = e.target.closest("[data-rz]")
      if (rz) return fitColumn(rz.getAttribute("data-rz"))
      if (e.target.closest("#peek") && !editing) { // (the selected cell, whole)
        if (act.c === "title") return openPaper(actRow())
        var pc = colById(act.c)
        return pc && pc.edit === "text" ? startEdit() : undefined
      }
      var td = e.target.closest("td.cell")
      if (!td || editing) return
      act = { pid: td.getAttribute("data-p"), c: td.getAttribute("data-c") }
      if (act.c === "title") return openPaper(actRow())
      var c = colById(act.c)
      if (c && c.edit === "text") startEdit()
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
      var c = colById(act.c)
      if (r && c && c.ai && e.target.closest("[data-act=run1]:not(:disabled)")) { D.run = { stage: "starting" }; drawToolbar(); drawFoot(); post("run", { jobs: [{ column: c.id, paper: C.paperId(r), seen: C.cellState(c, C.cellOf(D.cells, c.id, r), r) }] }) }
      if (r && c && c.ai && e.target.closest("[data-act=restore]:not(:disabled)")) post("restore", { column: c.id, paper: C.paperId(r) })
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
      if (shutPeek()) return
      return
    }
    if (typing || modalEl) return
    if (e.key === "F1" || (e.key === "?" && !meta)) { e.preventDefault(); return keysPanel() }
    if (meta && !alt && e.key.toLowerCase() === "e") { e.preventDefault(); return exportCsv() }
    if (meta && shift && !alt && e.key.toLowerCase() === "r") { e.preventDefault(); var ac = colById(act.c); return runDialog(ac && ac.ai ? ac : null) }
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

  return { load: load, flash: flash, segments: segments, drafted: drafted, ready: function () { post("ready") } }
})()

RT.ready()
