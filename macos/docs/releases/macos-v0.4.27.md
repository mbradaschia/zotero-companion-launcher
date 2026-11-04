An AI taxonomy draft waits for you, and a paper's notes show its status and default task.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.27…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.27/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner and the bridge are unchanged.

**Why a proposal was lost.** A taxonomy drafted with AI can take a few minutes. If you closed the launcher or went to
another page meanwhile, the proposal came back to a page you weren't on, and *New taxonomy with AI…* always started a
new, empty draft: there was no way back to it, and so no *Accept*.

**Now it waits.** A draft that's waiting for the model, proposed, or failed is kept until you accept or discard it:

- Settings › Taxonomies shows *Your new taxonomy with AI…* (on a taxonomy's page, *Your changes with AI…*), saying
  whether the model is still on it or what it proposed. Enter opens the draft as you left it, on *Accept*.
- Starting a different draft asks before the one you have is dropped.
- A proposal that comes while you're elsewhere says where it waits.

**What it says while it works.** The page says since when the model has been thinking and that you can leave. A save
that fails is said on the page (not only in a flash that goes in 3 seconds), and the draft stays to accept again. No
answer in 10 minutes names your prompts model and where to pick another.

**The companion's log keeps every line.** The app's lines and the server's no longer write over each other.

**A paper's notes show its status and default task.** On the list of a paper's notes and while reading one, its
status and its default task sit beside its rankings, as in the results and the note window. Each pill has its kind's
icon (a flag for the status, a checklist for the task), so they're never told apart by colour alone; a paper without
one shows a faint *no status* or *no task*. ⌥→← changes the status and ⇧⌥→← the task in the notes list too, as they
already did in the reader and the paper's menu.
