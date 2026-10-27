# Phase 11a: the review table (design)

The first of the review table's four phases (the spec and mockup: the *Review Table* artifact; 11b AI prompt
columns, 11c Jev columns, 11d the finish). 11a is the table itself: a window that lists a paper set with the
attributes the launcher already knows as columns, your own columns typed by hand, the layout, the sort, the
files that keep it all, and a CSV export. No AI runs in 11a.

## 1. What it does

- **A review** is a named table: a paper set (a saved search, a collection, a tag, or a query typed in the
  launcher's syntax), the columns it shows, their layout and the sort. Reviews are files in the sync folder.
- **Opening one:** `⌘T` in the launcher's results (a query, a collection, a tag, a saved search) opens a new review of
  what's listed; the menu bar's *Review Tables* lists the reviews and opens one. One window per review; opening an
  open one brings it forward.
- **The paper set is live:** searched again when the window comes forward, after a change made from the table, and
  with `⌘R`. It is the bridge's `/search` as the launcher sends it (statuses, tasks and chats marks included), at
  most 200 papers (the bridge's cap); the footer says when a set is cut there.
- **Columns:**
  - *Zotero and the launcher's:* title, authors, year, publication, item type, added, modified, PDFs, notes,
    extracted text, tags, the paper status, the default task's status, each ranking (ABS, ABDC, FT50, UTD24, the
    ABS field), and one per taxonomy (its labels on the paper, from its tags). Read only, except the two below.
  - *The status and the task* change in the panel on the right (pills) or with `⌥→←` and `⇧⌥→←`, the launcher's own
    writes (the `s/` tag a second after the last change; the default task in `todos.json` with its `t/` tag).
  - *Your own:* text or one of a list (Include?: include, maybe, exclude). Text: `↵` or a double-click edits in the
    cell, `⌘↵` keeps, `esc` drops. One of a list: the panel's pills.
  - *AI columns* (11b, 11c) are offered in *+ Column* as `Not on the Mac yet: AI columns come in a later version`.
- **Layout:** drag a header to move a column (or `⌥⌘←→`), drag its edge to resize (a double-click fits it), each
  column's lines (1, 2, 3, 6, all) with a longer cell scrolling inside itself, hide and show (*Columns ▾*), the
  paper column frozen on the left, the panel on the right folded away with *◨ Panel* or `⌥⌘I`. All kept per review.
- **Sort:** a header's click sorts by it alone (again: descending, then off); `⇧`-click adds it as the next key;
  *Sort ▾* lists the keys in order (direction, remove, clear). Empty values go last either way; ties keep the
  set's order (stable); text compares as Finder does (`Intl.Collator`, numeric); statuses, task statuses and
  grades sort in their own order (your statuses' order, the task groups, ABS 4* first, ABDC A* first).
- **A click never changes a value.** It selects; `space` selects the row; values change in the panel, by editing,
  or with the modified keys.
- **Export:** *Export ▾ › CSV* (UTF-8 with a BOM, so Excel reads accents; the columns as shown, in their order;
  the sort as shown). xlsx and Markdown are 11d's.

## 2. Files (the sync contract)

One folder, `reviews`, synced like `prompts` and `taxonomies` (`Paths.js`: `reviews`, in `SYNCED`):

- `reviews/<id>.json`: a review. `{ id, name, source: { type: "query" | "search" | "collection" | "tag", query,
  key, libraryID, title }, columns: [{ id, width, lines, hidden }], sort: [{ column, dir: "asc" | "desc" }],
  lines, panel, created, updated }`. The newer file wins a conflict (Merge's default).
- `reviews/columns/<id>.md`: a column of your own (and, from 11b, a prompt column): a front matter of
  `key: value` lines (`label`, `kind: own`, `type: text | choice`, `options: ["include", "maybe", "exclude"]`), the
  body its description (11b: its prompt). A column is used by any review that lists it.
- `reviews/cells/<column id>.cells.json`: its values. `{ cells: { "<libraryID>:<key>": { v, updated, by } } }`.
  Merged by paper (`Merge.js`: any `*.cells.json`), the one changed last winning, so two machines' edits of
  different papers both stay.

Writes are refused while the sync folder is away, with the one sentence for it; a damaged file is named and
left alone. Ids are `r-` / `c-` and 10 random base-36 characters.

## 3. Architecture

- `macos/ZoteroLauncher/Review/ReviewCore.js`: the pure logic, ES5, in three places from one file: JavaScriptCore
  (Glue, for the files), the grid page (inlined), Node (tests). The fields and their values, the columns a
  review shows, the multi-key sort and its orders, the CSV, a review's and a column's files read and written,
  setting a cell.
- `Review/ReviewGrid.js`: the page (DOM only): the table, selection and keys, resize and drag, the menus, the
  panel, editing. It sends what you do to the app and draws what the app sends.
- `Review/ReviewWebView.swift`: a `WKWebView` that **runs the page's own script** (unlike decision 5's note and chat
  views: a grid you resize, drag and drive by keys needs it), held as tight as those: a CSP of
  `default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-…'` (only the bundled script runs; no
  network, no images, no frames), a non-persistent data store, every navigation cancelled, every value drawn as
  text (never as HTML). The page talks through one message handler (`review`); the app answers with
  `RT.load(…)` in the page's world.
- `Review/ReviewWindowModel.swift`: a review's state (its file, the columns, the cells, the last answer), the
  search, the writes (through the launcher for the status and tasks), the export (a save panel).
- `Review/ReviewWindows.swift`: the windows, one per review, their size kept as the chat window's is; `⌘W`
  closes, `F1` or `?` the keys.
- `LauncherModel+Reviews.swift`: the reviews list, `⌘T`, a status or default task set from a window (the
  launcher's pending changes and flushes, so a window and the launcher never write twice).

## 4. The page's messages

App → page: `RT.load({ review, columns, cells, results, total, ctx, readOnly, problem, loading })`; `ctx`:
`{ statuses, taskStatuses, tasks, taxonomies, searches, now }`.

Page → app (`{ type, … }`): `ready`, `layout` (the review's columns, sort, lines, panel), `cell` (column,
paper, value), `status` (paper, from, to), `task` (paper, status id), `open` (a paper, selected in Zotero),
`source`, `addColumn`, `removeColumn`, `rename`, `csv` (name, text), `refresh`.

## 5. Tests

- `macos/js/tests/review-core.test.js`: values, columns, sort (multi-key, empties last, stable, the orders), CSV
  (quotes, BOM, line breaks), files (normalize, damaged input, front matter both ways), cells.
- `contracts/tests`: `reviews` in every path case and the sync plan; `*.cells.json` merged by paper.
- Swift: `ReviewTests.swift`: a review saved and read back, refused when the sync folder is away, the page's
  shell with its script's hash, the messages decoded.
- The page itself: driven headless by `macos/scripts/review-grid-check.mjs` where Playwright is installed (a
  developer's check, not CI's).

## 6. Not in 11a

AI and Jev columns, the column library and *Write one with AI* (11b), the screening filter (11c), xlsx and
Markdown, saving a column to Zotero notes, reviews in catch-up (11d), making or editing saved searches from the
window (the launcher's ⌘S and Searches do that).
