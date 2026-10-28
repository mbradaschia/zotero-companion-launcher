Settings › Setup installs Node.js, pdftotext and Tesseract for you, with Homebrew.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.11…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.11/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey.

**Install buttons that install.** In Settings › Setup, Enter on *Install Node.js*, *Install pdftotext* or *Read scans
by OCR* runs `brew install node`, `brew install poppler` or `brew install tesseract` in the background. It shows in
Processes as *Install poppler* (and so on), and the row says it's installed when it's done. Before, Enter only copied
the command, so the button looked like it did nothing.

Without Homebrew, Enter still copies the command for Terminal, and says Homebrew isn't installed (brew.sh).
