The reading companion finds Tailscale again, and your own devices get in with the address alone.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.40…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.40/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner and the bridge are unchanged.

**"Tailscale isn't connected on this Mac" while it was.** Since a recent Tailscale update, Tailscale.app's command
only answers when it's run from a terminal, and the app starts the reading companion without one. Tailscale replied
"The Tailscale GUI failed to start", so *Show the iPad Link…* said Tailscale wasn't connected. The companion also
couldn't learn who you are, so it asked your own iPad for a key, which it never should. Now Tailscale is asked the way
its command expects. Your devices signed in to your Tailscale account open the companion with its address and nothing
to type. If Tailscale's command fails again, the menu shows what it said instead of "not connected".
