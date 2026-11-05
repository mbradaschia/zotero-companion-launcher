# Bringing the Mac app's features to the Omarchy launcher

Status: plan, 2026-11-05. Asked by Marcelo: "migrate all features we added to the mac app to [Omarchy]".
Validated against the code on 2026-11-05 (section 8); changed rows say so.

The two launchers were at parity at `macos-v0.3.0` (2026-10-14: all 166 rows of `macos/PLAN.md`). Since then the
Mac app shipped 0.3.1 to 0.4.32 (PRs #18 to #82) while the Omarchy machine was broken, and the QML was last changed
on 2026-10-29 (one commit) before this port started. This plan lists every Mac feature added after 0.3.0, says
whether Omarchy has it, how it maps to Linux/Hyprland, and in what order to build it.

Sources read: `CHANGELOG.md` (Mac sections 0.3.1 to 0.4.32), `macos/docs/releases/`, git history since `3c3a0d6`,
`diff -r lib macos/js/lib` (identical), `diff -r daemon macos/runner` (393 lines + 2 new files at `9271775`; since
`cc0be82` only `lib/paths.mjs` and the version), the QML, and the project notes on review tables, themes, drag-out,
the UX critique and the companion.

## 1. Principles

1. **Shared code first.** Where a Mac feature's logic lives in Swift, move it into `lib/` (pure JS, tested by
   `make test`) and have the QML call it, so both launchers share one behaviour. `lib/` and `macos/js/lib/` are
   byte-identical today; keep them that way (copy root to `macos/js/lib` in the same PR). (validation: added) Much of
   that logic is already JavaScript, in the Mac-only `macos/ZoteroLauncher/Core/Glue*.js` (arrangement, launch
   catch-up, Processes at once, the fatal-problem check, the review run's job): lift it into `lib/` rather than port
   Swift (D6). A row added to `lib/Settings.js` shows on the Mac too (it renders the same builders), so a row only one
   launcher has needs a flag in `state` (as `machineOnly` and `automation` are passed today).
2. **One runner.** `daemon/` catches up with `macos/runner/` and stays its source; the copy differs only in
   `lib/paths.mjs`, as `macos/VENDORED.md` says.
3. **Web surfaces stay web.** The review table is an HTML/JS page on the Mac (WKWebView). On Linux it runs in a
   Chromium app window served by a local Node server, reusing the same page and `ReviewCore.js` (decision D2 below).
   No rewrite of 2,200 lines of grid in QML. (validation: changed) The docked chat is not web on the Mac: it is the
   native `ChatWindowView` drawn over the page's `#chatslot` (D7).
4. **Colour is never the only sign** (Marcelo is colour-blind): every state has a shape or symbol; pills use the
   colour-blind safe set (status E69F00, priority EE3377, rank 0077BB, taxonomy 33BBEE, task 009988) and their kind
   icon. Consistent icons over text labels.
5. **Mac-only things are dropped or mapped** to Hyprland/Omarchy equivalents (section 5).
6. **Releases batch.** The Omarchy plugin, bridge and runner share one version (`scripts/check-versions.sh`). Phases
   land on master without a bump; one release PR bumps when a phase set is worth installing.
7. **Each phase:** spec in the PR, tests, code review, UX-consistency review (`.claude/agents/ux-consistency-reviewer.md`),
   a fix pass, then an on-device check on Omarchy (Remote Control on the Omarchy machine, or Marcelo).

## 2. Architecture decisions

| # | Decision | Why | Rejected |
|---|---|---|---|
| D1 | `daemon/` takes every runner change from `macos/runner/` (reviews, list chat, `chat --review`, `--source meta`, `review-draft`, stop on SIGTERM, prompt caching). | Everything AI in the review table and list chat needs it; pure Node, fully testable in CI. | Leaving the runners apart (the Omarchy launcher could never run a review). |
| D2 | Review tables on Linux: a Node server started by the Omarchy service (`daemon/bin/oma-zotero-review.mjs` or a `review-serve` runner command) on 127.0.0.1, opened with `omarchy-launch-webapp` / `chromium --app=…`; Hyprland tiles it. `ReviewGrid.js` already sends everything through one `post()` (line 31): add a transport that uses `fetch` + Server-Sent Events when `webkit.messageHandlers` is absent. The Swift message handling (`ReviewWindowModel*.swift`, ~760 lines: layout, cells, columns, run/stop, CSV, chat) is ported to Node, reusing `ReviewCore.js` and the companion's Node context (`macos/companion/lib/context.mjs` already loads `Glue.js` and `ReviewCore` in Node). (validated: changed) Confirmed: `post()` is the only way out (today it pushes to `window.RT_SENT` when `webkit` is absent) and the app only calls in through `RT.load`, `RT.flash`, `RT.segments`, `RT.drafted`, `RT.notes`, `RT.chatList`, `RT.askEach`, `RT.showInfo` (`ReviewWebView.swift` lines 83 to 96); 31 message types. The Swift to port is ~1,290 lines, not ~760: `ReviewWindowModel.swift` 528, `+Chat.swift` 229, `ReviewWindows.swift` 121, `Files/ReviewFiles.swift` 150 (review, columns and cells files, merged by paper), `Launcher/LauncherModel+Reviews.swift` 133 (a list's table, `reviewContext()`, live re-search) and the CSP and theme injection of `ReviewWebView.swift` 131. The companion's `api.mjs` already does in Node what three handlers need (`reviewContext`, `columns`, `setCell`, `runCell` with `Glue.reviewRunJob`), but `context.mjs` requires `Glue.js`, `macos/js/lib` and `macos/runner` by relative path, so it can't be reused as is: lift the pieces (D6). | Reuses the page and its 300+ JS tests; Chromium ships with Omarchy; a tiled window is the Hyprland way. | QtWebEngine inside `omarchy-shell` (heavy, may not be installed, a crash takes the bar down); a QML grid (rewrite of ReviewGrid.js + CSS). |
| D3 | Shared web/JS moves out of `macos/` into a top-level `shared/` folder read in place by both (`ReviewCore.js`, `ReviewGrid.js`, `ReviewGrid.css`, the Node review context). `scripts/check-boundaries.sh` allows root and `macos/` to read `shared/`, as they read `contracts/`. The Xcode project bundles from the new path. (validated: changed) `check-boundaries.sh` already allows it: macOS code may climb out of `macos/` to anything but `lib/`, `daemon/`, `scripts/`, `tests/` and the root QML, and root code is only barred from naming `macos/`; change its header comment and add a `shared/` case to `tests/check-boundaries.test.js`. Move `GlueReviews.js` (47 lines, `reviewRunJob`; needs only ReviewCore) with them, not `Glue.js` (it requires `../../js/lib/*` and the Mac's other Glue modules). Paths to update: `ReviewWebView.swift`, `JSCore.swift`, `Theme.swift`, `ThemeTests.swift`, `Glue.js` line 20, `macos/project.yml` (resources, as `../contracts/*.js` already are), `macos/scripts/review-grid-check.mjs`, `macos/scripts/companion-kit.sh`, `macos/companion/lib/context.mjs`, `macos/js/tests/review-core`, `review-run`, `drag-out`. | The boundary lint forbids the root naming `macos/`; a second copy would drift. | Copying the files into the root (two copies to keep equal). |
| D4 | Themes: the launcher follows Omarchy's theme (`qs.Commons` `Color`), as it does now. No theme picker. The review table page gets its CSS variables from the current Omarchy theme (read `~/.config/omarchy/current/theme`), plus the colour-blind safe pill set. | Omarchy owns theming system-wide; a second picker would fight it. | Porting the Mac's ten themes. |
| D5 | Launcher arrangement (Group / Sort / Order apart, top-level sort, manual order, typed results by relevance) becomes pure functions in `lib/Views.js` with tests; QML and, later, the Mac call them. (validated: changed) The premise was wrong: the logic is already JavaScript in `macos/ZoteroLauncher/Core/Glue.js` lines 25 to 105 (`SORTS`, `TOP_SORTS`, `arrangement()` with the one-time read of the old `grouping`, `arrange()` with Manual, `arrangeTop()`, `sortKey()`), tested by `macos/js/tests/top-sort` and `manual-sort`. `LauncherModel+Arrange.swift` (259 lines) is state, keys and view.json writes. So: move those functions into `lib/Views.js` as they are, port the two tests, make `Glue.js` delegate. | The Mac's version is Swift (`LauncherModel+Arrange.swift`) the QML can't use. | Re-implementing it in QML only. |
| D6 | (validation: added) Lift the portable Mac-only JavaScript into `lib/` before the QML work that needs it: `Glue.js` arrangement (D5); `GlueSettings.js` rows and logic for Processes at once, Ask to catch up when the app opens and What the app checks (`launchCatchUpAsk`, `catchUpPlanArgs`, `catchUpJobs`); `GlueRunner.fatalProblem` (P8); `GlueLists.defaultTasks`/`paperStatusOf` are already thin wrappers of `lib/` calls the server can call directly. Rows only one launcher has stay behind a `state` flag. | One behaviour on both, tested in CI, and the review server and the QML can both call it. The boundary lint forbids the root reading `macos/`. | Porting the same logic a third time into QML. |
| D7 | (validation: added) The review table's chat on Linux is the QML `ChatWindow`, opened tiled beside the table (Hyprland), following the table's selection over the service; a `list` mode (runner `chat --review`, the list from `RT.chatList`) is added to it. Not docked in the page. | On the Mac the docked chat is native (`ReviewWindowModel+Chat.swift` draws `ChatWindowView` over `#chatslot`), so the page has no chat to reuse; the QML chat window already does paper chat, sessions and models. | A web chat in the page (new UI; the companion's `web/app.js` chat is a smaller, touch-first one). |

## 3. Feature inventory

Status on Omarchy: **✓** has it, **◐** partly (logic shared in `lib/` or the runner, QML not wired, or older
behaviour), **✗** missing, **—** Mac-only, mapped or dropped (section 5). Status is from reading the code; the
validation pass checked each row (section 8). Rows it changed say "(validated: changed)"; rows it added say
"(validation: added)".

### 3.1 Launcher: search, lists and arrangement

| # | Feature (Mac version) | Mac implementation | Omarchy | Linux equivalent / work | Phase |
|---|---|---|---|---|---|
| L1 | Group, Sort and Order as three controls; `g` next sort, `G` next grouping; view.json `group`/`sort`/`order` replace `grouping` (0.4.10) | `Glue.js` `arrangement()`/`arrange()` + `LauncherModel+Arrange.swift` state (validated: changed) | ◐ one cycling `grouping` (`cycleGrouping`, `g`/`G`) | lift Glue's functions into lib (D5, D6); header bar with Group ▾ / Sort ▾ / Order, each with its own icon; read old `grouping` once | 2 |
| L2 | Typed search is by relevance only; Group/Sort apply to browsed lists (0.4.17) | Arrange | ✗ QML still arranges typed results | lib + QML | 2 |
| L3 | Top-level Sort/Order before typing (recent, added, modified, year, title, first author); bridge sorts before the limit (0.4.19, bridge 0.2.6) | `Glue.js` `arrangeTop()`, `TOP_SORTS` + bridge `/search` sort | ✗ | view.json `topSort`/`topOrder`; bridge already does it | 2 |
| L4 | Title and first-author sorts in collections/tags/saved searches (0.4.19) | Arrange + bridge | ✗ | same | 2 |
| L5 | Manual sort: ⇧↑↓ and drag move a paper, view.json `paperOrder` per list, merged per list between machines (0.4.17) | `Glue.js` `arrange()` Manual, `contracts/Merge.js` (`paperOrder` already keyed) | ✗ | lib + QML; QML `DragHandler` for reorder; Service.qml keeps unknown view.json keys (`setViewPref` copies them), so the Mac's `paperOrder` survives meanwhile | 2 |
| L6 | Cursor starts on a place typed in full (0.4.17) | Nav | ✓ (17dbee0) | — | — |
| L7 | Typed text clears once a place/setting/saved search/menu row is chosen (0.4.18) | Nav | ✗ | QML | 2 |
| L8 | Paper heading on its own line with the venue (publication) under it (0.4.18) | Menu | ✗ | QML header | 2 |
| L9 | Paper icon solid with a PDF, hollow without, tooltip (0.4.20) | `SearchRow.paperSymbol` | ◐ PDF count glyph | shape-based icon per item type, as the Mac | 2 |
| L10 | Saved searches in the results; settings found from search act (0.3.1/0.3.2) | lib `SETTING_ACTS_FROM_SEARCH` | ✓ (af4315c, both) | — | — |
| L11 | Sort named and both ways (oldest added/changed/published) (0.3.1) | lib | ✓ (ad4a2f0, both) | superseded by L1 | 2 |
| L12 | Breadcrumb above the search box, clickable levels; a long one wraps, ranking pills keep their size (0.3.1, 0.4.1, 0.4.2) | Chrome | ◐ (validated: changed) a one-line context bar names the paper and the submenu (`contextInfo()`, "‹ Authors, Year · Title › Notes"); no levels, not clickable | QML header row | 2 |
| L13 | Submenu arrow `›` on rows that open a list; `window`/`browser`/`editor` hints (0.3.1) | lib + rows | ✓ (both; menu rows draw `›` at `ZoteroSearch.qml` 6598 and `trailing`) | check result rows render it | 2 (check) |
| L14 | Slide between lists, none with reduced motion (0.3.1) | SwiftUI | ✗ (only the opening scale/fade) | QML transition; honour a "reduce motion" setting | 4 |
| L15 | Empty states with a symbol (0.3.1) | SwiftUI | ✓ (validated: changed) `emptyState()` gives icon, title and detail; the Mac took it from Omarchy | — | — |
| L16 | Home/End first/last row (0.3.1) | Keys | ✗ (validated: changed) Home/End move the caret in the search text and scroll the note reader; nothing moves the list's cursor to its first or last row | QML list keys | 2 |
| L17 | `‹` beside the search box goes back on click (0.3.1) | Chrome | ✗ (the context bar's `‹` has no MouseArea) | QML | 4 |
| L18 | Status over default task on each row, ⌥→← / ⇧⌥→← (0.4.3) | Rows | ✓ (Omarchy had it first) | — | — |
| L19 | Picking a paper keeps badges and sort (0.4.3) | Nav | ✗ (validated: changed) while picking (`pickFor`), `atRoot` is false, so the badges hide, `searchScope()` ignores the active search and `g`/`G` are off (line 2007) | QML | 2 |
| L20 | Launcher reopens where you left it after a restart (view, paper, scope, search, row) (0.4.5) | `AppStore` persisted | ✗ (survives within a shell run only) | persist to `$XDG_STATE_HOME/oma-zotero/last-view.json` on close; restore on first open | 2 |
| L21 | Compact rows, pills wrap, taxonomy name beside first label (0.3.4) | SwiftUI | ◐ | QML check | 4 |
| L22 | Calmer footers: going back, `/ search`, `? keys` and four keys (`FitHints.most = 6`); hints wrap onto a second line (0.4.17, 0.4.1) | `FitHints.swift` (a port of lib's `fitHints`) | ◐ (validated: changed) the QML already fits hints with `Views.hintParts`/`Views.fitHints` (line 6832), one line, no cap | add `most` and `lines` to `Views.fitHints`; QML passes 6 and 2 | 4 |
| L23 | `⌘T table` hint and a table button beside the pin (0.4.10) | Hints | ✗ | `Ctrl+T` (Super-free) hint + header button, after phase 3 | 3 |

### 3.2 Paper menu, notes and keys

| # | Feature | Mac | Omarchy | Linux / work | Phase |
|---|---|---|---|---|---|
| N1 | Notes view shows status and default task pills with kind icons, `no status`/`no task` placeholders; ⌥→← there too (0.4.27) | Notes | ◐ (validated: changed) the status strip shows in the notes list and the reader (`headerStatus` covers `notes`, `note`); ⌥→← works in the menu and the reader, not the notes list (`statusTarget()`); no task pill, no placeholders | QML notes list + reader | 2 |
| N2 | A paper's menu lists a new note at once (prompt finished, chat saved, launcher refocused) (0.4.27) | `cameBack()` | ◐ (validated: changed) a process on the paper finishing re-reads it in `actions`/`notes` (`onTasksChanged`), and reopening re-reads it (`resume()`); a chat window's save and the `prompts` view don't | refresh on chat save and in the `prompts` view; keep the cursor on its row | 2 |
| N3 | `i`/`r` cite under a paper's menu and in a note (0.3.5) | Keys | ✓ (validated: changed) `citeTarget()` covers the menu, its submenus and the reader's paper; the Mac fixed its own copy | — | — |
| N4 | `P` leaves the highlight where you were (0.3.5) | Arrange | ✗ (validated: changed) `toggleMenuOther()` selects the moved row, so the highlight jumps to Other at the bottom | select the row that was below | 2 |
| N5 | Keys view `?`/F1 for where you are first (0.3.0) | KeysPanel | ✓ (`KeysPanel.qml`) | — | — |
| N6 | Delete is ⌘⌫ on the Mac (0.3.1) | Keys | — | Omarchy keeps Delete / Ctrl+Backspace | — |
| N7 | (validation: added) Tag changes Zotero missed are kept and sent when it's back (status renames and deletes); every paper's task tags set again each time Zotero comes back, not once per launch; a removed task status's tags come off (0.3.5) | `LauncherModel+TagQueue.swift`, `+Status`, `+Todos` | ◐ task tags are synced once per shell run (`taskTagsSynced`), retried until Zotero answers; no queue for status renames or deletes made while Zotero is closed | a queue in Service.qml (or lib) kept in `$XDG_STATE_HOME`; check the removed-status case | 2 |

### 3.3 Processes, automation and catch-up

| # | Feature | Mac | Omarchy | Linux / work | Phase |
|---|---|---|---|---|---|
| P1 | Processes: Stop all (asks first) and state pills All/Running/Pending/Finished/Failed with counts (0.3.3) | Processes, StopAll | ✗ in QML (validated: confirmed: the 0.3.3 commit `eb9465b` changed only the catch-up arguments in Service.qml; the rows are built in `LauncherModel+StopAll.swift`) | QML (or a lib builder both call) | 2 |
| P2 | Bottom bar counts processes (`2 running · 3 pending · 1 failed`), click opens them (0.3.1) | Chrome | ◐ (validated: changed) the footer already counts them (`Views.taskSummary`, line 6967, with ⟳ ◷ ⚠ ✓); not clickable, and failures stay counted after Processes is opened | QML: a MouseArea, failures cleared once seen | 2 |
| P3 | Processes at once, 1 to 4, per machine; never two jobs on one paper (0.3.1/0.3.2) | Scheduler; row in `GlueSettings.js` | ✗ (validated: changed) `lib/Client.js` parses `defaults.processesAtOnce` and `Settings.toFile` keeps it, but nothing in the QML reads it, there's no Omarchy row (the row is Mac-only JS), and the catch-up is one `catchUpProc`, one job at a time | lift the row (D6, flagged for the Omarchy too); QML scheduler honours it for new papers and the catch-up | 2 |
| P4 | Catch-up: only missing or replace; leaves alone what Zotero shows done (0.3.3) | CatchUp, daemon | ✓ (eb9465b, both: `--prompts-mode`/`--tag-mode`, the two choice rows from lib) | — | — |
| P5 | A catch-up checks first, then runs exactly those (0.4.0) | CatchUp | ✗ (`startCatchUp` uses the plan the page counted) | QML + runner `catchup-plan` (there's no `catchup` command) (validated: changed) | 2 |
| P6 | Ask to catch up when the app opens; what it checks (0.4.0) | CatchUp, `GlueSettings.js` `launchCatchUpAsk` | ◐ (validated: changed) only the settings: `Client.js` reads `launchCatchUp`/`launchCatchUpWhat`, `toFile` keeps them; the logic and the rows are Mac-only JS | lift them (D6); on service start (once per shell session), only on the `automationHost` | 2 |
| P7 | One catch-up row while one runs, with both counts (0.4.7) | CatchUp, lib | ◐ (validated: changed) one row while one runs works (lib `catchUpRows` hides the starts); Service.qml's `catchUpRunning` has no `papers`, so it says "N left", not "N processes left on M papers" | Service: count the papers | 2 |
| P8 | A fatal problem (signed out, refused key, no credit, overloaded, no model, no network) stops the batch, says what to fix, holds new-paper work and retries (5 min network, 30 min rest) (0.4.7) | Fatal, Scheduler, `GlueRunner.fatalProblem`, daemon `fatal.mjs` | ◐ runner + lib row; QML no hold, and nothing sets `catchUp.stopped`, so lib's "Stopped: … what to fix" row never shows (validated: changed) | QML: hold state in Processes, retry timers, `stopped` passed | 2 |
| P9 | Skip read-only libraries (runner + bridge 0.2.5) | daemon | ✓ | — | — |
| P10 | Background automation starts with the app (0.4.0) | Scheduler | ✓ (service runs with the shell) | — | — |

### 3.4 Settings, taxonomies, tasks, setup

| # | Feature | Mac | Omarchy | Linux / work | Phase |
|---|---|---|---|---|---|
| S1 | Settings order: General, Defaults, Models & providers, Rules, Paper status, Taxonomies, Tasks; Automation runs on in Defaults › New papers; fallback model after Prompts/Chat; Extract every paper's text in Bring papers up to date; General's one-row sections merged (0.4.31) | `lib/Settings.js` (shared) | ✓ (validated: changed) the QML renders every page with the lib's builders (`settingsRows()`, lines 3641 to 3659): `buildGeneral` skips `page: "defaults"` and `buildDefaults` adds Automation runs on itself, edited by the generic `set-edit`; the search index is built from the same builders (lines 534 to 541); every `rowId` the builders emit has a QML case, except `tax-field` and `tax-label-field` (fields edited in place) and `tax-ai-item` (a proposal's lines, older than 2026-10-16). Nothing vanishes | a guard test that every `rowId` the lib's builders emit has a case in `ZoteroSearch.qml` | 1 (test only) |
| S2 | AI taxonomy drafts wait until Accept/Discard; rows say so; failed save shown; 10-minute timeout names the model (0.4.27) | TaxonomyDrafts, `lib/Settings.js` `draft` param | ◐ lib takes a `draft`, QML passes none | QML keeps the draft in the service | 2 |
| S3 | On/off settings show a switch (0.3.1) | rows | ✓ (validated: changed) a toggle-on/off glyph (`ICON.on`/`ICON.off`) and `checked` on each row; not a drawn switch | — | — |
| S4 | A Settings link lands on its row (0.3.2) | lib | ✓ (both) | — | — |
| S5 | Setup installs Node.js, pdftotext, Tesseract (`brew`) (0.4.14) | Setup | ✓ (validated: changed) Enter already runs `omarchy install dev-env node`, `omarchy pkg add poppler`, `omarchy pkg add tesseract tesseract-data-eng` in a terminal (`setupItems`, `term:` actions); the Mac's change caught up with this | optional: run in the background, shown in Processes | 4 (optional) |
| S6 | AI features install checks Claude/Codex binaries, retries IPv4 (0.4.14) | install-runner.sh | ✓ (both) | — | — |
| S7 | AI features update themselves after an update (0.4.22) | `autoUpdateRunner` | ✗ | service compares `daemon/package.json` with the installed runner after a plugin update; reinstalls once, shown in Processes | 4 |
| S8 | Colour-blind safe colours switch, on by default (0.4.17) | `SafeColours` (`Theme.swift`) | ✓ (validated: changed) landed in `cc0be82` during validation: `Views.pillPalette(…, { safe: true })` with `SAFE_PILLS` and `readableOn`; always on, no off switch | an off switch only if asked | 1 (done) |
| S9 | Pill kind symbols (status flag, task checklist, rank star, taxonomy tag, warning !); top journal grades a star; negated block struck through (0.4.17) | `Icons.concept` | ◐ (validated: changed) symbols landed in `cc0be82` (`Views.pillSymbol`, `Pill.qml`); the negated search block struck through is not checked | strike-through on a negated block | 1 (mostly done) |
| S10 | Usage counts for you only (`usage/<machine>.json`), off switch (0.4.17) | `UsageLog.swift` | ✗ | Service writes the same file (same keys: `key:i`, `row:open`, `view:settings`) so `usage-report.mjs` reads both machines | 4 |

### 3.5 Review tables (phases 11a to 11d, rounds 3 to 8)

All ✗ on Omarchy. Data already syncs: `reviews/` in the sync folder, so tables made on the Mac open on Linux once the
Omarchy machine joins the folder.

| # | Feature | Mac version | Phase |
|---|---|---|---|
| R1 | Open the results (query, collection, tag, saved search) as a table; a list keeps its table; live list ≤ 200; re-search when tasks/status/tags change ("N joined/left") | 0.4.6, 0.4.15, 0.4.24 | 3 |
| R2 | Columns: Zotero fields, launcher attributes, per-taxonomy, your own (text, one of a list, several of a list), tags; Columns list ordered by drag/⌥⌘↑↓ with kind icons; new column lands after the selected one; + Column asks who fills it in first (validated: changed) | 0.4.6, 0.4.15, 0.4.21, 0.4.22 | 3 |
| R3 | Resize/reorder columns (as narrow as 16 px, the resize grip apart from a move), lines 1/2/3/6/all, row resize (`heights`), cell fills its row, multi-key sort, Group ▾ with headers (never by free text), Order (validated: changed) | 0.4.6, 0.4.10, 0.4.13, 0.4.22, 0.4.29 | 3 |
| R4 | Right pane: Info (status/task pills, cells, notes) and Chat tabs, resizable, splittable; read-before-edit; unchanged edits not saved | 0.4.6 to 0.4.31 | 3 (Info), 4 (Chat) |
| R5 | Keys: `i r o z n`, `/` filter, ⌥→← status/task, text size Ctrl −/+/0, toolbar icons with names, pin over other windows | 0.4.13 to 0.4.17 | 3 |
| R6 | Source box reads queries like the launcher, Ctrl+S saves a search | 0.4.13 | 3 |
| R7 | Export CSV (xlsx is 11d, not built on the Mac either) | 0.4.6 | 3 |
| R8 | Delete this table (to Trash: `gio trash` / `trash-put`) | 0.4.17 | 3 |
| R9 | AI columns: AI prompt, Jev several, Jev best fit (taxonomy or own labels), Jev relevance; answer shapes (text, a list as bullets, Tags as pills a table groups by, number, one of a list); evidence checked; the panel shows an AI cell whole with *Back to the AI's answer*; a column ticked in Columns shows answers other tables made; Write it with AI; Edit it…; out-of-date by hash (validated: changed) | 0.4.14 to 0.4.22, 0.4.29 | 4 |
| R10 | Run…: plan first, column checkboxes, right-click run cell/row/column, queue while running, Stop (■), turning-arrow/hourglass marks, cache-friendly requests; a cell with an up-to-date answer isn't run again; ≤ 200 papers a run, one row in Processes (validated: changed) | 0.4.14, 0.4.16, 0.4.29 | 4 |
| R11 | Copy a cell, Copy with its APA 7 citation | 0.4.29 | 3 |
| R12 | Docked chat: Paper (follows selection; .md/PDF/Metadata source) and List (citations, abstracts, visible columns; fit to context); Ask each paper = AI column then synthesis. (validated: changed) On the Mac this chat is native, drawn over the page; on Linux it is the QML ChatWindow tiled beside the table with a `list` mode (D7) | 0.4.30 to 0.4.32 | 4 |
| R13 | Titles show italics/bold/sub/sup | 0.4.17 | 3 |
| R14 | Drag a cell/title out with its text (⌥ adds citation) | 0.4.31 | 5 |
| R15 | (validation: added) The selected cell shows its whole text over the cells below; esc or a click puts it away; a cell, the panel or a menu scrolled to its end stops there | 0.4.15, 0.4.16 | 3 (the page has it; check in Chromium) |

Linux shape (D2): Ctrl+T in the launcher (and a header button) → the service asks the review server for the list's
table → `omarchy-launch-webapp http://127.0.0.1:<port>/review/<id>?k=<key>` opens a tiled Chromium app window.
`n` / note clicks go back to the launcher over the existing IPC (`omarchy-shell shell toggle` with a payload); `o`
and `z` go to the bridge as the launcher does. (validation: added) Status, task and saved-search changes from the
table write `todos.json` and `searches.json` while the QML service also writes them: route them through the
launcher's IPC (one writer per machine), or write with `Merge.stamp` as the service does and let its `FileView`
reload.

### 3.6 Chat and windows

| # | Feature | Mac | Omarchy | Linux / work | Phase |
|---|---|---|---|---|---|
| C1 | Chat window fits the screen, keeps its size; esc goes back to the paper's menu (0.3.3) | ChatWindow | ◐ (validated: changed) size: `ChatWindow.qml` asks 1100 by 900, which Hyprland overrides when it tiles the window (fine when tiled, too big when floating); esc in an empty box does nothing (back is Alt+M or the Menu button) | esc goes back (`menuRequested`) when nothing is typed or running | 2 |
| C2 | Chat bottom bar compacts in a narrow window (0.4.31) | ChatWindowView | ✗ | QML: icons only below a width | 4 |
| C3 | Chat source switch shows the choice framed and bold, not by colour (0.4.31) | ChoiceTabs | ◐ (validated: changed) the `.md`/`PDF` switch is framed and filled when chosen, but not bold and without symbols | QML: bold + symbol | 4 |
| C4 | Paper chat on Metadata (no full text) (0.4.31, runner `--source meta`) | ChatWindowModel | ✗ | after D1 (done); a third segment in the source switch | 4 (could be 2) |

### 3.7 Window and system integration

| # | Feature | Mac | Omarchy | Linux / work | Phase |
|---|---|---|---|---|---|
| W1 | Open as a window (regular, tiled) vs overlay; `W` switches for one opening; esc never closes the window (⌘W does) (0.4.0, 0.4.17, 0.4.21) | LauncherPanel | ◐ (validated: changed) `W` already moves the card into a `FloatingWindow` (`toggleWindowed`, Hyprland tiles it) for one opening; missing: the always-a-window setting, and esc at the top still dismisses it | a setting (flagged lib row, D6); esc stops at the top in window mode; Super+W closes | 4 |
| W2 | Launcher resizable from edges, size kept (0.3.7) | LauncherPanel | ◐ (validated: changed) in window mode Hyprland resizes it; the overlay's size is fixed | overlay size setting | 4 |
| W3 | Launcher movable by dragging (0.3.3) | LauncherPanel | — | Hyprland moves windows (window mode) | — |
| W4 | Pin keeps the launcher open over other apps; esc doesn't close it (0.3.3) | Pin | ✗ (validated: changed) no overlay pin (the pins are rows'); the overlay is a layer-shell surface with exclusive keyboard focus, so it can't stay up while you use another app | map to window mode (W1) plus Hyprland's `pin` for a floating window | 4 |
| W5 | Not see-through (solid background) (0.3.5) | — | ✓ likely (validated: changed) the card is `Color.menu.background` with no alpha of its own | check with a theme whose menu colour is translucent | 2 (check) |
| W6 | Drag anything out as plain text (papers as reference line, notes, cite rows, collections/tags/searches, tasks, chat messages) (0.4.31) | `LauncherModel+Drag.swift`, ReviewCore.reference | ✗ | QML `Drag.Automatic` with `text/plain`; spike on a layer-shell surface first; needs `ReviewCore.reference` from `shared/` (phase 3) | 5 |
| W7 | Reading companion for the iPad (Tailscale) (0.4.23 to 0.4.26) | CompanionServer.swift | — | Mac mini keeps serving it; optional later: a systemd user unit on Omarchy (the server is Node) | 6 (optional) |

### 3.8 Shared lib drift since 2026-10-16 (validation: added)

Every change to `lib/*.js` since 2026-10-16 (`git log -p -- lib/`), and whether the QML follows it. The 2026-10-16
commits marked "both launchers" (`f2d438f`, `ad4a2f0`, `af4315c`, `98d6676`, `f7a1a8a`) changed the QML in the same
commit or need no QML change; the rows below are the rest.

| # | lib change (commit) | QML today | Effect on Omarchy | Row / phase |
|---|---|---|---|---|
| X1 | `Settings.js`: 0.4.31 page order, Automation runs on via `page: "defaults"`, fallback moved, Extract every paper's text into Bring papers up to date, General sections merged (`f672087`, `46320a2`) | renders through the builders and generic handlers | none: shows the new order | S1 / 1 (guard test) |
| X2 | `Settings.buildTaxonomies`/`buildTaxonomy(…, draft)`, `pendingDraft`, `buildTaxonomyDraft` reads `since` and `saveError` (`f37fee7`) | passes no draft; its `taxDraft` has neither field | a draft is lost on leaving the page; a failed save isn't said | S2 / 2 |
| X3 | `Settings.catchUpRows` reads `catchUp.stopped` and `running.papers` (`3dacebb`) | `settingsState()` passes `{ plan, running, problem }`; `catchUpRunning` has no `papers` | the "Stopped: … what to fix" row never shows; the running row lacks the paper count | P7, P8 / 2 |
| X4 | `Client.normalizeDefaults` `launchCatchUp`, `launchCatchUpWhat`; `Settings.toFile` keeps them (`7092ece`, `eb9465b`) | never read | values the Mac writes are kept (nothing lost); no row, no behaviour | P6 / 2 |
| X5 | `Client` `processesAtOnce` (`bb66f1f`); `contracts/Paths.js` makes it machine-only | never read | the Mac's row is in `GlueSettings.js`, so the setting is unreachable on Omarchy | P3 / 2 |
| X6 | `Views.selectionAfter(…, query)`, `namedPlaceRow` (`17dbee0`) | passes the query (line 654) | none | L6 ✓ |
| X7 | `Views.pillPalette(…, { safe })`, `SAFE_PILLS`, `readableOn`, `pillSymbol` (`cc0be82`, during validation) | `ZoteroSearch.qml` and `Pill.qml` use them; `macos/js/lib` copied | none (the Mac's Swift draws its own) | S8, S9 / 1 |
| X8 | Portable logic that never reached `lib/` (Mac-only JS): `Glue.js` arrangement, `GlueSettings.js` rows and launch catch-up, `GlueRunner.fatalProblem`, `GlueReviews.reviewRunJob` | not reachable (boundary) | L1 to L5, P3, P6, P8, R10 have no shared logic to call | D5, D6 / 1 |

## 4. Phases

Each phase is one or more PRs to master without a version bump; a release PR bumps manifest, bridge and runner
together when Marcelo wants to install (he batches).

### Phase 0: bring-up on the Omarchy machine (Marcelo + Remote Control, no code)
- Omarchy, Hyprland and Quickshell versions now (the plan of record checked 4.0.0 / 0.56.2 / 0.3.1); the plugin
  contract still matches (`manifest.json`, `OverlayWindow`, `o.bind`).
- Plugin installed from master, bridge 0.2.6 in Zotero, runner installed; `make test`, `make smoke`, `make e2e`.
- Sync folder: join Syncthing's `z-comp-sync` (both Macs share it) and set `syncDir`; review tables, tasks, taxonomy
  and `view.json` then come from the Macs.
- Run `claude rc` on Omarchy so threads can check changes on the real launcher.
- Exit: a working launcher on Omarchy on today's master, the old phase 2.5 checklist and the two-machine Syncthing
  checklist done.

### Phase 1: foundations (container-testable)
1. **Runner parity (D1):** port `macos/runner` into `daemon/`: `lib/reviews.mjs`, `lib/listchat.mjs`, the `chat`,
   `generate`, `providers/api.mjs` and `bin` changes (`review-run`, `review-draft`, `chat --review`, `chat --source
   meta`, `chats/chat-show/chat-rename/chat-delete --review`, SIGTERM stop with exit 130, cache-friendly prompt
   parts). Bring their tests (`review-run`, `list-chat`, `review-core` parts the runner needs) into `tests/`. After
   this, `diff -r daemon macos/runner` shows only `paths.mjs`, `package.json`'s version and the lockfile.
   (validated: done in `cc0be82`: the diff is now exactly those three files; `tests/review-run.test.js`,
   `tests/list-chat.test.js`, and new cases in `extract-chat` and `providers`. `tests/review-run.test.js` reads the
   cells files itself because `ReviewCore.js` is under `macos/` until phase 3; port `macos/js/tests/review-core.test.js`
   then. Not to bring over: the runner's version (`0.2.9`; `daemon/` stays at the Omarchy release's, which
   `check-versions.sh` enforces) and `paths.mjs`'s `../../../contracts` path.)
2. **Shared settings drift (S1):** make the QML render what `lib/Settings.js` now builds (the `page: "defaults"`
   items, the merged General sections, the moved catch-up rows); a test that every schema item is reachable from
   some page. (validated: changed) The QML already renders them (S1, X1). What's left: the guard test (every `rowId`
   the lib's Settings and Views builders emit has a case in `ZoteroSearch.qml`, next to `scripts/check-qml-calls.js`).
   (2026-11-05: done, `tests/qml-row-handlers.test.js`.)
3. **Colour-blind pills and kind symbols (S8, S9):** `Pill.qml` takes a kind and draws its symbol; the safe palette
   is the default, behind a `colourBlindSafe` setting. (validated: done in `cc0be82`, without the setting)
4. (validation: added) **Lift the portable Mac JS into `lib/` (D5, D6):** `Glue.js` arrangement into `lib/Views.js`
   with `top-sort` and `manual-sort` tests; the Processes at once and launch catch-up rows and logic from
   `GlueSettings.js` into `lib/Settings.js` behind a `state` flag; `GlueRunner.fatalProblem` (the same as
   `daemon/lib/fatal.mjs`). Copy to `macos/js/lib`; `Glue*.js` then delegate (a Mac PR, Mac CI).
   (2026-11-05: the arrangement (`Views.arrangement`, `topArrangement`, `arrange`, `arrangeTop`, `arrangeOptions`) and
   `Client.fatalProblem` moved, with `tests/arrange.test.js` and `tests/fatal-problem.test.js`; `Glue.js` and
   `GlueRunner.js` delegate. The Processes at once and launch catch-up rows stay in `GlueSettings.js` until phase 2b
   wires them on Omarchy, so they never show twice on the Mac.)
- Exit: `make test` green with the new runner tests; `scripts/check-qml-calls.js` and lint green; Settings pages
  checked on Omarchy.

### Phase 2: daily launcher parity (QML, needs the device)
L1 to L5, L7, L8, L9, L12, L16, L19, L20; N1, N2, N4, N7; P1 to P3, P5 to P8; S2; C1; W5. (validated: changed: N3
dropped as done; L16, N7 added.) Arrangement logic comes from phase 1 step 4. Split into 2a (arrangement: L1 to L5,
L20), 2b (processes and catch-up: P1 to P8, S2, X2, X3) and 2c (menu and notes: L7 to L9, L12, L16, L19, N1, N2, N4,
N7, C1).

### Phase 3: review tables, read and edit (D2, D3)
- Move `ReviewCore.js`, `ReviewGrid.js`, `ReviewGrid.css` to `shared/review/`; update the Xcode project, the
  companion and `check-boundaries.sh`; Mac CI must stay green (this is the one phase that touches the Mac build).
  (validated: changed) Move `GlueReviews.js` too; the full path list is in D3.
- `ReviewGrid.js` transport: `post()` falls back to `fetch('/rt', …)`, `RT.load`/updates come over SSE.
- Node review server in `daemon/`: port the Swift handlers (ready, refresh, layout, rename, delete, source, preview,
  segments, saveSearch, cell, addColumn, status, task, open, paper, notes, note, csv, copy, restore) using
  `ReviewFiles` semantics (sync folder `reviews/`, merge by paper).
- Launcher: Ctrl+T and the header button; a list reuses its table; live re-search on task/status/tag changes.
- Theme CSS from Omarchy's current theme (D4) + safe pill colours.
- R1 to R8, R11, R13, R15, L23.
- (validation: added) Split it: 3a the move, the transport and a read-only table (ready, refresh, layout, source,
  preview, segments, csv, copy, open, paper, notes, note); 3b the edits (cell, restore, addColumn, rename, delete,
  status, task, saveSearch, with one writer per file, section 3.5); 3c the launcher side (Ctrl+T, a list's table, live
  re-search).

### Phase 4: AI in the table, chat and windows
R9, R10, R12 (needs phase 1's runner and D7's ChatWindow list mode), C2 to C4, W1, W2, W4, L14, L17, L21, L22, S7,
S10; S5 optional. (validated: changed: L15 dropped as done, S5 optional.)

### Phase 5: drag-out (spike first)
W6, R14: confirm Wayland DnD from a layer-shell overlay and from Chromium (the table page can use HTML5 drag with
`text/plain` as on the Mac's page).

### Phase 6: optional
W7 (companion on Linux), only if the Mac mini stops being the always-on machine.

## 5. Mac-only items: dropped or mapped

| Mac item | Omarchy |
|---|---|
| Signing, notarization, `MACOS_SIGNING`, `make-signing-cert.sh` (0.4.26, 0.4.28) | Dropped: the plugin is QML loaded from `~/.config/omarchy/plugins`, no signing. |
| App icon, In the Dock and ⌘Tab (0.4.15) | Dropped. The review table's web-app window can carry the icon (`icon.svg` already exists for the companion). |
| Menu bar menu, Open at login, Hotkey and Login… (0.3.0, 0.3.3); its login problem shown with a sign (0.4.17) | Mapped: the service starts with the shell; the hotkey is a Hyprland binding (`scripts/add-keybinding.sh`, Super+Shift+Z). |
| In-app Update with SHA-256 checks (0.3.1, 0.3.2, 0.4.3, 0.4.4) | Mapped later: a Settings row that runs `omarchy plugin update` (or `git pull` in the plugin folder) and reinstalls the runner; no own installer. Not in a phase until Marcelo asks. |
| TCC prompts, external-drive privacy strings (0.3.1, 0.4.26) | Dropped (Linux has no TCC). |
| Tiling managers on macOS: TileMyMac, AeroSpace, yabai (0.4.17) | Mapped: W1 window mode is a normal Hyprland client. |
| Ten themes and Light/Dark picker, live preview (0.4.14, 0.4.15) | Mapped (D4): follow the Omarchy theme. |
| Homebrew installs (0.4.14) | Mapped: pacman/`omarchy-pkg-add` (S5, already). |
| macOS bash 3.2 UTF-8 variable fix (0.3.6) | ✓ already applies to both (test exists). |
| UI tests, xcodebuild, Mac CI | Not ported; Omarchy keeps `make e2e` with real keystrokes (`uinput-keys.py`). |
| ⌘ key notation | Omarchy shows Ctrl/Super notation (existing `keyName`). |
| (validation: added) A release on merge of a new `MARKETING_VERSION`; the bridge's .xpi in each Mac release (0.4.3) | Not ported: Omarchy releases are batched by hand (principle 6). |
| (validation: added) VoiceOver labels (0.3.0, 0.4.13, 0.4.20) | Dropped: Quickshell has no screen reader path; shape and text carry the meaning. |
| (validation: added) No empty strip under the hidden title bar; the highlighted row kept in sight through sections; menus drew the last list's rows (0.3.1, 0.3.3, 0.4.1) | Dropped: SwiftUI layout bugs the QML never had. |
| (validation: added) The companion's log, start order and port retry (0.4.25, 0.4.26, 0.4.27) | With W7 only. |

## 6. Risks and blockers

1. **No device in the loop yet.** Nothing in phases 2 to 5 can be called done without the real launcher. Phase 0's
   Remote Control on Omarchy unblocks it.
2. **Omarchy/Quickshell drift.** The machine was rebuilt; the overlay contract may have changed since 4.0.0.
3. **Shared `lib/` already changed for the Mac** (S1, S2): the QML may show stale or missing settings today. Phase 1
   fixes the known cases; the validation pass lists any other `lib/` change since 2026-10-16 the QML doesn't follow.
   (validated: changed) Listed in section 3.8: nothing vanishes; two lib inputs the QML never passes (X2, X3) and two
   settings with no Omarchy row (X4, X5). The bigger gap is the Mac-only JS (X8, D6).
4. **Review server security:** bind 127.0.0.1, a random key per start in the URL (as the companion's), refuse other
   hosts.
5. **Moving review files out of `macos/` (D3)** touches the Mac build: one PR, Mac CI (25 min) must pass.
6. **Chromium as the table's window:** if Marcelo uses another browser, `omarchy-launch-webapp` follows Omarchy's
   default browser; Firefox has no `--app`, so the table would open as a tab.
7. (validation: added) **Shared rows show on both launchers.** `lib/Settings.js` is byte-identical in `macos/js/lib`
   and the Mac renders its builders, so a row added for Omarchy appears on the Mac too (and the Mac's
   `GlueSettings.js` may already draw its own: Processes at once would show twice). Flag such rows in `state`.
8. (validation: added) **Two writers per machine.** The review server and the QML service would both write
   `todos.json`, `searches.json` and `view.json` (section 3.5).

## 7. Next actions

- Phase 1 starts now (runner parity first: largest, purely testable). (validated: steps 1 and 3 landed in `cc0be82`;
  next are step 2's guard test and step 4.)
- Marcelo: phase 0 on the Omarchy machine (start `claude rc` there and join the sync folder).

## 8. Validation notes (2026-11-05)

**What was checked.** Every bullet of the Mac sections of `CHANGELOG.md` (0.3.1 to 0.4.32) against sections 3 and 5;
each row's Omarchy status by reading `ZoteroSearch.qml`, `Service.qml`, `ChatWindow.qml`, `Pill.qml` and `lib/*.js`;
`git log -p -- lib/` since 2026-10-16 commit by commit; `diff -r daemon macos/runner -x node_modules` before and after
`cc0be82`; `ReviewGrid.js`, `ReviewWebView.swift`, `ReviewWindowModel*.swift`, `ReviewWindows.swift`,
`Files/ReviewFiles.swift`, `LauncherModel+Reviews.swift`, `macos/companion/lib/api.mjs` and `context.mjs`, `Glue*.js`,
`scripts/check-boundaries.sh`, `macos/project.yml`. Read-only; the other worker's commit `cc0be82` (runner parity,
safe pills) landed during the pass and the rows say so.

**Statuses corrected.** L15 ✓ and N3 ✓ and S1 ✓ and S5 ✓ (were ✗, ◐, ◐, ◐: the code already does them). L16 ✗,
L19 ✗, N4 ✗, P3 ✗, W4 ✗ (were ✓, ◐, ◐, ◐, ◐: not in the QML). W1 ◐ and W2 ◐ (were ✗: `W` window mode exists).
P2 ◐ (was ✗: the footer counts). L12, N1, N2, C3 ◐ with what exactly is missing; L22 ◐ (lib `fitHints` is already
used). S8 ✓ and S9 ◐ after `cc0be82`. C1, P5, P6, P7, P8, S3, W5 kept or nearly so, with the evidence written in.
P1 confirmed ✗.

**Rows added.** N7 (0.3.5 tag queue), R15 (whole-cell peek), X1 to X8 (lib drift), D6 and D7, four section 5 rows,
risks 7 and 8. R2, R3, R9, R10, R12 got the CHANGELOG details they lacked (0.4.15, 0.4.16, 0.4.22, 0.4.29).

**Decisions.** D2 holds, with a bigger port than written (~1,290 Swift lines) and no web chat to reuse. D3 holds and
needs no lint change (only its comment and a test case); move `GlueReviews.js`, not `Glue.js`. D5's premise was
wrong: the arrangement is already JS in `Glue.js`, so it's a move, not a port. New D6 (lift Mac-only JS into `lib/`)
and D7 (the table's chat is the QML ChatWindow, tiled).

**Phases.** Phase 1 shrank (two of three steps done, S1 needs only a test) and gains step 4 (lift Mac JS), which
phase 2 depends on. Phase 3 is the largest and is split 3a/3b/3c. C4 could move to phase 2 (runner ready, small QML).
W6 depends on phase 3 (`ReviewCore.reference` from `shared/`). L15 and N3 leave the phases; L16, N7 join phase 2.

**Open disagreements.** (1) D3 versus a checked copy: the repo already keeps `macos/js/lib` as a byte-identical copy
of `lib/`, so a copied `shared/` with a parity test would avoid touching the Mac build; the plan keeps the move
because the grid is edited mostly on the Mac side and two copies of 3,400 lines drift faster. (2) S8's off switch:
`cc0be82` made the safe palette unconditional; the Mac has an off switch. Fine for Marcelo; add the switch only if
asked. (3) L16 was read from the key handlers; confirm on the device that the list view gets no Home/End of its own.
