# Phase 11b: AI columns (design)

The review table's second phase (the spec and mockup: the *Review Table* artifact, sections 4.3, 6 and 7; the
table itself: `2026-10-27-phase-11a-review-table-design.md`). 11b adds the columns AI fills, paper by paper, and
the runs that fill them. The column library (bundled starters, *Settings › Columns*, *Write one with AI*), *Test on
this row*, a taxonomy made for a column, tags written from the table and the screening filter are later phases.

## 1. What it does

- **Four kinds of AI column**, made in *+ Column › An AI column*:
  1. *AI prompt:* your prompt, asked of each paper. Its settings: what it reads (the abstract, or the full text),
     the shape of the answer (text of at most N words, 60 by default; a list of at most N items; a number; one of a
     list), evidence on or off (quotes with their page, each checked word for word against the paper's text), the
     model (your prompts model by default, or any the app lists).
  2. *Jev, several labels:* one of your taxonomies of the `several` kind: the labels from the threshold, as pills.
  3. *Jev, best fit:* one of your taxonomies of the `one` kind: one label and its probability, or *not stated*.
  4. *Jev, relevance:* "Is this paper relevant to *topic*? Relevant means: *your definition*": a score from 0 to 100
     (Jev's probability of yes) and its band (high from 70, maybe from 40, low below).
  The Jev kinds read what tagging reads (title, abstract, the extracted text); without a Jev key they run on your
  prompts model, as tagging does. **A run from the table writes no Zotero tags** (decided 27 Oct): kinds 2 and 3
  keep their result in the column's cells, and the paper's tags and `taxonomy.json` stay as they were.
- **A cell's state** (section 6 of the spec): *Not run* (empty), up to date (plain), *prompt changed* (amber: the
  column's fingerprint isn't the one the cell was made with), *paper changed* (amber: the column reads the full text
  and the paper's text was extracted after the cell was made from the abstract or the PDF), *yours* (✎: you edited
  it), *failed* (⚠, with why).
- **Running:** *Run…* (the toolbar's ▷, a column's ▾ › *Run this column…*, `⇧⌘R`) opens the plan: which rows (the
  selected ones, or all shown), which columns (this one, or every AI column), the count per state, what's skipped and
  why (up to date; yours, unless *Also rerun cells you edited*), and the requests it makes (and Jev's cost). Nothing
  starts before *Run*. A run is one row in Processes (`Review “Chapter 2”: 3 columns, 24 cells`), with its count,
  its failures, and *Stop all* stops it. At most 200 papers per run.
- **Fewer requests:** one Jev request per paper answers every Jev cell of that paper (labels and relevance
  questions together, as tagging does). AI prompt columns that share a model and what they read are asked
  together, one request per paper, the text sent once, the answer JSON keyed by column; a column whose part comes
  back malformed is asked again on its own.
- **The panel** shows an AI cell whole: its value, its evidence (each quote, its page, found or not), who made it
  (the model) and when, its state, *Run it again*; an edited one has *Back to the AI's answer*.
- **Editing:** an AI prompt column's text cell edits as your text columns do (`↵`, `⌘↵`, `esc`), and becomes *yours*;
  the AI's last answer stays in the cell's record for *Back to the AI's answer*.

## 2. Files

- `reviews/columns/<id>.md` gains `kind: prompt | jev-several | jev-one | jev-relevance` and their keys:
  `reads: abstract | full`, `shape: text | list | number | choice`, `length` (words or items), `options` (choice),
  `evidence: true | false`, `model` (`default`, or a model spec), `taxonomy` (kinds 2 and 3: its id), `threshold`,
  `topic` (kind 4). The body is the prompt (kind 1) or the relevance definition (kind 4).
- `reviews/cells/<column id>.cells.json`: a cell's record gains, for an AI cell: `v` (text, a number, or a list of
  labels), `by: "ai"`, `model`, `hash` (the column's fingerprint when it ran), `input` (`{ text: "note" | "pdf" |
  "zotero" | "none" | "abstract" }`: what it read), `p` (kinds 3 and 4: the probability), `probs` (kind 2:
  label → probability), `suggested` (kind 2: the labels from the low threshold), `evidence: [{ quote, page, found }]`,
  `error` (a failed run: why), `ai` (an edited cell: the AI's last `{ v, updated, model }`). Merged by paper as
  before. Older apps read `v` as text and ignore the rest.
- The column's fingerprint: `ReviewCore.columnHash`, a 12-hex hash (FNV-1a, 64 bits) over what decides an answer
  (kind, prompt, reads, shape, length, options, evidence; the taxonomy's question, labels and definitions; the
  topic and definition). The model stays out, as it does for prompts; *Run it again* is there for a switch of model.

## 3. Architecture

- `ReviewCore.js` (app, page, tests): the AI kinds in `parseColumn`, `columnText` and `newColumn`; `columnHash`;
  `cellState(column, record, row)`; `runPlan(columns, rows, cells, opts)` (the counts per state, the jobs, the
  requests); an AI cell's value for sorting, grouping, CSV.
- The runner: `review-run` reads a job on stdin (`{ review, name, columns: [{ id, kind, …, hash, taxonomy? }],
  items: ["1:KEY…"] }`), runs it paper by paper, and writes each paper's cells as it goes (`lib/reviews.mjs`: the
  cells file read, the paper's record set, written atomically), so a run the app stops keeps what it made. One task
  for the batch, updated per paper. The prompt kind: `generate` with the column's model, a system prompt for cells,
  the answer JSON `{ "<column id>": { answer, evidence: [{ quote, page }] } }`; quotes checked with `quotes.mjs`. The
  Jev kinds: `classifyText` with taxonomies made from the columns (relevance: a one-label `several` taxonomy), then
  `decide` with the column's threshold.
- The app: the window posts `run` (the plan's jobs); `ReviewWindowModel` sends the job to `review-run` through the
  runner, and draws the cells again as the run's task changes (the tasks folder is watched already) and when it ends.

## 4. Not in 11b

The column library and its starters, *Write one with AI*, *Change it with AI*, *Test on this row*, a taxonomy made for
a column, *Tag papers in Zotero* from the table, filters, the bridge's `/items/fingerprints` (so "paper changed" here
is only the text extracted since), cost estimates for API providers before a run (after it, the task has the cost),
a cell's three-value history (only the AI's last answer is kept), automation (*Bring papers up to date*).
