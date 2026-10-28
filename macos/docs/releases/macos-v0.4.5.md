The launcher opens where you left it, also after the app restarts.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.5…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.5/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey.

**Back where you were.** Each time the launcher opens it comes back to the view you left: the same paper's menu, the
same collection or search, the same row. Until now that held only while the app kept running; after an update, a login
or a quit it started over at the results. It now keeps the spot across restarts. A page that needs more than that to be
drawn again (a note being read, a setting being edited, a picker) comes back as the level under it. The update to
0.4.5 starts at the results once, since 0.4.4 didn't keep the spot.
