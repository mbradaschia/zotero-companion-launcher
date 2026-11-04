Settings in a better order, and the review table's right pane in tabs: Info and Chat, side by side or split.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.31…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.31/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner (0.2.8) and the bridge are unchanged.

**The order.** Settings starts with *General* and *Defaults*, then Models & providers, Rules, Paper status, Taxonomies
and Tasks, then Setup.

**Automation runs on** is now in *Defaults › New papers*, right under the line that says where new papers are handled,
next to the switches it decides. It was in General › Sync. The setting itself is unchanged.

**Defaults, regrouped.** The fallback model (*When a model fails*) comes right after the Prompts and Chat models.
*Extract every paper's text*, and trying the skipped ones again, moved to *Bring papers up to date* with the other
catch-ups.

**General, fewer one-row sections.** *Papers* (Shift+Enter or z, and the citation style) and *Folders and sync* (the
sync folder, this machine's name, the artifacts' folder).

**The review table's right pane.** *Info* and *Chat* are tabs of one pane, each with its symbol. Drag the pane's left
edge to size it; both tabs share the width, kept for the next table. Drag a tab down onto the pane's lower half (or
click the split button at the tabs' right) to see both at once, Info above and the chat below, and drag the divider
between them. Drag the chat's bar back up to the tabs, or click the button again, to go back to tabs. ⌥⌘I hides the
pane; ⌥⌘C switches to the chat and back.
