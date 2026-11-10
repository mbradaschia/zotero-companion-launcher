// The fold reader's cached model replies, on this machine and, when syncing, in the sync folder.
//
// A reply's file is named by the hash of its question, model and effort (lib/fold.mjs cacheKey), so
// two machines that ask the same thing write the same name with the same answer, and nothing ever
// needs merging. This machine's folder (<runnerState>/fold-reader/<lib>-<KEY>/replies) stays the
// one the run prunes; the shared one (<syncDir>/shared/fold-replies/<lib>-<KEY>) is only added to:
// a reply another machine still uses is never deleted here, and a file Syncthing is still bringing
// is left alone.
import { existsSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "./atomic.mjs";

const PAPER = /^\d+:[A-Z0-9]{8}$/;
const REPLY = /^[0-9a-f]{24}\.json$/;
const PAPER_DIR = /^\d+-[A-Z0-9]{8}$/;

// The shared folder for a paper's replies, or null when not syncing (or the sync folder is missing).
export function sharedRepliesDir(p, paper) {
  if (!PAPER.test(String(paper))) throw new Error("paper must be <library>:<KEY>");
  if (!p || !p.foldReplies || p.readOnly) return null;
  const [lib, key] = String(paper).split(":");
  return join(p.foldReplies, `${lib}-${key}`);
}

function readReply(f) {
  try {
    const rec = JSON.parse(readFileSync(f, "utf8"));
    if (rec && typeof rec === "object" && rec.out && typeof rec.out === "object") return rec;
  } catch { /* not a reply */ }
  return undefined;
}

// { has, read, write, prune } over the two folders. `write` is the run's; `read` also fills in
// whichever folder lacks a reply the other has; `has` (the plan's) changes nothing.
export function replyStore(local, shared, write = writeAtomic) {
  const at = (dir, key) => join(dir, key + ".json");
  const copy = (dir, key, rec) => { try { write(at(dir, key), JSON.stringify(rec)); } catch { /* a cache: the next run tries again */ } };
  const fromLocal = (key) => {
    const f = at(local, key);
    if (!existsSync(f)) return null;
    const rec = readReply(f);
    if (rec) return rec;
    try { unlinkSync(f); } catch { /* gone */ }
    return null;
  };
  // (a shared file that doesn't read is left: half-synced, or another version's; this machine asks again)
  const fromShared = (key) => (shared && existsSync(at(shared, key)) ? readReply(at(shared, key)) || null : null);
  return {
    has: (key) => !!(fromLocal(key) || fromShared(key)),
    read: (key) => {
      const mine = fromLocal(key);
      if (mine) {
        if (shared && !existsSync(at(shared, key))) copy(shared, key, mine);
        return mine;
      }
      const theirs = fromShared(key);
      if (theirs) copy(local, key, theirs);
      return theirs;
    },
    write: (key, rec) => {
      write(at(local, key), JSON.stringify(rec));
      if (shared) copy(shared, key, rec);
    },
    prune: (used) => {
      try { for (const f of readdirSync(local)) if (REPLY.test(f) && !used.has(f.slice(0, 24))) unlinkSync(join(local, f)); } catch { /* none */ }
    },
  };
}

// Every paper's replies folded on this machine before syncing (or before 0.3.2) that the shared
// folder lacks, copied there once: the other machine then folds those papers without asking.
// Returns how many were copied.
export function shareEarlier(state, sharedRoot, write = writeAtomic) {
  if (!sharedRoot) return 0;
  let n = 0;
  let papers = [];
  try { papers = readdirSync(join(state, "fold-reader")).filter((d) => PAPER_DIR.test(d)); } catch { return 0; }
  for (const d of papers) {
    const dir = join(state, "fold-reader", d, "replies");
    let files = [];
    try { files = readdirSync(dir).filter((f) => REPLY.test(f)); } catch { continue; }
    for (const f of files) {
      const to = join(sharedRoot, d, f);
      if (existsSync(to)) continue;
      const rec = readReply(join(dir, f));
      if (!rec) continue;
      try { write(to, JSON.stringify(rec)); n++; } catch { return n; }
    }
  }
  return n;
}
