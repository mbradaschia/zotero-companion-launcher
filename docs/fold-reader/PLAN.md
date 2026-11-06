# The fold reader: plan

What gets built in which phase, and R1's and R5's tasks in order. The behaviour is in [SPEC.md](SPEC.md) (R1) and
[R5-SPEC.md](R5-SPEC.md) (R5, which replaces SPEC's TextFold sections), the test data in [FIXTURE.md](FIXTURE.md). Each phase ends with its tests green, `scripts/check-boundaries.sh` and `macos/scripts/parity.sh`
passing, a UX consistency review (`.claude/agents/ux-consistency-reviewer.md`) and Marcelo's look.

## Phases

| Phase | Adds | Needs first |
|---|---|---|
| **R1** | The reader window from a paper's menu (`Read with folds`, `v`); the five levels and the morph; header with status, task and taxonomies; PDF pane (PDFKit images, crop, zoom, swap, divider, link map by 3-word runs, coverage, follow); highlights, notes and Ask kept on this Mac; margin; every TextFold state; node tests, the Playwright check, XCTest | nothing |
| **R2** | Ask sent to the paper's chat window with the question and its passage as the draft (`ChatWindowModel.draft`, the user presses ↵); ~~TextFold's own `/api/pdfmap` for `pdf-` docs~~ (obsolete: R5 reads the PDF itself, its boxes exact); several PDFs (a picker); group libraries (their group id from the bridge, a new field); find in the text (⌘F); ~~stop a fold~~ (in R5); the reader's tokens in `ThemeTests` (contrast of `--hl`, `--sel` in every theme); a translation picker (`lang`) | Marcelo's yes on the chat draft wording |
| **R3** | Marks synced between machines: a `reader/` entry in `contracts/Paths.js` `SYNCED`, its fixtures, SYNC-FORMAT.md, a by-mark merge in `Merge.js` (tombstones as todos), anchors with the sentence's text so another machine's fold can re-anchor them | Marcelo's yes (a contract change, both launchers' tests) |
| **R4** | Highlights and notes into Zotero: a bridge route to write annotations (or a child note) for one paper, never in bulk, with a confirm view naming the paper and the count, and an undo; the docked chat in the reader (ReviewWindowModel+Chat.swift's slot layout made shared) | Marcelo's yes for each kind of write |
| **R5** | Our own folding, TextFold gone ([R5-SPEC.md](R5-SPEC.md)): the PDF read by PDFKit into the doc (`FoldMake.js`, exact boxes); the runner's `fold` command (TextFold's prompts, ported) on the prompts model; stop, finish, retry, fold again; every state without TextFold; `TextFoldClient.swift` deleted. Pulled ahead of R2 to R4 | nothing (scans and CJK stay out) |
| **R6** | The Lists rail: the collapsed 46 pt rail of PR #84 on the reader window's left, its entries opening the launcher's places | PR #84 merged |
| **R7** | The Omarchy move: FoldCore.js, FoldMake.js, FoldView.js, FoldReader.css to `shared/`, `runner/lib/fold.mjs` copied into `daemon/`, the lines payload made from `pdftotext -bbox-layout` (R5-SPEC 9) (decision D3, PR #83); the Omarchy launcher's own host (a WebEngineView bridge with `post` and `window.FR`) | PR #83 merged |

## R1: tasks in order

One agent, one session. Each task ends with its tests passing; nothing is committed half-done. Paths are from the
repository root. Node tests run with `cd macos && node --test js/tests/*.test.js`.

### 1. The fixture

- Create `macos/js/tests/fixtures/fold-reader/doc.json` (FIXTURE.md section 1, byte for byte) and
  `macos/js/tests/fold-fixture.js` (`fakeWords`, `bigDoc`, `blankPage`, FIXTURE.md sections 3 and 4).
- Proves it: `macos/js/tests/fold-fixture.test.js`: the doc parses, 8 units, every takeaway starts its key, every
  topic is inside its takeaway; `fakeWords` defaults give 2 pages and the `skim-`/`ming` pair; `bigDoc` gives 240
  units and 34 to 46 pages; no fixture file contains `Eloundou` or `GPTs are GPTs` (SPEC criterion 59).

### 2. FoldCore: the model and the levels

- `macos/ZoteroLauncher/Reader/FoldCore.js`: validation (SPEC 5.1 limits), tokens with `cite` and `math`, sentences,
  `norm`, `lcs_pairs`, `locate`, `tn`, back matter, `model(doc)`, `pieces(unit, level)`, Topic cards, the role
  filter's runs, the level table (names, keys, tooltips, fonts). Header comment with TextFold's attribution (SPEC
  6.5); `macos/ZoteroLauncher/Reader/TEXTFOLD-LICENSE.txt`.
- Proves it: `macos/js/tests/fold-core.test.js`: SPEC criteria 1 to 11 against FIXTURE.md section 2; 17 (the
  `model` half); 47 (no `window`, `document`, `webkit`, timers in FoldCore.js).

### 3. FoldCore: the link map

- `indexWords`, the 3-gram index, `locate`, `boxesOf`, `crops`, `coverage`, `linkMap(model, pages)`, the
  `links.json` object and its validity check.
- Proves it: `macos/js/tests/fold-links.test.js`: criteria 12 to 17.

### 4. FoldCore: marks

- From selected piece ids to an anchor; ranges to pieces at each level; re-anchoring; `parseMarks(text)` (with
  `damaged`), `marksText(store)`, limits.
- Proves it: `macos/js/tests/fold-marks.test.js`: criteria 18 to 21.

### 5. The page

- `macos/ZoteroLauncher/Reader/FoldReader.css`, `FoldView.js` (`FoldView.mount(root, host)`), `FoldBridge.js`
  (`window.FR`, `post`). Start from the mockup's logic (`snapshot`, `componentDidUpdate`'s morph, `readingOn`,
  `mark`, the panes, the dividers) rewritten as plain DOM code drawing with `textContent` only; the icon map with the
  shared concepts' paths copied from `ReviewGrid.js`.
