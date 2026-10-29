// Glue's wrappers for the settings pages (Settings.js, row = Views.listRow) and saving them, as
// ZoteroSearch.qml's settingsState, settingsRows, settingsIndex and Service.qml's saveSettings do,
// with what the Mac knows. Merged into Glue (Glue.js); JSON in, JSON out.
function GlueSettings(V, C, T, P, S) {
  var L = V.listRow

  // ZoteroSearch.qml's settingsState. ctx (from Swift): { bridge, styles, stylesProblem, info (the
  // runner's providers), models ({ models, groups }), defaults ({ prompts, chat }), tests, runner
  // ({ installed, installing, update: { installed, bundled } | null }), reqs ({ node, pdftotext }),
  // setup ({ zotero, running, node, pdftotext }), rules, instructions, prompts, taxonomies, extract }.
  // Settings › Defaults › Processes (the Mac's): how many background processes of each kind run together.
  function processesRow(state, L) {
    var n = ((state.settings && state.settings.defaults) || {}).processesAtOnce || 1
    return L({ section: "Processes", rowId: "set-edit", value: "defaults.processesAtOnce", icon: S.ICON.defaults, label: "Processes at once", available: true, submenu: true,
      detail: n + " at a time on this Mac · extraction, tagging and prompts on new papers; a catch-up runs one at a time, a prompt you run yourself never waits" })
  }

  // ---- catching up (the Mac's): what each catch-up checks, the plan's argv, the jobs a plan holds, the question when
  // the app opens and its page (macos/docs/superpowers/specs/2026-10-18-resize-and-catch-up-on-launch.md)

  var LAUNCH_SWITCHES = ["text", "taxonomies", "changedTaxonomies", "changedPrompts"]

  // The prompts' ids that still name a prompt (prompts: the runner's list, null while it's read: kept as they are).
  function existing(ids, prompts) {
    return (ids || []).filter(function (id) { return !prompts || prompts.some(function (p) { return p.id === id }) })
  }

  // What the app's opening checks, a key left out following its default: New papers' text, taxonomies and prompts;
  // the changed taxonomies and prompts off. → { text, taxonomies, changedTaxonomies, changedPrompts, prompts: [ids] }
  function launchWhat(settings, prompts) {
    var d = (settings && settings.defaults) || {}
    var w = d.launchCatchUpWhat || {}
    return { text: typeof w.text === "boolean" ? w.text : !!d.autoExtractNew, taxonomies: typeof w.taxonomies === "boolean" ? w.taxonomies : !!d.autoTagNew,
      changedTaxonomies: w.changedTaxonomies === true, changedPrompts: w.changedPrompts === true, prompts: existing(Array.isArray(w.prompts) ? w.prompts : d.autoPrompts, prompts) }
  }

  // One of its switches changed (field: text, taxonomies, changedTaxonomies, changedPrompts, prompt:<id>): the new
  // defaults.launchCatchUpWhat, that key written, the others left as they were (still following their defaults).
  function launchWhatToggled(settings, prompts, field) {
    var d = (settings && settings.defaults) || {}
    var now = launchWhat(settings, prompts)
    var out = JSON.parse(JSON.stringify(d.launchCatchUpWhat || {}))
    var m = /^prompt:(.+)$/.exec(String(field))
    if (m) {
      var on = now.prompts.indexOf(m[1]) >= 0
      out.prompts = on ? now.prompts.filter(function (id) { return id !== m[1] }) : now.prompts.concat([m[1]])
    } else if (LAUNCH_SWITCHES.indexOf(field) >= 0) out[field] = !now[field]
    return out
  }

  // A list's words: "a, b and c".
  function listed(xs) { return xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1] }
  function titleOf(prompts, id) {
    var p = (prompts || []).filter(function (x) { return x.id === id })[0]
    return "“" + (p ? p.title : id) + "”"
  }

  // What it checks, in words ("" for nothing).
  function launchWhatText(settings, prompts) {
    var w = launchWhat(settings, prompts)
    return listed([w.text ? "their text" : "", w.taxonomies ? "their taxonomies" : ""].concat(w.prompts.map(function (id) { return titleOf(prompts, id) }),
      [w.changedTaxonomies ? "taxonomies that changed" : "", w.changedPrompts ? "prompts that changed" : ""]).filter(function (x) { return x }))
  }

  // catchup-plan's argv for a kind: "all" (the counts Bring papers up to date shows), "taxonomies", "prompts",
  // "recent" (Catch up the last N days: what New papers runs), "launch" (what the app's opening checks); since: Zotero's
  // date catchUpDays ago. → [] when the kind checks nothing.
  function planArgs(settings, kind, prompts, since) {
    var d = (settings && settings.defaults) || {}
    var mode = function (k) { return d[k] === "replace" ? "replace" : "missing" }
    var w = kind === "launch" ? launchWhat(settings, prompts)
      : { text: !!d.autoExtractNew, taxonomies: !!d.autoTagNew, prompts: existing(d.autoPrompts, prompts), changedTaxonomies: true, changedPrompts: true }
    var stale = { taxonomies: kind === "all" || kind === "taxonomies" || (kind === "launch" && w.changedTaxonomies),
      prompts: kind === "all" || kind === "prompts" || (kind === "launch" && w.changedPrompts) }
    var recent = kind === "all" || kind === "recent" || (kind === "launch" && (w.text || w.taxonomies || w.prompts.length > 0))
    if (!stale.taxonomies && !stale.prompts && !recent) return []
    return ["catchup-plan"].concat(stale.taxonomies ? ["--stale-taxonomies"] : [], stale.prompts ? ["--stale-prompts"] : [],
      recent ? ["--since", String(since)].concat(w.taxonomies ? ["--tag"] : [], w.text ? ["--extract"] : [], w.prompts.length ? ["--prompts", w.prompts.join(",")] : []) : [],
      ["--prompts-mode", mode("catchUpPrompts"), "--tag-mode", mode("catchUpTaxonomies")])
  }

  // A plan's jobs for a kind (launch: every part it holds, the papers added lately first), each once (a paper tagged
  // twice: once, by the taxonomies of both), the extractions skipped before (scans, large PDFs) left out.
  function planJobs(plan, kind, skipped) {
    var parts = kind === "launch" ? ["recent", "taxonomies", "prompts"] : [kind]
    var out = [], at = {}
    parts.forEach(function (k) {
      ;((plan && plan[k] && plan[k].jobs) || []).forEach(function (j) {
        if (j.op === "extract" && skipped && Object.prototype.hasOwnProperty.call(skipped, j.id)) return
        var key = j.id + "|" + j.op + "|" + (j.prompt || "")
        if (at[key] === undefined) { at[key] = out.length; out.push(JSON.parse(JSON.stringify(j))); return }
        var was = out[at[key]]
        if (j.op === "classify") { // (all of them when either asks for all)
          if (!was.only || !j.only) delete was.only
          else j.only.forEach(function (t) { if (was.only.indexOf(t) < 0) was.only.push(t) })
        }
      })
    })
    return out
  }

  function papersIn(jobs) {
    var seen = {}
    jobs.forEach(function (j) { seen[j.id] = true })
    return Object.keys(seen).length
  }

  // The question when the app opens. → null (nothing to do), or { title, yes, no, detail, noDetail, jobs, papers }
  function launchAsk(plan, settings, prompts, skipped) {
    var jobs = planJobs(plan, "launch", skipped)
    if (!jobs.length) return null
    var d = (settings && settings.defaults) || {}
    var days = d.catchUpDays || 30
    var n = function (k, one, many) { return k + " " + (k === 1 ? one : many) }
    var recent = planJobs(plan, "recent", skipped)
    var of = function (test) { return recent.filter(test).length }
    var promptIds = []
    recent.forEach(function (j) { if (j.op === "prompt" && promptIds.indexOf(j.prompt) < 0) promptIds.push(j.prompt) })
    // "3 papers need their text, 2 their taxonomies, 4 “Summary”" (the first says what the counts are)
    var counts = [[of(function (j) { return j.op === "extract" }), "their text"], [of(function (j) { return j.op === "classify" }), "their taxonomies"]]
      .concat(promptIds.map(function (id) { return [of(function (j) { return j.op === "prompt" && j.prompt === id }), titleOf(prompts, id)] }))
      .filter(function (c) { return c[0] > 0 })
    var added = counts.map(function (c, i) { return i ? c[0] + " " + c[1] : c[0] + (c[0] === 1 ? " paper needs " : " papers need ") + c[1] })
    var tax = papersIn(planJobs(plan, "taxonomies", skipped)), notes = planJobs(plan, "prompts", skipped).length
    var parts = [added.length ? "Added in the last " + n(days, "day", "days") + ": " + added.join(", ") : "",
      tax ? n(tax, "paper", "papers") + " tagged by an older taxonomy" : "", notes ? n(notes, "note", "notes") + " from an older prompt" : ""].filter(function (x) { return x })
    var papers = papersIn(jobs)
    return { title: "Bring " + n(papers, "paper", "papers") + " up to date?", yes: "Bring " + (papers === 1 ? "it" : "them") + " up to date (in Processes)", no: "Not now",
      detail: parts.join(" · "), noDetail: "Settings › Defaults › Ask to catch up when the app opens turns this question off", jobs: jobs.length, papers: papers }
  }

  // Settings › Defaults › When the app opens: ask, and what it checks (after Bring papers up to date).
  function launchRows(state, L) {
    var d = state.settings.defaults || {}
    var am = state.automation
    var away = am && am.host && !am.here ? " · on “" + am.host + "”, the machine automation runs on" : ""
    var on = d.launchCatchUp !== false
    var what = launchWhatText(state.settings, state.prompts)
    return [L({ section: "When the app opens", rowId: "set-toggle", value: "defaults.launchCatchUp", icon: on ? S.ICON.on : S.ICON.off, checked: on, available: true,
      label: "Ask to catch up when the app opens", detail: (on ? "On" : "Off") + " · as it starts, the app checks the papers (What the app checks when it opens) and asks before bringing them up to date; nothing to do, nothing asked" + away }),
      L({ section: "When the app opens", rowId: "set-nav", value: "launch-catchup", icon: S.ICON.defaults, label: "What the app checks when it opens", submenu: true, available: true,
        detail: what ? what.charAt(0).toUpperCase() + what.slice(1) : "Nothing: no question when the app opens (turn one on)" })]
  }

  // Settings › Defaults › What it checks: each switch of defaults.launchCatchUpWhat.
  function launchPage(state, L) {
    var d = state.settings.defaults || {}
    var w = launchWhat(state.settings, state.prompts)
    var lw = d.launchCatchUpWhat || {}
    var days = d.catchUpDays || 30
    var sec = "Papers added in the last " + days + " " + (days === 1 ? "day" : "days")
    var follows = function (k, name) { return typeof lw[k] === "boolean" ? "" : " (as " + name + ", until you change it)" }
    var sw = function (section, k, label, detail) {
      return L({ section: section, rowId: "set-toggle", value: "defaults.launchCatchUpWhat." + k, icon: w[k] ? S.ICON.on : S.ICON.off, checked: w[k], available: true, label: label,
        detail: (w[k] ? "On" : "Off") + " · " + detail })
    }
    var rows = [sw(sec, "text", "Their text", "extracted where a paper with a PDF has none" + follows("text", "Extract new papers' text")),
      sw(sec, "taxonomies", "Their taxonomies", "tagged where a taxonomy is missing" + (d.catchUpTaxonomies === "replace" ? " or there (Replace them)" : "") + follows("taxonomies", "Tag new papers by taxonomies"))]
    var replace = d.catchUpPrompts === "replace"
    ;(state.prompts || []).forEach(function (p) {
      var on = w.prompts.indexOf(p.id) >= 0
      rows.push(L({ section: sec, rowId: "set-auto-prompt", value: "launch:" + p.id, icon: S.ICON.model, showCheck: true, checked: on, available: true, label: p.title,
        detail: (on ? "On" : "Off") + " · run where it hasn't run" + (replace ? ", and again where it has (Replace them)" : "") + (Array.isArray(lw.prompts) ? "" : " (as Prompts to run on new papers, until you change one)") }))
    })
    var noRunner = state.runner && state.runner.installed === false
    if (!(state.prompts || []).length) rows.push(L({ section: sec, rowId: "set-info", icon: S.ICON.info, available: false,
      label: state.prompts ? "No prompts yet" : noRunner ? "No prompts: the AI features aren't installed" : "Reading your prompts…",
      detail: noRunner && !state.prompts ? "Settings › Setup installs the AI features" : "Prompts it can check show here" }))
    rows.push(sw("Every paper", "changedTaxonomies", "Taxonomies that changed", "papers tagged by an older version of a taxonomy are tagged again"),
      sw("Every paper", "changedPrompts", "Prompts that changed", "notes and artifacts from an older version of their prompt are made again (a new note beside the old one); it can cost a lot"))
    return rows
  }

  // Settings › General's first rows on a Mac: how the hotkey opens the launcher, and whether the app is in the Dock
  // (this Mac's own, x.openAsWindow and x.dock; each none when it isn't given).
  function windowRows(x) {
    var rows = []
    var badge = x.machineOnly ? "this machine" : ""
    if (typeof x.openAsWindow === "boolean") {
      var on = x.openAsWindow
      rows.push(L({ section: "The launcher", rowId: "set-toggle", value: "mac.openAsWindow", icon: on ? S.ICON.on : S.ICON.off, checked: on, available: true,
        label: "Open as a window", badge: badge,
        detail: on ? "On · the hotkey opens a regular window: it stays when you click away, and window managers such as Raycast's can move and tile it; W switches to the overlay"
          : "Off · the hotkey opens the overlay: over any app, even full screen, gone when you click away; W switches to a window" }))
    }
    if (typeof x.dock === "boolean") {
      var dock = x.dock
      rows.push(L({ section: "The launcher", rowId: "set-toggle", value: "mac.dock", icon: dock ? S.ICON.on : S.ICON.off, checked: dock, available: true,
        label: "In the Dock and ⌘Tab", badge: badge,
        detail: dock ? "On · the app has a Dock icon and is in ⌘Tab: clicking it (or switching to it) opens the launcher"
          : "Off · only the menu bar's icon and the hotkey: no Dock icon, not in ⌘Tab" }))
    }
    return rows
  }

  // Settings › General › Appearance on a Mac: the theme and light or dark, this Mac's own (x.theme: { id, mode, safe, themes:
  // [{ id, name, light, dark, swatch }] }, the app's list; none when it isn't given). Each opens its choices; the colour-blind
  // safe colours are a switch.
  var THEME_MODES = [["system", "As the Mac · light or dark as System Settings › Appearance says"], ["light", "Light · always"], ["dark", "Dark · always"]]
  function themeText(f) {
    return f.light ? f.name + " · " + f.light + " when light, " + f.dark + " when dark" : f.name + " · the Mac's own colours and accent"
  }
  function themeRows(x) {
    var t = x.theme
    if (!t || !Array.isArray(t.themes) || !t.themes.length) return []
    var cur = t.themes.filter(function (f) { return f.id === t.id })[0] || t.themes[0]
    var mode = THEME_MODES.filter(function (m) { return m[0] === t.mode })[0] || THEME_MODES[0]
    var badge = x.machineOnly ? "this machine" : ""
    return [L({ section: "Appearance", rowId: "set-choice", value: "mac.theme", icon: S.ICON.general, label: "Theme", detail: themeText(cur), swatch: cur.swatch || "",
      badge: badge, available: true, submenu: true }),
      L({ section: "Appearance", rowId: "set-choice", value: "mac.themeMode", icon: S.ICON.general, label: "Light or dark", detail: mode[1], badge: badge, available: true, submenu: true })]
      .concat(typeof t.safe !== "boolean" ? [] : [L({ section: "Appearance", rowId: "set-toggle", value: "mac.safeColours", icon: t.safe ? S.ICON.on : S.ICON.off,
        checked: t.safe, available: true, label: "Colour-blind safe colours", badge: badge,
        detail: t.safe ? "On · pills and the search's colours stay apart for a red-green colour-blind eye, in any theme; each pill kind has its symbol either way"
          : "Off · the theme's own colours; each pill kind still has its symbol" })])
  }
  // Their choices: Enter picks one and goes back, as a setting's choice does.
  function themeChoice(path, x) {
    var t = x.theme
    if (!t || !Array.isArray(t.themes)) return []
    if (path === "mac.themeMode") return THEME_MODES.map(function (m) {
      return L({ rowId: "set-opt", value: path, tag: m[0], label: m[1], showCheck: true, checked: m[0] === t.mode, available: true })
    })
    return t.themes.map(function (f) {
      return L({ rowId: "set-opt", value: path, tag: f.id, label: themeText(f), swatch: f.swatch || "", showCheck: true, checked: f.id === t.id, available: true })
    })
  }

  // Defaults with the Mac's rows: When the app opens after Bring papers up to date, Processes last.
  function defaultsRows(state, L) {
    var rows = S.buildDefaults(state, L)
    var after = -1
    rows.forEach(function (r, i) { if (r.section === "Bring papers up to date") after = i })
    var mine = launchRows(state, L)
    return (after < 0 ? rows.concat(mine) : rows.slice(0, after + 1).concat(mine, rows.slice(after + 1))).concat([processesRow(state, L)])
  }

  function settingsState(settings, ctx) {
    var c = ctx || {}
    return { settings: settings, info: c.info || null, models: c.models ? c.models.models || null : null, defaults: c.defaults || { prompts: "", chat: "" },
      rules: c.rules || [], instructions: c.instructions || "", tests: c.tests || {}, open: "",
      runner: c.runner || { installed: false, installing: false }, styles: c.styles || null, stylesProblem: c.stylesProblem || "",
      extract: c.extract || { pending: 0, catchup: null, skipped: 0 }, taxonomies: c.taxonomies || null, prompts: c.prompts || null,
      catchUp: c.catchUp || { plan: null, running: null, problem: "" }, automation: c.automation || null, reqs: c.reqs || {}, setup: c.setup || null,
      bridge: c.bridge || { status: "unknown", version: "", zoteroVersion: "", expected: "" },
      now: c.now ? new Date(c.now) : undefined } // (the goldens' fixed clock; the app's is the real one)
  }

  // The setup checklist as a Mac shows it: no Hyprland rows (the keybinding, the layer rule),
  // Homebrew for Omarchy's installers (Enter runs brew install, brew-install.sh), the Mac's file
  // picker keys, the app in place of the plugin; and the runner row offering the newer one the app
  // brings (decision 7).
  var HYPRLAND = ["bind-add", "rule-add", "readme-keys"]
  var BREW = { "term:omarchy install dev-env node": "node", "term:omarchy pkg add poppler": "poppler",
    "term:omarchy pkg add tesseract tesseract-data-eng": "tesseract" }
  function macSetup(rows, runner) {
    var out = []
    rows.forEach(function (r) {
      if (r.section !== "Setup") return out.push(r)
      if (HYPRLAND.indexOf(r.value) >= 0) return
      var x = Object.assign({}, r)
      var brew = BREW[r.value]
      if (brew) {
        x.value = "brew:" + brew
        var omarchy = r.value.slice(5), mac = "installs it with Homebrew (brew install " + brew + ")"
        x.detail = String(r.detail).replace("runs " + omarchy + " in a terminal", mac).replace("runs " + omarchy, mac)
      }
      x.label = String(x.label).replace("Ctrl+L, then Ctrl+V", "⌘⇧G, then ⌘V")
      x.detail = String(x.detail).replace("(after an update of the plugin)", "(after an update of the app)").replace("Enter starts it (zotero)", "Enter starts it (Zotero.app)")
      var up = runner && runner.update
      if (r.rowId === "set-install" && up && runner.installed && !runner.installing) {
        x.detail = "This app brings runner " + up.bundled + " (installed: " + up.installed + "): Enter installs it"
        x.badge = "update"
        x.checked = false
      }
      out.push(x)
    })
    return out
  }

  // The Mac's words where Settings.js has Omarchy's: the Keychain holds the keys, Homebrew installs;
  // and the settings the Mac doesn't read (a PDF app, a Zotero command:
  // it opens both through Launch Services) aren't offered.
  var MAC_WORDS = [["A system keyring", "The macOS Keychain"], ["keyring", "Keychain"], ["omarchy pkg add ollama", "brew install ollama"],
    ["; installed somewhere else? Set its command in General › Advanced", ""], [" its 1 models", " its one model"],
    ["under a paper's status line", "under the paper's name at the top"], [" · what Catch up looks at", " · what Catch up and the check when the app opens look at"]]
  var NOT_ON_MAC = ["general.externalPdfCommand", "general.zoteroCommand"]
  function macWords(rows) {
    return rows.filter(function (r) { return NOT_ON_MAC.indexOf(r.value) < 0 }).map(function (r) {
      var x = Object.assign({}, r)
      ;["label", "labelHtml", "detail"].forEach(function (f) {
        if (typeof x[f] !== "string") return
        MAC_WORDS.forEach(function (w) { x[f] = x[f].split(w[0]).join(w[1]) })
      })
      return x
    })
  }

  // One page's rows. page: "", general, paper-status, styles, choice, edit, providers, provider,
  // models, defaults; extra: { choice, edit, filter, machineOnly, provider (an id), modelsPath, only }.
  function page(name, settings, ctx, extra) {
    var x = extra || {}
    var state = settingsState(settings, ctx)
    var ps = state.settings.paperStatuses || []
    if (name === "") return macSetup(S.buildRoot(state, L), state.runner)
    if (name === "general") return windowRows(x).concat(themeRows(x), S.buildGeneral(Object.assign({}, state, { machineOnly: x.machineOnly || null }), L))
    if (name === "paper-status") return S.buildPaperStatusSettings(ps, L).concat([L({ section: "In Zotero", rowId: "pstatus-migrate", icon: "",
      label: "Move the status tags to " + C.PAPER_TAG_PREFIX + "…", detail: "Papers tagged “" + (ps[0] || "reading") + "” before the prefix get “" + C.statusTag(ps[0] || "reading") + "”, and so on", available: ps.length > 0 })])
    if (name === "styles") return S.buildStylePicker(state, L)
    if (name === "choice") return /^mac\.theme/.test(x.choice || "") ? themeChoice(x.choice, x) : S.buildChoice(state, x.choice, L)
    if (name === "providers") return S.buildProviders(state, L)
    if (name === "provider") return S.buildProvider(state, x.provider, L)
    if (name === "models") return S.buildModelPicker(state, x.modelsPath, L, x.only || "")
    if (name === "defaults") return defaultsRows(state, L)
    if (name === "launch-catchup") return launchPage(state, L)
    if (name === "auto-prompts") return S.buildAutoPrompts(state, L)
    if (name === "rules") {
      // no rules.json to read (installed or bundled): said, not "Reading the rules…" for ever
      if (!state.rules.length && (ctx || {}).rulesMissing) return [L({ rowId: "set-info", icon: S.ICON.info, label: "Couldn't read the rules: " + ctx.rulesMissing + " isn't there", detail: "Settings › Setup installs the AI features", available: false })]
      return S.buildRules(state, L)
    }
    // Settings › Taxonomies (phase 9): x.taxEdit (taxonomy-show), x.taxLabel (its label's place), x.taxDraft, x.review
    if (name === "taxonomies" && !state.taxonomies && x.taxProblem) return [L({ rowId: "set-info", icon: S.ICON.warn, label: "Couldn't read the taxonomies: " + x.taxProblem, detail: "Back, then Settings › Taxonomies tries again", available: false })]
    if (name === "taxonomies") return S.buildTaxonomies(state, L)
    if (name === "taxonomy" && !x.taxEdit && x.taxProblem) return [L({ rowId: "set-info", icon: S.ICON.warn, label: "Couldn't read “" + (x.taxEditId || "it") + "”: " + x.taxProblem, detail: "Back, then Enter on it tries again", available: false })]
    if (name === "taxonomy") return S.buildTaxonomy(x.taxEdit || null, L)
    if (name === "tax-label") return S.buildTaxonomyLabel(x.taxEdit || null, Number(x.taxLabel), L)
    if (name === "tax-ai") return x.taxDraft ? S.buildTaxonomyDraft(x.taxDraft, L) : []
    if (name === "tax-review") return S.buildTaxonomyReview(x.review === undefined ? null : x.review, L)
    if (name === "tasks") return T.buildStatusSettings(T.statusesOf(settings), x.todos || [], L).concat(T.buildActionSettings(T.actionsOf(settings), L), T.buildDefaultTaskSettings(settings, L))
    return [L({ rowId: "set-info", icon: S.ICON.info, label: "Not on the Mac yet: this page comes in a later version", available: false })]
  }

  // The typing page of a taxonomy's field (the Mac types the form's fields there): Ask the AI sends; a definition can
  // be emptied; the others say which field. null: not a taxonomy's.
  function taxonomyEditRows(edit, text) {
    var path = String((edit && edit.path) || "")
    if (path.indexOf("tax:") !== 0) return null
    var t = String(text || "").trim()
    if (path === "tax:ai-request") return [L({ rowId: "set-save", icon: S.ICON.ok, label: t ? "Send “" + t + "”" : "Type what you want", detail: edit.help || "", available: !!t, value: t })]
    if (path === "tax:label-definition") return [L({ rowId: "set-save", icon: S.ICON.ok, label: t ? "Save “" + t + "”" : "Save: no definition", detail: edit.help || "", available: true, value: t })]
      .concat(edit.current ? [L({ rowId: "set-info", icon: S.ICON.info, label: "Now: " + edit.current, available: false })] : [])
    return [L({ rowId: "set-save", icon: S.ICON.ok, label: t ? "Save “" + t + "”" : "Type the value of “" + edit.label + "”", detail: edit.help || "", available: !!t, value: t })]
      .concat(edit.current ? [L({ rowId: "set-info", icon: S.ICON.info, label: "Now: " + edit.current, available: false })] : [])
  }

  // A row's path from this Mac's home folder, with ~ (an editor's file, a folder).
  function tilde(r, home) {
    if (!home || typeof r.detail !== "string" || r.detail.indexOf(home + "/") < 0) return r
    return Object.assign({}, r, { detail: r.detail.split(home + "/").join("~/") })
  }

  // The pages the Mac has, for the index (ZoteroSearch.qml:530).
  var INDEXED = [["", "Settings"], ["general", "General"], ["providers", "Models & providers"], ["defaults", "Defaults"], ["rules", "Rules"], ["paper-status", "Paper status"], ["tasks", "Tasks"], ["taxonomies", "Taxonomies"]]

  // A settings change made, saved as Service.qml's saveSettings: → { problem } or { machine,
  // shared (null without a sync folder), refused, syncDirChange, id (a new endpoint's) }.
  // op: "value" [path, value], "both" [model] (prompts and chat), "addEndpoint" [name, url],
  // "removeEndpoint" [id], "fillDefaults" [model] (the empty ones), "rule" [rule] (toggled).
  function change(settings, op, args) {
    var a = args || []
    // (null: back to the default, the key gone, as parseValue's undefined is in the QML)
    if (op === "value") return { next: S.withValue(settings, a[0], a[1] === null ? undefined : a[1]) }
    if (op === "both") return { next: S.withValue(S.withValue(settings, "defaults.prompts.model", a[0]), "defaults.chat.model", a[0]) }
    if (op === "addEndpoint") { var r = S.addEndpoint(settings, a[0], a[1]); return { next: r.settings, id: r.id } }
    if (op === "removeEndpoint") return { next: S.removeEndpoint(settings, a[0]) }
    if (op === "rule") return { next: S.withRuleToggled(settings, a[0]) } // a rule (rules.json's) on or off
    if (op === "fillDefaults") {
      var d = settings.defaults || {}, next = settings
      if (!(d.prompts && d.prompts.model)) next = S.withValue(next, "defaults.prompts.model", a[0])
      if (!(d.chat && d.chat.model)) next = S.withValue(next, "defaults.chat.model", a[0])
      return { next: next }
    }
    throw new Error("no such settings change: " + op)
  }

  return {
    settingsPage: function (name, settings, ctx, extra) {
      var x = extra || {}
      if (name === "edit") return taxonomyEditRows(x.edit, x.filter || "") || S.buildEditRows(x.edit, x.filter || "", L)
      return V.filterRows(macWords(page(name, settings, ctx, x)).map(function (r) { return tilde(r, x.home) }), x.filter || "")
    },
    // Every row of the pages above, as the results' Go to and a menu's Settings rows find them (mac: this Mac's own
    // rows' values, { theme, openAsWindow, dock }, when given).
    settingsIndex: function (settings, ctx, todos, mac) {
      var out = []
      var m = mac || {}
      INDEXED.forEach(function (p) {
        macWords(page(p[0], settings, ctx, { todos: todos, theme: m.theme, openAsWindow: m.openAsWindow, dock: m.dock })).forEach(function (r) {
          if (!r.label || (r.rowId === "set-info" && !r.available)) return
          var nav = r.rowId === "set-nav"
          out.push({ page: nav ? r.value : p[0], pageTitle: nav ? r.label : p[1], label: r.label, detail: r.detail, section: r.section, rowId: nav ? "" : r.rowId, value: nav ? "" : r.value })
        })
      })
      return out
    },
    settingMenuRows: function (query, index) { return V.settingMenuRows(query, index || []) },
    settingsChange: function (settings, op, args, paths, sharedRaw) {
      var r = change(settings, op, args)
      var file = S.toFile(r.next)
      var res = C.normalizeSettings(file)
      if (res.problems.length) return { problem: res.problems[0] }
      if ((r.next.syncDir || null) !== (settings.syncDir || null)) return { syncDirChange: r.next.syncDir || null }
      var save = P.settingsSave(file, paths, sharedRaw, S.toFile(settings))
      return { machine: save.machine, shared: save.shared, refused: save.refused || "", id: r.id || "" }
    },
    // A setting's edit (the header takes its value): general's, an endpoint's or a provider's base
    // URL and context, the extraction size (ZoteroSearch.qml:3759).
    settingEdit: function (path, settings) {
      var key = path.replace(/^general\./, "")
      var item = S.generalItem(key)
      var cur
      if (item) cur = S.getPath(settings, key)
      else {
        var field = path.split(".").pop()
        item = path === "defaults.catchUpDays" ? { key: path, label: "Papers added lately: the last … days", type: "number", min: 1, max: 3650, help: "Days, 1 to 3650: Catch up looks at the papers added since" }
          : path === "defaults.extractMaxMB" ? { key: path, label: "Skip PDFs larger than", type: "number", min: 1, max: 1000, help: "MB, 1 to 1000: larger PDFs are left out of automatic extraction" }
          : path === "defaults.processesAtOnce" ? { key: path, label: "Processes at once", type: "number", min: 1, max: 4, help: "1 to 4: extraction, tagging and prompts on new papers each run up to that many together" }
          : field === "baseURL" ? { key: path, label: "Base URL", type: "url", help: "e.g. http://localhost:11434/v1, or https://gateway.example.edu/v1" }
          : field === "context" ? { key: path, label: "Context size", type: "context", help: "Tokens, e.g. 32768 or 32k; empty: the model's own" } : null
        if (!item) return null
        var m = /^endpoint\.([^.]+)\.(.+)$/.exec(path)
        var ep = m ? (settings.endpoints || []).filter(function (e) { return e.id === m[1] })[0] : null
        cur = m ? (ep ? ep[m[2]] : undefined) : S.getPath(settings, path)
      }
      var text = cur === undefined || cur === null ? "" : Array.isArray(cur) ? cur.join(" ") : String(cur)
      return { path: path, label: item.label, type: item.type, help: item.help || "", current: text, item: item,
        empty: ["argv", "context", "path", "text"].indexOf(item.type) >= 0 ? "back to the default" : "" }
    },
    // The two steps of a new endpoint (ZoteroSearch.qml:1851, 3786).
    endpointNameEdit: function () { return { path: "", label: "Endpoint name", type: "endpoint-name", help: "A name you'll recognize, e.g. Lab gateway or LM Studio", current: "" } },
    endpointURLEdit: function (name) { return { path: "", label: "Base URL", type: "endpoint-url", name: name, help: "Its OpenAI-compatible API, e.g. http://localhost:1234/v1 (LM Studio) or https://gateway.example.edu/v1", current: "" } },
    // A toggle's value now: general's (its default when unset), an endpoint's, any other path's.
    settingValue: function (settings, path) {
      var m = /^endpoint\.([^.]+)\.enabled$/.exec(path)
      if (m) { var ep = (settings.endpoints || []).filter(function (e) { return e.id === m[1] })[0]; return ep ? !!ep.enabled : false }
      var key = path.replace(/^general\./, "")
      var item = S.generalItem(key)
      var cur = S.getPath(settings, key)
      return cur === undefined || cur === null ? (item ? item.def : false) : cur
    },
    // The runner's argv (settings.promptCommand, else oma-zotero-prompt).
    promptArgv: function (settings, args) { return C.promptArgv(settings, args || []) },
    needsSetup: function (settings, ctx) { return S.needsSetup(settingsState(settings, ctx)) },
    // Catching up (the Mac's): see above.
    catchUpPlanArgs: function (settings, kind, prompts, since) { return planArgs(settings, kind, prompts || null, since) },
    catchUpJobs: function (plan, kind, skipped) { return planJobs(plan, kind, skipped || {}) },
    launchCatchUpAsk: function (plan, settings, prompts, skipped) { return launchAsk(plan, settings, prompts || null, skipped || {}) },
    launchCatchUpToggled: function (settings, prompts, field) { return launchWhatToggled(settings, prompts || null, field) }
  }
}

if (typeof module !== "undefined") module.exports = GlueSettings
