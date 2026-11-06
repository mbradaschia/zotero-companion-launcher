# The fold reader: specification (R1)

A window of the Mac app where a paper is read at five levels, the words moving between them, its PDF beside the text
and linked both ways, with highlights and notes that stay on the words through every level. The levels come from
TextFold (github.com/chenxiachan/textfold, Apache 2.0) running on the same Mac. The visual and interaction reference
is Marcelo's mockup v10 (the Design canvas `Main.dc.html`); where this spec and the mockup differ, this spec says so
and why. The plan and its task list are in [PLAN.md](PLAN.md); the test fixture in [FIXTURE.md](FIXTURE.md).

Words used here: a **unit** is a TextFold paragraph, list item, caption or abstract; a **piece** is one drawn token
with a persistent id; a **level** is one of Full, Brief, Key, Takeaway, Topic; a **mark** is a highlight, a note or an
Ask; the **link map** is each unit's place on the PDF pages.

## 1. Goal

Marcelo reads many papers for his PhD. He wants to see a paper's argument at a glance (Topic, Takeaway), drill into
any part (Key, Brief, Full) without losing his place, check every AI line against the author's own words and the
PDF page, and keep his highlights and notes on the paper's words whatever level he reads at. Colour is never the only
cue (he is colour-blind), and icons are consistent across the app.

## 2. User stories

1. From a paper's menu in the launcher, I choose **Read with folds** (or press `v`) and the paper opens in its own
   window at the level I used last, its PDF on the right.
2. I press 1 to 5 (or click the dial) and the text changes level; the words that stay fly to their new place, so I
   keep my place.
3. At Topic I see one card per section; a chip opens that paragraph at Key.
4. I click a paragraph: it is tinted and the PDF scrolls to it, outlined. I click a box on the PDF: the text scrolls
   to that paragraph. While I scroll, a dashed box on the PDF and a thin tick beside the paragraph follow me.
5. A paragraph's role shape, a double-click or `↵` opens it at Full in place; esc folds it back.
6. I select words: a dark bar offers Highlight, Note, Ask. The highlight stays on those words at every level that
   shows them; a note or a question is kept in the margin beside the paragraph.
7. I change the paper's reading status (and its task) from the header pill; it is the same status the launcher shows.
8. When TextFold is not running, or has not folded the paper, the window says so in plain words and offers the one
   step that helps; the PDF still shows.

## 3. Scope

### R1 (this build)

- The reader window: one per paper, opened from the paper's menu row **Read with folds** and the key `v`.
- The five levels, the morph between them, opened-in-place paragraphs, the role filter, Topic cards with the back
  matter behind one toggle, section takeaways.
- The header: title, authors, year, publication, pages; the status pill and the task pill (changeable in place); the
  taxonomies grouped by taxonomy name.
- The PDF pane: page images rendered by PDFKit, page margins cropped, zoom, swap sides, resizable divider, the link
  map from PDFKit's words matched by 3-word runs, its coverage, the follow box.
- Marks: highlight, note, Ask (Ask saves the question in the margin only), kept on this Mac, re-anchored when the
  fold changes.
- The margin pane: argument links and marks, collapsible and resizable.
- TextFold: found, asked for the paper's doc, asked to fold it on an explicit button; every empty and error state.
- Tests: node unit tests on a synthetic fixture, a headless Playwright check, XCTest for the Swift parts.

### Non-goals in R1 (later phases, PLAN.md)

- Ask sent to a chat (the chat window or the docked chat).
- Any write to the Zotero library from the reader other than the existing status and task changes (no annotations,
  no notes in Zotero). Those always need Marcelo's yes first.
