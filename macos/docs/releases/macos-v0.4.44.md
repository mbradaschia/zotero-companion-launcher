Scanned papers open in the reader with their words, read by macOS on your Mac.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.44…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.44/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The bridge (0.2.7) is unchanged. The prompt runner is now 0.3.5: after
updating, *Settings › Setup › Install the AI features* brings it up to date, on each Mac.

**Scanned papers are read.** Some PDFs are pictures of pages: older papers a publisher scanned, often with a line it
stamps on each page when you download it (`Downloaded from www.emerald.com/… by … on …`). That line was all the text
there was, and it passed for a text layer, so the reader showed nothing to read and the full-text note held only the
stamp, page after page. Lambert & Pohlen's *Supply Chain Metrics* (2001) was one.

Now a page's own text leaves stamps and watermarks out, and a scan's pages are read by macOS's own OCR (Apple's
Vision), on your Mac: nothing to install, nothing sent anywhere. Every word keeps its place on the page, so the text
and the PDF stay linked as with any other paper, and a heading set in bold still reads as a heading, from its ink.
While it reads (about a second a page, up to 80 pages) the text says `Reading the scan by OCR…`; afterwards the byline
says `Read by OCR`, with an icon. OCR can misread a word: check a quote against the PDF.

**Columns in order.** A scan's columns are found from where its lines start and end, so a page with no gutter
between its columns, or with a margin column of pull quotes, reads the left column, then the right, then the margin.
On a scan a heading needs its weight, capitals or number, so pull quotes, figure labels and lines OCR measured a
little large don't become sections.

**JSTOR files.** The reader and the full-text note leave out JSTOR's cover sheet and the stamp it puts on each page
(`This content downloaded from …`), and the reader drops running heads a scan sets low on the page. A note saved
before has its page numbers one low (the cover counted as a page): extract it again as above. JSTOR's scans carry
JSTOR's own hidden OCR text, and the reader still reads that text: its words are right, its headings are weak.

**The full-text note reads scans the same way.** On a Mac the AI features now use the same OCR instead of Tesseract,
so chats and review tables grounded on a scan have its text. The note says `read by OCR (macOS Vision)`. A paper whose
note was saved before, with only the stamp in it, needs its text extracted again: in its menu, *Text extracted*,
Shift+Enter, *extract it again*. Settings › Setup says OCR is built in, and Settings › Defaults offers to read the scans skipped before.
