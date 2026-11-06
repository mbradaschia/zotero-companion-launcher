// The fold reader's model and levels (ZoteroLauncher/Reader/FoldCore.js; docs/fold-reader/SPEC.md criteria 1 to 11,
// the model half of 17, and 47), on the synthetic fixture (FIXTURE.md section 2).
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const C = require("../../ZoteroLauncher/Reader/FoldCore.js")
const F = require("./fold-fixture.js")

const m = C.model(F.doc())
const ids = (u, lv) => C.pieces(m.units[u], lv).map((p) => p.id.slice(u.length + 1))
const pairs = (u) => m.units[u].key.map((t, j) => (t.m !== undefined ? [j, t.m] : null)).filter(Boolean)

// FIXTURE.md section 2's table: tokens, sents, ev, key tokens, tn, m pairs, topic k, Topic chip ids.
const EXPECT = {
  "abstract1.1": [42, [[0, 16], [16, 34], [34, 42]], [0, 1], 21, 10, [[0, 3], [1, 17], [2, 19], [4, 21], [7, 24], [8, 25], [9, 26]], [7, 8], ["abstract1.1:24", "abstract1.1:25"]],
  "S1.p1.1": [42, [[0, 12], [12, 31], [31, 42]], [1, 2], 17, 8, [[1, 15], [3, 17], [6, 20], [7, 21], [9, 31], [10, 35], [11, 36], [13, 38], [15, 40]], [3], ["S1.p1.1:17"]],
  "S1.p2.1": [34, [[0, 8], [8, 21], [21, 34]], [1, 2], 22, 10, [[4, 11], [6, 16], [8, 18], [11, 21], [12, 22], [13, 25], [14, 26], [15, 27], [16, 28], [17, 29], [20, 32]], [1], ["S1.p2.1:k1"]],
  "S2.p1.1": [46, [[0, 16], [16, 33], [33, 46]], [0, 2], 20, 6, [[0, 0], [1, 1], [4, 5], [5, 6], [8, 34], [9, 35], [11, 37], [13, 39], [15, 41], [17, 43], [18, 44]], [4, 5], ["S2.p1.1:5", "S2.p1.1:6"]],
  "S2.F1.cap": [15, [[0, 15]], [0], 10, 9, [[0, 0], [1, 1], [4, 4], [5, 5], [7, 7], [8, 8]], [4, 5], ["S2.F1.cap:4", "S2.F1.cap:5"]],
  "S2.SS1.p1.1": [27, [[0, 16], [16, 27]], [0], 17, 8, [[0, 1], [1, 2], [3, 4], [4, 5], [11, 7], [12, 8], [15, 12]], [3, 4], ["S2.SS1.p1.1:4", "S2.SS1.p1.1:5"]],
  "S2.SS1.p2.1": [12, [[0, 12]], [0], 13, 4, [[1, 1], [7, 4], [8, 5], [10, 9], [11, 10]], [1], ["S2.SS1.p2.1:1"]],
  "A1.p1.1": [18, [[0, 9], [9, 18]], [0], 12, 4, [[0, 1], [1, 2], [2, 3], [3, 4]], [2, 3], ["A1.p1.1:3", "A1.p1.1:4"]]
}
const SECTIONS = { abstract: [12, [0, 1]], S1: [11, [9, 10]], S2: [14, [6, 7]], "S2.SS1": [6, [2, 3]], A1: [5, [1]] }

test("1: the model has 8 units in 5 sections, with sents, ev, tn and topic per FIXTURE.md", () => {
  assert.equal(m.problem, undefined)
  assert.equal(m.sections.length, 5)
  assert.equal(m.order.length, 8)
  assert.deepEqual(m.order, Object.keys(EXPECT))
  for (const [id, e] of Object.entries(EXPECT)) {
    const u = m.units[id]
    assert.equal(u.toks.length, e[0], id + " tokens")
    assert.deepEqual(u.sents, e[1], id + " sents")
    assert.deepEqual(u.ev, e[2], id + " ev")
    assert.equal(u.key.length, e[3], id + " key tokens")
    assert.equal(u.tn, e[4], id + " tn")
    assert.deepEqual(u.topicK, e[6], id + " topic k")
  }
})

