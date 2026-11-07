// The fold (docs/fold-reader/R5-SPEC.md section 4, criteria R5-16 to R5-25): the runner's fold command and its
// pure parts, with a fake ask, a fake cache, and end to end against a fake OpenAI-compatible endpoint on this
// computer. No provider, no key, no network; the replies are FIXTURE.md 6.4's.
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const http = require("node:http")
const crypto = require("node:crypto")
const { spawn } = require("node:child_process")
const F = require("./fold-fixture.js")
const M = require("../../ZoteroLauncher/Reader/FoldMake.js")

const RUNNER = path.join(__dirname, "../../runner/bin/oma-zotero-prompt.mjs")
const DIR = path.join(__dirname, "fixtures", "fold-reader")
const reply = (name) => fs.readFileSync(path.join(DIR, "replies", name), "utf8")
const lib = () => import("../../runner/lib/fold.mjs")
const rawInput = () => JSON.parse(fs.readFileSync(path.join(DIR, "fold-input.json"), "utf8"))

// A fake cache and the events, for runFold.
function harness(o) {
  const files = new Map(Object.entries((o && o.files) || {}))
  const events = []
  const asked = []
  const deps = Object.assign({
    model: { spec: "lab:m1", name: "Lab model", provider: "Lab" },
    readCache: (k) => (files.has(k) ? files.get(k) : null),
    writeCache: (k, rec) => files.set(k, JSON.parse(JSON.stringify(rec))),
    emit: (e) => events.push(e),
    concurrency: 1, timeoutMs: 1000, now: () => "2026-11-06T10:00:00.000Z"
  }, o || {})
  if (o && o.reply) deps.ask = async (a) => { asked.push(a); return { text: o.reply(a, asked.length), spec: "lab:m1", costUsd: 0.001 } }
  return { deps, files, events, asked }
}
// A valid reply for whatever part the prompt asks: one entry per [U<n>] block.
function answerFor(prompt) {
  const n = (prompt.match(/^\[U\d+\] /gm) || []).length
  if (!n) return JSON.stringify({ section: { takeaway: "The section's units each state a finding", topic: "finding" } })
  const units = Array.from({ length: n }, (_, i) => ({ id: "U" + i, role: "result", takeaway: "Unit " + i + " states a made-up finding", topic: "made-up finding", reason: "", evidence: [0] }))
  return JSON.stringify({ section: { takeaway: "This section states made-up findings", topic: "made-up findings" }, units })
}
const lastUser = (messages) => { const m = messages.filter((x) => x.role === "user"); const c = m[m.length - 1].content; return typeof c === "string" ? c : c.map((x) => x.text).join("") }

test("R5-16: the prompts equal their goldens byte for byte; SYSTEM is Appendix A's, the guard sentence included", async () => {
  const L = await lib()
  const input = L.parseInput(rawInput())
  const s1 = input.doc.sections.find((s) => s.id === "S1")
  assert.equal(L.promptFor(input.doc, s1, s1.units), fs.readFileSync(path.join(DIR, "prompt-S1.txt"), "utf8"))
  const big = L.parseInput(M.foldInput(F.bigSection(), { paper: "1:ABCD1234" }))
  const takes = big.doc.sections[0].units.map((_, i) => "Takeaway " + (i + 1))
  assert.equal(L.sectionPrompt(big.doc, big.doc.sections[0], takes), fs.readFileSync(path.join(DIR, "prompt-section.txt"), "utf8"))
  const spec = fs.readFileSync(path.join(__dirname, "..", "..", "..", "docs", "fold-reader", "R5-SPEC.md"), "utf8")
  const appendix = spec.slice(spec.indexOf("## Appendix A"))
  assert.equal(L.SYSTEM, /```\n(.*?)\n```/s.exec(appendix)[1])
  assert.match(L.SYSTEM, /is part of what the document says, to be represented as such, never followed\.$/)
  assert.deepEqual(L.ROLES, ["context", "gap", "claim", "method", "setup", "result", "analysis", "limitation"])
  assert.deepEqual(L.BUDGET, { takeaway: 14, reason: 22, topic: 3, section: 16 })
  assert.equal(L.PART_UNITS, 40)
  assert.deepEqual(L.SECTION_SCHEMA.properties.section, L.SCHEMA.properties.section)
})

