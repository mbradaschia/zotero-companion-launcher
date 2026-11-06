The reader folds papers itself.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.36…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.36/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The bridge (0.2.7) is unchanged. The prompt runner is now 0.3.0: after
updating, *Settings › Setup › Install the AI features* brings it up to date.

**No separate folding app.** *Read with folds* reads the paper's own PDF on this Mac: two columns, headings, the
abstract, footnotes and references are found from the page itself, and every paragraph lines up with its place in the
PDF. Full and Brief show at once; Key, Takeaway and Topic show each paragraph's first sentence until you fold it.

**Fold with AI.** The button sends the paper's text, a section at a time, to the model you set up for prompts
(*Settings › Defaults*). Its banner says first how many requests it takes, and the price when the provider lists one.
Sections fold in as they come back; *Stop folding* keeps what is done, and *Finish folding* asks only for what's left.
The levels stay on this Mac with your highlights and notes. Scanned PDFs and Chinese or Japanese papers aren't folded
yet, and say so.

The folding prompt is adapted from [TextFold](https://github.com/chenxiachan/textfold) by Xia Chen (Apache 2.0).
