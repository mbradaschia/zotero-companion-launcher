// The Mac's catching up (Core/GlueSettings.js): catchup-plan's argv for each kind, the jobs a plan holds, the question
// when the app opens, what it checks (Settings › Defaults › What it checks) and its switches.
const test = require("node:test");
const assert = require("node:assert/strict");
const Glue = require("../../ZoteroLauncher/Core/Glue.js");

const settings = (defaults) => Glue.settings(null, { defaults }).settings;
const PROMPTS = [{ id: "summary", title: "Summary" }, { id: "findings", title: "Findings" }];
const PLAN = {
  recent: { papers: 3, jobs: [{ id: "1:A", op: "extract", title: "A" }, { id: "1:A", op: "prompt", prompt: "summary", title: "A" }, { id: "1:B", op: "classify", only: ["x"], title: "B" },
    { id: "1:S", op: "extract", title: "S" }] },
  taxonomies: { papers: 2, jobs: [{ id: "1:B", op: "classify", only: ["y"] }, { id: "1:C", op: "classify", only: ["y"] }] },
  prompts: { papers: 1, jobs: [{ id: "1:D", op: "prompt", prompt: "findings" }], unknown: 0 }
};

test("the page's counts ask for every part, as before", () => {
  const s = settings({ autoExtractNew: true, autoTagNew: true, autoPrompts: ["summary", "gone"] });
  assert.deepEqual(Glue.catchUpPlanArgs(s, "all", PROMPTS, "2026-09-18 10:00:00"), ["catchup-plan", "--stale-taxonomies", "--stale-prompts", "--since", "2026-09-18 10:00:00",
    "--tag", "--extract", "--prompts", "summary", "--prompts-mode", "missing", "--tag-mode", "missing"]);
});

test("each row's check asks only for its part", () => {
  const s = settings({ autoExtractNew: true, catchUpPrompts: "replace" });
  assert.deepEqual(Glue.catchUpPlanArgs(s, "taxonomies", PROMPTS, "D"), ["catchup-plan", "--stale-taxonomies", "--prompts-mode", "replace", "--tag-mode", "missing"]);
  assert.deepEqual(Glue.catchUpPlanArgs(s, "prompts", PROMPTS, "D"), ["catchup-plan", "--stale-prompts", "--prompts-mode", "replace", "--tag-mode", "missing"]);
  assert.deepEqual(Glue.catchUpPlanArgs(s, "recent", PROMPTS, "D"), ["catchup-plan", "--since", "D", "--extract", "--prompts-mode", "replace", "--tag-mode", "missing"]);
});

test("the app's opening checks what New papers runs until you choose, and nothing when nothing is chosen", () => {
  assert.deepEqual(Glue.catchUpPlanArgs(settings({}), "launch", PROMPTS, "D"), []);
  assert.deepEqual(Glue.catchUpPlanArgs(settings({ autoTagNew: true, autoPrompts: ["findings"] }), "launch", PROMPTS, "D"),
    ["catchup-plan", "--since", "D", "--tag", "--prompts", "findings", "--prompts-mode", "missing", "--tag-mode", "missing"]);
  const chosen = settings({ autoTagNew: true, autoPrompts: ["findings"], launchCatchUpWhat: { taxonomies: false, text: true, prompts: ["summary"], changedPrompts: true } });
  assert.deepEqual(Glue.catchUpPlanArgs(chosen, "launch", PROMPTS, "D"), ["catchup-plan", "--stale-prompts", "--since", "D", "--extract", "--prompts", "summary",
    "--prompts-mode", "missing", "--tag-mode", "missing"]);
  assert.deepEqual(Glue.catchUpPlanArgs(settings({ launchCatchUpWhat: { changedTaxonomies: true } }), "launch", PROMPTS, "D"),
    ["catchup-plan", "--stale-taxonomies", "--prompts-mode", "missing", "--tag-mode", "missing"]);
});

test("a plan's jobs: its part, or every part once, the skipped extractions left out", () => {
  assert.deepEqual(Glue.catchUpJobs(PLAN, "taxonomies", {}).map((j) => j.id), ["1:B", "1:C"]);
  const all = Glue.catchUpJobs(PLAN, "launch", { "1:S": "scan" });
  assert.deepEqual(all.map((j) => j.id + "|" + j.op), ["1:A|extract", "1:A|prompt", "1:B|classify", "1:C|classify", "1:D|prompt"]);
  assert.deepEqual(all[2].only, ["x", "y"]); // tagged once, by both
  const whole = Glue.catchUpJobs({ recent: { jobs: [{ id: "1:B", op: "classify" }] }, taxonomies: { jobs: [{ id: "1:B", op: "classify", only: ["y"] }] } }, "launch", {});
  assert.equal(whole[0].only, undefined); // every taxonomy, as the recent part asked
  assert.deepEqual(Glue.catchUpJobs(null, "launch", {}), []);
});

