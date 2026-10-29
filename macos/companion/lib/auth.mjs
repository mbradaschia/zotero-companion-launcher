// Who may use the companion: requests for its own hosts only, then its key. The server listens on 127.0.0.1 and
// Tailscale serve brings the tailnet to it (design §3), so the host is 127.0.0.1, localhost or the Mac's *.ts.net
// name; anything else is a page in someone's browser pointing a name it controls at this port (DNS rebinding) and
// is refused. The key is made once (32 random bytes) and kept with the companion's settings, readable by you only;
// the link install.sh prints carries it, the page turns it into a cookie and drops it from the address.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, renameSync, chmodSync } from "node:fs";
import { dirname } from "node:path";

export const COOKIE = "zc_key";
export const CHANGE_HEADER = "x-companion"; // a change needs it: no cross-site form or image can send a header

// The companion's own settings file ({ key, hiddenColumns }), never synced: it holds the key. Made (with a new key)
// when missing or unreadable; a file whose key isn't one of ours gets a new key, the rest kept.
export function loadSettings(file, random = randomBytes) {
  let s = null;
  try {
    s = JSON.parse(readFileSync(file, "utf8"));
  } catch { /* none yet, or not JSON: a new one */ }
  if (!s || typeof s !== "object" || Array.isArray(s)) s = {};
  if (!validKey(s.key)) {
    s.key = random(32).toString("base64url");
    saveSettings(file, s);
  }
  return s;
}

export function saveSettings(file, s) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
}

export function validKey(k) {
  return typeof k === "string" && /^[A-Za-z0-9_-]{43}$/.test(k);
}

// The Host header's name (no port, no brackets), lowercased.
export function hostName(host) {
  const h = String(host || "").trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(1, h.indexOf("]") > 0 ? h.indexOf("]") : undefined);
  return h.replace(/:\d+$/, "");
}

export function hostAllowed(host) {
  const h = hostName(host);
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.ts\.net$/.test(h);
}

export function cookieValue(header, name = COOKIE) {
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return "";
}

export function sameKey(given, key) {
  if (!validKey(given) || !validKey(key)) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(key));
}

// The key a request carries: its cookie, else `Authorization: Bearer <key>` (scripts, tests).
export function requestKey(headers) {
  const auth = String(headers.authorization || "");
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return cookieValue(headers.cookie);
}

// The cookie that keeps the key on this device: a year, this host only, never sent cross-site, never read by a script.
export function keyCookie(key, secure) {
  return `${COOKIE}=${key}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}
