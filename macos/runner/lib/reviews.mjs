// A review table's AI columns, filled paper by paper (phase 11b,
// macos/docs/superpowers/specs/2026-10-28-phase-11b-ai-columns-design.md): `review-run` reads a job on stdin (the
// review, its AI columns as the app resolved them, the cells to fill), asks each paper once per kind of request, and
// writes each paper's cells as soon as they're made (reviews/cells/<column id>.cells.json, the format ReviewCore.js
// reads), so a run that is stopped keeps what it made. A Jev column reads what tagging reads and writes no tags: its
// result stays in the column's cells. Everything here but the cells file is pure; runReview takes the reading,
// asking and writing as functions (node-tested with fakes).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "./atomic.mjs";
import { normalize, quoteFound } from "./quotes.mjs";
import { classificationText, decide, THRESHOLD, LOW, NOT_STATED } from "./taxonomies.mjs";
import { fatalKind } from "./fatal.mjs";

export const MAX_PAPERS = 200;
export const KINDS = ["prompt", "jev-several", "jev-one", "jev-relevance"];
const PAPER = /^\d+:[A-Z0-9]{8}$/;
const COLUMN = /^c-[a-z0-9]{10}$/;

// ---------------------------------------------------------------- the job

// The job, checked: { review, name, columns: [{ id, label, kind, … , hash }], jobs: [{ column, paper }] } →
// { review, name, columns, papers: [{ id, columns: [column ids] }] } (papers in the jobs' order, at most 200), or
// throws.
export function parseJob(raw) {
  const j = raw && typeof raw === "object" ? raw : {};
  const cols = (Array.isArray(j.columns) ? j.columns : []).filter((c) => c && COLUMN.test(String(c.id)) && KINDS.includes(c.kind));
  if (!cols.length) throw new Error("no AI columns to run");
  const byId = new Map(cols.map((c) => [c.id, c]));
  const papers = new Map();
  for (const x of Array.isArray(j.jobs) ? j.jobs : []) {
    if (!x || !byId.has(x.column) || !PAPER.test(String(x.paper))) continue;
    if (!papers.has(x.paper)) {
      if (papers.size >= MAX_PAPERS) continue;
      papers.set(x.paper, []);
    }
    if (!papers.get(x.paper).includes(x.column)) papers.get(x.paper).push(x.column);
  }
  if (!papers.size) throw new Error("no cells to fill");
  return { review: String(j.review || ""), name: String(j.name || "Review").slice(0, 120), columns: cols, papers: [...papers].map(([id, c]) => ({ id, columns: c })) };
}

// ---------------------------------------------------------------- Jev columns

// A Jev column as the taxonomy tagging asks with (its id the column's: two columns may share a taxonomy). Relevance:
// a one-label taxonomy of the several kind, the topic its label and your definition its definition. A column on
// labels of its own: a taxonomy made of them.
export function jevTaxonomy(col, taxonomies) {
  if (col.kind === "jev-relevance") {
    return { id: col.id, name: col.label, prefix: "", kind: "several", question: "Is this paper relevant to this topic? Relevant means what follows.",
      labels: [{ name: String(col.topic || col.label).slice(0, 80), definition: String(col.description || "").slice(0, 1200) }], threshold: 0.5, low: 0.5 };
  }
  // labels of its own (no taxonomy): each with what it means; the column's description, if any, is the question
  const own = (Array.isArray(col.labels) ? col.labels : []).filter((l) => l && String(l.name || "").trim());
  if (!col.taxonomy && own.length) {
    return { id: col.id, name: col.label, prefix: "", kind: col.kind === "jev-one" ? "one" : "several",
      question: String(col.description || "").trim().slice(0, 300) || "Which of these fits the paper?",
      labels: own.slice(0, 30).map((l) => ({ name: String(l.name).trim().slice(0, 80), definition: String(l.definition || "").slice(0, 1200) })), threshold: THRESHOLD, low: LOW };
  }
  const t = (taxonomies || []).find((x) => x.id === col.taxonomy);
  if (!t) throw new Error(`its taxonomy (${col.taxonomy}) isn't there any more`);
  if ((t.kind === "one") !== (col.kind === "jev-one")) throw new Error(`its taxonomy (${t.name}) is of the other kind now`);
  return Object.assign({}, t, { id: col.id, threshold: t.threshold || THRESHOLD, low: t.low == null ? LOW : t.low });
}

