The launcher resizes from its edges and corners.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.3.7…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.3.7/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey.

**Resizing:** drag any edge or corner of the launcher. It keeps the size you give it for the next time it opens (and
when it moves into a window with W and back), never smaller than 560 by 360 or larger than the screen. It looks as
before: its title bar is there for the resizing, hidden.

**The Zotero plugin** is now released as `zotero-companion-bridge-<version>.xpi` (it was
`oma-zotero-launcher-<version>.xpi`); installed copies keep updating themselves.
