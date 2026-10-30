Review tables follow their list: a paper whose task, status or tags now match joins an open table, and one that no longer matches leaves it.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.24…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.24/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner and the bridge are unchanged.

**The list is live, also while the table is open.** A review table on a list by task (`task:"To read"`), status or
tag searched its list again only when it opened, came forward, or on ⌘R. Now an open table searches again a moment
after a paper's task, status or tags are saved, wherever you changed them (the launcher, the table's panel, another
table), and after Zotero syncs. The footer says what changed ("1 paper joined the list", "1 paper left the list").
Coming forward, a table also reads the tasks again, so a task set on your other Mac counts too.

**The selection keeps its place.** When the selected paper leaves the list, the one after it is selected, instead
of the first row.
