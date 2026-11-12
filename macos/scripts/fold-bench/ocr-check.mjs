// A scan read as the reader reads it (R5-SPEC 3.8), from what foldlines wrote with FOLD_OCR=1: FoldMake.textless on
// the PDF's own lines, the pages it names taken from <name>.ocr.json, FoldMake.read on the result. Prints what a check
// needs (whether it is a scan, the pages read, the sections, how many paragraphs and words), not the paper's text,
// unless --sample N prints N characters of each section's first paragraph and of one page as the runner orders it.
// --force A-B reads pages A to B from <name>.ocr.json whatever textless says (to compare Vision with a PDF's own text
// layer); with no <name>.ocr.json the text layer alone is read.
// usage: node ocr-check.mjs LINES_DIR NAME FOLDMAKE_DIR [VISION_MJS] [--sample N] [--force A-B]
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

const flags = ["--sample", "--force"]
const args = process.argv.slice(2).filter((a, i, all) => !flags.includes(a) && !flags.includes(all[i - 1]))
const at = process.argv.indexOf("--sample")
const sample = at > 0 ? Number(process.argv[at + 1]) || 0 : 0
const fat = process.argv.indexOf("--force")
const [fa, fb] = fat > 0 ? String(process.argv[fat + 1] || "").split("-").map(Number) : [0, -1]
const [dir, name, makeDir, visionPath] = args
const require = createRequire(import.meta.url)
const M = require(path.resolve(makeDir, "FoldMake.js"))
const lines = JSON.parse(fs.readFileSync(path.join(dir, name + ".lines.json"), "utf8"))
const ocrPath = path.join(dir, name + ".ocr.json")
const ocr = fs.existsSync(ocrPath) ? JSON.parse(fs.readFileSync(ocrPath, "utf8")) : []
const outline = fs.existsSync(path.join(dir, name + ".outline.json")) ? JSON.parse(fs.readFileSync(path.join(dir, name + ".outline.json"), "utf8")) : []
const meta = { title: name, pdf: { bytes: 0, modified: "", pages: lines.length, sha256: "" }, outline }

const before = M.read(lines, meta)
const need = M.textless(lines, meta)
console.log(`${name}: ${lines.length} pages; before OCR: ${before.problem || "a doc"}; textless: scan ${need.scan}, pages ${JSON.stringify(need.pages)}, own characters ${need.chars}`)
const byN = new Map(ocr.map((p) => [p.n, p.lines]))
const read = []
const forced = (n) => n >= fa && n <= (fb || fa)
const pages = lines.map((p) => (((need.scan && need.pages.includes(p.n)) || forced(p.n)) && byN.has(p.n) ? (read.push(p.n), Object.assign({}, p, { lines: byN.get(p.n) })) : p))
const made = M.read(pages, Object.assign({}, meta, read.length ? { ocr: read, ocr_engine: "vision" } : {}))
if (!made.doc) { console.log(`after OCR: ${made.problem}`); process.exit(1) }
const units = made.doc.sections.flatMap((s) => s.units)
const words = units.reduce((n, u) => n + u.sentences.join(" ").split(/\s+/).length, 0)
const bold = pages.filter((p) => read.includes(p.n)).flatMap((p) => p.lines).filter((l) => l.f & 1).length
console.log(`after OCR: ${read.length} pages read, ${made.doc.sections.length} sections, ${units.length} paragraphs, ${words} words, ${bold} lines read as bold, ${made.ask ? made.ask.n : 0} heading candidates for the outline pass`)
for (const s of made.doc.sections) {
  const first = s.units[0] ? s.units[0].sentences.join(" ") : ""
  console.log(`  ${"  ".repeat(Math.max(0, s.depth - 1))}${s.id} ${s.num ? s.num + " " : ""}${s.title || "(untitled)"} (${s.units.length})${sample ? ": " + first.slice(0, sample) : ""}`)
}
if (sample && visionPath && ocr.length) {
  const { readingOrder } = await import(path.resolve(visionPath))
  const page = ocr[Math.min(1, ocr.length - 1)]
  const text = readingOrder(page.lines.map((l) => ({ t: l.t, b: l.b, w: l.w })))
  console.log(`page ${page.n} as the runner orders it (${text.length} characters):\n${text.slice(0, sample * 4)}`)
}
