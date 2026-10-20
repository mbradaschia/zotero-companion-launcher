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
