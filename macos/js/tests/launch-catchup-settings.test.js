// Settings › Defaults › When the app opens (the Mac's): defaults.launchCatchUp (ask before catching up, on by default)
// and defaults.launchCatchUpWhat (what that catch-up checks; a key left out follows its default), checked and kept in
// the settings file only when they differ from the default. The Omarchy launcher keeps them and shows nothing.
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../lib/Client.js");
const S = require("../lib/Settings.js");

test("launchCatchUp: on by default, true or false", () => {
  assert.equal(C.normalizeSettings(null).settings.defaults.launchCatchUp, true);
  assert.equal(C.normalizeSettings({ defaults: { launchCatchUp: false } }).settings.defaults.launchCatchUp, false);
  const n = C.normalizeSettings({ defaults: { launchCatchUp: "no" } });
  assert.equal(n.settings.defaults.launchCatchUp, true);
  assert.deepEqual(n.problems, ["defaults.launchCatchUp must be true or false"]);
});

test("launchCatchUpWhat: empty by default, its keys checked, the unknown ones dropped", () => {
  assert.deepEqual(C.normalizeSettings(null).settings.defaults.launchCatchUpWhat, {});
  const ok = C.normalizeSettings({ defaults: { launchCatchUpWhat: { text: false, changedPrompts: true, prompts: ["summary"], other: 1 } } });
  assert.deepEqual(ok.problems, []);
  assert.deepEqual(ok.settings.defaults.launchCatchUpWhat, { text: false, changedPrompts: true, prompts: ["summary"] });
  for (const bad of [[], "x", { text: "yes" }, { prompts: "summary" }, { prompts: ["Not An Id"] }]) {
    const n = C.normalizeSettings({ defaults: { launchCatchUpWhat: bad } });
    assert.deepEqual(n.settings.defaults.launchCatchUpWhat, {}, JSON.stringify(bad));
    assert.equal(n.problems.length, 1, JSON.stringify(bad));
  }
});

test("written only when they differ from the default, and read back the same", () => {
  assert.equal((S.toFile(C.normalizeSettings(null).settings).defaults || {}).launchCatchUp, undefined);
  assert.equal((S.toFile(C.normalizeSettings(null).settings).defaults || {}).launchCatchUpWhat, undefined);
  const file = { defaults: { launchCatchUp: false, launchCatchUpWhat: { taxonomies: true, prompts: [] } } };
  assert.deepEqual(S.toFile(C.normalizeSettings(file).settings).defaults, file.defaults);
});
