// A problem every paper would meet (the AI signed out, a refused key, out of credit, overloaded, not set up, no
// network), told from a job's error message: a batch stops at the first one instead of failing paper by paper. The
// Mac app's copy of the runner is checked against its own reading of the same patterns. Pure (node-tested).
// → "" (this paper's own problem: the next one may work), or the kind.
export const FATAL_PATTERNS = [
  ["key", /api key was refused|key isn't accepted|incorrect api key|invalid x-api-key|Jev refused \((401|403)\)/i],
  ["signin", /\/login|not logged in|logged out|log in again|codex login|oauth token|token (has )?expired|authentication_error|failed to authenticate|invalid api key|invalid bearer|unauthori[sz]ed|\b401\b/i],
  ["limit", /credit|insufficient_quota|quota|billing|usage limit|limit reached|hit your limit|rate.?limit|too many requests|\b429\b/i],
  ["busy", /overloaded|\b529\b/i],
  ["setup", /no AI model is set up|no default model yet|there is no default model|no API key|isn't installed|aren't installed|reinstall the AI features/i],
  ["network", /can't reach|couldn't reach|isn't answering at|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|getaddrinfo|fetch failed|connection error|network|socket hang up|unable to connect|offline/i],
];

// (Zotero away isn't one: what waits for Zotero goes on when it's back)
export function fatalKind(message) {
  const text = String(message || "");
  const hit = text.trim() && !/zotero/i.test(text) && FATAL_PATTERNS.find(([, re]) => re.test(text));
  return hit ? hit[0] : "";
}
