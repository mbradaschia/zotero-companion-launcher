Put a list's papers in your own order (Sort › Manual, ⇧↑↓ or drag and drop), what you type is ranked by relevance
again, so an author's papers come first, and the window W opens is one your window manager tiles.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.17…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.17/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner stays 0.2.4.

**Your own order for a list.** Sort › Manual keeps a collection's, a tag's or a saved search's papers in the order you
give them. ⇧↑↓ moves the highlighted paper up or down; dragging a paper onto another puts it there. Doing either while
the list is sorted another way switches it to Manual, starting from the order you see. Each list keeps its own order,
in view.json, so both Macs share it through the sync folder. Papers new to a list come after the ones you placed;
grouped, a paper moves within its group. Dragged into another app, a paper is its Zotero link.

**What you type is by relevance.** Typing "kong" lists Kong's papers first, as the bridge ranks them. Group and Sort
(and g, G) arrange a list you browse: a collection, a tag or a saved search with nothing typed. In 0.4.16 a sort kept
from before (a year, oldest first) re-sorted typed results too, so the best match could land far down.

**The window is a regular one.** The app launches as a regular app, so tiling window managers (TileMyMac, AeroSpace,
yabai, Amethyst) manage the window W opens: it stays on its Space, tiles, and can go full screen. With Settings ›
General › In the Dock and ⌘Tab off, the Dock icon shows a moment at launch. The overlay the hotkey opens still floats
above your windows, as Spotlight does; Settings › General › Open as a window makes the hotkey open the window instead.
