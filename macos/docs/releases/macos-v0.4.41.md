The reader finds the sections of papers whose PDF hides its bold.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.41…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.41/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner and the bridge are unchanged.

**Sections in papers whose fonts macOS can't name.** Some publishers, the Academy of Management's journals among
them, embed their fonts under made-up names, and the weight shows only as a suffix on the name. macOS's PDF engine
then reads every character as plain Helvetica, with no bold and no italic. In a paper whose headings are unnumbered
and set at the body's size, the reader saw no heading but References. It now reads bold, italic and the font family
from the PDF's own font names, on every page.

- A section title that wraps to a second centred line stays one heading.
- Bold title-case sub-sections nest under bold capitals sections of the same size.
- Figure and table captions, a figure's labels and the bold book titles in the references stay out of the headings.

On the Academy of Management Review paper that showed it, the reader now finds 21 of 35 headings, up from 1, all
nested right. Its 14 headings run into their paragraphs ("Capacity.") still read as text. On the six test papers it
still finds 157 of 158, nested right.

Papers you read before are read again the next time you open them. If you already folded one with AI, use
*Fold again* to read it anew.
