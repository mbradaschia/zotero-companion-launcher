# The fold reader's test fixture

The R1 tests never commit the text of a real paper (the gallery paper used for the mockup, Eloundou et al. 2023, is
CC BY-SA 4.0). They use the hand-made document below, a fake words payload made from it by a function, and a large
document generated for the performance budgets. Everything is deterministic: no clock, no randomness without a seed.
The validator may also run the check on the real gallery data kept outside the repository (section 5).
R5 (our own folding, R5-SPEC.md) adds a synthetic paper's PDF lines, a PDF drawn in XCTest and made-up model
replies: section 6.

Files (R1 creates them):

- `macos/js/tests/fixtures/fold-reader/doc.json`: the document of section 1, byte for byte.
- `macos/js/tests/fold-fixture.js`: `fakeWords(doc, options)`, `bigDoc()`, `blankPage(n)` (sections 3 and 4). Used
  by the node tests and by `macos/scripts/fold-reader-check.mjs`.

## 1. The document (TextFold format, version 0)

Five sections (the abstract, two numbered sections, one subsection, one appendix), eight units: an abstract, five
paragraphs, a list item and a figure caption. Seven roles (no analysis). Numeric and author-year citations, a
formula, a figure reference, argument links and a `ref` link (not shown in the margin). Every takeaway is the start
of its key and every topic is verbatim inside its takeaway, as TextFold writes them.

