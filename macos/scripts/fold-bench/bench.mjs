// The fold reader's extraction benchmark (README.md): FoldMake.read on the lines foldlines wrote, its headings scored
// against gt/<name>.txt (one "level title" a line: the PDF's outline, the publisher's HTML, or the PDF read by hand).
// usage: node bench.mjs LINES_DIR FOLDMAKE_DIR [LABEL] — prints a Markdown table; --json for the numbers.
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

const here = path.dirname(new URL(import.meta.url).pathname)
const [linesDir, makeDir, label = "FoldMake"] = process.argv.slice(2).filter((a) => !a.startsWith("--"))
const json = process.argv.includes("--json")
const require = createRequire(import.meta.url)
const M = require(path.resolve(makeDir, "FoldMake.js"))

const norm = (t) => (String(t).normalize("NFKC").toLowerCase().replace(/&amp;/g, "&").match(/[a-z0-9]+/g) || []).join(" ")
const NUM = /^\s*(?:[0-9]+(?:\.[0-9]+)*|[IVX]+|[A-Z](?:\.[0-9]+)*)[.)]?\s+/
const head = (t) => norm(String(t).trim().replace(NUM, ""))
// (headings a paper has that its outline leaves out: neither hits nor junk)
const NEUTRAL = new Set(["acknowledgments", "acknowledgements", "acknowledgment", "appendix", "references", "llm assistance statement",
  "basic skills", "content", "process", "cross functional skills", "occupations with no labeled exposed tasks", "author contributions",
  "pascal voc", "ms coco", "imagenet detection", "appendix for bert pre training of deep bidirectional transformers for language understanding"])

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
const rows = [], total = { gt: 0, found: 0, nested: 0, junk: 0 }
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
  const preds = r.doc ? r.doc.sections.filter((s) => s.id !== "abstract" && s.id !== "Sx").map((s) => [s.depth || 1, head(s.title), s.title]) : []
  const kept = preds.filter((p) => !match(p[1], norm(title)))
  const used = new Set(), pairs = []
  gt.forEach(([, g], gi) => { for (let pi = 0; pi < kept.length; pi++) if (!used.has(pi) && match(g, kept[pi][1])) { used.add(pi); pairs.push([gi, pi]); break } })
  pairs.sort((a, b) => a[1] - b[1])
  const gpar = parents(gt), mpar = parents(pairs.map(([gi, pi]) => [kept[pi][0], gi]))
  const nested = pairs.filter(([gi], i) => gpar[gi] === (mpar[i] === null ? null : gt[mpar[i]][1])).length
  const junk = kept.filter((p, i) => !used.has(i) && !NEUTRAL.has(p[1])).map((p) => p[2])
  const misses = gt.filter((g, gi) => !pairs.some(([x]) => x === gi)).map((g) => g[1])
  // (for each miss, the PDF line that reads most like it, as foldlines gave it: what to look at next)
  const lines = pages.flatMap((pg) => pg.lines.map((l) => [pg.n, l]))
  const seen = misses.map((g) => {
    let best = null, score = 0
    for (const [n, l] of lines) { const v = ratio(g, head(l.t).slice(0, g.length + 8)); if (v > score) { score = v; best = [n, l] } }
    return best && score >= 0.6 ? `p${best[0]} “${best[1].t.slice(0, 50)}” s ${best[1].s} f ${best[1].f} lb ${best[1].lb}/${best[1].w ? best[1].w.length : "?"} ${best[1].fn || ""}` : "no line"
  })
  rows.push({ name, layout, problem: r.problem, gt: gt.length, found: pairs.length, nested, junk: junk.length, junkList: junk, misses, seen, outline: outline.length, ms })
  total.gt += gt.length; total.found += pairs.length; total.nested += nested; total.junk += junk.length
}
if (json) { console.log(JSON.stringify({ label, rows, total }, null, 1)); process.exit(0) }
console.log(`### ${label}\n`)
console.log("| Paper | Layout | Outline entries | Headings found | Nested right | Junk | FoldMake ms |")
console.log("| --- | --- | --- | --- | --- | --- | --- |")
for (const r of rows) {
  if (r.missing) { console.log(`| ${r.name} | ${r.layout} | no lines (download or PDFKit failed) | | | | |`); continue }
  if (r.problem) { console.log(`| ${r.name} | ${r.layout} | ${r.outline} | ${r.problem} | | | |`); continue }
  console.log(`| ${r.name} | ${r.layout} | ${r.outline} | ${r.found} / ${r.gt} | ${r.nested} / ${r.gt} | ${r.junk} | ${Math.round(r.ms)} |`)
}
console.log(`| **All** | | | **${total.found} / ${total.gt}** | **${total.nested} / ${total.gt}** | **${total.junk}** | |\n`)
for (const r of rows) if (!r.missing && (r.misses?.length || r.junkList?.length)) {
  console.log(`- ${r.name}: missed ${r.misses.length ? r.misses.map((m) => "“" + m + "”").join(", ") : "none"}; junk ${r.junkList.length ? r.junkList.map((j) => "“" + String(j).slice(0, 60) + "”").join(", ") : "none"}`)
}
for (const r of rows) if (r.seen?.length) {
  console.log(`\n<details><summary>${r.name}: the lines nearest its misses</summary>\n`)
  r.misses.forEach((m, i) => console.log(`- “${m}”: ${r.seen[i]}`))
  console.log("\n</details>")
}
console.log("")
