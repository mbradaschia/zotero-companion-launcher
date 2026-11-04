The review table's docked chat fits its pane, in the table's text size.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.32…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.32/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner (0.2.9) and the bridge are unchanged.

**The docked chat fits its pane.** It asked for at least 320 points, so a narrower right pane cut it off at both
sides. It now takes the pane's width, whatever it is. Its conversation is in the table's text: 13 px at the table's
text size (⌘- and ⌘+ size both), with narrower margins; its controls are the small ones.

**No model named twice.** Docked, the line under the source leaves the model out, since the box's picker shows it.
