The review table gets the app's chat, docked on its right: about the selected paper, or across the list.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.30…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.30/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner is 0.2.8: the app updates the AI features after it updates.
The bridge is unchanged.

**The chat, docked.** The chat icon at the top of the table's panel (or the toolbar's, or ⌥⌘C) opens it on the right;
drag its edge to size it, ✕ or ⌥⌘C closes it.

**Paper or List.** *Paper* is the chat you know, about the selected paper, and it follows your selection. *List* asks
across the papers as the table shows them: each one's citation and reference (Zotero's, APA 7), its venue and year, its
abstract, and the columns you see. Answers cite the papers (Author, Year). It doesn't read the full texts: for that,
ask each paper.

**Ask each paper.** In *List*, *Ask each* makes your question an AI column that reads every full text. You see the run's
plan first; when it's done, the chat sums up the answers, with how many papers support each point and which disagree.
