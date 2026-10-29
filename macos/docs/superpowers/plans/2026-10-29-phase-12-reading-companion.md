# Phase 12: the reading companion (plan)

The design: `../specs/2026-10-29-phase-12-reading-companion-design.md`. One PR; each step has its tests first.

1. **The server's frame** (`macos/companion/server.mjs`, `lib/http.mjs`, `lib/auth.mjs`): Node's `http` on
   127.0.0.1, the host check, the key (made once, `<config>/companion.json`, mode 600), the cookie from `?key=`,
   `X-Companion: 1` on changes, JSON answers and errors, the static page with its cache headers.
   Tests: auth.test.mjs.
2. **What it reads and writes** (`lib/context.mjs`): the Mac app's JavaScript (Glue, Client, Todos, ReviewCore) in
   place, the paths and settings (the runner's `paths.mjs`), the bridge (the runner's `bridge.mjs`), the runner
   (`lib/runner.mjs`: the installed command, the clean environment, run and wait / start and leave / stream lines).
   All injected, so tests swap the bridge, the runner and the clock.
3. **The API** (`lib/api.mjs`): health; search and recent; a paper (its row, details, status, task, taxonomies,
   suggestions, counts); status; task; tasks (list, add, done); notes (list, one, new, cite); chats (list, one, a
   turn streamed as server-sent events); prompts (list with last run, run, running); tags (add, remove, decide,
   classify); columns (all with values and states, the shown ones saved, a cell edited, an AI cell run).
   Tests: api.test.mjs with a fake bridge and a fake runner in a temporary HOME and sync folder.
4. **The page** (`web/`): index.html, app.css (the mockup's look, the Mac app's pill kinds and colour-blind safe
   colours), app.js (state, fetch, the six tabs, the chooser, the stream), manifest and icon for the home screen.
   Tests: browser.test.mjs (Playwright where a browser is installed).
5. **Run with the app** (changed 2026-10-29 from an install script and a LaunchAgent): `scripts/companion-kit.sh`
   (the build's CompanionKit phase), `CompanionServer.swift` (start with the app, restart, stop; the menu bar's
   Reading Companion menu), `lib/tailscale.mjs` and `server.mjs --share` (serve on the tailnet, the link as a QR code).
   Tests: kit.test.mjs (the server from the kit, stopped when stdin closes), tailscale.test.mjs (a fake `tailscale`).
6. **CI**: the js job runs `node --test companion/tests/*.test.mjs`. Docs: macos/README (the companion), CHANGELOG.
7. **Reviews**: the code review, the UX consistency review, a fix pass. Then the PR.
