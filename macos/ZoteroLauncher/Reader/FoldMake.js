// The fold reader's own extraction and the fold's glue (docs/fold-reader/R5-SPEC.md sections 3 and 5.3): a PDF's
// lines (FoldPDF.lines' payload) read into the reader's doc and its link map; the fold command's input; a fold's
// section merged into the doc; the page's fold object; a cost as text. Pure: no window, no page, no timers. Loaded by
// JavaScriptCore (FoldMaker.swift's own context, and Glue after FoldCore.js) and Node, as plain ES5 (its regexes use
// the u flag).
//
// Ported from TextFold (github.com/chenxiachan/textfold, commit f0e5b607eb01b74ac1efeadc6883ad48b3aaaa42),
// Copyright 2026 Xia Chen, Apache License 2.0 (TEXTFOLD-LICENSE.txt beside this file): textfold/pdftext.py (_join,
// _body_size, _frame, _lines' gap rule, _running_heads, _title, _heading_of, _joined_headings, PAGE_NO, STAMP,
// CAPTION_AT, TABLE_AT) and textfold/pdfdoc.py (ABSTRACT, REFS, NUMBERED, FRONT, BOILER, depth). Changed: rewritten
// in ES5 JavaScript; fed PDFKit's lines (words with boxes, sizes, bold) instead of pdf-inspector's Markdown and
// MinerU's blocks; the blocks, kinds, sections and ids are this reader's; English and other alphabetic languages only.
var FoldMake = (function () {
  "use strict"

  var C = typeof FoldCore !== "undefined" ? FoldCore : require("./FoldCore.js")

  var EXTRACTOR = 2
  var APPARATUS = { reference: 1, footnote: 1, equation: 1 }

  // ---- TextFold's patterns (pdftext.py, pdfdoc.py)

  var PAGE_NO = /^\W*\d{1,4}\W*$/
  var STAMP = /^arXiv:\d{4}\.\d{4,5}(?:v\d+)?\s*\[[^\]]+\]\s+\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/
  var CAPTION_AT = /^\s*(?:fig(?:ure)?\.?|scheme|chart|abb(?:ildung)?\.?|图)\s*[A-Z]?\d+[a-z]?\s*(?:[:.|]|$)/i
  var TABLE_AT = /^\s*(?:table|tab\.|tabelle|表)\s*[A-Z]?\d+[a-z]?\s*(?:[:.|]|$)/i
  var REFS = /^\s*(?:\d+\.?\s*)?(?:references|bibliography|literature|works cited|literatur|参考文献)\s*$/i
  var ABSTRACT = /^\s*(?:abstract|a b s t r a c t|summary|zusammenfassung|摘要)\s*$/i
  var NUMBERED = /^(?:[1-9]\d*(?:\.\d+){0,3}|[IVX]+)\.?\s+[A-Z](?:[^.!?]|[.](?=\S)|[A-Z][.]){1,80}$/
  var BOILER = /^\W*\d?\s*(?:check for updates|open access|research article|article|original article|review)\W*$/i
  var FRONT = /^(?:<sup>|\d+\s*[A-Z][a-z]+ (?:of|for)\b|(?:received|accepted|published|revised|correspondence|e-?mail|keywords?)\b)|@/i
  var DEPTH = /^\s*((?:\d+|[A-Z]|[IVX]+)(?:[.\-]\d+)*)[.)]?\s+\S/
  // (this reader's)
  var LIST = /^\s*(?:[-*•▪◦–]|\(?\d{1,2}[.)]|\([a-z]\))\s+\S/
  var BULLET = /^[-*•▪◦–]$/
  var FOOTMARK = /^\s*(?:\d{1,2}|[*†‡§¶])\s?\S/
  var SHORT_END = /[.?!:][)\]”"’]*$/
  var SENTENCE_END = /[.?!][)\]}”"’']*$/
  var EQ_NUMBER = /\(\d{1,3}[a-z]?\)$/
  var HEAD_NUM = /^((?:[1-9]\d*(?:\.\d+){0,3}|[IVX]+))\.?\s+(\S.*)$/
  var LETTER_NUM = /^([A-Z](?:\.\d+)*)[.:]?\s+(\S.*)$/
  var APPENDIX = /^(?:appendix|appendices)\b/i
  var REF_START = /^\s*(?:\[\d{1,4}\]|\d{1,4}\.\s)/
  // (IEEE's: a Roman numeral and a title in capitals, "I. INTRODUCTION"; its sub-sections "A. Background"; its
  // unnumbered capitals; a heading's numbering, as an outline or a heading gives it)
  var ROMAN_HEAD = /^[IVX]{1,6}\.\s+[\p{Lu}\d][\p{Lu}\d\s&,:;’'()\/–—-]*$/u
  var LETTER_HEAD = /^[A-Z]\.\s+\p{Lu}/u
  var CAPS_HEAD = /^(?:ACKNOWLEDG(?:E)?MENTS?|APPENDI(?:X|CES)(?:\s+[A-Z])?)$/
  var NUMBERING = /^\s*(?:\d+(?:[.\-]\d+)*|[IVX]+(?:-[A-Z]\d*)?|[A-Z](?:[.\-]\d+)*)[.):]?\s+/
  var KEEP_HEAD = /^\W*(?:\d+\.?\s+)?(?:acknowledge?ments?|funding|author(?:s'|s’)? contributions?|data availability|(?:conflicts?|declarations?) of interests?|competing interests?|declarations?|appendi(?:x|ces)|supporting information|supplementary)\b/i
  var TWO_SENTENCES = /\p{Ll}{2}[.!?]\s+\p{Lu}/u
  var DECIMAL = /(?:^|\s)\d+\.\d+(?:\s|$)/
  var LIGATURES = { "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st" }
  var MIN_PAGE_CHARS = 40

  function clean(t) {
    return String(t == null ? "" : t).replace(/[ﬀ-ﬆ]/g, function (ch) { return LIGATURES[ch] || ch }).replace(/­/g, "").replace(/\s+/g, "")
  }
  function r6(v) { return Math.round(v * 1e6) / 1e6 }
  function clamp01(v) { return Math.max(0, Math.min(1, v)) }
  function pct(sorted, i) { return sorted[Math.max(0, Math.min(sorted.length - 1, i))] }
  function wordSet(s) {
    var out = {}
    ;(String(s || "").toLowerCase().match(/[\p{L}\p{N}_]+/gu) || []).forEach(function (w) { out[w] = true })
    return out
  }
  function size(o) { return Object.keys(o).length }
  function common(a, b) { var n = 0; for (var k in a) if (b[k]) n++; return n }
  function jaccard(a, b) { var i = common(a, b), u = size(a) + size(b) - i; return u ? i / u : 0 }

  // ---- 1. segments: a line cut where its words stand apart (pdftext._lines)

  function segmentsOf(pages) {
    var segs = [], lines = 0, chars = 0, perPage = []
    pages.forEach(function (p, pi) {
      var n = p && p.n >= 1 ? p.n : pi + 1
      var W = p && p.size && p.size[0] > 0 ? p.size[0] : 612, H = p && p.size && p.size[1] > 0 ? p.size[1] : 792
      var pc = 0
      ;((p && p.lines) || []).forEach(function (l) {
        if (!l || !Array.isArray(l.w)) return
        var sz = Number(l.s) > 0 ? Number(l.s) : 10
        var ws = []
        l.w.forEach(function (w) {
          if (!Array.isArray(w) || w.length < 5) return
          var t = clean(w[0])
          if (!t) return
          ws.push({ t: t, x0: w[1] * W, y0: w[2] * H, x1: w[3] * W, y1: w[4] * H, page: n, W: W, H: H })
        })
        if (!ws.length) return
        smallCaps(ws)
        lines++
        ws.forEach(function (w) { pc += w.t.length })
        // (cut where its words stand 1.5 sizes apart; a line cut so takes each side's weight from it, half, and its
        // size too, unless a piece is an equation's number "(n)": a display equation beside it keeps the line's size,
        // or its taller boxes would make it a heading)
        var cuts = [0]
        ws.forEach(function (w, i) { if (i && w.x0 - ws[i - 1].x1 > 1.5 * sz) cuts.push(i) })
        cuts.push(ws.length)
        var whole = segment(ws, n, W, H, sz, Number(l.f) || 0, Math.min(Number(l.lb) || 0, ws.length), String(l.fn || ""))
        if (cuts.length === 2) segs.push(whole)
        else {
          var few = false
          for (var k = 1; k < cuts.length; k++) if (cuts[k] - cuts[k - 1] === 1 && /^\(\d+(\.\d+)*[a-z]?\)$/.test(ws[cuts[k - 1]].t)) few = true
          for (var c = 1; c < cuts.length; c++) segs.push(half(whole, cuts[c - 1], cuts[c], few))
        }
      })
      chars += pc
      perPage.push(pc)
    })
    return { segs: segs, lines: lines, chars: chars, perPage: perPage }
  }
  // IEEE's small capitals set by hand (a capital, then smaller capitals: "I NTRODUCTION", as two words when PDFKit
  // sees the gap the size change leaves): one word, its boxes' union.
  function smallCaps(ws) {
    for (var i = 0; i + 1 < ws.length; i++) {
      var a = ws[i], b = ws[i + 1], ha = a.y1 - a.y0, hb = b.y1 - b.y0
      if (!/^\p{Lu}$/u.test(a.t) || !/^\p{Lu}[\p{Lu}’'.,:\-]*$/u.test(b.t) || !/\p{Lu}{2}/u.test(b.t)) continue
      if (ha <= 0 || b.x0 - a.x1 > 0.25 * ha || hb >= 0.92 * ha || hb < 0.5 * ha) continue
      ws.splice(i, 2, { t: a.t + b.t, x0: a.x0, y0: Math.min(a.y0, b.y0), x1: b.x1, y1: Math.max(a.y1, b.y1), page: a.page, W: a.W, H: a.H })
    }
  }
  function segment(words, page, W, H, sz, f, lb, fn) {
    var s = { page: page, W: W, H: H, words: words, size: sz, f: f, lb: lb, fn: fn || "", x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, chars: 0 }
    words.forEach(function (w) {
      s.x0 = Math.min(s.x0, w.x0); s.y0 = Math.min(s.y0, w.y0); s.x1 = Math.max(s.x1, w.x1); s.y1 = Math.max(s.y1, w.y1)
      s.chars += w.t.length
    })
    s.text = words.map(function (w) { return w.t }).join(" ")
    return s
  }
  function boldAll(s) { return (s.f & 1) === 1 || (s.lb > 0 && s.lb >= s.words.length) }

  // ---- 3. what never reads as text: page numbers, running heads, stamps (pdftext._running_heads, STAMP)

  function headKey(text) {
    if (text.split(" ").length > 20) return null
    return text.toLowerCase().replace(/\d+/g, "#")
  }
  function dropFurniture(segs, pageCount) {
    var inBand = function (s) { var m = (s.y0 + s.y1) / 2; return m < 0.07 * s.H || m > 0.93 * s.H }
    var pagesOf = {}
    segs.forEach(function (s) {
      if (!inBand(s)) return
      var k = headKey(s.text)
      if (k === null) return
      ;(pagesOf[k] = pagesOf[k] || {})[s.page] = true
    })
    var need = Math.max(2, Math.ceil(pageCount / 2))
    // (heads that alternate, one on odd pages and one on even: each counted against its pages' half)
    var odd = Math.ceil(pageCount / 2), even = Math.floor(pageCount / 2)
    var running = function (k) {
      var ps = Object.keys(pagesOf[k] || {}).map(Number)
      if (ps.length >= need) return true
      var odds = ps.filter(function (n) { return n % 2 === 1 }).length
      if (ps.length < 2) return false
      if (odds === ps.length) return ps.length >= Math.max(2, Math.ceil(odd / 2))
      if (odds === 0) return ps.length >= Math.max(2, Math.ceil(even / 2))
      return false
    }
    return segs.filter(function (s) {
      if (inBand(s)) {
        if (PAGE_NO.test(s.text)) return false
        var k = headKey(s.text)
        if (k !== null && running(k)) return false
      }
      if (STAMP.test(s.text)) return false
      if (s.y1 - s.y0 > 3 * (s.x1 - s.x0) && s.chars >= 10) return false
      if (BOILER.test(s.text)) return false
      return true
    })
  }

  // ---- 2. the body size and the frame (pdftext._body_size, _frame)

  function bodySize(segs) {
    var sizes = segs.map(function (s) { return [Math.round(s.size * 2) / 2, s.chars] }).sort(function (a, b) { return a[0] - b[0] })
    var half = sizes.reduce(function (a, x) { return a + x[1] }, 0) / 2, seen = 0
    for (var i = 0; i < sizes.length; i++) { seen += sizes[i][1]; if (seen >= half) return sizes[i][0] }
    return 10
  }
  function frameOf(segs, body) {
    var prose = segs.filter(function (s) { return Math.abs(s.size - body) < 0.6 })
    if (!prose.length) prose = segs
    if (!prose.length) return { left: 0, right: 612, col: 612, two: false, mid: 306 }
    var lefts = prose.map(function (s) { return s.x0 }).sort(function (a, b) { return a - b })
    var rights = prose.map(function (s) { return s.x1 }).sort(function (a, b) { return a - b })
    var widths = prose.map(function (s) { return s.x1 - s.x0 }).sort(function (a, b) { return a - b })
    var n = prose.length
    var left = pct(lefts, Math.floor(n / 20)), right = pct(rights, n - 1 - Math.floor(n / 20)), col = pct(widths, Math.floor(n * 0.9))
    return { left: left, right: right, col: col, two: col < 0.7 * (right - left), mid: (left + right) / 2 }
  }

  // Two columns' lines PDFKit gave as one (on one baseline, a narrow gutter under the 1.5 × size cut): cut again at
  // the gap over the frame's middle when it is 0.5 × size or wider and twice the line's other gaps (a justified line
  // across the page has its spaces alike).
  function recut(segs, fr) {
    if (!fr.two) return segs
    var out = []
    segs.forEach(function (s) {
      if (!(s.x0 < fr.mid - s.size && s.x1 > fr.mid + s.size) || s.words.length < 4) { out.push(s); return }
      var gaps = []
      for (var i = 1; i < s.words.length; i++) gaps.push({ i: i, a: s.words[i - 1].x1, b: s.words[i].x0 })
      var at = null
      gaps.forEach(function (g) { if (g.a <= fr.mid + s.size && g.b >= fr.mid - s.size && (!at || g.b - g.a > at.b - at.a)) at = g })
      if (!at || at.b - at.a < 0.5 * s.size) { out.push(s); return }
      var others = gaps.filter(function (g) { return g !== at }).map(function (g) { return g.b - g.a }).sort(function (a, b) { return a - b })
      var typical = others.length ? others[Math.floor(others.length / 2)] : 0
      if (at.b - at.a < 2 * typical) { out.push(s); return }
      out.push(half(s, 0, at.i))
      out.push(half(s, at.i, s.words.length))
    })
    return out
  }

  // Words from..to of a line cut in two, each side its own size and weight as far as the line says: the size scaled by
  // its words' height against the line's, bold for most of its words when the bold start (lb) covers them.
  function half(s, from, to, keepSize) {
    var ws = s.words.slice(from, to)
    var mid = function (list) { var h = list.map(function (w) { return w.y1 - w.y0 }).sort(function (a, b) { return a - b }); return h[Math.floor(h.length / 2)] }
    // (the line's size is its characters' mean: scaled to each side by its words' heights, as a size is a height)
    var chars = 0, sum = 0
    s.words.forEach(function (w) { chars += w.t.length; sum += (w.y1 - w.y0) * w.t.length })
    var own = mid(ws), size = s.size
    if (!keepSize && chars && sum > 0 && own > 0) size = Math.round(s.size * own / (sum / chars) * 2) / 2
    var bold = Math.max(0, Math.min(s.lb, to) - from)
    var f = (s.f & ~1) | (bold * 2 > ws.length ? 1 : 0)
    return segment(ws, s.page, s.W, s.H, size, f, from === 0 ? Math.min(s.lb, to) : 0, s.fn)
  }

  // A line still across the middle of a page whose other lines show two columns (5 or more of 4 words or more each
  // side: the gutter runs from the left ones' right edge to the right ones' left edge) is cut at the gap that is the
  // gutter, its ends within a size of those edges, when that gap is half a size or wider and 1.5 times the line's
  // other gaps (a loosely justified line's spaces of 7 or 8 pt keep a 14.5 pt gutter under recut's twice); kept, as
  // recut's cuts are, when the frame then reads as two columns.
  function gutterOf(segs, fr) {
    var lefts = [], rights = []
    segs.forEach(function (s) {
      if (s.words.length < 4) return
      if (s.x1 <= fr.mid) lefts.push(s.x1)
      else if (s.x0 >= fr.mid) rights.push(s.x0)
    })
    if (lefts.length < 5 || rights.length < 5) return null
    lefts.sort(function (a, b) { return a - b })
    rights.sort(function (a, b) { return a - b })
    var a = pct(lefts, Math.floor(lefts.length * 0.9)), b = pct(rights, Math.floor(rights.length * 0.1))
    return b > a ? { a: a, b: b } : null
  }
  function cutGutter(segs, fr) {
    var g = fr.two ? gutterOf(segs, fr) : null
    if (!g) return segs
    var out = []
    segs.forEach(function (s) {
      if (!(s.x0 < g.a - s.size && s.x1 > g.b + s.size) || s.words.length < 4) { out.push(s); return }
      var gaps = []
      for (var i = 1; i < s.words.length; i++) gaps.push({ i: i, a: s.words[i - 1].x1, b: s.words[i].x0 })
      var at = null
      gaps.forEach(function (x) { if (Math.abs(x.a - g.a) <= s.size && Math.abs(x.b - g.b) <= s.size && (!at || x.b - x.a > at.b - at.a)) at = x })
      if (!at || at.b - at.a < 0.5 * s.size) { out.push(s); return }
      var others = gaps.filter(function (x) { return x !== at }).map(function (x) { return x.b - x.a }).sort(function (a, b) { return a - b })
      var typical = others.length ? others[Math.floor(others.length / 2)] : 0
      if (at.b - at.a < 1.5 * typical) { out.push(s); return }
      out.push(half(s, 0, at.i))
      out.push(half(s, at.i, s.words.length))
    })
    return out
  }

  // ---- 4. reading order: bands cut by what spans both columns, the left column then the right

  function flowsOf(segs, fr, body) {
    var byPage = {}, pagesSeen = []
    segs.forEach(function (s) { if (!byPage[s.page]) { byPage[s.page] = []; pagesSeen.push(s.page) } byPage[s.page].push(s) })
    pagesSeen.sort(function (a, b) { return a - b })
    var flows = []
    pagesSeen.forEach(function (n) {
      var ps = byPage[n].sort(function (a, b) { return a.y0 - b.y0 || a.x0 - b.x0 })
      ps.forEach(function (s, i) {
        s.side = !fr.two ? "one" : s.x1 <= fr.mid + 6 ? "L" : s.x0 >= fr.mid - 6 ? "R" : "S"
        // (a spanning paragraph's short last line spans too)
        var prev = i > 0 ? ps[i - 1] : null
        if (s.side === "L" && prev && prev.side === "S" && s.y0 >= prev.y1 - 1 && s.y0 - prev.y1 <= Math.max(0.6 * s.size, 0.3 * body) &&
            Math.abs(s.x0 - prev.x0) <= 0.8 * s.size && Math.abs(s.size - prev.size) <= 0.6) s.side = "S"
      })
      var band = 0, span = null, cols = null
      var closeCols = function () {
        if (!cols) return
        if (cols.L.segs.length) flows.push(cols.L)
        if (cols.R.segs.length) flows.push(cols.R)
        cols = null
        band++
      }
      ps.forEach(function (s) {
        if (s.side === "S") {
          closeCols()
          if (!span) { span = { key: n + ":" + band + ":S", page: n, side: "S", segs: [] }; flows.push(span) }
          span.segs.push(s)
        } else {
          if (span) { span = null; band++ }
          if (s.side === "one") {
            if (!cols) cols = { L: { key: n + ":" + band + ":one", page: n, side: "one", segs: [] }, R: { segs: [] } }
            cols.L.segs.push(s)
          } else {
            if (!cols) cols = { L: { key: n + ":" + band + ":L", page: n, side: "L", segs: [] }, R: { key: n + ":" + band + ":R", page: n, side: "R", segs: [] } }
            cols[s.side].segs.push(s)
          }
        }
      })
      closeCols()
    })
    flows.forEach(function (f) { f.segs.sort(function (a, b) { return a.y0 - b.y0 || a.x0 - b.x0 }) })
    return flows
  }
  // Each side's edges, from the whole document's body segments.
  function edgesOf(segs, fr, body) {
    var bodyOf = function (side) { return segs.filter(function (s) { return s.side === side && Math.abs(s.size - body) < 0.6 }) }
    var Ls = bodyOf("L").map(function (s) { return s.x1 }).sort(function (a, b) { return a - b })
    var Rs = bodyOf("R").map(function (s) { return s.x0 }).sort(function (a, b) { return a - b })
    var lRight = Ls.length ? pct(Ls, Ls.length - 1 - Math.floor(Ls.length / 20)) : fr.left + fr.col
    var rLeft = Rs.length ? pct(Rs, Math.floor(Rs.length / 20)) : fr.right - fr.col
    return { one: [fr.left, fr.right], S: [fr.left, fr.right], L: [fr.left, lRight], R: [rLeft, fr.right] }
  }

  // ---- 5. blocks; a table's rows dropped first

  function sameRow(a, b) { return Math.abs(a.y0 - b.y0) < 0.5 * Math.min(a.size, b.size) }
  function dropTables(flow) {
    var rows = []
    flow.segs.forEach(function (s) {
      var r = rows[rows.length - 1]
      if (r && sameRow(r[0], s)) r.push(s)
      else rows.push([s])
    })
    var keep = []
    for (var i = 0; i < rows.length;) {
      var j = i
      while (j < rows.length && rows[j].length >= 3) j++
      if (j - i >= 2) { i = j; continue }
      if (j === i) j = i + 1
      for (var k = i; k < j; k++) keep = keep.concat(rows[k])
      i = j
    }
    flow.segs = keep
  }
  function medianGap(flows, body) {
    var gaps = []
    flows.forEach(function (f) {
      for (var i = 1; i < f.segs.length; i++) {
        var a = f.segs[i - 1], b = f.segs[i]
        if (sameRow(a, b) || Math.abs(a.size - body) >= 0.6 || Math.abs(b.size - body) >= 0.6) continue
        var g = b.y0 - a.y1
        if (g >= 0 && g < 2 * body) gaps.push(g)
      }
    })
    if (!gaps.length) return 0.2 * body
    gaps.sort(function (a, b) { return a - b })
    return gaps[Math.floor(gaps.length / 2)]
  }
  // The median distance from one body line's top to the next's, in a flow.
  function medianPitch(flows, body) {
    var d = []
    flows.forEach(function (f) {
      for (var i = 1; i < f.segs.length; i++) {
        var a = f.segs[i - 1], b = f.segs[i]
        if (sameRow(a, b) || Math.abs(a.size - body) >= 0.6 || Math.abs(b.size - body) >= 0.6) continue
        var g = b.y0 - a.y0
        if (g > 0 && g < 3 * body) d.push(g)
      }
    })
    if (!d.length) return 1.2 * body
    d.sort(function (a, b) { return a - b })
    return d[Math.floor(d.length / 2)]
  }
  function blocksOf(flows, edges, body, gapMedian) {
    var blocks = [], pitch = medianPitch(flows, body)
    flows.forEach(function (f) {
      var e = edges[f.side] || edges.one
      var cur = null
      f.segs.forEach(function (s, i) {
        var indent = function (x) { return x.x0 - e[0] > 0.8 * x.size }
        var brk = !cur
        if (cur) {
          var p = cur.segs[cur.segs.length - 1]
          if (sameRow(p, s)) brk = Math.abs(s.size - p.size) > 0.6 || boldAll(s) !== boldAll(p)
          else {
            brk = s.y0 - p.y1 > Math.max(0.6 * s.size, 1.5 * gapMedian) ||
              Math.abs(s.size - p.size) > 0.6 ||
              boldAll(s) !== boldAll(p) ||
              LIST.test(s.text) || CAPTION_AT.test(s.text) || TABLE_AT.test(s.text) ||
              (!cur.list && indent(s) && !indent(p) && !(fullyBold(s) && fullyBold(p))) ||
              (e[1] - p.x1 > 3 * p.size && SHORT_END.test(p.text)) ||
              headLine(p, e, f.segs[i - 2], s, pitch) || headLine(s, e, p, f.segs[i + 1], pitch)
          }
        }
        if (brk) {
          cur = { flow: f, segs: [], list: LIST.test(s.text), edges: e }
          blocks.push(cur)
        }
        cur.segs.push(s)
      })
    })
    blocks.forEach(function (b, i) {
      b.index = i
      b.size = b.segs[0].size
      b.words = joinWords(b.segs, 0)
      b.text = textOf(b.words)
      b.lines = rowsOf(b.segs)
    })
    return blocks
  }
  // A line that stands as a heading at the body's size and weight (IEEE's centred "I. INTRODUCTION"): a short line
  // centred in its column, or a short numbered one that stands apart: first in its flow, after a paragraph's end (the
  // line above ends a sentence), 1.3 line pitches or more below the line above, or with a new paragraph after it (a
  // ragged line "12 Patients were seen in" mid-paragraph is none). The paragraph after it starts a block of its own.
  function headLine(s, e, above, below, pitch) {
    var w = e[1] - e[0]
    if (s.x1 - s.x0 > 0.7 * w || s.words.length > 10 || SENTENCE_END.test(s.text)) return false
    if (s.x0 - e[0] > 2 * s.size && Math.abs((s.x0 + s.x1) / 2 - (e[0] + e[1]) / 2) <= 0.05 * w) return true
    // (IEEE's sub-section, its own line in italics: "A. Background")
    if (LETTER_HEAD.test(s.text) && s.words.length <= 8 && ((s.f & 2) === 2 || boldAll(s))) return true
    if (!NUMBERED.test(s.text)) return false
    if (!above || sameRow(above, s) || SENTENCE_END.test(above.text) || s.y0 - above.y0 >= 1.3 * pitch) return true
    return !!below && below.x0 - e[0] > 0.8 * below.size && !(s.x0 - e[0] > 0.8 * s.size)
  }
  function rowsOf(segs) {
    var n = 0
    segs.forEach(function (s, i) { if (i === 0 || !sameRow(segs[i - 1], s)) n++ })
    return n
  }

  // ---- 8. words joined across lines (pdftext._join): "skim- ming" is one word, "OCR- free" keeps its hyphen

  function joinWords(segs, skip) {
    var out = []
    segs.forEach(function (s, si) {
      s.words.forEach(function (w, wi) {
        if (si === 0 && wi < skip) return
        var prev = out[out.length - 1]
        var part = { seg: s, w: w }
        if (prev && wi === 0 && si > 0 && /[-‐]$/.test(prev.t) && /^[a-z]/.test(w.t)) {
          var before = prev.t.slice(0, -1)
          if (/[a-z]$/.test(before)) { prev.t = before + w.t; prev.parts.push(part); return }
          if (/[A-Za-z0-9]$/.test(before)) { prev.t = prev.t + w.t; prev.parts.push(part); return }
        }
        out.push({ t: w.t, parts: [part] })
      })
    })
    return out
  }
  function textOf(words) { return words.map(function (w) { return w.t }).join(" ") }
  function joinTo(a, b) {
    var prev = a[a.length - 1], first = b[0]
    var out = a.slice()
    if (prev && first && /[-‐]$/.test(prev.t) && /^[a-z]/.test(first.t)) {
      var before = prev.t.slice(0, -1)
      var merged = /[a-z]$/.test(before) ? before + first.t : /[A-Za-z0-9]$/.test(before) ? prev.t + first.t : null
      if (merged !== null) {
        out[out.length - 1] = { t: merged, parts: prev.parts.concat(first.parts) }
        return out.concat(b.slice(1))
      }
    }
    return out.concat(b)
  }

  // ---- 6. kinds

  function letters(s) {
    var t = s.replace(/\s+/g, "")
    var l = (t.match(/\p{L}/gu) || []).length
    return t.length ? l / t.length : 1
  }
  // A heading run into its paragraph's first line, bold: every bold word at its start when they name a numbered
  // heading or the references, or an abstract before the body's first heading (early); else, early, the shortest bold
  // start that names an abstract or the references and ends in a full stop, a colon or a dash, or has a dash after it
  // (IEEE's bold-italic "Abstract" and its dash before an abstract set in bold). "Summary statistics." or
  // "References to earlier work." mid-paper starts a paragraph.
  function runIn(b, early) {
    var first = b.segs[0]
    if (!first.lb) return null
    var lead = function (k) { return first.words.slice(0, k).map(function (w) { return w.t }).join(" ").replace(/[.:—–-]+$/, "") }
    var k = 0
    if (!(first.lb >= first.words.length && b.segs.length === 1)) {
      var all = lead(first.lb)
      if (NUMBERED.test(all) || REFS.test(all) || (early && ABSTRACT.test(all))) k = first.lb
    }
    var marked = function (i) { return /[.:—–-]$/.test(first.words[i - 1].t) || (i < first.words.length && /^[—–-]/.test(first.words[i].t)) }
    for (var i = 1; early && !k && i < first.lb && i <= 8; i++) { var t = lead(i); if ((ABSTRACT.test(t) || REFS.test(t)) && marked(i)) k = i }
    if (!k) return null
    var rest = joinWords(b.segs, k)
    if (!rest.length) return null
    return { title: lead(k), rest: rest }
  }
  function headingOf(b, body, ctx) {
    var words = b.words.length, t = b.text
    if (words <= 10 && NUMBERED.test(t) && b.size >= body - 0.3) return t
    if (ABSTRACT.test(t) || REFS.test(t)) return t
    // (IEEE: small capitals bring the line's size under the body's)
    if (words <= 12 && b.lines <= 2 && b.size >= body - 3 && (ROMAN_HEAD.test(t) || CAPS_HEAD.test(t))) return t
    if (ctx && ctx.roman && words <= 12 && b.lines <= 2 && LETTER_HEAD.test(t) && !SENTENCE_END.test(t) && b.size >= body - 0.5 &&
        b.segs.every(function (s) { return (s.f & 2) === 2 || boldAll(s) })) return t
    // (larger or bold: a short block that stands where a heading stands, alone on its row at the column's edge or
    // centred, one sentence at most; a table's cell, a figure's label or a bold paragraph start is none)
    if (b.lines <= 2 && t.length <= 160 && !/\.$/.test(t) && (b.size >= body + 1 || (b.segs.every(fullyBold) && words <= 12)) &&
        !TWO_SENTENCES.test(t) && !DECIMAL.test(t) && !LIST.test(t) && alone(b) && placed(b)) return t
    return null
  }
  // (bold for most of its characters, and not a bold start the rest of the line runs on from: "Masked LM and the
  // Masking Procedure As-" is a paragraph's run-in head and its text)
  function fullyBold(s) { return boldAll(s) && !(s.lb > 0 && s.lb < s.words.length) }
  // (within its column: a note in the page's margin beside it doesn't count)
  function alone(b) {
    var first = b.segs[0], e = b.edges
    return (b.flow.segs || []).every(function (s) {
      return b.segs.indexOf(s) >= 0 || !sameRow(s, first) || s.x1 < e[0] - s.size || s.x0 > e[1] + s.size
    })
  }
  function placed(b) {
    var e = b.edges, x0 = Math.min.apply(null, b.segs.map(function (s) { return s.x0 }))
    return x0 - e[0] <= 2 * b.size || centred(b)
  }
  function captionLabel(t) {
    var m = /^\s*(fig(?:ure)?\.?|scheme|chart|abb(?:ildung)?\.?|图|table|tab\.|tabelle|表)\s*([A-Z]?\d+[a-z]?)/i.exec(t)
    if (!m) return ""
    var w = m[1].toLowerCase().replace(/\.$/, "")
    var name = /^(table|tab|tabelle|表)$/.test(w) ? "Table" : w === "scheme" ? "Scheme" : w === "chart" ? "Chart" : "Figure"
    return name + " " + m[2]
  }

  // The blocks after the front matter as items: headings, units (with their kind) and drops, in reading order.
  function itemsOf(blocks, body, front, ctx) {
    var items = [], inRefs = false, refLines = null, early = true
    var flushRefs = function () {
      if (!refLines || !refLines.length) { refLines = null; return }
      var entries = []
      refLines.forEach(function (x, i) {
        var s = x.seg, ind = s.x0 - x.edges[0] > 0.8 * s.size
        var prevInd = i > 0 ? refLines[i - 1].indented : false
        x.indented = ind
        var start = i === 0 || REF_START.test(s.text) || (x.first && !ind) || (!ind && prevInd)
        if (start) entries.push({ segs: [], flow: x.flow, size: s.size })
        entries[entries.length - 1].segs.push(s)
      })
      entries.forEach(function (e) {
        items.push({ type: "unit", kind: "reference", words: joinWords(e.segs, 0), flow: e.flow, size: e.size })
      })
      refLines = null
    }
    blocks.forEach(function (b, bi) {
      if (front[bi]) return
      var head = headingOf(b, body, ctx), ri = head === null ? runIn(b, early) : null
      if (head !== null || ri) {
        flushRefs()
        var title = head !== null ? head : ri.title
        var prev = items[items.length - 1]
        // (a heading the page broke over two lines is one: pdftext._joined_headings)
        if (head !== null && prev && prev.type === "heading" && prev.joinable && !NUMBERED.test(title) && !ABSTRACT.test(title) && !REFS.test(title) &&
            (Math.abs(prev.size - b.size) < 0.3 || /-$/.test(prev.text))) {
          prev.text = /-$/.test(prev.text) ? prev.text.replace(/(\w)-$/, "$1") + title : prev.text + " " + title
          prev.words = joinTo(prev.words, b.words)
          return
        }
        var h = { type: "heading", text: title, size: b.size, refs: REFS.test(title), abstract: ABSTRACT.test(title), flow: b.flow,
          joinable: head !== null && !NUMBERED.test(title) && !ABSTRACT.test(title) && !REFS.test(title) && !ri,
          block: b, words: ri ? [] : b.words, runIn: !!ri, style: styleOf(b) }
        items.push(h)
        if (!h.abstract) early = false
        inRefs = h.refs
        if (ri) items.push({ type: "unit", kind: "paragraph", words: ri.rest, flow: b.flow, size: b.size, block: b, runIn: true })
        return
      }
      if (inRefs) {
        refLines = refLines || []
        b.segs.forEach(function (s, i) { refLines.push({ seg: s, first: i === 0, flow: b.flow, edges: b.edges }) })
        return
      }
      var t = b.text
      var first = b.segs[0].text
      var item = { type: "unit", kind: "paragraph", words: b.words, flow: b.flow, size: b.size, block: b }
      if (CAPTION_AT.test(first) || TABLE_AT.test(first)) {
        item.kind = "caption"
        item.label = captionLabel(first)
      } else if (b.size <= body - 1 && FOOTMARK.test(t) && !blocks.slice(bi + 1).some(function (x) { return x.flow === b.flow && Math.abs(x.size - body) < 0.6 })) {
        item.kind = "footnote"
      } else if (b.words.length <= 6 && b.size < body - 0.5) {
        item = { type: "drop", flow: b.flow }
      } else if (b.lines <= 3 && (letters(t) < 0.5 || centred(b) && EQ_NUMBER.test(t))) {
        item.kind = "equation"
      } else if (LIST.test(t)) {
        item.kind = "list item"
        var w0 = item.words[0]
        if (w0 && BULLET.test(w0.t)) item.words = item.words.slice(1)
      } else if (FRONT.test(t) && b.words.length <= 25 && b.flow.page === 1) {
        item = { type: "drop", flow: b.flow }
      }
      items.push(item)
    })
    flushRefs()
    return items
  }
  function centred(b) {
    var e = b.edges, w = e[1] - e[0]
    var x0 = Math.min.apply(null, b.segs.map(function (s) { return s.x0 })), x1 = Math.max.apply(null, b.segs.map(function (s) { return s.x1 }))
    return Math.abs((x0 + x1) / 2 - (e[0] + e[1]) / 2) <= 0.1 * w && x1 - x0 < 0.8 * w
  }

  // A heading's look: its size (to 0.5), bold and italic, and its font family (PLOS sets sections in Helvetica Bold
  // and their sub-sections in Minion Bold, both 12 pt).
  function styleOf(b) {
    var s = b.segs[0]
    return (Math.round(b.size * 2) / 2) + "|" + (s.f & 3) + "|" + (boldAll(s) ? 1 : 0) + "|" + s.fn
  }

  // ---- 6b. the PDF's own outline (meta.outline: [{t, l, p}], PDFKit's outlineRoot in order), when it names the
  // headings: they take its levels, and a heading it doesn't name is read as a paragraph unless it is back matter or
  // deeper than the outline goes.

  function outlineKey(t) {
    return clean(String(t || "").replace(NUMBERING, "")).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
  }
  function keysMeet(a, b) {
    if (!a || !b) return false
    if (a === b) return true
    var short = a.length < b.length ? a : b, long = a.length < b.length ? b : a
    return short.length >= 10 && long.indexOf(short) === 0 && short.length >= 0.75 * long.length
  }
  function capsOnly(t) { return !/\p{Ll}/u.test(t) && /\p{Lu}{3}/u.test(t) }
  function applyOutline(items, outline, body) {
    var entries = (Array.isArray(outline) ? outline : []).filter(function (e) { return e && outlineKey(e.t) && Number(e.l) >= 1 })
    if (entries.length < 3) return items
    var out = items.slice(), at = 0, found = []
    entries.forEach(function (e) {
      var key = outlineKey(e.t), page = Number(e.p) || 0
      for (var i = at; i < out.length; i++) {
        var it = out[i]
        if (it.type === "drop" || it.abstract) continue
        if (it.type === "unit" && (it.kind === "reference" || it.kind === "footnote" || it.words.length > 25)) continue
        if (page && it.flow && Math.abs(it.flow.page - page) > 1) continue
        var text = it.type === "heading" ? it.text : textOf(it.words)
        if (!keysMeet(outlineKey(text), key)) continue
        if (it.type === "unit") {
          it = out[i] = { type: "heading", text: text, size: it.size, refs: REFS.test(text), abstract: ABSTRACT.test(text), flow: it.flow,
            joinable: false, block: it.block, words: it.words, runIn: false, style: it.block ? styleOf(it.block) : "" }
        }
        found.push({ item: it, entry: e })
        at = i + 1
        break
      }
    })
    if (found.length < 3 || found.length < 0.5 * entries.length) return items
    // (levels from 1; after the references, entries the outline set under them are the appendix's own levels)
    var low = Math.min.apply(null, found.map(function (f) { return Number(f.entry.l) }))
    var refLevel = 0, deepest = 1
    found.forEach(function (f) {
      var l = Number(f.entry.l) - low + 1
      if (refLevel && l > refLevel) l -= refLevel
      if (f.item.refs) refLevel = l
      f.item.depth = Math.min(3, l)
      deepest = Math.max(deepest, f.item.depth)
      f.item.outlined = true
      var label = String(f.entry.t).replace(NUMBERING, "").trim()
      if (capsOnly(f.item.text) && /\p{Ll}/u.test(label)) {
        var num = NUMBERING.exec(f.item.text)
        f.item.text = (num ? num[0].trim() + " " : "") + label
      }
    })
    return out.map(function (it) {
      if (it.type !== "heading" || it.outlined || it.abstract || it.refs || it.runIn || KEEP_HEAD.test(it.text) || CAPS_HEAD.test(it.text)) return it
      var hm = HEAD_NUM.exec(it.text)
      if (hm && depthOf(it.text) > deepest) return it
      if (!it.words || !it.words.length) return it
      return { type: "unit", kind: "paragraph", words: it.words, flow: it.flow, size: it.size, block: it.block }
    })
  }

  // ---- 7. a paragraph the column or the page broke, made whole

  function joinBreaks(items) {
    var skip = function (it) { return it.type === "drop" || (it.type === "unit" && (it.kind === "caption" || it.kind === "footnote" || it.kind === "equation")) }
    var out = items.slice()
    for (var i = 0; i < out.length; i++) {
      var p = out[i]
      if (p.type !== "unit" || p.kind !== "paragraph") continue
      for (;;) {
        if (SENTENCE_END.test(textOf(p.words))) break
        var j = i + 1
        while (j < out.length && skip(out[j])) j++
        if (j >= out.length) break
        var q = out[j]
        if (q.type !== "unit" || q.kind !== "paragraph" || q.runIn || q.flow === p.flow || Math.abs(q.size - p.size) > 0.6) break
        var firstInFlow = true
        for (var k = 0; k < j; k++) if (out[k].flow === q.flow && !skip(out[k])) { firstInFlow = false; break }
        if (!firstInFlow) break
        var s0 = q.block.segs[0]
        if (s0.x0 - q.block.edges[0] > 0.8 * s0.size) break
        p.words = joinTo(p.words, q.words)
        p.flow = q.flow
        out.splice(j, 1)
      }
    }
    return out
  }

  // ---- 9. the title and the front matter (pdftext._title)

  function frontOf(blocks, body, meta) {
    var page1 = blocks.filter(function (b) { return b.flow.page === 1 })
    var stop = -1
    for (var i = 0; i < page1.length; i++) {
      var b = page1[i], t = b.text
      if (ABSTRACT.test(t) || REFS.test(t) || (NUMBERED.test(t) && b.words.length <= 10) || runIn(b, true) ||
          (Math.abs(b.size - body) < 0.6 && b.words.length >= 25)) { stop = i; break }
    }
    var out = {}, title = null, abstract = null
    if (stop <= 0) return { drop: out, title: null, abstract: null }
    var heads = page1.slice(0, stop)
    var known = wordSet(meta.title)
    var named = size(known) ? heads.filter(function (b) { return jaccard(wordSet(b.text), known) >= 0.6 }) : []
    title = named.length ? named[0] : heads.reduce(function (a, b) { return !a || b.size > a.size ? b : a }, null)
    var abs = wordSet(meta.abstract)
    heads.forEach(function (b) {
      if (b === title) { out[b.index] = true; return }
      var ws = wordSet(b.text)
      if (!abstract && size(abs) && size(ws) >= 10 && common(ws, abs) >= 0.6 * size(ws)) { abstract = b; return }
      out[b.index] = true
    })
    return { drop: out, title: title, abstract: abstract }
  }

  // ---- 10, 11. sections and ids

  function depthOf(t) {
    var m = DEPTH.exec(t)
    if (!m) return 1
    return Math.min(3, m[1].replace(/\.$/, "").split(/[.\-]/).length)
  }
  function sectionsOf(items, meta, frontAbstract) {
    var sections = [], cur = null, pending = [], notes = []
    var s1 = 0, ss = 0, sss = 0, a = 0, ass = 0, afterRefs = false, appendix = false, seenHeading = false
    var maxH = 0, numbered = false
    var roman = items.some(function (it) { return it.type === "heading" && ROMAN_HEAD.test(it.text) })
    items.forEach(function (it) {
      if (it.type !== "heading" || it.abstract || it.refs) return
      maxH = Math.max(maxH, it.size)
      if (HEAD_NUM.test(it.text)) numbered = true
    })
    // (a paper with no numbered headings: its heading looks ranked, the larger first, then by first use, so a
    // sub-section set at the section's size in another face nests; at most three)
    var rank = {}
    if (!numbered) {
      var looks = []
      items.forEach(function (it) {
        if (it.type !== "heading" || it.abstract || it.refs || it.runIn || KEEP_HEAD.test(it.text)) return
        if (!looks.some(function (l) { return l.style === it.style })) looks.push({ style: it.style, size: it.size, n: looks.length })
      })
      looks.sort(function (a, b) { return Math.abs(a.size - b.size) > 0.25 ? b.size - a.size : a.n - b.n })
      looks.forEach(function (l, i) { rank[l.style] = Math.min(3, i + 1) })
    }
    var abs = wordSet(meta.abstract)
    var add = function (it) {
      var kind = it.kind
      if (cur.id === "abstract" && kind === "paragraph") kind = "abstract"
      cur.items.push({ kind: kind, label: it.label, words: it.words })
    }
    var open = function (id, num, title, depth) {
      cur = { id: id, num: num, title: title, depth: depth, items: [] }
      sections.push(cur)
      if (id === "bib" && pending.length) {
        var text = { id: "S1", num: "", title: "Text", depth: 1, items: [] }
        sections.splice(sections.length - 1, 0, text)
        var keep = cur
        cur = text
        pending.forEach(add)
        cur = keep
        s1 = Math.max(s1, 1)
      } else pending.forEach(add)
      pending = []
    }
    if (frontAbstract) { open("abstract", "", "Abstract", 1); add({ kind: "abstract", words: frontAbstract.words }) }
    items.forEach(function (it) {
      if (it.type === "drop") return
      if (it.type === "heading") {
        seenHeading = true
        if (it.abstract) { if (!sections.some(function (s) { return s.id === "abstract" })) open("abstract", "", "Abstract", 1); else cur = sections.filter(function (s) { return s.id === "abstract" })[0]; return }
        var hm = HEAD_NUM.exec(it.text), lm = (afterRefs || appendix || roman) ? LETTER_NUM.exec(it.text) : null
        // (in an IEEE paper a lone letter I, V or X in mixed case is a sub-section's, not a Roman numeral)
        if (roman && hm && /^[IVX]+$/.test(hm[1]) && !ROMAN_HEAD.test(it.text)) hm = null
        var num = hm ? hm[1] : lm && !APPENDIX.test(it.text) ? lm[1] : ""
        var title = hm ? hm[2] : num ? lm[2] : it.text
        if (it.refs) { afterRefs = true; open(uniqueId("bib", sections), num, title, 1); return }
        var depth = it.depth ? it.depth : roman && lm && !hm && !afterRefs && !appendix ? 2 : num ? depthOf(it.text) :
          !numbered && rank[it.style] ? rank[it.style] : it.size >= maxH - 0.25 ? 1 : 2
        if (APPENDIX.test(it.text) || (afterRefs && lm && !hm) || appendix) {
          appendix = true
          if (depth === 1 || a === 0) { a++; ass = 0; open("A" + a, num, title, 1) } else { ass++; open("A" + a + ".SS" + ass, num, title, 2) }
          return
        }
        if (depth >= 2 && s1 === 0) depth = 1
        if (depth === 3 && ss === 0) depth = 2
        if (depth === 1) { s1++; ss = 0; sss = 0; open("S" + s1, num, title, 1) } else if (depth === 2) { ss++; sss = 0; open("S" + s1 + ".SS" + ss, num, title, 2) } else { sss++; open("S" + s1 + ".SS" + ss + ".SSS" + sss, num, title, 3) }
        return
      }
      if (it.kind === "footnote") { notes.push(it); return }
      if (!cur) {
        if (!seenHeading && !pending.length && it.kind === "paragraph" && size(abs)) {
          var ws = wordSet(textOf(it.words))
          if (size(ws) >= 10 && common(ws, abs) >= 0.6 * size(ws)) { open("abstract", "", "Abstract", 1); add({ kind: "abstract", words: it.words }); return }
        }
        pending.push(it)
        return
      }
      add(it)
    })
    if (pending.length) { s1++; open("S" + s1, "", "Text", 1) }
    if (notes.length) { cur = { id: "Sx", num: "", title: "Notes", depth: 1, items: [] }; sections.push(cur); notes.forEach(add) }
    return sections
  }
  function uniqueId(id, sections) { return sections.some(function (s) { return s.id === id }) ? id + (sections.length + 1) : id }

  // ---- 12. units: sentences, ids, the link map's boxes

  var LETTER = { paragraph: "p", abstract: "p", "list item": "i", equation: "e", reference: "r", footnote: "n" }
  // A text's sentences; one longer than 3000 tokens (no end punctuation for pages) cut there, at a word's start, so a
  // unit stays within FoldCore's 5000 tokens.
  var LONG_SENTENCE = 3000
  function sentencesOf(text) {
    var toks = C.tokenize(text), out = []
    C.splitSentences(toks).forEach(function (r) {
      var i = r[0]
      while (r[1] - i > LONG_SENTENCE) {
        var j = i + LONG_SENTENCE
        while (j > i + 1 && !(toks[j].a > toks[j - 1].b)) j--
        if (j <= i + 1) j = i + LONG_SENTENCE
        out.push({ a: toks[i].a, b: toks[j - 1].b, n: j - i })
        i = j
      }
      out.push({ a: toks[i].a, b: toks[r[1] - 1].b, n: r[1] - i })
    })
    return out
  }
  function chunks(text, words) {
    var ss = sentencesOf(text)
    var tokens = ss.reduce(function (a, s) { return a + s.n }, 0)
    if (ss.length <= C.LIMITS.sentences && tokens <= C.LIMITS.tokens) return [{ sentences: ss.map(function (s) { return text.slice(s.a, s.b) }), words: words }]
    // (over FoldCore's limits: cut at sentence ends into parts of at most 300 sentences and 3000 tokens)
    var starts = [], at = 0
    words.forEach(function (w) { starts.push(at); at += w.t.length + 1 })
    var out = [], cur = null
    ss.forEach(function (s) {
      if (!cur || cur.sents.length >= 300 || cur.tokens + s.n > 3000) { cur = { sents: [], tokens: 0 }; out.push(cur) }
      cur.sents.push(s)
      cur.tokens += s.n
    })
    return out.map(function (c) {
      var a = c.sents[0].a, b = c.sents[c.sents.length - 1].b
      return { sentences: c.sents.map(function (s) { return text.slice(s.a, s.b) }), words: words.filter(function (w, i) { return starts[i] >= a && starts[i] < b }) }
    })
  }
  function boxesOf(words) {
    var bySeg = [], page = 0
    words.forEach(function (w) {
      w.parts.forEach(function (p) {
        var g = null
        for (var i = 0; i < bySeg.length; i++) if (bySeg[i].seg === p.seg) { g = bySeg[i]; break }
        if (!g) { g = { seg: p.seg, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; bySeg.push(g) }
        g.x0 = Math.min(g.x0, p.w.x0); g.y0 = Math.min(g.y0, p.w.y0); g.x1 = Math.max(g.x1, p.w.x1); g.y1 = Math.max(g.y1, p.w.y1)
      })
    })
    if (bySeg.length) page = bySeg[0].seg.page
    return { page: page, boxes: bySeg.map(function (g) {
      var s = g.seg
      var b = [r6(clamp01(g.x0 / s.W)), r6(clamp01(g.y0 / s.H)), r6(clamp01(g.x1 / s.W)), r6(clamp01(g.y1 / s.H))]
      if (s.page !== page) b.push(s.page)
      return b
    }) }
  }

  // ---- read: FoldPDF.lines' pages and Zotero's meta to { doc, links, stats } or { problem, stats }

  function read(pages, meta) {
    var m = meta || {}
    var ps = Array.isArray(pages) ? pages : []
    var got = segmentsOf(ps)
    var count = Math.max(ps.length, m.pdf && m.pdf.pages || 0)
    var textPages = got.perPage.filter(function (c) { return c >= MIN_PAGE_CHARS }).length
    var stats = { pages: count, lines: got.lines, units: 0, chars: got.chars, textPages: textPages }
    if (got.chars < 200 || (count - textPages) * 2 >= count) return { problem: "scan", stats: stats }
    var segs = dropFurniture(got.segs, count)
    var body = bodySize(segs)
    var fr = frameOf(segs, body)
    // (merged columns make the frame look like one: cut at its middle, then at the gutter the cut lines show, kept
    // when the frame is two columns then)
    var cut = cutGutter(recut(segs, { two: true, mid: fr.mid }), { two: true, mid: fr.mid })
    if (cut.length !== segs.length) { var fr2 = frameOf(cut, body); if (fr2.two) { segs = cut; fr = fr2 } }
    var flows = flowsOf(segs, fr, body)
    var edges = edgesOf(segs, fr, body)
    flows.forEach(dropTables)
    var blocks = blocksOf(flows, edges, body, medianGap(flows, body))
    if (!blocks.length) return { problem: "no-text", stats: stats }
    var front = frontOf(blocks, body, m)
    var ctx = { roman: blocks.filter(function (b) { return b.words.length <= 12 && ROMAN_HEAD.test(b.text) }).length >= 2 }
    var items = itemsOf(blocks, body, front.abstract ? withKey(front.drop, front.abstract.index) : front.drop, ctx)
    items = joinBreaks(applyOutline(items, m.outline, body))
    var secs = sectionsOf(items, m, front.abstract)
    var sections = [], map = {}, n = 0, tooLong = false
    secs.forEach(function (s) {
      var counts = {}, units = []
      s.items.forEach(function (it) {
        if (!it.words.length) return
        var text = textOf(it.words)
        chunks(text, it.words).forEach(function (c) {
          if (!c.sentences.length) return
          if (++n > C.LIMITS.units) { tooLong = true; return }
          var letter = it.kind === "caption" ? (/^Table/.test(it.label || "") ? "T" : "F") : LETTER[it.kind] || "p"
          counts[letter] = (counts[letter] || 0) + 1
          var id = s.id + "." + letter + counts[letter] + (it.kind === "caption" ? ".cap" : "")
          var u = { id: id, kind: it.kind }
          if (it.kind === "caption") u.label = it.label || ""
          u.role = "context"
          u.sentences = c.sentences
          u.evidence = [0]
          u.key = ""
          u.takeaway = ""
          u.topic = ""
          units.push(u)
          map[id] = boxesOf(c.words)
        })
      })
      sections.push({ id: s.id, num: s.num, title: s.title, depth: s.depth, takeaway: "", topic: "", units: units })
    })
    stats.units = n
    if (tooLong) return { problem: "too-long", stats: stats }
    if (!n) return { problem: "no-text", stats: stats }
    var pdf = m.pdf || {}
    var sha = String(pdf.sha256 || "")
    var doc = {
      format: "textfold/doc", version: 0, id: "pdf-" + (/^[0-9a-f]{16}/.test(sha) ? sha.slice(0, 16) : "local"), lang: String(m.lang || "en"),
      title: String(m.title || (front.title ? front.title.text : "")), authors: Array.isArray(m.authors) ? m.authors.map(String) : [], date: String(m.date || ""),
      source: { kind: "pdf", url: "", label: "Zotero · " + String(m.cite || ""), snapshot: "", license: "", sha256: sha, bytes: pdf.bytes || 0, pages: count, extractor: EXTRACTOR },
      levels: ["topic", "takeaway", "key", "brief", "full"], written: ["topic", "takeaway", "key"],
      provenance: { made_with: String(m.made_with || ""), exported: String(m.exported || ""), ai_generated: false, model: "", levels_made: "", local: true },
      sections: sections, links: []
    }
    var crops = C.crops(ps.map(function (p, i) {
      var words = []
      ;((p && p.lines) || []).forEach(function (l) { (l && Array.isArray(l.w) ? l.w : []).forEach(function (w) { words.push(w) }) })
      return { n: p && p.n >= 1 ? p.n : i + 1, words: words }
    }), count)
    var links = {
      format: "zl-fold-links", version: 1, doc: { id: doc.id, lang: doc.lang, levels_made: "" },
      pdf: { bytes: pdf.bytes || 0, modified: String(pdf.modified || ""), pages: count },
      coverage: { linked: n, total: n }, crops: crops, map: map
    }
    return { doc: doc, links: links, stats: stats }
  }
  function withKey(o, k) { var x = {}; for (var key in o) x[key] = o[key]; x[k] = true; return x }

  // links.json kept with a doc that was written again (a fold's levels): the same map, the doc's new identity.
  function relink(links, doc) {
    if (!links || typeof links !== "object") return links
    var p = doc && doc.provenance || {}
    var out = {}
    for (var k in links) out[k] = links[k]
    out.doc = { id: String(doc && doc.id || ""), lang: String(doc && doc.lang || ""), levels_made: String(p.levels_made || "") }
    return out
  }

  // ---- the fold's glue (R5-SPEC 5.3): the command's input, a section merged in, the page's fold object

  var MAX_INPUT = 4 * 1024 * 1024
  function utf8Length(s) {
    var n = 0
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i)
      if (c < 0x80) n += 1
      else if (c < 0x800) n += 2
      else if (c >= 0xd800 && c < 0xdc00) { n += 4; i++ }
      else n += 3
    }
    return n
  }
  function foldable(s) { return (Array.isArray(s && s.units) ? s.units : []).filter(function (u) { return u && !APPARATUS[u.kind] }) }

  // The fold command's stdin (4.1): the doc's foldable sections and units, the paper, the model and what to fold.
  // Settings › Defaults › Fold with AI › Effort ("" the model's own; the runner's EFFORTS)
  var EFFORTS = ["low", "medium", "high", "xhigh", "max"]

  function foldInput(doc, o) {
    var opts = o || {}
    var d = doc || {}
    var sections = []
    ;(Array.isArray(d.sections) ? d.sections : []).forEach(function (s) {
      var us = foldable(s)
      if (!us.length) return
      sections.push({ id: String(s.id), num: String(s.num == null ? "" : s.num), title: String(s.title == null ? "" : s.title), depth: s.depth === 2 || s.depth === 3 ? s.depth : 1,
        units: us.map(function (u) {
          var x = { id: String(u.id), kind: String(u.kind || "paragraph") }
          if (u.label) x.label = String(u.label)
          x.sentences = (Array.isArray(u.sentences) ? u.sentences : []).map(String)
          return x
        }) })
    })
    var input = {
      paper: String(opts.paper || ""), model: String(opts.model || "default"),
      effort: opts.effort === "" || EFFORTS.indexOf(opts.effort) >= 0 ? opts.effort : "low", force: opts.force === true,
      only: Array.isArray(opts.only) ? opts.only.map(String) : null,
      doc: { title: String(d.title || ""), lang: String(d.lang || "en"), sections: sections }
    }
    var text = JSON.stringify(input)
    if (utf8Length(text) > MAX_INPUT) return { error: "the paper's text is larger than 4 MB" }
    return input
  }

  // The doc with a section's levels from a fold's section event (4.1), made: "ai"; the provenance follows.
  function foldMerge(doc, event, now) {
    var d = JSON.parse(JSON.stringify(doc || {}))
    var e = event || {}
    var sections = Array.isArray(d.sections) ? d.sections : []
    var sec = null
    for (var i = 0; i < sections.length; i++) if (sections[i].id === e.id) sec = sections[i]
    if (!sec) return d
    var byId = {}
    ;(Array.isArray(e.units) ? e.units : []).forEach(function (u) { if (u && typeof u.id === "string") byId[u.id] = u })
    ;(sec.units || []).forEach(function (u) {
      var x = byId[u.id]
      if (!x || APPARATUS[u.kind]) return
      u.role = C.role(x.role)
      u.evidence = Array.isArray(x.evidence) ? x.evidence.filter(function (n) { return typeof n === "number" && n % 1 === 0 && n >= 0 }) : [0]
      if (!u.evidence.length) u.evidence = [0]
      u.key = String(x.key == null ? "" : x.key)
      u.takeaway = String(x.takeaway == null ? "" : x.takeaway)
      u.topic = String(x.topic == null ? "" : x.topic)
    })
    var line = e.section || {}
    sec.takeaway = String(line.takeaway == null ? "" : line.takeaway)
    sec.topic = String(line.topic == null ? "" : line.topic)
    sec.made = "ai"
    sec.model = String(e.model || "")
    var models = []
    sections.forEach(function (s) { if (s.made === "ai" && s.model && models.indexOf(s.model) < 0) models.push(s.model) })
    var p = d.provenance && typeof d.provenance === "object" ? d.provenance : (d.provenance = {})
    p.ai_generated = true
    p.model = models.join(", ")
    p.levels_made = String(now || "").slice(0, 19)
    p.local = sections.some(function (s) { return foldable(s).length && s.made !== "ai" })
    return d
  }

  // A cost in dollars as Settings shows one: "< $0.01" under a cent, "$0.12" else; "" when not known.
  function costText(usd) {
    if (usd === null || usd === undefined || typeof usd !== "number" || !isFinite(usd)) return ""
    return usd < 0.01 ? "< $0.01" : "$" + usd.toFixed(2)
  }

  var STOP_KINDS = { key: "ai-key", signin: "ai-signin", limit: "ai-limit", busy: "ai-busy", network: "ai-offline", setup: "no-ai" }

  // Whether a doc's levels came from elsewhere (an earlier tool's AI levels, D9): it counts as folded.
  function foreign(d) { var p = d && d.provenance || {}; return p.local !== true && p.ai_generated !== false }

  // The page's fold object (6.2) from the doc, fold.json (run), the plan and what the window knows now (live:
  // { folding, runner: "ok" | "missing" | "old", pdfChanged, stop: { kind, error }, scan }). A Fold again (run.force)
  // that didn't finish counts what it folded again, not the doc's sections folded before; how a run ended (a stop, a
  // failed section, stopped) comes before folded. again: that run is a Fold again; left: the sections it has still
  // to fold (Finish folding).
  function foldView(doc, run, plan, live) {
    var d = doc || {}, r = run || {}, pl = plan || {}, lv = live || {}
    var sections = (Array.isArray(d.sections) ? d.sections : []).filter(function (s) { return foldable(s).length })
    var total = sections.length
    var old = foreign(d)
    var status = r.sections && typeof r.sections === "object" ? r.sections : {}
    var errors = r.errors && typeof r.errors === "object" ? r.errors : {}
    var stop = lv.stop || r.stop || null
    var again = r.force === true && (lv.folding || r.status === "folding" || r.status === "stopped" || r.status === "partial" || !!(stop && stop.kind))
    var doneIn = function (s) { return again ? status[s.id] === "done" : old || s.made === "ai" }
    var done = sections.filter(doneIn).length
    var failed = old && !again ? [] : sections.filter(function (s) { return !doneIn(s) && status[s.id] === "failed" }).map(function (s) { return s.id })
    var left = sections.filter(function (s) { return !doneIn(s) }).map(function (s) { return s.id })
    var error = stop && stop.error ? String(stop.error) : failed.length ? String(errors[failed[0]] || "") : pl.error ? String(pl.error) : ""
    var lang = String(d.lang || "").toLowerCase().slice(0, 2)
    var disabled = lv.runner === "missing" ? "no-runner" : lv.runner === "old" ? "old-runner" : lv.scan ? "scan" : lang === "zh" || lang === "ja" ? "cjk" :
      pl.error ? (STOP_KINDS[pl.kind] === "no-ai" || !pl.kind ? "no-ai" : "") : ""
    var kind
    // (6.2's order: what can't fold now (no runner, an old one) wins over how a run ended, except a doc folded
    // throughout; after a Fold again, done counts that run's sections, so its end never reads as folded)
    if (lv.folding) kind = "folding"
    else if (total > 0 && done === total) kind = "folded"
    else if (lv.runner === "missing") kind = "no-runner"
    else if (lv.runner === "old") kind = "old-runner"
    else if (stop && stop.kind) kind = STOP_KINDS[stop.kind] || "ai-offline"
    else if (pl.error) kind = STOP_KINDS[pl.kind] || "no-ai"
    else if (lv.pdfChanged && !done) kind = "pdf-changed"
    else if (failed.length) kind = "partial"
    else if (r.status === "stopped" || r.status === "folding" || done > 0 || again) kind = "stopped"
    else kind = "unfolded"
    return {
      kind: kind, done: done, total: total, failed: failed, error: error.slice(0, 200), again: again, left: left,
      model: String(pl.model || r.model || ""), name: String(pl.name || (d.provenance && d.provenance.model) || r.model || ""),
      effort: typeof pl.effort === "string" ? pl.effort : "",
      calls: typeof pl.calls === "number" ? pl.calls : null, cached: typeof pl.cached === "number" ? pl.cached : 0,
      cost: costText(pl.costUsd), disabled: disabled
    }
  }

  return {
    EXTRACTOR: EXTRACTOR, APPARATUS: APPARATUS, read: read, relink: relink,
    foldInput: foldInput, foldMerge: foldMerge, foldView: foldView, costText: costText, STOP_KINDS: STOP_KINDS,
    _: { clean: clean, segmentsOf: segmentsOf, bodySize: bodySize, frameOf: frameOf, recut: recut, cutGutter: cutGutter, dropFurniture: dropFurniture, sentencesOf: sentencesOf, depthOf: depthOf, captionLabel: captionLabel, joinWords: joinWords }
  }
})()

if (typeof module !== "undefined" && module.exports) module.exports = FoldMake
