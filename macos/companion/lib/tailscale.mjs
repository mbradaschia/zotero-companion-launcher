// Tailscale, for the link (design §3): its command where Macs have it (the Mac App Store app's, the standalone app's,
// Homebrew's), this Mac's name on your tailnet (`status --json`: Self.DNSName), and `serve` so the tailnet reaches the
// companion over HTTPS (tailnet only: never Funnel) on the companion's own port, https://<name>:8787/, so whatever you
// serve on 443 stays as it is. OMA_ZOTERO_TAILSCALE names another command (the tests' fake).
import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";

export const CANDIDATES = ["/Applications/Tailscale.app/Contents/MacOS/Tailscale", "/opt/homebrew/bin/tailscale", "/usr/local/bin/tailscale", "/usr/bin/tailscale"];

export function findTailscale(env = process.env) {
  if (env.OMA_ZOTERO_TAILSCALE) return env.OMA_ZOTERO_TAILSCALE;
  for (const p of CANDIDATES) {
    try {
      accessSync(p, constants.X_OK);
      return p;
    } catch { /* not here */ }
  }
  return "";
}

function run(cmd, args, env) {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 15000, env });
  return { ok: r.status === 0, out: r.stdout || "", err: String(r.stderr || (r.error && r.error.message) || "").trim() };
}

// → { found, name ("mini.tail1234.ts.net", "" when logged out), serving (the companion's port is served), problem }
export function tailscaleState(port, env = process.env) {
  const cmd = findTailscale(env);
  if (!cmd) return { found: false, name: "", serving: false, problem: "Tailscale isn't installed on this Mac" };
  const s = run(cmd, ["status", "--json"], env);
  let name = "";
  try { name = String(JSON.parse(s.out).Self.DNSName || "").replace(/\.$/, ""); } catch { /* not running */ }
  if (!name) return { found: true, name: "", serving: false, problem: "Tailscale isn't connected on this Mac" };
  const v = run(cmd, ["serve", "status", "--json"], env);
  let serving = false;
  try {
    const web = JSON.parse(v.out || "{}").Web || {};
    const h = web[`${name}:${port}`];
    serving = !!h && Object.values(h.Handlers || {}).some((x) => new RegExp(`^(https?://)?(127\\.0\\.0\\.1|localhost)?:?${port}/?$`).test(String(x && x.Proxy)));
  } catch { /* nothing served */ }
  return { found: true, name, serving, problem: "" };
}

// The companion served on the tailnet (https://<name>:<port>/), left on across restarts (`--bg`). → tailscaleState after.
export function tailscaleServe(port, env = process.env) {
  const before = tailscaleState(port, env);
  if (!before.name || before.serving) return before;
  const r = run(findTailscale(env), ["serve", "--bg", `--https=${port}`, `http://127.0.0.1:${port}`], env);
  const after = tailscaleState(port, env);
  if (!after.serving) after.problem = "Tailscale didn't serve it: " + (r.err.split("\n").pop() || "no answer");
  return after;
}

// The companion's port no longer served (turned off: whatever listens on it later isn't published). → tailscaleState after.
export function tailscaleUnserve(port, env = process.env) {
  const before = tailscaleState(port, env);
  if (!before.serving) return before;
  run(findTailscale(env), ["serve", `--https=${port}`, "off"], env);
  return tailscaleState(port, env);
}