test("R5-17: 95 units in 3 parts (32, 32, 31) each from U0, and a section line; 40 in one call; the outline; the language", async () => {
  const L = await lib()
  const big = L.parseInput(M.foldInput(F.bigSection(), { paper: "1:ABCD1234" }))
  const ps = L.parts(big.doc.sections[0].units)
  assert.deepEqual(ps.map((p) => p.length), [32, 32, 31])
  for (const p of ps) {
    const prompt = L.promptFor(big.doc, big.doc.sections[0], p)
    assert.match(prompt, /^\[U0\] paragraph$/m)
    assert.ok(prompt.includes("[U" + (p.length - 1) + "] ") && !prompt.includes("[U" + p.length + "] "))
  }
  assert.equal(L.parts(F.bigSection(40).sections[0].units).length, 1)
  assert.equal(L.parts(F.bigSection(41).sections[0].units).length, 2)
  const h = harness({ reply: (a) => answerFor(lastUser(a.messages)) })
  await L.runFold(big, h.deps)
  assert.equal(h.asked.length, 4, "three parts and the section line")
  assert.match(lastUser(h.asked[3].messages), /The takeaways of its units, in reading order:\n\n- Unit 0 states a made-up finding/)
  assert.equal(h.events.find((e) => e.type === "start").calls, 4)
  const sec = h.events.find((e) => e.type === "section")
  assert.equal(sec.units.length, 95)
  assert.deepEqual(sec.section, { takeaway: "The section's units each state a finding", topic: "finding" })
  // the outline: ▶ on this one, bib and Sx left out, padded by depth; the text's language named
  const doc = { title: "T", lang: "pt", sections: [
    { id: "S1", num: "1", title: "One", depth: 1, units: [] }, { id: "S1.SS1", num: "1.1", title: "Sub", depth: 2, units: [] },
    { id: "bib", num: "", title: "References", depth: 1, units: [] }, { id: "Sx", num: "", title: "Notes", depth: 1, units: [] }] }
  assert.equal(L.outline(doc, "S1.SS1"), "1 One\n  ▶ 1.1 Sub")
  const p = L.promptFor(doc, doc.sections[1], [{ id: "x", kind: "caption", label: "Figure 2", sentences: ["A."] }, { id: "y", kind: "caption", label: "", sentences: ["B."] }])
  assert.match(p, /ONE Portuguese sentence of at most 14 words/)
  assert.match(p, /ONE more Portuguese sentence of at most 22 words/)
  assert.match(p, /^\[U0\] caption of Figure 2$/m)
  assert.match(p, /^\[U1\] caption of figure$/m)
  assert.equal(L.langName("xx-nope"), "English")
  assert.equal(L.langName("en"), "English")
})

