A reading companion for the iPad: the paper you're reading in Zotero, beside it in Split View, served by the app.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.23…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.23/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner and the bridge are unchanged.

**The companion.** Pick a paper (search, or the recent ones), then:

- its **status** and **default task**, always on its card, changed with one tap (the same `s/` and `t/` tags, and
  `todos.json`, as the Mac app writes them); the card folds to two pills;
- **chat** about it, the answer as it's written, the chats kept with the Mac's;
- its **notes** to read, copy with the citation, or open in Zotero, and a new note (Markdown) saved to Zotero;
- your **prompts**, run on the paper, the answer becoming a note;
- its **tasks**, added and ticked;
- its **taxonomies**: the labels, the suggestions to tag or dismiss, tagging by taxonomies; its other **tags**,
  added and removed;
- its **columns**, the review tables' list as rows: choose which show, edit your own, run or edit an AI one.

Tabs are icons with counts (notes, open tasks). Pills, their icons and the words are the Mac app's (statuses as you
named them, a top ranking's ★, the taxonomy strip, an AI cell's ● ✎ ⚠). It follows the iPad's light or dark
appearance.

**Getting it on the iPad.** The app runs the companion while it runs, on this Mac only (menu bar › *Reading
Companion* › *Run It With the App*, on by default; it needs Node.js 22, from Settings › Setup › Install Node.js). Your iPad reaches it
through Tailscale: install it on the Mac and the iPad, sign in to the same account, and turn on HTTPS certificates
in the Tailscale admin console (DNS). Then menu bar › *Reading Companion* › *Show the iPad Link…*: it asks Tailscale
to serve the companion on your tailnet (its own port, 8787; never public, and nothing you already serve changes) and
shows the link as a QR code. Scan it with the iPad's camera, then Share › *Add to Home Screen*. The link holds the
companion's key: keep it to your own devices. Turned off, the companion stops and Tailscale no longer serves it. The
Mac has to be awake with Zotero open.
