The reader asks your AI model which lines are a paper's section headings, and sets them like the paper does.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.43…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.43/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The bridge (0.2.7) is unchanged. The prompt runner is now 0.3.4: after
updating, *Settings › Setup › Install the AI features* brings it up to date, on each Mac. Until then the reader finds
the sections itself, as before.

**The sections are checked by AI when a paper first opens.** The reader's own rules read a heading from how a line is
set, and management journals set them in ways no rule covers: letterspaced capitals, italic phrases that open a
paragraph, levels only the meaning tells apart. So the reader now sends your Fold with AI model the lines that could
be headings (with the few words after each, the paper's title and the PDF's bookmarks, never the paragraphs) and the
model says which are sections and how they nest. One request a paper, a few cents at most. The answer is kept, and
shared through the sync folder with the fold's replies, so the other Mac asks nothing. Sections now go four levels
deep, and a run-in heading is a section of its own.

On 20 open-access management papers the reader's rules found 71% of the headings and nested 62% of them right; with
the model's check, 97% and 94%, with the same 24 lines wrongly taken for headings. Those papers' lines were read by a
stand-in for the Mac's PDF engine, so the app's own numbers may differ a little.

This is the one thing the reader sends without a click. While it waits the text says `Checking the sections with
AI…`, with a *Skip* button that shows the paper at once with the sections the reader found itself. Afterwards the
byline says who set the sections, with an icon and words: *Sections checked by AI*, *Sections from the PDF's
bookmarks* or *Sections found by the reader*. *Settings › Defaults › Fold with AI › Check the sections with AI* turns
it off on this Mac. A paper you opened before is checked the next time you open it; one already folded keeps its
sections until *Fold again*.

**Headings read like the paper's.** A heading is the paper's own words, so it is now set in the paper's serif, not
the sans the reader keeps for its own words and the AI's. It starts on the text's left edge, with its number beside
it, so a long title wraps under its own first word. The four levels differ by size, slope and the space above them,
and only the first carries a rule, in every theme. A heading the paper prints in capitals is shown in the case of the
paper's other headings (title case when it has none to go by), each word as the paper's own text writes it, so `CEO`
stays `CEO`; hover it to see it as printed. VoiceOver reads them as headings.

**The AI features' packages are up to date.** `npm audit` listed seven advisories (four high) in packages the
runner's packages depend on; each moves to its fixed version.