test("2: the tokens of S1.p1.1's first sentence; citations are cite; the formula is one math token", () => {
  const u = m.units["S1.p1.1"]
  assert.deepEqual(u.toks.slice(0, 12).map((t) => t.t), ["Researchers", "read", "many", "papers", "each", "week", "[", "1", ",", "2", "]", "."])
  const cites = u.toks.map((t, i) => (t.k === "cite" ? i : -1)).filter((i) => i >= 0)
  assert.deepEqual(cites, [6, 7, 8, 9, 10, 22, 23, 24, 25, 26, 27, 28, 29])
  assert.deepEqual(u.toks.slice(22, 30).map((t) => t.t), ["(", "Lee", "et", "al", ".", ",", "2021", ")"])
  const v = m.units["S2.p1.1"]
  assert.equal(v.toks[31].t, "$s = n / N$")
  assert.equal(v.toks[31].k, "math")
  assert.equal(v.toks.filter((t) => t.k === "math").length, 1)
  assert.ok(!m.units["S2.SS1.p1.1"].toks.some((t) => t.k === "cite"), "(Figure 1) is no citation")
  assert.deepEqual(C.tokenize("as shown (A and B, 2019; C, 2020a) and [3-5].").filter((t) => t.k === "cite").map((t) => t.t).join(""), "(AandB,2019;C,2020a)[3-5]")
  assert.deepEqual(C.tokenize("A 3.5% rise, it's well-known.").map((t) => t.t), ["A", "3.5%", "rise", ",", "it's", "well-known", "."])
  assert.deepEqual(C.tokenize("读书很好").map((t) => t.t), ["读", "书", "很", "好"])
  // a space after a token is remembered; sentences are joined by one
  assert.equal(u.toks[11].s, 1, "a sentence's end takes the space before the next")
  assert.equal(u.toks[0].s, 1)
  assert.equal(u.toks[6].s, 0, "[ has no space after it")
})

test("3: the abstract's key alignment is exactly (0,3) (1,17) (2,19) (4,21) (7,24) (8,25) (9,26)", () => {
  assert.deepEqual(pairs("abstract1.1"), [[0, 3], [1, 17], [2, 19], [4, 21], [7, 24], [8, 25], [9, 26]])
  for (const [id, e] of Object.entries(EXPECT)) assert.deepEqual(pairs(id), e[5], id + " m pairs")
})

test("4: every key token with m: the same norm as its full token, inside an evidence sentence, m increasing", () => {
  for (const id of m.order) {
    const u = m.units[id]
    let last = -1
    for (const t of u.key) {
      if (t.m === undefined) continue
      assert.equal(C.norm(t), C.norm(u.toks[t.m]), id)
      assert.ok(C.norm(t) !== "", id + ": an empty norm never matches")
      assert.ok(u.ev.includes(u.sentOf[t.m]), id + ": m in an evidence sentence")
      assert.ok(t.m > last, id + ": m increasing")
      last = t.m
    }
  }
  assert.deepEqual(C.lcsPairs(["a", "", "b"], ["", "a", "b"]), [[0, 1], [2, 2]])
  assert.equal(C.norm({ t: "Papers" }), "paper")
  assert.equal(C.norm({ t: "class" }), "class")
  assert.equal(C.norm({ t: "The" }), "")
})

test("5: tn and topic k for every unit and section", () => {
  for (const [id, e] of Object.entries(EXPECT)) {
    assert.equal(m.units[id].tn, e[4], id)
    assert.deepEqual(m.units[id].topicK, e[6], id)
  }
  for (const s of m.sections) {
    assert.equal(s.takeToks.length, SECTIONS[s.id][0], s.id + " takeaway tokens")
    assert.deepEqual(s.topicK, SECTIONS[s.id][1], s.id + " topic k")
  }
})

test("6: the abstract's piece ids per level match FIXTURE.md's golden list; its Topic chip", () => {
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i))
  assert.deepEqual(ids("abstract1.1", "full"), range(0, 41))
  assert.deepEqual(ids("abstract1.1", "brief"), range(0, 33))
  const take = ["3", "17", "19", "k3", "21", "k5", "k6", "24", "25", "26"]
  assert.deepEqual(ids("abstract1.1", "key"), take.concat(range(10, 20).map((n) => "k" + n)))
  assert.deepEqual(ids("abstract1.1", "takeaway"), take)
  assert.deepEqual(ids("abstract1.1", "topic"), ["24", "25"])
  for (const [id, e] of Object.entries(EXPECT)) assert.deepEqual(C.pieces(m.units[id], "topic").map((p) => p.id), e[7], id + " chip")
  assert.equal(C.plainText(C.pieces(m.units["abstract1.1"], "topic")), "main claims")
  // the tones the table names
  const tones = (lv) => C.pieces(m.units["abstract1.1"], lv).map((p) => p.tone)
  assert.deepEqual(tones("full").slice(0, 34).every((t) => t === "ink") && tones("full").slice(34).every((t) => t === "muted"), true)
  const br = C.pieces(m.units["abstract1.1"], "brief").filter((p) => p.tone === "ink").map((p) => p.id.split(":")[1])
  assert.deepEqual(br, ["3", "17", "19", "21", "24", "25", "26"])
  assert.deepEqual(tones("key"), Array(10).fill("strong").concat(Array(11).fill("muted")))
  assert.deepEqual(tones("takeaway"), ["ink", "ink", "ink", "ink", "ink", "ink", "ink", "strong", "strong", "ink"])
})

