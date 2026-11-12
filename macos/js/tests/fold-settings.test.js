// Settings › Defaults › Fold with AI (the Mac's fold reader): its model (the prompts' unless one is picked) and effort
// (low unless one is picked), validated and saved (lib/Client.js, lib/Settings.js), its rows (Core/GlueSettings.js),
// and what the reader sends the runner (Reader/FoldMake.js foldInput).
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../lib/Client.js");
const S = require("../lib/Settings.js");
const Glue = require("../../ZoteroLauncher/Core/Glue.js");

const settings = (defaults) => C.normalizeSettings(defaults === undefined ? null : { defaults }).settings;

test("fold: the prompts' model and low effort by default, left out of the file until changed", () => {
  const d = settings().defaults;
  assert.deepEqual(d.fold, { model: "", effort: "low" });
  assert.equal(S.toFile(settings()).defaults.fold, undefined);
  assert.equal(S.toFile(settings({ fold: { effort: "low" } })).defaults.fold, undefined, "low is the default: not written");
  assert.deepEqual(S.toFile(settings({ fold: { model: "openai:gpt-5.5" } })).defaults.fold, { model: "openai:gpt-5.5", effort: "low" });
  assert.deepEqual(S.toFile(settings({ fold: { effort: "high" } })).defaults.fold, { model: "", effort: "high" });
  assert.deepEqual(S.toFile(settings({ fold: { effort: "" } })).defaults.fold, { model: "", effort: "" }, "the model's own effort");
  const bad = C.normalizeSettings({ defaults: { fold: { model: "default", effort: "turbo" } } });
  assert.deepEqual(bad.settings.defaults.fold, { model: "", effort: "low" });
  assert.equal(bad.problems.length, 2);
  assert.match(bad.problems.join(" "), /defaults\.fold\.model/);
  assert.match(bad.problems.join(" "), /defaults\.fold\.effort/);
});

test("Defaults: Fold with AI's model and effort, right under Chat", () => {
  const rows = Glue.settingsPage("defaults", settings(), { defaults: { prompts: "claude:opus", chat: "claude:opus" } }, {});
  const sections = rows.map((r) => r.section).filter((s, i, a) => s && a.indexOf(s) === i);
  assert.deepEqual(sections.slice(0, 4), ["Prompts", "Chat", "Fold with AI", "When a model fails"]);
  const fold = rows.filter((r) => r.section === "Fold with AI");
  assert.deepEqual(fold.map((r) => [r.rowId, r.value, r.label]), [["set-models", "defaults.fold.model", "Model"], ["set-choice", "defaults.fold.effort", "Effort"]]);
  assert.equal(fold[0].detail, "The prompts' model, now claude:opus (automatic)");
  assert.match(fold[1].detail, /^low · Fastest, least thinking/);
  const picked = Glue.settingsPage("defaults", settings({ prompts: { model: "openai:gpt-5.5" }, fold: { model: "google:gemini-3-flash", effort: "" } }), { defaults: { prompts: "openai:gpt-5.5", chat: "" } }, {})
    .filter((r) => r.section === "Fold with AI");
  assert.equal(picked[0].detail, "google:gemini-3-flash");
  assert.match(picked[1].detail, /^default · The model's default ·/);
  const none = Glue.settingsPage("defaults", settings(), { defaults: { prompts: "", chat: "" } }, {}).find((r) => r.value === "defaults.fold.model");
  assert.match(none.detail, /none yet/);
});

test("Defaults: Check the sections with AI, this Mac's, under Fold with AI's effort; no row when the app doesn't give it", () => {
  const rows = (x) => Glue.settingsPage("defaults", settings(), { defaults: { prompts: "claude:opus", chat: "" } }, x).filter((r) => r.section === "Fold with AI");
  assert.equal(rows({}).length, 2);
  const on = rows({ foldOutline: true, machineOnly: true });
  assert.deepEqual(on.map((r) => r.value), ["defaults.fold.model", "defaults.fold.effort", "mac.foldOutline"]);
  assert.deepEqual([on[2].rowId, on[2].label, on[2].checked, on[2].badge], ["set-toggle", "Check the sections with AI", true, "this machine"]);
  assert.match(on[2].detail, /^On · when the reader first opens a paper, the model above reads its headings once/);
  const off = rows({ foldOutline: false })[2];
  assert.deepEqual([off.checked, off.badge, off.detail], [false, "", "Off · a paper's sections come from the PDF's bookmarks and the reader's own rules"]);
  assert.notEqual(on[2].icon, off.icon, "the icon says it too, not only the word");
});

test("the effort's page checks low by default; the model's page offers the prompts' model first", () => {
  const choice = Glue.settingsPage("choice", settings(), {}, { choice: "defaults.fold.effort" });
  assert.deepEqual(choice.filter((r) => r.checked).map((r) => r.tag), ["low"]);
  assert.equal(choice.length, 6);
  assert.deepEqual(Glue.settingsPage("choice", settings({ fold: { effort: "high" } }), {}, { choice: "defaults.fold.effort" }).filter((r) => r.checked).map((r) => r.tag), ["high"]);
  assert.deepEqual(Glue.settingsPage("choice", settings(), {}, { choice: "defaults.prompts.effort" }).filter((r) => r.checked).map((r) => r.tag), ["high"], "the prompts' stay high");
  const ctx = { models: { models: [{ value: "lab:m1", displayName: "Lab one", group: "Lab" }] } };
  const models = Glue.settingsPage("models", settings(), ctx, { modelsPath: "defaults.fold.model" });
  assert.deepEqual(models.map((r) => [r.tag, r.label, r.checked]), [["", "The prompts' model", true], ["lab:m1", "Lab one", false]]);
  const chosen = Glue.settingsPage("models", settings({ fold: { model: "lab:m1" } }), ctx, { modelsPath: "defaults.fold.model" });
  assert.deepEqual(chosen.map((r) => r.checked), [false, true]);
  assert.equal(Glue.settingsPage("models", settings(), ctx, { modelsPath: "defaults.prompts.model" })[0].tag, "lab:m1", "only folding offers the prompts' model");
});
