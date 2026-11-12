// The fold reader's extraction benchmark (README.md): FoldMake.read on the lines foldlines wrote, its headings scored
// against gt/<name>.txt (one "level title" a line: the PDF's outline, the publisher's HTML, or the PDF read by hand).
// usage: node bench.mjs LINES_DIR FOLDMAKE_DIR [LABEL] [--json] [--asks DIR] [--answers DIR]
// Prints a Markdown table; --json the numbers. "Among the candidates": the true headings the outline pass's
// candidates hold (R5-SPEC 3.7), the most a model could find. --asks DIR writes each paper's request for the runner's
// `outline` command (<name>.ask.json); --answers DIR reads its answers (<name>.answer.json) and scores the sections
// made with them in a second table. No model is asked here.
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

const here = path.dirname(new URL(import.meta.url).pathname)
const opt = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null }
const asksDir = opt("--asks"), answersDir = opt("--answers")
const [linesDir, makeDir, label = "FoldMake"] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !["--asks", "--answers"].includes(all[i - 1]))
const json = process.argv.includes("--json")
const require = createRequire(import.meta.url)
const M = require(path.resolve(makeDir, "FoldMake.js"))

// (titles are compared without their numbering, spaces or punctuation: a letterspaced heading is its words)
const norm = (t) => (String(t).normalize("NFKC").toLowerCase().replace(/&amp;/g, "&").match(/[a-z0-9]+/g) || []).join("")
const NUM = /^\s*(?:[0-9]+(?:\.[0-9]+)*|[IVX]+|[A-Z](?:\.[0-9]+)*)[.)]?\s*[|│]?\s+/
const head = (t) => norm(String(t).trim().replace(NUM, "").replace(/^[|│]\s*/, ""))
// (headings a paper has that its outline leaves out: neither hits nor junk)
const NEUTRAL = new Set(["acknowledgments", "acknowledgements", "acknowledgment", "appendix", "references", "llm assistance statement",
  "basic skills", "content", "process", "cross functional skills", "occupations with no labeled exposed tasks", "author contributions",
  "pascal voc", "ms coco", "imagenet detection", "appendix for bert pre training of deep bidirectional transformers for language understanding"].map(norm))
// (back matter a publisher's XML holds outside its sections)
const BACK = /^(acknowledge?ments?|references|appendi(x|ces)[a-z0-9]*|funding|orcid(ids?)?|notes?|endnotes?|declarationof.*|conflicts?ofinterest.*|competinginterests?|dataavailability.*|authorcontributions?|supplementa(l|ry).*|supportinginformation|abstract|keywords?|authorbiograph(y|ies)|biograph(y|ies)|ethic.*|credit.*|openresearchbadges?|datasharing.*|correspondingauthor.*)$/
const neutral = (k) => NEUTRAL.has(k) || BACK.test(k)

function ratio(a, b) { // (difflib's ratio, on characters)
  if (a === b) return 1
  const m = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = a[i - 1] === b[j - 1] ? m[i - 1][j - 1] + 1 : Math.max(m[i - 1][j], m[i][j - 1])
  return (2 * m[a.length][b.length]) / (a.length + b.length || 1)
}
const match = (a, b) => !!a && !!b && (a === b || ratio(a, b) >= 0.88)
function parents(seq) {
  const out = [], stack = []
  for (const [lv, k] of seq) {
    while (stack.length && stack[stack.length - 1][0] >= lv) stack.pop()
    out.push(stack.length ? stack[stack.length - 1][1] : null)
    stack.push([lv, k])
  }
  return out
}

