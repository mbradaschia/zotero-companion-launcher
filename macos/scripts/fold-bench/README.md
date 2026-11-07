# The fold reader's extraction benchmark

Six real papers (three set in two columns, two PLOS ONE operations-management papers), read the way the app reads
them: PDFKit lines from `FoldPDF.swift`, then `FoldMake.js`. The headings it finds are scored against the papers'
true outlines in `gt/` (the PDF's own outline for 1901.00596 and 2303.10130, the publisher's HTML for the PLOS papers,
the PDF read by hand for ResNet and BERT).

- **Headings found**: true headings matched by title (numbering ignored).
- **Nested right**: found headings whose parent is the true parent (independent of how levels are numbered).
- **Junk**: headings that are none (table cells, figure labels, bold paragraph starts). Unnumbered extras an outline
  leaves out (Acknowledgments, Appendix, Author Contributions) count as neither.

CI runs it on a macOS runner (`.github/workflows/fold-bench.yml`) for a change to the reader's extraction, before and
after, and writes the tables to the run's summary. It downloads the papers from arXiv and PLOS at run time; nothing
of them is committed but their section titles. To run it on a Mac:

```sh
cd macos
scripts/fold-bench/run.sh /tmp/fold-bench
```
