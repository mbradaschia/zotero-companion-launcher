The Lists panel: every kind of list beside the results, with counts.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.33…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.33/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner (0.2.9) is unchanged. The bridge is 0.2.7 (attached):
installed bridges update themselves; it gives the panel the collection tree.

**The Lists panel.** A column on the left of the launcher lists every kind of list it knows, each with its papers'
count: *Favorites*, *Saved searches*, *Quick lists* (Recent, Open in Zotero, Pinned papers, Unfiled, No PDF),
*Reading status*, *Tasks*, *Taxonomies* (each folding open to its labels), *Collections* (the tree), *Tags* and
*Review tables*. A click shows a list's papers one level in, as Enter on a collection does (esc goes back): a status
or a label is a search of its own terms, named for where it is ("Reading status › reading"), so typing searches
inside it and ⌘T opens it as a review table named for the list.

**Favorites in place of the badges.** Your pinned saved searches are the first Favorites, and the badge row above
the results goes. `p` on a list (⌘L first) or its right-click menu makes it a favorite; Tab and ⇧Tab go through
them, ⌘1 to ⌘9 show one.

**Folded to icons.** ⌃⌘S, or the button at the panel's top, folds it to a rail of the sections' icons (each opens
its lists as a pop-over). The window starts open, the overlay as the rail; under 760 points wide, the rail. Drag
the panel's edge for its width.

**Its keys.** ⌘L gives the panel the keys: ↑↓ move, →← open or fold, ↵ show the list, `p` a favorite, ⌃⇧↑↓ move a
section, esc back to the results. A letter typed there goes into the search box, never to a paper's one-key action.

Settings › General › *Lists panel* turns it off, and the badges come back.