- `macos/scripts/fold-reader-check.mjs`: the shell as FoldWebView builds it (one script, its hash, the CSP with
  `img-src data:` for the check), the fixture loaded with `blankPage` images and `fakeWords`, then every `[pw]`
  criterion (24 to 44) and the page budgets; `--doc`, `--gallery`, `--bbox` for real data (FIXTURE.md section 5).
  Skips with a message when Playwright is missing, as `review-grid-check.mjs`.
- Proves it: `node macos/scripts/fold-reader-check.mjs` all `ok`; `macos/js/tests/fold-page.test.js` for criteria 45
  (contrast of the defaults parsed from the CSS), 46 (shared icon paths equal ReviewGrid.js's) and 47 (no `webkit`
  in FoldView.js).

### 6. Glue and the launcher's entry point

- `macos/ZoteroLauncher/Core/GlueFold.js` (`foldMarksParse`, `foldMarksText`, `foldLinksValid`, `foldMenuRow`);
  `JSCore.swift` loads `FoldCore` (as `ReviewCore`, line 42) and adds `GlueFold.js` to `glue` before `Glue.js`;
  `Glue.js` merges it, splices the row into `menu` after `window` for a paper, and adds the `v` row in `keyRows`
  after each `o  w` row (as `⌘T` after `⌘S`).
- `LauncherModel+Menu.swift` `activateAction`: `fold-read` handled before `ActionMap`, as `tasks-stop-all` (never in
  `ActionMap.handlers`: `parity.sh` would fail); `LauncherModel+Keys.swift`: `v` in the paper's views, next to
  `o`, `w`, `n`, `#`; `Icons.swift`: `symbol(rowId: "fold-read")` = `text.book.closed`, and `readerConcept`.
- Proves it: `macos/js/tests/fold-glue.test.js` (criterion 54); XCTest in task 9 (55, 56).

### 7. Native: PDF and store

- `macos/ZoteroLauncher/Reader/FoldPDF.swift`: open on a serial queue, sizes, words (SPEC 5.4), images, the
  `zlfold` scheme handler and its LRU.
