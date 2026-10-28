Installing the AI features no longer says it's done while the Claude or Codex binary is missing.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.12…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.12/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey.

**The AI features install all of themselves, or say what's missing.** npm skips an optional package whose download
fails and still reports success. The Claude and Codex binaries are about 80 MB each, so a slow connection (a slow IPv6
route to the npm registry is enough) could leave one out while Settings said *AI features installed*. The installer
now checks that this Mac's binaries are there. If one is missing, it tries once more, preferring IPv4 (everything else
comes from npm's cache). If it's still missing, the install fails with *npm didn't download …: check the connection,
then install again*.
