// A paper in a library you can only read (a group you're a reader of): the runner never asks a model, writes a note
// or tags there. A prompt on it is skipped before anything runs, tagging and automatic extraction skip it, and a
// catch-up leaves it out of its plan (2026-10-29: 45 Opus runs on a read-only group's papers, each refused at the save).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const RUNNERS = [path.join(__dirname, "../../runner/bin/oma-zotero-prompt.mjs")]; // (the Mac's copy of the runner; the Omarchy one's test is its own)

function serve(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const out = handler(req.url, body ? JSON.parse(body) : {});
        res.writeHead(out.status || 200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(out.body));
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function runner(bin, args, env) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [bin, ...args], { env: Object.assign({}, process.env, env) });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code, out, err }));
  });
}

// Library 1 is yours; library 7 ("HBR.org") you can only read.
function item(key, libraryID) {
  const ro = libraryID === 7;
  return { ok: true, item: { key, libraryID, itemType: "journalArticle", title: "Paper " + key },
    paper: { key, title: "Paper " + key, authors: "Adner & Helfat", year: "2003", abstract: "We study managers." },
    notes: [], tags: [], attachments: [], library: { libraryID, name: ro ? "HBR.org" : "My Library", type: ro ? "group" : "user", editable: !ro } };
}

for (const bin of RUNNERS) {
  const which = "the Mac's runner";

  test(`${which}: nothing runs or is written on a paper in a read-only library`, async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "read-only-"));
    const asked = [];
    const bridge = await serve((url, b) => {
      asked.push(url);
      if (url === "/oma-zotero/item") return { body: item(b.key, b.libraryID) };
      if (url === "/oma-zotero/papers/select") return { body: { ok: true, total: 2, items: [{ key: "AAAA0001", libraryID: 1, title: "Mine" }, { key: "AAAA0002", libraryID: 7, title: "Theirs" }] } };
      if (url === "/oma-zotero/notes/by-prompt") return { body: { ok: true, notes: [] } };
      return { status: 404, body: { ok: false, error: { code: "nope", message: url } } };
    });
    fs.mkdirSync(path.join(tmp, "run/oma-zotero"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "run/oma-zotero/bridge.json"), JSON.stringify({ port: bridge.address().port, token: "a".repeat(64) }));
    const env = { HOME: tmp, XDG_RUNTIME_DIR: path.join(tmp, "run"), XDG_STATE_HOME: path.join(tmp, "state"), XDG_CONFIG_HOME: path.join(tmp, "config"),
      JEV_API_KEY: "test-key", OMA_JEV_URL: "http://127.0.0.1:9/v1", PATH: path.join(tmp, "bin") }; // (no model is reachable: none may be asked)
    try {
      // a prompt: skipped before any model, no task in Processes, no note asked for
      const r = await runner(bin, ["run", "literature-review", "--key", "AAAA0002", "--library", "7"], env);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /“HBR\.org” is read-only: skipped/);
      assert.ok(!asked.includes("/oma-zotero/notes/create"));
      assert.ok(!fs.existsSync(path.join(tmp, "state/oma-zotero/tasks")) || fs.readdirSync(path.join(tmp, "state/oma-zotero/tasks")).filter((f) => f !== "tasks.json").length === 0);
      // tagging: skipped, no tags written
      const c = await runner(bin, ["classify", "--items", "7:AAAA0002"], env);
      assert.equal(c.code, 0, c.err);
      assert.deepEqual(JSON.parse(c.out).results, [{ id: "7:AAAA0002", status: "skipped", reason: "“HBR.org” is read-only: skipped" }]);
      assert.ok(!asked.includes("/oma-zotero/tags/update"));
      // automatic extraction: skipped
      const x = await runner(bin, ["extract-batch", "--items", "7:AAAA0002"], env);
      assert.equal(x.code, 0, x.err);
      assert.equal(JSON.parse(x.out).results[0].status, "skipped");
      // a catch-up: only your library's paper is planned
      const p = await runner(bin, ["catchup-plan", "--since", "2026-10-01 00:00:00", "--prompts", "literature-review"], env);
      assert.equal(p.code, 0, p.err);
      const jobs = JSON.parse(p.out).recent.jobs;
      assert.deepEqual([...new Set(jobs.map((j) => j.id))], ["1:AAAA0001"]);
    } finally {
      bridge.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}