const papers = fs.readFileSync(path.join(here, "papers.tsv"), "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t"))
const rows = [], total = { gt: 0, found: 0, nested: 0, junk: 0, among: 0, asked: 0 }, totalAi = { gt: 0, found: 0, nested: 0, junk: 0 }
for (const [name, , title, layout] of papers) {
  const file = path.join(linesDir, name + ".lines.json")
  if (!fs.existsSync(file)) { rows.push({ name, layout, missing: true }); continue }
  const pages = JSON.parse(fs.readFileSync(file, "utf8"))
  let outline = []
  try { outline = JSON.parse(fs.readFileSync(path.join(linesDir, name + ".outline.json"), "utf8")) } catch (e) {}
  const started = process.hrtime.bigint()
  const r = M.read(pages, { title, abstract: "", lang: "en", pdf: { pages: pages.length }, outline })
  const ms = Number(process.hrtime.bigint() - started) / 1e6
  const gt = fs.readFileSync(path.join(here, "gt", name + ".txt"), "utf8").split("\n").filter(Boolean).map((l) => { const i = l.indexOf(" "); return [Number(l.slice(0, i)), head(l.slice(i + 1))] })
  const scoreOf = (doc) => {
    const preds = doc ? doc.sections.filter((s) => s.id !== "abstract" && s.id !== "Sx").map((s) => [s.depth || 1, head(s.title), s.title]) : []
    const kept = preds.filter((p) => !match(p[1], norm(title)))
    const used = new Set(), pairs = []
    gt.forEach(([, g], gi) => { for (let pi = 0; pi < kept.length; pi++) if (!used.has(pi) && match(g, kept[pi][1])) { used.add(pi); pairs.push([gi, pi]); break } })
    pairs.sort((a, b) => a[1] - b[1])
    const gpar = parents(gt), mpar = parents(pairs.map(([gi, pi]) => [kept[pi][0], gi]))
    const nested = pairs.filter(([gi], i) => gpar[gi] === (mpar[i] === null ? null : gt[mpar[i]][1])).length
    const junk = kept.filter((p, i) => !used.has(i) && !neutral(p[1])).map((p) => p[2])
    const misses = gt.filter((g, gi) => !pairs.some(([x]) => x === gi)).map((g) => g[1])
    return { found: pairs.length, nested, junk, misses }
  }
  const { found, nested, junk, misses } = scoreOf(r.doc)
  // (the candidates: a true heading is among them as one line, or as two or three lines one after another)
  const cands = r.ask ? r.ask.candidates.map((c) => head(c.text)) : null
  const among = cands ? gt.filter(([, g]) => cands.some((c, i) => match(g, c) || match(g, c + (cands[i + 1] || "")) || match(g, c + (cands[i + 1] || "") + (cands[i + 2] || "")))).length : null
  if (asksDir && r.ask) { fs.mkdirSync(asksDir, { recursive: true }); fs.writeFileSync(path.join(asksDir, name + ".ask.json"), JSON.stringify(Object.assign({ paper: "1:BENCH" + String(rows.length).padStart(3, "0"), model: "default" }, r.ask))) }
  let ai = null
  if (answersDir && fs.existsSync(path.join(answersDir, name + ".answer.json"))) {
    const answer = JSON.parse(fs.readFileSync(path.join(answersDir, name + ".answer.json"), "utf8"))
    const made = M.read(pages, { title, abstract: "", lang: "en", pdf: { pages: pages.length }, outline, headings: { n: answer.n, headings: answer.headings, model: answer.name || answer.model || "" } })
    ai = Object.assign(scoreOf(made.doc), { by: made.doc ? made.doc.source.outline : "" })
    totalAi.gt += gt.length; totalAi.found += ai.found; totalAi.nested += ai.nested; totalAi.junk += ai.junk.length
  }
  // (for each miss, the PDF line that reads most like it, as foldlines gave it: what to look at next)
  // (and the lines either side of it on its page, at x0/y0 in points: a number set apart, a paragraph run into it)
  const lines = pages.flatMap((pg) => pg.lines.map((l, i) => [pg, i, l]))
  const say = (pg, l) => `“${l.t.slice(0, 50)}” @${Math.round(l.b[0] * pg.size[0])},${Math.round(l.b[1] * pg.size[1])}–${Math.round(l.b[2] * pg.size[0])} s ${l.s} f ${l.f} lb ${l.lb}/${l.w ? l.w.length : "?"} ${l.fn || ""}`
  const seen = misses.map((g) => {
    let best = null, score = 0
    for (const x of lines) { const v = ratio(g, head(x[2].t).slice(0, g.length + 8)); if (v > score) { score = v; best = x } }
    if (!best || score < 0.6) return "no line"
    const [pg, i, l] = best, near = (j) => pg.lines[j] ? say(pg, pg.lines[j]) : "none"
    return `p${pg.n} ${say(pg, l)}<br>  before ${near(i - 1)}<br>  after ${near(i + 1)}`
  })
  const body = M._.bodySize(M._.segmentsOf(pages).segs)
  rows.push({ name, layout, problem: r.problem, gt: gt.length, found, nested, junk: junk.length, junkList: junk, misses, seen, body, outline: outline.length, ms, among, candidates: cands ? cands.length : null, ai })
  total.gt += gt.length; total.found += found; total.nested += nested; total.junk += junk.length
  if (among !== null) { total.among += among; total.asked += gt.length }
}
if (json) { console.log(JSON.stringify({ label, rows, total, totalAi }, null, 1)); process.exit(0) }
console.log(`### ${label}\n`)
console.log("| Paper | Layout | Outline entries | Headings found | Nested right | Junk | Among the candidates | FoldMake ms |")
console.log("| --- | --- | --- | --- | --- | --- | --- | --- |")
for (const r of rows) {
  if (r.missing) { console.log(`| ${r.name} | ${r.layout} | no lines (download or PDFKit failed) | | | | | |`); continue }
  if (r.problem) { console.log(`| ${r.name} | ${r.layout} | ${r.outline} | ${r.problem} | | | | |`); continue }
  console.log(`| ${r.name} | ${r.layout} | ${r.outline} | ${r.found} / ${r.gt} | ${r.nested} / ${r.gt} | ${r.junk} | ${r.among === null ? "" : r.among + " / " + r.gt + " (of " + r.candidates + ")"} | ${Math.round(r.ms)} |`)
}
console.log(`| **All** | | | **${total.found} / ${total.gt}** | **${total.nested} / ${total.gt}** | **${total.junk}** | ${total.asked ? "**" + total.among + " / " + total.asked + "**" : ""} | |\n`)
if (totalAi.gt) {
  console.log(`### ${label}: with the model's outline\n`)
  console.log("| Paper | Layout | Sections set by | Headings found | Nested right | Junk |")
  console.log("| --- | --- | --- | --- | --- | --- |")
  for (const r of rows) if (r.ai) console.log(`| ${r.name} | ${r.layout} | ${r.ai.by} | ${r.ai.found} / ${r.gt} | ${r.ai.nested} / ${r.gt} | ${r.ai.junk.length} |`)
  console.log(`| **All** | | | **${totalAi.found} / ${totalAi.gt}** | **${totalAi.nested} / ${totalAi.gt}** | **${totalAi.junk}** |\n`)
  for (const r of rows) if (r.ai && (r.ai.misses.length || r.ai.junk.length)) {
    console.log(`- ${r.name}: missed ${r.ai.misses.length ? r.ai.misses.map((m) => "“" + m + "”").join(", ") : "none"}; junk ${r.ai.junk.length ? r.ai.junk.map((j) => "“" + String(j).slice(0, 60) + "”").join(", ") : "none"}`)
  }
  console.log("")
}
for (const r of rows) if (!r.missing && (r.misses?.length || r.junkList?.length)) {
  console.log(`- ${r.name}: missed ${r.misses.length ? r.misses.map((m) => "“" + m + "”").join(", ") : "none"}; junk ${r.junkList.length ? r.junkList.map((j) => "“" + String(j).slice(0, 60) + "”").join(", ") : "none"}`)
}
for (const r of rows) if (r.seen?.length) {
  console.log(`\n<details><summary>${r.name}: the lines nearest its misses (body ${r.body} pt)</summary>\n`)
  r.misses.forEach((m, i) => console.log(`- “${m}”: ${r.seen[i]}`))
  console.log("\n</details>")
}
console.log("")
