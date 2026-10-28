Review tables: the results as a grid, one paper per row, the columns you pick.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.6…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.6/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey.

**Review tables.** ⌘T in the results opens what they list (a query, a collection, a tag, a saved search) as a review
table in its own window; the menu bar's Review Tables opens one again. The list is live, at most 200 papers.

- Columns: Zotero's and the launcher's attributes (authors, year, publication, rankings, status, task, counts), a
  column per taxonomy, and columns of your own: text, or one of a list.
- Drag a header to reorder, drag its edge to resize (double-click fits it), pick 1, 2, 3, 6 or all lines, hide what
  you don't need. Click a header to sort, ⇧-click to sort by another column too.
- The panel on the right shows the paper and changes its status and its task (⌥→← and ⇧⌥→← do it from the grid);
  ⌥⌘I collapses it. A click on a cell only selects it: it never changes a value.
- ⌘E exports the table as CSV, ready for Excel or Numbers.

Reviews, your columns and their values live in the sync folder (`reviews/`), so both Macs see the same tables; a
column's values merge paper by paper. AI columns come next.