test("the question says what it found, and nothing to do asks nothing", () => {
  const ask = Glue.launchCatchUpAsk(PLAN, settings({ catchUpDays: 7 }), PROMPTS, { "1:S": "scan" });
  assert.equal(ask.title, "Bring 4 papers up to date?");
  assert.equal(ask.yes, "Bring them up to date (in Processes)");
  assert.equal(ask.no, "Not now");
  assert.equal(ask.detail, "Added in the last 7 days: text for 1, taxonomies for 1, “Summary” on 1 · 2 papers tagged by an older taxonomy · 1 note from an older prompt");
  assert.equal(ask.noDetail, "Settings › Defaults › Ask to catch up when the app opens turns this question off");
  assert.equal(ask.jobs, 5);
  const one = Glue.launchCatchUpAsk({ prompts: { jobs: [{ id: "1:D", op: "prompt", prompt: "findings" }] } }, settings({}), PROMPTS, {});
  assert.equal(one.title, "Bring 1 paper up to date?");
  assert.equal(one.yes, "Bring it up to date (in Processes)");
  assert.equal(one.detail, "1 note from an older prompt");
  assert.equal(Glue.launchCatchUpAsk({ recent: { jobs: [{ id: "1:S", op: "extract" }] } }, settings({}), PROMPTS, { "1:S": "scan" }), null);
  assert.equal(Glue.launchCatchUpAsk({}, settings({}), PROMPTS, {}), null);
});

test("a switch writes its own key; the others keep following their defaults", () => {
  const s = settings({ autoExtractNew: true, autoPrompts: ["summary"] });
  assert.deepEqual(Glue.launchCatchUpToggled(s, PROMPTS, "text"), { text: false });
  assert.deepEqual(Glue.launchCatchUpToggled(s, PROMPTS, "taxonomies"), { taxonomies: true });
  assert.deepEqual(Glue.launchCatchUpToggled(s, PROMPTS, "changedPrompts"), { changedPrompts: true });
  assert.deepEqual(Glue.launchCatchUpToggled(s, PROMPTS, "prompt:summary"), { prompts: [] });
  assert.deepEqual(Glue.launchCatchUpToggled(s, PROMPTS, "prompt:findings"), { prompts: ["summary", "findings"] });
  const later = settings({ autoExtractNew: true, launchCatchUpWhat: { text: false } });
  assert.deepEqual(Glue.launchCatchUpToggled(later, PROMPTS, "text"), { text: true });
  assert.deepEqual(Glue.launchCatchUpToggled(later, PROMPTS, "nope"), { text: false });
});

test("Defaults has When the app opens after Bring papers up to date, and its page lists every switch", () => {
  const s = settings({ autoExtractNew: true, autoPrompts: ["summary"] });
  const rows = Glue.settingsPage("defaults", s, { prompts: PROMPTS }, {});
  const sections = rows.map((r) => r.section).filter((x, i, all) => all.indexOf(x) === i);
  assert.equal(sections[sections.indexOf("Bring papers up to date") + 1], "When the app opens");
  const ask = rows.find((r) => r.value === "defaults.launchCatchUp");
  assert.equal(ask.rowId, "set-toggle");
  assert.equal(ask.checked, true);
  assert.match(ask.detail, /^On · /);
  const what = rows.find((r) => r.rowId === "set-nav" && r.value === "launch-catchup");
  assert.equal(what.detail, "Their text and “Summary”");
  assert.equal(Glue.settingsPage("defaults", settings({}), { prompts: PROMPTS }, {}).find((r) => r.value === "launch-catchup").detail, "Nothing: turn something on");
  const off = Glue.settingsPage("defaults", settings({ launchCatchUp: false }), {}, {}).find((r) => r.value === "defaults.launchCatchUp");
  assert.equal(off.checked, false);
  assert.match(off.detail, /^Off · /);
  const away = Glue.settingsPage("defaults", s, { automation: { host: "lab", here: false, machine: "mac" } }, {}).find((r) => r.value === "defaults.launchCatchUp");
  assert.match(away.detail, /on “lab”, the machine automation runs on$/);

  const page = Glue.settingsPage("launch-catchup", s, { prompts: PROMPTS }, {});
  assert.deepEqual(page.map((r) => r.value), ["defaults.launchCatchUpWhat.text", "defaults.launchCatchUpWhat.taxonomies", "defaults.launchCatchUpWhat.prompt:summary",
    "defaults.launchCatchUpWhat.prompt:findings", "defaults.launchCatchUpWhat.changedTaxonomies", "defaults.launchCatchUpWhat.changedPrompts"]);
  assert.ok(page.every((r) => r.rowId === "set-toggle"));
  assert.deepEqual(page.map((r) => r.checked), [true, false, true, false, false, false]);
  assert.equal(page[0].section, "Papers added in the last 30 days");
  assert.equal(page[4].section, "Every paper");
  assert.match(page[0].detail, /\(as Extract new papers' text, until you change it\)$/);
  const reading = Glue.settingsPage("launch-catchup", s, { runner: { installed: true } }, {});
  assert.ok(reading.some((r) => r.rowId === "set-info" && r.label === "Reading your prompts…"));
});
