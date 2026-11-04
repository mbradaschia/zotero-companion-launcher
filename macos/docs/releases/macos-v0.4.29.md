The review table's AI columns run a cell, a row or a column from a right-click, stop when you say, and cost less.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.29…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.29/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner is 0.2.7: Settings › Setup offers to update the AI
features. The bridge is unchanged.

**Run from a right-click.** On an AI cell: *Run it*, *Run it on the selected papers*, *Run this paper's AI cells*. On a
column's header: *Run this column* (what isn't run or is out of date) or *Run…*. Cells you ask for while a run goes
wait, then run together.

**Stop.** While a run goes, the toolbar's ▷ is ■: a click stops it. What's done stays. A cell being asked shows a turning
arrow, a cell waiting an hourglass.

**Run… lists the AI columns,** a box each, to pick which run.

**Cheaper runs.** The paper goes first in each request, alone, so the provider can cache it. With an Anthropic API key
it's cached only when it will be read again soon (a cell, a row); OpenAI and Gemini do it on their own. Before, each
request on the Anthropic API paid 25% more to cache something never read again.

**Copy with its citation.** Right-click any cell: *Copy*, or *Copy with its citation* in APA 7 ("… (Sirmon et al.,
2011).").

**Edit in the panel.** Your text columns and the AI's answers are edited in the panel on the right (⌘↵ or leaving the
box keeps it, esc drops it).

**Rows.** Drag a row's edge (in its first cell) to resize it, the selected rows too; a double-click puts it back. Every
cell now fills its row instead of stopping short with its own scroll bar.

**Lists and tags.** An AI column's *A list* answers in bullets now; *Tags* is the new answer of a few short labels, as
pills.

**Edit a column** from a right-click on its header or its row in Columns, or the row's pencil.