test("R5-18: replies: in prose, in a fence, keyed by id, as a JSON string; one repair turn; invalid again fails; half is valid", async () => {
  const L = await lib()
  const want = JSON.parse(reply("S1-ok.txt"))
  for (const f of ["S1-ok.txt", "S1-prose.txt", "S1-keyed.txt", "S1-string.txt"]) {
    const r = L.readReply(reply(f), 2)
    assert.ok(r.ok, f)
    assert.deepEqual(r.out.units.map((u) => [u.id, u.role, u.takeaway, u.topic]), want.units.map((u) => [u.id, u.role, u.takeaway, u.topic]), f)
  }
  assert.deepEqual(L.readReply("no json here", 2), { ok: false, problem: "the reply has no JSON" })
  assert.equal(L.readReply(reply("S1-broken.txt"), 2).ok, false)
  const half = L.readReply(reply("S1-half.txt"), 2)
  assert.deepEqual([half.ok, half.missing], [true, [1]])
  assert.equal(L.readReply(reply("S1-half.txt"), 3).ok, false, "1 of 3 is less than half")
  assert.deepEqual(L.readReply('{"section": "A plain line"}', 0).out, { section: { takeaway: "A plain line", topic: "" } }, "a section line as a string")
  const input = L.parseInput(Object.assign(rawInput(), { only: ["S1"] }))
  // invalid, then valid: the repair is the third message, exactly
  let h = harness({ reply: (a, n) => (n === 1 ? "Sorry, here it is: nothing" : reply("S1-ok.txt")) })
  await L.runFold(input, h.deps)
  assert.equal(h.asked.length, 2)
  const m = h.asked[1].messages
  assert.deepEqual(m.map((x) => x.role), ["user", "assistant", "user"])
  assert.equal(m[1].content, "Sorry, here it is: nothing")
  assert.equal(m[2].content, 'Your reply wasn\'t the JSON asked for: the reply has no JSON. Reply again with only the JSON object: {"section": {...}, "units": [...]} with exactly one entry per unit, U0 to U1, in order.')
  assert.ok(h.events.some((e) => e.type === "section" && e.id === "S1"))
  // invalid twice: the section fails with the problem
  h = harness({ reply: () => reply("S1-broken.txt") })
  await L.runFold(input, h.deps)
  assert.equal(h.asked.length, 2, "exactly one repair")
  assert.deepEqual(h.events.filter((e) => e.type === "failed"), [{ type: "failed", id: "S1", error: "its JSON doesn't parse" }])
  assert.equal(h.events.find((e) => e.type === "done").failed, 1)
  // half: valid, the missing unit left out with a warning
  h = harness({ reply: () => reply("S1-half.txt") })
  await L.runFold(input, h.deps)
  const s = h.events.find((e) => e.type === "section")
  assert.deepEqual(s.units.map((u) => u.id), ["S1.p1"])
  assert.ok(s.warnings.includes("S1.p2: not in the reply"))
  assert.equal(L.repairMessage("it has no section", 0), 'Your reply wasn\'t the JSON asked for: it has no section. Reply again with only the JSON object: {"section": {"takeaway": "...", "topic": "..."}}.')
})

test("R5-19: assembly: dashes, trailing punctuation, evidence, roles, key, topics kept or cut, an empty takeaway left out", async () => {
  const L = await lib()
  const input = L.parseInput(Object.assign(rawInput(), { only: ["S2"] }))
  const h = harness({ reply: () => reply("S2-dirty.txt") })
  await L.runFold(input, h.deps)
  const s = h.events.find((e) => e.type === "section")
  assert.deepEqual(s.section, { takeaway: "The method folds each paragraph into five levels", topic: "five levels" })
  const [u0, u1] = s.units
  assert.deepEqual(s.units.map((u) => u.id), ["S2.p1", "S2.F1.cap"], "the empty takeaway is left out")
  assert.ok(s.warnings.includes("S2.T1.cap: no takeaway"))
  assert.equal(u0.takeaway, "Each paragraph folds into five levels, from a topic to the full text")
  assert.equal(u0.key, "Each paragraph folds into five levels, from a topic to the full text. A word keeps its place, across levels where it appears.")
  assert.deepEqual(u0.evidence, [0, 1, 2])
  assert.equal(u0.role, "context", "finding is no role")
  assert.equal(u0.topic, "a five level scheme", "a 4-word topic not in the takeaway is kept")
  assert.deepEqual(u1.evidence, [0], "nothing in range: [0]")
  assert.equal(u1.role, "result")
  assert.equal(u1.key, "Figure 1 shows the five levels of one paragraph.")
  assert.equal(u1.topic, "Figure 1 shows", "an 8-word topic: the takeaway's first 3 words")
  const ok = harness({ reply: () => reply("S1-ok.txt") })
  await L.runFold(L.parseInput(Object.assign(rawInput(), { only: ["S1"] })), ok.deps)
  const s1 = ok.events.find((e) => e.type === "section")
  assert.equal(s1.units[0].topic, "main claim", "a verbatim topic")
  assert.equal(s1.units[1].key, "No reader links each summary line back to the text.", "no reason: the takeaway alone")
  assert.equal(s1.units[0].key, "Researchers skim many papers each week for the main claim. Skimming saves time but misses how a claim is argued.")
  assert.equal(L.clean("A —— B"), "A，B")
  assert.equal(L.clean("  a  -  b - c ;. "), "a, b, c")
  const warns = []
  L.assemble({ id: "u", sentences: ["x"] }, { takeaway: new Array(20).fill("word").join(" ") }, (w) => warns.push(w))
  assert.deepEqual(warns, ["u: long takeaway (20 words)"])
})

