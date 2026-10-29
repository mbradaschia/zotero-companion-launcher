What you type is ranked by relevance again, so an author's papers come first, and the window W opens is one your
window manager tiles.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.17…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.17/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner stays 0.2.4.

**What you type is by relevance.** Typing "kong" lists Kong's papers first, as the bridge ranks them. Group and Sort
(and g, G) arrange a list you browse: a collection, a tag or a saved search with nothing typed. In 0.4.16 a sort kept
from before (a year, oldest first) re-sorted typed results too, so the best match could land far down.

**The window is a regular one.** The app launches as a regular app, so tiling window managers (TileMyMac, AeroSpace,
yabai, Amethyst) manage the window W opens: it stays on its Space, tiles, and can go full screen. With Settings ›
General › In the Dock and ⌘Tab off, the Dock icon shows a moment at launch. The overlay the hotkey opens still floats
above your windows, as Spotlight does; Settings › General › Open as a window makes the hotkey open the window instead.