- `macos/ZoteroLauncher/Reader/FoldStore.swift`: the folder `<runnerState>/fold-reader/<libraryID>-<KEY>/`, atomic
  writes, the damaged-file rename, marks through `Glue.foldMarksText`.
- Proves it: `macos/ZoteroLauncherTests/FoldReaderTests.swift`: criteria 22, 49, 50, and the word and image budgets.

### 8. Native: TextFold

- `macos/ZoteroLauncher/Reader/TextFoldClient.swift`: discovery, lookup, doc, fold, jobs, each reply mapped to SPEC
  section 9's states; nothing runs a fold without the page's `fold` message.
- Proves it: `FoldReaderTests.swift` with a `URLProtocol` stub: criterion 52.

### 9. Native: the window

- `FoldWebView.swift` (shell, CSP, handler `fold`, scheme, navigation, theme as `ReviewWebView`), `FoldWindows.swift`
  (one per paper, size kept, ⌘W, the key monitor), `FoldWindowModel.swift` (the paper from `/item`, its first usable
  PDF, its path through `/attachment` with `target: "path"` and `markOpened: false`, the cache, TextFold, the
  messages of SPEC 6.3, status and task through `setPaperStatus` and `setDefaultTask`, prefs in `ZLFoldPrefs`,
  `UsageLog` counts `window:fold-reader` and `fold:<type>`).