- Our own folding with the app's runner; MinerU or any PDF engine of our own.
- Syncing marks between machines.
- The Lists rail (the 46 pt left rail of PR #84).
- Moving the web code to `shared/` (the code is shaped for it, section 6.4).
- Group libraries, a paper with several PDFs (R1 takes the first usable PDF), translations (`lang`), find in text,
  printing, export.

### Where R1 differs from mockup v10, and why

- The role filter folds the other paragraphs into one-line stubs instead of dimming them: dimmed text falls under
  4.5:1.
- The status and task pills use the app's icon map (flag, checklist), not ○ ◐ ●: one icon per concept everywhere.
- System serif and sans instead of web fonts: the page's CSP loads nothing.
- No left rail (decision 6: a later phase); the window chrome is the Mac's own.
- While following, the PDF scrolls only when the dashed box is out of sight (TextFold's behaviour); a click always
  scrolls it. Less movement while reading.
- Added for the keyboard: `j` `k` select a paragraph, `↵` opens it, `h` `n` `c` act on a selection, `⌥→←` `⇧⌥→←`
  change status and task, as in the launcher.

## 4. Where the folds come from: TextFold

Verified against TextFold's source (`textfold/server.py`, `zotero.py`, `fold.py`, `store.py`):

- **Finding the server.** TextFold writes `server.json` (`{"format": "textfold/server", "version": 1, "url",
  "port", "pid", ...}`) in its data folder when its server starts and removes it when it stops (`server.py`
  `announce`/`withdraw`). On macOS the data folder is `~/Library/Application Support/TextFold` for the desktop app
  and a pip install (`store.app_data`); `TEXTFOLD_DATA` overrides it; a clone run by hand keeps it in the clone. The
  app reads, in order: `$TEXTFOLD_DATA/server.json` (if the app's environment has it), then
  `~/Library/Application Support/TextFold/server.json`, then falls back to `http://127.0.0.1:3017` (the default
  port). A `url` is used only if its scheme is `http` and its host is `127.0.0.1`, `localhost` or `[::1]`. The
  server is up if `GET <url>/api/zotero` answers JSON within 1.5 s.
- **The item's doc.** There is no route from a Zotero item to its doc, so the app uses the library browser:
  `GET /api/zotero/items?lib=users/0&q=<title, first 200 characters>` (timeout 20 s) and takes the row whose `key` is
  the item's key; its `paper` is the doc id (`""`: not folded). A doc id cached from an earlier open is tried first
  with `GET /api/doc/<id>`; a 404 falls back to the search. `503 {error: "not-running" | "api-off"}`: TextFold cannot
  reach Zotero's local API.
- **The doc.** `GET /api/doc/<id>` (timeout 20 s) returns the TextFold format, version 0 (`docs/format.md`), read
  from what is stored; it never calls a model. `provenance.local: true` means no model wrote the levels yet (Key,
  Takeaway, Topic are the author's first sentences, cut).
- **Folding, only on the button.** `POST /api/zotero/read {"item": "users/0/<KEY>"}` (timeout 120 s). It stores the
  file in TextFold's library and starts work that uses TextFold's model, so the app calls it only when Marcelo
  presses **Fold it with TextFold**. Replies: `{ref, title}` (read online, an arXiv id or DOI: the app then sends
  `POST /api/generate {"paper": ref}`); `{job, paper?, via}`; `{needs: "engine"}` (a scan); `400 {error: "no-file" |
  "no-fulltext" | "bad-item"}`; `503` (Zotero). Then `GET /api/jobs` every 2 s: the job of that `id` (or `pid`),
  `status` `queued`, `running` (`stage`, `done`, `total`), `done`, `error` (`error`, e.g. `no-model`,
  `needs-engine`), `stopped`, `moved` (follow `next`). On `done`, `GET /api/doc/<pid>`.
- TextFold refuses POSTs that carry another site's `Origin` and requests addressed to any host but this computer.
  The app's Swift code makes every TextFold call (URLSession sends no Origin); the page never talks to TextFold
  (its CSP forbids it anyway).
- Only the user's own library (`libraryID` 1, TextFold's `users/0`) in R1: TextFold names a group by its Zotero group
  id, which the bridge does not give.
- MinerU is never required: without its PDF engine TextFold reads a PDF's own text layer (`server.py` `take_pdf`,
  `Jobs.read_pdf`); a scan needs the engine and gets its own state.

## 5. Data

### 5.1 The fold JSON consumed

From the TextFold doc the reader reads only these fields; others are ignored, so added fields never break it.

| Field | Use |
|---|---|
| `format` = `"textfold/doc"`, `version` = 0 | anything else: the `bad-format` state |
| `id`, `lang`, `title`, `authors`, `date` | identity, the header when Zotero gives nothing |
| `provenance.ai_generated`, `.model`, `.levels_made`, `.local` | the AI note on the dial, the `local-only` banner, the cache's identity |
| `sections[].id, num, title, depth, takeaway, topic` | headings, section takeaways, Topic cards |
| `sections[].units[].id, kind, role, sentences, evidence, key, takeaway, topic` | every level |
| `links[].from, to, rel` | the margin's argument links (`rel` other than `ref`) |

Limits (beyond them: `bad-format`, detail names the limit): 20 MB, 5000 units, 400 sentences a unit, 5000 tokens a
unit. Ids must match `^[\w.-]{1,120}$`. Every string is drawn as text, never as HTML.

### 5.2 The model the core derives (FoldCore.model)

TextFold's public format has strings, not the token alignment its own reader uses, so FoldCore rebuilds it with the
same rules TextFold uses (ported, attributed: section 6.5):

- **Tokens.** Each sentence is tokenized with TextFold's word pattern (`tokens.py` `WORD`): a number like `3.5%`, a
  word with inner `'`, `’` or `-`, a CJK character, or any other single non-space character (Python's `\w` is Unicode: in JS write it `[\p{L}\p{N}\p{M}_]` with the `u`
  flag, never `\w`). `$...$` is one token
  of kind `math`. A token remembers whether a space follows it; sentences are joined by one space. `sents[s] = [a, b)`
  are the token ranges. Citations: tokens inside `[1]`, `[1, 2]`, `[3-5]` or an author-year parenthesis
  (`(Lee et al., 2021)`, `(A and B, 2019; C, 2020a)`) get kind `cite`.
- **Key alignment.** Key tokens are aligned to the evidence sentences' tokens with TextFold's `lcs_pairs` over
  `norm` (lowercased, non-word characters dropped, its stop words never matching, a final `s` dropped from words
  longer than 3), exactly, tie-breaking included; key token `j` gets `m` = the full token index it matches.
- **Takeaway length.** `tn` = the number of tokens of `takeaway`, when the key's first `tn` tokens equal them; else
  the key's tokens up to its first sentence end.
- **Topic.** TextFold's `locate(topic, take)`: the topic as a run of the takeaway's tokens (`k` indices into the
  key); `[]` when not verbatim. A section's topic is located in the section's takeaway the same way.
- **Back matter.** A section is back matter when its id matches `^(A\d|Sx|bib)` or its title starts with Appendix,
  Appendices, Acknowledg, References, Bibliography or Supplementary (any case), and every section after the first
  back-matter one is too.

### 5.3 Pieces per level (FoldCore.pieces)

A piece is `{id, t, sp, tone, kind}`. Ids: `<unit>:<i>` for full token `i`; a key token with `m` uses `<unit>:<m>`;
a key token without it `<unit>:k<j>`; a Brief gap `<unit>:gap<s>`; a topic token without `k` `<unit>:t<j>`. Shared
ids are what the morph moves. `tone` is how dark the ink is; **darker ink marks the words the next level keeps**.

| Level | Key | Pieces | Tone `ink` (the next level keeps them) | Font |
|---|---|---|---|---|
| Full | 1 | every full token | tokens of the evidence sentences; others `muted` | serif |
| Brief | 2 | the evidence sentences in order, a `…` piece between two that are not adjacent | tokens matched by the key (`m`); others `muted` | serif |
| Key | 3 | the key tokens | the first `tn` (the takeaway), weight 600; the reason `muted` | sans |
| Takeaway | 4 | key tokens `0..tn-1` | those in the topic, weight 600; others `ink` | sans |
| Topic | 5 | one chip per unit: the topic tokens (else the takeaway's first 6 words) | n/a | sans |

A unit with no evidence shows Full at Brief; a unit with no key shows its first sentence at Key and Takeaway, in
serif (the paper's words). Citation pieces are drawn in the accent with a dotted underline; math in monospace.

### 5.4 The PDF words and pages payload (native to page)

The native side opens the PDF with PDFKit on its own serial queue and sends, in order:

- In `FR.load`: `pdf: {pages: n, sizes: [[w, h], ...] (points, after rotation), name, urlPattern}` where
  `urlPattern` is `"zlfold://page/{n}?w={w}&d=<token>"` (the page fills in `{n}` and `{w}`); or
  `pdf: {problem: "no-pdf" | "missing" | "unreadable", detail}`.
- `FR.words({pages: [{n, words: [[text, x0, y0, x1, y1], ...]}], done})` in batches of 8 pages, first pages first.
  A word is a run of non-space characters of `PDFPage.string`, its box the union of `characterBounds(at:)` of its
  characters (empty rects skipped), in PDFKit's text order. Coordinates are 0 to 1 of the page's crop box in display
  orientation, origin top left: for rotation 0 `u = (x - minX) / width`, `v = (maxY - y) / height`; then 90:
  `(1 - v, u)`, 180: `(1 - u, 1 - v)`, 270: `(v, 1 - u)`, min and max of the two corners taken again. At most 20000
  words a page. Not sent when a valid cached link map is sent (5.5).
- The page indexes the words as TextFold's `indexWords` does (`reader.js`): each normalized with `pdfNorm`
  (NFKC, lowercase, only letters and digits kept); a word ending in `-` or `‐` joined with the first word of the
  next line on the same page; a word starting within `0.12 × height` of the previous word's end on the same line
  joined to it. A page with no words: `no-text` (section 9).

### 5.5 The link map (FoldCore.linkMap)

For each unit, TextFold's `locate` (`reader.js` 3994-4018), ported exactly: the unit's normalized full words; each
run of three looked up among the pages' 3-word runs (a run found more than 30 times ignored); votes by
`round((j - i) / 8)`; the best bucket with its two neighbours must reach `max(2, min(5, floor((n - 2) × 0.25)))`;
then the span from the first agreeing hit to the last, and its boxes merged one per line (`boxesOf`). Result per
unit: `{page, boxes: [[x0, y0, x1, y1], ...]}`, `page` 1-based (the first box's), a box on another page carrying it
as a fifth element. This is TextFold's own `/api/pdfmap` shape, so R2 can read that route unchanged.

**Coverage** = linked units / units, counting every unit. Under 30%: the warning (section 9). **Crops**: per page,
the union of its word boxes padded by 0.02, clamped to the page; a page without words `[0.06, 0.05, 0.94, 0.95]`.

Stored as `links.json` (5.6): `{format: "zl-fold-links", version: 1, doc: {id, lang, levels_made}, pdf: {bytes,
modified, pages}, coverage: {linked, total}, crops: [[x0, y0, x1, y1], ...], map: {<unit>: {page, boxes}}}`. On
open, the app sends the cached file when its `doc` and `pdf` equal the current ones; else it extracts words and the
page posts a new map.

### 5.6 Marks: format and location

`marks.json`: `{format: "zl-fold-marks", version: 1, paper: "<libraryID>:<KEY>", doc: {id, lang}, marks: [{id,
kind, unit, from, to, quote, text, created, updated}]}`.

- `id` `^m-[a-z0-9]{6,16}$`; `kind` `highlight`, `note` or `ask`; `unit` a unit id; `from`, `to` full token indices
  (inclusive, `from <= to`), or both `null` for a mark on a whole unit; `quote` the selected text (whitespace
  collapsed, at most 2000 characters); `text` the note or question (at most 20000); ISO times.
- A selection anchors to the full tokens its pieces map to (Full and Brief pieces, Key and Takeaway pieces with
  `m`); `from`/`to` are their min and max. A selection of AI words that map to none: Highlight is disabled (tooltip
  "Highlight the paper's words: at Full or Brief (1 or 2)"); Note and Ask anchor to the whole unit.
- A note or an Ask also highlights its range. A highlight is drawn on every piece whose full index is in a range, so
  it shows at every level that shows those words.
- **Re-anchoring**, when the doc changes (another `levels_made`, a refold): a mark whose tokens still read as its
  quote stays; else its quote is searched in its unit, then in every unit (whitespace-normalized, exact); found, it
  moves; not found, it is **lost its place**: kept in the file, shown in the margin's top group.
- At most 5000 marks; unknown keys dropped; invalid marks dropped. A file that does not parse is never overwritten:
  it is renamed `marks.json.damaged-<YYYYMMDD-HHMMSS>` and the reader starts empty, with the flash
  `~/…/marks.json wasn't valid: kept beside it as marks.json.damaged-…`.

**Where:** `<state>/fold-reader/<libraryID>-<KEY>/` with `doc.json` (the last doc fetched, so the reader opens
without TextFold), `links.json` and `marks.json`, where `<state>` is `Paths.resolve(...).runnerState` (the app's
state folder, `~/.local/state/oma-zotero/`). Written atomically (a temporary file in the same folder, then renamed).
Never synced. Why here and not the sync folder (`contracts/SYNC-FORMAT.md`):

1. A mark's anchor is a token index into one TextFold fold. TextFold runs per machine, and another machine's TextFold
   may have folded the same paper from another source (arXiv's HTML instead of the PDF) with other unit ids. A synced
   mark would point at text that machine does not have.
2. A synced file is a contract shared with the Omarchy launcher: a new synced name means changing
   `contracts/Paths.js` (`SYNCED`), `contracts/fixtures/paths.json`, SYNC-FORMAT.md and a merge rule in `Merge.js`
   (newer-file-wins, the rule for "anything else", would drop one machine's marks). That is a decision for R2, with
   Marcelo's yes, once anchors carry enough to re-anchor across folds.
3. The state folder is where the app already keeps per-machine records (`runnerState`, and chats when no sync
   folder is set), resolved through `Paths.js` like every other path; Application Support is not used by the app.

## 6. Architecture

### 6.1 Files (all new unless marked)

| File | Responsibility |
|---|---|
| `macos/ZoteroLauncher/Reader/FoldCore.js` | Pure logic, ES5 syntax (regexes may use the `u` flag): the model (5.2), pieces (5.3), Topic cards, the role filter's runs, word indexing, the link map, crops, coverage (5.5), marks (5.6: create, re-anchor, parse, serialize), level and key tables. No `window`, `document`, `webkit`, no timers. `module.exports` when `module` exists. Loaded by JavaScriptCore (Glue), the page and Node. |
| `macos/ZoteroLauncher/Reader/FoldView.js` | The page: draws from FoldCore's output, the morph, panes, selection bar, margin, PDF pane, follow, keys, states, live region. Talks only to a host object (6.3). No `webkit`. |
| `macos/ZoteroLauncher/Reader/FoldBridge.js` | The Mac host: `window.FR` (the functions the app calls) and `post` through `webkit.messageHandlers.fold`, falling back to `window.FR_SENT` (a browser, the checks). |
| `macos/ZoteroLauncher/Reader/FoldReader.css` | The page's style, on the review table's custom properties (6.6). |
| `macos/ZoteroLauncher/Reader/FoldWebView.swift` | `NSViewRepresentable`, as `ReviewWebView`: the shell (CSS, then FoldCore + FoldView + FoldBridge as one script allowed by its hash), the CSP, the `fold` message handler (weak), the `zlfold` scheme handler, navigation cancelled, theme kept in step. |
| `macos/ZoteroLauncher/Reader/FoldPDF.swift` | PDFKit on a serial queue: open, sizes, words (5.4), page images (6.2), an LRU of 12 images. |
| `macos/ZoteroLauncher/Reader/TextFoldClient.swift` | Section 4: discover, look up, fetch, fold, poll. Ephemeral URLSession, no cookies, no cache. |
| `macos/ZoteroLauncher/Reader/FoldStore.swift` | The folder of 5.6: read, atomic write, damaged-file rename; marks validated by `Glue.foldMarksText` (FoldCore in JSC). |
| `macos/ZoteroLauncher/Reader/FoldWindows.swift` | One window per paper (`"<libraryID>:<KEY>"`), as `ReviewWindows`: size kept (`ZLFoldWindowSize`), key monitor, ⌘W. |
| `macos/ZoteroLauncher/Reader/FoldWindowModel.swift` | One window's state: the paper (`/item`), its PDF path, the doc, the cache, TextFold's state, messages in and out. |
| `macos/ZoteroLauncher/Core/GlueFold.js` | `foldMarksParse(text)`, `foldMarksText(store)`, `foldLinksValid(links, doc, pdf)`, `foldMenuRow(details)`: thin wrappers on FoldCore. |
| `Core/Glue.js`, `Core/JSCore.swift`, `Core/Icons.swift` (changed) | the menu row and the `v` key row spliced in; FoldCore and GlueFold loaded; the row's symbol and the reader's icon map. |
| `Launcher/LauncherModel+Menu.swift`, `LauncherModel+Keys.swift` (changed) | `fold-read` handled before `ActionMap` (as `tasks-stop-all`, line 264); `v` in the paper's views. |
| `macos/js/tests/fold-*.test.js`, `macos/js/tests/fixtures/fold-reader/` | Node tests and the fixture (FIXTURE.md). |
| `macos/scripts/fold-reader-check.mjs` | The headless check, as `review-grid-check.mjs`. |
| `macos/ZoteroLauncherTests/FoldReaderTests.swift` | XCTest for PDFKit words and images, TextFold client (stubbed with `URLProtocol`), store, shell. |

`project.yml` needs no change: everything under `ZoteroLauncher/` is built, `.js` and `.css` bundled as resources
(as `Review/`). `PDFKit` is linked by `import PDFKit`.

### 6.2 Page images

`WKURLSchemeHandler` for `zlfold`, registered on the web view's configuration. `zlfold://page/<n>?w=<px>&d=<token>`:
`n` in `1...pages`, `w` rounded up to one of 600, 900, 1200, 1800, 2400, `d` this window's random token; anything
else 404. The page is drawn at that width (PDFKit, crop box, rotation applied) as PNG. The page asks for
`pane width × devicePixelRatio × zoom / crop width`, rounded up to a bucket; images are `loading="lazy"`.

### 6.3 Messages between the app and the page

Page to app, `window.webkit.messageHandlers.fold.postMessage({type, ...})`:

| type | payload | the app |
|---|---|---|
| `ready` | | sends `FR.load` |
| `prefs` | any of `level` (`full`, `brief`, `key`, `takeaway`, `topic`), `pdf` (bool), `pdfLeft` (bool), `pdfWidth` (300-760), `margin` (bool), `marginWidth` (160-420), `pdfZoom` (1-3) | merges into UserDefaults `ZLFoldPrefs` (this Mac, every paper) |
| `marks` | `{marks: <the whole marks store>}`, debounced 400 ms | validates (`foldMarksText`), writes `marks.json`; failure: `FR.flash("Not saved: " + why)` |
| `links` | `{links: <links.json object>}` | validates, writes `links.json` |
| `status` | `{from, to}` (`""`: none) | `launcher.setPaperStatus` (as the review window), then `FR.paper` |
| `task` | `{status}` (a task status id) | `launcher.setDefaultTask`, then `FR.paper` |
| `fold` | | starts folding (section 4), `FR.state` as it goes |
| `retry` | | TextFold looked up again, `FR.load` |

App to page, `evaluateJavaScript` in the page's world (as `ReviewWebView.call`):

| function | payload |
|---|---|
| `FR.load(o)` | `{paper: {key, libraryID, title, authors: [..], year, publication, cite}, status: {current, options: [names]}, task: {current, description, options: [{id, name}]} or null, taxonomies: [{name, labels: [..]}], doc: <textfold/doc> or null, state: {kind, ...} (section 9), saved: ISO or null (when the doc came from the cache), marks: <store> or null, links: <links.json> or null, prefs: {...}, pdf: (5.4)}` |
| `FR.state(s)` | a new state only (folding progress, TextFold gone) |
| `FR.words(batch)` | 5.4 |
| `FR.paper(o)` | `{status, task, taxonomies}` after a change |
| `FR.flash(text)` | the footer's flash |

### 6.4 Ready to move to `shared/`

FoldCore.js, FoldView.js and FoldReader.css must move to a top-level `shared/` (decision D3, PR #83) without edits:
FoldView is started as `FoldView.mount(rootElement, host)` with `host = {post(type, payload)}`; page image URLs come
from `pdf.urlPattern`; everything the app calls goes through `window.FR`, defined only in FoldBridge.js. A node test
fails if `FoldCore.js` names `window`, `document`, `webkit`, `setTimeout` or `requestAnimationFrame`, or
`FoldView.js` names `webkit`. Nothing climbs out of `macos/` (`scripts/check-boundaries.sh` passes).

### 6.5 TextFold's code

FoldCore ports, with attribution, TextFold's `tokens.py` (`WORD`, `STOP`, `norm`, `lcs_pairs`), `ladder.py`
(`locate`) and `web/reader.js` (`pdfNorm`, `indexWords`, `locate`, `boxesOf`), Apache License 2.0. FoldCore.js's
header names the files, the commit read, the licence and that they were changed; `macos/VENDORED.md` gets a row; the
Apache 2.0 text is kept at `macos/ZoteroLauncher/Reader/TEXTFOLD-LICENSE.txt`.

### 6.6 Style and theme

FoldReader.css uses the review table's custom properties, so `ThemeStore.shared.palette.reviewCSS` themes it with no
new Swift (`--ink`, `--muted`, `--faint`, `--line`, `--line2`, `--accent`, `--accent-soft`, `--win`, `--chrome`,
`--head`, `--sel`, `--status`, `--tax`, `--tax-soft`, `--task`); its own `:root` adds `--paper: var(--win)`, `--hl`,
`--hl-line`, `--f-paper: ui-serif, "New York", Georgia, serif`, `--f-ui: -apple-system, system-ui, sans-serif`
(no web fonts: the CSP loads nothing). Defaults (light / dark) for the reader's own: `--hl` `#fff1b8` / `#3d3410`,
`--hl-line` `#8a6d00` / `#e0c45c`.

## 7. The window and every element

The window: titled `Read · <cite>` (`Glue.paperCite`, e.g. `Read · Eloundou et al. (2023)`), opens at
`min(1440, 85% of the screen) × min(900, 85%)`, at least 760 × 480, its last size kept; opening the same paper again
brings its window forward. Layout, top to bottom: header, toolbar, the panes (text, divider, PDF; PDF on the right by
default), footer. Icons: web SVG strokes in `currentColor`, 18-unit view box, 1.5 stroke; shared concepts use the
exact path of `ReviewGrid.js`'s `ICONS` (24-unit box). Tooltips are `title` and `aria-label` alike unless noted.

### 7.1 Native

| Element | SF Symbol | Text | Key | States |
|---|---|---|---|---|
| Paper menu row `fold-read`, section This paper, after Open PDF in a new Zotero window | `text.book.closed` | label `Read with folds`; detail `TextFold's five levels beside its PDF`, or `TextFold's five levels (no PDF)`; trailing `window` | `v` (single-key mode), `⌥v` (Alt mode), in the paper's views only | available on a paper (not a note or a file); unavailable on a group library's paper, detail `Your own library's papers only, for now` |
| Keys view row (Glue.keyRows), after each `o  w` row | | `v` · `Read it with folds, in its own window` | | |

Icons.swift gains `readerConcept` (name to SF Symbol) for the page's own icons, used by the consistency test (7.2's
last column); every symbol named must exist (`NSImage(systemSymbolName:)`).

### 7.2 Header

| Element | Icon | Tooltip / label | Key | States |
|---|---|---|---|---|
| Title | | the paper's title (Zotero's, else the doc's), serif 19 px 600 | | wraps |
| Byline | | `Authors · year · publication · N pages` (4 authors, then `et al.`) | | parts missing are left out |
| Status pill | concept `status` (flag) | `Status: <name>` / `No status`, `aria-haspopup="menu"` | `⌥→` `⌥←` next / previous | outlined in `--status`, 1.5 px; menu: `No status` then the statuses, the current one `aria-checked` and a `✓`; none set up: one disabled item `Set up statuses in the launcher: Settings › Paper status` |
| Task pill | concept `task` (checklist) | `Task: <status name>` (tooltip adds the description) / `No task` | `⇧⌥→` `⇧⌥←` | outlined in `--task`; menu of the task statuses |
| Taxonomies | concept `tax` (tag), `title="Taxonomies"` | each taxonomy's name (muted 12 px), then its labels as pills (`--tax-soft` fill, `--tax` text) | | absent when the paper has none |

### 7.3 Toolbar

| Element | Icon (SVG) | Tooltip | Key | States |
|---|---|---|---|---|
| Group caption over 1-2 | text `Aa` in the serif, solid underline | `The paper's words` | | |
| Group caption over 3-5 | concept `ai` (sparkle), dashed underline | `Written by AI (<model>, <levels_made date>)`; local: `Not written by a model yet: the paper's first sentences` | | |
| Full | four lines, the last short | `Full: every paragraph as written · 1` | `1` | `aria-pressed`; pressed: 1.5 px ink border, ink colour; a small `1` beside the icon |
| Brief | two lines and three dots | `Brief: key sentences, verbatim · 2` | `2` | as above |
| Key | one thick line over one thin, shorter | `Key: each paragraph's point and its reason · 3` | `3` | |
| Takeaway | one thick line | `Takeaway: one line per paragraph · 4` | `4` | |
| Topic | four rounded squares | `Topic: a map of the paper, one card per section · 5` | `5` | |
| PDF pane | document with folded corner and three lines (`readerConcept.pdf` = `doc.richtext`) | `PDF beside the text · ⌥⌘P` | `⌥⌘P` | pressed when shown; disabled at Topic (`The PDF shows beside levels 1 to 4`) and without a PDF |
| Swap sides | two opposite arrows (`arrow.left.arrow.right`) | `Move the PDF to the left` / `to the right` | | disabled when the PDF is hidden |
| Margin | concept `panel` (sidebar.right) | `Margin: links and notes · ⌥⌘M` | `⌥⌘M` | pressed when shown |
| Role filter | the role's shape, then its name (`claim`) | `Show only claim paragraphs` | | one at a time; pressed again: off |

Roles and shapes: claim ◆, gap ◇, method ■, setup □, result ▲, analysis ●, limitation ▼, context ○ (any other role
is context). Only roles the paper has get a button, in that order.

### 7.4 Text pane

| Element | Icon | Label | Key | States |
|---|---|---|---|---|
| Pane | | `role="document"`, `aria-label="Paper text"`, focusable | | focus ring 2 px accent |
| Section heading | | `num` (faint) and title; depth 1: 18 px, depth 2: 15 px; 1 px rule under it | | |
| Section takeaway | | under the heading at Key and Takeaway, sans 14 px, muted | | |
| Role shape | the role's shape, 12 px | button `Open this paragraph in full (<role>)`; at Full a plain `role="img"` with the role's name | `↵` on the selected paragraph | |
| Paragraph body | | selectable text, never a button | click: select; double-click: open (below Full) | selected: `--sel` tint and a 3 px solid bar at its left; followed: a 2 px dashed tick at its left; dimmed never |
| Opened in place | | a bordered card, the line `Opened in place`, serif at Full | | |
| Fold back | two inward diagonal arrows (`arrow.down.right.and.arrow.up.left`) | `Fold back · esc` | `esc` | on an opened card |
| Notes count | concept `note` and the number | `Show the margin to see the notes on this paragraph` | | only while the margin is hidden and the paragraph has marks |
| Filter stub | the shapes of the hidden roles | `N paragraphs not shown: <roles>` and a `Show them` button (clears the filter) | | one line per run of hidden paragraphs |
| Highlight | | background `--hl`, inset 2 px underline `--hl-line` | | on every piece of the range |
| Lost words | | | | a range whose words are not at this level shows nothing; its margin card says `At Full and Brief` |

Topic (level 5) replaces the column with a grid of cards (`minmax(250px, 1fr)`): the section's num and title, its
takeaway (muted), and one chip per unit (its shape and its topic words) with tooltip `Open at Key`; a click opens Key
on that unit. A section without units is a heading row. The first back-matter section is replaced by one button,
`▸ Show appendices and back matter (N sections)` / `▾ Hide appendices and back matter (N sections)` (`1 section`
when one), `aria-expanded`; the choice holds for the window.

### 7.5 Selection bar

Appears 42 px above a selection inside the text pane (kept inside the pane), dark (`--ink` background, `--win`
icons), `role="toolbar"`, `aria-label="Selected text"`; buttons keep the selection (mousedown prevented).

| Button | Icon | Tooltip | Key | States |
|---|---|---|---|---|
| Highlight | marker over a baseline (`readerConcept.highlight` = `highlighter`) | `Highlight · h` / `Remove the highlight · h` | `h` | pressed when the whole selection is highlighted (then removes it); disabled per 5.6 |
| Note | concept `note` | `Note · n` | `n` | opens the margin if hidden, focuses the new note's box |
| Ask | concept `chat` (bubble) | `Ask · c` | `c` | as Note, an Ask card |

### 7.6 Margin pane

A column at the right of each paragraph (`aside`, `aria-label="Margin"`), width 220 px (160-420), its divider a
1 px line with an 11 px hit area (`Resize the margin. ← → resize, double-click resets.`; `←` `→` 20 px, `⇧` 80 px).
Contents per paragraph, at Key, Brief and Full: argument links (`→ supports §2.1 · <the target's topic>`, a button
that selects and scrolls to the target), then mark cards: concept icon and kind (`Note`, `Ask`), the quote (serif,
italic, 140 characters at most), a text box (`Your note…` / `Ask about this passage…`), and remove (`✕`, label
`Remove this note`). Removing a card with text asks inline: `Delete this note?` with `Delete it` and `Keep it`; an
empty one goes at once. An Ask card says `Kept here: asking the chat from the reader comes in a later version`. A
top group `Lost their place (N)` lists marks that could not be re-anchored.

### 7.7 PDF pane

| Element | Icon | Tooltip | Key | States |
|---|---|---|---|---|
| Divider | 2 × 28 px grip | `Resize the PDF pane. ← → resize, double-click resets.` | `←` `→` 20 px, `⇧` 80 px | width 470 px (300-760) |
| Zoom out / in | magnifier with minus / plus (`minus.magnifyingglass`, `plus.magnifyingglass`) | `Zoom the PDF out · ⌘ scroll` / `in` | pane focused: `-`, `=` or `+` | 1 to 3, step 0.25; ⌘ scroll: `deltaY / 400`, on a non-passive listener with `preventDefault` |
| Zoom label | | `Fit` at 1, else `150%` | | |
| Fit width | horizontal double arrow (`arrow.left.and.right`) | `Fit the page width` | `0` | pressed at 1 |
| Page label | | `p. 3 of 36` (the selected or followed unit's page, else the page at the top) | | |
| Coverage | `⚠` (U+26A0 U+FE0E, text presentation, never the emoji form) when under 30% | `Linked 11 of 12 paragraphs` | | section 9 |
| Close | `✕` | `Hide the PDF · ⌥⌘P` | | |
| Page | | image `alt="PDF page N"`, white, its crop shown | | lazy |
| Unit box | | button `Go to this paragraph: <its first 6 words>` | click | selected: 2 px solid accent outline and a soft fill; followed: 2 px dashed outline; else invisible until hover |

### 7.8 Footer and keys panel

Left: the flash, else the hints `? keys  ·  1…5 level  ·  ⌘ scroll folds, zooms the PDF  ·  j k paragraph  ·  ↵ open
·  esc fold back  ·  ⌘W close`. Right: the level, `Full · the paper's words` / `Key · written by AI, each line opens
to the paper`. `?` or F1 shows a keys panel (every key of section 8, ending with `⌘W close`); esc hides it.

## 8. Interaction rules

1. **Levels.** `1`-`5`, the dial, `-` (coarser) and `=`/`+` (finer) with the text pane focused, ⌘ scroll over the
   text (one step per 70 px of accumulated `deltaY`). A level change closes opened paragraphs, the selection bar and
   menus, and keeps the paragraph at the reading line (25% of the pane, at most 140 px down) where it was. The level
   is kept (`prefs`) for the next paper.
2. **Morph.** Before the change, the rectangles of pieces within 300 px of the viewport are recorded; after it,
   each piece in that band with a recorded id animates from its old place (translate and a scale clamped to 0.6-1.6,
   560 ms, `cubic-bezier(.22,.7,.2,1)`); a new piece fades in (opacity 0 until 40%, 560 ms). Pieces outside the
   band are not animated. Reduced motion: nothing animates, scrolls jump.
3. **Open in place.** The role shape, a double-click below Full, or `↵` on the selected paragraph shows it at Full in
   a card, others unchanged; esc, Fold back or a level change folds it back. At Full a double-click selects a word as
   usual.
4. **Select.** A click on a paragraph (with no text selected) selects it: tint, bar, and the PDF scrolls so its first
   box sits at 18% of the pane (smoothly unless reduced motion), solid outline. `j` / `k` select the next / previous
   paragraph. A click on a unit box selects that paragraph and scrolls the text to it (110 px from the top);
   following is paused for 900 ms so the scroll does not move the PDF back.
5. **Follow.** While the text scrolls (at most every 140 ms, from cached offsets, no layout read per piece), the
   paragraph at 30% of the pane is followed: a dashed box on the PDF and a tick beside it; the PDF scrolls only if
   that box is out of sight. Off at Topic and when the PDF is hidden.
6. **Marks.** Mouse-up with a selection inside the text shows the bar; a click elsewhere, esc or a level change hides
   it. Highlight, Note, Ask follow 5.6; the store is posted (`marks`) 400 ms after the last change. A flash says what
   happened: `Highlighted`, `Highlight removed`, `Note added: type it in the margin`, `Question kept in the margin`.
7. **Status and task.** The pill's menu (↑↓, ↵, esc) or `⌥→←` / `⇧⌥→←` change them through the launcher (shown
   at once, saved a second after the last change); the flash says `Now: <status>`. These are the app's existing
   writes (a status tag, `todos.json`), nothing new.
8. **Panes.** `⌥⌘P` PDF, `⌥⌘M` margin, swap, both dividers; all kept in `prefs`.
9. **Window keys** (Swift, as `ReviewWindowModel.windowKey`): `⌘W` close; `⌘-` `⌘+` `⌘0` text size (`ZLFoldZoom`, the
   review steps); `⌘R` TextFold looked up again; `⌘C` `⌘A` editing keys; esc never closes the window.
10. Nothing in the page loads from the network; links in the text are text.

## 9. States and copy

Shown in the text pane (a title line and a sentence, an action button where there is one); the PDF pane shows the
PDF in every state that has one. Copy is exact.

| kind | Title | Sentence | Button |
|---|---|---|---|
| `loading` | `Opening the paper…` | | |
| `no-textfold` | `TextFold isn't running` | `The reader shows the levels TextFold writes. Start TextFold on this Mac, then try again.` | `Try again` (`⌘R`) |
| `no-textfold` with a cached doc | (a banner over the text) | `TextFold isn't running: these are the levels saved on <date>.` | `Try again` |
| `zotero-off` | `TextFold can't reach Zotero` | `Start Zotero, and in Zotero turn on Settings › Advanced › Allow other applications on this computer to communicate with Zotero.` | `Try again` |
| `not-folded` | `TextFold hasn't folded this paper yet` | `Folding reads the paper and asks TextFold's model to write its levels. It uses TextFold's model and can take a few minutes.` | `Fold it with TextFold` |
| `folding` | `TextFold is folding this paper` | `<stage>: <done> of <total>. You can read the PDF meanwhile.` (`queued`: `Waiting for TextFold's other work.`) | |
| `local-only` | (a banner) | `No model has written these levels yet: Key, Takeaway and Topic show the paper's first sentences.` | `Fold it with TextFold` |
| `needs-engine` | `This PDF is a scan` | `TextFold needs its PDF engine to read it: install the engine in TextFold's Settings, then fold again.` | `Fold it with TextFold` |
| `no-model` | `TextFold has no model` | `Choose a model in TextFold's Settings, then fold again.` | `Fold it with TextFold` |
| `no-file` | `TextFold found nothing to read` | `This paper has no PDF TextFold can read and no text online.` | |
| `fold-failed` | `TextFold couldn't fold this paper` | `<TextFold's error, first 300 characters>` | `Try again` |
| `group-library` | `Your own library's papers only, for now` | `Papers in group libraries come in a later version.` | |
| `bad-format` | `This TextFold is newer than the reader` | `It writes format <format> version <n>: update the Zotero Launcher to read it.` | |

PDF pane: `no-pdf` `This paper has no PDF attached: the text reads on its own`; `missing` `The PDF file is missing
from disk`; `unreadable` `Couldn't open the PDF: <why>`; `no-text` `This PDF has no text layer (a scan): the panes
can't be linked, but you can read both`; under 30% coverage, in the pane's bar: `⚠ Linked 3 of 12 paragraphs (25%):
this PDF may not be the text TextFold folded`. Flashes: sentence case, no final period, curly quotes around names,
paths with `~`.

## 10. Accessibility

- **Roles and labels:** as in section 7. The dial is `role="group"` `aria-label="Level"`, each button
  `aria-pressed` and `aria-keyshortcuts`; the role filter a group `Paragraph roles`; the selection bar a toolbar; the
  PDF pane a `section` `Original PDF`; menus `role="menu"` with `menuitemradio`. A polite live region says the level
  after each change (`Key: each paragraph's point and its reason`) and each flash.
- **Focus:** Tab order header, toolbar, text pane, margin, PDF pane, footer; every control reachable and visible on
  focus (2 px accent ring, 2 px offset); the selection bar's buttons are reachable by Tab while it shows; a menu
  returns focus to its pill.
- **Never colour alone:** pressed is a border; selected a bar plus tint; followed is dashed where selected is solid;
  highlight a fill plus an underline; citations an underline; the AI group a dashed rule and a sparkle, the paper's
  words a solid rule and `Aa`; roles shape and word; the coverage warning `⚠` and words.
- **Contrast** (text at least 4.5:1, measured on the defaults by a test): `--ink`, `--muted`, `--accent` on
  `--win`, `--paper` and `--sel`; `--ink` and `--muted` on `--hl`; `--win` on `--ink` (the selection bar). Light
  defaults: ink `#1b1f2a`, muted `#5d6475`, accent `#2f6fdf`, win `#ffffff`, sel `#e8f0fe`; dark: ink `#e6e9f0`,
  muted `#a3aabb`, accent `#6b9bf2`, win `#1a1e27`, sel `#22314d`.
- **Reduced motion:** no morph, no fade, no smooth scroll.
- **Text size:** `⌘-`/`⌘+` scale the whole page; nothing is clipped at 200%.

## 11. Performance budgets

Measured in the Playwright check (Chromium, the dev container, no throttling) on the synthetic 40-page doc of
FIXTURE.md (about 240 units, 37000 tokens, about 39 pages), median of 5 runs, through `performance.mark` names the page sets
(`fr:level`, `fr:animate`, `fr:settled`, `fr:loaded`, `fr:painted`):

| Budget | Limit |
|---|---|
| keydown to the first `animate()` of a level change | 100 ms |
| keydown to every unit drawn at the new level (`fr:settled`) | 1000 ms |
| pieces animated in one change | at most 1500, all within 300 px of the viewport |
| `FR.load` to the first screen painted | 300 ms |
| `FoldCore.linkMap` for 40 pages of words (node) | 500 ms |
| `FoldCore.model` for the 40-page doc (node) | 200 ms |
| words of 40 generated pages (XCTest, CI Mac) | 2 s |
| one page image at 1200 px (XCTest) | 150 ms |

How (binding on the implementation): units far from the viewport use `content-visibility: auto` with an intrinsic
height; on a level change the units within two screens are redrawn at once and animated, the rest in idle chunks of
at most 8 ms, the reading line's paragraph kept in place after each chunk; follow uses cached unit offsets and a
binary search.

## 12. Acceptance criteria

Each is checked by a node test `[node]`, the Playwright check `[pw]`, XCTest `[swift]` or reading the code `[read]`.

Core and data

1. `[node]` FoldCore.model on the fixture yields 8 units in 5 sections, with `sents`, `ev`, `tn`, `topic` per FIXTURE.md's expected table.
2. `[node]` Tokens of `S1.p1.1` sentence 0 are exactly FIXTURE.md's list; `[1, 2]` and `(Lee et al., 2021)` are `cite`; `$s = n / N$` is one `math` token.
3. `[node]` The abstract's key alignment is exactly `(0,3) (1,17) (2,19) (4,21) (7,24) (8,25) (9,26)`.
4. `[node]` Every key token with `m`: `norm` equal to the full token's, `m` in an evidence sentence, `m` increasing.
5. `[node]` `tn` and topic `k` match FIXTURE.md for every unit and section.
6. `[node]` Piece ids per level for the abstract match FIXTURE.md's golden list; the Topic chip's ids are `abstract1.1:24`, `abstract1.1:25`.
7. `[node]` Brief of `S2.p1.1` has a gap piece `S2.p1.1:gap2` between sentences 0 and 2.
8. `[node]` Tones: at each level the `ink` pieces are exactly the ones the next level keeps (5.3).
9. `[node]` Back matter: `A1` is back matter, every section before it is not.
10. `[node]` A doc with `version: 1`, a bad id, or more than 5000 units is refused with `bad-format`.
11. `[node]` A sentence containing `<b>x</b> & <script>` comes out as plain token text (no markup survives as markup).

Links

12. `[node]` On the fixture's fake words every unit except `S2.SS1.p2.1` (left out) and `A1.p1.1` (garbled) is linked: coverage 6 of 8.
13. `[node]` The hyphenated `skim-` / `ming` in the fake words is joined and `S1.p1.1` still links.
14. `[node]` `garbleAll` words give coverage under 30% and the warning flag.
15. `[node]` Every box is within 0 to 1 and on the unit's page or carries its page; crops contain all their page's word boxes.
16. `[node]` `linkMap` output round-trips through `links.json` and `foldLinksValid` refuses another doc's or PDF's file.
17. `[node]` 40-page budget for `linkMap` and `model` (section 11).

Marks

18. `[node]` A selection of Brief pieces anchors to their full indices; of Key pieces with `m` to their min and max; of AI pieces without `m` to the whole unit, Highlight disabled.
19. `[node]` A highlight on full tokens 24-25 of the abstract is on the pieces at Full, Brief, Key, Takeaway and the Topic chip.
20. `[node]` Re-anchoring: an unchanged doc keeps every mark; a doc whose sentence moved to another unit moves the mark; a deleted quote leaves it in Lost their place.
21. `[node]` `foldMarksParse` drops invalid marks and unknown keys, caps at 5000, and reports a non-JSON text as damaged.
22. `[swift]` A damaged `marks.json` is renamed `marks.json.damaged-<stamp>`, never overwritten; writes are atomic.
23. `[read]` Marks live in `<runnerState>/fold-reader/<libraryID>-<KEY>/`, resolved through `pathsJSON["runnerState"]`; nothing is written to the sync folder.

Page (Playwright on the fixture)

24. `[pw]` The page says `ready`; FR.load draws the header (title, byline, status pill with its flag icon, task pill, taxonomy group with names and pills).
25. `[pw]` Keys 1-5 set the level, `aria-pressed` follows, a `prefs` message carries the level, the live region says it.
26. `[pw]` A level change animates only pieces in the viewport band (`document.getAnimations()`), and none with `prefers-reduced-motion: reduce`.
27. `[pw]` Full uses the serif for the paper's words; Key, Takeaway, Topic use the sans for AI words.
28. `[pw]` The role shape and a double-click open a unit at Full in place; esc folds it back.
29. `[pw]` A click on a paragraph tints it, adds the solid bar, outlines its PDF box solid and scrolls the PDF.
30. `[pw]` Scrolling the text moves the dashed box and the tick to the paragraph at 30%; the solid one stays on the selection.
31. `[pw]` A click on a unit box selects that paragraph and scrolls the text to it.
32. `[pw]` Selecting text shows the bar with three labelled buttons; Highlight adds `.hl` pieces and posts `marks`; switching levels keeps them on the same ids.
33. `[pw]` Note and Ask open the margin, add a card with the quote and focus its box; Ask shows the later-version line.
34. `[pw]` Removing a card with text asks `Delete this note?`; Keep it keeps it; Delete it removes it.
35. `[pw]` The role filter collapses other paragraphs into stubs naming their roles; Show them clears it.
36. `[pw]` Topic shows 4 cards (abstract, S1, S2, S2.SS1) and one button `▸ Show appendices and back matter (1 section)`; pressing it shows A1's card and turns it into `▾ Hide ...`; a chip opens Key with its unit at 120 px from the top.
37. `[pw]` The swap button moves the PDF left and back; dividers resize by drag and by `←` `→`, reset on double-click, within their limits.
38. `[pw]` ⌘ scroll over the PDF zooms (the event is cancelled); over the text it changes level.
39. `[pw]` The PDF pane is hidden at Topic and the PDF button disabled with its tooltip.
40. `[pw]` Each state of section 9, sent by FR.state, shows its exact title, sentence and button; buttons post `fold` or `retry`.
41. `[pw]` The coverage warning shows with `⚠` for the garbled words payload.
42. `[pw]` No console errors; no request leaves the page (the CSP blocks; the check counts requests).
43. `[pw]` Every button and pill has an accessible name; Tab reaches every control in order.
44. `[pw]` Performance budgets of section 11 for the page.
45. `[node]` Default tokens meet the contrast pairs of section 10.
46. `[node]` FoldView's shared icons (`status`, `task`, `tax`, `note`, `chat`, `ai`, `panel`) use the same paths as ReviewGrid.js's `ICONS`.
47. `[node]` FoldCore.js names no `window`, `document`, `webkit`, timers; FoldView.js no `webkit`.
48. `[read]` No emoji in the UI, no em dash in any text or doc of the feature.

Native

49. `[swift]` A PDF generated in the test (CoreText, known words at known places, one page rotated 90°) gives the words, in order, with boxes within 0.01 of the expected normalized ones.
50. `[swift]` The scheme handler serves a PNG of the right width for a valid URL and 404 for a wrong token, page or width.
51. `[swift]` The shell's CSP is exactly `default-src 'none'; style-src 'unsafe-inline'; img-src zlfold:; script-src 'sha256-<hash>'` and the hash matches the script.
52. `[swift]` TextFoldClient, with `URLProtocol` stubs: reads `server.json` in order, refuses a non-loopback URL, falls back to 3017, maps every reply of section 4 to its state, follows `moved` jobs, sends no `Origin`.
53. `[swift]` The page's `marks` message writes the file; `status` calls `setPaperStatus` with the paper.
54. `[node]` `Glue.menu` puts `fold-read` after `window` in This paper for a paper, not for a note or a file; `Glue.keyRows` has the `v` row after each `o  w` row.
55. `[swift]` `v` in the paper's menu opens the reader window for that paper; again brings the same window forward; `fold-read` is not in `ActionMap.handlers` (parity.sh still passes).
56. `[swift]` `Icons.symbol(rowId: "fold-read")` and every `Icons.readerConcept` symbol exist.
57. `[read]` `scripts/check-boundaries.sh`, `node --test js/tests/*.test.js` and `macos/scripts/parity.sh` (CI's phases) pass.
58. `[read]` `macos/VENDORED.md` has the TextFold row and the licence file is present.
59. `[read]` No fixture or test contains text of the Eloundou et al. paper.
