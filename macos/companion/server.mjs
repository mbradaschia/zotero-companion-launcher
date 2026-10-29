#!/usr/bin/env node
// The reading companion's server (design §2): the page (web/) and its API (lib/api.mjs) on 127.0.0.1 only; Tailscale
// serve brings your tailnet to it with HTTPS. Each request: its host (lib/auth.mjs), then for the API its key (the
// cookie the link set, or a Bearer header) and, for a change, the X-Companion header. A chat turn streams as
// server-sent events. The log says what was asked (method, path, status), never what's in the library.
//
// The Mac app starts it while it runs (CompanionServer.swift) with --exit-with-stdin: the app gone, its pipe closes
// and the server stops (a crashed app leaves no server holding the port).
//
//   node server.mjs [--port 8787] [--exit-with-stdin]   serve
//   node server.mjs --share [--port 8787]                Tailscale serves it on your tailnet; prints { link, local, tailscale }
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeContext, Refused } from "./lib/context.mjs";
import { ROUTES } from "./lib/api.mjs";
import { hostAllowed, hostName, requestKey, sameKey, keyCookie, CHANGE_HEADER } from "./lib/auth.mjs";
import { tailscaleServe } from "./lib/tailscale.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PORT = 8787;
const BODY_LIMIT = 2 * 1024 * 1024;

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };

// Every answer: no framing, no sniffing, no referrer; the page runs its own script only (a note's HTML can't run any).
const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; " +
    "frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

function send(res, status, body, headers = {}) {
  const json = typeof body !== "string" && !Buffer.isBuffer(body);
  const data = json ? JSON.stringify(body) : body;
  res.writeHead(status, Object.assign({}, SECURITY, json ? { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } : {}, headers));
  res.end(data);
}

const problem = (res, status, code, message) => send(res, status, { error: { code, message } });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        reject(new Refused("That's too much to send at once", 413, "too-large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text.trim()) return resolve({});
      try {
        const v = JSON.parse(text);
        resolve(v && typeof v === "object" && !Array.isArray(v) ? v : {});
      } catch {
        reject(new Refused("not JSON", 400, "bad-json"));
      }
    });
    req.on("error", reject);
  });
}

