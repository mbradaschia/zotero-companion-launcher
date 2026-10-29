Sort your papers before you type, by date, year, title or first author, from your whole library; and a sorted
collection now shows the right end of it.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.19…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.19/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner is unchanged (0.2.5). Update the bridge to 0.2.6 in Zotero
(Tools › Plugins › Check for Updates) for the sorts below to reach your whole library.

**Sort before you type.** The top level has its own Sort and Order: Recent (as before), date added, date changed,
year published, title or first author. Sorted, it lists your library's first papers in that order (60 by default,
your *Results per search*), under Papers; your pins and the papers open in Zotero stay above them. `g` picks the next
sort. A collection's or a tag's sort is separate and stays as you set it.

**Title and first author** are sorts in a collection, a tag or a saved search too.

**A sorted collection shows the right end.** The bridge now sorts a collection's or a tag's papers before it cuts the
list, so "year, oldest first" in a collection of 500 shows its oldest papers, not the newest 60 re-sorted.
