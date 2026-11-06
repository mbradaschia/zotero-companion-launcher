Read with folds.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.35…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.35/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner (0.2.9) and the bridge (0.2.7) are unchanged.

**Read with folds.** A paper's menu has *Read with folds* (or press `v` on it): a window of its own shows the paper at
five levels, from every word (Full) through its key sentences, each paragraph's point and one takeaway, down to one
line per section (Topic), beside its PDF, which follows the paragraph you read. `1` to `5` change the level, and the
text folds into place.

**Marks that survive the folds.** Select text to highlight it, add a note or keep a question; they stay on this Mac and
show at every level. The paper's reading status and task change from the window's header, and its taxonomies show as
pills grouped by name.

**What it needs.** [TextFold](https://github.com/chenxiachan/textfold) running on this Mac writes the levels; press
*Fold it with TextFold* on a paper it hasn't folded yet. Nothing in Zotero changes. Your own library's papers only, for
now.