// A chat turn: each line the runner writes, as an event; a comment now and then keeps proxies from closing it.
async function stream(res, run) {
  res.writeHead(200, Object.assign({}, SECURITY, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" }));
  let open = true;
  res.on("close", () => { open = false; });
  const write = (s) => { if (open) res.write(s); };
  const beat = setInterval(() => write(": still here\n\n"), 15000);
  try {
    await run((line) => write("data: " + String(line).replace(/\n/g, " ") + "\n\n"));
  } catch (e) {
    write("data: " + JSON.stringify({ type: "error", message: e.message }) + "\n\n");
  } finally {
    clearInterval(beat);
    write("event: end\ndata: {}\n\n");
    if (open) res.end();
  }
}

// The page's one library, the Mac app's own copy (marked, MIT: js/vendor), served from where it is.
const VENDOR = { "/vendor/marked.umd.js": join(HERE, "..", "js", "vendor", "marked.umd.js") };

async function serveStatic(res, webDir, pathname) {
  if (VENDOR[pathname]) {
    try {
      return send(res, 200, await readFile(VENDOR[pathname]), { "Content-Type": TYPES[".js"], "Cache-Control": "no-cache" });
    } catch {
      return problem(res, 404, "not-found", "not here");
    }
  }
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = normalize(join(webDir, rel));
  if (!file.startsWith(webDir + "/") || rel.split("/").some((p) => p.startsWith("."))) return problem(res, 404, "not-found", "not here");
  let data;
  try {
    data = await readFile(file);
  } catch {
    return problem(res, 404, "not-found", "not here");
  }
  send(res, 200, data, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
}

// The server: { ctx } the context (tests give their own), { webDir } the page, { log } a line per request.
export function makeServer({ ctx = makeContext(), webDir = join(HERE, "web"), log = () => {} } = {}) {
  const failures = []; // wrong keys in the last minute: ten, and the key isn't checked for a while

  const tooMany = () => {
    const now = Date.now();
    while (failures.length && now - failures[0] > 60000) failures.shift();
    return failures.length >= 10;
  };

  return createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const route = `${req.method} ${url.pathname}`;
    res.on("finish", () => log(`${req.method} ${url.pathname} ${res.statusCode}`));
    try {
      if (!hostAllowed(req.headers.host)) return problem(res, 421, "bad-host", "not this companion's address");
      const secure = /\.ts\.net$/.test(hostName(req.headers.host));
      const key = ctx.companion().key;

      // The link install.sh printed: its key becomes this device's cookie, and leaves the address.
      if (req.method === "GET" && url.searchParams.has("key")) {
        if (tooMany()) return problem(res, 429, "slow-down", "Too many wrong keys: wait a minute");
        if (!sameKey(url.searchParams.get("key"), key)) {
          failures.push(Date.now());
          return send(res, 401, "That link's key isn't this companion's: open the link install.sh printed on the Mac mini.\n", { "Content-Type": "text/plain; charset=utf-8" });
        }
        url.searchParams.delete("key");
        return send(res, 303, "", { Location: url.pathname + (url.search || ""), "Set-Cookie": keyCookie(key, secure), "Cache-Control": "no-store" });
      }

      if (!url.pathname.startsWith("/api/")) {
        if (req.method !== "GET" && req.method !== "HEAD") return problem(res, 405, "method", "not here");
        return serveStatic(res, webDir, url.pathname);
      }

      const isChange = req.method !== "GET";
      if (isChange) {
        if (req.headers[CHANGE_HEADER] !== "1") return problem(res, 403, "no-header", "a change needs the companion's header");
        const origin = req.headers.origin;
        if (origin && origin !== "null") {
          let o = "";
          try { o = new URL(origin).host; } catch { /* not an address */ }
          if (o.toLowerCase() !== String(req.headers.host || "").toLowerCase()) return problem(res, 403, "bad-origin", "not from this companion's page");
        }
      }

      // The page's key, typed in (a home screen app that didn't keep Safari's cookie).
      if (route === "POST /api/login") {
        if (tooMany()) return problem(res, 429, "slow-down", "Too many wrong keys: wait a minute");
        const body = await readBody(req);
        if (!sameKey(String(body.key || "").trim(), key)) {
          failures.push(Date.now());
          return problem(res, 401, "bad-key", "That isn't this companion's key");
        }
        return send(res, 200, { ok: true }, { "Set-Cookie": keyCookie(key, secure) });
      }

      if (!sameKey(requestKey(req.headers), key)) return problem(res, 401, "no-key", "Open the link install.sh printed on the Mac mini, or type its key");

      const handler = ROUTES[route];
      if (!handler) return problem(res, 404, "not-found", "no such request");
      const body = isChange ? await readBody(req) : {};
      const query = Object.fromEntries(url.searchParams);
      const answer = await handler(ctx, { query, body });
      if (answer && typeof answer.stream === "function") return stream(res, answer.stream);
      send(res, 200, answer);
    } catch (e) {
      if (res.headersSent) return res.end();
      if (e instanceof Refused) return problem(res, e.status, e.code, e.message);
      problem(res, 502, e.code || "failed", e.message || "it didn't work");
    }
  });
}

function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function linkOf(key, { host = "", port = DEFAULT_PORT } = {}) {
  return host ? `https://${host}:${port}/?key=${key}` : `http://127.0.0.1:${port}/?key=${key}`;
}

// The link for your iPad: Tailscale serving the companion on your tailnet (turned on here if it isn't), its key in it.
export function share(ctx, port, env = process.env) {
  const key = ctx.companion().key;
  const tailscale = tailscaleServe(port, env);
  return { link: tailscale.serving ? linkOf(key, { host: tailscale.name, port }) : "", local: linkOf(key, { port }), tailscale };
}

async function main(argv) {
  const port = Number(arg(argv, "--port") || process.env.OMA_ZOTERO_COMPANION_PORT || DEFAULT_PORT);
  const ctx = makeContext();
  if (argv.includes("--share")) {
    process.stdout.write(JSON.stringify(share(ctx, port)) + "\n");
    return;
  }
  const server = makeServer({ ctx, log: (line) => process.stdout.write(new Date().toISOString() + " " + line + "\n") });
  server.on("error", (e) => {
    process.stderr.write(e.code === "EADDRINUSE" ? `port ${port} is in use (another reading companion?)\n` : `server: ${e.message}\n`);
    process.exit(3);
  });
  server.listen(port, "127.0.0.1", () => process.stdout.write(`reading companion on http://127.0.0.1:${server.address().port}\n`));
  const stop = () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  if (argv.includes("--exit-with-stdin")) {
    process.stdin.on("end", stop).on("close", stop).on("error", stop).resume();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) main(process.argv.slice(2));
