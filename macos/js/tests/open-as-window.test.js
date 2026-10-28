// Settings › General › Open as a window (Core/GlueSettings.js): this Mac's own switch, first on the page, off by default.
const test = require("node:test");
const assert = require("node:assert/strict");
const Glue = require("../../ZoteroLauncher/Core/Glue.js");

const s = Glue.settings(null, {}).settings;

test("General starts with the switch, as this Mac has it", () => {
  const off = Glue.settingsPage("general", s, {}, { openAsWindow: false })[0];
  assert.equal(off.section, "The launcher");
  assert.equal(off.rowId, "set-toggle");
  assert.equal(off.value, "mac.openAsWindow");
  assert.equal(off.checked, false);
  assert.match(off.detail, /^Off · the hotkey opens the overlay/);
  const on = Glue.settingsPage("general", s, {}, { openAsWindow: true })[0];
  assert.equal(on.checked, true);
  assert.match(on.detail, /^On · the hotkey opens a regular window/);
});

test("without this Mac's value, no row (the shared rows as before)", () => {
  const rows = Glue.settingsPage("general", s, {}, {});
  assert.equal(rows.find((r) => r.value === "mac.openAsWindow"), undefined);
});

// Settings › General › In the Dock and ⌘Tab: this Mac's too, after Open as a window.
test("the Dock switch follows, as this Mac has it", () => {
  const rows = Glue.settingsPage("general", s, {}, { openAsWindow: false, dock: true });
  assert.deepEqual(rows.slice(0, 2).map((r) => r.value), ["mac.openAsWindow", "mac.dock"]);
  const on = rows[1];
  assert.equal(on.section, "The launcher");
  assert.equal(on.rowId, "set-toggle");
  assert.equal(on.checked, true);
  assert.match(on.detail, /^On · the app has a Dock icon/);
  const off = Glue.settingsPage("general", s, {}, { dock: false, machineOnly: true }).find((r) => r.value === "mac.dock");
  assert.equal(off.checked, false);
  assert.equal(off.badge, "this machine");
  assert.match(off.detail, /^Off · only the menu bar's icon/);
  assert.equal(Glue.settingsPage("general", s, {}, {}).find((r) => r.value === "mac.dock"), undefined);
});

test("the search finds both switches when this Mac's values are given", () => {
  const index = Glue.settingsIndex(s, {}, [], { openAsWindow: true, dock: true });
  assert.ok(index.some((r) => r.value === "mac.dock" && r.page === "general"));
  assert.ok(index.some((r) => r.value === "mac.openAsWindow"));
  assert.ok(!Glue.settingsIndex(s, {}, [], {}).some((r) => r.value === "mac.dock"));
});
