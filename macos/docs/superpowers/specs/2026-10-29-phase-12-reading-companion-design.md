# Phase 12: the reading companion (design)

A web app the Mac mini serves to the iPad over Tailscale, kept in Split View beside Zotero iOS while you read. It is
the approved mockup (*iPad reading companion mockups* artifact, option A: live from the Mac mini) built on what the
Mac app already has: the bridge, the prompt runner, the sync folder and the app's own JavaScript (Glue, lib/,
ReviewCore). No Apple Developer Program, no App Store: Safari, *Add to Home Screen*.

## 1. What it does

The page keeps the Mac app's UI language (the UX consistency review, 2026-10-29): the same words, pill kinds and
their icons (ReviewGrid's `ICONS`, path for path, `tests/icons.test.mjs`), statuses as you named them, the Mac's
sentences for the AI features missing, the sync folder away and a bridge failure, and the serving Mac by its name.

- **Pick a paper:** the recent papers before you type, the library's search as you type (the bridge's `/search`).
  Each row: its status, its default task and its rankings (★ and the rank colour for a top one only). The choice is
  remembered on the device.
- **The paper's card:** title; authors, year, publication; a chevron folds everything below the authors line.
  Open: the ranking pills, the taxonomy strip (a caption, each taxonomy's name before its label pills), the footer
  pills as `Views.paperFooter` words them (*✓ text extracted* / *text not extracted* / *no PDF*; *✓ taxonomies: N
  labels*, *⚠ taxonomies: not tagged*, *⚠ taxonomies: update needed (…)*); **Status** (None and your paper
  statuses; none set up: *No paper statuses: add some in Settings › Paper status*) and **Task** (None and your
  task statuses) as buttons. Folded: the status and task pills, a tap opens the card. A read-only library says so
  and its buttons are off.
- **Six tabs, icons only** (VoiceOver and hover labels), Notes and Tasks with a count badge:
  1. **Chat:** the paper's latest chat, the others to pick, *New chat*; a question streams its answer (`chat`, JSON
     lines relayed as server-sent events; a run that stops says why). The answer's Markdown goes through
     `safeMarkdown` and an allowlist rebuild, as the Mac app's chat.
  2. **Notes:** your notes on the paper, without the extracted text, in your order (`Glue.ownNotes`, view.json's
     `noteOrder`); one opens in place; *Copy with its bibliography entry*; *New note* (Markdown, the runner's
     `note`); *Open in Zotero* (your own library's): Zotero edits notes, the bridge has no note update yet.
  3. **Prompts:** your saved prompts (`list --json`), each with its output (a Zotero note: when it last ran on this
     paper, from `/notes/by-prompt`; another output: its kind), *Run* / *Run again* (`run <id> --key`, started and
     left; *Started: “X” on this paper (in Processes on “mini”)*, then *“X” is done: …*); the classify button.
  4. **Tasks:** the paper's tasks from `todos.json` (open first), a checkbox each, a field to add one.
  5. **Taxonomies and tags:** each taxonomy by its name and kind (*unique (one label per paper)*, *several labels
     per paper*) with its labels as pills, *No label* when none, its suggestions with *Tag it* / *Dismiss it*
     (`classify-decide`); *Tag by taxonomies* / *Tag again by taxonomies(: out of date)* / *Tagging by
     taxonomies…*; your other tags, *Add tag*, and removing one. The taxonomies that can't be read say so (*Couldn't
     read your taxonomies: why*), and the last list read still keeps their labels out of the plain tags.
  6. **Columns:** the paper's review-table columns as rows, grouped as the table's, values drawn as the table draws
     them (status, task, top rankings, taxonomy labels and choices as pills of their kind; an AI cell's state as ●,
     ✎ or ⚠ with its name). *Columns* opens one list (the shown ones, then *Not shown*), each with its kind's icon.
     An AI column has *Run* / *Run again* (one cell, the button at *Running* until it ends) and *Edit* when its
     shape is text; your own columns have *Edit*. Status and Task rows lead to the card's buttons.
- **Health:** the header's pill says *“mini”, live* when Zotero, the sync folder and the runner are there, else how
  many problems, a tap listing them. With the AI features missing, Chat, Prompts, tagging and an AI column's Run say
  *X needs the AI features: Settings › Setup installs them* in place and are off.

## 2. How it fits

```
iPad Safari ──HTTPS (Tailscale serve)──▶ Mac mini 127.0.0.1:8787  macos/companion/server.mjs
                                          ├─ the bridge (127.0.0.1, handshake)       search, item, notes, tags, cite
                                          ├─ oma-zotero-prompt (spawned)             chats, prompts, taxonomies, notes, review-run
                                          ├─ the sync folder (contracts/Paths.js)    todos.json, reviews/
                                          └─ Glue.js + lib/ + ReviewCore + Merge     statuses, tasks, columns: the Mac app's code
```

