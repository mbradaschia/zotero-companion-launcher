Fold with AI has its own model and effort.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.37…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.37/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The bridge (0.2.7) is unchanged. The prompt runner is now 0.3.1: after
updating, *Settings › Setup › Install the AI features* brings it up to date.

**Settings › Defaults › Fold with AI.** Pick the reader's model (the prompts' model unless you pick another) and its
effort (low unless you pick another). The reader's banner and the Fold button name both. A different effort asks the
model again rather than reusing the replies kept at the last one. With runner 0.3.0 the model you pick is used, but the
effort stays low until the runner is updated.