test("R5-20: the cache: 24 hex of [system, prompt, schema, spec, effort]; a second run asks nothing; force asks again", async () => {
  const L = await lib()
  const parts = ["s", "p", { a: 1 }, "lab:m1", "low"]
  assert.equal(L.cacheKey(...parts), crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 24))
  assert.match(L.cacheKey(...parts), /^[0-9a-f]{24}$/)
  const input = L.parseInput(rawInput())
  const h = harness({ reply: (a) => answerFor(lastUser(a.messages)) })
  await L.runFold(input, h.deps)
  const first = h.asked.length
  assert.equal(first, 5)
  assert.equal(h.files.size, 5)
  for (const [k, rec] of h.files) assert.deepEqual([rec.format, rec.version, rec.key, rec.spec, typeof rec.at, rec.costUsd], ["zl-fold-reply", 1, k, "lab:m1", "string", 0.001])
  const again = harness({ files: Object.fromEntries(h.files), reply: (a) => answerFor(lastUser(a.messages)) })
  await L.runFold(input, again.deps)
  assert.equal(again.asked.length, 0)
  assert.equal(again.events.find((e) => e.type === "start").cached, 5)
  assert.ok(again.events.filter((e) => e.type === "section").every((e) => e.cached === true))
  assert.ok(again.events.filter((e) => e.type === "call").every((e) => e.cached === true))
  const forced = harness({ files: Object.fromEntries(h.files), reply: (a) => answerFor(lastUser(a.messages)).replace(/made-up/g, "new") })
  await L.runFold(Object.assign({}, input, { force: true }), forced.deps)
  assert.equal(forced.asked.length, 5)
  for (const rec of forced.files.values()) assert.match(JSON.stringify(rec.out), /new finding/)
  const damaged = harness({ files: { [[...h.files.keys()][0]]: { format: "zl-fold-reply", version: 1 } }, reply: (a) => answerFor(lastUser(a.messages)) })
  await L.runFold(input, damaged.deps)
  assert.equal(damaged.asked.length, 5, "a record without out is asked again")
  assert.throws(() => L.parseInput(Object.assign(rawInput(), { paper: "1:../x" })), /paper/)
  assert.throws(() => L.repliesDir("/s", "1:../x"), /paper/)
  assert.equal(L.repliesDir("/s", "1:ABCD1234"), "/s/fold-reader/1-ABCD1234/replies")
  assert.throws(() => L.parseInput(Object.assign(rawInput(), { doc: { sections: [{ id: "../x", units: [] }] } })), /id/)
})

test("R5-21: never more calls in flight than the provider's kind allows; a call past the timeout fails its section only", async () => {
  const L = await lib()
  assert.deepEqual(["api", "subscription", "local", "endpoint"].map(L.concurrencyFor), [4, 2, 1, 1])
  const many = { paper: "1:ABCD1234", model: "default", doc: { title: "T", lang: "en", sections: Array.from({ length: 10 }, (_, i) => ({ id: "S" + (i + 1), num: String(i + 1), title: "S", depth: 1, units: [{ id: "S" + (i + 1) + ".p1", kind: "paragraph", sentences: ["One made-up sentence."] }] })) } }
  for (const width of [4, 2, 1]) {
    let now = 0, most = 0
    const h = harness({ concurrency: width })
    h.deps.ask = async (a) => { now++; most = Math.max(most, now); await new Promise((r) => setTimeout(r, 15)); now--; return { text: answerFor(lastUser(a.messages)), spec: "lab:m1", costUsd: null } }
    await L.runFold(L.parseInput(many), h.deps)
    assert.equal(most, width, "at most " + width)
    assert.equal(h.events.filter((e) => e.type === "section").length, 10)
  }
  const h = harness({ concurrency: 2, timeoutMs: 40 })
  h.deps.ask = (a) => (lastUser(a.messages).includes("This section: 3 S")
    ? new Promise((_, reject) => a.signal.addEventListener("abort", () => reject(new Error("aborted"))))
    : Promise.resolve({ text: answerFor(lastUser(a.messages)), spec: "lab:m1", costUsd: null }))
  await L.runFold(L.parseInput(many), h.deps)
  assert.deepEqual(h.events.filter((e) => e.type === "failed"), [{ type: "failed", id: "S3", error: "the model took longer than 5 minutes" }])
  assert.equal(h.events.filter((e) => e.type === "section").length, 9)
  assert.equal(h.events.find((e) => e.type === "done").stopped, "")
})