const r3 = (x) => Math.round((Number(x) || 0) * 1000) / 1000;

// A Jev column's cell from the probabilities: several labels (those from the threshold, the rest from `low`
// suggested), the best fit (its probability; "not stated" when nothing is sure enough), relevance (0 to 100).
export function jevCell(col, t, probs) {
  const p = probs || {};
  if (col.kind === "jev-relevance") {
    const yes = r3(p[t.labels[0].name]);
    return { v: Math.round(yes * 100), p: yes };
  }
  const d = decide(t, p);
  const all = {};
  for (const l of t.labels) all[l.name] = r3(p[l.name]);
  if (col.kind === "jev-several") return { v: d.tagged.map((x) => x.label), probs: all, suggested: d.suggested.map((x) => x.label) };
  const top = d.tagged[0];
  const best = t.labels.map((l) => ({ label: l.name, p: all[l.name] })).sort((a, b) => b.p - a.p)[0];
  return { v: top ? top.label : NOT_STATED, p: top ? top.p : best ? best.p : 0, probs: all, suggested: d.suggested.map((x) => x.label) };
}

// ---------------------------------------------------------------- AI prompt columns

export const CELL_SYSTEM = [
  "You fill the cells of a literature review table: for one academic paper, you answer each question you are given, from the paper itself.",
  "When the paper doesn't say, answer \"not stated\" (for a number: null) rather than guessing.",
  "Quotes are copied word for word from the paper, never paraphrased.",
  "Answer with one JSON object and nothing else.",
].join("\n");

function shapeLine(c) {
  if (c.shape === "list") return `Answer: a list of at most ${c.length || 5} short items (a JSON array of strings).`;
  if (c.shape === "number") return "Answer: a number (a JSON number), or null when the paper doesn't say.";
  if (c.shape === "choice") return `Answer: exactly one of ${(c.options || []).map((o) => JSON.stringify(o)).join(", ")}, or "not stated".`;
  return `Answer: text of at most ${c.length || 60} words.`;
}

// The request for a paper's prompt columns (those sharing a model and what they read): the paper once, then each
// question, then the JSON to answer with, keyed by column.
export function promptMessage(cols, text) {
  const lines = ["<paper>", String(text || ""), "</paper>", "", "Answer each question below about this paper.", ""];
  for (const c of cols) {
    lines.push(`## ${c.id}: ${c.label}`, String(c.description || "").trim(), shapeLine(c));
    if (c.evidence) lines.push("Evidence: up to 3 quotes from the paper that support the answer, each with its page (\"p. 12\"; \"\" when the text has no page marks).");
    lines.push("");
  }
  const shape = (c) => `{"answer": …${c.evidence ? ', "evidence": [{"quote": "…", "page": "…"}]' : ""}}`;
  lines.push("Reply with JSON only: {" + cols.map((c) => `"${c.id}": ${shape(c)}`).join(", ") + "}");
  return lines.join("\n");
}

// The model's answer → { <column id>: { v, evidence? } | { error } }; a column missing from it, or whose part
// doesn't fit its shape, has an error (asked again on its own). Throws when the answer has no JSON object.
export function parseAnswers(text, cols, paperText) {
  const s = String(text || "");
  const start = s.indexOf("{"), end = s.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("the model's answer has no JSON");
  let j;
  try {
    j = JSON.parse(s.slice(start, end + 1));
  } catch (e) {
    throw new Error("the model's answer isn't valid JSON: " + e.message);
  }
  const norm = normalize(paperText);
  const out = {};
  for (const c of cols) {
    const part = j && Object.prototype.hasOwnProperty.call(j, c.id) ? j[c.id] : undefined;
    if (part === undefined) { out[c.id] = { error: "the answer left this column out" }; continue; }
    const answer = part && typeof part === "object" && !Array.isArray(part) ? part.answer : part;
    try {
      const cell = { v: shapeValue(c, answer) };
      if (c.evidence) cell.evidence = evidenceOf(part && part.evidence, norm);
      out[c.id] = cell;
    } catch (e) {
      out[c.id] = { error: e.message };
    }
  }
  return out;
}

const said = (x) => /^\s*(not stated|n\/?a|none|unknown|not reported)\s*\.?\s*$/i.test(String(x));

