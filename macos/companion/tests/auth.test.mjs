// Who may use the companion (lib/auth.mjs, server.mjs): its own hosts only, then its key; a change needs the
// companion's header and its own origin; the link's key becomes an HttpOnly cookie and leaves the address.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validKey, hostAllowed, hostName, cookieValue, sameKey, requestKey, keyCookie, loadSettings } from "../lib/auth.mjs";
import { startServer, api, raw, KEY } from "./helpers.mjs";

test("hosts: 127.0.0.1, localhost, ::1 and a tailnet name; nothing else", () => {
  for (const h of ["127.0.0.1:8787", "localhost", "[::1]:8787", "mini.tail1234.ts.net", "MINI.tail1234.TS.NET:443"]) assert.ok(hostAllowed(h), h);
  for (const h of ["", "evil.com", "ts.net", "mini.ts.net.evil.com", "192.168.1.5:8787", "127.0.0.1.nip.io", "a_b.ts.net"]) assert.ok(!hostAllowed(h), h);
  assert.equal(hostName("[::1]:8787"), "::1");
});

test("the key: 43 base64url characters, compared in constant time; from the cookie or a Bearer header", () => {
  assert.ok(validKey(KEY));
  assert.ok(!validKey("short") && !validKey(KEY + "=") && !validKey(null));
  assert.ok(sameKey(KEY, KEY) && !sameKey("j".repeat(43), KEY) && !sameKey("", KEY));
  assert.equal(cookieValue("a=1; zc_key=" + KEY + "; b=2"), KEY);
  assert.equal(requestKey({ authorization: "Bearer " + KEY }), KEY);
  assert.equal(requestKey({ cookie: "zc_key=" + KEY }), KEY);
  assert.match(keyCookie(KEY, true), /HttpOnly; SameSite=Strict; Secure$/);
  assert.doesNotMatch(keyCookie(KEY, false), /Secure/);
});

test("the companion's settings: a key made once, readable by you only; the rest kept", () => {
  const dir = mkdtempSync(join(tmpdir(), "companion-auth-"));
  const file = join(dir, "sub", "companion.json");
  const s = loadSettings(file);
  assert.ok(validKey(s.key));
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(loadSettings(file).key, s.key);
  mkdirSync(join(dir, "b"));
  writeFileSync(join(dir, "b", "companion.json"), JSON.stringify({ key: "bad", hiddenColumns: ["year"] }));
  const t = loadSettings(join(dir, "b", "companion.json"));
  assert.ok(validKey(t.key));
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "b", "companion.json"), "utf8")).hiddenColumns, ["year"]);
});

test("server: another host is refused before anything else", async () => {
  const s = await startServer();
  try {
    const r = await raw(s.base, "/api/settings", { Host: "evil.example", Cookie: "zc_key=" + KEY });
    assert.equal(r.status, 421);
    assert.equal((await raw(s.base, "/api/settings", { Host: "mini.tail1234.ts.net", Cookie: "zc_key=" + KEY })).status, 200);
  } finally { await s.close(); }
});

test("server: the API needs the key; the page itself doesn't", async () => {
  const web = mkdtempSync(join(tmpdir(), "companion-web-"));
  writeFileSync(join(web, "index.html"), "<!doctype html><title>t</title>");
  const s = await startServer({ webDir: web });
  try {
    const none = await fetch(s.base + "/api/settings");
    assert.equal(none.status, 401);
    assert.equal((await none.json()).error.code, "no-key");
    const wrong = await fetch(s.base + "/api/settings", { headers: { Cookie: "zc_key=" + "j".repeat(43) } });
    assert.equal(wrong.status, 401);
    assert.equal((await api(s.base, "/api/settings")).status, 200);
    assert.equal((await fetch(s.base + "/api/settings", { headers: { Authorization: "Bearer " + KEY } })).status, 200);
    const page = await fetch(s.base + "/");
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy"), /script-src 'self'/);
    assert.equal(page.headers.get("x-frame-options"), "DENY");
    assert.equal((await fetch(s.base + "/..%2f..%2fetc/passwd")).status, 404);
    assert.equal((await fetch(s.base + "/.hidden")).status, 404);
  } finally { await s.close(); }
});

test("server: the link's key becomes a cookie and leaves the address; a wrong one doesn't", async () => {
  const s = await startServer();
  try {
    const ok = await fetch(s.base + "/?key=" + KEY, { redirect: "manual" });
    assert.equal(ok.status, 303);
    assert.equal(ok.headers.get("location"), "/");
    assert.match(ok.headers.get("set-cookie"), new RegExp("^zc_key=" + KEY + "; Path=/; Max-Age=\\d+; HttpOnly; SameSite=Strict$"));
    const ts = await raw(s.base, "/?key=" + KEY, { Host: "mini.tail1234.ts.net" });
    assert.match(ts.headers["set-cookie"][0], /; Secure$/);
    const bad = await fetch(s.base + "/?key=" + "j".repeat(43), { redirect: "manual" });
    assert.equal(bad.status, 401);
    assert.equal(bad.headers.get("set-cookie"), null);
  } finally { await s.close(); }
});

test("server: a change needs the companion's header and its own origin", async () => {
  const s = await startServer();
  try {
    const body = { id: "1:AAAA1111", status: "reading" };
    assert.equal((await api(s.base, "/api/status", { body, headers: { "X-Companion": "" } })).status, 403);
    assert.equal((await api(s.base, "/api/status", { body, headers: { Origin: "https://evil.example" } })).status, 403);
    assert.equal((await api(s.base, "/api/status", { body, headers: { Origin: s.base } })).status, 200);
    const notJson = await fetch(s.base + "/api/status", { method: "POST", headers: { Cookie: "zc_key=" + KEY, "X-Companion": "1" }, body: "{not json" });
    assert.equal(notJson.status, 400);
    assert.equal((await notJson.json()).error.code, "bad-json");
  } finally { await s.close(); }
});

test("server: the key typed in sets the cookie; ten wrong ones and it waits", async () => {
  const s = await startServer();
  try {
    const post = (key) => fetch(s.base + "/api/login", { method: "POST", headers: { "X-Companion": "1", "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
    const ok = await post(KEY);
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get("set-cookie"), /^zc_key=/);
    for (let i = 0; i < 10; i++) assert.equal((await post("j".repeat(43))).status, 401);
    assert.equal((await post(KEY)).status, 429);
  } finally { await s.close(); }
});
