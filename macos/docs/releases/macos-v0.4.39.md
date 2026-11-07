The reader finds a paper's sections and sub-sections more often.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.39…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.39/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The bridge (0.2.7) and the prompt runner (0.3.1) are unchanged.

**Sections and sub-sections, found more often.** The reader uses the PDF's own outline (its bookmarks) when the file
has one, reads IEEE's "I. INTRODUCTION" and "A. Background" headings, keeps numbered titles with a period in them
("4.2 SQuAD v1.1"), reads Medium-weight fonts as bold, and nests sub-sections that differ from their sections only
by typeface, as PLOS ONE sets them. Table cells, figure labels and bold paragraph starts no longer turn into
headings. On six test papers (three in two columns, two from PLOS ONE) it now finds 157 of 158 headings, up from
121, and nests 157 under the right section, up from 106.

Papers you read before are read again the next time you open them, unless you already folded them with AI: a
folded paper keeps the sections its fold was made on.
