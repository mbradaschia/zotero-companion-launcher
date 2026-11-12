The fold reader uses the app's font.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.45…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.45/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The bridge (0.2.7) and the prompt runner (0.3.5) are unchanged.

**One font.** The fold reader set the paper's own words (its title, its headings, the text at Full and Brief) in a
serif, to tell them from the words AI wrote. Everything in the reader is now in the app's sans, as in every other
window.

**Who wrote it, still shown.** You can still tell the paper's words from the AI's without relying on colour: the
toolbar shows `Aa` with a solid underline over Full and Brief and a sparkle with a dashed one over Key, Takeaway and
Topic (hover it for the model and the date); a section the AI hasn't written yet says `First sentences: not folded
yet` over the paper's own first sentences; and the AI's words are set a size smaller (15 px against the paper's 16).

**The title leads.** The paper's title in the header was smaller (19 px) than a first-level heading (21 px). It is
now 22 px, so it reads as the page's top line. In a narrow window it stays at 16 px over two lines, to leave room for
the text.
