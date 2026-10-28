Updating from the menu bar quits the app and opens the new version, as it was meant to.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.4…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.4/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey.

**Update quits and reopens the app.** Until now *Update to …* installed the new version but left the old one running,
so it took effect only once you quit and reopened the app. The installer asked macOS to quit the app, but macOS's
`pkill` skips the processes that started it, and the app is one of them. It now quits the app, waits for it to be gone,
and opens the new version. Each update runs the new release's installer, so the update to 0.4.4 already works this way.