test("7: Brief of S2.p1.1 has the gap piece S2.p1.1:gap2 between sentences 0 and 2", () => {
  const b = ids("S2.p1.1", "brief")
  assert.equal(b.indexOf("gap2"), 16)
  assert.equal(b[15], "15")
  assert.equal(b[17], "33")
  assert.equal(C.pieces(m.units["S2.p1.1"], "brief")[16].t, "…")
  assert.ok(!ids("abstract1.1", "brief").some((x) => x.startsWith("gap")), "adjacent evidence: no gap")
})

test("8: at each level the darker pieces are exactly the ones the next level keeps", () => {
  const ORDER = ["full", "brief", "key", "takeaway", "topic"]
  const darker = { ink: 1, strong: 2 }
  for (const id of m.order) {
    for (let i = 0; i < 4; i++) {
      const here = C.pieces(m.units[id], ORDER[i]), next = new Set(C.pieces(m.units[id], ORDER[i + 1]).map((p) => p.id))
      const kept = here.filter((p) => p.keep).map((p) => p.id)
      assert.deepEqual(kept, here.filter((p) => next.has(p.id)).map((p) => p.id), id + " " + ORDER[i])
      const keptTone = Math.min(...here.filter((p) => p.keep).map((p) => darker[p.tone] || 0))
      const otherTone = Math.max(0, ...here.filter((p) => !p.keep && p.kind !== "gap").map((p) => darker[p.tone] || 0))
      if (here.some((p) => !p.keep && p.kind !== "gap")) assert.ok(keptTone > otherTone, id + " " + ORDER[i] + ": kept words are darker")
    }
  }
})

test("9: back matter: A1 is back matter, every section before it is not", () => {
  assert.deepEqual(m.sections.map((s) => s.back), [false, false, false, false, true])
  const d = F.doc()
  d.sections.splice(4, 0, { id: "S3", num: "3", title: "References", depth: 1, takeaway: "", topic: "", units: [] })
  d.sections.push({ id: "S9", num: "9", title: "After it all", depth: 1, takeaway: "", topic: "", units: [] })
  assert.deepEqual(C.model(d).sections.map((s) => s.back), [false, false, false, false, true, true, true])
})

test("10: a doc of version 1, with a bad id, or of more than 5000 units is refused with bad-format", () => {
  const v1 = F.doc()
  v1.version = 1
  assert.equal(C.model(v1).problem.kind, "bad-format")
  assert.equal(C.model(v1).problem.version, 1)
  const badId = F.doc()
  badId.sections[1].units[0].id = "S1 p1"
  assert.equal(C.model(badId).problem.kind, "bad-format")
  const many = F.doc()
  many.sections[0].units = Array.from({ length: 5001 }, (_, i) => ({ id: "u" + i, sentences: ["A word."], evidence: [0], key: "", takeaway: "", topic: "" }))
  assert.equal(C.model(many).problem.kind, "bad-format")
  assert.match(C.model(many).problem.detail, /5000 units/)
  const long = F.doc()
  long.sections[0].units[0].sentences = Array(401).fill("A.")
  assert.match(C.model(long).problem.detail, /400 sentences/)
  const toks = F.doc()
  toks.sections[0].units[0].sentences = [Array(5001).fill("w").join(" ")]
  assert.match(C.model(toks).problem.detail, /5000 tokens/)
  assert.equal(C.model({ format: "other" }).problem.kind, "bad-format")
  assert.equal(C.model(null).problem.kind, "bad-format")
  assert.match(C.check(F.doc(), 21 * 1024 * 1024).detail, /20 MB/)
})

