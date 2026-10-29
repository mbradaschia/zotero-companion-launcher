// The page in a browser (Playwright, where it's installed; skipped elsewhere), at the width Split View gives it beside
// Zotero on an iPad: the link's key, a paper picked, its status and task changed (the tags and todos.json as the Mac
// app writes them), a question answered as it streams, every tab, the columns chooser; no script errors.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer, KEY } from "./helpers.mjs";

const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require("playwright")); } catch { /* not installed here */ }
const WEB = join(dirname(fileURLToPath(import.meta.url)), "..", "web");

test("the page beside Zotero", { skip: !chromium && "Playwright isn't installed" }, async () => {
  const s = await startServer({ webDir: WEB });
  const browser = await chromium.launch();
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 452, height: 1024 } });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(s.base + "/?key=" + KEY);
    assert.equal(new URL(page.url()).search, "");
    await page.getByText("Dynamic capabilities and strategic management").click();
    await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "reading", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.choice.status [aria-pressed="true"]').textContent === "reading");
    assert.ok(s.bridge.lib["1:AAAA1111"].tags.some((t) => t.tag === "s/reading"));

    await page.getByRole("group", { name: "Task" }).getByRole("button", { name: "Writing" }).click();
    await page.waitForFunction(() => document.querySelector('.choice.task [aria-pressed="true"]').textContent === "Writing");
    const todos = JSON.parse(readFileSync(join(s.env.cdir, "todos.json"), "utf8")).todos;
    assert.equal(todos[0].isDefault, true);

    await page.fill("#ask", "What are dynamic capabilities?");
    await page.keyboard.press("Enter");
    await page.getByText("Dynamic capabilities.", { exact: true }).waitFor();

    for (const tab of ["Notes, 1", "Prompts", "Tasks, 1", "Taxonomies and tags", "Columns"]) {
      await page.getByRole("tab", { name: tab }).click();
      await page.waitForTimeout(150);
    }
    await page.getByText("Authors", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Columns", exact: true }).click();
    await page.getByRole("checkbox", { name: "Year" }).uncheck();
    await page.waitForTimeout(200);
    assert.ok(JSON.parse(readFileSync(join(s.env.cdir, "companion.json"), "utf8")).hiddenColumns.includes("year"));

    await page.getByRole("button", { name: "Show less" }).click();
    await page.getByText("No task").or(page.getByText("Writing")).first().waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await s.close();
  }
});
