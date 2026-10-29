Review tables: edit a column, Jev on labels you write, several of a list; the AI features update themselves.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.22…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.22/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner is 0.2.6 (the app installs it on its own after this
update); the bridge (0.2.6) is unchanged.

**Edit a column.** A column's ▾ menu has *Edit it…*: the same form as + Column, filled in. Your columns: their name,
their type and their choices (a choice you take out stays on the papers that have it). AI columns: their prompt,
labels, topic, model and the rest; their kind stays. Changing what decides an AI column's answers marks the answers it
has out of date, and Run… (⇧⌘R) redoes them.

**Jev on labels you write.** Jev, best fit and Jev, several labels no longer need a taxonomy: write your own labels,
one a line, each with what it means (`qualitative: interviews, cases`), and a question if you like. A taxonomy is
still there to pick. Best fit needs two labels or more.

**Several of a list.** A column of your own can hold several of its choices per paper (themes, constructs…). Each is a
pill in the cell; the panel's pills turn each on, marked ✓, or off again.

**Group leaves out free text.** Group no longer offers your text columns or an AI's answers in words or as a list,
whose values hardly ever repeat.

**The AI features update themselves.** When an app update brings newer AI features than the ones installed, the app
installs them on its own as it starts (it's in Processes), once per version. If that fails, Settings › Setup still
offers it.
