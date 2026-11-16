A compact note header, the chat beside a note, one set of keys, and text size everywhere.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.46…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.46/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The bridge (0.2.7) and the prompt runner (0.3.5) are unchanged.

**A compact note header.** Reading a note, the path, the rating pills and an empty search row used to fight for the
top: the path wrapped to four lines beside the pills, and the paper was named twice. The header is now one line for
the way back (the first level, a `···` menu of the levels between, then the paper by its cite and title, cut to fit),
the chat toggle and the pin; the note's own title as the heading, its date beside it; then the paper's ranks, status,
task and taxonomies in one wrapping flow. The "Reading · j k scroll · esc back" row is gone (the footer has the keys).
Status and task are menus: a click changes them, as ⌥→← and ⇧⌥→← do. In a paper's menu and its other views the pills
moved under the path too, so it gets the whole width.

**The chat beside a note.** `c` in the reader opens the paper's chat on the right of the note (or gives it the keys
when it's open); ⌥⌘C or the header's bubble shows or hides it. Drag its edge to size it. esc in its empty box gives
the keys back to the note. It follows the note's paper, and stays open for the next note until you hide it. Its bar's
window icon moves the chat to its own window.

**One set of keys.** Every keys panel writes the help row the same way (`?  F1`); F1 now works in a chat docked in a
review table too. `c` is the chat in a review table as well (as ⌥⌘C). ⌥ and a letter is written lowercase (`⌥m`,
`⌥p`), as the footers write it. The note window's footer follows the reader's order and says `esc ⌘W close`; the
reader's footer adds `⇧esc home` and ⌥⌘C; the results and a paper's menu hint `v fold`. A chat's window and the chat
beside a note take ⌘V, ⌘Z and the other editing keys.

**Text size everywhere.** ⌘- ⌘+ (⌘= too) and ⌘0 now size a chat's text (its window and the chat beside a note, one
size for every chat, kept on this Mac), and work the same way in the note reader, note windows, the fold reader and
review tables, each keeping its own size. Every step says the size (`Text 16 px`, `Text 110%`). In the launcher's
lists, the keys say where they work instead of beeping.
