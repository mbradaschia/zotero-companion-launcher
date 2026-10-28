Catching up checks first and is offered when the app opens; the launcher can open as a window.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.0…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.0/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey.

**When the app opens, it offers to catch up.** It checks what needs bringing up to date and, when something does,
opens the launcher on a question (*Bring 7 papers up to date?*). *Not now* is highlighted, so a stray Return leaves
the papers be; esc is Not now too. Only the machine automation runs on asks. Settings › Defaults › When the app opens
turns it off, and *What the app checks when it opens* chooses what it looks at: the text, the taxonomies and each
prompt on papers added lately, and the taxonomies and prompts that changed (off by default: re-running prompts costs).

**A catch-up checks first.** Enter on a *Bring papers up to date* row asks again which papers need it and starts
exactly those (*Started: 5 processes on 3 papers*, or *Nothing to do*).

**Open as a window** (Settings › General, off by default; also in the menu bar icon › Hotkey and Login…): the hotkey
opens a regular window instead of the overlay. It stays when you click away, window managers such as Raycast's can
move and tile it, and it comes back where you left it. W still switches between the two for one opening.

**The background automation starts with the app**, not at the launcher's first opening.
