// What the companion reads and writes, in one place, each piece swappable (the tests give a fake bridge, a fake
// runner, a clock): the Mac app's own JavaScript, read in place (Glue.js requires its modules relative to itself, so
// the rules are the app's, not a copy), the runner's paths and bridge client, the files in the sync folder.
import { createRequire } from "node:module";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { paths as runnerPaths, combinedSettings } from "../../runner/lib/paths.mjs";
import { bridgeClient, handshakePath } from "../../runner/lib/bridge.mjs";
import { writeAtomic } from "../../runner/lib/atomic.mjs";
import { makeRunner } from "./runner.mjs";
import { loadSettings, saveSettings } from "./auth.mjs";

const require = createRequire(import.meta.url);
export const Glue = require("../../ZoteroLauncher/Core/Glue.js");
export const Client = require("../../js/lib/Client.js");
export const Views = require("../../js/lib/Views.js");
export const Todos = require("../../js/lib/Todos.js");
export const ReviewCore = require("../../ZoteroLauncher/Review/ReviewCore.js");

export class Refused extends Error {
  constructor(message, status = 409, code = "refused") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

const blank = (t) => !String(t || "").trim();

export function makeContext({ env = process.env, bridge = null, runner = null, now = () => Date.now() } = {}) {
  const ctx = {
    env,
    now,
    runner: runner || makeRunner(env),
    // A new client each time: Zotero restarted writes a new handshake.
    bridge: bridge || (() => bridgeClient({ path: handshakePath(env), timeoutMs: 15000 })),
    paths: () => runnerPaths(env),
    settings: () => Client.normalizeSettings(combinedSettings(env)).settings,
    rows: new Map(), // paper id → its last search row (what the bridge's /item doesn't say: dates, counts)
  };

  // ---- the companion's own settings (<config>/companion.json: the key, the columns shown)
  ctx.companionFile = () => join(ctx.paths().configDir, "companion.json");
  ctx.companion = () => loadSettings(ctx.companionFile());
  ctx.saveCompanion = (change) => {
    const s = ctx.companion();
    const next = Object.assign({}, s, change);
    saveSettings(ctx.companionFile(), next);
    return next;
  };

  // A write to the sync folder while it's away would start a second copy of your data: refused, as the app refuses.
  ctx.writable = () => {
    const p = ctx.paths();
    if (p.readOnly) throw new Refused("The sync folder isn't there right now, so nothing was saved: is the drive connected?", 503, "sync-unavailable");
    return p;
  };

  // ---- tasks (todos.json), as TodosFile.swift: read now, changed through Glue, stamped (Merge's tombstones),
  // written atomically; refused over a file that is there but isn't tasks (a sync conflict, a half-written copy).
  ctx.todos = () => {
    const text = readText(ctx.paths().todos) || "";
    return Glue.parseTodos(text);
  };
  ctx.updateTodos = (change) => {
    const p = ctx.writable();
    const before = readText(p.todos) || "";
    if (!blank(before)) {
      let ok = false;
      try { ok = Array.isArray(JSON.parse(before).todos); } catch { /* not JSON */ }
      if (!ok) throw new Refused("todos.json isn't a tasks file right now (a sync conflict?): nothing was saved", 409, "damaged");
    }
    const list = Glue.parseTodos(before);
    const r = change(list);
    const text = Glue.stamp("todos.json", before, r.text, ctx.now());
    writeAtomic(p.todos, text, ctx.env);
    return { before: list, after: Glue.parseTodos(text), answer: r };
  };

  // ---- the review tables' columns and cells (reviews/columns/<id>.md, reviews/cells/<id>.cells.json)
  const COLUMN = /^c-[a-z0-9]{10}$/;
  ctx.columnDefs = () => {
    const dir = join(ctx.paths().reviews, "columns");
    const out = {};
    let names = [];
    try { names = readdirSync(dir); } catch { return out; }
    for (const name of names) {
      if (!name.endsWith(".md")) continue;
      const id = name.slice(0, -3);
      if (!COLUMN.test(id)) continue;
      const def = Glue.reviewColumnParse(readText(join(dir, name)) || "", id);
      if (def) out[id] = def;
    }
    return out;
  };
  ctx.cellsFile = (column) => {
    if (!COLUMN.test(column)) throw new Refused("not a column", 400, "bad-column");
    return join(ctx.paths().reviews, "cells", column + ".cells.json");
  };
  ctx.cells = (ids) => {
    const out = {};
    for (const id of ids) {
      if (!COLUMN.test(id)) continue;
      const text = readText(ctx.cellsFile(id));
      if (text != null) out[id] = Glue.reviewCells(text);
    }
    return out;
  };
  ctx.setCell = (column, paper, value) => {
    const p = ctx.writable();
    const file = ctx.cellsFile(column);
    const old = readText(file) || "";
    if (!blank(old)) {
      try { JSON.parse(old); } catch { throw new Refused("That column's values file isn't readable right now (a sync conflict?): nothing was saved", 409, "damaged"); }
    }
    const text = Glue.reviewSetCell(old, paper, value, new Date(ctx.now()).toISOString(), p.machine || "");
    if (typeof text !== "string") throw new Refused("not a paper", 400, "bad-paper");
    writeAtomic(file, text, ctx.env);
  };

  ctx.exists = existsSync;
  return ctx;
}
