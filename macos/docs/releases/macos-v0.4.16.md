A fix for AI columns added from the Columns menu, so no paper is run twice, and esc or a click to put away a cell's
whole text.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.16…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.16/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner stays 0.2.4.

**An AI column ticked in the Columns menu shows its answers at once**: the ones another table's run already made for
these papers. In 0.4.15 it came in empty until the table was drawn again, so *Run…* counted every cell as not run
and ran them all.

**A run doesn't redo a cell that has an answer already.** If the table showed a cell as not run but the column's file
has an up-to-date answer (or yours) for it, Run leaves it as it is, shows it, and says how many it left. *Run it
again*, and *Run…* with *up to date ones too*, still run what you ask.

**Esc or a click puts away a cell's whole text.** Selecting the cell again brings it back. A click on it over another
cell selects that cell.
