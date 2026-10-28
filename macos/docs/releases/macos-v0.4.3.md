Each paper's status and task on its row, the badges kept while picking a paper, and updates that open the new version
by themselves.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.3…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.3/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey.

**Status and task on each row.** Each paper in the results, and when picking one for a chat or a task, shows its status
(orange) over its default task (green) on the right of its row, as the Omarchy launcher does. They change as you set
them with ⌥→← and ⇧⌥→←.

**Picking a paper keeps the badges and the sort.** New chat… and a task's paper keep All and your pinned searches above
the list (Tab goes through them), and the sort pill with g / ⇧G.

**Updating opens the new version.** The installer now waits for the running app to quit before opening the new copy.
Before, it could open it while the old one was still quitting, and then nothing stayed open. This update already
works that way, since each update runs the new release's installer.
