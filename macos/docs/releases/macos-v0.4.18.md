The search box empties once you pick a place, a setting or a saved search from it, and a paper's menu names where the
paper was published.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.18…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.18/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner is unchanged (0.2.5).

**What you typed goes once you choose a row from it.** Typing "settings", a setting's name or a saved search's name
and pressing ↵ empties the search box, so back from there, or the next time the launcher opens, you're on your library
instead of on "settings". A paper, a collection or a tag keeps what you typed: back from it, you're on the results you
chose from. In a menu, back from the row you chose shows the whole menu again; a row that acts in place (a switch)
stays highlighted with the whole page around it. Pages where you type a value (a name, a task) keep it.

**A paper's menu names its journal.** The paper is a heading on its own line under the path, with no › before it, and
where it was published (the journal, else the proceedings, book or university) is under its title.
