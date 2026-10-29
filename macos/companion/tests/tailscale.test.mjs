// The link (lib/tailscale.mjs, server.mjs --share): this Mac's tailnet name, `tailscale serve` on the companion's own
// port when it isn't served yet (never twice, never 443), and what to say when Tailscale is missing or logged out.
// A fake `tailscale` (a script keeping its serve config in a file) stands in for the real one.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tailscaleState, tailscaleServe } from "../lib/tailscale.mjs";
import { share } from "../server.mjs";
import { makeContext } from "../lib/context.mjs";
import { makeHome, KEY } from "./helpers.mjs";

function fake({ name = "mini.tail1234.ts.net.", served = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "companion-ts-"));
  const conf = join(dir, "serve.json");
  const log = join(dir, "calls");
  if (served) writeFileSync(conf, JSON.stringify({ Web: { [name.replace(/\.$/, "") + ":8787"]: { Handlers: { "/": { Proxy: "http://127.0.0.1:8787" } } } } }));
  const cmd = join(dir, "tailscale");
  writeFileSync(cmd, `#!/bin/sh
echo "$*" >> "${log}"
case "$1 $2" in
  "status --json") ${name ? `echo '{"Self":{"DNSName":"${name}"}}'` : "echo '{}'; exit 1"} ;;
  "serve status") cat "${conf}" 2>/dev/null || echo '{}' ;;
  "serve --bg") echo '{"Web":{"${name.replace(/\.$/, "")}:8787":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:8787"}}}}}' > "${conf}" ;;
esac
`);
  chmodSync(cmd, 0o755);
  return { env: { OMA_ZOTERO_TAILSCALE: cmd, PATH: process.env.PATH }, calls: () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []) };
}

test("tailscale: not there, not connected", () => {
  const none = tailscaleState(8787, { OMA_ZOTERO_TAILSCALE: "/nonexistent/tailscale" });
  assert.equal(none.name, "");
  const off = fake({ name: "" });
  const s = tailscaleState(8787, off.env);
  assert.deepEqual([s.found, s.name, s.serving], [true, "", false]);
  assert.match(s.problem, /isn't connected/);
});

test("tailscale: served on the companion's own port, once", () => {
  const t = fake();
  const r = tailscaleServe(8787, t.env);
  assert.deepEqual([r.name, r.serving, r.problem], ["mini.tail1234.ts.net", true, ""]);
  assert.ok(t.calls().includes("serve --bg --https=8787 http://127.0.0.1:8787"));
  const n = t.calls().length;
  tailscaleServe(8787, t.env);
  assert.ok(!t.calls().slice(n).some((c) => c.startsWith("serve --bg")));
});

test("share: the tailnet link with the key; none when Tailscale can't serve it", () => {
  const env = makeHome();
  const ctx = makeContext({ env });
  const t = fake({ served: true });
  const r = share(ctx, 8787, t.env);
  assert.equal(r.link, `https://mini.tail1234.ts.net:8787/?key=${KEY}`);
  assert.equal(r.local, `http://127.0.0.1:8787/?key=${KEY}`);
  const off = share(ctx, 8787, fake({ name: "" }).env);
  assert.equal(off.link, "");
  assert.match(off.tailscale.problem, /isn't connected/);
});
