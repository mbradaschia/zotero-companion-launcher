# The fold reader: plan

What gets built in which phase, and R1's tasks in order. The behaviour is in [SPEC.md](SPEC.md), the test data in
[FIXTURE.md](FIXTURE.md). Each phase ends with its tests green, `scripts/check-boundaries.sh` and `macos/scripts/parity.sh`
passing, a UX consistency review (`.claude/agents/ux-consistency-reviewer.md`) and Marcelo's look.

## Phases

| Phase | Adds | Needs first |
|---|---|---|
| **R1** | The reader window from a paper's menu (`Read with folds`, `v`); the five levels and the morph; header with status, task and taxonomies; PDF pane (PDFKit images, crop, zoom, swap, divider, link map by 3-word runs, coverage, follow); highlights, notes and Ask kept on this Mac; margin; every TextFold state; node tests, the Playwright check, XCTest | nothing |
| **R2** | Ask sent to the paper's chat window with the question and its passage as the draft (`ChatWindowModel.draft`, the user presses ↵); TextFold's own `/api/pdfmap` for `pdf-` docs (better boxes, and scans); several PDFs (a picker); group libraries (their group id from the bridge, a new field); find in the text (⌘F); stop a fold; the reader's tokens in `ThemeTests` (contrast of `--hl`, `--sel` in every theme); a translation picker (`lang`) | Marcelo's yes on the chat draft wording |
| **R3** | Marks synced between machines: a `reader/` entry in `contracts/Paths.js` `SYNCED`, its fixtures, SYNC-FORMAT.md, a by-mark merge in `Merge.js` (tombstones as todos), anchors with the sentence's text so another machine's fold can re-anchor them | Marcelo's yes (a contract change, both launchers' tests) |
| **R4** | Highlights and notes into Zotero: a bridge route to write annotations (or a child note) for one paper, never in bulk, with a confirm view naming the paper and the count, and an undo; the docked chat in the reader (ReviewWindowModel+Chat.swift's slot layout made shared) | Marcelo's yes for each kind of write |
| **R5** | Our own folding with the app's runner: a `fold` command writing the TextFold format's subset of SPEC 5.1 from the PDF's text (the runner's extraction), stored in the reader's folder; TextFold optional | the runner's extraction quality on scans |
| **R6** | The Lists rail: the collapsed 46 pt rail of PR #84 on the reader window's left, its entries opening the launcher's places | PR #84 merged |
| **R7** | The Omarchy move: FoldCore.js, FoldView.js, FoldReader.css to `shared/` (decision D3, PR #83); the Omarchy launcher's own host (a WebEngineView bridge with `post` and `window.FR`) | PR #83 merged |

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

## Deviations

Found while building R1; each keeps its criterion's intent.

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
- **Swift is not compiled here** (no `swift` or `xcodebuild` in the build container): `FoldReaderTests.swift` (the
  `[swift]` criteria 22, 49 to 53, 55, 56) first runs on macOS CI.
