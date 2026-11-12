# The fold reader's extraction benchmark

Twenty-six real papers, read the way the app reads them: PDFKit lines from `FoldPDF.swift`, then `FoldMake.js`. Six
are the first set (three in two columns, two PLOS ONE operations-management papers); twenty are open-access management
papers from PubMed Central's open-access set, one or two a journal (Journal of Management, Strategic Management
Journal, Journal of Management Studies, Organization Studies, Research Policy and fifteen more), the layouts the
reader's owner reads. The headings found are scored against the papers' true outlines in `gt/` (the PDF's own outline
for 1901.00596 and 2303.10130, the publisher's HTML for the PLOS papers, the PDF read by hand for ResNet and BERT, the
publisher's XML for the management papers, without the hypotheses it lists as sections).

- **Headings found**: true headings matched by title (numbering ignored).
- **Nested right**: found headings whose parent is the true parent (independent of how levels are numbered).
- **Junk**: headings that are none (table cells, figure labels, bold paragraph starts). Unnumbered extras an outline
  leaves out (Acknowledgments, Appendix, Author Contributions) count as neither.
- **Among the candidates**: true headings that are among the lines the outline pass would send to the model
  (R5-SPEC 3.7), and how many lines it would send: the most the model could find.

Titles are compared without numbering, spaces or punctuation, so a letterspaced heading counts as its words.

The tables above are the reader's own rules, which is all CI can run: no model is asked there. The outline pass is
scored by hand, on a Mac with the AI features installed and a model set up (about 2 cents a paper):

```sh
cd macos
scripts/fold-bench/run.sh /tmp/fold-bench
node scripts/fold-bench/bench.mjs /tmp/fold-bench/after/lines ZoteroLauncher/Reader "Rules" --asks /tmp/fold-bench/asks
for f in /tmp/fold-bench/asks/*.ask.json; do
  ~/.local/bin/oma-zotero-prompt outline --quiet < "$f" > "/tmp/fold-bench/asks/$(basename "$f" .ask.json).answer.json"
done
node scripts/fold-bench/bench.mjs /tmp/fold-bench/after/lines ZoteroLauncher/Reader "Rules" --answers /tmp/fold-bench/asks
```

On the twenty management papers, with their lines read by a stand-in for PDFKit (2026-11-12): the rules found 329 of
463 headings (71%) and nested 287 right (62%), with 24 junk; with the model's outline 451 (97%) and 433 (94%), with
24 junk; 452 were among the candidates.

CI runs it on a macOS runner (`.github/workflows/fold-bench.yml`) for a change to the reader's extraction, before and
after, and writes the tables to the run's summary. It downloads the papers from arXiv, PLOS and PubMed Central at run
time; nothing of them is committed but their titles and section titles. To run it on a Mac:

```sh
cd macos
scripts/fold-bench/run.sh /tmp/fold-bench
```
