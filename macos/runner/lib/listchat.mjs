// A chat about a list of papers: a review table's, as it shows them (the docked chat's List). What it reads: each
// paper's citation and reference (Zotero's, APA 7), where and when it was published, its abstract, and the table's
// columns as you see them (your own and the AI's answers). Not the full texts: a list of 200 would be millions of
// tokens; "Ask each paper" (the table) reads them, one column run, and the chat is given the answers. The grounding is
// made once, at the chat's first question, and kept in the chat's file: later questions read the same list (a new chat
// reads the table again). Pure (node-tested).
import { join } from "node:path";
import { paths } from "./paths.mjs";

export const MAX_LIST = 200;
export const LIST_SHARE = 0.6; // the most of the window the list may take (as a paper's text)
const CELL_CHARS = 1200; // a cell, at most, as the table sent it
const CELLS_PER_PAPER = 24;

export const LIST_CHAT_SYSTEM = `You are a research assistant helping the user work across a list of academic papers: a review table they keep for a literature review. The first message gives you the list: for each paper its number, its APA 7 in-text citation and reference (formatted by Zotero, exact), where and when it was published, its abstract, and the table's columns for it (the user's own notes and labels, and answers an AI read from the paper's full text). You don't have the papers' full texts.

Answer from the list only. Cite every paper you draw on with its in-text citation exactly as given, for example (Sirmon et al., 2011); several at once as (Hitt, 2001; Sirmon et al., 2011). Say how many papers support a point when it matters, and name the ones that disagree. When the list can't answer (a question about methods or results that the abstracts and columns don't cover), say so, and suggest asking each paper (the table's Ask each paper reads every full text). Where the rules below speak of the paper, read: the papers of the list, and their references as given.`;

// A list chat's folder: chats/review-<review id> (beside the papers' <library>-<key>).
export function listChatsDir(review, env = process.env) {
  if (!/^r-[a-z0-9]{10}$/.test(String(review))) throw new Error("bad review id");
  return join(paths(env).chats, "review-" + review);
}

const estimateTokens = (t) => Math.ceil(String(t || "").length / 3.6); // (context.mjs's, which imports chat.mjs, which imports this)
const str = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);

// What the table sends (stdin): { question, list: { name, papers: [{ id "lib:KEY", title, cite, cells: [{ label, value }] }] } }.
// → { question, display, list: { name, papers } } (the papers checked, at most MAX_LIST, each once)
export function parseListInput(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const question = String(o.question || "").trim();
  if (!question) throw new Error("the question comes on stdin");
  const l = o.list && typeof o.list === "object" ? o.list : {};
  const seen = new Set();
  const papers = [];
  for (const p of Array.isArray(l.papers) ? l.papers : []) {
    if (!p || !/^\d+:[A-Z0-9]{8}$/.test(String(p.id)) || seen.has(p.id)) continue;
    seen.add(p.id);
    const cells = (Array.isArray(p.cells) ? p.cells : []).slice(0, CELLS_PER_PAPER)
      .map((c) => ({ label: str(c && c.label, 80), value: String(c && c.value != null ? c.value : "").trim().slice(0, CELL_CHARS) }))
      .filter((c) => c.label && c.value);
    papers.push({ id: String(p.id), title: str(p.title, 400), cite: str(p.cite, 200), cells });
    if (papers.length >= MAX_LIST) break;
  }
  return { question, display: str(o.display, 400), list: { name: str(l.name, 200) || "the list", papers } };
}

// A paper of the list as the model reads it. info: the bridge's paper (title, authors, year, publication, abstract)
// and Zotero's citation and reference, when it had them. opts: { abstract: chars (0: left out), cell: chars }
export function paperEntry(n, p, info = {}, opts = {}) {
  const abstractMax = opts.abstract == null ? 2500 : opts.abstract;
  const cellMax = opts.cell == null ? CELL_CHARS : opts.cell;
  const cite = info.citation || p.cite || "(no citation)";
  const lines = [`## [${n}] ${cite}`, `- Title: ${info.title || p.title || "(untitled)"}`];
  if (info.reference) lines.push(`- Reference: ${info.reference}`);
  const where = [info.publication, info.year].filter(Boolean).join(", ");
  if (where) lines.push(`- Published: ${where}`);
  const abs = String(info.abstract || "").replace(/\s+/g, " ").trim();
  if (abs && abstractMax > 0) lines.push(`- Abstract: ${abs.length > abstractMax ? abs.slice(0, abstractMax).trimEnd() + " […]" : abs}`);
  for (const c of p.cells || []) {
    const v = c.value.length > cellMax ? c.value.slice(0, cellMax).trimEnd() + " […]" : c.value;
    lines.push(v.includes("\n") ? `- ${c.label}:\n${v.split("\n").map((l) => "  " + l).join("\n")}` : `- ${c.label}: ${v}`);
  }
  return lines.join("\n");
}

// The list's text within `share` of the window: whole, else the abstracts shortened, then left out, then the cells
// shortened, then the papers at the end left out (each step said in the label). infos: by paper id.
// → { text, label, cut: { abstracts, cells, papers } }
export function fitList(list, infos, window, share = LIST_SHARE) {
  const budget = Math.max(2000, Math.floor(window * share) - 2500);
  const steps = [
    { abstract: 2500, cell: CELL_CHARS, say: "" },
    { abstract: 800, cell: CELL_CHARS, say: "abstracts shortened" },
    { abstract: 0, cell: CELL_CHARS, say: "abstracts left out" },
    { abstract: 0, cell: 300, say: "abstracts left out, the columns' text shortened" },
  ];
  const n = list.papers.length;
  const body = (opts, count) => list.papers.slice(0, count).map((p, i) => paperEntry(i + 1, p, infos[p.id] || {}, opts)).join("\n\n");
  let chosen = steps[steps.length - 1], text = "", count = n;
  for (const s of steps) {
    text = body(s, n);
    chosen = s;
    if (estimateTokens(text) <= budget) break;
  }
  while (estimateTokens(text) > budget && count > 1) {
    count = Math.max(1, Math.floor(count * 0.9));
    text = body(chosen, count);
  }
  const what = `${n} ${n === 1 ? "paper" : "papers"}: citations, abstracts and the table's columns`;
  const cuts = [chosen.say, count < n ? `only the first ${count} fit the model` : ""].filter(Boolean).join("; ");
  return { text, label: cuts ? `${what} (${cuts})` : what, cut: { abstracts: chosen.abstract < 2500, cells: chosen.cell < CELL_CHARS, papers: n - count } };
}

// The first message of a list chat: the list, then the question.
export function listGroundingMessage(ctx, question) {
  const l = ctx.list || {};
  return [`# The list: ${l.name || "papers"} (${l.papers || 0} ${l.papers === 1 ? "paper" : "papers"})`, "", "<papers>", l.text || "", "</papers>", "", "# The question", "", question].join("\n");
}

// A list chat's context as the chat code reads one (chat.mjs, context.mjs): { list, title, text, grounding }.
// `text` is the list (what quotes are checked against).
export function listContext(saved) {
  const l = saved || {};
  return { list: l, title: l.name || "the list", text: l.text || "", grounding: { source: "list", label: l.label || "" }, annotations: [], notes: [] };
}