- **`macos/companion/`**: `server.mjs` (Node 22, no packages), `lib/` (the API, the runner, auth, files), `web/`
  (one page, plain ES modules, no build), `tests/`. It reads the Mac app's JavaScript in place
  (`ZoteroLauncher/Core/Glue.js` requires its modules relative to itself), so every rule (status tags, the default
  task, `t/` task tags, Merge's tombstones, a review cell) is the Mac app's own code, not a copy.
- **Writes are the Mac app's:** `todos.json` re-read, changed through Glue (`setDefaultTasks`, `addTodo`,
  `toggleDone`), stamped (`Merge.stamp`), written atomically, then its `t/` tag changes sent to the bridge; a status
  change removes the old `s/` tag and any other status tag and adds the new one. Refused while the sync folder is
  unavailable (`Paths.resolve`'s `readOnly`), as the app refuses. A cell edit: `ReviewCore.setCell` on the column's
  cells file, by `you`.
- **The runner** is the installed `oma-zotero-prompt` (`~/.local/bin`), started with the Mac app's clean
  environment (HOME, XDG, TMPDIR, LANG, the API key variables) and a PATH with Node's folder and Homebrew's.

## 3. Reaching it, and who can

- The server listens on **127.0.0.1 only**. `tailscale serve` publishes it to your tailnet over HTTPS on the
  companion's own port (`https://<mac>.<tailnet>.ts.net:8787`, so whatever you serve on 443 stays), so nothing is
  open on the LAN or the internet and Safari gets a real certificate (needed for the home-screen app). Tailnet
  only, never Funnel.
- **A key on top of Tailscale:** the first start makes a random 32-byte key (`<config>/companion.json`, mode 600).
  Reading Companion › Show the iPad Link shows the link with it (a QR code, and Copy); opening it sets an `HttpOnly; Secure; SameSite=Strict` cookie and
  drops the key from the address. Every `/api/` call needs the cookie (or `Authorization: Bearer`); a change also
  needs `X-Companion: 1` (no cross-site form can send it) and, when the browser says, its own origin. A home-screen
  app that didn't keep Safari's cookie asks for the key once (`POST /api/login`; ten wrong keys a minute from one
  address and guessing waits there; the right key always opens).
- **Host check:** only `127.0.0.1`, `localhost` and `*.ts.net` hosts are served (no DNS rebinding).
- Nothing from the library is logged; the server's log says what was called and how long it took.

## 4. Running it (on the Mac mini)

**The Mac app runs it** (Marcelo, 2026-10-29: "the server should run when the app is loaded"). The build lays out
`Resources/CompanionKit` with `scripts/companion-kit.sh` (the companion, `js/lib`, `js/vendor`, the Glue files,
ReviewCore, the runner's `paths`/`bridge`/`atomic`, `contracts/Paths.js` and `Merge.js`, in this checkout's tree so
every relative require resolves). `CompanionServer.swift` starts `node server.mjs --port 8787 --exit-with-stdin`
when the app launches, with the runner's environment (Node 22 found as the runner finds it; the app's `TMPDIR`, so
Zotero's handshake is found), restarts it if it stops (three tries, longer waits), and stops it when the app quits;
the app gone any other way, the server's stdin closes and it stops too. The menu bar's **Reading Companion** menu
shows its state, **Show the iPad Link…** (runs `server.mjs --share`: `tailscale serve --bg --https=8787` if it
isn't served yet, then the link as a QR code and Copy), and **Run It With the App** (on by default; turned off, the
server stops and `server.mjs --unshare` takes the port off Tailscale). Nothing to
install beyond the app; it needs Node (Settings › Setup), the AI features for chat and prompts, and Zotero with the
bridge. By hand (a checkout): `node macos/companion/server.mjs`.

## 5. Not in this phase

The Zotero Web API path (option B), working while the Mac mini sleeps, editing a note's text in place (a new
bridge route), artifacts, the review table's grid, settings beyond the shown columns, push notifications.

## 6. Tests

- `tests/*.test.mjs` (`node --test`, in the Mac workflow's js job): auth and host checks; the API against a fake
  bridge (an HTTP server and its handshake in a temporary TMPDIR) and a fake runner (a script answering the
  commands), a temporary HOME and sync folder: search, a paper, status (tags sent), task (todos.json and `t/`
  tags), tasks added and done, a chat streamed, a prompt started, a suggestion decided, columns and a cell edited,
  writes refused while the sync folder is missing.
- `tests/browser.test.mjs` (Playwright, run where a browser is installed): the page at iPad Split View size, a
  paper picked, status and task changed, every tab opened, the column chooser, a chat answer streamed.
- Then the code review and the UX consistency review (`.claude/agents/ux-consistency-reviewer.md`), and a fix pass.
