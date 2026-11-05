// Every row the shared builders (lib/*.js) make is one the Omarchy launcher knows (docs/omarchy-port/PLAN.md, phase 1,
// step 2): lib/ is shared with the Mac app, so a row added there for the Mac shows on Omarchy too, and Enter on it
// must do something. A row id is known when ZoteroSearch.qml names it; rows that only inform (available: false), rows
// edited in place (field: …) and the few listed below need no handler of their own.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const LIB = path.join(ROOT, "lib");

// Rows Enter has nothing to do on, by design (say why when adding one).
const INFORMS = {
  "key-info": "the keys view: a key and what it does",
  "search-help": "Saved searches with none yet: says how to make one",
  "tax-ai-item": "an AI taxonomy draft's proposed field or label, read before Accept",
};

function rowsOf(file) {
  const out = [];
  fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/rowId: "([a-z0-9-]+)"/g)) out.push({ id: m[1], line, where: `${path.basename(file)}:${i + 1}` });
  });
  return out;
}

test("every row id the shared builders make is handled, edited in place, informative or listed", () => {
  const qml = fs.readFileSync(path.join(ROOT, "ZoteroSearch.qml"), "utf8");
  const rows = fs.readdirSync(LIB).filter((f) => f.endsWith(".js")).flatMap((f) => rowsOf(path.join(LIB, f)));
  assert.ok(rows.length > 100, "the builders' rows were read");
  const unknown = rows.filter((r) => !qml.includes(`"${r.id}"`) && !/available: false/.test(r.line) && !/\bfield: "/.test(r.line) && !INFORMS[r.id]);
  assert.deepEqual(unknown.map((r) => `${r.id} (${r.where})`), [], "rows the Omarchy launcher doesn't know: handle them in ZoteroSearch.qml, or list why not");
});

test("the rows listed as informing are still made (a stale entry would hide a new row of that id)", () => {
  const ids = new Set(fs.readdirSync(LIB).filter((f) => f.endsWith(".js")).flatMap((f) => rowsOf(path.join(LIB, f))).map((r) => r.id));
  for (const id of Object.keys(INFORMS)) assert.ok(ids.has(id), id);
});
