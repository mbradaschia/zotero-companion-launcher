// The packages npm left out: the lockfile's optional packages built for this machine (the
// Claude and Codex binaries, ~80 MB each) that aren't in node_modules. npm ci drops an optional
// package whose download failed and still says it installed; install-runner.sh asks this after
// it, then tries again. Needs no packages (it runs where they may be missing).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The C library a Linux binary needs: glibc unless Node's report says otherwise.
export function libc(platform = process.platform) {
  if (platform !== "linux") return "";
  return process.report?.getReport?.().header?.glibcVersionRuntime ? "glibc" : "musl";
}

const fits = (list, value) => !list || list.includes(value) || (list.every((v) => v.startsWith("!")) && !list.includes("!" + value));

// lock (package-lock.json, parsed), have (a node_modules path → whether it's there) → the names
// of the missing ones.
export function missingNative(lock, have, { platform = process.platform, arch = process.arch, c = libc(platform) } = {}) {
  return Object.entries(lock.packages || {})
    .filter(([path, p]) => path && p.optional && !p.dev && (p.os || p.cpu || p.libc))
    .filter(([, p]) => fits(p.os, platform) && fits(p.cpu, arch) && (!p.libc || !c || fits(p.libc, c)))
    .filter(([path]) => !have(path))
    .map(([path]) => path.replace(/^.*node_modules\//, ""));
}

// dir (the runner's) → the missing ones.
export function missingIn(dir) {
  const lock = JSON.parse(readFileSync(join(dir, "package-lock.json"), "utf8"));
  return missingNative(lock, (path) => existsSync(join(dir, path, "package.json")));
}
