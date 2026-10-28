The launcher's top no longer has an empty strip, and a long breadcrumb or the key hints wrap onto a second line.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.1…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.1/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey.

**No empty strip at the top.** The launcher kept room for its hidden title bar (about 28pt) above its own margin. The
breadcrumb now sits 8pt from the top and the search box 8pt below it (12pt at the top level, with no breadcrumb). Open
as a window is unchanged.

**A long breadcrumb wraps onto a second line** instead of being cut short, and where you are can take two lines
itself. The ranks and the count stay beside the first line.

**The key hints at the bottom wrap onto a second line** instead of dropping the ones that don't fit. esc and ⌫ are
always shown; the rest show while they fit in two lines.
