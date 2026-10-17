The one-line install works in a normal Terminal again.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.3.6…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.3.6/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey.

**Fixed:** 0.3.5's installer stopped at once in a UTF-8 Terminal (`TAG?: unbound variable`): macOS's bash read the
"…" after a variable as part of its name. If you hit that with 0.3.5, this release's command above works; so does
adding `LC_ALL=C` before `bash` with the old one.

Everything else is as in 0.3.5.
