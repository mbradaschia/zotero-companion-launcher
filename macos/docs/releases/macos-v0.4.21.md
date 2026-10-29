esc no longer closes the launcher when it's a window.

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
