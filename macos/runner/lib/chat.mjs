// Chat with a paper: the saved sessions (one JSON file each, per paper), the chat's
// instructions, and the first message that grounds a session in the paper. The model's
// own conversation state is the provider's thread (a subscription's session, resumed on every
// turn) or, for the others, the chat itself, sent whole; the file keeps what the chat window shows. Pure but for the store's file I/O (node-tested).
import { readFileSync, readdirSync, existsSync, unlinkSync } from "node:fs";
import { paths } from "./paths.mjs";
import { writeAtomic, ensureDir } from "./atomic.mjs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { listGroundingMessage } from "./listchat.mjs";

export function stateDir(env = process.env) {
  return paths(env).runnerState;
}

export function chatsDir(key, libraryID, env = process.env) {
  if (!/^[A-Z0-9]{8}$/.test(String(key))) throw new Error("bad item key");
  return join(paths(env).chats, `${Number(libraryID) || 1}-${key}`);
}

export function newSessionId(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "") + "-" + randomBytes(3).toString("hex");
}

export function validSessionId(id) {
  return /^[0-9T-]{19,30}-[0-9a-f]{6}$/.test(String(id || ""));
}

// A session's title: its first question, shortened.
export function titleFor(text, max = 70) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t || "New chat";
}

export function loadSession(dir, id) {
  if (!validSessionId(id)) throw new Error("bad session id");
  const p = join(dir, id + ".json");
  if (!existsSync(p)) throw new Error("no such chat");
  // the file may come from a sync folder: its own id must be its name, or a save would go elsewhere
  const s = JSON.parse(readFileSync(p, "utf8"));
  if (!s || s.id !== id) throw new Error("bad session file: its id isn't its name");
  return s;
}

export function saveSession(dir, session) {
  if (!validSessionId(session && session.id)) throw new Error("bad session id");
  const p = join(dir, session.id + ".json");
  writeAtomic(p, JSON.stringify(session, null, 1));
}

// Forget a chat (its file; the model's side of it ends with it).
export function deleteSession(dir, id) {
  if (!validSessionId(id)) throw new Error("bad session id");
  const p = join(dir, id + ".json");
  if (!existsSync(p)) throw new Error("no such chat");
  unlinkSync(p);
}

// Newest first: [{ id, title, created, updated, turns, model }].
export function listSessions(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && validSessionId(f.slice(0, -5)))
    .map((f) => {
      try {
        const s = JSON.parse(readFileSync(join(dir, f), "utf8"));
        if (!s || s.id !== f.slice(0, -5)) return null; // its id isn't its name: not a chat of ours
        return { id: s.id, title: s.title, created: s.created, updated: s.updated, turns: (s.messages || []).filter((m) => m.role === "user").length, model: s.model || "" };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));
}

// What the assistant is and what it gets; the rules are the user's (Settings › Rules, lib/system.mjs).
export const CHAT_SYSTEM = `You are a research assistant helping the user understand and use one academic paper. The first message gives you the paper: its metadata, its APA 7 reference and in-text citation (formatted by Zotero, exact), the user's highlights and notes, and its text, page by page ("[p. 275]" or "## p. 275" marks where each page starts).`;

// The first message of a session: the paper, then the question (a list chat's: the list).
export function groundingMessage(ctx, question) {
  if (ctx && ctx.list) return listGroundingMessage(ctx, question);
  const lines = ["# The paper", ""];
  lines.push(`- Title: ${ctx.title}`);
  if (ctx.reference) lines.push(`- APA 7 reference: ${ctx.reference}`);
  if (ctx.citation) lines.push(`- APA 7 in-text citation: ${ctx.citation}`);
  lines.push("");
  if (ctx.annotations && ctx.annotations.length) {
    lines.push("# The user's highlights and comments", "");
    for (const a of ctx.annotations) lines.push(`- [p. ${a.pageLabel || "?"}] ${a.text ? `"${a.text}"` : ""}${a.comment ? ` — comment: ${a.comment}` : ""}`);
    lines.push("");
  }
  if (ctx.notes && ctx.notes.length) {
    lines.push("# The user's notes", "");
    for (const n of ctx.notes) lines.push(`## ${n.title || "Untitled note"}`, "", n.markdown.trim(), "");
  }
  if (ctx.grounding && ctx.grounding.source === "meta") {
    // the user chose its metadata (the review table's docked chat, Paper › Metadata): no full text
    const m = ctx.meta || {};
    lines.push("# The paper's metadata", "");
    const where = [m.publication, m.year].filter(Boolean).join(", ");
    if (where) lines.push(`- Published: ${where}`);
    lines.push(`- Abstract: ${String(m.abstract || "").replace(/\s+/g, " ").trim() || "(none in Zotero)"}`, "");
    if (ctx.cells && ctx.cells.length) {
      lines.push("# The review table's columns for it (the user's own, and answers an AI read from its full text)", "");
      for (const c of ctx.cells) lines.push(c.value.includes("\n") ? `- ${c.label}:\n${c.value.split("\n").map((l) => "  " + l).join("\n")}` : `- ${c.label}: ${c.value}`);
      lines.push("");
    }
    lines.push("(You don't have the paper's full text: the user chose to chat from its metadata. Answer from it, and say when a question needs the full text.)");
  } else {
    lines.push(`# The paper's text (${ctx.grounding ? ctx.grounding.label : "not available"})`, "");
    lines.push(ctx.text ? `<paper>\n${ctx.text}\n</paper>` : "(Not available: answer from the metadata, highlights and notes, and say so.)");
  }
  lines.push("", "# The question", "", question);
  return lines.join("\n");
}

// A metadata chat's stdin: { question, cells: [{ label, value }] } (the table's columns for the paper, as shown).
export function parseMetaInput(raw) {
  let o;
  try { o = JSON.parse(String(raw || "")); } catch { throw new Error("the question and the paper's columns come on stdin, as JSON"); }
  o = o && typeof o === "object" ? o : {};
  const cells = (Array.isArray(o.cells) ? o.cells : []).slice(0, 24)
    .map((c) => ({ label: String((c && c.label) || "").replace(/\s+/g, " ").trim().slice(0, 80), value: String(c && c.value != null ? c.value : "").trim().slice(0, 4000) }))
    .filter((c) => c.label && c.value);
  return { question: String(o.question || "").trim(), cells };
}

// When the SDK session is gone (Claude Code cleared it): the grounding again, then the
// conversation so far, then the new question.
export function replayMessage(ctx, messages, question) {
  const history = messages.map((m) => `**${m.role === "user" ? "User" : "You"}:** ${m.text}`).join("\n\n");
  return groundingMessage(ctx, `(Our conversation so far:)\n\n${history}\n\n(Now:) ${question}`);
}