```json
{
  "format": "textfold/doc", "version": 0, "id": "pdf-fixture0001", "lang": "en",
  "title": "Folding a Paper: A Small Synthetic Study",
  "authors": ["Rivera, Ana", "Okafor, Ben"], "date": "2026-01-15",
  "source": {"kind": "pdf", "url": "", "label": "Zotero · rivera2026", "snapshot": "", "license": ""},
  "levels": ["topic", "takeaway", "key", "brief", "full"], "written": ["topic", "takeaway", "key"],
  "provenance": {"made_with": "TextFold 0.10.0", "exported": "2026-11-01T10:00:00Z", "ai_generated": true,
                 "model": "fixture/model", "levels_made": "2026-11-01T09:00:00", "local": false},
  "sections": [
    {"id": "abstract", "num": "", "title": "Abstract", "depth": 1,
     "takeaway": "Folded reading lets readers move between a paper's words and its summaries", "topic": "Folded reading",
     "units": [
      {"id": "abstract1.1", "kind": "abstract", "role": "claim",
       "sentences": ["We study how readers move between a paper's own words and short summaries of it.",
                     "Readers who could fold the text found the main claims faster than readers of the plain text.",
                     "We describe the reader and its limits."],
       "evidence": [0, 1],
       "key": "Readers who fold the text find the main claims faster. They moved between a paper's words and its summaries.",
       "takeaway": "Readers who fold the text find the main claims faster", "topic": "main claims"}]},
    {"id": "S1", "num": "1", "title": "Introduction", "depth": 1,
     "takeaway": "Readers skim papers, and summaries lose the author's exact words", "topic": "exact words",
     "units": [
      {"id": "S1.p1.1", "kind": "paragraph", "role": "context",
       "sentences": ["Researchers read many papers each week [1, 2].",
                     "Most of that reading is skimming for the main claim (Lee et al., 2021).",
                     "Skimming saves time but misses how a claim is argued."],
       "evidence": [1, 2],
       "key": "Most reading is skimming for the main claim. Skimming misses how a claim is argued.",
       "takeaway": "Most reading is skimming for the main claim", "topic": "skimming"},
      {"id": "S1.p2.1", "kind": "paragraph", "role": "gap",
       "sentences": ["Summaries written by language models are short.",
                     "They do not show which of the author's sentences they rest on.",
                     "No reader we know links each summary line back to the text."],
       "evidence": [1, 2],
       "key": "Model summaries do not show the sentences they rest on. No reader links each summary line back to the text.",
       "takeaway": "Model summaries do not show the sentences they rest on", "topic": "summaries"}]},
    {"id": "S2", "num": "2", "title": "Method", "depth": 1,
     "takeaway": "The reader folds each paragraph into five levels and links them to the PDF", "topic": "five levels",
     "units": [
      {"id": "S2.p1.1", "kind": "paragraph", "role": "method",
       "sentences": ["Each paragraph is folded into five levels, from a topic to the full text.",
                     "A word keeps its place across levels when it appears in both, scored by $s = n / N$.",
                     "The PDF beside the text is matched by runs of three words."],
       "evidence": [0, 2],
       "key": "Each paragraph folds into five levels. The PDF beside the text is matched by runs of three words.",
       "takeaway": "Each paragraph folds into five levels", "topic": "five levels"},
      {"id": "S2.F1.cap", "kind": "caption", "role": "context",
       "sentences": ["Figure 1: The five levels of one paragraph, from Topic to Full."],
       "evidence": [0],
       "key": "Figure 1 shows the five levels of one paragraph.",
       "takeaway": "Figure 1 shows the five levels of one paragraph", "topic": "five levels"}]},
    {"id": "S2.SS1", "num": "2.1", "title": "Results", "depth": 2,
     "takeaway": "Readers found claims faster with folds", "topic": "claims faster",
     "units": [
      {"id": "S2.SS1.p1.1", "kind": "paragraph", "role": "result",
       "sentences": ["Twelve readers found the main claim in 41 seconds with folds and 68 seconds without.",
                     "The gap held for long papers (Figure 1)."],
       "evidence": [0],
       "key": "Readers found the main claim faster with folds. They took 41 seconds instead of 68.",
       "takeaway": "Readers found the main claim faster with folds", "topic": "main claim"},
      {"id": "S2.SS1.p2.1", "kind": "list item", "role": "limitation",
       "sentences": ["The study had only twelve readers, all from one field."],
       "evidence": [0],
       "key": "The study is small. It had twelve readers from one field.",
       "takeaway": "The study is small", "topic": "study"}]},
    {"id": "A1", "num": "A", "title": "Appendix A: Materials", "depth": 1,
     "takeaway": "The materials were three papers", "topic": "materials",
     "units": [
      {"id": "A1.p1.1", "kind": "paragraph", "role": "setup",
       "sentences": ["The readers read three papers on labour economics.", "Each paper was between 20 and 40 pages."],
       "evidence": [0],
       "key": "Readers read three papers. Each was 20 to 40 pages.",
       "takeaway": "Readers read three papers", "topic": "three papers"}]}
  ],
  "links": [
    {"from": "S2.SS1.p1.1", "to": "abstract1.1", "rel": "supports"},
    {"from": "S2.p1.1", "to": "S1.p2.1", "rel": "builds_on"},
    {"from": "S2.SS1.p2.1", "to": "S2.SS1.p1.1", "rel": "qualifies"},
    {"from": "S2.SS1.p1.1", "to": "S2.F1.cap", "rel": "ref"}
  ]
}
```

## 2. Expected values (FoldCore.model, FoldCore.pieces)

