// Settings › General › Appearance (Core/GlueSettings.js): this Mac's theme and light or dark, each a choice of its own,
// from the app's list of themes.
const test = require("node:test");
const assert = require("node:assert/strict");
const Glue = require("../../ZoteroLauncher/Core/Glue.js");

const s = Glue.settings(null, {}).settings;
const themes = [
  { id: "default", name: "Default", light: "", dark: "", swatch: "#0a84ff" },
  { id: "nord", name: "Nord", light: "Nord Light", dark: "Nord", swatch: "#88c0d0" },
];
const theme = (id, mode) => ({ id: id, mode: mode, themes: themes });

test("General has the theme and light or dark, after the launcher's row", () => {
  const rows = Glue.settingsPage("general", s, {}, { openAsWindow: false, theme: theme("nord", "dark") });
  assert.equal(rows[0].value, "mac.openAsWindow");
  const t = rows[1], m = rows[2];
  assert.deepEqual([t.section, t.rowId, t.value, t.label, t.submenu], ["Appearance", "set-choice", "mac.theme", "Theme", true]);
  assert.equal(t.detail, "Nord · Nord Light when light, Nord when dark");
  assert.equal(t.swatch, "#88c0d0");
  assert.deepEqual([m.value, m.label, m.detail], ["mac.themeMode", "Light or dark", "Dark · always"]);
  const def = Glue.settingsPage("general", s, {}, { theme: theme("default", "system") });
  assert.equal(def[0].detail, "Default · the Mac's own colours and accent");
  assert.match(def[1].detail, /^As the Mac · /);
});

test("a sync folder set: this machine's, as the window's switch", () => {
  const rows = Glue.settingsPage("general", s, {}, { theme: theme("default", "system"), machineOnly: Glue.machineOnly() });
  assert.equal(rows.find((r) => r.value === "mac.theme").badge, "this machine");
});

test("each opens its choices, the one in effect checked", () => {
  const picks = Glue.settingsPage("choice", s, {}, { choice: "mac.theme", theme: theme("nord", "system") });
  assert.deepEqual(picks.map((r) => r.tag), ["default", "nord"]);
  assert.ok(picks.every((r) => r.rowId === "set-opt" && r.value === "mac.theme" && r.showCheck));
  assert.deepEqual(picks.map((r) => r.checked), [false, true]);
  const modes = Glue.settingsPage("choice", s, {}, { choice: "mac.themeMode", theme: theme("nord", "light") });
  assert.deepEqual(modes.map((r) => r.tag), ["system", "light", "dark"]);
  assert.equal(modes.find((r) => r.checked).tag, "light");
});

test("without the app's themes, no rows (the shared rows as before)", () => {
  const rows = Glue.settingsPage("general", s, {}, {});
  assert.equal(rows.find((r) => /^mac\.theme/.test(r.value)), undefined);
});

test("the search finds them when the Mac gives its values", () => {
  const index = Glue.settingsIndex(s, {}, [], { theme: theme("default", "system") });
  assert.ok(index.some((r) => r.value === "mac.theme" && r.page === "general" && r.label === "Theme"));
  assert.ok(!Glue.settingsIndex(s, {}, []).some((r) => r.value === "mac.theme"));
});
