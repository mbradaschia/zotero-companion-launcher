esc no longer closes the launcher when it's a window; review tables add columns where you're looking, order them in one list, and show each paper's notes.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.21…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.21/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner (0.2.5) and the bridge (0.2.6) are unchanged.

**esc steps back in the window, and stops at the top.** In the window (Settings › General › Open as a window, or
`W` for one opening), esc leaves the search box, clears what you typed and goes back a level, as in the overlay. At
the top level it no longer closes the window: a flash says ⌘W closes it, and the footer's hint is `⌘W close`. ⌘W and
the window's close button close it. The overlay still closes on esc, and a pinned launcher stays open as before.

**A new column lands where you're looking.** In a review table, a column you add (+ Column, or ticked in Columns)
goes right after the column of the selected cell, and becomes the selected one, instead of at the far right.

**Columns is one list you can order.** The columns shown come first, in the table's order: drag a row by its handle
(≡) to move its column, or press ⌥⌘↑ ⌥⌘↓ on its tick. The columns not shown follow under *Not shown*. Each row has its
kind's icon (status, task, ranking, taxonomy, yours), and an AI column has a sparkle, in Columns and on its header,
in place of the separate AI section. Shapes tell them apart, never colour alone.

**The panel lists the paper's notes.** The table's right-hand panel shows the selected paper's notes, in the order
you gave them in the launcher; a click opens one in its own note window, as `w` does in the launcher.
