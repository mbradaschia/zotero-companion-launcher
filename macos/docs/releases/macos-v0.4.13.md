The review table, polished: an icon toolbar, a pin to keep it on top, columns as narrow as you like, and a query box that works as the launcher's search box.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.13…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.13/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey.

**An icon toolbar.** Group, Sort, Order, Lines, Columns, add a column, Export, Panel, search again and Pin are icons;
point at one for its name and what it's set to (e.g. "Group: Year", "Sort: ABS, then Year").

**Pin it on top.** The pin keeps the review table over other apps' windows, as the launcher's pin does, so you can
read in Zotero or a PDF beside it. It's remembered for the next table.

**Columns as narrow as you drag them**, and resizing no longer moves them. The resize grip sits inside the column's
own header, at its right edge; drag the header itself to move the column. A click on a header still sorts by it.

**The source box's query works as the launcher's search box.** Type a query and the table follows as you type. Under
the box, the query is read as the launcher reads it (`y:2015..` as *Year: 2015..*, `!#excluded` as *NOT # excluded*).
↵ keeps it, esc goes back to what the table showed, and ⌘S saves it as a search, which the launcher's Searches list
too, and the table then follows that saved search.
