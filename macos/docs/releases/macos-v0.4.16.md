Settings › Setup installs Node.js, pdftotext and Tesseract for you, and installing the AI features no longer says it's done while a binary is missing.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.16…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.16/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey.

**Install buttons that install.** In Settings › Setup, Enter on *Install Node.js*, *Install pdftotext* or *Read scans
by OCR* runs `brew install node`, `brew install poppler` or `brew install tesseract` in the background. It shows in
Processes as *Install poppler* (and so on), and the row says it's installed when it's done. Before, Enter only copied
the command, so the button looked like it did nothing.

Without Homebrew, Enter still copies the command for Terminal, and says Homebrew isn't installed (brew.sh).

**The AI features install all of themselves, or say what's missing.** npm skips an optional package whose download
fails and still reports success. The Claude and Codex binaries are about 80 MB each, so a slow connection (a slow IPv6
route to the npm registry is enough) could leave one out while Settings said *AI features installed*. The installer
now checks that this Mac's binaries are there. If one is missing, it tries once more, preferring IPv4 (everything else
comes from npm's cache). If it's still missing, the install fails with *npm didn't download …: check the connection,
then install again*.
