// The fold reader's page (docs/fold-reader/SPEC.md sections 7 to 11): draws what FoldCore makes of the app's data, the
// morph between levels, the panes, the selection bar, the margin, the PDF pane and its link both ways, the keys, every
// state, a live region. Talks only to its host: FoldView.mount(root, host) with host.post(type, payload); the app's
// calls come through the object mount returns (FoldBridge.js makes it window.FR). Every string is drawn as text.
var FoldView = (function () {
  var C = FoldCore
  var NS = "http://www.w3.org/2000/svg"

  // Shared concepts: the exact paths of ReviewGrid.js's ICONS (24-unit box), one icon per concept across the app.
  var SHARED = {
    status: "M5 21V4 M5 4h12l-2.5 4.5L17 13H5",
    task: "M4 4h16v16H4z M8 12l3 3 5-6",
    tax: "M3 3h8l10 10-8 8L3 11z M7.5 7.5h.01",
    note: "M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h7",
    chat: "M4 5h16v11H10l-5 4v-4H4z",
    ai: "M10 4l1.8 5.2L17 11l-5.2 1.8L10 18l-1.8-5.2L3 11l5.2-1.8z M18.5 3v4 M16.5 5h4",
    panel: "M3 4h18v16H3z M15 4v16 M17.5 8h1.5 M17.5 11h1.5"
  }
  // The reader's own (18-unit box, 1.5 stroke): [path, stroke width] pairs.
  function rr(x, y) { return "M" + (x + 1.2) + " " + y + "h3.1a1.2 1.2 0 0 1 1.2 1.2v3.1a1.2 1.2 0 0 1-1.2 1.2h-3.1a1.2 1.2 0 0 1-1.2-1.2v-3.1a1.2 1.2 0 0 1 1.2-1.2z" }
  var OWN = {
    full: [["M3 4.5h12M3 7.5h12M3 10.5h12M3 13.5h8"]],
    brief: [["M3 4.5h12M3 8.5h12"], ["M4 13h.01M7.5 13h.01M11 13h.01", 2.2]],
    key: [["M3 6h12", 2.6], ["M3 11.5h9"]],
    takeaway: [["M3 9h12", 2.6]],
    topic: [[rr(2.5, 2.5) + rr(10, 2.5) + rr(2.5, 10) + rr(10, 10)]],
    pdf: [["M5 2.5h5.5l3 3v10H5z M10.5 2.5v3h3 M7.3 9h4M7.3 11.5h4M7.3 14h2.5"]],
    swap: [["M3 6h11.5M11.5 3l3 3-3 3 M15 12H3.5M6.5 9l-3 3 3 3"]],
    highlight: [["M11 2.8l4.2 4.2-6.4 6.4H4.6V9.2z M3 15.8h12"]],
    foldback: [["M15.5 2.5L10.5 7.5M10.5 3.8v3.7h3.7 M2.5 15.5l5-5M7.5 14.2v-3.7H3.8"]],
    zoomout: [["M7.5 2.5a5 5 0 1 0 .01 0z M11.2 11.2l4.3 4.3M5.5 7.5h4"]],
    zoomin: [["M7.5 2.5a5 5 0 1 0 .01 0z M11.2 11.2l4.3 4.3M5.5 7.5h4M7.5 5.5v4"]],
    fit: [["M2.5 9h13M5 6.5L2.5 9 5 11.5M13 6.5l2.5 2.5-2.5 2.5"]]
  }
  function icon(name, small) {
    var svg = document.createElementNS(NS, "svg")
    svg.setAttribute("aria-hidden", "true")
    svg.setAttribute("class", "ic ic-" + name + (small ? " s" : ""))
    var parts = SHARED[name] ? [[SHARED[name]]] : OWN[name] || []
    svg.setAttribute("viewBox", SHARED[name] ? "0 0 24 24" : "0 0 18 18")
    parts.forEach(function (p) {
      var path = document.createElementNS(NS, "path")
      path.setAttribute("d", p[0])
      if (p[1]) path.setAttribute("stroke-width", String(p[1]))
      svg.appendChild(path)
    })
    return svg
  }

  function el(tag, attrs, kids) {
    var e = document.createElement(tag)
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k]
      if (v === undefined || v === null || v === false) return
      if (k === "text") e.textContent = String(v)
      else if (k === "class") e.className = v
      else if (k === "disabled" || k === "value" || k === "tabIndex") e[k] = v
      else e.setAttribute(k, v === true ? "" : String(v))
    })
    ;(kids || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c) })
    return e
  }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); return e }
  function name(b, text) { b.title = text; b.setAttribute("aria-label", text) }
  function button(cls, label, kids, extra) { return el("button", Object.assign({ type: "button", class: cls, title: label, "aria-label": label }, extra || {}), kids) }

  var ORDER = ["full", "brief", "key", "takeaway", "topic"]
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  function fmtDate(iso) {
    var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(iso || ""))
    return m ? Number(m[3]) + " " + MONTHS[Number(m[2]) - 1] + " " + m[1] : ""
  }
  function reduced() { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches } catch (e) { return false } }
  function mark(n) { try { performance.mark(n) } catch (e) { /* (an old engine) */ } }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }

  var STATES = {
    loading: ["Opening the paper…", "", null],
    "no-textfold": ["TextFold isn't running", "The reader shows the levels TextFold writes. Start TextFold on this Mac, then try again.", ["Try again", "retry"]],
    "zotero-off": ["TextFold can't reach Zotero", "Start Zotero, and in Zotero turn on Settings › Advanced › Allow other applications on this computer to communicate with Zotero.", ["Try again", "retry"]],
    "not-folded": ["TextFold hasn't folded this paper yet", "Folding reads the paper and asks TextFold's model to write its levels. It uses TextFold's model and can take a few minutes.", ["Fold it with TextFold", "fold"]],
    folding: ["TextFold is folding this paper", "", null],
    "needs-engine": ["This PDF is a scan", "TextFold needs its PDF engine to read it: install the engine in TextFold's Settings, then fold again.", ["Fold it with TextFold", "fold"]],
    "no-model": ["TextFold has no model", "Choose a model in TextFold's Settings, then fold again.", ["Fold it with TextFold", "fold"]],
    "no-file": ["TextFold found nothing to read", "This paper has no PDF TextFold can read and no text online.", null],
    "fold-failed": ["TextFold couldn't fold this paper", "", ["Try again", "fold"]],
    "group-library": ["Your own library's papers only, for now", "Papers in group libraries come in a later version.", null],
    "bad-format": ["This TextFold is newer than the reader", "", null]
  }
  function stateCopy(s) {
    var c = STATES[s.kind] || STATES.loading
    var sentence = c[1]
    if (s.kind === "folding") {
      if (s.status === "queued" || s.queued) sentence = "Waiting for TextFold's other work."
      else {
        var stage = String(s.stage || "Starting")
        stage = stage.charAt(0).toUpperCase() + stage.slice(1)
        sentence = (s.total ? stage + ": " + (s.done || 0) + " of " + s.total : stage) + ". You can read the PDF meanwhile."
      }
    }
    if (s.kind === "fold-failed") sentence = String(s.error || "").slice(0, 300)
    if (s.kind === "bad-format") sentence = "It writes format " + (s.format || "?") + " version " + (s.version === "" || s.version === undefined ? "?" : s.version) + ": update the Zotero Launcher to read it."
    return { title: c[0], sentence: sentence, action: c[2] }
  }
  var PDF_PROBLEMS = { "no-pdf": "This paper has no PDF attached: the text reads on its own", missing: "The PDF file is missing from disk" }
  var HINTS = "? keys  ·  1…5 level  ·  ⌘ scroll folds, zooms the PDF  ·  j k paragraph  ·  ↵ open  ·  esc fold back  ·  ⌘W close"
  var KEYS = [["1 … 5", "The level: Full, Brief, Key, Takeaway, Topic (the dial too)"], ["-  =  +", "A level coarser / finer, the text focused; the PDF out / in, the PDF focused"],
    ["0", "Fit the page width, the PDF focused"], ["⌘ scroll", "Over the text: the level; over the PDF: its zoom"], ["j  k", "The next / previous paragraph"],
    ["↵", "Open the selected paragraph in full, in place (a double-click too)"], ["esc", "Fold it back; hide the selection bar, a menu, these keys"],
    ["h  n  c", "Highlight, note, ask about the selected words"], ["⌥→  ⌥←", "The paper's next / previous status"], ["⇧⌥→  ⇧⌥←", "Its task's next / previous status"],
    ["⌥⌘P", "The PDF beside the text"], ["⌥⌘M", "The margin: links and notes"], ["?  F1", "Show or hide these keys"], ["⌘-  ⌘+  ⌘0", "The text smaller, larger, its size"],
    ["⌘R", "Look TextFold up again"], ["⌘W", "close"]]
  var BUCKETS = [600, 900, 1200, 1800, 2400]

  function mount(root, host) {
    var S = {
      d: null, m: null, state: { kind: "loading" }, level: "full", opened: {}, sel: null, follow: null,
      pdfOn: true, pdfLeft: false, pdfW: 470, marginOn: true, marginW: 220, zoom: 1, role: null, showBack: false,
      store: C.emptyStore({}), links: null, pages: [], wordsDone: false, keys: false, menu: null, pick: null, flash: "", ask: {}
    }
    var rows = {} // a unit's row: { row, ubox, line, shape, body, aside, ncount, drawn }
    var queue = [] // units still to draw at the level shown (drawn in idle chunks)
    var anchorKeep = null // the paragraph kept at the reading line while the queue draws
    var hold = null // { a: anchor, until }: the paragraph kept in its place while rows above it change size (no input since)
    var order = null // the rows shown, in order (follow's binary search reads their places live)
    var fitW = { pdf: 470, margin: true, marginW: 220 } // what the window's width allows of the widths kept (fit())
    var rove = null // the one paragraph whose controls are Tab stops
    var levelAnchor = null, moved = true // the reading line's paragraph when the levels began to change, until the reader moves
    var quietUntil = 0, followTimer = null, followAt = 0, marksTimer = null, flashTimer = null, wheelAcc = 0, chunkTimer = null
    var boxEls = {} // a unit's boxes on the pages: [button]
    function post(type, payload) { host.post(type, payload || {}) }
    function prefs(o) { post("prefs", o) }

    // ---- the skeleton
    clear(root)
    var hd = el("header", { class: "hd" }), titles = el("div", { class: "titles" }), titleEl = el("h1", { class: "title" }), byline = el("div", { class: "byline" })
    titles.appendChild(titleEl); titles.appendChild(byline)
    var pills = el("div", { class: "pills" })
    hd.appendChild(titles); hd.appendChild(pills)
    var tools = el("div", { class: "tools" })
    var panes = el("div", { class: "panes" })
    var text = el("div", { id: "text", role: "document", "aria-label": "Paper text", tabIndex: 0 })
    var selbar = el("div", { class: "selbar", role: "toolbar", "aria-label": "Selected text", hidden: true })
    var bHl = button("", "Highlight · h", [icon("highlight")], { "aria-pressed": "false", "aria-keyshortcuts": "h" })
    var bNote = button("", "Note · n", [icon("note")], { "aria-keyshortcuts": "n" })
    var bAsk = button("", "Ask · c", [icon("chat")], { "aria-keyshortcuts": "c" })
    ;[bHl, bNote, bAsk].forEach(function (b) { b.addEventListener("mousedown", function (e) { e.preventDefault() }); selbar.appendChild(b) })
    var banner = el("div", { class: "banners" })
    var statePanel = el("div", { class: "state", hidden: true })
    var column = el("div", { class: "column", hidden: true })
    var grid = el("div", { class: "grid", hidden: true })
    text.appendChild(selbar); text.appendChild(banner); text.appendChild(statePanel); text.appendChild(column); text.appendChild(grid)
    var grip = el("button", { id: "grip", type: "button", title: "Resize the PDF pane. ← → resize, double-click resets.", "aria-label": "Resize the PDF pane. ← → resize, double-click resets." }, [el("span", { "aria-hidden": "true" })])
    var pdf = el("section", { id: "pdf", "aria-label": "Original PDF" })
    var pbar = el("div", { class: "pbar" })
    var pagesEl = el("div", { id: "pages", tabIndex: 0, "aria-label": "PDF pages" })
    pdf.appendChild(pbar); pdf.appendChild(pagesEl)
    panes.appendChild(text); panes.appendChild(grip); panes.appendChild(pdf)
    var ft = el("footer", { class: "ft" }), ftLeft = el("span"), ftLevel = el("span", { class: "lv" })
    ft.appendChild(ftLeft); ft.appendChild(ftLevel)
    var live = el("div", { class: "sr", "aria-live": "polite", role: "status" })
    var keysEl = el("div", { class: "keys", role: "dialog", "aria-label": "Keys", hidden: true })
    root.appendChild(hd); root.appendChild(tools); root.appendChild(panes); root.appendChild(ft); root.appendChild(live); root.appendChild(keysEl)
    keysEl.appendChild(el("h2", { text: "Keys" }))
    keysEl.appendChild(el("table", {}, [el("tbody", {}, KEYS.map(function (k) { return el("tr", {}, [el("td", { text: k[0] }), el("td", { text: k[1] })]) }))]))

    function say(t) { live.textContent = ""; live.textContent = t }
    function flash(t) {
      S.flash = String(t || "")
      clearTimeout(flashTimer)
      if (S.flash) { say(S.flash); flashTimer = setTimeout(function () { S.flash = ""; drawFoot() }, 4000) }
      drawFoot()
    }
    function drawFoot() {
      ftLeft.className = S.flash ? "flash" : ""
      ftLeft.textContent = S.flash || HINTS
      ftLevel.textContent = C.level(S.level).foot
    }

    // ---- the header
    function paperTitle() { return (S.d && S.d.paper && S.d.paper.title) || (S.m && S.m.title) || "Untitled" }
    function bylineText() {
      var p = (S.d && S.d.paper) || {}
      var who = C.byline(S.m && S.m.authors.length ? S.m.authors : p.authors || [])
      var year = p.year || (S.m && S.m.date ? S.m.date.slice(0, 4) : "")
      var pages = S.d && S.d.pdf && S.d.pdf.pages ? S.d.pdf.pages + (S.d.pdf.pages === 1 ? " page" : " pages") : ""
      return [who, year, p.publication || "", pages].filter(function (x) { return x }).join(" · ")
    }
    function statusName(tag) { return String(tag || "").replace(/^s\//, "") }
    function statusNames() { return ((S.d && S.d.status && S.d.status.options) || []).slice() }
    function drawHeader() {
      titleEl.textContent = paperTitle()
      byline.textContent = bylineText()
      clear(pills)
      var st = (S.d && S.d.status) || { current: "", options: [] }
      var cur = statusName(st.current)
      var sp = button("pill status", cur ? "Status: " + cur : "No status", [icon("status", true), el("span", { text: cur || "No status" }), el("span", { class: "caret", "aria-hidden": "true", text: "▾" })],
        { "aria-haspopup": "menu", "aria-expanded": S.menu === "status" ? "true" : "false", "aria-keyshortcuts": "Alt+ArrowRight Alt+ArrowLeft", id: "pStatus" })
      sp.addEventListener("click", function () { toggleMenu("status") })
      pills.appendChild(sp)
      var task = S.d && S.d.task
      if (task) {
        var opt = (task.options || []).filter(function (o) { return o.id === task.current })[0]
        var label = opt ? "Task: " + opt.name : "No task"
        var tp = button("pill task", label + (task.description ? " (" + task.description + ")" : ""), [icon("task", true), el("span", { text: opt ? opt.name : "No task" }), el("span", { class: "caret", "aria-hidden": "true", text: "▾" })],
          { "aria-haspopup": "menu", "aria-expanded": S.menu === "task" ? "true" : "false", "aria-keyshortcuts": "Shift+Alt+ArrowRight Shift+Alt+ArrowLeft", id: "pTask" })
        tp.setAttribute("aria-label", label)
        tp.addEventListener("click", function () { toggleMenu("task") })
        pills.appendChild(tp)
      }
      var tx = ((S.d && S.d.taxonomies) || []).filter(function (t) { return t && t.labels && t.labels.length })
      if (tx.length) {
        var g = el("div", { class: "taxes", role: "group", "aria-label": "Taxonomies" })
        var ti = el("span", { title: "Taxonomies", class: "ticon" }, [icon("tax", true)])
        g.appendChild(ti)
        tx.forEach(function (t) {
          g.appendChild(el("span", { class: "tname", text: t.name }))
          t.labels.forEach(function (l) { g.appendChild(el("span", { class: "label", text: l })) })
        })
        pills.appendChild(g)
      }
      if (S.menu) drawMenu()
    }
    function menuItems(which) {
      if (which === "status") {
        var names = statusNames(), cur = statusName(S.d.status.current)
        if (!names.length) return [{ text: "Set up statuses in the launcher: Settings › Paper status", disabled: true }]
        return [{ text: "No status", on: !cur, pick: function () { setStatus("") } }].concat(names.map(function (n) {
          return { text: n, on: cur.toLowerCase() === n.toLowerCase(), pick: function () { setStatus(n) } }
        }))
      }
      var t = S.d.task
      return (t.options || []).map(function (o) { return { text: o.name, on: o.id === t.current, pick: function () { setTask(o.id) } } })
    }
    var menuEl = null
    function drawMenu() {
      if (menuEl) menuEl.remove()
      var pill = document.getElementById(S.menu === "status" ? "pStatus" : "pTask")
      if (!pill) return
      menuEl = el("div", { class: "menu", role: "menu", "aria-label": S.menu === "status" ? "Status" : "Task" })
      menuItems(S.menu).forEach(function (it) {
        var b = el("button", { type: "button", role: it.disabled ? "menuitem" : "menuitemradio", "aria-checked": it.disabled ? null : it.on ? "true" : "false", disabled: !!it.disabled, tabIndex: -1 },
          [el("span", { class: "tick", "aria-hidden": "true", text: it.on ? "✓" : "" }), it.text])
        if (it.pick) b.addEventListener("click", function () { var was = S.menu; closeMenu(false); it.pick(); var p = document.getElementById(was === "status" ? "pStatus" : "pTask"); if (p) p.focus() })
        menuEl.appendChild(b)
      })
      menuEl.style.left = pill.offsetLeft + "px"
      menuEl.style.top = (pill.offsetTop + pill.offsetHeight + 4) + "px"
      menuEl.addEventListener("keydown", function (e) {
        var items = Array.prototype.slice.call(menuEl.querySelectorAll("button:not(:disabled)"))
        var at = items.indexOf(document.activeElement)
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); if (items.length) items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus() }
        else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(true) }
        else if (e.key === "Tab") closeMenu(false)
      })
      pills.appendChild(menuEl)
      var first = menuEl.querySelector('[aria-checked="true"]') || menuEl.querySelector("button:not(:disabled)") || menuEl.querySelector("button")
      if (first) first.focus()
    }
    function toggleMenu(which) {
      if (S.menu === which) return closeMenu(true)
      S.menu = which
      drawHeader()
    }
    function closeMenu(focusPill) {
      var was = S.menu
      if (!was) return
      S.menu = null
      if (menuEl) { menuEl.remove(); menuEl = null }
      drawHeader()
      if (focusPill) { var p = document.getElementById(was === "status" ? "pStatus" : "pTask"); if (p) p.focus() }
    }
    function setStatus(n) {
      var from = S.d.status.current || "", to = n ? "s/" + n : ""
      S.d.status.current = to
      post("status", { from: from, to: to })
      drawHeader()
      flash("Now: " + (n || "no status"))
    }
    function cycleStatus(delta) {
      var names = statusNames()
      if (!names.length) return flash("No paper statuses: add some in the launcher's Settings › Paper status")
      var list = [""].concat(names), cur = statusName(S.d.status.current).toLowerCase()
      var at = 0
      list.forEach(function (n, i) { if (n.toLowerCase() === cur) at = i })
      setStatus(list[(at + delta + list.length) % list.length])
    }
    function setTask(id) {
      var t = S.d.task
      t.current = id
      post("task", { status: id })
      drawHeader()
      var o = (t.options || []).filter(function (x) { return x.id === id })[0]
      flash("Now: " + (o ? o.name : id))
    }
    function cycleTask(delta) {
      var t = S.d && S.d.task
      if (!t || !(t.options || []).length) return
      var ids = t.options.map(function (o) { return o.id }), at = ids.indexOf(t.current)
      setTask(at < 0 ? ids[0] : ids[(at + delta + ids.length) % ids.length])
    }

    // ---- the toolbar
    var dialBtns = {}, bPdf, bSwap, bMargin, roleBtns = {}, capAi
    function drawTools() {
      clear(tools)
      var dial = el("div", { class: "dial", role: "group", "aria-label": "Level" })
      dial.appendChild(el("div", { class: "cap paper", title: "The paper's words" }, [el("span", { "aria-hidden": "true", text: "Aa" }), el("span", { class: "sr", text: "The paper's words" })]))
      capAi = el("div", { class: "cap ai" }, [icon("ai", true), el("span", { class: "sr" })])
      dial.appendChild(capAi)
      C.LEVELS.forEach(function (L) {
        var b = button("tb", L.tip, [icon(L.id), el("span", { class: "num", "aria-hidden": "true", text: L.key })], { "aria-pressed": "false", "aria-keyshortcuts": L.key, "data-level": L.id })
        b.addEventListener("click", function () { setLevel(L.id) })
        dialBtns[L.id] = b
        dial.appendChild(b)
      })
      tools.appendChild(dial)
      tools.appendChild(el("div", { class: "vsep", "aria-hidden": "true" }))
      var pg = el("div", { class: "group", role: "group", "aria-label": "Panes" })
      bPdf = button("tb", "PDF beside the text · ⌥⌘P", [icon("pdf")], { "aria-pressed": "false", "aria-keyshortcuts": "Alt+Meta+P", id: "bPdf" })
      bPdf.addEventListener("click", function () { togglePdf() })
      bSwap = button("tb", "Move the PDF to the left", [icon("swap")], { id: "bSwap" })
      bSwap.addEventListener("click", function () { S.pdfLeft = !S.pdfLeft; prefs({ pdfLeft: S.pdfLeft }); drawPanes() })
      bMargin = button("tb", "Margin: links and notes · ⌥⌘M", [icon("panel")], { "aria-pressed": "false", "aria-keyshortcuts": "Alt+Meta+M", id: "bMargin" })
      bMargin.addEventListener("click", function () { setMargin(!fitW.margin) })
      pg.appendChild(bPdf); pg.appendChild(bSwap); pg.appendChild(bMargin)
      tools.appendChild(pg)
      var rg = el("div", { class: "group roles", role: "group", "aria-label": "Paragraph roles" })
      roleBtns = {}
      if (S.m) C.rolesOf(S.m).forEach(function (r) {
        var b = button("tb role", "Show only " + r + " paragraphs", [el("span", { class: "shape", "aria-hidden": "true", text: C.SHAPES[r] }), r], { "aria-pressed": "false", "data-role": r })
        b.addEventListener("click", function () { setRole(S.role === r ? null : r) })
        roleBtns[r] = b
        rg.appendChild(b)
      })
      tools.appendChild(rg)
      updateTools()
    }
    function hasPdf() { return !!(S.d && S.d.pdf && !S.d.pdf.problem) }
    function pdfShown() { return S.pdfOn && S.level !== "topic" && !!(S.d && S.d.pdf) && !(S.d.pdf.problem === "no-pdf") }
    function updateTools() {
      C.LEVELS.forEach(function (L) { var b = dialBtns[L.id]; if (b) { b.setAttribute("aria-pressed", L.id === S.level ? "true" : "false"); b.disabled = !S.m } })
      var p = S.m && S.m.provenance
      var aiTip = p && p.local ? "Not written by a model yet: the paper's first sentences" : "Written by AI (" + [p && p.model, p && fmtDate(p.levelsMade)].filter(Boolean).join(", ") + ")"
      if (capAi) { capAi.title = aiTip; capAi.lastChild.textContent = aiTip }
      if (bPdf) {
        var noPdf = S.d && S.d.pdf && S.d.pdf.problem === "no-pdf"
        bPdf.disabled = S.level === "topic" || !S.d || !S.d.pdf || !!noPdf
        name(bPdf, S.level === "topic" ? "The PDF shows beside levels 1 to 4" : noPdf ? PDF_PROBLEMS["no-pdf"] : "PDF beside the text · ⌥⌘P")
        bPdf.setAttribute("aria-pressed", pdfShown() ? "true" : "false")
        bSwap.disabled = !pdfShown()
        name(bSwap, S.pdfLeft ? "Move the PDF to the right" : "Move the PDF to the left")
        bMargin.setAttribute("aria-pressed", fitW.margin ? "true" : "false")
        name(bMargin, S.marginOn && !fitW.margin ? "Margin: hidden while the window is narrow; press to show it · ⌥⌘M" : "Margin: links and notes · ⌥⌘M")
      }
      Object.keys(roleBtns).forEach(function (r) { roleBtns[r].setAttribute("aria-pressed", S.role === r ? "true" : "false") })
    }

    // ---- the text: states, banners, the column, the grid
    function stateBox(s, asBanner) {
      var c = stateCopy(s)
      var act = null
      if (c.action) {
        act = el("button", { type: "button", class: "act", text: c.action[0], "data-act": c.action[1] })
        act.addEventListener("click", function () { post(c.action[1]) })
        if (c.action[1] === "retry") act.setAttribute("aria-keyshortcuts", "Meta+R")
      }
      if (asBanner) return el("div", { class: "banner", role: "note", "data-state": s.kind }, [el("strong", { text: c.title }), c.sentence ? el("span", { text: c.sentence }) : null, act])
      return el("div", { "data-state": s.kind }, [el("h2", { text: c.title }), c.sentence ? el("p", { text: c.sentence }) : null, act])
    }
    function drawBanners() {
      clear(banner)
      if (!S.m) return
      var s = S.state || {}
      if (s.kind === "no-textfold") {
        var b = el("div", { class: "banner", role: "note", "data-state": "no-textfold" }, [el("span", { text: "TextFold isn't running: these are the levels saved on " + (fmtDate(S.d && S.d.saved) || "an earlier day") + "." })])
        var a = el("button", { type: "button", class: "act", text: "Try again", "data-act": "retry", "aria-keyshortcuts": "Meta+R" })
        a.addEventListener("click", function () { post("retry") })
        b.appendChild(a)
        banner.appendChild(b)
      } else if (s.kind && STATES[s.kind] && ["loading", "not-folded", "bad-format", "group-library", "no-file"].indexOf(s.kind) < 0) {
        banner.appendChild(stateBox(s, true))
      }
      if (S.m.provenance.local && ["folding"].indexOf(s.kind) < 0) {
        var l = el("div", { class: "banner", role: "note", "data-state": "local-only" }, [el("span", { text: "No model has written these levels yet: Key, Takeaway and Topic show the paper's first sentences." })])
        var f = el("button", { type: "button", class: "act", text: "Fold it with TextFold", "data-act": "fold" })
        f.addEventListener("click", function () { post("fold") })
        l.appendChild(f)
        banner.appendChild(l)
      }
    }
    function drawState() {
      drawBanners()
      if (S.m) { statePanel.hidden = true; return }
      column.hidden = true; grid.hidden = true
      statePanel.hidden = false
      clear(statePanel).appendChild(stateBox(S.state || { kind: "loading" }, false))
    }

    // the column: one row per unit, drawn at the level shown (or Full when opened in place)
    function buildColumn() {
      clear(column)
      rows = {}
      rove = null
      boxEls = {}
      var mg = el("button", { type: "button", class: "mgrip", title: "Resize the margin. ← → resize, double-click resets.", "aria-label": "Resize the margin. ← → resize, double-click resets." }, [el("span", { "aria-hidden": "true" })])
      dragger(mg, function () { return fitW.marginW }, function (start, dx) { setMarginW(start - dx) }, function (d) { setMarginW(S.marginW + d) }, function () { setMarginW(220) }, "marginWidth")
      column.appendChild(mg)
      column.appendChild(el("div", { class: "lostgroup", hidden: true }))
      S.m.sections.forEach(function (s) {
        var head = el("div", { class: "sec d" + s.depth, "data-s": s.id }, [s.num ? el("span", { class: "n", text: s.num }) : null, s.title])
        var take = el("div", { class: "stake", text: s.takeaway, hidden: true })
        var list = el("div", { class: "units", "data-s": s.id })
        column.appendChild(head); column.appendChild(take); column.appendChild(list)
        s.units.forEach(function (uid) {
          var r = { row: el("div", { class: "u", "data-u": uid }), drawn: "" }
          r.body = el("div", { class: "ubody" })
          r.line = el("div", { class: "openedline", hidden: true }, [el("span", { text: "Opened in place" })])
          var fb = button("tb", "Fold back · esc", [icon("foldback", true)], { "aria-keyshortcuts": "Escape" })
          fb.addEventListener("click", function () { foldBack(uid) })
          r.line.appendChild(fb)
          r.ubox = el("div", { class: "ubox" })
          r.words = el("span", { class: "body" })
          r.shape = el("span")
          r.ubox.appendChild(r.shape); r.ubox.appendChild(r.words)
          r.body.appendChild(r.line); r.body.appendChild(r.ubox)
          r.ncount = button("ncount", "Notes", [icon("note", true), el("span")], { hidden: true })
          r.ncount.addEventListener("click", function () { if (!fitW.margin) setMargin(true); if (unitLevel(uid) === "takeaway") openUnit(uid) })
          r.aside = el("aside", { class: "mg", "aria-label": "Margin" })
          r.row.appendChild(r.body); r.row.appendChild(r.ncount); r.row.appendChild(r.aside)
          r.ubox.addEventListener("click", function (e) { if (e.target.closest("button")) return; var ws = window.getSelection(); if (ws && !ws.isCollapsed) return; select(uid, false) })
          r.ubox.addEventListener("dblclick", function (e) { if (e.target.closest("button")) return; if (!S.opened[uid] && S.level !== "full") { clearSelection(); openUnit(uid) } })
          estimate(r, uid)
          rows[uid] = r
        })
      })
      placeRows()
      columnLayout()
    }
    // (an undrawn row's height, guessed from its words, so the scrollbar is near right before it is drawn)
    function estimate(r, uid) {
      var u = S.m.units[uid], n = S.level === "full" ? u.toks.length : S.level === "brief" ? u.toks.length * 0.6 : S.level === "key" ? u.key.length : u.tn
      r.row.style.containIntrinsicSize = "auto " + Math.max(28, Math.ceil(n / 11) * 26 + 8) + "px"
    }
    // the rows in their sections, the role filter's stubs between them
    function placeRows() {
      S.m.sections.forEach(function (s) {
        var list = column.querySelector('.units[data-s="' + cssId(s.id) + '"]')
        clear(list)
        C.filterRuns(S.m, s.units, S.role).forEach(function (run) {
          if (run.kind === "unit") return list.appendChild(rows[run.id].row)
          var b = el("button", { type: "button", text: "Show them" })
          b.addEventListener("click", function () { setRole(null) })
          list.appendChild(el("div", { class: "stub", "data-stub": run.ids.join(" ") }, [el("span", { class: "shapes", "aria-hidden": "true", text: run.roles.map(function (r) { return C.SHAPES[r] }).join("") }), el("span", { text: run.label }), b]))
        })
      })
      order = null
    }
    function cssId(s) { return String(s).replace(/["\\]/g, "\\$&") }
    function columnLayout() {
      column.style.maxWidth = (696 + (fitW.margin ? fitW.marginW + 24 : 0) + 56 + 14) + "px"
      // (the headings and the sections' takeaways end where the margin starts)
      column.style.setProperty("--mgw", (fitW.margin ? fitW.marginW + 24 : 0) + "px")
      var mg = column.querySelector(".mgrip")
      mg.hidden = !fitW.margin || ["takeaway"].indexOf(S.level) >= 0
      mg.style.right = (28 + fitW.marginW + 12 - 5.5) + "px"
      S.m.sections.forEach(function (s) {
        var t = column.querySelector('.sec[data-s="' + cssId(s.id) + '"] + .stake')
        if (t) t.hidden = !(s.takeaway && (S.level === "key" || S.level === "takeaway"))
      })
      drawLost()
    }

    function unitLevel(uid) { return S.opened[uid] ? "full" : S.level }
    function drawUnit(uid) {
      var r = rows[uid], u = S.m.units[uid]
      if (!r) return
      var L = unitLevel(uid), opened = !!S.opened[uid] && S.level !== "full"
      r.drawn = L + (opened ? "!" : "")
      r.row.className = "u lv-" + S.level + (S.sel === uid ? " sel" : "") + (S.follow === uid && pdfShown() ? " fol" : "") + (opened ? " opened" : "") + (fitW.margin ? "" : " nomargin")
      r.line.hidden = !opened
      var sh
      if (L === "full") sh = el("span", { class: "shape", role: "img", "aria-label": u.role, title: u.role, text: C.SHAPES[u.role] })
      else {
        sh = button("shape", "Open this paragraph in full (" + u.role + ")", [C.SHAPES[u.role]], { "aria-keyshortcuts": "Enter", "data-rove": true, tabIndex: roving(uid) })
        sh.addEventListener("click", function () { openUnit(uid) })
      }
      r.ubox.replaceChild(sh, r.shape)
      r.shape = sh
      var ps = C.pieces(u, L), on = C.marked(S.store.marks, uid, ps)
      var words = el("span", { class: "body " + C.font(u, L) + (L === "takeaway" ? " tk4" : "") })
      var frag = document.createDocumentFragment()
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i], s = document.createElement("span")
        s.className = "pc " + p.tone + (p.kind ? " " + p.kind : "") + (on[p.id] ? " hl" : "")
        s.setAttribute("data-id", p.id)
        s.textContent = p.t
        frag.appendChild(s)
        if (p.sp) frag.appendChild(document.createTextNode(p.sp))
      }
      words.appendChild(frag)
      r.ubox.replaceChild(words, r.words)
      r.words = words
      drawMargin(uid)
      r.row.style.containIntrinsicSize = ""
    }
    // One paragraph's controls are Tab stops (the selected one's, else the first's): j and k move between paragraphs,
    // Tab into the one you're on, not through every paragraph's.
    function roving(uid) {
      if (!rove || !rows[rove] || !rows[rove].row.parentNode) rove = S.sel || (order || (order = rowsInOrder()))[0] || null
      return uid === rove ? 0 : -1
    }
    function setRove(uid) {
      if (!uid || uid === rove || !rows[uid]) return
      var was = rove
      rove = uid
      ;[was, uid].forEach(function (id) {
        if (!id || !rows[id]) return
        Array.prototype.forEach.call(rows[id].row.querySelectorAll("[data-rove]"), function (b) { b.tabIndex = id === uid ? 0 : -1 })
      })
    }
    function unitMarks(uid) { return S.store.marks.filter(function (k) { return k.unit === uid && !k.lost && (k.kind === "note" || k.kind === "ask") }) }
    function drawMargin(uid) {
      var r = rows[uid], L = unitLevel(uid)
      clear(r.aside)
      var cards = unitMarks(uid), inMargin = fitW.margin && ["full", "brief", "key"].indexOf(L) >= 0
      // (where the margin doesn't show them, at Takeaway or with no margin, a count stands for the notes)
      r.ncount.hidden = inMargin || !cards.length
      r.ncount.lastChild.textContent = String(cards.length)
      name(r.ncount, cards.length + (cards.length === 1 ? " note" : " notes") + (fitW.margin ? ": open the paragraph to see them" : S.marginOn ? ": the window is too narrow for the margin" : ": show the margin to see them"))
      r.aside.hidden = !fitW.margin
      r.aside.style.width = fitW.marginW + "px"
      if (!inMargin) return
      C.linksOf(S.m, uid).forEach(function (l) {
        var b = el("button", { type: "button", class: "mlink", title: "Go to " + (l.where || "it") + (l.topic ? ": " + l.topic : "") }, ["→ ", el("span", { class: "rel", text: l.rel }), " " + l.where + (l.topic ? " · " + l.topic : "")])
        b.setAttribute("aria-label", l.label.replace(/^→ /, ""))
        b.setAttribute("data-rove", "")
        b.tabIndex = roving(uid)
        b.addEventListener("click", function () { select(l.to, true) })
        r.aside.appendChild(b)
      })
      cards.forEach(function (k) { r.aside.appendChild(markCard(k)) })
    }
    function markCard(k) {
      var isAsk = k.kind === "ask", word = isAsk ? "question" : "note"
      var card = el("div", { class: "card", "data-mark": k.id })
      var x = el("button", { type: "button", class: "x", title: "Remove this " + word, "aria-label": "Remove this " + word, text: "✕" })
      card.appendChild(el("div", { class: "top" }, [icon(isAsk ? "chat" : "note", true), el("span", { text: isAsk ? "Ask" : "Note" }), x]))
      var q = k.quote.length > 140 ? k.quote.slice(0, 139) + "…" : k.quote
      if (q) card.appendChild(el("div", { class: "quote", text: "“" + q + "”" }))
      var ta = el("textarea", { rows: 2, placeholder: isAsk ? "Ask about this passage…" : "Your note…", "aria-label": isAsk ? "Ask" : "Note" })
      ta.value = k.text
      ta.addEventListener("input", function () { k.text = ta.value.slice(0, 20000); k.updated = new Date().toISOString(); saveMarks() })
      card.appendChild(ta)
      if (k.lost) card.appendChild(el("div", { class: "where", text: "Was in " + k.unit }))
      else if (k.from !== null && rows[k.unit] && !rows[k.unit].words.querySelector(rangeSel(k))) card.appendChild(el("div", { class: "where", text: "At Full and Brief" }))
      if (isAsk) card.appendChild(el("div", { class: "later", text: "Kept here: asking the chat from the reader comes in a later version" }))
      x.addEventListener("click", function () {
        if (!k.text.trim()) return removeMark(k.id)
        var ask = el("div", { class: "ask", role: "group", "aria-label": "Delete this " + word + "?" }, [el("span", { text: "Delete this " + word + "?" })])
        var yes = el("button", { type: "button", text: "Delete it" }), no = el("button", { type: "button", text: "Keep it" })
        yes.addEventListener("click", function () { removeMark(k.id) })
        no.addEventListener("click", function () { ask.remove(); x.focus() })
        ask.appendChild(yes); ask.appendChild(no)
        card.appendChild(ask)
        no.focus()
      })
      return card
    }
    function rangeSel(k) {
      var out = []
      for (var i = k.from; i <= k.to && out.length < 400; i++) out.push('[data-id="' + cssId(k.unit + ":" + i) + '"]')
      return out.join(",") || "x-none"
    }
    function drawLost() {
      var g = column.querySelector(".lostgroup")
      if (!g) return
      var lost = S.store.marks.filter(function (k) { return k.lost })
      clear(g)
      g.hidden = !lost.length
      g.style.width = fitW.marginW + "px"
      if (!lost.length) return
      g.appendChild(el("h3", { text: "Lost their place (" + lost.length + ")" }))
      lost.forEach(function (k) { g.appendChild(markCard(k)) })
    }

    // ---- Topic
    function drawGrid() {
      clear(grid)
      C.topicCards(S.m, S.showBack).forEach(function (c) {
        if (c.kind === "head") return grid.appendChild(el("div", { class: "thead" }, [c.num ? el("span", { class: "n", text: c.num }) : null, c.title]))
        if (c.kind === "back") {
          var b = el("button", { type: "button", "aria-expanded": c.expanded ? "true" : "false", id: "bBack" }, [el("span", { "aria-hidden": "true", text: c.label.charAt(0) }), " " + c.label.slice(2)])
          b.setAttribute("aria-label", c.label.slice(2))
          b.addEventListener("click", function () { S.showBack = !S.showBack; drawGrid(); var n = document.getElementById("bBack"); if (n) n.focus() })
          return grid.appendChild(el("div", { class: "tback" }, [b]))
        }
        var chips = el("div", { class: "chips" })
        c.chips.forEach(function (h) {
          var ch = el("button", { type: "button", class: "chip", title: "Open at Key", "data-u": h.unit }, [el("span", { class: "shape", "aria-hidden": "true", text: h.shape })])
          ch.setAttribute("aria-label", C.plainText(h.pieces) + ": open at Key")
          var on = C.marked(S.store.marks, h.unit, h.pieces)
          h.pieces.forEach(function (p) {
            ch.appendChild(el("span", { class: "pc" + (on[p.id] ? " hl" : ""), "data-id": p.id, text: p.t }))
            if (p.sp) ch.appendChild(document.createTextNode(p.sp))
          })
          ch.addEventListener("click", function () { setLevel("key", h.unit) })
          chips.appendChild(ch)
        })
        grid.appendChild(el("div", { class: "tcard", "data-s": c.id }, [el("div", { class: "tt" }, [c.num ? el("span", { class: "n", text: c.num }) : null, c.title]),
          c.takeaway ? el("div", { class: "take", text: c.takeaway }) : null, chips]))
      })
    }

    // ---- drawing a level: the near rows at once (and the morph), the rest in idle chunks
    function rowsInOrder() {
      var out = []
      S.m.sections.forEach(function (s) { s.units.forEach(function (id) { if (rows[id] && rows[id].row.parentNode) out.push(id) }) })
      return out
    }
    function band() { var cr = text.getBoundingClientRect(); return { top: cr.top - 300, bottom: cr.bottom + 300, cr: cr } }
    function snapshot() {
      var b = band(), rects = {}, n = 0
      var scope = S.level === "topic" ? [grid] : rowsInOrder().map(function (id) { return rows[id].row }).filter(function (row) {
        var r = row.getBoundingClientRect()
        return r.bottom > b.top && r.top < b.bottom
      })
      scope.forEach(function (box) {
        var ps = box.querySelectorAll("[data-id]")
        for (var i = 0; i < ps.length && n < 6000; i++) {
          var r = ps[i].getBoundingClientRect()
          if (r.bottom > b.top && r.top < b.bottom) { rects[ps[i].getAttribute("data-id")] = r; n++ }
        }
      })
      return { rects: rects, anchor: S.level === "topic" ? null : readingAnchor(b.cr) }
    }
    function readingAnchor(cr) {
      var line = cr.top + Math.min(140, cr.height * 0.25), ids = rowsInOrder()
      for (var i = 0; i < ids.length; i++) {
        var r = rows[ids[i]].row.getBoundingClientRect()
        if (r.bottom > line) return { uid: ids[i], off: r.top - cr.top }
      }
      return null
    }
    // (a kept paragraph still at the reading line's half of the pane: nothing scrolled it away since)
    function near(a) {
      var r = a && rows[a.uid] && rows[a.uid].row.parentNode && rows[a.uid].row.getBoundingClientRect()
      if (!r) return false
      var cr = text.getBoundingClientRect()
      return r.bottom > cr.top - 400 && r.top < cr.top + cr.height * 0.5
    }
    function keepAnchor(a) {
      if (!a || !rows[a.uid]) return
      var cr = text.getBoundingClientRect(), r = rows[a.uid].row.getBoundingClientRect()
      var d = r.top - cr.top - a.off
      if (Math.abs(d) >= 0.5) text.scrollTop += d
    }
    function animate(snap) {
      mark("fr:animate")
      if (!snap || reduced()) return 0
      var b = band(), n = 0
      var scope = S.level === "topic" ? [grid] : rowsInOrder().map(function (id) { return rows[id] }).filter(function (r) { return r.drawn }).map(function (r) { return r.row }).filter(function (row) {
        var r = row.getBoundingClientRect()
        return r.bottom > b.top && r.top < b.bottom
      })
      for (var k = 0; k < scope.length && n < 1500; k++) {
        var ps = scope[k].querySelectorAll("[data-id]")
        for (var i = 0; i < ps.length && n < 1500; i++) {
          var e = ps[i], r = e.getBoundingClientRect()
          if (r.bottom < b.top || r.top > b.bottom) continue
          var old = snap.rects[e.getAttribute("data-id")]
          if (old) {
            var dx = old.left - r.left, dy = old.top - r.top, s = r.height ? clamp(old.height / r.height, 0.6, 1.6) : 1
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(s - 1) < 0.02) continue
            e.animate([{ transform: "translate(" + dx + "px," + dy + "px) scale(" + s + ")" }, { transform: "none" }], { duration: 560, easing: "cubic-bezier(.22,.7,.2,1)" })
          } else {
            e.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: 560, easing: "ease-out" })
          }
          n++
        }
      }
      return n
    }
    // The near rows drawn now (the anchor's first, then up and down while they're within a screen of the pane), the
    // anchor kept at its place; the rest queued.
    function drawNear(anchor) {
      var ids = rowsInOrder(), at = anchor ? ids.indexOf(anchor.uid) : 0
      if (at < 0) at = 0
      ids.forEach(function (id) { rows[id].drawn = "" })
      if (!ids.length) return
      var cr = text.getBoundingClientRect(), h = cr.height
      drawUnit(ids[at])
      keepAnchor(anchor)
      for (var i = at + 1; i < ids.length; i++) {
        drawUnit(ids[i])
        if (rows[ids[i]].row.getBoundingClientRect().top > cr.bottom + h) break
      }
      for (var j = at - 1; j >= 0; j--) {
        drawUnit(ids[j])
        keepAnchor(anchor)
        if (rows[ids[j]].row.getBoundingClientRect().bottom < cr.top - h) break
      }
      keepAnchor(anchor)
      queue = ids.filter(function (id) { return !rows[id].drawn })
      anchorKeep = anchor
    }
    function drainSoon() {
      clearTimeout(chunkTimer)
      if (!queue.length) { settled(); return }
      chunkTimer = setTimeout(drain, 0)
    }
    function drain() {
      var t0 = performance.now()
      while (queue.length && performance.now() - t0 < 8) {
        var id = queue.shift()
        if (rows[id] && !rows[id].drawn) drawUnit(id)
      }
      keepAnchor(anchorKeep)
      drainSoon()
    }
    function settled() {
      var a = anchorKeep
      anchorKeep = null
      mark("fr:settled")
      // rows that come into view are laid out for real only when painted: the reading line's paragraph is put back
      // after the next two frames
      if (a) { holdAt(a, 1500); requestAnimationFrame(function () { keepAnchor(a); requestAnimationFrame(function () { keepAnchor(a) }) }) }
    }

    function setLevel(id, aim) {
      if (!S.m || !C.level(id)) return
      if (id === S.level && !aim) return
      mark("fr:level")
      closeMenu(false)
      hideBar()
      var snap = column.hidden && grid.hidden ? null : snapshot()
      if (aim) snap = { rects: snap ? snap.rects : {}, anchor: { uid: aim, off: 120 } }
      // (1 to 4 and back puts the paragraph back where it was: each change keeps the first change's paragraph, not the
      // one that happens to cross the line at a coarser level, until the reader scrolls)
      else if (snap && snap.anchor && !moved && near(levelAnchor)) snap.anchor = levelAnchor
      if (snap && snap.anchor) levelAnchor = snap.anchor
      moved = false
      var was = S.level
      S.opened = {}
      S.level = id
      if (aim) setSel(aim)
      prefs({ level: id })
      say(C.level(id).say)
      updateTools()
      drawFoot()
      columnLayout()
      if (id === "topic") {
        var from = snap && snap.anchor
        if (was !== "topic") S.fromTopic = from
        column.hidden = true; grid.hidden = false
        drawGrid()
        var card = from && S.m.units[from.uid] && grid.querySelector('.tcard[data-s="' + cssId(S.m.units[from.uid].section) + '"]')
        text.scrollTop = card ? Math.max(0, text.scrollTop + card.getBoundingClientRect().top - text.getBoundingClientRect().top - 16) : 0
        animate(snap)
        settled()
      } else {
        grid.hidden = true; column.hidden = false
        if (was === "topic" && !aim) snap = { rects: snap ? snap.rects : {}, anchor: S.fromTopic && rows[S.fromTopic.uid] ? S.fromTopic : null }
        if (was === "topic" && !(snap && snap.anchor)) text.scrollTop = 0
        if (was === "topic") levelAnchor = snap && snap.anchor
        drawNear(snap && snap.anchor)
        animate(snap)
        drainSoon()
      }
      drawPanes()
      if (aim) scrollPdfTo(aim, false)
    }
    function stepLevel(d) { setLevel(ORDER[clamp(ORDER.indexOf(S.level) + d, 0, ORDER.length - 1)]) }
    function redrawAll(keepPlace) {
      if (!S.m || column.hidden) return
      var a = keepPlace !== false ? readingAnchor(text.getBoundingClientRect()) : null
      drawNear(a)
      drainSoon()
    }

    // ---- opened in place, selection, follow
    function openUnit(uid) {
      if (!S.m || S.level === "topic") return
      var snap = snapshot()
      S.opened[uid] = true
      setSel(uid)
      drawUnit(uid)
      keepAnchor(snap.anchor)
      animate(snap)
      refreshMarks()
      quietUntil = Date.now() + 900
      scrollPdfTo(uid, true)
    }
    function foldBack(uid) {
      var ids = uid ? [uid] : Object.keys(S.opened)
      if (!ids.length) return false
      var snap = snapshot()
      ids.forEach(function (id) { delete S.opened[id]; drawUnit(id) })
      keepAnchor(snap.anchor)
      animate(snap)
      return true
    }
    function rowClass(uid) {
      var r = rows[uid]
      if (!r) return
      r.row.classList.toggle("sel", S.sel === uid)
      r.row.classList.toggle("fol", S.follow === uid && pdfShown())
    }
    // the selection (and the followed paragraph with it) moved: the rows' and boxes' classes of both, old and new
    function setSel(uid) {
      var before = [S.sel, S.follow]
      S.sel = uid; S.follow = uid
      before.concat([uid]).forEach(function (id) { if (id) { rowClass(id); boxClass(id) } })
      setRove(uid)
    }
    function select(uid, fromPdf) {
      if (!S.m || !S.m.units[uid]) return
      setSel(uid)
      if (S.level === "topic") return
      if (rows[uid] && !rows[uid].row.parentNode) setRole(null)
      quietUntil = Date.now() + 900 // (the PDF's scroll, or the text's, never moves follow off what was picked)
      if (fromPdf) scrollTextTo(uid)
      else scrollPdfTo(uid, true)
      pageLabel()
    }
    function scrollTextTo(uid) {
      var r = rows[uid]
      if (!r) return
      if (!r.drawn) drawUnit(uid)
      quietUntil = Date.now() + 900
      moved = true
      var cr = text.getBoundingClientRect(), d = r.row.getBoundingClientRect().top - cr.top - 110
      // near: a smooth scroll; far: a jump, the paragraph then kept at 110 px while the rows it passed draw
      if (Math.abs(d) <= text.clientHeight && !reduced()) return text.scrollTo({ top: text.scrollTop + d, behavior: "smooth" })
      text.scrollTop += d
      holdAt({ uid: uid, off: 110 }, 1200)
    }
    // A paragraph kept at its place in the pane while what is above it changes size (rows drawn, the window
    // resized), until the reader scrolls, types or clicks, or `ms` pass.
    function holdAt(a, ms) {
      hold = a ? { a: a, until: Date.now() + ms } : null
      if (a) keepAnchor(a)
    }
    function held() {
      if (!hold) return
      if (Date.now() > hold.until || column.hidden) { hold = null; return }
      quietUntil = Math.max(quietUntil, Date.now() + 150)
      keepAnchor(hold.a)
    }
    try { new ResizeObserver(held).observe(column) } catch (e) { /* (an old engine: the frames after settled() only) */ }
    ;["wheel", "pointerdown", "keydown", "touchstart"].forEach(function (t) { text.addEventListener(t, function () { hold = null }, { passive: true }) })
    var SCROLL_KEYS = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "j", "k"]
    text.addEventListener("wheel", function (e) { if (!e.metaKey && !e.ctrlKey) moved = true }, { passive: true })
    text.addEventListener("pointerdown", function () { moved = true }, { passive: true })
    text.addEventListener("touchstart", function () { moved = true }, { passive: true })
    document.addEventListener("keydown", function (e) { if (SCROLL_KEYS.indexOf(e.key) >= 0 && !e.metaKey) moved = true }, true)
    function stepSelect(d) {
      var ids = rowsInOrder()
      if (!ids.length || S.level === "topic") return
      var at = ids.indexOf(S.sel)
      var next = ids[at < 0 ? (d > 0 ? firstVisible(ids) : firstVisible(ids)) : clamp(at + d, 0, ids.length - 1)]
      select(next, false)
      var r = rows[next].row.getBoundingClientRect(), cr = text.getBoundingClientRect()
      if (r.top < cr.top || r.bottom > cr.bottom) { quietUntil = Date.now() + 900; text.scrollTo({ top: text.scrollTop + r.top - cr.top - 110, behavior: reduced() ? "auto" : "smooth" }) }
    }
    function firstVisible(ids) {
      var cr = text.getBoundingClientRect()
      for (var i = 0; i < ids.length; i++) if (rows[ids[i]].row.getBoundingClientRect().bottom > cr.top) return i
      return 0
    }
    // The paragraph at a line of the pane, from the rows' places as they are now (never kept: rows change size as they
    // draw, and a line height or a width changes them all); a binary search, a dozen rectangles read.
    function rowAt(y) {
      var ids = order || (order = rowsInOrder()), lo = 0, hi = ids.length - 1, at = -1
      while (lo <= hi) {
        var mid = (lo + hi) >> 1, r = rows[ids[mid]] && rows[ids[mid]].row.getBoundingClientRect()
        if (r && r.bottom > y) { at = mid; hi = mid - 1 } else lo = mid + 1
      }
      return at < 0 ? null : ids[at]
    }
    function onTextScroll() {
      hideBarIfGone()
      if (followTimer) return
      var wait = Math.max(0, 140 - (Date.now() - followAt))
      followTimer = setTimeout(function () { followTimer = null; followAt = Date.now(); readingOn() }, wait)
    }
    function readingOn() {
      if (Date.now() < quietUntil || !pdfShown() || S.level === "topic" || !S.m || column.hidden) return
      var uid = rowAt(text.getBoundingClientRect().top + text.clientHeight * 0.3)
      if (!uid || uid === S.follow) return
      var was = S.follow
      S.follow = uid
      ;[was, uid].forEach(function (id) { if (id) { rowClass(id); boxClass(id) } })
      scrollPdfTo(uid, false)
      pageLabel()
    }

    // ---- marks
    function clearSelection() { try { window.getSelection().removeAllRanges() } catch (e) { /* none */ } }
    function hideBar() { selbar.hidden = true; S.pick = null }
    function hideBarIfGone() { if (S.pick) { var ws = window.getSelection(); if (!ws || ws.isCollapsed) hideBar() } }
    function pickSelection() {
      var ws = window.getSelection && window.getSelection()
      if (!ws || ws.isCollapsed || !ws.rangeCount || !S.m || S.level === "topic") return null
      var range = ws.getRangeAt(0)
      if (!column.contains(range.commonAncestorContainer)) return null
      var node = function (n) { return n.nodeType === 1 ? n : n.parentElement }
      var a = node(range.startContainer), b = node(range.endContainer)
      var ra = a && a.closest("[data-u]"), rb = b && b.closest("[data-u]")
      if (!ra) return null
      var ids = [], ordered = rowsInOrder(), i0 = ordered.indexOf(ra.getAttribute("data-u")), i1 = rb ? ordered.indexOf(rb.getAttribute("data-u")) : i0
      for (var i = i0; i >= 0 && i <= Math.max(i0, i1); i++) {
        var ps = rows[ordered[i]].words.querySelectorAll("[data-id]")
        for (var j = 0; j < ps.length; j++) if (range.intersectsNode(ps[j])) ids.push(ps[j].getAttribute("data-id"))
      }
      if (!ids.length) return null
      var an = C.anchor(S.m, ids, ws.toString())
      if (!an) return null
      an.rect = range.getBoundingClientRect()
      return an
    }
    function showBar() {
      var p = pickSelection()
      if (!p) return hideBar()
      S.pick = p
      var cr = text.getBoundingClientRect()
      var top = Math.max(text.scrollTop + 4, text.scrollTop + p.rect.top - cr.top - 42)
      var left = clamp(p.rect.left - cr.left + p.rect.width / 2 - 140, 8, Math.max(8, text.clientWidth - 300))
      selbar.style.top = top + "px"
      selbar.style.left = left + "px"
      var on = C.highlighted(S.store.marks, p)
      bHl.disabled = !p.highlight
      bHl.setAttribute("aria-pressed", on ? "true" : "false")
      name(bHl, !p.highlight ? "Highlight the paper's words: at Full or Brief (1 or 2)" : on ? "Remove the highlight · h" : "Highlight · h")
      selbar.hidden = false
    }
    function now() { return new Date().toISOString() }
    function doHighlight() {
      var p = S.pick
      if (!p || !p.highlight) return
      var r = C.toggleHighlight(S.store, p, now())
      S.store = r.store
      clearSelection(); hideBar()
      refreshMarks(p.unit)
      saveMarks()
      flash(r.removed ? "Highlight removed" : "Highlighted")
    }
    function doNote(kind) {
      var p = S.pick
      if (!p) return
      var r = C.addMark(S.store, p, kind, now())
      S.store = r.store
      clearSelection(); hideBar()
      if (!fitW.margin) setMargin(true)
      if (unitLevel(p.unit) !== "full" && unitLevel(p.unit) !== "brief" && unitLevel(p.unit) !== "key") openUnit(p.unit)
      refreshMarks(p.unit)
      saveMarks()
      var ta = column.querySelector('[data-mark="' + r.mark.id + '"] textarea')
      if (ta) ta.focus()
      flash(kind === "ask" ? "Question kept in the margin" : "Note added: type it in the margin")
    }
    function removeMark(id) {
      var k = S.store.marks.filter(function (x) { return x.id === id })[0]
      S.store.marks = S.store.marks.filter(function (x) { return x.id !== id })
      refreshMarks(k && k.unit)
      saveMarks()
    }
    // a unit's highlights and margin drawn again (or every drawn unit's)
    function refreshMarks(uid) {
      var ids = uid ? [uid] : Object.keys(rows)
      ids.forEach(function (id) {
        var r = rows[id]
        if (!r || !r.drawn) return
        var ps = r.words.querySelectorAll("[data-id]"), list = []
        for (var i = 0; i < ps.length; i++) list.push({ id: ps[i].getAttribute("data-id") })
        var on = C.marked(S.store.marks, id, list)
        for (var j = 0; j < ps.length; j++) ps[j].classList.toggle("hl", !!on[ps[j].getAttribute("data-id")])
        drawMargin(id)
      })
      drawLost()
    }
    // (a change waiting to be posted posts the store as it is then: a reload in between keeps it, see load)
    function saveMarks() {
      clearTimeout(marksTimer)
      marksTimer = setTimeout(function () { post("marks", { marks: S.store }) }, 400)
    }

    // ---- panes
    // (asked for in so many words: shown even in a narrow window, the PDF and the margin narrower for it)
    function setMargin(on) {
      S.marginOn = !!on
      S.marginAsked = S.marginOn
      prefs({ margin: S.marginOn })
      fit(true)
    }
    function setMarginW(w) {
      S.marginW = clamp(Math.round(w), 160, 420)
      S.marginAsked = S.marginOn // (a width given is asked for: the PDF makes room)
      fit(true)
    }
    // What the window's width allows of the widths kept: the paper's words keep 420 px (the text pane less 110: its
    // padding, the bars' lane, the role shape). First the margin folds away (unless it was asked for), then the PDF
    // narrows (to 220), then the margin (to 160). The kept widths come back as the window widens.
    var NEED = 420
    function fit(force) {
      var paneW = panes.clientWidth || window.innerWidth || 1360, pdfOn = pdfShown()
      var body = function (pw, on, mw) { return Math.min(696, paneW - (pdfOn ? pw + 7 : 0) - 110 - (on ? mw + 24 : 0)) }
      var pw = S.pdfW, on = S.marginOn && !!S.m, mw = S.marginW
      if (body(pw, true, mw) >= NEED) S.marginAsked = false
      if (on && !S.marginAsked && body(pw, on, mw) < NEED) on = false
      if (pdfOn && body(pw, on, mw) < NEED) pw = Math.max(220, Math.min(pw, pw - (NEED - body(pw, on, mw))))
      if (on && body(pw, on, mw) < NEED) mw = Math.max(160, mw - (NEED - body(pw, on, mw)))
      var was = fitW
      if (!force && was.pdf === pw && was.margin === on && was.marginW === mw) return
      fitW = { pdf: pw, margin: on, marginW: mw }
      pdf.style.width = pw + "px"
      updateTools()
      if (!S.m || !column.firstChild) return
      columnLayout()
      Object.keys(rows).forEach(function (id) {
        var r = rows[id]
        r.row.classList.toggle("nomargin", !on)
        r.aside.style.width = mw + "px"
        if (r.drawn && (force || was.margin !== on)) drawMargin(id)
      })
    }
    function togglePdf() {
      if (bPdf && bPdf.disabled) return
      S.pdfOn = !S.pdfOn
      prefs({ pdf: S.pdfOn })
      drawPanes()
      updateTools()
      if (S.follow) rowClass(S.follow)
    }
    function setPdfW(w) { S.pdfW = clamp(Math.round(w), 300, 760); fit(); pageSrcs() }
    function drawPanes() {
      var shown = pdfShown()
      pdf.hidden = !shown
      grip.hidden = !shown
      text.style.order = S.pdfLeft ? 3 : 1
      grip.style.order = 2
      pdf.style.order = S.pdfLeft ? 1 : 3
      fit()
      updateTools()
    }
    // a divider: drag, ← → (⇧ farther), double-click resets
    function dragger(b, get, set, step, reset, key) {
      var start = null
      b.addEventListener("pointerdown", function (e) { try { b.setPointerCapture(e.pointerId) } catch (x) { /* synthetic */ } start = { x: e.clientX, w: get() }; e.preventDefault() })
      b.addEventListener("pointermove", function (e) { if (start) set(start.w, e.clientX - start.x) })
      var end = function () { if (start) { start = null; var o = {}; o[key] = get(); prefs(o) } }
      b.addEventListener("pointerup", end)
      b.addEventListener("pointercancel", end)
      b.addEventListener("keydown", function (e) {
        var d = e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : 0
        if (!d) return
        e.preventDefault(); e.stopPropagation()
        step(d * (e.shiftKey ? 80 : 20))
        var o = {}; o[key] = get(); prefs(o)
      })
      b.addEventListener("dblclick", function () { reset(); var o = {}; o[key] = get(); prefs(o) })
    }
    dragger(grip, function () { return fitW.pdf }, function (start, dx) { setPdfW(start + (S.pdfLeft ? 1 : -1) * dx) },
      function (d) { setPdfW(S.pdfW + (S.pdfLeft ? -d : d)) }, function () { setPdfW(470) }, "pdfWidth")

    // ---- the PDF pane
    var pageEls = []
    function cropOf(n) { return (S.links && S.links.crops && S.links.crops[n - 1]) || [0, 0, 1, 1] }
    function drawPdf() {
      clear(pbar); clear(pagesEl)
      pageEls = []
      var info = S.d && S.d.pdf
      if (!info) return
      var zo = button("zb", "Zoom the PDF out · ⌘ scroll", [icon("zoomout", true)], { "aria-keyshortcuts": "-" })
      var zl = el("span", { class: "zlabel", "aria-live": "off" })
      var zi = button("zb", "Zoom the PDF in · ⌘ scroll", [icon("zoomin", true)], { "aria-keyshortcuts": "=" })
      var zf = button("zb", "Fit the page width", [icon("fit", true)], { "aria-pressed": "true", "aria-keyshortcuts": "0" })
      zo.addEventListener("click", function () { zoomTo(S.zoom - 0.25) })
      zi.addEventListener("click", function () { zoomTo(S.zoom + 0.25) })
      zf.addEventListener("click", function () { zoomTo(1) })
      var pl = el("span", { class: "plabel" })
      var cov = el("span", { class: "cover" })
      var close = el("button", { type: "button", class: "pclose", title: "Hide the PDF · ⌥⌘P", "aria-label": "Hide the PDF · ⌥⌘P", text: "✕" })
      close.addEventListener("click", function () { togglePdf() })
      ;[zo, zl, zi, zf, cov, pl, close].forEach(function (x) { pbar.appendChild(x) })
      if (info.problem) {
        pagesEl.appendChild(el("div", { class: "pmsg", text: info.problem === "unreadable" ? "Couldn't open the PDF: " + (info.detail || "it can't be read") : PDF_PROBLEMS[info.problem] || info.problem }))
        ;[zo, zl, zi, zf].forEach(function (x) { x.hidden = true })
        updateZoom()
        return
      }
      for (var n = 1; n <= info.pages; n++) {
        var size = (info.sizes && info.sizes[n - 1]) || [612, 792]
        var sheet = el("div", { class: "sheet" })
        var img = el("img", { alt: "PDF page " + n, loading: "lazy", draggable: "false" })
        sheet.appendChild(img)
        var page = el("div", { class: "page", "data-n": n }, [sheet])
        pageEls.push({ n: n, page: page, sheet: sheet, img: img, size: size, w: 0 })
        pagesEl.appendChild(page)
      }
      layoutPages()
      drawBoxes()
      updateZoom()
      pageSrcs()
    }
    function layoutPages() {
      pageEls.forEach(function (p) {
        var c = cropOf(p.n), cw = Math.max(0.05, c[2] - c[0]), ch = Math.max(0.05, c[3] - c[1])
        p.page.style.width = (S.zoom * 100) + "%"
        p.page.style.aspectRatio = (cw * p.size[0]) + " / " + (ch * p.size[1])
        p.sheet.style.width = (100 / cw) + "%"
        p.sheet.style.height = (100 / ch) + "%"
        p.sheet.style.left = (-c[0] / cw * 100) + "%"
        p.sheet.style.top = (-c[1] / ch * 100) + "%"
      })
    }
    function pageSrcs() {
      var info = S.d && S.d.pdf
      if (!info || info.problem || !pageEls.length) return
      var paneW = Math.max(200, pagesEl.clientWidth - 20 || S.pdfW - 20), dpr = window.devicePixelRatio || 1
      pageEls.forEach(function (p) {
        var c = cropOf(p.n), want = paneW * dpr * S.zoom / Math.max(0.05, c[2] - c[0])
        var w = BUCKETS[BUCKETS.length - 1]
        for (var i = 0; i < BUCKETS.length; i++) if (BUCKETS[i] >= want) { w = BUCKETS[i]; break }
        if (w <= p.w) return
        p.w = w
        p.img.src = String(info.urlPattern || "").split("{n}").join(String(p.n)).split("{w}").join(String(w))
      })
    }
    function firstWords(uid) {
      var u = S.m.units[uid], idx = C.headWords(u.toks, 6)
      return idx.map(function (i) { return u.toks[i].t + (u.toks[i].s && i !== idx[idx.length - 1] ? " " : "") }).join("")
    }
    function drawBoxes() {
      pageEls.forEach(function (p) { Array.prototype.slice.call(p.sheet.querySelectorAll(".bx")).forEach(function (b) { b.remove() }) })
      boxEls = {}
      if (!S.links || !S.m) return
      S.m.order.forEach(function (uid) {
        var e = S.links.map[uid]
        if (!e) return
        boxEls[uid] = []
        e.boxes.forEach(function (b, k) {
          var p = pageEls[(b[4] || e.page) - 1]
          if (!p) return
          var bt = el("button", { type: "button", class: "bx", "data-u": uid, "data-k": k, "aria-label": "Go to this paragraph: " + firstWords(uid), title: "Go to this paragraph: " + firstWords(uid) })
          bt.tabIndex = -1
          bt.style.left = (b[0] * 100) + "%"; bt.style.top = (b[1] * 100) + "%"
          bt.style.width = ((b[2] - b[0]) * 100) + "%"; bt.style.height = ((b[3] - b[1]) * 100) + "%"
          bt.addEventListener("click", function () { select(uid, true) })
          p.sheet.appendChild(bt)
          boxEls[uid].push(bt)
        })
        boxClass(uid)
      })
      boxRove = null
      roveBox(S.sel || S.follow)
    }
    // The boxes are one Tab stop (the selected or followed paragraph's first box, else the first): ↑ ↓ go through them.
    var boxRove = null
    function roveBox(uid) {
      if (!uid || !boxEls[uid]) uid = boxRove && boxEls[boxRove] ? boxRove : S.m && S.m.order.filter(function (u) { return boxEls[u] && boxEls[u].length })[0]
      if (!uid || uid === boxRove && boxEls[uid][0].tabIndex === 0) return
      if (boxRove && boxEls[boxRove]) boxEls[boxRove].forEach(function (b) { b.tabIndex = -1 })
      boxRove = uid
      boxEls[uid][0].tabIndex = 0
    }
    pagesEl.addEventListener("keydown", function (e) {
      var t = e.target
      if (!t.classList || !t.classList.contains("bx") || (e.key !== "ArrowDown" && e.key !== "ArrowUp") || e.altKey || e.metaKey) return
      e.preventDefault()
      var ids = S.m.order.filter(function (u) { return boxEls[u] && boxEls[u].length }), at = ids.indexOf(t.getAttribute("data-u"))
      var next = ids[clamp(at + (e.key === "ArrowDown" ? 1 : -1), 0, ids.length - 1)]
      roveBox(next)
      boxEls[next][0].focus()
    })
    function boxClass(uid) {
      if (uid && (uid === S.sel || (!S.sel && uid === S.follow))) roveBox(uid)
      ;(boxEls[uid] || []).forEach(function (b) { b.classList.toggle("sel", S.sel === uid); b.classList.toggle("fol", S.follow === uid && S.sel !== uid) })
    }
    function scrollPdfTo(uid, always) {
      var bs = boxEls[uid]
      if (!bs || !bs.length || !pdfShown()) return
      var pr = pagesEl.getBoundingClientRect(), br = bs[0].getBoundingClientRect()
      if (!always) {
        var last = bs[bs.length - 1].getBoundingClientRect()
        if (br.top >= pr.top && last.bottom <= pr.bottom) return
      }
      pagesEl.scrollTo({ top: pagesEl.scrollTop + br.top - pr.top - pr.height * 0.18, behavior: reduced() ? "auto" : "smooth" })
    }
    function zoomTo(z) {
      var nz = Math.round(clamp(z, 1, 3) * 100) / 100
      if (nz === S.zoom) return
      S.zoom = nz
      prefs({ pdfZoom: S.zoom })
      layoutPages()
      updateZoom()
      pageSrcs()
    }
    function updateZoom() {
      var zl = pbar.querySelector(".zlabel"), zf = pbar.querySelector('[aria-label="Fit the page width"]')
      var none = !(S.d && S.d.pdf) || !!S.d.pdf.problem
      if (zl) zl.textContent = none ? "" : S.zoom === 1 ? "Fit" : Math.round(S.zoom * 100) + "%"
      if (zf) zf.setAttribute("aria-pressed", S.zoom === 1 ? "true" : "false")
      coverage()
      pageLabel()
    }
    function coverage() {
      var cov = pbar.querySelector(".cover")
      if (!cov) return
      var info = S.d && S.d.pdf
      cov.className = "cover"
      if (S.wordsDone && S.links && S.links.noText) { cov.className = "cover warn"; cov.textContent = "This PDF has no text layer (a scan): the panes can't be linked, but you can read both"; cov.removeAttribute("title"); return }
      if (!S.links || !S.links.coverage || !S.m || (info && info.problem)) { cov.textContent = ""; return }
      var c = S.links.coverage, short = "Linked " + c.linked + " of " + c.total + " paragraphs"
      cov.title = short
      if (C.coverageText(c) !== short) { cov.className = "cover warn"; cov.textContent = C.coverageText(c) } else cov.textContent = c.linked + " of " + c.total + " linked"
      cov.setAttribute("aria-label", C.coverageText(c))
    }
    function pageLabel() {
      var pl = pbar.querySelector(".plabel"), info = S.d && S.d.pdf
      if (!pl || !info || info.problem) return
      var cur = S.sel || S.follow, e = cur && S.links && S.links.map[cur], n = e ? e.page : 1
      if (!e) {
        var top = pagesEl.scrollTop
        for (var i = 0; i < pageEls.length; i++) if (pageEls[i].page.offsetTop + pageEls[i].page.offsetHeight > top) { n = pageEls[i].n; break }
      }
      pl.textContent = "p. " + n + " of " + info.pages
    }

    // ---- keys and the wheel
    function typing(t) { return t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable) }
    function onKey(e) {
      var t = e.target
      if (e.key === "F1" || (e.key === "?" && !typing(t))) { e.preventDefault(); S.keys = !S.keys; keysEl.hidden = !S.keys; return }
      if (e.key === "Escape") {
        if (S.keys) { S.keys = false; keysEl.hidden = true; e.preventDefault(); return }
        if (S.menu) { closeMenu(true); e.preventDefault(); return }
        if (typing(t)) { t.blur(); text.focus({ preventScroll: true }); return }
        if (S.pick || !selbar.hidden) { clearSelection(); hideBar(); e.preventDefault(); return }
        if (foldBack()) { e.preventDefault(); return }
        return
      }
      if (typing(t)) return
      if (e.altKey && e.metaKey && !e.ctrlKey && (e.code === "KeyP" || e.code === "KeyM")) { e.preventDefault(); if (e.code === "KeyP") togglePdf(); else setMargin(!fitW.margin); return }
      if (e.altKey && !e.metaKey && !e.ctrlKey && (e.key === "ArrowRight" || e.key === "ArrowLeft") && S.d) {
        if (t && (t.id === "grip" || (t.classList && t.classList.contains("mgrip")))) return
        e.preventDefault()
        var d = e.key === "ArrowRight" ? 1 : -1
        if (e.shiftKey) cycleTask(d); else cycleStatus(d)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      var inPdf = pdf.contains(t)
      if (/^[1-5]$/.test(e.key)) { e.preventDefault(); setLevel(ORDER[Number(e.key) - 1]); return }
      if (inPdf && (e.key === "-" || e.key === "=" || e.key === "+" || e.key === "0")) { e.preventDefault(); zoomTo(e.key === "0" ? 1 : S.zoom + (e.key === "-" ? -0.25 : 0.25)); return }
      if ((t === text || text.contains(t)) && (e.key === "-" || e.key === "=" || e.key === "+")) { e.preventDefault(); stepLevel(e.key === "-" ? 1 : -1); return }
      if (!selbar.hidden && S.pick) {
        if (e.key === "h") { e.preventDefault(); doHighlight(); return }
        if (e.key === "n") { e.preventDefault(); doNote("note"); return }
        if (e.key === "c") { e.preventDefault(); doNote("ask"); return }
      }
      if (e.key === "j" || e.key === "k") { e.preventDefault(); stepSelect(e.key === "j" ? 1 : -1); return }
      if (e.key === "Enter" && S.sel && (t === text || t === document.body || !t || t.tagName !== "BUTTON")) { e.preventDefault(); openUnit(S.sel); return }
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("keydown", function (e) { if (e.key === "Tab" || e.key.indexOf("Arrow") === 0) root.classList.add("kbd") }, true)
    document.addEventListener("pointerdown", function () { root.classList.remove("kbd") }, true)
    text.addEventListener("wheel", function (e) {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      wheelAcc += e.deltaY
      if (Math.abs(wheelAcc) >= 70) { var d = wheelAcc > 0 ? 1 : -1; wheelAcc = 0; stepLevel(d) }
    }, { passive: false })
    pagesEl.addEventListener("wheel", function (e) {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoomTo(S.zoom - e.deltaY / 400)
    }, { passive: false })
    var pdfScrollTimer = null
    pagesEl.addEventListener("scroll", function () { if (!pdfScrollTimer) pdfScrollTimer = setTimeout(function () { pdfScrollTimer = null; if (!S.sel && !S.follow) pageLabel() }, 140) })
    text.addEventListener("scroll", onTextScroll)
    text.addEventListener("mouseup", function () { setTimeout(showBar, 0) })
    bHl.addEventListener("click", doHighlight)
    bNote.addEventListener("click", function () { doNote("note") })
    bAsk.addEventListener("click", function () { doNote("ask") })
    document.addEventListener("mousedown", function (e) {
      if (S.menu && menuEl && !menuEl.contains(e.target) && !(e.target.closest && e.target.closest(".pill"))) closeMenu(false)
      if (!selbar.contains(e.target) && !selbar.hidden) hideBar()
    })
    window.addEventListener("resize", function () { moved = true; fit(); pageSrcs() })

    function setRole(r) {
      S.role = r
      updateTools()
      if (!S.m) return
      placeRows()
      rowsInOrder().forEach(function (id) { if (!rows[id].drawn) queue.push(id) })
      drainSoon()
    }

    // ---- the app's calls
    function applyPrefs(p) {
      if (!p) return
      if (ORDER.indexOf(p.level) >= 0) S.level = p.level
      if (typeof p.pdf === "boolean") S.pdfOn = p.pdf
      if (typeof p.pdfLeft === "boolean") S.pdfLeft = p.pdfLeft
      if (typeof p.pdfWidth === "number") S.pdfW = clamp(p.pdfWidth, 300, 760)
      if (typeof p.margin === "boolean") S.marginOn = p.margin
      if (typeof p.marginWidth === "number") S.marginW = clamp(p.marginWidth, 160, 420)
      if (typeof p.pdfZoom === "number") S.zoom = clamp(p.pdfZoom, 1, 3)
    }
    function docIdentity() { return S.m ? { id: S.m.id, lang: S.m.lang, levels_made: S.m.provenance.levelsMade } : null }
    function pdfIdentity() { var p = S.d && S.d.pdf; return p && !p.problem ? { bytes: p.bytes || 0, modified: p.modified || "", pages: p.pages } : null }
    // FR.load: the app sends the whole window again whenever something of it changes (the PDF opened, TextFold's answer,
    // ⌘R, a fold done). The same paper keeps what the reader did: the marks held here (the file can be behind them, a
    // change is posted 400 ms later), the level, and with the same doc the paragraphs opened, the selection and the
    // place in the text; a new doc of it keeps the place where its paragraph is still there.
    function load(o) {
      mark("fr:loaded")
      var d = o || {}, paper = d.paper || {}, pid = (paper.libraryID || 1) + ":" + (paper.key || "")
      var same = !!S.d && S.paperId === pid
      var m = null, st = d.state || { kind: d.doc ? "ready" : "loading" }
      if (d.doc) { var mm = C.model(d.doc); if (mm.problem) st = mm.problem; else m = mm }
      var prevM = S.m, sameDoc = same && !!prevM && !!m && prevM.id === m.id && prevM.lang === m.lang && prevM.provenance.levelsMade === m.provenance.levelsMade &&
        prevM.provenance.local === m.provenance.local && prevM.order.length === m.order.length
      var pdfSame = same && JSON.stringify((S.d && S.d.pdf) || null) === JSON.stringify(d.pdf || null)
      var keep = same && !!prevM && !column.hidden ? readingAnchor(text.getBoundingClientRect()) : null
      var mine = same && S.storeOwn ? S.store : null
      S.d = d; S.state = st; S.paperId = pid
      if (!same) applyPrefs(d.prefs) // (a reload keeps the page's own: it sent them)
      if (sameDoc) S.m = prevM
      else {
        S.m = m
        S.opened = {}
        if (!(m && S.sel && m.units[S.sel])) { S.sel = null; S.follow = null }
      }
      if (!same) { S.opened = {}; S.sel = null; S.follow = null; S.role = null }
      // (the link map is the payload's, else the words' that follow it: the app sends them again when it has none)
      S.pick = null; S.pages = []; S.wordsDone = false; S.links = null
      var empty = function () { return C.emptyStore({ paper: pid, doc: S.m ? { id: S.m.id, lang: S.m.lang } : {} }) }
      if (S.m) {
        if (!(sameDoc && mine)) {
          var from = mine && mine.marks.length ? mine : d.marks
          if (from) {
            var re = C.reanchor(S.m, from)
            S.store = re.store
            S.store.paper = S.store.paper || pid
            S.store.doc = { id: S.m.id, lang: S.m.lang }
            if (re.moved || from === mine) saveMarks()
          } else S.store = empty()
        }
        S.storeOwn = true
      } else if (!mine) S.store = empty()
      if (S.m && !S.links && d.links && C.linksValid(d.links, docIdentity(), pdfIdentity())) {
        var l = d.links
        S.links = { map: l.map, crops: l.crops, coverage: l.coverage, warn: l.coverage.total > 0 && l.coverage.linked / l.coverage.total < 0.3 }
        S.wordsDone = true
      }
      drawHeader()
      drawTools()
      drawFoot()
      drawState()
      if (!same) text.scrollTop = 0
      if (S.m && !sameDoc) {
        rows = {}
        fit()
        buildColumn()
        if (S.level === "topic") { column.hidden = true; grid.hidden = false; drawGrid(); settled() } else {
          grid.hidden = true; column.hidden = false
          if (!keep || !rows[keep.uid]) { text.scrollTop = 0; keep = null }
          drawNear(keep); drainSoon()
        }
        if (S.sel) setSel(S.sel)
      } else if (S.m && sameDoc) {
        if (S.level === "topic") { column.hidden = true; grid.hidden = false } else { grid.hidden = true; column.hidden = false }
      }
      drawPanes()
      if (!pdfSame || !pageEls.length) drawPdf()
      else { layoutPages(); drawBoxes(); updateZoom() }
      try { requestAnimationFrame(function () { mark("fr:painted") }) } catch (e) { mark("fr:painted") }
      if (!same && !text.contains(document.activeElement)) text.focus({ preventScroll: true })
    }
    function state(s) {
      S.state = s || { kind: "loading" }
      drawState()
    }
    function words(batch) {
      if (!batch || S.wordsDone) return
      ;(batch.pages || []).forEach(function (p) { S.pages.push(p) })
      if (!batch.done) return
      S.wordsDone = true
      var info = S.d && S.d.pdf
      if (!info || info.problem) return
      var count = info.pages, sizes = info.sizes || []
      if (S.m) {
        var r = C.linkMap(S.m, S.pages, sizes)
        S.links = r
        post("links", { links: C.linksFile(S.m, r, pdfIdentity()) })
      } else {
        var any = S.pages.some(function (p) { return (p.words || []).length })
        S.links = { map: {}, crops: C.crops(S.pages, count), coverage: null, noText: !any }
      }
      S.pages = []
      layoutPages()
      drawBoxes()
      pageSrcs()
      updateZoom()
      if (S.sel) boxClass(S.sel)
      if (S.sel || S.follow) scrollPdfTo(S.sel || S.follow, false)
    }
    function paper(o) {
      if (!S.d || !o) return
      if (o.status) S.d.status = o.status
      if ("task" in o) S.d.task = o.task
      if (o.taxonomies) S.d.taxonomies = o.taxonomies
      drawHeader()
    }

    drawFoot()
    drawTools()
    drawState()
    drawPanes()
    post("ready")
    return { load: load, state: state, words: words, paper: paper, flash: flash, _S: S }
  }

  return { mount: mount, SHARED: SHARED, OWN: OWN, STATES: STATES, stateCopy: stateCopy }
})()
