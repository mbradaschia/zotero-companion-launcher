// The fold reader's page, read as files (docs/fold-reader/SPEC.md section 10, 7; criteria 45 and 46): the default
// tokens' contrast, light and dark, and the icons it shares with the review table.
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const C = require("../../ZoteroLauncher/Reader/FoldCore.js")

const DIR = path.join(__dirname, "..", "..", "ZoteroLauncher")
const css = fs.readFileSync(path.join(DIR, "Reader", "FoldReader.css"), "utf8")

// the custom properties of the first :root block (light) and of the one under prefers-color-scheme: dark
function tokens(block) {
  const out = {}
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)) out[m[1]] = m[2].toLowerCase()
  return out
}
const light = tokens(/:root\s*\{([^}]*)\}/.exec(css)[1])
const dark = Object.assign({}, light, tokens(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)[1]))
for (const t of [light, dark]) t.paper = t.win // (--paper: var(--win))

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }

test("45: the default tokens meet 4.5:1 for the pairs of section 10, light and dark", () => {
  const pairs = []
  for (const fg of ["ink", "muted", "accent"]) for (const bg of ["win", "paper", "sel"]) pairs.push([fg, bg])
  pairs.push(["ink", "hl"], ["muted", "hl"], ["win", "ink"])
  for (const [name, t] of [["light", light], ["dark", dark]]) {
    for (const [fg, bg] of pairs) {
      assert.ok(t[fg] && t[bg], name + " has --" + fg + " and --" + bg)
      const r = contrast(t[fg], t[bg])
      assert.ok(r >= 4.5, `${name}: --${fg} on --${bg} is ${r.toFixed(2)}:1`)
    }
  }
  // the defaults named in section 10 (the light accent darkened: PLAN.md's deviations)
  assert.deepEqual([light.ink, light.muted, light.win, light.sel, light.hl, light["hl-line"]], ["#1b1f2a", "#5d6475", "#ffffff", "#e8f0fe", "#fff1b8", "#8a6d00"])
  assert.deepEqual([dark.ink, dark.muted, dark.accent, dark.win, dark.sel, dark.hl, dark["hl-line"]], ["#e6e9f0", "#a3aabb", "#6b9bf2", "#1a1e27", "#22314d", "#3d3410", "#e0c45c"])
})

test("46: FoldView's shared icons use ReviewGrid.js's ICONS paths", () => {
  const view = vm.runInNewContext(fs.readFileSync(path.join(DIR, "Reader", "FoldView.js"), "utf8") + "\n;FoldView", { FoldCore: C })
  const grid = fs.readFileSync(path.join(DIR, "Review", "ReviewGrid.js"), "utf8")
  const icons = /var ICONS = \{([\s\S]*?)\n  \}/.exec(grid)[1]
  const names = ["status", "task", "tax", "note", "chat", "ai", "panel"]
  assert.deepEqual(Object.keys(view.SHARED).sort(), names.slice().sort())
  for (const n of names) {
    const m = new RegExp("\\n\\s*" + n + ': "([^"]+)"').exec(icons)
    assert.ok(m, "ReviewGrid's ICONS has " + n)
    assert.equal(view.SHARED[n], m[1], n)
  }
})

test("the page's copy: every state of section 9 has its title; no em dash and no emoji in the page's files", () => {
  const view = vm.runInNewContext(fs.readFileSync(path.join(DIR, "Reader", "FoldView.js"), "utf8") + "\n;FoldView", { FoldCore: C })
  for (const k of ["loading", "no-textfold", "zotero-off", "not-folded", "folding", "needs-engine", "no-model", "no-file", "fold-failed", "group-library", "bad-format"]) assert.ok(view.STATES[k], k)
  assert.equal(view.stateCopy({ kind: "folding", stage: "levels", done: 2, total: 9 }).sentence, "Levels: 2 of 9. You can read the PDF meanwhile.")
  for (const f of ["FoldCore.js", "FoldView.js", "FoldBridge.js", "FoldReader.css"]) {
    const s = fs.readFileSync(path.join(DIR, "Reader", f), "utf8")
    assert.ok(!s.includes(String.fromCharCode(0x2014)), f + " has an em dash")
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]️/u.test(s) && !/[\u{1F300}-\u{1FAFF}]/u.test(s), f + " has an emoji")
  }
})