- Proves it: `FoldReaderTests.swift`: criteria 51, 53, 55, 56; the menu row opens the window on the fixtures (the
  app's fixture mode, as the review tests).

### 10. Words and records

- `macos/VENDORED.md`: a row for TextFold's ported code (files, commit, Apache 2.0, what changed).
- `macos/docs/ux-conventions.md`: a short "The fold reader" section (levels and keys, never colour alone in the
  reader, its states' shape).
- `macos/README.md` and `CHANGELOG.md`: one line each, naming TextFold as what the reader needs.
- Proves it: criteria 48, 57, 58 read; the whole node suite, `scripts/check-boundaries.sh`, `macos/scripts/parity.sh` with
  CI's phases, and the check script, all green.

## R1 risks to watch

- **Alignment drift.** FoldCore rebuilds TextFold's word alignment from the public format; a TextFold change to its
  tokenizer would change which words fly, never what is shown. Pinned by FIXTURE.md's goldens.
- **Lookup by title.** `/api/zotero/items?q=` is a title search; an item whose title TextFold's Zotero search does
  not find shows `not-folded`. The cached doc id avoids the search after the first open.
- **Folding spends TextFold's model.** Only the explicit button starts it; the state says so before.
- **Big papers.** The budgets of SPEC section 11 are checked on `bigDoc`; if the 100 ms budget fails, redraw fewer
  units at once before touching the morph.
- **PDFKit text order** differs from PDF.js's on some multi-column PDFs; the 3-word-run vote tolerates order changes
  within a page, and coverage tells Marcelo when it did not work.
- **Playwright is not in CI** (as the review table's check): the check is the developer's and the validator's; CI runs
  the node tests and XCTest.

## R1 done means

The validator runs these from the repository root, in this order, and each one must pass:

```sh
(cd macos && node --test js/tests/*.test.js)          # criteria 1 to 21, 45 to 47, 54, 59
node macos/scripts/fold-reader-check.mjs              # criteria 24 to 44 and the page budgets ([pw])
scripts/check-boundaries.sh                           # FoldCore.js, FoldView.js stay host-free
(cd macos && scripts/parity.sh --phase 3b --phase 4a --phase 4b --phase 5 --phase 6 --phase 7 --phase 8 --phase 9)
                                                      # as macos.yml:39; fold-read is not in ActionMap
(cd macos && xcodegen generate && xcodebuild test -project ZoteroLauncher.xcodeproj -scheme ZoteroLauncher \
  -destination 'platform=macOS,arch=arm64' -only-testing:ZoteroLauncherTests/FoldReaderTests)
                                                      # criteria 22, 49 to 53, 55, 56 (as CI's macos.yml)
```

Then the `[read]` criteria (48, 57, 58) by reading the files they name, and a hand check on a real paper with
TextFold running: open from the menu and with `v`, every level with `1` to `5`, a highlight that survives closing
the window, the PDF following the text, and the not-running, not-folded and folding states by stopping TextFold or
picking an unfolded paper. Nothing in Zotero changes during the check (the item's modified date stays the same).

## R5: tasks in order

One agent, one session, after R1 (it is next: R2 to R4 wait). Each task ends with its tests passing. Criteria are
R5-SPEC section 11's (`R5-n`). Node tests run with `cd macos && node --test js/tests/*.test.js`.

### 1. The fixture

- `macos/js/tests/fold-fixture.js`: `fakePaper(options)`, `bigSection(n)` (FIXTURE.md 6.2); the files of FIXTURE.md
  6 (`fold-input.json`, `replies/`; `made.json`, `prompt-S1.txt`, `prompt-section.txt` once their code exists, tasks
  2 and 4).
- Proves it: `fold-fixture.test.js` grows: `fakePaper()` gives 3 pages, the stamp's boxes taller than wide, the
  `skim-` and `OCR-` line ends, `columns: 1` the same blocks; `pages: 40` gives 40; no fixture file holds a real
  paper's text (R5-45).

### 2. FoldMake: lines to the doc

- `macos/ZoteroLauncher/Reader/FoldMake.js` (R5-SPEC 3.2 to 3.4, its attribution header), FoldCore's small changes
  (3.3: token offsets, apparatus pieces, the coverage line, `not a fold doc`).
- Proves it: `macos/js/tests/fold-make.test.js`: R5-1 to R5-15; `made.json` written, read against FIXTURE 6.3, kept.

### 3. FoldMake: merge, input, view

- `foldInput`, `foldMerge`, `foldView`, `costText`; `GlueFold.js` wrappers and the new `foldMenuRow` details;
  `JSCore.swift` loads `FoldMake.js` after `FoldCore.js`.
- Proves it: `fold-make.test.js` R5-26; `fold-glue.test.js` updated (the row's details).

### 4. The runner's `fold`

- `macos/runner/lib/fold.mjs` (R5-SPEC 4, Appendix A, its attribution header), `fold` and `fold --plan` in
  `bin/oma-zotero-prompt.mjs` (the usage header too), `package.json` 0.3.0, `macos/runner/TEXTFOLD-LICENSE.txt`.
- Proves it: `macos/js/tests/fold-run.test.js`: R5-16 to R5-25 (fakes only; the end-to-end case as
  `review-run.test.js` runs its command, with a fake provider).

### 5. The page

- `FoldView.js`: 6.1's states, 6.2's banners, the Fold button and its confirm, the section lines, the AI caption,
  `FR.fold`, apparatus hidden, the keys panel's ⌘R; `FoldBridge.js` exports `fold`; `FoldReader.css` for the button
  and the confirm on the existing tokens.
- `macos/scripts/fold-reader-check.mjs`: criterion 40's table replaced by R5-27 and R5-28, then R5-29 to R5-34.
- Proves it: the check all `ok`; `fold-page.test.js` (no new colour token; the `ai` and `stop` icons are
  ReviewGrid.js's paths).

### 6. Native: lines, maker, store

- `FoldPDF.swift`: `lines`, `lines(of:)`, `sha256()`; `FoldMaker.swift`; `FoldStore.swift`: `fold.json`, a damaged
  `doc.json` kept aside.
- Proves it: `FoldReaderTests.swift`: R5-35, R5-36, R5-37, the `lines` budget of R5-40.

### 7. Native: the window

- `FoldWindowModel.swift`: TextFold out; open, identity, extraction, plan, fold, merge, stop, close (R5-SPEC 5.1);
  `TextFoldClient.swift` and its tests deleted; `FixtureRunner.swift` and its two fixture files.
- Proves it: `FoldReaderTests.swift`: R5-38, R5-39, R5-40, R5-41.

### 8. Words and records

- `macos/VENDORED.md` (rows for `FoldMake.js` and `runner/lib/fold.mjs`), `TEXTFOLD-LICENSE.txt`'s first lines,
  `macos/docs/ux-conventions.md`'s fold reader section (levels written by the prompts model, `Fold with AI` the only
  thing that spends it, ⌘R reads again), `macos/README.md`'s Reading with folds, `CHANGELOG.md`'s next entry
  ("the reader folds a paper itself, from its PDF, with your AI model"), none naming TextFold but as attribution.
- Proves it: R5-42 to R5-45 read; then R5's done means, below.

## R5 risks to watch

- **PDFKit's fonts.** `attributedString` may lack font attributes or report a matrix-scaled size; the height fallback
  covers it, and R5-35 pins it on CI. Headings found only by size get weaker then: numbered headings still work.
- **Layouts the rules don't know** (three columns, sidebars, a figure's text read as paragraphs, a table set as
  prose): the units are still the paper's words with exact boxes, only grouped worse. Tuning goes into FoldMake's
  thresholds, kept by the synthetic criteria; each change recorded under Deviations, in an R5 group of its own.
- **Cost and time.** A 40-page paper is about 15 calls; the plan says how many before anything is sent, and the price
  when the provider lists one. Subscriptions (two at a time) are slower than API keys (four).
- **Model replies.** Small local models miss the JSON more often: one repair, then that section keeps its first
  sentences and can be retried; nothing breaks the doc.
- **An old runner.** The app's runner updates itself when bundled newer; until then `fold` is unknown and the window
  says `The AI features are older than the app`.
- **R1 docs kept (D9)** use the word vote for links, with R1's coverage; Fold again replaces them.

## R5 done means

From the repository root, in this order, each passing:

```sh
(cd macos && node --test js/tests/*.test.js)          # R5-1 to R5-26 (and R1's node criteria still)
node macos/scripts/fold-reader-check.mjs              # R5-27 to R5-34 and R1's other [pw] criteria
scripts/check-boundaries.sh
(cd macos && scripts/parity.sh --phase 3b --phase 4a --phase 4b --phase 5 --phase 6 --phase 7 --phase 8 --phase 9)
(cd macos && xcodegen generate && xcodebuild test -project ZoteroLauncher.xcodeproj -scheme ZoteroLauncher \
  -destination 'platform=macOS,arch=arm64' -only-testing:ZoteroLauncherTests/FoldReaderTests)
                                                      # R5-35 to R5-41 (on macOS CI)
```

Then the `[read]` criteria, and a hand check on the Mac with a real two-column paper and a provider set up: open
with `v`, the text and its first-sentence levels at once, the banner naming the model and the request count, Fold
with AI filling sections as they come, Stop midway and Finish folding (Processes shows the run), Fold again's
confirm, a key turned off (the `ai-key` banner), a scan, and no TextFold anywhere on screen. Nothing in Zotero
changes (the item's modified date stays the same).

## Deviations

Found while building R1 (R5's go in a group of their own after these); each keeps its criterion's intent.

- **`bigDoc` lays out as 74 pages**, not the 34 to 46 FIXTURE.md estimates (its words fill pages more thinly than
  the estimate assumed). The fixture test asserts 70 to 80; the budgets are measured on it as it is, so the check is
  harder, not easier.
- **The light accent is `#2864d2`**, not `#2f6fdf`, so text in the accent keeps 4.5:1 on `--sel` (criterion 45). In
  the app the theme's `reviewCSS` supplies the accent, as the review table's.
- **`fold-failed`'s Try again posts `fold`** (TextFold is asked to fold again), not `retry` (which only looks the
  paper up, and would find the same failure).
- **FR.load's `pdf` carries `bytes` and `modified`** beyond SPEC 5.4, so `links.json` is checked against the PDF it
  was made from.
- **The headless check uses `img-src data:`** in place of `zlfold:` (no scheme handler in Chromium); everything else
  in the CSP is the app's, the script's hash included.
- **A group library is told by `library.type`** in the bridge's `/item` (`group`), else by a `libraryID` other than
  1, as no group id field exists yet (R2).
- **`v` works in two more places**: on the highlighted paper in the results (as `w` and `o` do), and the keys view's
  row after `o  w  n  #  x` lists it.
- **The folding state's stage is capitalized** (`Extracting: 3 of 12.`), as TextFold writes it lower case.
- **The byline uses the doc's authors** when TextFold gives them, else the bridge's.
- **Narrow windows keep 420 px for the paper's words** (the validation's finding): the margin folds away first (unless
  asked for), then the PDF narrows to 220 px (below its 300 px drag minimum), then the margin to 160; the widths kept
  in `ZLFoldPrefs` come back as the window widens.
- **The rows are not `content-visibility: auto`**: its paint containment hid the selection's bar and the follow tick, and
  its size estimates made follow and the reading line drift on long papers. The rows draw in idle chunks instead; the
  budgets hold on `bigDoc` (about 400 ms to every unit drawn).
- **A same-paper `FR.load` keeps the page's state** (level, place, selection, opened paragraphs and the marks it holds),
  since the app sends the whole window again on every change; a new doc of the paper keeps the marks, re-anchored.
- **The reader's text colours in the app's themes** are nudged in Swift (`FoldTheme`) to 4.5:1 on the selection's tint
  and a highlight, over `reviewCSS`, rather than taken as the review table's.
- **One Tab stop per pane for paragraphs**: in the text, the selected paragraph's shape and margin links (j and k move);
  in the PDF, one box (the selected or followed paragraph's), ↑ and ↓ to the next. SPEC 10 lists every box.
- **The toolbar keeps one row** at any width (the role filter scrolls sideways), and under 900 px the header tightens,
  so the text keeps most of a 760 × 480 window.
- **The Default theme's translucent colours** (the second line) are laid over the window before the contrast nudge, so
  the muted text stays lighter than the ink; taxonomy labels are nudged to 4.5:1 on their pill as well.
- **Swift is not compiled here** (no `swift` or `xcodebuild` in the build container): `FoldReaderTests.swift` (the
  `[swift]` criteria 22, 49 to 53, 55, 56) first runs on macOS CI.

### R5

Found while building R5; each keeps its criterion's intent.

- **The fixture's `Abstract.` is run in** (Helvetica-Bold 10 on the abstract's first line, `lb` 1), not FIXTURE 6's
  11 pt heading line, as R5-6 and FIXTURE 6.5 ask for a run-in heading.
- **Page 1's columns end at 380 pt** in `fakePaper` and the Swift fixture paper (FIXTURE does not say where), so S1.p2
  crosses into the right column and S2.p1 onto page 2, both mid-sentence.
- **`fakePaper({pages: 40})`** adds parts until the paper has that many pages: the node budget (R5-15) runs on it.
- **Hyphens are joined only where a line ends** (`skim- ming` at a line break), never inside a line, as pdftext's
  `_join` meets them only there after its own line joins.
- **The body size and the frame are measured after the drops** (page numbers, running heads, stamps), so a paper's
  page furniture cannot set them.
- **A spanning paragraph's short last line spans too** (it starts at the paragraph's left edge, right under it, in
  its size), so it isn't read as the left column's first line.
- **S2.p1's `s = n / N.`** ends no sentence (`N.` reads as an initial): the fixture's expected sentences join the two.
- **References are read as one stream of lines** per flow, an entry starting at a number, a bracket or an outdent, not
  as paragraphs.
- **Text before the first heading of a paper that starts with its references** goes into an `S1` titled `Text`, put
  before `bib`, so no unit is lost.
- **The runner's task is titled with the paper's title** (`Fold “<title>”`), as the fold's stdin carries no cite.
- **Counts are singular at one:** `1 request`, `1 section`; the partial banner says `It shows first sentences.` for
  one section.
- **A cost under a cent reads ` under $0.01 at its list price`**, not ` about < $0.01 …`.
- **A disabled unfolded banner has no button** (no model, no runner, an old runner, a scan, Chinese or Japanese): the
  toolbar's Fold button is there, disabled, its tooltip the reason.
- **The reply cache key is `JSON.stringify`'s** of the call's parts (not Python's separators), so it is the runner's
  own and no TextFold cache is read.
- **An empty topic stays `""`** (a unit kept as written), never filled from its takeaway.
- **`--plan`'s `costUsd`** is computed from the plan's token estimates and the model's list price, rounded to a
  millionth.
- **The menu row is unavailable with no PDF** (`It has no PDF: the reader folds a paper from its PDF`), as the reader
  folds only from a PDF.
- **FoldPDF cuts a PDFKit line at a gap wider than 1.5 × its height** into one line a side, each word's box from its
  own text range, as PDFKit may give two columns' lines on one baseline as one.
- **The Swift fixture paper is a two-page subset** of FIXTURE 6 (abstract, S1, S2 and a footnote, `Sx.n1`), so
  `fold-plan.json` keeps FIXTURE 6.6's five sections while `fold-stream.jsonl` folds the three the paper has.
- **The file's date kept for 3.5 is `links.json`'s `pdf.modified`** (the doc's `source` keeps the size and SHA-256).
- **FoldMake's `no-text` shows the `scan` state**, the same words for a PDF with nothing to fold.
- **Fixture mode's `/attachment`** (a path, never marked opened) answers a PDF the app draws once a run in the
  temporary folder, so the reader opens there with no Zotero.
- **Fold again on R1's doc (D9) or one an older FoldMake read** reads the PDF again first, then folds.
- **An unreadable PDF's reason is made a sentence** (capital, final period); with the PDF away, a doc kept from
  before still reads, and the PDF pane says why.
- **The CHANGELOG's entry says no separate folding app is needed** rather than naming TextFold, as R5-43 asks the
  next entry to name none; the entry below it (0.4.35) is the one that named it.
- **FoldPDF takes each word's box from its own PDFSelection** (`page.selection(for:)` over the word's range), not
  `characterBounds(at:)`: on macOS CI a line's range is its text plus one break index, and `characterBounds` counts
  without those breaks, so its boxes drift one character a line. A range one or two longer than its text is read as
  the text; a word with no selection is spread along its line by CoreText's advances.
- **The 1.5 heights cut uses the line's median word height**, and a line across the page is then cut at its middle
  (`cutAtMiddle`) at the widest gap over the page's centre when that gap is 0.5 × the height or more and twice the
  line's other gaps; FoldMake's `recut` does the same at the frame's middle for lines given as one, kept only when the
  frame then reads as two columns. Both are for two columns a narrow gutter apart (14.45 pt at 10 pt type).
- **A short line that is numbered, or centred in its column, ends its block** (`headLine`: under 0.7 of the column,
  at most 10 words, no sentence end), so IEEE's centred `I. INTRODUCTION` at the body's size and weight heads S1.
- **A run-in heading is the shortest bold start naming an abstract or the references** when the whole bold start
  names none (IEEE's bold-italic `Abstract` and its dash before an abstract set in bold), and `A B S T R A C T` (Elsevier's
  letterspaced label) names an abstract. The read's meta carries Zotero's abstract (`readMeta`), which finds an
  abstract with no heading.
- **Running heads that alternate** (one on odd pages, one on even) are dropped when on at least half of their pages'
  parity, at least 2, as each is under half the paper.
- **A sentence longer than 3000 tokens is cut at a word's start** (a paragraph with no end punctuation), so a unit
  stays within FoldCore's 5000 tokens.
- **`fold.json`'s run carries `force`**, and `foldView` gives `again` (a Fold again run) and `left` (the sections
  still to fold), so a Stop, a refused key or failed sections after Fold again read as that run's end (`stopped`,
  the stop's kind or `partial`), not `folded`; the flash says how many were folded again and that the others keep
  their earlier levels.
- **The AI levels' footer says what is written by AI**: `first sentences until folded` with nothing folded, and
  `written by AI for d of t sections, the others first sentences` part way.
- **The runner's message starts with a capital** in a banner, the unfolded banner names why Chinese or Japanese can't
  fold yet, its Fold with AI posts `{}`, and focus goes to the toolbar's Fold button when a banner's buttons redraw.
- **The layout tests' papers** (`js/tests/fixtures/fold-reader/layouts/`) are drawn by `make/gen.py` from a short
  made-up vocabulary and read by `make/extract.py`, the lines FoldPDF gives, rounded to 5 decimals.
- **Swift is still not compiled here**: R5-35 to R5-40 (`FoldReaderTests.swift`) first run on macOS CI.