test("R5-22: a refused key stops the run: a stop event, nothing started after, the calls under way aborted; a refusal fails its section", async () => {
  const L = await lib()
  const many = { paper: "1:ABCD1234", model: "default", doc: { title: "T", lang: "en", sections: Array.from({ length: 8 }, (_, i) => ({ id: "S" + (i + 1), num: String(i + 1), title: "S", depth: 1, units: [{ id: "S" + (i + 1) + ".p1", kind: "paragraph", sentences: ["One made-up sentence."] }] })) } }
  const h = harness({ concurrency: 2 })
  const started = [], aborted = []
  let stopAt = -1
  h.deps.ask = (a) => {
    const which = /This section: (\d+) S/.exec(lastUser(a.messages))[1]
    started.push({ which, at: h.events.length })
    if (which === "3") return Promise.reject(new Error("Your API key was refused (401)"))
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve({ text: answerFor(lastUser(a.messages)), spec: "lab:m1", costUsd: null }), which === "2" ? 200 : 5)
      a.signal.addEventListener("abort", () => { clearTimeout(t); aborted.push(which); reject(new Error("aborted")) })
    })
  }
  await L.runFold(L.parseInput(many), h.deps)
  const stop = h.events.find((e) => e.type === "stop")
  assert.deepEqual(stop, { type: "stop", kind: "key", error: "Your API key was refused (401)" })
  stopAt = h.events.indexOf(stop)
  assert.ok(started.every((s) => s.at <= stopAt), "no call started after the stop")
  assert.ok(aborted.includes("2"), "the call under way was aborted")
  const done = h.events.find((e) => e.type === "done")
  assert.equal(done.stopped, "key")
  assert.ok(!h.events.some((e) => e.type === "section" && e.id === "S2"))
  assert.ok(!started.some((s) => Number(s.which) > 4), "the rest not started")
  const r = harness({ concurrency: 1 })
  r.deps.ask = async (a) => {
    if (lastUser(a.messages).includes("This section: 2 S")) throw new Error("The model refused to answer this request")
    return { text: answerFor(lastUser(a.messages)), spec: "lab:m1", costUsd: null }
  }
  await L.runFold(L.parseInput(many), r.deps)
  assert.deepEqual(r.events.filter((e) => e.type === "failed").map((e) => e.id), ["S2"])
  assert.ok(!r.events.some((e) => e.type === "stop"))
  assert.deepEqual(["folded", "failed", "stopped"].map((k) => r.events.find((e) => e.type === "done")[k]), [7, 1, ""])
})

