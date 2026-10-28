// Glue's wrappers for phase 6b: prompts, Processes, a paper's extracted text, Settings › Rules'
// instructions.
// Merged into Glue (Glue.js); JSON in, JSON out. `models` here is the runner's list
// (`models --json`'s models), `resolved` the default model it resolves to ("" none).
function GlueRunner(V, C, S, F) {
  var at = function (ms) { return new Date(Number(ms) || Date.now()) }
  // The text character at `at` (tags skipped, an entity one character), a dash, made "·".
  var joinAt = function (html, at) {
    var n = 0
    for (var i = 0; i < html.length; i++) {
      var c = html.charAt(i)
      if (c === "<") { i = html.indexOf(">", i); if (i < 0) break; continue }
      if (n === at) return c === "\u2014" ? html.slice(0, i) + "·" + html.slice(i + 1) : html
      if (c === "&") { var e = html.indexOf(";", i); if (e > i) i = e }
      n++
    }
    return html
  }

  // The runner's (runner/lib/fatal.mjs, kept the same: js/tests/fatal.test.js), in this order: Claude Code's "Invalid API
  // key · Please run /login" is a sign-in, an API's refused key a key.
  var FATAL_PATTERNS = [
    ["key", /api key was refused|key isn't accepted|incorrect api key|invalid x-api-key|Jev refused \((401|403)\)/i],
    ["signin", /\/login|not logged in|logged out|log in again|codex login|oauth token|token (has )?expired|authentication_error|failed to authenticate|invalid api key|invalid bearer|unauthori[sz]ed|\b401\b/i],
    ["limit", /credit|insufficient_quota|quota|billing|usage limit|limit reached|hit your limit|rate.?limit|too many requests|\b429\b/i],
    ["busy", /overloaded|\b529\b/i],
    ["setup", /no AI model is set up|no default model yet|there is no default model|no API key|isn't installed|aren't installed|reinstall the AI features/i],
    ["network", /can't reach|couldn't reach|isn't answering at|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|getaddrinfo|fetch failed|connection error|network|socket hang up|unable to connect|offline/i]
  ]

  // A runner's reason for a failed job → null (this paper's own problem: the next one may work), or what stops the
  // batch: { kind: signin, key, limit, busy, network, setup; message: what to fix, in a line; retryMin: when the
  // automation tries again by itself; reason: the runner's own words, cut short }.
  function fatalProblem(reason) {
    var text = String(reason || "").trim()
    if (!text || /zotero/i.test(text)) return null // (Zotero away: what waits for it goes on when it's back)
    var who = /chatgpt|codex/i.test(text) ? "ChatGPT" : /claude|anthropic|\/login/i.test(text) ? "Claude" : ""
    var hit = FATAL_PATTERNS.filter(function (p) { return p[1].test(text) })[0]
    var kind = hit ? hit[0] : ""
    if (!kind) return null
    var message = kind === "signin" ? (who === "ChatGPT" ? "ChatGPT isn't signed in: in Terminal, run codex login"
        : who === "Claude" ? "Claude isn't signed in (its login expired?): in Terminal, run claude, then /login"
        : "The AI refused the sign-in: check it in Settings › Models & providers")
      : kind === "key" ? "An API key was refused: replace it in Settings › Models & providers"
      : kind === "limit" ? (who || "The AI") + " is out of credit or over its usage limit: wait for the limit to reset, or add credit"
      : kind === "busy" ? (who || "The AI") + " is overloaded right now: it's tried again in a few minutes"
      : kind === "setup" ? "The AI isn't ready: " + text.replace(/^oma-zotero-prompt: /, "")
      : "Can't reach the AI: check the network connection"
    var retryMin = { network: 5, busy: 10, limit: 30, signin: 30, key: 30, setup: 30 }[kind]
    return { kind: kind, message: message, retryMin: retryMin, reason: text.length > 200 ? text.slice(0, 199) + "…" : text }
  }

  return {
    // ---- prompts (`list --json`)
    parsePromptList: function (text) { return C.parsePromptList(text) },
    promptRows: function (prompts, models, query, color, resolved) { return V.buildPromptRows(prompts || [], models || null, query || "", color, F.filter, resolved || "") },
    promptEditor: function (prompt, models, resolved, auto, host) { return V.buildPromptEditor(prompt, models || null, "", resolved || "", !!auto, host || "") },
    promptModels: function (prompt, models, resolved, query) { return V.filterRows(V.buildPromptModels(prompt, models || null, resolved || ""), query || "") },
    promptEfforts: function (prompt, models, resolved) { return V.buildPromptEfforts(prompt, models || null, resolved || "") },
    promptOutputs: function (prompt) { return V.buildPromptOutputs(prompt) },
    titleRows: function (text, mode, ready, busy) { return V.buildTitleRows(text || "", mode, { ready: !!ready, busy: !!busy }) },
    effortFor: function (models, model, effort) { return V.effortFor(models || null, model, effort) || "" },
    // `set <id> …`'s flags for a change (Service.qml:1830): an empty effort is the default.
    setPromptArgs: function (id, change) {
      var c = change || {}, out = ["set", id]
      if (c.title !== undefined) out.push("--title", String(c.title))
      if (c.model !== undefined) out.push("--model", String(c.model))
      if (c.effort !== undefined) out.push("--effort", String(c.effort) || "default")
      if (c.output !== undefined) out.push("--output", String(c.output))
      if (c.brief !== undefined) out.push("--brief", c.brief === "on" || c.brief === true ? "on" : "off")
      return out
    },

    // ---- Processes (the runner's tasks)
    // (the dash joining a task's title to its paper becomes " · ", the Mac's way; a dash in the
    // title or the paper themselves stays)
    taskRows: function (tasks, query, color, nowMs) {
      return V.buildTaskRows(tasks || [], query || "", color, F.filter, at(nowMs)).map(function (r) {
        if (r.rowId !== "task" || !r.itemTitle) return r
        var x = Object.assign({}, r)
        var p = x.label.length - String(r.itemTitle).length - 2
        if (x.label.charAt(p) !== "\u2014") return r
        x.label = x.label.slice(0, p) + "·" + x.label.slice(p + 1)
        x.labelHtml = joinAt(x.labelHtml, p)
        return x
      })
    },
    taskSummary: function (tasks, pending) { return V.taskSummary(tasks || [], pending || 0) },

    // ---- a paper's extracted text
    hasPdf: function (details) { return !!V.hasPdf(details) },
    fulltextNote: function (details) { return V.fulltextNote(details) || null },
    extractMenu: function (details, noRunner) { return V.buildExtractMenu(details, !!noRunner) },

    // ---- Settings › Rules (the page itself: GlueSettings.js's settingsPage "rules")
    instructionsText: function (text) { return String(text || "").replace(/<!--[\s\S]*?-->/g, "").trim() },

    // ---- a problem every paper would meet (the runner's reason for one that failed)
    fatalProblem: function (reason) { return fatalProblem(reason) }
  }
}

if (typeof module !== "undefined") module.exports = GlueRunner
