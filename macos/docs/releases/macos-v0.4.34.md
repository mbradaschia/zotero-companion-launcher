No two lists with the same name.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.34…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.34/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner (0.2.9) and the bridge (0.2.7) are unchanged.

**Review tables never share a name.** A new table whose name another table has gets the next free one ("CRT 2"), as
does a table whose name follows a new source; renaming a table to a name in use is refused, and the window says so.

**Saved searches neither.** Saving or renaming a search to a name another search has can't be chosen: the row says
the name is taken. Capitals and spaces at the ends don't make it another name.
