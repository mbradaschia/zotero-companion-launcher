// scripts/usage-report.mjs: the usage log's files (Files/UsageLog.swift) added up across machines and days.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("every machine's counts add up from the first day asked, by kind, most used first", async () => {
  const { readFolder, report } = await import("../../scripts/usage-report.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "usage-"));
  fs.writeFileSync(path.join(dir, "mini.json"), JSON.stringify({ version: 1, machine: "mini", days: { "2026-10-01": { "key:i": 5 }, "2026-10-28": { "key:i": 2, "row:open": 1 } } }));
  fs.writeFileSync(path.join(dir, "book.json"), JSON.stringify({ version: 1, machine: "book", days: { "2026-10-29": { "key:i": 1, "key:r": 3, "row:open": "x" } } }));
  fs.writeFileSync(path.join(dir, "broken.json"), "{");
  fs.writeFileSync(path.join(dir, "notes.txt"), "not a usage file");
  const r = report(readFolder(dir), "2026-10-20");
  assert.deepEqual(r.machines.sort(), ["book", "mini"]);
  assert.equal(r.activeDays, 2);
  assert.equal(r.total, 7);
  assert.deepEqual(r.byKind, { key: [["r", 3], ["i", 3]].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), row: [["open", 1]] });
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a folder that isn't there reads as no machines", async () => {
  const { readFolder, report } = await import("../../scripts/usage-report.mjs");
  const r = report(readFolder(path.join(os.tmpdir(), "no-such-usage-folder")), "2026-10-01");
  assert.deepEqual(r, { since: "2026-10-01", activeDays: 0, machines: [], total: 0, byKind: {} });
});

test("the first day of the last N days", async () => {
  const { sinceDays } = await import("../../scripts/usage-report.mjs");
  assert.equal(sinceDays(1, new Date(2026, 9, 29, 12)), "2026-10-29");
  assert.equal(sinceDays(30, new Date(2026, 9, 29, 12)), "2026-09-30");
});
