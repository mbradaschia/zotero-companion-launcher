The reading companion starts with the app even while macOS is asking about your external drive.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.26…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.26/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner and the bridge are unchanged.

**Why it didn't start.** With the sync folder on an external drive, macOS asks after each update whether the app may
open files there. The app read the sync folder first thing at launch and waited on that question, so until someone
clicked *Allow* on the Mac, nothing else ran: not the menu, not the companion. Now the companion starts first, on its
own, so your iPad can reach it while the question waits. Click *Allow* when you're at the Mac.

**A port just let go.** When the companion's port is still held for a moment (a server just stopped), the app tries
again a few times before it says the port is in use.
