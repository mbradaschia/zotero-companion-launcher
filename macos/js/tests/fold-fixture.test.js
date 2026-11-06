// The fold reader's fixture (docs/fold-reader/FIXTURE.md): the synthetic doc, the fake words, the large doc, and no
// real paper's text anywhere in it (SPEC criterion 59).
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const F = require("./fold-fixture.js")

test("the doc parses: 5 sections, 8 units; every takeaway starts its key, every topic is inside its takeaway", () => {
  const d = F.doc()
  assert.equal(d.format, "textfold/doc")
  assert.equal(d.sections.length, 5)
  const us = F.units(d)
  assert.equal(us.length, 8)
  for (const u of us) {
    assert.ok(u.key.startsWith(u.takeaway), u.id + ": its takeaway starts its key")
    assert.ok(u.takeaway.includes(u.topic), u.id + ": its topic is in its takeaway")
  }
  for (const s of d.sections) assert.ok(s.takeaway.includes(s.topic), s.id + ": the section's topic is in its takeaway")
})

test("fakeWords: 2 pages by default, a running header, page numbers, and the skim- / ming pair", () => {
  const w = F.fakeWords(F.doc())
  assert.equal(w.done, true)
  assert.equal(w.pages.length, 2)
  assert.deepEqual(w.sizes, [[612, 792], [612, 792]])
  assert.deepEqual(w.pages[0].words.slice(0, 4).map((x) => x[0]), ["Rivera", "and", "Okafor", "2026"])
  for (const p of w.pages) assert.equal(p.words[p.words.length - 1][0], String(p.n))
  const texts = w.pages[0].words.map((x) => x[0])
  const at = texts.indexOf("skim-")
  assert.ok(at > 0 && texts[at + 1] === "ming", "skim- then ming")
  assert.ok(w.pages[0].words[at + 1][2] > w.pages[0].words[at][2], "ming starts the next line")
  for (const p of w.pages) for (const x of p.words) for (const v of x.slice(1)) assert.ok(v >= 0 && v <= 1)
  assert.ok(!w.pages[1].words.some((x) => x[0] === "only"), "the left-out list item isn't written")
  assert.ok(w.pages[1].words.some((x) => x[0] === "lorem"), "the appendix is garbled")
  const ga = F.fakeWords(F.doc(), { garbleAll: true })
  assert.ok(ga.pages[0].words.some((x) => x[0] === "Researchers"), "garbleAll leaves the first two units")
  assert.ok(!ga.pages[1].words.some((x) => x[0] === "Each"))
})

test("bigDoc: 240 units of twelve sentences of twelve words, deterministic, about 37000 tokens", () => {
  const b = F.bigDoc()
  const us = F.units(b)
  assert.equal(b.sections.length, 12)
  assert.equal(us.length, 240)
  assert.deepEqual(F.bigDoc(), b, "the same every time")
  for (const u of us.slice(0, 20)) {
    assert.equal(u.sentences.length, 12)
    for (const s of u.sentences) assert.equal(s.replace(/\.$/, "").split(" ").length, 12)
    assert.ok(u.key.startsWith(u.takeaway) && u.takeaway.includes(u.topic))
  }
  const words = F.madeUpWords()
  assert.equal(words.length, 200)
  words.forEach((w, i) => assert.equal(w.length, (i % 8) + 2))
  const tokens = us.reduce((n, u) => n + u.sentences.reduce((a, s) => a + s.split(" ").length + 1, 0), 0)
  assert.ok(tokens > 36000 && tokens < 38000, "tokens " + tokens)
  // (FIXTURE.md's layout constants put it on 74 pages, not the 34 to 46 it estimates: PLAN.md's Deviations)
  const pages = F.fakeWords(b, { skip: [], garble: [] }).pages.length
  assert.ok(pages >= 70 && pages <= 80, "pages " + pages)
})

test("blankPage: a white US Letter page as a data URL", () => {
  const u = F.blankPage(3)
  assert.ok(u.startsWith("data:image/svg+xml"))
  const svg = decodeURIComponent(u.split(",")[1])
  assert.match(svg, /width="612" height="792"/)
  assert.match(svg, />3<\/text>/)
})

test("no fixture or fold test holds the gallery paper's text (SPEC 59)", () => {
  const files = [path.join(__dirname, "fold-fixture.js"), ...fs.readdirSync(__dirname).filter((f) => /^fold-.*\.js$/.test(f)).map((f) => path.join(__dirname, f))]
  const dir = path.join(__dirname, "fixtures", "fold-reader")
  for (const f of fs.readdirSync(dir)) files.push(path.join(dir, f))
  files.push(path.join(__dirname, "..", "..", "scripts", "fold-reader-check.mjs"))
  for (const f of files) {
    if (!fs.existsSync(f)) continue
    const text = fs.readFileSync(f, "utf8")
    const banned = ["Eloun" + "dou", "GPTs are " + "GPTs", "Labor Market Impact " + "Potential"]
    for (const b of banned) assert.ok(!text.includes(b), path.basename(f) + " names " + b)
  }
})
