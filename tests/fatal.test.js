// A problem every paper would meet (daemon/lib/fatal.mjs): told from a job's error, and the runner's classify
// stopping there instead of failing paper by paper.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const F = () => import("../daemon/lib/fatal.mjs");
const RUNNER = path.join(__dirname, "../daemon/bin/oma-zotero-prompt.mjs");

test("fatalKind: signed out, a refused key, out of credit, overloaded, not set up, no network; a paper's own problem isn't one", async () => {
  const { fatalKind } = await F();
  const cases = [
    ["Claude: Invalid API key · Please run /login", "signin"],
    ["Claude: OAuth token has expired. Please obtain a new token or refresh your existing token.", "signin"],
    ["ChatGPT: 401 Unauthorized", "signin"],
    ["the API key was refused (401): invalid x-api-key", "key"],
    ["Jev refused (403): forbidden", "key"],
    ["rate limited or out of credit (429): slow down", "limit"],
    ["Claude: Credit balance is too low", "limit"],
    ["Claude: Claude AI usage limit reached|1730000000", "limit"],
    ["Claude: API Error: 529 {\"type\":\"overloaded_error\"}", "busy"],
    ["no AI model is set up: open Settings › Models & providers in the launcher", "setup"],
    ["OpenAI: no API key (Settings › Models & providers)", "setup"],
    ["can't reach api.openai.com: ENOTFOUND", "network"],
    ["Claude: API Error: Connection error.", "network"],
    ["couldn't reach Jev: fetch failed", "network"],
    ["Ollama isn't answering at http://localhost:11434: ECONNREFUSED", "network"],
    // its own: the next paper may work
    ["the model sent an empty answer", ""],
    ["Claude took longer than 15 minutes", ""],
    ["this item has no PDF on disk to extract", ""],
    ["no JSON in the answer", ""],
    ["", ""],
    // Zotero away: what waits for Zotero goes on when it's back
    ["Zotero didn't answer /item: fetch failed", ""],
    ["Zotero isn't running (or the bridge isn't installed): no /run/bridge.json", ""],
  ];
  for (const [text, kind] of cases) assert.equal(fatalKind(text), kind, text);
});

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

function runner(args, env) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [RUNNER, ...args], { env: Object.assign({}, process.env, env) });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code, out, err }));
  });
}

test("classify: a key Jev refuses stops the batch at the first paper; the rest stopped, not tried", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fatal-"));
  const bridge = await serve((url, b) => {
    if (url === "/oma-zotero/item") return { body: { ok: true, item: { key: b.key, libraryID: 1, itemType: "journalArticle", title: "T" }, paper: { key: b.key, title: "T", authors: "A", year: "2020", abstract: "" }, notes: [], tags: [] } };
    return { status: 404, body: { ok: false, error: { code: "nope", message: url } } };
  });
  let asked = 0;
  const jev = await serve(() => { asked++; return { status: 401, body: { error: { message: "invalid key" } } }; });
  fs.mkdirSync(path.join(tmp, "run/oma-zotero"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "run/oma-zotero/bridge.json"), JSON.stringify({ port: bridge.address().port, token: "a".repeat(64) }));
  const env = { HOME: tmp, XDG_RUNTIME_DIR: path.join(tmp, "run"), XDG_STATE_HOME: path.join(tmp, "state"), XDG_CONFIG_HOME: path.join(tmp, "config"), JEV_API_KEY: "test-key",
    OMA_JEV_URL: `http://127.0.0.1:${jev.address().port}/v1`, PATH: path.join(tmp, "bin") }; // no secret-tool: never your keyring
  try {
    const r = await runner(["classify", "--items", "1:AAAA0001,1:BBBB0002,1:CCCC0003", "--quiet"], env);
    assert.equal(r.code, 0, r.err);
    const results = JSON.parse(r.out).results;
    assert.deepEqual(results.map((x) => [x.id, x.status]), [["1:AAAA0001", "failed"], ["1:BBBB0002", "stopped"], ["1:CCCC0003", "stopped"]]);
    assert.match(results[0].reason, /^Jev refused \(401\): invalid key/);
    assert.equal(results[1].reason, results[0].reason);
    assert.equal(asked, 1);
    // one failed task in Processes, not three
    const tasks = JSON.parse(fs.readFileSync(path.join(tmp, "state/oma-zotero/tasks/tasks.json"), "utf8")).tasks;
    assert.equal(tasks.filter((t) => t.kind === "classify" && t.status === "error").length, 1);
  } finally {
    bridge.close();
    jev.close();
  }
});