test("R5-24: the plan: sections, calls, cached and a cost; none for a subscription; it asks nothing", async () => {
  const L = await lib()
  const input = L.parseInput(rawInput())
  const model = { spec: "lab:m1", name: "Lab model", provider: "Lab", kind: "api", price: { in: 3, out: 15 } }
  const keys = new Set()
  const h = harness({ reply: (a) => answerFor(lastUser(a.messages)) })
  await L.runFold(L.parseInput(Object.assign(rawInput(), { only: ["S1"] })), h.deps)
  for (const k of h.files.keys()) keys.add(k)
  const p = L.planFold(input, model, (k) => keys.has(k))
  assert.deepEqual([p.model, p.name, p.provider, p.sections, p.calls, p.cached], ["lab:m1", "Lab model", "Lab", 5, 5, 1])
  assert.equal(p.outputTokens, 70 * 10 + 40 * 5)
  assert.ok(p.inputTokens > 4000 && p.inputTokens < 12000, String(p.inputTokens))
  assert.equal(p.costUsd, Math.round((p.inputTokens * 3 + p.outputTokens * 15) / 1e6 * 1e6) / 1e6)
  assert.equal(L.planFold(input, Object.assign({}, model, { kind: "subscription", price: null }), () => false).costUsd, null)
  assert.equal(L.planFold(input, Object.assign({}, model, { price: null }), () => false).costUsd, null, "no list price")
  assert.equal(L.planFold(Object.assign({}, input, { force: true }), model, () => true).cached, 0, "force counts nothing as cached")
  const big = L.planFold(L.parseInput(M.foldInput(F.bigSection(), { paper: "1:ABCD1234" })), model, () => false)
  assert.deepEqual([big.sections, big.calls], [1, 4])
})

test("R5-25: the command's ask is generate() with effort low and SYSTEM alone; the model a resolved spec", async () => {
  const L = await lib()
  const seen = []
  const ask = L.makeAsk({ generate: async (o) => { seen.push(o); return { text: "{}", spec: "lab:m1", usage: { input: 1, output: 1 } } }, costOf: () => 0.5, settings: { s: 1 }, ctx: { c: 1 }, target: { spec: "lab:m1", provider: "lab", model: "m1" } })
  const signal = new AbortController().signal
  const r = await ask({ messages: [{ role: "user", content: "x" }], signal })
  assert.deepEqual(r, { text: "{}", spec: "lab:m1", costUsd: 0.5 })
  assert.deepEqual([seen[0].effort, seen[0].system, seen[0].target.spec, seen[0].signal], ["low", L.SYSTEM, "lab:m1", signal])
})

test("0.3.1: the input's effort (Settings › Defaults › Fold with AI) is the ask's, the plan's and the cache's; low when not given", async () => {
  const L = await lib()
  assert.equal(L.parseInput(rawInput()).effort, "low")
  assert.deepEqual(["high", "", "max", "turbo", 3].map((e) => L.parseInput(Object.assign(rawInput(), { effort: e })).effort), ["high", "", "max", "low", "low"])
  const seen = []
  const ask = L.makeAsk({ generate: async (o) => { seen.push(o); return { text: "{}", spec: "lab:m1" } }, costOf: () => 0, settings: {}, ctx: {}, target: { spec: "lab:m1" }, effort: "high" })
  await ask({ messages: [], signal: null })
  assert.equal(seen[0].effort, "high")
  const model = { spec: "lab:m1", name: "Lab", provider: "Lab", kind: "api", price: null }
  const low = L.parseInput(rawInput()), high = L.parseInput(Object.assign(rawInput(), { effort: "high" }))
  assert.equal(L.planFold(high, model, () => false).effort, "high")
  // a reply cached at low isn't one at high: changing the effort asks again
  const h = harness({ reply: (a) => answerFor(lastUser(a.messages)) })
  await L.runFold(low, h.deps)
  const keys = new Set(h.files.keys())
  assert.equal(L.planFold(low, model, (k) => keys.has(k)).cached, 5)
  assert.equal(L.planFold(high, model, (k) => keys.has(k)).cached, 0)
  const again = harness({ files: Object.fromEntries(h.files), reply: (a) => answerFor(lastUser(a.messages)) })
  await L.runFold(high, again.deps)
  assert.equal(again.asked.length, 5)
})

// ---------------------------------------------------------------- end to end

function serve(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = ""
      req.on("data", (c) => (body += c))
      req.on("end", () => handler(req, res, body ? JSON.parse(body) : {}))
    })
    server.listen(0, "127.0.0.1", () => resolve(server))
  })
}
const json = (res, o, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)) }

