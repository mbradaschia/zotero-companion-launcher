// The link (lib/tailscale.mjs, server.mjs --share): this Mac's tailnet name, `tailscale serve` on the companion's own
// port when it isn't served yet (never twice, never 443), and what to say when Tailscale is missing or logged out.
// A fake `tailscale` (a script keeping its serve config in a file) stands in for the real one.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tailscaleState, tailscaleServe, tailscaleUnserve, tailscaleOwner, ownerOf } from "../lib/tailscale.mjs";
import { share, watchOwner } from "../server.mjs";
import { makeContext } from "../lib/context.mjs";
import { makeHome, KEY } from "./helpers.mjs";

function fake({ name = "mini.tail1234.ts.net.", served = false, owner = "Me@Example.com" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "companion-ts-"));
  const conf = join(dir, "serve.json");
  const log = join(dir, "calls");
  if (served) writeFileSync(conf, JSON.stringify({ Web: { [name.replace(/\.$/, "") + ":8787"]: { Handlers: { "/": { Proxy: "http://127.0.0.1:8787" } } } } }));
  const cmd = join(dir, "tailscale");
  writeFileSync(cmd, `#!/bin/sh
echo "$*" >> "${log}"
case "$1 $2" in
  "status --json") ${name ? `echo '{"Self":{"DNSName":"${name}","UserID":42},"User":{"42":{"LoginName":"${owner}"},"7":{"LoginName":"someone@else.com"}}}'` : "echo '{}'; exit 1"} ;;
  "serve status") cat "${conf}" 2>/dev/null || echo '{}' ;;
  "serve --https=8787") rm -f "${conf}" ;;
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

test("tailscale: who this Mac is signed in as, from status --json", async () => {
  assert.equal(ownerOf('{"Self":{"UserID":1},"User":{"1":{"LoginName":" me@example.com "}}}'), "me@example.com");
  assert.equal(ownerOf('{"Self":{"UserID":1},"User":{}}'), "");
  assert.equal(ownerOf("not json"), "");
  assert.equal(tailscaleState(8787, fake().env).owner, "Me@Example.com");
  assert.equal(await tailscaleOwner(fake().env), "Me@Example.com");
  assert.equal(await tailscaleOwner(fake({ name: "" }).env), "");
  assert.equal(await tailscaleOwner({ OMA_ZOTERO_TAILSCALE: "/nonexistent/tailscale" }), "");
  const w = watchOwner(fake().env);
  await w.ready;
  assert.equal(w(), "Me@Example.com");
  w.stop();
});

test("share: the tailnet link, no key in it (your own devices need none); none when Tailscale can't serve it", () => {
  const env = makeHome();
  const ctx = makeContext({ env });
  const t = fake({ served: true });
  const r = share(ctx, 8787, t.env);
  assert.equal(r.link, "https://mini.tail1234.ts.net:8787/");
  assert.equal(r.keyed, false);
  assert.equal(r.local, `http://127.0.0.1:8787/?key=${KEY}`);
  const anon = share(ctx, 8787, fake({ served: true, owner: "" }).env); // (Tailscale doesn't say who: the key it is)
  assert.equal(anon.link, `https://mini.tail1234.ts.net:8787/?key=${KEY}`);
  assert.equal(anon.keyed, true);
  const off = share(ctx, 8787, fake({ name: "" }).env);
  assert.equal(off.link, "");
  assert.match(off.tailscale.problem, /isn't connected/);
});

test("tailscale: the companion turned off, its port isn't served any more", () => {
  const t = fake({ served: true });
  assert.equal(tailscaleUnserve(8787, t.env).serving, false);
  assert.ok(t.calls().includes("serve --https=8787 off"));
});
