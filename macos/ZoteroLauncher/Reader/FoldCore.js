// The fold reader's logic (docs/fold-reader/SPEC.md sections 5 and 6.1): a TextFold doc read into a model, each
// level's pieces, the Topic cards, the role filter's runs, the PDF words indexed and each unit's place on the pages
// (the link map), crops and coverage, and the marks (made, re-anchored, parsed, written). Pure: no window, no page,
// no timers. Loaded by JavaScriptCore (Glue), the reader's page and Node, as plain ES5 (its regexes use the u flag).
//
// Ported from TextFold (github.com/chenxiachan/textfold, commit f0e5b607eb01b74ac1efeadc6883ad48b3aaaa42),
// Copyright 2026 Xia Chen, Apache License 2.0 (TEXTFOLD-LICENSE.txt beside this file): textfold/tokens.py (WORD,
// STOP, ABBREV, split_sentences, norm, lcs_pairs), textfold/ladder.py (locate, head_words) and textfold/web/reader.js
// (pdfNorm, indexWords, locate, boxesOf). Changed: rewritten in ES5 JavaScript; tokens are rebuilt from the doc's
// sentence strings (citations and math found in the text, not as atoms); the PDF words come as boxes from 0 to 1 of
// each page (measured in points for TextFold's tolerances); the results are shaped for this reader.
var FoldCore = (function () {
  "use strict"

  // ---- levels, roles, limits

  var LEVELS = [
    { id: "full", key: "1", name: "Full", what: "every paragraph as written", ai: false },
    { id: "brief", key: "2", name: "Brief", what: "key sentences, verbatim", ai: false },
    { id: "key", key: "3", name: "Key", what: "each paragraph's point and its reason", ai: true },
    { id: "takeaway", key: "4", name: "Takeaway", what: "one line per paragraph", ai: true },
    { id: "topic", key: "5", name: "Topic", what: "a map of the paper, one card per section", ai: true }
  ]
  LEVELS.forEach(function (l, i) {
    l.n = i + 1
    l.tip = l.name + ": " + l.what + " · " + l.key
    l.say = l.name + ": " + l.what
    l.foot = l.name + (l.ai ? " · written by AI, each line opens to the paper" : " · the paper's words")
    l.font = l.ai ? "ui" : "paper"
  })
  function level(id) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id || LEVELS[i].n === id) return LEVELS[i]
    return null
  }

  var ROLES = ["claim", "gap", "method", "setup", "result", "analysis", "limitation", "context"]
  var SHAPES = { claim: "◆", gap: "◇", method: "■", setup: "□", result: "▲", analysis: "●", limitation: "▼", context: "○" }
  function role(r) { return ROLES.indexOf(r) >= 0 ? r : "context" }

  var LIMITS = { units: 5000, sentences: 400, tokens: 5000, bytes: 20 * 1024 * 1024 }
  var ID = /^[\w.-]{1,120}$/

  // ---- tokens (tokens.py)

  var CJK = "぀-ヿㇰ-ㇿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ"
  var THAI = "฀-๿"
  var SYLLABLE = "[เแโใไ]*[ก-ฮ][ะ-ฺๅ็-๎]*"
  // Python's [^\W_] (a letter or a digit of any script) without CJK and Thai, then its marks (\p{M})
  var LETTER = "(?:(?![" + CJK + THAI + "])[\\p{L}\\p{N}])(?:(?![" + CJK + THAI + "])[\\p{L}\\p{N}]|\\p{M})*"
  var WORD_SRC = "[" + CJK + "]|" + SYLLABLE + "|\\p{Nd}+(?:[.,]\\p{Nd}+)+%?|[๐-๙]+|" + LETTER + "(?:['’\\-]" + LETTER + ")*|[" + THAI + "]|\\S"
  var TOKEN = new RegExp("\\s+|" + WORD_SRC, "gu")
  var SPACE = /^\s+$/
  var MATH = /(\$[^$]+\$)/
  // citations: [1], [1, 2], [3-5]; (Lee et al., 2021), (A and B, 2019; C, 2020a)
  var CITES = [
    "\\[\\p{Nd}+(?:\\s*[,\\-–]\\s*\\p{Nd}+)*\\]",
    "\\((?:\\p{Lu}[\\p{L}'’\\-]*(?: et al\\.)?(?:,? (?:and|&) \\p{Lu}[\\p{L}'’\\-]*)?,? \\p{Nd}{4}[a-z]?(?:;\\s*)?)+\\)"
  ]
  var STOP = {}
  ;("the a an of to in is are was were be been and or that this these those it its for on with as by at from we our their they which " +
    "while than then into can not but such also has have had does do more most less only both " +
    "的 了 是 在 和 与 或 这 那 就 也 都 而 及 其 之 对 中 为").split(" ").forEach(function (w) { STOP[w] = true })
  var ABBREV = {}
  ;("e g i al etc vs cf fig figs eq eqs sec secs tab ref refs no approx resp ca viz dr mr ms prof st jr inc ltd co appx app thm def lem prop cor ch")
    .split(" ").forEach(function (w) { ABBREV[w] = true })
  var NOT_WORDCHAR = /[^\p{L}\p{N}\p{M}_]/gu
  var WORDCHAR = /[\p{L}\p{N}_]/u
  var CJK_ONE = new RegExp("[" + CJK + "]", "u")

  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k) }

  // A sentence's tokens: { t, s (1: a space follows), k ("cite", "math" or absent) }.
  function tokenize(text) {
    var s = String(text == null ? "" : text), out = [], spans = []
    CITES.forEach(function (src) {
      var re = new RegExp(src, "gu"), m
      while ((m = re.exec(s))) { spans.push([m.index, m.index + m[0].length]); if (!m[0].length) re.lastIndex++ }
    })
    var parts = s.split(MATH), off = 0
    for (var p = 0; p < parts.length; p++) {
      var part = parts[p]
      if (p % 2 === 1) {
        out.push({ t: part, s: 0, k: "math", at: off, end: off + part.length })
      } else {
        TOKEN.lastIndex = 0
        var m2
        while ((m2 = TOKEN.exec(part))) {
          if (SPACE.test(m2[0])) { if (out.length) out[out.length - 1].s = 1; continue }
          out.push({ t: m2[0], s: 0, at: off + m2.index, end: off + m2.index + m2[0].length })
        }
      }
      off += part.length
    }
    return out.map(function (t) {
      var o = { t: t.t, s: t.s }
      if (t.k) o.k = t.k
      else if (spans.some(function (sp) { return t.at >= sp[0] && t.end <= sp[1] })) o.k = "cite"
      return o
    })
  }

  // What two tokens must share to count as the same word in the morph; "" never matches (tokens.py norm).
  function norm(tok) {
    if (tok.k === "math") return "atom:" + tok.t.replace(/^\$|\$$/g, "").replace(/\s+/g, "")
    var w = String(tok.t || "").toLowerCase().replace(NOT_WORDCHAR, "")
    if (!w || STOP[w]) return ""
    if (w.length > 3 && w.charAt(w.length - 1) === "s" && w.slice(-2) !== "ss") w = w.slice(0, -1)
    return w
  }

  // The longest common subsequence of two lists of normalised words, as index pairs; "" never matches (lcs_pairs).
  function lcsPairs(a, b) {
    var n = a.length, m = b.length, i, j
    if (!n || !m) return []
    var dp = []
    for (i = 0; i <= n; i++) { dp.push([]); for (j = 0; j <= m; j++) dp[i].push(0) }
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) dp[i][j] = a[i] && a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
    var out = []
    i = 0; j = 0
    while (i < n && j < m) {
      if (a[i] && a[i] === b[j]) { out.push([i, j]); i++; j++ }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++
      else j++
    }
    return out
  }

  // Sentence ranges [start, end) over a token list (split_sentences).
  var STOPS = { ".": 1, "?": 1, "!": 1, "。": 1, "！": 1, "？": 1, "।": 1, "॥": 1 }
  var CJK_STOPS = { "。": 1, "！": 1, "？": 1 }
  var DANDAS = { "।": 1, "॥": 1 }
  var TAILS = { ")": 1, "]": 1, "}": 1, "）": 1, "］": 1, "｝": 1, "】": 1, "〕": 1, "〉": 1, "》": 1, "」": 1, "』": 1, "”": 1, "\"": 1, "’": 1, "'": 1 }
  for (var st in STOPS) TAILS[st] = 1
  function splitSentences(toks) {
    var bounds = [], start = 0, n = toks.length
    for (var i = 0; i < n; i++) {
      var t = toks[i].t
      if (i < start || !STOPS[t]) continue
      var prev = i > 0 ? (toks[i - 1].t || "") : ""
      if (t === "." && (ABBREV[prev.toLowerCase()] || /^[A-Z]$/.test(prev))) continue
      var end = i + 1
      while (end < n && !toks[end - 1].s && TAILS[toks[end].t]) end++
      if (end >= n) break
      var nxt = toks[end], head = nxt.t || ""
      var cjk = CJK_ONE.test(prev) || CJK_ONE.test(head), danda = false
      for (var j = i; j < end; j++) { if (CJK_STOPS[toks[j].t]) cjk = true; if (DANDAS[toks[j].t]) danda = true }
      if (cjk && t === "." && i === start + 1 && /^\p{Nd}+$/u.test(prev)) cjk = false
      if (cjk || danda || (toks[end - 1].s && (nxt.k === "math" || /^[A-Z0-9(\[“"‘]/.test(head)))) { bounds.push([start, end]); start = end }
    }
    if (start < n) bounds.push([start, n])
    return bounds
  }

  // The topic as a run of the takeaway's tokens: indices, or [] when it is not in there verbatim (ladder.py locate).
  function squash(s) { return String(s || "").toLowerCase().replace(/[^\p{L}\p{N}_]/gu, "") }
  function locateTopic(topic, take) {
    var want = squash(topic)
    if (!want) return []
    for (var i = 0; i < take.length; i++) {
      var a = squash(take[i].t)
      if (!a || want.indexOf(a) !== 0) continue
      var acc = ""
      for (var j = i; j < take.length; j++) {
        acc += squash(take[j].t)
        if (acc === want) { var out = []; for (var x = i; x <= j; x++) out.push(x); return out }
        if (want.indexOf(acc) !== 0) break
      }
    }
    return []
  }

  function isWord(tk) { return tk.k === "math" || WORDCHAR.test(tk.t || "") }
  // Indices of the first n words, punctuation between them included, none at the end (ladder.py head_words).
  function headWords(toks, n) {
    var idx = [], w = 0
    for (var i = 0; i < toks.length; i++) {
      if (isWord(toks[i]) && w === n) break
      idx.push(i)
      if (isWord(toks[i])) w++
    }
    while (idx.length && !isWord(toks[idx[idx.length - 1]])) idx.pop()
    return idx
  }

  // ---- the doc read (SPEC 5.1, 5.2)

  function badFormat(doc, detail) {
    var d = doc && typeof doc === "object" ? doc : {}
    return { kind: "bad-format", format: String(d.format == null ? "" : d.format), version: d.version == null ? "" : d.version, detail: detail || "" }
  }

  // A doc's problem, or null. bytes: its JSON text's size, when known.
  function check(doc, bytes) {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return badFormat(doc, "not a TextFold doc")
    if (doc.format !== "textfold/doc" || doc.version !== 0) return badFormat(doc, "format " + doc.format + " version " + doc.version)
    if (bytes && bytes > LIMITS.bytes) return badFormat(doc, "larger than 20 MB")
    if (!Array.isArray(doc.sections)) return badFormat(doc, "no sections")
    var n = 0, seen = {}
    for (var i = 0; i < doc.sections.length; i++) {
      var s = doc.sections[i]
      if (!s || typeof s !== "object" || !ID.test(String(s.id))) return badFormat(doc, "a section's id isn't valid")
      var us = Array.isArray(s.units) ? s.units : []
      for (var j = 0; j < us.length; j++) {
        var u = us[j]
        if (!u || typeof u !== "object" || !ID.test(String(u.id))) return badFormat(doc, "a unit's id isn't valid")
        if (seen[u.id]) return badFormat(doc, "two units share the id " + u.id)
        seen[u.id] = true
        if (!Array.isArray(u.sentences)) return badFormat(doc, "unit " + u.id + " has no sentences")
        if (u.sentences.length > LIMITS.sentences) return badFormat(doc, "more than 400 sentences in a unit")
        if (++n > LIMITS.units) return badFormat(doc, "more than 5000 units")
      }
    }
    return null
  }

  function str(v) { return typeof v === "string" ? v : v == null ? "" : String(v) }

  // The tokens of the takeaway: the key's first tn when they are its start, else the key's first sentence.
  function takeLength(key, takeaway) {
    var take = tokenize(takeaway)
    if (take.length && take.length <= key.length && take.every(function (t, i) { return key[i].t === t.t })) return take.length
    var b = splitSentences(key)
    return b.length ? b[0][1] : key.length
  }

  function unitModel(u, sectionId) {
    var toks = [], sents = []
    var sentences = u.sentences.map(str)
    sentences.forEach(function (s, si) {
      var a = toks.length, ts = tokenize(s)
      if (si < sentences.length - 1 && ts.length) ts[ts.length - 1].s = 1
      for (var i = 0; i < ts.length; i++) toks.push(ts[i])
      sents.push([a, toks.length])
    })
    if (toks.length > LIMITS.tokens) return null
    var sentOf = []
    sents.forEach(function (r, s) { for (var i = r[0]; i < r[1]; i++) sentOf[i] = s })
    var seen = {}, ev = []
    ;(Array.isArray(u.evidence) ? u.evidence : []).forEach(function (x) {
      if (typeof x === "number" && x % 1 === 0 && x >= 0 && x < sents.length && !seen[x]) { seen[x] = true; ev.push(x) }
    })
    ev.sort(function (a, b) { return a - b })
    var evAll = ev.length ? ev : sents.map(function (_, s) { return s }) // (no evidence: Brief is Full, the key aligned to it all)
    var key = tokenize(str(u.key))
    var keyIdx = []
    evAll.forEach(function (s) { for (var i = sents[s][0]; i < sents[s][1]; i++) keyIdx.push(i) })
    lcsPairs(key.map(norm), keyIdx.map(function (i) { return norm(toks[i]) })).forEach(function (p) { key[p[0]].m = keyIdx[p[1]] })
    var tn = key.length ? takeLength(key, str(u.takeaway)) : 0
    var topicText = str(u.topic)
    var topicK = key.length ? locateTopic(topicText, key.slice(0, tn)) : []
    return {
      id: u.id, kind: str(u.kind), role: role(u.role), section: sectionId, toks: toks, sents: sents, sentOf: sentOf, ev: ev,
      key: key, tn: tn, topic: topicText, topicK: topicK, takeaway: str(u.takeaway)
    }
  }

  var BACK_ID = /^(A\d|Sx|bib)/
  var BACK_TITLE = /^(Appendix|Appendices|Acknowledg|References|Bibliography|Supplementary)/i

  // The doc as the reader draws it; { problem } when it can't be read (the bad-format state).
  function model(doc, bytes) {
    var problem = check(doc, bytes)
    if (problem) return { problem: problem }
    var sections = [], units = {}, order = [], back = false
    for (var i = 0; i < doc.sections.length; i++) {
      var s = doc.sections[i]
      back = back || BACK_ID.test(s.id) || BACK_TITLE.test(str(s.title).trim())
      var take = tokenize(str(s.takeaway))
      var sec = { id: s.id, num: str(s.num), title: str(s.title), depth: s.depth === 2 || s.depth === 3 ? s.depth : 1, takeaway: str(s.takeaway),
        takeToks: take, topic: str(s.topic), topicK: locateTopic(str(s.topic), take), back: back, units: [] }
      var us = Array.isArray(s.units) ? s.units : []
      for (var j = 0; j < us.length; j++) {
        var u = unitModel(us[j], s.id)
        if (!u) return { problem: badFormat(doc, "more than 5000 tokens in a unit") }
        units[u.id] = u
        order.push(u.id)
        sec.units.push(u.id)
      }
      sections.push(sec)
    }
    var p = doc.provenance && typeof doc.provenance === "object" ? doc.provenance : {}
    var links = (Array.isArray(doc.links) ? doc.links : []).filter(function (l) {
      return l && units[l.from] && units[l.to] && typeof l.rel === "string" && l.rel !== "ref"
    }).map(function (l) { return { from: l.from, to: l.to, rel: l.rel } })
    var index = {}
    order.forEach(function (id, n) { index[id] = n })
    return {
      id: str(doc.id), lang: str(doc.lang), title: str(doc.title), date: str(doc.date),
      authors: (Array.isArray(doc.authors) ? doc.authors : []).map(str),
      provenance: { ai: p.ai_generated !== false, model: str(p.model), levelsMade: str(p.levels_made), local: p.local === true },
      sections: sections, units: units, order: order, index: index, links: links
    }
  }

  // ---- pieces per level (SPEC 5.3)

  // A piece: { id, t, sp (" " or ""), tone ("ink", "muted", "strong": ink at weight 600), kind ("cite", "math", "gap"),
  // keep (the next level keeps it: it is drawn darker) }.
  function piece(id, tok, tone, keep) {
    var p = { id: id, t: tok.t, sp: tok.s ? " " : "", tone: tone, keep: !!keep }
    if (tok.k) p.kind = tok.k
    return p
  }
  function keyId(u, j) { var t = u.key[j]; return u.id + ":" + (t.m !== undefined ? t.m : "k" + j) }
  // (a unit without a key: its first sentence, the paper's words)
  function firstSentence(u) {
    var r = u.sents[0] || [0, 0], out = []
    for (var i = r[0]; i < r[1]; i++) out.push(piece(u.id + ":" + i, u.toks[i], "ink", true))
    if (out.length) out[out.length - 1].sp = ""
    return out
  }
  function briefPieces(u, tones) {
    var out = [], prev = null
    var ev = u.ev.length ? u.ev : u.sents.map(function (_, s) { return s })
    ev.forEach(function (s) {
      var a = u.sents[s][0], b = u.sents[s][1]
      if (prev !== null && a !== prev) out.push({ id: u.id + ":gap" + s, t: "…", sp: " ", tone: "muted", keep: false, kind: "gap" })
      for (var i = a; i < b; i++) out.push(tones(i))
      prev = b
    })
    if (out.length) out[out.length - 1].sp = ""
    return out
  }
  function keptByKey(u) {
    var kept = {}
    u.key.forEach(function (t) { if (t.m !== undefined) kept[t.m] = true })
    return kept
  }
  function topicChip(u) {
    if (!u.key.length) {
      var f = firstSentence(u)
      return headWords(f.map(function (p) { return { t: p.t, k: p.kind } }), 6).map(function (i) { var p = f[i]; p.keep = false; return p }).map(lastNoSpace)
    }
    if (u.topicK.length) return u.topicK.map(function (k) { return piece(keyId(u, k), u.key[k], "ink", false) }).map(lastNoSpace)
    if (u.topic) return tokenize(u.topic).map(function (tok, j) { return piece(u.id + ":t" + j, tok, "ink", false) }).map(lastNoSpace)
    return headWords(u.key.slice(0, u.tn), 6).map(function (i, n, all) {
      var p = piece(keyId(u, i), u.key[i], "ink", false)
      if (n === all.length - 1) p.sp = ""
      return p
    })
  }

  // A unit's pieces at a level (an id of LEVELS or its number).
  function pieces(u, lv) {
    var L = level(lv)
    if (!L || !u) return []
    var id = u.id
    if (L.id === "full") {
      var brief = {}
      var ev = u.ev.length ? u.ev : u.sents.map(function (_, s) { return s })
      ev.forEach(function (s) { for (var i = u.sents[s][0]; i < u.sents[s][1]; i++) brief[i] = true })
      return u.toks.map(function (t, i) { return piece(id + ":" + i, t, brief[i] ? "ink" : "muted", brief[i]) })
    }
    if (L.id === "brief") {
      var kept = keptByKey(u)
      if (!u.key.length) { kept = {}; var r0 = u.sents[0] || [0, 0]; for (var x = r0[0]; x < r0[1]; x++) kept[x] = true }
      return briefPieces(u, function (i) { return piece(id + ":" + i, u.toks[i], kept[i] ? "ink" : "muted", kept[i]) })
    }
    if (!u.key.length) {
      if (L.id === "topic") return topicChip(u)
      var first = firstSentence(u)
      if (L.id === "takeaway") {
        var chipped = {}
        topicChip(u).forEach(function (p) { chipped[p.id] = true })
        first.forEach(function (p) { p.keep = !!chipped[p.id]; p.tone = p.keep ? "strong" : "ink" })
      }
      return first
    }
    if (L.id === "key") {
      return u.key.map(function (t, j) { return piece(keyId(u, j), t, j < u.tn ? "strong" : "muted", j < u.tn) }).map(lastNoSpace)
    }
    if (L.id === "takeaway") {
      var inTopic = {}
      var chip = topicChip(u)
      chip.forEach(function (p) { inTopic[p.id] = true })
      var out = []
      for (var j = 0; j < u.tn; j++) {
        var kid = keyId(u, j)
        out.push(piece(kid, u.key[j], inTopic[kid] ? "strong" : "ink", !!inTopic[kid]))
      }
      return out.map(lastNoSpace)
    }
    return topicChip(u)
  }
  function lastNoSpace(p, i, all) { if (i === all.length - 1) p.sp = ""; return p }

  // The font a unit's words take at a level: "paper" (the author's words, serif) or "ui" (AI words, sans).
  function font(u, lv) {
    var L = level(lv)
    if (!L) return "paper"
    if (!L.ai) return "paper"
    return u && u.key.length ? "ui" : "paper"
  }

  // ---- Topic cards, the role filter, the margin's links

  function sectionsBack(m) { return m.sections.filter(function (s) { return s.back }).length }

  // The Topic level's grid: { kind: "card" | "head" | "back", ... }; back matter behind one button.
  function topicCards(m, showBack) {
    var out = [], placed = false, nBack = sectionsBack(m)
    m.sections.forEach(function (s) {
      if (s.back && !placed) {
        placed = true
        out.push({ kind: "back", count: nBack, expanded: !!showBack,
          label: (showBack ? "▾ Hide" : "▸ Show") + " appendices and back matter (" + nBack + (nBack === 1 ? " section)" : " sections)") })
      }
      if (s.back && !showBack) return
      if (!s.units.length) { out.push({ kind: "head", id: s.id, num: s.num, title: s.title }); return }
      out.push({ kind: "card", id: s.id, num: s.num, title: s.title, takeaway: s.takeaway, back: s.back,
        chips: s.units.map(function (uid) { var u = m.units[uid]; return { unit: uid, role: u.role, shape: SHAPES[u.role], pieces: pieces(u, "topic") } }) })
    })
    return out
  }

  // A section's units with a role filter on: { kind: "unit", id } and, for each run of hidden ones,
  // { kind: "stub", ids, roles, label }.
  function filterRuns(m, unitIds, only) {
    var out = [], run = null
    unitIds.forEach(function (id) {
      var u = m.units[id]
      if (!only || u.role === only) { run = null; out.push({ kind: "unit", id: id }); return }
      if (!run) { run = { kind: "stub", ids: [], roles: [] }; out.push(run) }
      run.ids.push(id)
      if (run.roles.indexOf(u.role) < 0) run.roles.push(u.role)
    })
    out.forEach(function (r) {
      if (r.kind !== "stub") return
      r.roles.sort(function (a, b) { return ROLES.indexOf(a) - ROLES.indexOf(b) })
      r.label = r.ids.length + (r.ids.length === 1 ? " paragraph" : " paragraphs") + " not shown: " + r.roles.join(", ")
    })
    return out
  }

  // The roles the paper has, in the filter's order.
  function rolesOf(m) {
    var have = {}
    m.order.forEach(function (id) { have[m.units[id].role] = true })
    return ROLES.filter(function (r) { return have[r] })
  }

  // The byline's names: TextFold's "Last, First" list, or Zotero's string as the bridge cites it ("Sirmon",
  // "Sirmon & Hitt", "Sirmon et al.") or as a list ("Rivera, Ana; Okafor, Ben"): surnames, four, then et al.
  function byline(authors) {
    var names = []
    ;(Array.isArray(authors) ? authors : [authors]).forEach(function (a) {
      String(a === null || a === undefined ? "" : a).split(";").forEach(function (n) {
        n = n.trim()
        if (!n) return
        if (/ et al\.?$| & /.test(n)) return names.push(n)
        var c = n.indexOf(",")
        names.push((c > 0 ? n.slice(0, c) : n).trim())
      })
    })
    names = names.filter(Boolean)
    if (names.length === 1) return names[0]
    return names.length > 4 ? names.slice(0, 4).join(", ") + " et al." : names.join(", ")
  }
  function plainText(ps) { return ps.map(function (p) { return p.t + p.sp }).join("").trim() }

  // A unit's topic words (its chip's text).
  function topicText(m, uid) { var u = m.units[uid]; return u ? plainText(topicChip(u)) : "" }

  // The margin's argument links of a unit: { to, rel, where, topic, label }.
  function linksOf(m, uid) {
    return m.links.filter(function (l) { return l.from === uid }).map(function (l) {
      var sec = null
      for (var i = 0; i < m.sections.length; i++) if (m.sections[i].id === m.units[l.to].section) sec = m.sections[i]
      var where = sec ? (sec.num ? "§" + sec.num : sec.title) : ""
      var rel = l.rel.replace(/_/g, " "), topic = topicText(m, l.to)
      return { to: l.to, rel: rel, where: where, topic: topic, label: "→ " + rel + " " + where + (topic ? " · " + topic : "") }
    })
  }

  // ---- the PDF's words and the link map (SPEC 5.4, 5.5; reader.js)

  function pdfNorm(s) { return String(s || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "") }

  // Every word on the pages in reading order, with its boxes in points: a word broken by a hyphen at a line's end is
  // one word, and so is a word the PDF wrote in two pieces. pages: [{ n, words: [[text, x0, y0, x1, y1]] }] (0 to 1);
  // sizes: [[w, h]] in points (612 by 792 when missing).
  function indexWords(pages, sizes) {
    var words = [], byPage = {}
    ;(pages || []).forEach(function (p) { if (p && p.n > 0) byPage[p.n] = (byPage[p.n] || []).concat(p.words || []) })
    var ns = Object.keys(byPage).map(Number).sort(function (a, b) { return a - b })
    ns.forEach(function (n) {
      var size = (sizes && sizes[n - 1]) || [612, 792], W = size[0], H = size[1]
      var lastY = null, lastEnd = null
      byPage[n].forEach(function (wd) {
        if (!Array.isArray(wd) || wd.length < 5) return
        var text = String(wd[0]), x0 = wd[1] * W, y0 = wd[2] * H, x1 = wd[3] * W, y1 = wd[4] * H
        if (!text.trim()) { lastEnd = null; return }
        var fh = (y1 - y0) || 8, base = y1
        var newLine = lastY === null || Math.abs(base - lastY) > fh * 0.5
        lastY = base
        var box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
        var w = pdfNorm(text), prev = words[words.length - 1]
        var glued = !newLine && lastEnd !== null && x0 - lastEnd < fh * 0.12
        var broken = newLine && prev && prev.hyph && prev.page === n
        lastEnd = x1
        if (!w) return
        if ((glued || broken) && prev) { prev.w += w; prev.boxes.push(box); prev.hyph = /[-‐]$/.test(text); return }
        words.push({ w: w, page: n, boxes: [box], hyph: /[-‐]$/.test(text) })
      })
    })
    var grams = Object.create(null)
    for (var i = 0; i + 2 < words.length; i++) {
      var k = words[i].w + " " + words[i + 1].w + " " + words[i + 2].w
      if (grams[k]) grams[k].push(i); else grams[k] = [i]
    }
    return { words: words, grams: grams, sizes: sizes || [] }
  }

  // A unit's words as the PDF has them (its math left out: an equation's symbols are drawn, not written).
  function unitWords(u) {
    var out = []
    u.toks.forEach(function (t) { if (t.k !== "math") { var w = pdfNorm(t.t); if (w) out.push(w) } })
    return out
  }

  // Where a paragraph is: its runs of three words found on the pages, the run of agreeing places they vote for, and the
  // words from its first match to its last (reader.js locate). → { lo, hi, page } or null.
  function locateUnit(uw, ix) {
    var hitsOf = function (i) { var a = ix.grams[uw[i] + " " + uw[i + 1] + " " + uw[i + 2]]; return a && a.length <= 30 ? a : null }
    if (uw.length < 3) return null
    var votes = Object.create(null), keys = [], i, j, hits, k
    for (i = 0; i + 2 < uw.length; i++) {
      hits = hitsOf(i) || []
      for (j = 0; j < hits.length; j++) {
        k = Math.round((hits[j] - i) / 8)
        if (votes[k] === undefined) { votes[k] = 0; keys.push(k) }
        votes[k]++
      }
    }
    var k0 = null, n0 = 0
    keys.forEach(function (kk) {
      var all = votes[kk] + (votes[kk - 1] || 0) + (votes[kk + 1] || 0)
      if (all > n0) { n0 = all; k0 = kk }
    })
    if (k0 === null || n0 < Math.max(2, Math.min(5, Math.floor((uw.length - 2) * 0.25)))) return null
    var lo = -1, hi = -1, lastI = 0
    for (i = 0; i + 2 < uw.length; i++) {
      hits = hitsOf(i) || []
      for (j = 0; j < hits.length; j++) {
        var h = hits[j]
        var ok = lo < 0 ? Math.abs(Math.round((h - i) / 8) - k0) <= 1 : h > hi - 2 && h - hi <= (i - lastI) + 40
        if (ok) { if (lo < 0) lo = h; hi = h + 2; lastI = i; break }
      }
    }
    return lo >= 0 ? { lo: lo, hi: hi, page: ix.words[lo].page } : null
  }

  // The words' boxes, one per line (reader.js boxesOf), back in 0 to 1 of their pages.
  function boxesOf(ix, lo, hi) {
    var lines = []
    for (var i = lo; i <= hi; i++) {
      var w = ix.words[i]
      for (var b = 0; b < w.boxes.length; b++) {
        var bx = w.boxes[b], line = null
        for (var l = 0; l < lines.length; l++) {
          var L = lines[l]
          if (L.page === w.page && Math.abs(L.y + L.h / 2 - (bx.y + bx.h / 2)) < bx.h * 0.45 && bx.x < L.x + L.w + bx.h * 3 && bx.x + bx.w > L.x - bx.h * 3) { line = L; break }
        }
        if (line) {
          var x1 = Math.max(line.x + line.w, bx.x + bx.w), y1 = Math.max(line.y + line.h, bx.y + bx.h)
          line.x = Math.min(line.x, bx.x); line.y = Math.min(line.y, bx.y); line.w = x1 - line.x; line.h = y1 - line.y
        } else lines.push({ page: w.page, x: bx.x, y: bx.y, w: bx.w, h: bx.h })
      }
    }
    var first = lines.length ? lines[0].page : 0
    return lines.map(function (L) {
      var size = ix.sizes[L.page - 1] || [612, 792]
      var box = [clamp(L.x / size[0]), clamp(L.y / size[1]), clamp((L.x + L.w) / size[0]), clamp((L.y + L.h) / size[1])].map(r5)
      if (L.page !== first) box.push(L.page)
      return box
    })
  }
  function clamp(v) { return Math.max(0, Math.min(1, v)) }
  function r5(v) { return Math.round(v * 1e5) / 1e5 }

  // Per page, the union of its word boxes padded by 0.02 (a page without words: a plain margin).
  function crops(pages, count) {
    var out = []
    for (var n = 1; n <= count; n++) out.push(null)
    ;(pages || []).forEach(function (p) {
      if (!p || !(p.n >= 1 && p.n <= count)) return
      ;(p.words || []).forEach(function (w) {
        if (!Array.isArray(w) || w.length < 5 || !String(w[0]).trim()) return
        var c = out[p.n - 1]
        if (!c) out[p.n - 1] = [w[1], w[2], w[3], w[4]]
        else out[p.n - 1] = [Math.min(c[0], w[1]), Math.min(c[1], w[2]), Math.max(c[2], w[3]), Math.max(c[3], w[4])]
      })
    })
    return out.map(function (c) {
      if (!c) return [0.06, 0.05, 0.94, 0.95]
      return [clamp(c[0] - 0.02), clamp(c[1] - 0.02), clamp(c[2] + 0.02), clamp(c[3] + 0.02)].map(r5)
    })
  }

  // Each unit's place on the pages: { map: { <unit>: { page, boxes } }, coverage: { linked, total }, crops, warn, noText }.
  function linkMap(m, pages, sizes) {
    var count = Math.max((sizes || []).length, (pages || []).reduce(function (a, p) { return Math.max(a, p.n || 0) }, 0))
    var ix = indexWords(pages, sizes)
    var map = {}, linked = 0
    m.order.forEach(function (id) {
      var at = locateUnit(unitWords(m.units[id]), ix)
      if (!at) return
      var boxes = boxesOf(ix, at.lo, at.hi)
      if (!boxes.length) return
      map[id] = { page: at.page, boxes: boxes }
      linked++
    })
    var total = m.order.length
    return { map: map, coverage: { linked: linked, total: total }, crops: crops(pages, count), warn: warnCoverage(linked, total), noText: ix.words.length === 0 }
  }
  function warnCoverage(linked, total) { return total > 0 && linked / total < 0.3 }

  // The coverage line: "Linked 11 of 12 paragraphs"; under 30%: the warning (SPEC 9).
  function coverageText(c) {
    var pct = c.total ? Math.round(c.linked / c.total * 100) : 0
    if (warnCoverage(c.linked, c.total)) return "⚠︎ Linked " + c.linked + " of " + c.total + " paragraphs (" + pct + "%): this PDF may not be the text TextFold folded"
    return "Linked " + c.linked + " of " + c.total + " paragraphs"
  }

  // links.json (SPEC 5.5): the map kept with what it was made from.
  function linksFile(m, result, pdf) {
    return {
      format: "zl-fold-links", version: 1, doc: { id: m.id, lang: m.lang, levels_made: m.provenance.levelsMade },
      pdf: { bytes: pdf && pdf.bytes || 0, modified: pdf && pdf.modified || "", pages: pdf && pdf.pages || result.crops.length },
      coverage: { linked: result.coverage.linked, total: result.coverage.total }, crops: result.crops, map: result.map
    }
  }

  function isNum01(v) { return typeof v === "number" && v >= 0 && v <= 1 }
  function validBox(b, pages) {
    return Array.isArray(b) && (b.length === 4 || (b.length === 5 && b[4] % 1 === 0 && b[4] >= 1 && b[4] <= pages)) &&
      isNum01(b[0]) && isNum01(b[1]) && isNum01(b[2]) && isNum01(b[3])
  }
  // Whether a links.json object is this doc's and this PDF's, and well made. doc: { id, lang, levels_made }; pdf:
  // { bytes, modified, pages }.
  function linksValid(links, doc, pdf) {
    if (!links || typeof links !== "object" || links.format !== "zl-fold-links" || links.version !== 1) return false
    var d = links.doc || {}, p = links.pdf || {}, want = doc || {}, have = pdf || {}
    if (d.id !== want.id || str(d.lang) !== str(want.lang) || str(d.levels_made) !== str(want.levels_made)) return false
    if (p.bytes !== have.bytes || str(p.modified) !== str(have.modified) || p.pages !== have.pages) return false
    if (!Array.isArray(links.crops) || links.crops.length !== p.pages || !links.crops.every(function (c) { return validBox(c, p.pages) && c.length === 4 })) return false
    var map = links.map
    if (!map || typeof map !== "object" || Array.isArray(map)) return false
    var cov = links.coverage || {}
    if (!(cov.linked >= 0 && cov.total >= cov.linked)) return false
    return Object.keys(map).every(function (id) {
      var e = map[id]
      return ID.test(id) && e && e.page % 1 === 0 && e.page >= 1 && e.page <= p.pages && Array.isArray(e.boxes) && e.boxes.length > 0 &&
        e.boxes.every(function (b) { return validBox(b, p.pages) })
    })
  }

  // ---- marks (SPEC 5.6)

  var MARK_ID = /^m-[a-z0-9]{6,16}$/
  var KINDS = ["highlight", "note", "ask"]
  var MAX_MARKS = 5000

  function collapse(s) { return String(s || "").replace(/\s+/g, " ").trim() }

  // The full token a piece id stands for, or null (a key word without a match, a gap, a topic word).
  function fullIndex(id) {
    var c = String(id).lastIndexOf(":")
    var tail = c >= 0 ? String(id).slice(c + 1) : ""
    return /^\d+$/.test(tail) ? Number(tail) : null
  }
  function unitOf(id) { var c = String(id).lastIndexOf(":"); return c >= 0 ? String(id).slice(0, c) : "" }

  function tokensText(u, from, to) {
    var s = ""
    for (var i = from; i <= to && i < u.toks.length; i++) s += u.toks[i].t + (i < to && u.toks[i].s ? " " : "")
    return s
  }

  // A selection's anchor: the selected pieces' ids (in order) to { unit, from, to, quote, highlight }. The first
  // piece's unit is the one anchored; pieces that stand for no word of the paper anchor to the whole unit
  // (from and to null) and can't be highlighted.
  function anchor(m, ids, selected) {
    if (!ids || !ids.length) return null
    var unit = unitOf(ids[0]), u = m.units[unit]
    if (!u) return null
    var idx = []
    ids.forEach(function (id) { if (unitOf(id) === unit) { var n = fullIndex(id); if (n !== null && n < u.toks.length) idx.push(n) } })
    var quote = collapse(selected)
    if (!idx.length) return { unit: unit, from: null, to: null, quote: quote.slice(0, 2000), highlight: false }
    var from = Math.min.apply(null, idx), to = Math.max.apply(null, idx)
    return { unit: unit, from: from, to: to, quote: collapse(tokensText(u, from, to)).slice(0, 2000), highlight: true }
  }

  // Which pieces a store's marks color: { <piece id>: true }, for a unit's pieces at any level.
  function marked(marks, unit, ps) {
    var ranges = (marks || []).filter(function (k) { return k.unit === unit && !k.lost && k.from !== null && k.from !== undefined })
    var out = {}
    if (!ranges.length) return out
    ps.forEach(function (p) {
      var n = fullIndex(p.id)
      if (n === null) return
      for (var i = 0; i < ranges.length; i++) if (n >= ranges[i].from && n <= ranges[i].to) { out[p.id] = true; return }
    })
    return out
  }

  // Whether every word of a range is under a highlight already.
  function highlighted(marks, a) {
    if (!a || a.from === null) return false
    var hs = (marks || []).filter(function (k) { return k.kind === "highlight" && k.unit === a.unit && !k.lost && k.from !== null })
    for (var i = a.from; i <= a.to; i++) if (!hs.some(function (k) { return i >= k.from && i <= k.to })) return false
    return true
  }

  // The store with a highlight on the anchor added, or (it was all highlighted) the highlights over it taken off.
  // now: an ISO time; rand: a function giving [0, 1) for the id.
  function newId(rand) {
    var s = "m-", a = "abcdefghijklmnopqrstuvwxyz0123456789"
    for (var i = 0; i < 10; i++) s += a.charAt(Math.floor((rand ? rand() : Math.random()) * 36) % 36)
    return s
  }
  function addMark(store, a, kind, now, rand) {
    var s = emptyStore(store)
    var mk = { id: newId(rand), kind: kind, unit: a.unit, from: a.from, to: a.to, quote: a.quote, text: "", created: now, updated: now }
    s.marks = s.marks.concat([mk])
    return { store: s, mark: mk }
  }
  function toggleHighlight(store, a, now, rand) {
    var s = emptyStore(store)
    if (highlighted(s.marks, a)) {
      s.marks = s.marks.filter(function (k) { return !(k.kind === "highlight" && k.unit === a.unit && k.from !== null && k.from <= a.to && k.to >= a.from) })
      return { store: s, removed: true }
    }
    return { store: addMark(s, a, "highlight", now, rand).store, removed: false }
  }
  function emptyStore(store) {
    var s = store && typeof store === "object" ? store : {}
    return { format: "zl-fold-marks", version: 1, paper: str(s.paper), doc: { id: str(s.doc && s.doc.id), lang: str(s.doc && s.doc.lang) },
      marks: Array.isArray(s.marks) ? s.marks.slice() : [] }
  }

  // Where a quote reads in a unit's full tokens: [from, to] or null (whitespace-normalized, exact; it starts and ends
  // on a token's edge).
  function findQuote(u, quote) {
    var want = collapse(quote)
    if (!want) return null
    var text = "", starts = {}, ends = {}
    for (var i = 0; i < u.toks.length; i++) {
      starts[text.length] = i
      text += u.toks[i].t
      ends[text.length] = i
      if (u.toks[i].s && i < u.toks.length - 1) text += " "
    }
    var at = text.indexOf(want)
    while (at >= 0) {
      if (starts[at] !== undefined && ends[at + want.length] !== undefined) return [starts[at], ends[at + want.length]]
      at = text.indexOf(want, at + 1)
    }
    return null
  }

  // The marks laid on this doc (another fold may have moved the words): a mark whose words still read as its quote
  // stays; else its quote is searched in its unit, then in every unit; not found, it has lost its place (lost: true,
  // kept in the file). → { store, moved, lost }
  function reanchor(m, store) {
    var s = emptyStore(store), moved = 0, lost = 0
    s.marks = s.marks.map(function (k) {
      var x = {}
      for (var f in k) if (own(k, f) && f !== "lost") x[f] = k[f]
      var u = m.units[x.unit]
      if (x.from === null || x.from === undefined) {
        if (u) return x
        x.lost = true; lost++
        return x
      }
      if (u && x.to < u.toks.length && collapse(tokensText(u, x.from, x.to)) === collapse(x.quote)) return x
      var at = u ? findQuote(u, x.quote) : null
      var where = at ? x.unit : null
      for (var i = 0; !at && i < m.order.length; i++) {
        at = findQuote(m.units[m.order[i]], x.quote)
        if (at) where = m.order[i]
      }
      if (!at) { x.lost = true; lost++; return x }
      x.unit = where; x.from = at[0]; x.to = at[1]; moved++
      return x
    })
    return { store: s, moved: moved, lost: lost }
  }

  // A marks.json text read: { store, dropped, damaged } (damaged: not JSON, or not a marks file: never overwritten).
  function parseMarks(text) {
    var o
    try { o = JSON.parse(String(text)) } catch (e) { return { store: null, dropped: 0, damaged: true } }
    if (!o || typeof o !== "object" || Array.isArray(o) || o.format !== "zl-fold-marks" || o.version !== 1 || !Array.isArray(o.marks)) {
      return { store: null, dropped: 0, damaged: true }
    }
    var out = cleanStore(o)
    return { store: out.store, dropped: out.dropped, damaged: false }
  }
  function isTime(v) { return typeof v === "string" && v.length <= 40 && /^\d{4}-\d\d-\d\dT/.test(v) }
  function cleanMark(k) {
    if (!k || typeof k !== "object" || Array.isArray(k)) return null
    if (!MARK_ID.test(String(k.id)) || KINDS.indexOf(k.kind) < 0 || !ID.test(String(k.unit))) return null
    var whole = k.from === null && k.to === null
    if (!whole && !(typeof k.from === "number" && typeof k.to === "number" && k.from % 1 === 0 && k.to % 1 === 0 && k.from >= 0 && k.from <= k.to)) return null
    if (typeof k.quote !== "string" || k.quote.length > 2000) return null
    if (typeof k.text !== "string" || k.text.length > 20000) return null
    if (!isTime(k.created) || !isTime(k.updated)) return null
    return { id: k.id, kind: k.kind, unit: k.unit, from: whole ? null : k.from, to: whole ? null : k.to, quote: k.quote, text: k.text, created: k.created, updated: k.updated }
  }
  function cleanStore(o) {
    var marks = [], dropped = 0, seen = {}
    ;(o.marks || []).forEach(function (k) {
      var c = cleanMark(k)
      if (!c || seen[c.id] || marks.length >= MAX_MARKS) { dropped++; return }
      seen[c.id] = true
      marks.push(c)
    })
    var d = o.doc && typeof o.doc === "object" ? o.doc : {}
    return { store: { format: "zl-fold-marks", version: 1, paper: str(o.paper).slice(0, 200), doc: { id: str(d.id).slice(0, 200), lang: str(d.lang).slice(0, 40) }, marks: marks }, dropped: dropped }
  }
  // The store as marks.json's text (invalid marks and unknown keys dropped). → { text, dropped } or { error }
  function marksText(store) {
    if (!store || typeof store !== "object" || Array.isArray(store) || !Array.isArray(store.marks)) return { error: "not a marks store" }
    var out = cleanStore(store)
    return { text: JSON.stringify(out.store, null, 1) + "\n", dropped: out.dropped }
  }

  return {
    LEVELS: LEVELS, ROLES: ROLES, SHAPES: SHAPES, LIMITS: LIMITS, level: level, role: role,
    tokenize: tokenize, norm: norm, lcsPairs: lcsPairs, splitSentences: splitSentences, locateTopic: locateTopic, headWords: headWords,
    check: check, model: model, pieces: pieces, font: font, plainText: plainText, byline: byline, topicText: topicText,
    topicCards: topicCards, filterRuns: filterRuns, rolesOf: rolesOf, linksOf: linksOf,
    pdfNorm: pdfNorm, indexWords: indexWords, unitWords: unitWords, locateUnit: locateUnit, crops: crops, linkMap: linkMap,
    coverageText: coverageText, linksFile: linksFile, linksValid: linksValid,
    fullIndex: fullIndex, anchor: anchor, marked: marked, highlighted: highlighted, addMark: addMark, toggleHighlight: toggleHighlight,
    emptyStore: emptyStore, findQuote: findQuote, reanchor: reanchor, parseMarks: parseMarks, marksText: marksText, MAX_MARKS: MAX_MARKS
  }
})()

if (typeof module !== "undefined" && module.exports) module.exports = FoldCore