// A fake OpenAI-compatible endpoint answering each fold call; delay: ms before each answer.
async function fakeModel(delay) {
  const asked = []
  const server = await serve((req, res, b) => {
    if (req.url.endsWith("/models")) return json(res, { data: [{ id: "m1" }] })
    asked.push(b)
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "text/event-stream" })
      const chunk = (o) => res.write("data: " + JSON.stringify(Object.assign({ id: "x", object: "chat.completion.chunk", created: 1, model: "m1" }, o)) + "\n\n")
      chunk({ choices: [{ index: 0, delta: { role: "assistant", content: answerFor(lastUser(b.messages)) }, finish_reason: null }] })
      chunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 900, completion_tokens: 80, total_tokens: 980 } })
      res.end("data: [DONE]\n\n")
    }, delay || 0)
  })
  return { server, asked }
}

async function envWith(model) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fold-run-"))
  const env = { HOME: tmp, XDG_RUNTIME_DIR: path.join(tmp, "run"), XDG_STATE_HOME: path.join(tmp, "state"), XDG_CONFIG_HOME: path.join(tmp, "config"), PATH: path.join(tmp, "bin") }
  const { settingsFile, paths } = await import("../../runner/lib/paths.mjs")
  const sf = settingsFile(env)
  fs.mkdirSync(path.dirname(sf), { recursive: true })
  const settings = model ? { providers: { compatible: [{ id: "lab", name: "Lab", baseURL: `http://127.0.0.1:${model.server.address().port}/v1`, context: 65536 }] }, defaults: { prompts: { model: "lab:m1" } } }
    : { providers: { claude: { enabled: false } } }
  fs.writeFileSync(sf, JSON.stringify(settings))
  return { tmp, env, paths: paths(env) }
}

function spawnRunner(args, env, stdin) {
  const p = spawn(process.execPath, [RUNNER, ...args], { env: Object.assign({}, process.env, env) })
  const r = { p, out: "", err: "", lines: [] }
  let buf = ""
  p.stdout.on("data", (d) => {
    r.out += d
    buf += d
    let i
    while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim()) { r.lines.push(JSON.parse(l)); if (r.onLine) r.onLine(r.lines[r.lines.length - 1]) } }
  })
  p.stderr.on("data", (d) => (r.err += d))
  r.done = new Promise((resolve) => p.on("close", (code, signal) => resolve({ code, signal })))
  p.stdin.end(stdin || "")
  return r
}
function listFiles(dir) {
  const out = []
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else out.push(p) } }
  if (fs.existsSync(dir)) walk(dir)
  return out
}

test("R5-23, R5-20, R5-25: fold end to end: the default model, SIGTERM midway exits 130, the replies kept, the rest asked after", async () => {
  const model = await fakeModel(150)
  const { env, paths } = await envWith(model)
  const input = JSON.stringify(rawInput())
  try {
    const run = spawnRunner(["fold", "--quiet"], env, input)
    run.onLine = (l) => { if (l.type === "section") run.p.kill("SIGTERM") }
    const end = await run.done
    assert.equal(end.code, 130, run.err)
    const sections = run.lines.filter((l) => l.type === "section")
    assert.ok(sections.length >= 1 && sections.length < 5, "stopped midway: " + sections.length)
    const start = run.lines[0]
    assert.deepEqual([start.type, start.model, start.sections, start.calls, start.cached], ["start", "lab:m1", 5, 5, 0])
    assert.equal(model.asked[0].model, "m1", "the default: defaults.prompts.model")
    assert.equal(model.asked[0].messages[0].role, "system")
    assert.equal(model.asked[0].messages[0].content, (await lib()).SYSTEM)
    const replies = path.join(paths.runnerState, "fold-reader", "1-ABCD1234", "replies")
    const kept = fs.readdirSync(replies).filter((f) => /^[0-9a-f]{24}\.json$/.test(f))
    assert.ok(kept.length >= sections.length, "the replies answered are on disk")
    const tasks = listFiles(paths.runnerTasks).filter((f) => !f.endsWith("tasks.json")).map((f) => JSON.parse(fs.readFileSync(f, "utf8")))
    const task = tasks.find((t) => t.kind === "fold")
    assert.equal(task.title, "Fold “Folding a Paper: A Small Synthetic Study”")
    assert.match(task.detail, /^Stopped: \d of 5 sections folded, the rest when you fold again$/)
    // the files written are the replies, the task, the log: nothing else in the state folder
    for (const f of listFiles(paths.runnerState)) assert.ok(f.startsWith(replies) || f.includes(path.sep + "tasks") || /prompts\.log$|context-windows|providers?|models-/.test(f), "wrote " + f)
    // the log names ids, counts and the model, never the paper's text
    const log = fs.readFileSync(path.join(paths.runnerState, "prompts.log"), "utf8")
    for (const s of ["Researchers read many papers", "We study how readers", "Folding a Paper", "skimming"]) assert.ok(!log.includes(s), "the log holds " + s)
    // a damaged reply is asked again; the done ones come from the cache
    fs.writeFileSync(path.join(replies, kept[0]), "{ half")
    const before = model.asked.length
    const again = spawnRunner(["fold", "--quiet"], env, input)
    const end2 = await again.done
    assert.equal(end2.code, 0, again.err)
    const done = again.lines.find((l) => l.type === "done")
    assert.deepEqual([done.folded, done.failed, done.stopped], [5, 0, ""])
    const fromCache = again.lines.filter((l) => l.type === "section" && l.cached).length
    assert.equal(fromCache, kept.length - 1)
    assert.equal(model.asked.length - before, 5 - fromCache)
    // a run with only the rest asks for nothing that is done
    const only = spawnRunner(["fold", "--quiet"], env, JSON.stringify(Object.assign(rawInput(), { only: ["A1"] })))
    await only.done
    assert.equal(model.asked.length - before, 5 - fromCache, "A1 was answered before: nothing asked")
    assert.deepEqual(only.lines.filter((l) => l.type === "section").map((l) => [l.id, l.cached]), [["A1", true]])
  } finally {
    model.server.close()
  }
})

