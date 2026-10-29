// The page's kind icons are the Mac app's (ReviewGrid.js's ICONS, which ConsistencyTests keeps in step with
// Icons.concept): path for path, so a status, a task, a ranking, a taxonomy, yours or an AI column look the same here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const paths = (text, block) => {
  const body = new RegExp(`(?:const|var) ${block} = \\{([\\s\\S]*?)\\n\\s*\\}`).exec(text)[1];
  return Object.fromEntries([...body.matchAll(/^\s*([a-z]+):\s*"([^"]+)"/gm)].map((m) => [m[1], m[2]]));
};

test("the kinds' icons are ReviewGrid's", () => {
  const grid = paths(readFileSync(join(HERE, "..", "..", "ZoteroLauncher", "Review", "ReviewGrid.js"), "utf8"), "ICONS");
  const page = paths(readFileSync(join(HERE, "..", "web", "app.js"), "utf8"), "KIND");
  assert.ok(Object.keys(page).length >= 10);
  for (const [name, d] of Object.entries(page)) assert.equal(d, grid[name], name);
});
