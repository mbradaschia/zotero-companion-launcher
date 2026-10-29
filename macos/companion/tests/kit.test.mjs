// The companion as the app carries it (scripts/companion-kit.sh → Resources/CompanionKit): the server started from
// that tree as CompanionServer.swift starts it (--exit-with-stdin) answers, serves its page, and stops when the app's
// pipe closes.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MACOS = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("the kit: the server runs from it, and stops with the app", async () => {
  // (through a symlink, as macOS's temporary folders are: /var is /private/var)
  const real = mkdtempSync(join(tmpdir(), "companion-kit-"));
  const linked = real + "-link";
  symlinkSync(real, linked);
  const kit = join(linked, "CompanionKit");
  execFileSync(join(MACOS, "scripts", "companion-kit.sh"), [kit]);
  const home = mkdtempSync(join(tmpdir(), "companion-kit-home-"));
  mkdirSync(join(home, ".config", "omarchy"), { recursive: true });
  const p = spawn(process.execPath, [join(kit, "macos", "companion", "server.mjs"), "--port", "0", "--exit-with-stdin"],
    { env: { HOME: home, TMPDIR: join(home, "tmp"), PATH: process.env.PATH }, stdio: ["pipe", "pipe", "pipe"] });
  const exited = new Promise((r) => p.on("exit", r));
  const port = await new Promise((resolve, reject) => {
    let out = "";
    p.stdout.on("data", (d) => {
      out += d;
      const m = /127\.0\.0\.1:(\d+)/.exec(out);
      if (m) resolve(Number(m[1]));
    });
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("exit", (code) => reject(new Error(`it stopped (exit ${code}): ${out}${err}`)));
  });
  try {
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 401);
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type"), /text\/html/);
  } finally {
    p.stdin.end();
  }
  assert.equal(await exited, 0);
});