// An answer in its column's shape: text, a list, a number or one of the choices ("not stated" when the paper
// doesn't say). Throws when it can't be.
export function shapeValue(c, answer) {
  if (answer === undefined) throw new Error("no answer");
  if (c.shape === "number") {
    if (answer === null || said(answer)) return NOT_STATED;
    const n = typeof answer === "number" ? answer : parseFloat(String(answer).replace(/,/g, ""));
    if (!isFinite(n)) throw new Error("the answer isn't a number");
    return n;
  }
  if (c.shape === "list") {
    const list = Array.isArray(answer) ? answer : answer === null ? [] : String(answer).split(/\n|;\s*/);
    return list.map((x) => String(x == null ? "" : x).replace(/^\s*[-*•]\s*/, "").trim().slice(0, 80)).filter((x) => x && !said(x)).slice(0, c.length || 5);
  }
  if (c.shape === "choice") {
    if (answer === null || said(answer)) return NOT_STATED;
    const a = String(answer).trim().toLowerCase();
    const hit = (c.options || []).find((o) => o.toLowerCase() === a);
    if (!hit) throw new Error("the answer isn't one of the choices");
    return hit;
  }
  if (answer === null) return NOT_STATED;
  if (typeof answer === "object") throw new Error("the answer isn't text");
  return String(answer).trim().slice(0, 20000) || NOT_STATED;
}

// The quotes, each looked up word for word in the paper's text (normalized).
export function evidenceOf(list, normalizedText) {
  return (Array.isArray(list) ? list : []).filter((e) => e && typeof e.quote === "string" && e.quote.trim()).slice(0, 6).map((e) => ({
    quote: e.quote.trim().slice(0, 1500), page: String(e.page == null ? "" : e.page).replace(/^p(p)?\.\s*/i, "").slice(0, 20), found: quoteFound(e.quote, normalizedText),
  }));
}

// ---------------------------------------------------------------- the cells file

export function cellsPath(reviewsDir, columnId) {
  if (!COLUMN.test(String(columnId))) throw new Error("not a column id: " + columnId);
  return join(reviewsDir, "cells", columnId + ".cells.json");
}

// One cell set in its column's file, read again just before (the app may have written another meanwhile), its
// papers in order (as ReviewCore.cellsText writes it). A file that is there but isn't JSON isn't written over.
export function writeCell(path, paper, record) {
  let cells = {};
  let text = null;
  try { text = readFileSync(path, "utf8"); } catch { /* none yet */ }
  if (text !== null && text.trim()) {
    let j;
    try { j = JSON.parse(text); } catch { throw new Error(path + " isn't valid: not changed, so what it holds isn't lost"); }
    cells = j && typeof j.cells === "object" && !Array.isArray(j.cells) ? j.cells : {};
  }
  cells[paper] = record;
  const sorted = {};
  for (const k of Object.keys(cells).sort()) if (k !== "__proto__") sorted[k] = cells[k];
  writeAtomic(path, JSON.stringify({ cells: sorted }, null, 2) + "\n");
}

