A paper folded with AI on one Mac folds on the other without asking the model again.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.42…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.42/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The bridge (0.2.7) is unchanged. The prompt runner is now 0.3.2: after
updating, *Settings › Setup › Install the AI features* brings it up to date, on each Mac.

**Fold with AI shares its replies through the sync folder.** When your Macs share a sync folder, every reply the
model gives the reader is also kept in `shared/fold-replies/` there. Folding the same paper on the other Mac, with the
same model and effort, reads those replies: the plan says every section is cached, and it costs nothing. Each reply
is named by a hash of its question, model and effort, so the two Macs never write one file differently and nothing
needs merging. Papers you folded before are copied to the sync folder the first time you fold any paper after
updating. The folded text, links and your marks stay on each Mac. Without a sync folder nothing changes.
