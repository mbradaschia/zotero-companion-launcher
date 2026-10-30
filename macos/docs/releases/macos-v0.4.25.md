The reading companion opens on your iPad with nothing to type, and it has one tab less.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.25…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.25/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner and the bridge are unchanged.

**No key on your own devices.** Tailscale tells the companion who's asking. When it's the account the Mac is signed
in with, the page just opens: no key in the link, nothing to type, also when it's opened from the home screen. A
device signed in as someone else (a share of your Mac) still needs the companion's key. *Show the iPad Link…* now
shows the plain address, `https://<your Mac>.ts.net:8787/`.

**No Prompts tab.** The Columns tab already runs the AI on the paper, so the tabs are chat, notes, tasks,
taxonomies and tags, and columns. Tagging by taxonomies is in the taxonomies tab, as before.

**The companion says why it didn't start.** `~/Library/Logs/ZoteroLauncher-companion.log` records when the app
starts and stops the companion and what went wrong (no Node.js, the port in use, the server stopping), with each
request's method, path and status (never what's in your library).
