#!/usr/bin/env node
// What the usage log (ZoteroLauncher/Files/UsageLog.swift) counted: every machine's file in a usage/ folder added up
// over the last days, each name's total, by kind (key, row, view, result, paper, review, window, menu, cmd…), most
// used first. Reads the files only; prints counts of the app's own names, nothing about the library.
//
//   node macos/scripts/usage-report.mjs <the usage folder> [--days 30] [--json]
//   (the folder: <sync folder>/shared/usage, else ~/.local/state/oma-zotero/usage)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The machines' files: [{ machine, days: { "2026-10-29": { name: n } } }]; a file that isn't one is left out.
export function readFolder(dir) {
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith(".json")); } catch { return []; }
  const out = [];
  for (const n of names) {
    try {
      const f = JSON.parse(fs.readFileSync(path.join(dir, n), "utf8"));
      if (f && typeof f.days === "object" && f.days) out.push({ machine: String(f.machine || n.replace(/\.json$/, "")), days: f.days });
    } catch { /* not JSON: skipped */ }
  }
  return out;
}

// The files added up from `since` ("YYYY-MM-DD") on. → { since, activeDays, machines, total, byKind: { kind: [[name, n]] } }
export function report(files, since) {
  const totals = new Map();
  const active = new Set();
  for (const f of files) {
    for (const [day, counts] of Object.entries(f.days)) {
      if (day < since || !counts || typeof counts !== "object") continue;
      for (const [name, n] of Object.entries(counts)) {
        if (!Number.isInteger(n) || n <= 0) continue;
        active.add(day);
        totals.set(name, (totals.get(name) || 0) + n);
      }
    }
  }
  const byKind = {};
  for (const [name, n] of [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    const kind = name.slice(0, name.indexOf(":")) || "other";
    (byKind[kind] ||= []).push([name.slice(name.indexOf(":") + 1), n]);
  }
  return { since, activeDays: active.size, machines: files.map((f) => f.machine), total: [...totals.values()].reduce((a, b) => a + b, 0), byKind };
}

export function sinceDays(days, now = new Date()) {
  const d = new Date(now.getTime() - (days - 1) * 86400000);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function text(r) {
  const lines = [`Since ${r.since}: ${r.total} uses on ${r.activeDays} days (${r.machines.join(", ") || "no machine"})`];
  const kinds = Object.entries(r.byKind).sort((a, b) => b[1].reduce((s, x) => s + x[1], 0) - a[1].reduce((s, x) => s + x[1], 0));
  for (const [kind, list] of kinds) {
    lines.push("", `${kind} (${list.reduce((s, x) => s + x[1], 0)})`);
    for (const [name, n] of list) lines.push(`  ${String(n).padStart(5)}  ${name}`);
  }
  return lines.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--"));
  if (!dir) {
    console.error("usage: usage-report.mjs <the usage folder> [--days 30] [--json]");
    process.exit(2);
  }
  const i = args.indexOf("--days");
  const days = i >= 0 ? Math.max(1, parseInt(args[i + 1], 10) || 30) : 30;
  const r = report(readFolder(dir), sinceDays(days));
  console.log(args.includes("--json") ? JSON.stringify(r, null, 2) : text(r));
}