test("11: a sentence with markup comes out as plain token text", () => {
  const d = F.doc()
  d.sections[0].units[0].sentences[2] = "See <b>x</b> & <script>alert(1)</script> here."
  const u = C.model(d).units["abstract1.1"]
  const text = C.plainText(C.pieces(u, "full"))
  assert.ok(text.endsWith("See <b>x</b> & <script>alert(1)</script> here."))
  for (const p of C.pieces(u, "full")) assert.equal(typeof p.t, "string")
  assert.ok(C.pieces(u, "full").some((p) => p.t === "<"), "a < is a token's text")
})

test("units without evidence or a key; roles; the level table; Topic cards; the role filter; the margin's links", () => {
  const d = F.doc()
  d.sections[1].units[0].evidence = []
  d.sections[1].units[1].key = ""
  d.sections[1].units[1].role = "odd"
  const n = C.model(d)
  assert.deepEqual(C.pieces(n.units["S1.p1.1"], "brief").map((p) => p.id), C.pieces(n.units["S1.p1.1"], "full").map((p) => p.id), "no evidence: Full at Brief")
  const noKey = n.units["S1.p2.1"]
  assert.equal(noKey.role, "context")
  assert.deepEqual(C.pieces(noKey, "key").map((p) => p.id), ["0", "1", "2", "3", "4", "5", "6", "7"].map((i) => "S1.p2.1:" + i), "no key: its first sentence")
  assert.equal(C.font(noKey, "key"), "paper")
  assert.equal(C.font(m.units["S1.p2.1"], "key"), "ui")
  assert.equal(C.font(m.units["S1.p2.1"], "brief"), "paper")
  assert.deepEqual(C.LEVELS.map((l) => l.tip), ["Full: every paragraph as written · 1", "Brief: key sentences, verbatim · 2", "Key: each paragraph's point and its reason · 3",
    "Takeaway: one line per paragraph · 4", "Topic: a map of the paper, one card per section · 5"])
  assert.equal(C.level("key").foot, "Key · written by AI, each line opens to the paper")
  assert.equal(C.level(1).foot, "Full · the paper's words")
  assert.deepEqual(C.rolesOf(m), ["claim", "gap", "method", "setup", "result", "limitation", "context"])
  const cards = C.topicCards(m, false)
  assert.deepEqual(cards.map((c) => c.kind + ":" + (c.id || "")), ["card:abstract", "card:S1", "card:S2", "card:S2.SS1", "back:"])
  assert.equal(cards[4].label, "▸ Show appendices and back matter (1 section)")
  const open = C.topicCards(m, true)
  assert.equal(open[4].label, "▾ Hide appendices and back matter (1 section)")
  assert.equal(open[5].id, "A1")
  const runs = C.filterRuns(m, m.sections[1].units, "gap")
  assert.deepEqual(runs.map((r) => r.kind), ["stub", "unit"])
  assert.equal(runs[0].label, "1 paragraph not shown: context")
  const two = C.filterRuns(m, m.sections[2].units.concat(m.sections[3].units), "limitation")
  assert.equal(two[0].label, "3 paragraphs not shown: method, result, context")
  const ls = C.linksOf(m, "S2.SS1.p1.1")
  assert.equal(ls.length, 1, "the ref link isn't shown")
  assert.equal(ls[0].to, "abstract1.1")
  assert.equal(ls[0].label, "→ supports Abstract · main claims")
  assert.equal(C.linksOf(m, "S2.p1.1")[0].label, "→ builds on §1 · summaries")
})

test("17 (the model's half): FoldCore.model for the 40-page doc within 200 ms (median of 5)", () => {
  const big = F.bigDoc()
  C.model(big)
  const times = []
  for (let i = 0; i < 5; i++) { const t = process.hrtime.bigint(); C.model(big); times.push(Number(process.hrtime.bigint() - t) / 1e6) }
  times.sort((a, b) => a - b)
  assert.ok(times[2] < 200, "model took " + times[2].toFixed(1) + " ms")
  assert.equal(C.model(big).order.length, 240)
})

test("47: FoldCore.js names no window, document, webkit or timers; FoldView.js no webkit", () => {
  const dir = path.join(__dirname, "..", "..", "ZoteroLauncher", "Reader")
  const core = fs.readFileSync(path.join(dir, "FoldCore.js"), "utf8").replace(/^\s*\/\/.*$/gm, "")
  for (const w of ["window", "document", "webkit", "setTimeout", "setInterval", "requestAnimationFrame"]) assert.ok(!new RegExp("\\b" + w + "\\b").test(core), "FoldCore.js names " + w)
  const view = path.join(dir, "FoldView.js")
  if (fs.existsSync(view)) assert.ok(!/webkit/i.test(fs.readFileSync(view, "utf8")), "FoldView.js names webkit")
})