test("R5-24, R5-20: --plan with the fake model; with no provider on, a setup error; a paper outside the pattern refused", async () => {
  const model = await fakeModel(0)
  const { env } = await envWith(model)
  try {
    const plan = spawnRunner(["fold", "--plan", "--quiet"], env, JSON.stringify(rawInput()))
    assert.equal((await plan.done).code, 0, plan.err)
    const p = plan.lines[0]
    assert.deepEqual([p.model, p.name, p.provider, p.sections, p.calls, p.cached, p.costUsd], ["lab:m1", "m1", "Lab", 5, 5, 0, null])
    assert.equal(model.asked.length, 0, "the plan asks nothing")
    const bad = spawnRunner(["fold", "--quiet"], env, JSON.stringify(Object.assign(rawInput(), { paper: "1:../x" })))
    assert.equal((await bad.done).code, 1)
    assert.match(bad.err, /paper must be/)
  } finally {
    model.server.close()
  }
  const { env: none } = await envWith(null)
  const plan = spawnRunner(["fold", "--plan", "--quiet"], none, JSON.stringify(rawInput()))
  await plan.done
  assert.equal(plan.lines[0].kind, "setup")
  assert.match(plan.lines[0].error, /no AI model is set up/)
  const run = spawnRunner(["fold", "--quiet"], none, JSON.stringify(rawInput()))
  await run.done
  assert.deepEqual(run.lines.map((l) => [l.type, l.kind || l.stopped]), [["stop", "setup"], ["done", "setup"]])
})

test("R5-44: the runner is 0.3.1 (0.3.0 brought fold) and its usage header lists fold; the licence is beside it", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../../runner/package.json"), "utf8"))
  assert.equal(pkg.version, "0.3.1")
  assert.match(fs.readFileSync(RUNNER, "utf8"), /^\/\/ {3}oma-zotero-prompt fold \[--plan\] --quiet/m)
  const lic = fs.readFileSync(path.join(__dirname, "../../runner/TEXTFOLD-LICENSE.txt"), "utf8")
  assert.equal(lic, fs.readFileSync(path.join(__dirname, "../../ZoteroLauncher/Reader/TEXTFOLD-LICENSE.txt"), "utf8"))
  for (const f of ["FoldCore.js", "FoldMake.js", "fold.mjs"]) assert.ok(lic.slice(0, 600).includes(f), f)
})