Computed with the rules of SPEC 5.2 (TextFold's `WORD`, `norm`, `lcs_pairs`, `locate`); a test asserts each row.
Token counts are of the unit's full text; `tn` and `k` index the key's tokens; `m` pairs are (key token, full token).

| Unit | tokens | sents | ev | key tokens | tn | m pairs | topic k | Topic chip ids |
|---|---|---|---|---|---|---|---|---|
| `abstract1.1` | 42 | [0, 16) [16, 34) [34, 42) | 0, 1 | 21 | 10 | (0,3) (1,17) (2,19) (4,21) (7,24) (8,25) (9,26) | 7, 8 | `abstract1.1:24` `abstract1.1:25` |
| `S1.p1.1` | 42 | [0, 12) [12, 31) [31, 42) | 1, 2 | 17 | 8 | (1,15) (3,17) (6,20) (7,21) (9,31) (10,35) (11,36) (13,38) (15,40) | 3 | `S1.p1.1:17` |
| `S1.p2.1` | 34 | [0, 8) [8, 21) [21, 34) | 1, 2 | 22 | 10 | (4,11) (6,16) (8,18) (11,21) (12,22) (13,25) (14,26) (15,27) (16,28) (17,29) (20,32) | 1 | `S1.p2.1:k1` |
| `S2.p1.1` | 46 | [0, 16) [16, 33) [33, 46) | 0, 2 | 20 | 6 | (0,0) (1,1) (4,5) (5,6) (8,34) (9,35) (11,37) (13,39) (15,41) (17,43) (18,44) | 4, 5 | `S2.p1.1:5` `S2.p1.1:6` |
| `S2.F1.cap` | 15 | [0, 15) | 0 | 10 | 9 | (0,0) (1,1) (4,4) (5,5) (7,7) (8,8) | 4, 5 | `S2.F1.cap:4` `S2.F1.cap:5` |
| `S2.SS1.p1.1` | 27 | [0, 16) [16, 27) | 0 | 17 | 8 | (0,1) (1,2) (3,4) (4,5) (11,7) (12,8) (15,12) | 3, 4 | `S2.SS1.p1.1:4` `S2.SS1.p1.1:5` |
| `S2.SS1.p2.1` | 12 | [0, 12) | 0 | 13 | 4 | (1,1) (7,4) (8,5) (10,9) (11,10) | 1 | `S2.SS1.p2.1:1` |
| `A1.p1.1` | 18 | [0, 9) [9, 18) | 0 | 12 | 4 | (0,1) (1,2) (2,3) (3,4) | 2, 3 | `A1.p1.1:3` `A1.p1.1:4` |

Sections (takeaway tokens, topic k): `abstract` 12, [0, 1]; `S1` 11, [9, 10]; `S2` 14, [6, 7]; `S2.SS1` 6, [2, 3]; `A1` 5, [1].

Tokens of `S1.p1.1`, sentence 0 (0 to 11): `Researchers` `read` `many` `papers` `each` `week` `[` `1` `,` `2` `]` `.`;
tokens 6 to 10 are `cite`. Sentence 1 (12 to 30) ends `(` `Lee` `et` `al` `.` `,` `2021` `)` `.`, tokens 22 to 29
`cite`. In `S2.p1.1`, token 31 is the single `math` token `$s = n / N$`. `S2.SS1.p1.1`'s `(Figure 1)` is not a
citation (no year).

Pieces of `abstract1.1` (ids without the `abstract1.1:` prefix; **bold** = tone `ink`, else `muted`):

- Full: `0` to `41`; ink `0` to `33` (sentences 0 and 1, the evidence).
- Brief: `0` to `33`, no gap (the evidence is adjacent); ink `3 17 19 21 24 25 26` (the key's matches).
- Key: `3 17 19 k3 21 k5 k6 24 25 26` (the takeaway, ink, weight 600), then `k10` to `k20` (the reason, muted).
- Takeaway: `3 17 19 k3 21 k5 k6 24 25 26`; weight 600 on `24 25` (the topic), the rest ink.
- Topic: one chip, `24 25` (`main claims`).

Other cases the tests pin: `S2.p1.1` at Brief is sentence 0, a gap piece `gap2`, sentence 2; `S1.p2.1`'s topic chip
is `k1` (the key's `summaries` matches nothing in the evidence); `A1` is back matter, the four sections before it
are not; the margin of `S2.SS1.p1.1` shows `→ supports` to the abstract and not the `ref` to the caption.

## 3. The fake words payload: `fakeWords(doc, options)`

Lays the document out on US Letter pages (612 by 792 points) the way a simple PDF would, and returns the `FR.words`
batches of SPEC 5.4 (`{pages: [{n, words}], done: true}` in one batch) plus `sizes`.

- Page 1 starts with a running header line `Rivera and Okafor 2026` at y 0.04 (it matches no unit). Every page ends
  with its number at y 0.95.
- Units in reading order; each unit's words are its full text split on spaces, raw (`[1,`, `2021).` and so on).
- A word is `0.009 × characters` wide, words are `0.008` apart, lines run from x 0.12 to at most 0.88, a line is
  `0.014` high and the next starts `0.02` lower, a unit adds `0.015` after it. Text starts at y 0.08.
- Section `S2` starts a new page, so `abstract1.1`, `S1.p1.1`, `S1.p2.1` are on page 1, the rest on page 2.
- The first `skimming` of `S1.p1.1` is cut at a line end as `skim-`, then `ming` starts the next line (TextFold's
  `indexWords` joins them).
- `options.skip` (default `["S2.SS1.p2.1"]`): units whose words are not written at all.
- `options.garble` (default `["A1.p1.1"]`): units whose words are replaced, in place, by `lorem`, `ipsum`, `dolor`
  in turn (same lengths of line, nothing matches).
- `options.garbleAll: true`: every unit but `abstract1.1` and `S1.p1.1` garbled.

Expected with the defaults: 2 pages; linked `abstract1.1` (page 1), `S1.p1.1` (1), `S1.p2.1` (1), `S2.p1.1` (2),
`S2.F1.cap` (2), `S2.SS1.p1.1` (2); not linked `S2.SS1.p2.1`, `A1.p1.1`; coverage 6 of 8 (75%), no warning. With
`garbleAll`: 2 of 8 (25%), the warning. Each linked unit's boxes are its lines' boxes, inside its page's crop.

`blankPage(n)` returns a `data:image/svg+xml` URL of a white 612 by 792 page with `n` written small in a corner;
the check passes `urlPattern: "<that URL for page {n}>"` so the page's images load under a CSP of
`img-src data:` (the check builds the shell with that one change; the app's shell uses `img-src zlfold:`).

## 4. The large document: `bigDoc()`

For the budgets of SPEC section 11. Twelve sections (`S1` to `S12`, `depth` 1), twenty units each (`S<i>.p<j>.1`),
twelve sentences of twelve words per unit, each sentence ending with `.`. The words come from a fixed list of 200
made-up words, word `i` being `i mod 8 + 2` letters long (any letters; the generator fixes them), picked by a linear
congruential generator seeded with 1 (`x = (1103515245 × x + 12345) mod 2^31`, word `x mod 200`). Each unit:
`evidence [0, 1]`; `takeaway` the first eight words of sentence 0; `key` the takeaway, `. `, the first six words of
sentence 1, `.`; `topic` the takeaway's words 2 and 3; roles in turn from the eight. About 240 units and 37000
tokens; `fakeWords(bigDoc(), {skip: [], garble: []})` gives 34 to 46 pages (asserted; about 39).

## 5. The real paper, outside the repository (the validator's option)

`fold-reader-check.mjs` takes `--doc <file>` (a TextFold doc), `--gallery <file>` (a TextFold gallery page: its
`<script id="paper-data">`, converted to the doc format with fold.py's rules: sentences as the plain text of each
sentence's tokens, atoms as their text, math as `$alt$`; `key` the `brief` tokens' text; `takeaway` its first `tn`;
`topic` the `topic` tokens; `evidence` `ev`; `role` `lad.role`) and `--bbox <file>` (`pdftotext -bbox-layout`
output: each `<word>`'s box divided by its `<page>`'s width and height, as the words payload). The scratchpad's
`gal/p.html` and `gal/bbox.html` work with it; the check then prints the coverage and the budgets instead of the
fixture's assertions. Nothing from them is written into the repository.

## 6. R5: the synthetic paper, its lines and the model's replies

R5 (R5-SPEC.md) reads the PDF itself, so its tests need a paper's *lines* (R5-SPEC 3.1's payload), a PDF made in
XCTest, and model replies. All of it is made up here, from section 1's sentences and the fillers below; nothing comes
from a real paper or a real model. Deterministic: no clock, no randomness.

Files (R5 creates them):

- `macos/js/tests/fold-fixture.js` gains `fakePaper(options)` (6.2) and `bigSection(n)` (95 units by default: section
  4's word generator, one sentence of twelve words a unit, ids `S1.p1` ...).
- `macos/js/tests/fixtures/fold-reader/made.json`: `FoldMake.read(fakePaper())`'s `doc` and `links`, written once by
  the implementer, read by a person against 6.3, then a golden (a change to it is a reviewed change).
- `macos/js/tests/fixtures/fold-reader/fold-input.json`: the `fold` command's stdin for that doc (R5-SPEC 4.1),
  `paper: "1:ABCD1234"`; `prompt-S1.txt` and `prompt-section.txt`: the goldens of R5 criterion 16 (S1's prompt; the
  section-line prompt of `bigSection()` with each unit's takeaway `Takeaway <n>`), checked by hand against
  Appendix A once.
- `macos/js/tests/fixtures/fold-reader/replies/`: the replies of 6.4.
- `macos/ZoteroLauncherTests/Fixtures/synthetic/fold-plan.json` and `fold-stream.jsonl`: fixture mode's answers (6.6).

### 6.1 Fillers

Sentences used to make paragraphs long enough to cross a break (made up, like section 1's):

- F1 `Each level keeps the words that the next level needs.`
- F2 `A reader can open any paragraph in place to see all of it.`
- F3 `The folds are stored beside the paper on this computer.`
- F4 `Nothing in the library changes when a paper is folded.`
- F5 `The OCR-free files were used as they were.`

### 6.2 `fakePaper(options)` → `{pages, sizes, meta, expected}`

Lays a paper out on US Letter pages (612 by 792 points) as a typeset two-column PDF would, and returns the lines
payload (`pages`: `[{n, size: [612, 792], lines: [{t, b, s, f, lb, w}]}]`, boxes 0 to 1), `meta` (title
`Folding a Paper: A Small Synthetic Study`, authors `Rivera, Ana` and `Okafor, Ben`, the abstract's text, `lang: "en"`,
a fake `pdf` identity) and `expected` (6.3, with every unit's line boxes as the generator placed them).

- **Type:** a character is `0.5 × size` points wide, a space `0.25 × size`; a line's box is its words' union, a word
  `size` high from its top; lines `1.2 × size` apart. Body 10 pt; headings 12 pt bold (`f: 1`, `lb` all their
  words); the title 18 pt bold; captions 9 pt; table cells 9 pt; figure labels 7 pt; the footnote 8 pt; page numbers
  and the running head 9 pt.
- **Columns:** left 54 to 297, right 315 to 558 points; spanning blocks 54 to 558. A paragraph after another in the
  same section starts 10 pt indented, with no extra gap; headings have 8 pt above them.
- **Page 1:** the arXiv-like stamp `arXiv:2601.01234v1 [cs.HC] 15 Jan 2026` set vertically at x 20 (each word's box
  taller than wide); the title spanning at y 80; `Ana Rivera Ben Okafor` (11 pt) at 110; `Example University ·
  Sample Institute · ana@example.org` (9 pt) at 125; `Abstract` (11 pt bold) at 150 and the abstract (section 1's
  `abstract1.1` sentences) spanning below it; then two columns from y 240: `1 Introduction`, the paragraph of
  `S1.p1.1`'s sentences (its first `skimming` cut `skim-` / `ming` at a line end), the paragraph of `S1.p2.1`'s
  sentences then F1, F2, F3 (long enough to end at the top of the right column); `2 Method`, the paragraph of
  `S2.p1.1`'s sentences then F1 to F4 (it ends on page 2's left column).
- **Page 2:** running head `Rivera and Okafor · Folding a Paper` (y 30, spanning); left column: the rest of the
  method paragraph; three figure labels `0.5`, `1.0`, `Topic` (7 pt) over the caption `Figure 1: The five levels of
  one paragraph, from Topic to Full.`; the centred equation `s = n / N (1)`; `Table 1: Reading times by level.` over
  three rows of three cells (`Level Seconds Readers`, `Full 68 12`, `Folded 41 12`, the cells of a row starting 60 pt apart); `2.1
  Results`; the paragraph of `S2.SS1.p1.1`'s sentences; the list item `• The study had only twelve readers, all from
  one field.`; at the column's foot, the footnote `1 The readers were volunteers from one department.` Right column:
  `References`; `[1] A. Author. A made-up paper on reading. Example Press, 2020.` and `[2] B. Writer. Another made-up
  paper. Sample Journal, 2021.`, each a second line indented 10 pt; `Appendix A: Materials` (12 pt bold,
  unnumbered); the paragraph of `A1.p1.1`'s first sentence then F5 (`OCR-` ends a line, `free` starts the next).
- **Page 3:** the running head; the paragraph `Each paper was between 20 and 40 pages.` (section 1's last sentence)
  then F4, in the left column.
- **Every page:** its number centred at y 760.
- `options.columns: 1`: one column 54 to 558, the same blocks in the same order (fewer lines, the same texts).
- `options.pages: 40`: sections `S3` to `S40` added after `2.1 Results`, each `<n> Part <n>` and three paragraphs of
  F1 to F4, until 40 pages (the budget of R5-SPEC 3.6).
- `options.scan: true`: the same pages with no lines (`fakePaper({scan: true, empty: [2]})`: only page 2 empty).

### 6.3 What `FoldMake.read(fakePaper())` gives

| Section | num | title | depth | Units (kind) |
|---|---|---|---|---|
| `abstract` | | Abstract | 1 | `abstract.p1` (abstract) |
| `S1` | 1 | Introduction | 1 | `S1.p1`, `S1.p2` (paragraph) |
| `S2` | 2 | Method | 1 | `S2.p1` (paragraph), `S2.F1.cap` (caption, `Figure 1`), `S2.e1` (equation), `S2.T1.cap` (caption, `Table 1`) |
| `S2.SS1` | 2.1 | Results | 2 | `S2.SS1.p1` (paragraph), `S2.SS1.i1` (list item) |
| `bib` | | References | 1 | `bib.r1`, `bib.r2` (reference) |
| `A1` | | Appendix A: Materials | 1 | `A1.p1`, `A1.p2` (paragraph) |
| `Sx` | | Notes | 1 | `Sx.n1` (footnote) |

Texts: each unit's sentences as section 1 and 6.1 give them, joined by one space (`skimming` and `OCR-free` whole);
the list item without its bullet; no unit holds the stamp, the title, the author or affiliation lines, the running
head, a page number, a figure label or a table cell. `S1.p2` has boxes in both columns of page 1; `S2.p1` on pages 1
and 2 (its page-2 boxes with a fifth element `2`). Coverage 14 of 14. Back matter: `bib`, `A1`, `Sx`.

### 6.4 Model replies (`fixtures/fold-reader/replies/`)

Made-up replies for `fold-input.json`'s sections, each a file of the text a model would send:

- `S1-ok.txt`: valid JSON, two units, roles `context` and `gap`, a section line.
- `S1-prose.txt`: the same JSON after `Here is the JSON:` and inside a ```` ```json ```` fence.
- `S1-keyed.txt`: `units` as an object keyed by `U0`, `U1`; `S1-string.txt`: `units` as a JSON string.
- `S1-broken.txt`: cut off in the middle (no closing brace); `S1-half.txt`: only `U0`.
- `S2-dirty.txt`: a takeaway with an em dash and a final `.`, evidence `[5, 2, 2, -1, 0, 1]` for a 3-sentence unit,
  role `finding`, a 4-word topic not in the takeaway, an 8-word topic, an empty takeaway.
- `section-ok.txt`: a section line for `bigSection()`.

The assertions of R5 criteria 18 and 19 name what each must give.

### 6.5 The PDF made in XCTest

`FoldReaderTests` draws, with CoreText into a PDF context: two pages, two columns as 6.2 (Helvetica 10 body,
Helvetica-Bold 12 headings, Helvetica-Bold 10 `Abstract.` run into the abstract's first line, Helvetica 8 footnote,
page numbers), section 1's abstract, `S1.p1.1`, `S1.p2.1` and `S2.p1.1` sentences, the second page turned 90°. It
records where each word was drawn, for R5 criteria 35 and 36. A third PDF of two pages holding only an image (a grey
rectangle drawn as a bitmap) is the scan.

### 6.6 Fixture mode

`fold-plan.json`: `{model: "fixture:model", name: "Fixture model", provider: "Fixture", sections: 5, calls: 5,
cached: 0, inputTokens: 4000, outputTokens: 900, costUsd: 0.01}`. `fold-stream.jsonl`: a `start`, then a `call` and a
`section` for each of the fixture paper's foldable sections, with levels made from that section's first sentences
(no model), and a `done`. `FixtureRunner.stream` answers `fold` with it (the `chat` stream otherwise), and `run`
answers `fold --plan` with the plan.
