Catch-up fixes: one row while one runs, and a batch that stops when every paper would fail.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.7…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.7/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey.

**One catch-up row while one runs.** Settings › Defaults › Bring papers up to date no longer shows the offer to start
a catch-up beside the one running. The running row counts both: "58 processes left on 23 papers · 0 done, 2 failed".

**Problems every paper would meet stop the batch.** Claude or ChatGPT signed out, a refused API key, out of credit or
over the usage limit, the AI overloaded, no model set up, no network:

- A catch-up stops at the first one and says what to fix (for a signed-out Claude: in Terminal, run `claude`, then
  `/login`). The paper it was on isn't counted failed. Settings shows it stopped until you start it again.
- Tagging by taxonomies stops there too, the papers behind it not tried.
- New papers' taxonomies and prompts wait (Processes shows *AI work on hold*) and try again by themselves: after 5
  minutes for the network, 30 for the rest. The papers they skipped run once it's fixed.
