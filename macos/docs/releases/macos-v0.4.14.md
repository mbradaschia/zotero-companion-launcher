AI columns in the review table: a prompt, Jev's labels or relevance, asked of each paper, with a plan before each run and every cell's state in sight.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.14…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.14/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The AI columns need the runner this app brings (0.2.3):
*Settings › Setup › Install the AI features* offers it.

**Four kinds of AI column**, from *+ Column › An AI column*:

- *AI prompt*: your question, asked of each paper. It reads the title and abstract, or the full text (the extracted
  text, else the PDF). The answer is text of at most N words, a list, a number or one of a list. With evidence on,
  each answer comes with quotes and their pages, each checked word for word against the paper. It runs on your
  prompts model, or any model the app lists.
- *Jev, several labels* and *Jev, best fit*: one of your taxonomies, its labels from the threshold (the rest listed
  as likely), or its best fit and how sure Jev is.
- *Jev, relevance*: "Is this paper relevant to *topic*?", with your definition of relevant, scored 0 to 100 (high
  from 70, maybe from 40).

The Jev kinds read what tagging reads and use your prompts model when there's no Jev key. **A run from the table
writes no tags in Zotero**: the results stay in the table.

**Run… first shows what it would do** (the toolbar's ▷, a column's menu, or ⇧⌘R). It covers the selected papers or
every one shown, this column or every AI column, the cells by state, what it leaves alone (up to date, and yours
unless you tick it), and the requests it makes with Jev's cost. Nothing starts before *Run*. The run is one row in
Processes. Cells fill in as each paper is done, and a run you stop keeps what it made.

**Each cell says how current it is.** Amber means the column changed since it ran, or the paper's text was extracted
since. ✎ means you edited it, and ⚠ means it failed, with the reason when you point at it. The panel shows a cell
whole: its value, each label's probability, the evidence, which model made it, when, and from what text. *Run it
again* reruns that one cell. *Back to the AI's answer* undoes your edit.

**Install buttons that install.** In Settings › Setup, Enter on *Install Node.js*, *Install pdftotext* or *Read scans
by OCR* runs `brew install node`, `brew install poppler` or `brew install tesseract` in the background. It shows in
Processes as *Install poppler* (and so on), and the row says it's installed when it's done. Before, Enter only copied
the command, so the button looked like it did nothing. Without Homebrew, Enter still copies the command for Terminal,
and says Homebrew isn't installed (brew.sh).
