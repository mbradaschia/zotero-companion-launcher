// The prompt runner as the Mac app starts it (ProcessRunner.swift): the installed `oma-zotero-prompt`, a clean
// environment (HOME, XDG, TMPDIR, LANG, the API keys' variables the runner reads) and an explicit PATH: Node's folder
// (the one running this server), ~/.local/bin (where install-runner.sh links the command), Homebrew's and the system's.
// Three ways: run and wait (its stdout as JSON), start and leave (a prompt run: its progress is in the runner's
// tasks), stream (a chat turn: JSON lines as they come).
import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { dirname, join, delimiter } from "node:path";

export const KEPT = ["HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TMPDIR", "XDG_CONFIG_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME",
  "OMA_ZOTERO_PROMPTS_DIR", "OMA_ZOTERO_INSTRUCTIONS", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY", "OPENROUTER_API_KEY", "JEV_API_KEY", "TYPESAFE_API_KEY"];

export function runnerPath(env) {
  const home = env.HOME || "";
  return [dirname(process.execPath), join(home, ".local", "bin"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"]
    .filter((p, i, all) => p && all.indexOf(p) === i).join(delimiter);
}

export function cleanEnv(env) {
  const out = {};
  for (const k of KEPT) if (env[k] !== undefined) out[k] = env[k];
  out.PATH = runnerPath(env);
  return out;
}

// The command: OMA_ZOTERO_RUNNER (tests, a checkout), else oma-zotero-prompt on that PATH. "" when there's none.
export function findRunner(env) {
  if (env.OMA_ZOTERO_RUNNER) return env.OMA_ZOTERO_RUNNER;
  for (const dir of runnerPath(env).split(delimiter)) {
    const p = join(dir, "oma-zotero-prompt");
    try {
      accessSync(p, constants.X_OK);
      return p;
    } catch { /* not here */ }
  }
  return "";
}

// The runner's error, as the Mac app shows it (RunnerResult.problem): its last stderr line, without its name.
export function problemOf(r) {
  if (r.missing) return "the AI features aren't installed on the Mac mini (the Mac app's Settings › Setup)";
  if (r.timedOut) return "it didn't answer in time";
  let last = String(r.stderr || "").trim().split("\n").pop() || "";
  if (last.startsWith("oma-zotero-prompt: ")) last = last.slice("oma-zotero-prompt: ".length);
  return last || `it stopped (exit ${r.status})`;
}

export function makeRunner(env, spawnImpl = spawn) {
  const command = () => findRunner(env);
  const options = () => ({ env: cleanEnv(env), cwd: env.HOME || "/" });

  function run(argv, { stdin = null, timeoutMs = 120000 } = {}) {
    return new Promise((resolve) => {
      const cmd = command();
      if (!cmd) return resolve({ status: -1, stdout: "", stderr: "", missing: true, timedOut: false });
      let p;
      try {
        p = spawnImpl(cmd, argv, Object.assign(options(), { stdio: ["pipe", "pipe", "pipe"] }));
      } catch {
        return resolve({ status: -1, stdout: "", stderr: "", missing: true, timedOut: false });
      }
      let out = "", err = "", timedOut = false;
      const timer = setTimeout(() => { timedOut = true; p.kill("SIGTERM"); }, timeoutMs);
      p.stdout.setEncoding("utf8");
      p.stderr.setEncoding("utf8");
      p.stdout.on("data", (d) => { if (out.length < 8e6) out += d; });
      p.stderr.on("data", (d) => { if (err.length < 1e5) err += d; });
      p.on("error", (e) => { clearTimeout(timer); resolve({ status: -1, stdout: out, stderr: e.message, missing: e.code === "ENOENT", timedOut }); });
      p.on("close", (code) => { clearTimeout(timer); resolve({ status: code ?? -1, stdout: out, stderr: err, missing: false, timedOut }); });
      p.stdin.on("error", () => { /* it stopped before reading */ });
      p.stdin.end(stdin == null ? "" : stdin);
    });
  }

  // Run and read its stdout as JSON (the last line that is JSON). Throws the runner's problem.
  async function json(argv, opts) {
    const r = await run(argv, opts);
    const lines = String(r.stdout || "").trim().split("\n").reverse();
    for (const line of lines) {
      try {
        const v = JSON.parse(line);
        if (r.status === 0) return v;
      } catch { /* not this line */ }
    }
    const e = new Error(problemOf(r));
    e.code = r.missing ? "runner-missing" : "runner-failed";
    throw e;
  }

  // Started and left to run: its own process group, so the server's restart doesn't stop a prompt half way.
  function start(argv, stdin = null) {
    const cmd = command();
    if (!cmd) return false;
    try {
      const p = spawnImpl(cmd, argv, Object.assign(options(), { stdio: [stdin == null ? "ignore" : "pipe", "ignore", "ignore"], detached: true }));
      p.on("error", () => { /* (the runner's tasks show what happened) */ });
      if (stdin != null) { p.stdin.on("error", () => {}); p.stdin.end(stdin); }
      p.unref();
      return true;
    } catch {
      return false;
    }
  }

  // Each stdout line as it comes; → { done: Promise<result>, stop() }, or null when there's no runner.
  function stream(argv, { stdin = null, onLine, timeoutMs = 30 * 60000 } = {}) {
    const cmd = command();
    if (!cmd) return null;
    let p;
    try {
      p = spawnImpl(cmd, argv, Object.assign(options(), { stdio: ["pipe", "pipe", "pipe"] }));
    } catch {
      return null;
    }
    let buf = "", err = "", timedOut = false;
    const timer = setTimeout(() => { timedOut = true; p.kill("SIGTERM"); }, timeoutMs);
    p.stdout.setEncoding("utf8");
    p.stderr.setEncoding("utf8");
    p.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) onLine(line);
      }
    });
    p.stderr.on("data", (d) => { if (err.length < 1e5) err += d; });
    const done = new Promise((resolve) => {
      p.on("error", (e) => { clearTimeout(timer); resolve({ status: -1, stderr: e.message, missing: e.code === "ENOENT", timedOut }); });
      p.on("close", (code) => {
        clearTimeout(timer);
        if (buf.trim()) onLine(buf.trim());
        resolve({ status: code ?? -1, stderr: err, missing: false, timedOut });
      });
    });
    p.stdin.on("error", () => {});
    p.stdin.end(stdin == null ? "" : stdin);
    return { done, stop: () => p.kill("SIGTERM") };
  }

  return { command, run, json, start, stream };
}