export function readCell(path, paper) {
  try {
    const j = JSON.parse(readFileSync(path, "utf8"));
    return j && j.cells && typeof j.cells[paper] === "object" ? j.cells[paper] : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- the run

// The run, paper by paper. deps: {
//   paper(id) → { title, abstract, extracted (the note's text, or ""), full() → { text, source } } (the bridge),
//   classify(taxonomies, text) → { probs, by, costUsd } (Jev, else the prompts model),
//   ask({ model, system, message }) → { text, spec, costUsd },
//   taxonomies, previous(column, paper) → its record or null, write(column, paper, record),
//   progress({ done, papers, cells, failed, costUsd, model }), now() }
// → { papers, done, cells, failed, error (the first), stopped (a problem every paper would meet: the rest left), costUsd, models }
export async function runReview(job, deps) {
  const byId = new Map(job.columns.map((c) => [c.id, c]));
  const now = deps.now || (() => new Date().toISOString());
  const stats = { papers: job.papers.length, done: 0, cells: 0, failed: 0, costUsd: 0, stopped: "", error: "", models: [] };
  const used = (m) => { if (m && !stats.models.includes(m)) stats.models.push(m); };
  const cost = (x) => { if (typeof x === "number") stats.costUsd += x; };
  for (const p of job.papers) {
    if (stats.stopped) break;
    const cols = p.columns.map((id) => byId.get(id)).filter(Boolean);
    const put = (c, rec) => {
      deps.write(c.id, p.id, Object.assign({}, rec, { updated: now() }));
      if (rec.error) stats.failed++; else stats.cells++;
    };
    // a failed cell keeps what it held (yours too), with why
    const fail = (c, message) => {
      const prev = deps.previous(c.id, p.id);
      put(c, Object.assign({ v: "", by: "ai" }, prev || {}, { error: String(message).slice(0, 500) }));
      stats.error = stats.error || String(message);
      if (fatalKind(message)) stats.stopped = message;
    };
    let paper;
    try {
      paper = await deps.paper(p.id);
    } catch (e) {
      cols.forEach((c) => fail(c, e.message));
      stats.done++;
      deps.progress && deps.progress(stats);
      continue;
    }
    // the Jev kinds: one request for every Jev cell of the paper
    const jev = cols.filter((c) => c.kind !== "prompt");
    if (jev.length) {
      const ts = [];
      for (const c of jev) {
        try { ts.push([c, jevTaxonomy(c, deps.taxonomies)]); } catch (e) { fail(c, e.message); }
      }
      if (ts.length) {
        const input = { text: paper.extracted ? "note" : "abstract" };
        try {
          const r = await deps.classify(ts.map((x) => x[1]), classificationText({ title: paper.title, abstract: paper.abstract, text: paper.extracted }));
          cost(r.costUsd);
          used(r.by);
          for (const [c, t] of ts) put(c, Object.assign({ by: "ai", model: r.by, hash: c.hash, input }, jevCell(c, t, r.probs[c.id])));
        } catch (e) {
          ts.forEach(([c]) => fail(c, e.message));
        }
      }
    }
    // the prompt kind: one request per model and what it reads; a column whose part came back wrong, asked alone
    const groups = new Map();
    for (const c of cols.filter((x) => x.kind === "prompt" && !stats.stopped)) {
      const k = (c.model || "default") + "|" + (c.reads === "full" ? "full" : "abstract");
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    let full = null;
    for (const [, group] of groups) {
      if (stats.stopped) { group.forEach((c) => fail(c, "stopped: " + stats.stopped)); continue; }
      const head = classificationText({ title: paper.title, abstract: paper.abstract });
      let text = head, input = { text: "abstract" };
      if (group[0].reads === "full") {
        try {
          full = full || (await paper.full());
        } catch (e) {
          full = { text: "", source: "none" };
        }
        if (full.text) { text = `Title: ${String(paper.title || "").trim()}\n\n${full.text}`; input = { text: full.source }; }
      }
      const askFor = async (list) => {
        const a = await deps.ask({ model: list[0].model || "default", system: CELL_SYSTEM, message: promptMessage(list, text) });
        cost(a.costUsd);
        used(a.spec);
        return { parts: parseAnswers(a.text, list, text), spec: a.spec };
      };
      try {
        let r;
        try {
          r = await askFor(group);
        } catch (e) {
          if (group.length === 1 || /no JSON|valid JSON/.test(e.message) === false) throw e;
          r = { parts: {}, spec: "" }; // the whole answer malformed: each asked alone
          group.forEach((c) => (r.parts[c.id] = { error: e.message }));
        }
        for (const c of group) {
          let part = r.parts[c.id], spec = r.spec;
          if (part.error && group.length > 1) {
            try {
              const again = await askFor([c]);
              part = again.parts[c.id];
              spec = again.spec;
            } catch (e) {
              part = { error: e.message };
            }
          }
          if (part.error) fail(c, part.error);
          else put(c, Object.assign({ by: "ai", model: spec, hash: c.hash, input }, part));
        }
      } catch (e) {
        group.forEach((c) => fail(c, e.message));
      }
    }
    stats.done++;
    deps.progress && deps.progress(stats);
  }
  stats.costUsd = Math.round(stats.costUsd * 1e6) / 1e6;
  return stats;
}

// ---------------------------------------------------------------- Write it with AI (review-draft)

// + Column › An AI column › Write it with AI: what you describe becomes the column (a prompt column's question, what
// it reads, its answer's shape; a relevance column's topic and what relevant means), for you to change before Add.
export const DRAFT_SYSTEM = [
  "You write one column of a literature review table, from what a researcher says they want to know about each paper.",
  "An AI model will later answer the column's question for every paper on its own, from that paper's text, so the question must stand alone: specific, answerable from a paper, and saying what to do when the paper doesn't say.",
  "Answer with one JSON object and nothing else.",
].join("\n");

const DRAFT_SHAPES = {
  prompt: '{"label": "a short column name (1-4 words)", "prompt": "the question asked of each paper, one to three sentences", "reads": "abstract" or "full" (the full text when the answer is usually in the body: methods, samples, results, measures), "shape": "text" | "list" | "number" | "choice", "length": words for text (10-150) or items for a list (2-10), "options": ["…"] (only for choice: 2-8 short choices), "evidence": true when quotes from the paper would help check the answer, "notes": "one sentence on your choices"}',
  "jev-relevance": '{"label": "a short column name (1-4 words)", "topic": "the topic, a few words", "definition": "what relevant means: what a paper must do to count, and what doesn\'t count, one or two sentences", "notes": "one sentence on your choices"}',
};

// The request for the model: what the researcher asked, the column as it is in the form (to change, not start
// over), and the JSON to answer with.
export function draftMessage(kind, request, current) {
  const k = kind === "jev-relevance" ? "jev-relevance" : "prompt";
  const cur = current && typeof current === "object" ? current : {};
  const has = k === "prompt" ? String(cur.description || "").trim() : String(cur.topic || cur.description || "").trim();
  const now = !has ? "" : "\n\nThe column as it is now (change it as asked, keep what isn't asked about):\n" + JSON.stringify(k === "prompt"
    ? { label: cur.label || "", prompt: cur.description || "", reads: cur.reads || "", shape: cur.shape || "", length: cur.length || "", options: cur.options || "", evidence: !!cur.evidence }
    : { label: cur.label || "", topic: cur.topic || "", definition: cur.description || "" });
  const what = k === "prompt" ? "an AI prompt column: a question asked of each paper" : "a relevance column: each paper scored 0 to 100 for how relevant it is to a topic";
  return `Write ${what}.\n\nWhat the researcher wants:\n${String(request || "").trim()}${now}\n\nAnswer with this JSON:\n${DRAFT_SHAPES[k]}`;
}

// The model's answer → { column: { label, prompt, reads, shape, length, options, evidence } or { label, topic,
// definition }, notes }, or { error }.
export function parseColumnDraft(text, kind) {
  const s = String(text || "");
  const start = s.indexOf("{"), end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return { error: "the model's answer has no JSON" };
  let j;
  try { j = JSON.parse(s.slice(start, end + 1)); } catch (e) { return { error: "the model's answer isn't valid JSON: " + e.message }; }
  if (!j || typeof j !== "object" || Array.isArray(j)) return { error: "the model's answer isn't a column" };
  const str = (v, n) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v)).trim().slice(0, n);
  const label = str(j.label, 80);
  const notes = str(j.notes, 400);
  if (kind === "jev-relevance") {
    const topic = str(j.topic, 200), definition = str(j.definition, 2000);
    if (!topic) return { error: "the model's answer has no topic" };
    return { column: { label: label || topic.slice(0, 40), topic, definition }, notes };
  }
  const prompt = str(j.prompt, 4000);
  if (!prompt) return { error: "the model's answer has no question" };
  const shape = ["text", "list", "number", "choice"].includes(j.shape) ? j.shape : "text";
  const options = shape === "choice" ? (Array.isArray(j.options) ? j.options : String(j.options || "").split(",")).map((o) => str(o, 60)).filter((o, i, all) => o && all.indexOf(o) === i).slice(0, 20) : [];
  const n = Math.round(Number(j.length));
  const length = shape === "text" ? (n >= 5 && n <= 400 ? n : 60) : shape === "list" ? (n >= 1 && n <= 30 ? n : 5) : "";
  return { column: { label: label || "AI column", prompt, reads: j.reads === "full" ? "full" : "abstract", shape: shape === "choice" && options.length < 2 ? "text" : shape, length: shape === "choice" && options.length < 2 ? 60 : length, options, evidence: j.evidence === true }, notes };
}
