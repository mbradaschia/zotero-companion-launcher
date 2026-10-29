# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The Omarchy plugin, the Zotero
bridge and the prompt runner share one version.

## [Unreleased]

### The Mac app (`macos-v0.4.21`)

- **esc no longer closes the launcher's window.** In the window (Settings › General › Open as a window, or `W`), esc
  still leaves the search box, clears it and goes back a level, but at the top it stays open: ⌘W or the window's
  close button closes it, and the footer says `⌘W close`. The overlay closes on esc as before.
- **A new column lands where you're looking.** In a review table, a column you add (+ Column, or ticked in Columns)
  goes right after the column of the selected cell, and is selected, instead of at the far right.
- **Columns is one list you can order.** The shown columns come first, in the table's order: drag a row by its handle
  to move its column (or ⌥⌘↑ ⌥⌘↓ on its tick). The columns not shown follow. Each row has its kind's icon (status,
  task, ranking, taxonomy, yours), and an AI column has a sparkle, in Columns and on its header, instead of a separate
  AI section.
- **The panel lists the paper's notes.** The table's right-hand panel shows the selected paper's notes, in your order;
  a click opens one in its own note window, as `w` does in the launcher.

### The Mac app (`macos-v0.4.20`)

- **You see which papers have a PDF.** A paper's icon in the results and lists is solid when it has a PDF attached
  and hollow when it hasn't (the same shape for its type: a page for an article, a book for a book). Shape, not
  colour, tells them apart; hovering the icon says *Has a PDF* or *No PDF*, and VoiceOver reads it too.

### The Mac app (`macos-v0.4.19`)

- **Sort before you type.** The top level has a Sort and an Order of its own: Recent (as before), date added, date
  changed, year published, title or first author. Sorted, it lists your library's first papers in that order (the
  results limit, 60 by default), under Papers; your pins and the papers open in Zotero stay above them. `g` sorts the
  next way there too. It needs bridge 0.2.6; an older one sorts only the recent few.
- **Title and first author** are sorts in a collection, a tag or a saved search too, and a collection's or a tag's
  papers come from the bridge already in the sort you chose.

### The Mac app (`macos-v0.4.18`)

- **What you typed goes once you choose a row from it.** Typing "settings", a setting's name or a saved search's and
  pressing Enter empties the search box, so back from there (or the next time the launcher opens) you're on your
  library, not on "settings". A paper, a collection or a tag keeps what you typed: back from it, the results you chose
  from. In a menu, back from the row you chose shows the whole menu; a row that acts in place (a switch) stays
  highlighted with the whole page around it. Pages where you type a value keep it.
- **A paper's menu names its journal.** The paper is a heading on its own line under the path, with no › before it,
  and where it was published (the journal, proceedings, book or university) is under its title.

### The Mac app (`macos-v0.4.17`)

- **Colour is never the only sign.** Each pill kind has its symbol: a status's flag, a task's checklist, a rank's
  star, a taxonomy's tag, a warning's ! (the launcher, the reader and the review table). The top journal grades get a
  star, and a negated search block is struck through. *General › Appearance › Colour-blind safe colours* (on by
  default) draws the pills and the search's colours with hues that stay apart for a red-green colour-blind eye, in
  every theme.
- **The review table answers to the launcher's paper keys**: `i` `r` copy the paper's citation or bibliography
  entry, `o` opens its PDF, `n` its notes (in the launcher), `z` shows it in Zotero. `/` filters the rows by words in
  the columns shown; esc clears it.
- **Delete this table…**, in the table's source menu, asked first: the file goes to the Trash, your columns and
  their values stay.
- **Titles in the review table show their italics and bold** (`<i>`, `<b>`, sub- and superscripts) instead of the
  tags; sorting, the filter and CSV read the plain title.
- **Calmer footers.** The launcher's shows going back, `/ search`, `? keys` and four keys for where you are; the
  table's four and `?`. Every key is still in `? keys`.
- **One set of icons**: the review table draws the launcher's concepts with the same names, and Group, Sort and
  Order have shapes of their own (three boxes, two arrows, one arrow). A narrow column shows its name, not a lone ▾.
- Hotkey and Login… says a login problem with a sign and the theme's red.
- The runner is 0.2.5 (it skips read-only libraries): Settings › Setup offers to reinstall it.
- **Sort › Manual: a list in your own order.** In a collection, a tag or a saved search, ⇧↑↓ moves the highlighted
  paper and drag and drop puts a paper where you drop it; either switches the list to Manual from the order you see.
  Each list keeps its order in view.json (`paperOrder`, merged per list), so both Macs share it.
- **What you type is by relevance**, so typing an author's name lists their papers first. Group and Sort (g, G) arrange
  a list you browse: a collection, a tag or a saved search with nothing typed. A sort kept from before re-sorted typed
  results too.
- **A place you type in full is where the cursor starts**: "settings", "new task" or a saved search's name puts the
  cursor on it, above the papers. A part of a name still starts on the papers.
- **The window W opens is a regular one**: the app launches as a regular app, so tiling window managers (TileMyMac,
  AeroSpace, yabai, Amethyst) manage it; it stays on its Space and can go full screen. With In the Dock and ⌘Tab off,
  the Dock icon shows a moment at launch.
- **It counts which features you use, for you only**, so the app can be shaped by what you actually do: a count a
  day of the keys, rows, views, review-table actions and windows you use, by the app's own names (`key:i`,
  `row:open`, `view:settings`), in the sync folder's `usage/<this Mac>.json`. Never what you type, a paper, a note
  or a tag, and nothing is sent anywhere. *Hotkey and Login… › Count which features I use* turns it off;
  `node macos/scripts/usage-report.mjs <the usage folder> --days 30` adds it up.

### The Mac app (`macos-v0.4.16`)

- **An AI column ticked in the Columns menu shows its answers at once**: the ones another table's run made for these
  papers. It used to come in empty until the table was drawn again, so *Run…* counted every cell as not run.
- **A run doesn't redo a cell that has an answer already.** If the table showed a cell as not run but the column's
  file has an up-to-date answer (or yours) for it, Run leaves it, shows it, and says how many it left. *Run it again*
  and *Run…* with *up to date ones too* still run what you asked.
- **Esc or a click puts away a cell's whole text**; selecting the cell again brings it back. A click on it over
  another cell selects that cell.

### The Mac app (`macos-v0.4.15`)

- **An icon of its own**, in the Dock, ⌘Tab and Finder: a shelf of books and a magnifier.
- **In the Dock and ⌘Tab.** Its Dock icon, or switching to it with nothing of it on screen, opens the launcher as the
  hotkey does. Settings › General › In the Dock and ⌘Tab turns it off (the menu bar's icon and the hotkey only, as
  before); it's kept on this Mac.
- **Themes preview as you browse.** On Settings › General › Theme (and Light or dark), the row you're on is the app's
  look at once; ↵ keeps it, esc or ⌫ (or closing the launcher) puts back the one you had.
- **Each list keeps its review table.** ⌘T on a collection, a tag, a saved search or a query that already has one
  opens that one, with its columns, their widths and order, its sort and grouping as you left them. It used to make a
  new table with the default columns every time.
- **+ Column asks who fills it in first**: you (text, or one of a list) or the AI, and then only that kind's fields.
  The *Existing attributes* section is gone: the Columns button now lists every column there is (Zotero's fields,
  the rankings, your taxonomies, your columns and the AI ones), grouped, to tick.
- **Write it with AI**: in an AI column's dialog, describe what you want to know and the AI writes the column for
  you (its name, the prompt, what it reads, the answer's shape, the choices; a Jev relevance column's topic and
  definition). Change anything before *Add*. It runs on your prompts model.
- **The selected cell shows its whole text** when it doesn't fit, over the cells below. A click on it selects the
  cell under it, a double-click edits it (or opens the paper, on the title).
- **⌘- and ⌘+ size the table's text** (⌃- and ⌃+ too), ⌘0 goes back. One size for every review table, kept.
- **A cell, the panel or a menu scrolled to its end stops there**: the table doesn't scroll on.
- **The toolbar's menus close** on their button again, or a click outside.
- The runner is 0.2.4 (`review-draft`): *Settings › Setup › Install the AI features* offers the update.

### The Mac app (`macos-v0.4.14`)

- **AI columns in the review table** (phase 11b). *+ Column › An AI column* makes one of four kinds:
  - *AI prompt*: your question, asked of each paper. It reads the title and abstract or the full text (the extracted
    text, else the PDF). Its answer is text of at most N words, a list, a number or one of a list. Evidence is optional:
    quotes with their page, each checked word for word against the paper. It runs on your prompts model or any model
    the app lists.
  - *Jev, several labels* and *Jev, best fit*: one of your taxonomies.
  - *Jev, relevance*: a topic and what relevant means, scored 0 to 100 (high from 70, maybe from 40).
  The Jev kinds read what tagging reads and run on your prompts model without a Jev key. A run from the table writes
  no Zotero tags.
- **Run… shows the plan before anything starts** (the toolbar's ▷, a column's menu, ⇧⌘R). It covers the selected
  papers or every one shown, this column or every AI column, the cells by state, what's left alone (up to date, or
  yours unless you ask), and the requests with Jev's cost. A run is one row in Processes. It makes one Jev request per
  paper for all its Jev cells and one request per model and text for the prompt columns. Each paper's cells are
  written as they're made, so a stopped run keeps them. At most 200 papers a run.
- **A cell says when it's out of date.** Amber means the column changed since it ran, or the paper's text was
  extracted since. ✎ means you edited it, and ⚠ means it failed, with the reason.
- **The panel shows an AI cell whole**: the value, each label's probability, the evidence (found or not), the model,
  the date and the text it read. It has *Run it again*, and *Back to the AI's answer* for a cell you edited; an AI
  prompt's text cell edits as your own columns do.
- The runner is 0.2.3 (`review-run`): *Settings › Setup › Install the AI features* offers the update.
- **Settings › Setup installs Node.js, pdftotext and Tesseract itself**: Enter on *Install Node.js*, *Install
  pdftotext* or *Read scans by OCR* runs `brew install …` (node, poppler, tesseract) in the background, shown in
  Processes, and the row says it's installed when it's done. It used to only copy the command, with nothing on screen
  but a short flash, so the button looked broken. Without Homebrew it still copies the command, and says so.
- **Installing the AI features no longer reports success without the Claude or Codex binary**: npm ci skips an
  optional package whose download fails (each is ~80 MB; a slow IPv6 route to the registry is enough) and still
  succeeds. The installer now checks that this machine's binaries are there, tries once more preferring IPv4 (the
  rest comes from npm's cache), and fails with "npm didn't download …" if they're still missing. The Omarchy
  launcher's installer too.
- **Themes.** Settings › General › Appearance › Theme picks the app's colours: Default (the Mac's own colours and
  accent, as before) or one of ten well-known themes, each with a light and a dark variant: Catppuccin (Latte, Mocha),
  Solarized, Gruvbox, Nord, Dracula (Alucard, Dracula), Tokyo Night (Day, Night), One (Light, Dark), GitHub and Rosé
  Pine (Dawn, Rosé Pine). Each row shows its accent. One palette draws every window: the launcher (the overlay and the
  window), its search box, notes, chats and review tables, their title bars too.
- **Light or dark** (same section): As the Mac (System Settings › Appearance, the default), or always light, or always
  dark, for the whole app (its menus and alerts too). Both are kept on this Mac, as Open as a window is.
- A theme's colours are its authors'; one used as text that would read poorly on the background (Solarized Light's
  yellow, Nord Light's greens) is darkened, or lightened on a dark one, until it reads (4.5:1 for the second line and
  the accent, 3:1 for the pills).

### The Mac app (`macos-v0.4.13`)

- **The review table's toolbar is icons** (Group, Sort, Order, Lines, Columns, add a column, Export, Panel, search
  again, Pin), each named when you point at it and to VoiceOver.
- **A pin keeps the table over other apps' windows**, as the launcher's pin does; it's remembered for the next table.
- **Columns as narrow as you drag them** (16 px at the least, from 40-48), and the resize grip no longer starts a
  column move: it lies inside its own header's right edge, and a column moves when you drag its header past a few px
  (a click still sorts; ending a drag or a resize doesn't).
- **The source box's query works as the launcher's search box**: the table follows as you type, the query is read as
  the launcher reads it (its blocks: `y:2015..` as *Year: 2015..*, `!#excluded` as *NOT # excluded*), ↵ keeps it, esc
  goes back to the source, and ⌘S saves it as a search, which the launcher lists too.

### The Mac app (`macos-v0.4.10`)

- **The review table is easier to find.** The results' footer hints ⌘T table wherever the keys are (the search box or
  the list), early enough that a narrow launcher keeps it, and a table button beside the pin opens the results as a
  review table, as ⌘T does.
- **Group, Sort and Order, apart.** The results' one pill (e.g. "Year ↑") is three controls on the bar: Group ▾
  (none, paper status, task status, task group, or a taxonomy), Sort ▾ (relevance, date added, date changed, year
  published) and Order (↓ Desc / ↑ Asc, off while the sort is relevance). g picks the next sort, G the next grouping.
  The view keeps them as `group`, `sort` and `order` in view.json; an older `grouping` is read once and replaced.
- **The review table groups too.** Its toolbar has Group ▾ (any column with values to share, such as year, type,
  status or a taxonomy), Sort ▾ (the columns sorted, as before) and Order, which turns the first sort key. Each group
  gets a header row with its count, the empty group last; the table remembers the grouping.

### The Mac app (`macos-v0.4.7`)

- **One catch-up row while one runs.** Settings › Defaults › Bring papers up to date showed the running catch-up and,
  under it, the offer to start one, with counts that didn't match (processes left vs papers). While one runs, its row
  takes the place of the three offers and says both: "58 processes left on 23 papers · 0 done, 2 failed".
- **A problem every paper would meet stops the batch** instead of failing paper by paper: Claude or ChatGPT signed out,
  a refused API key, out of credit or over the usage limit, the AI overloaded, no model set up, no network. The
  catch-up stops at the first one (that paper isn't counted failed) and says what to fix (e.g. "in Terminal, run
  claude, then /login"); Settings shows it stopped until you start it again. The tagging queue drops the papers queued
  behind it, and the runner's `classify` stops a multi-paper batch there too (the rest `stopped`, not tried). New
  papers' taxonomies and prompts hold (Processes: AI work on hold) and try again later (5 minutes for the network, 30
  for the rest), and the papers they skipped aren't marked done or failed, so they run once it's fixed.

### The Mac app (`macos-v0.4.6`)

- **Review tables** (phase 11a, `macos/docs/superpowers/specs/2026-10-27-phase-11a-review-table-design.md`): ⌘T in
  the results opens what they list (a query, a collection, a tag, a saved search) as a review table, in its own
  window; the menu bar's Review Tables opens one again. The list is live (at most 200 papers). Columns: Zotero's and
  the launcher's attributes, a column per taxonomy, and columns of your own (text, or one of a list). Drag to reorder
  and resize, pick 1, 2, 3, 6 or all lines, hide, sort by several columns (⇧-click adds one), collapse the panel
  (⌥⌘I). The panel changes a paper's status and its task (⌥→← and ⇧⌥→← too); a click on a cell never changes it.
  ⌘E exports the table as CSV. Reviews, your columns and their values live in the sync folder (`reviews/`), and a
  column's values merge by paper between machines. No AI columns yet (11b).

### The Mac app (`macos-v0.4.5`)

- **The launcher opens where you left it, also after the app restarts** (an update, a login, a quit): the same view,
  paper, scope, search and row. Within a run it already did; now the first opening after a restart does too. A page
  that needs more than that to be drawn again (a note being read, a setting being edited, a picker) comes back as the
  level under it.

### The Mac app (`macos-v0.4.4`)

- **Update quits the running app and opens the new one**: macOS's pkill skips its caller's ancestors, and the app
  runs the installer, so the app was never quit: the new copy was installed while the old one kept running until you
  quit it yourself. The update to 0.4.4 already runs the fixed installer.
- **The UI tests close a system alert left on screen** before each launch: it made every launch after the first wait
  about 35 seconds.

### The Mac app (`macos-v0.4.3`)

- **Each paper's status and task on its row**: the status (orange) over the default task (green) on the right, in the
  results and when picking a paper, as the Omarchy launcher draws them. They change with ⌥→← and ⇧⌥→←.
- **Picking a paper keeps the badges and the sort** (New chat…, a task's paper): All and the pinned searches above the
  list (Tab goes through them), and the sort pill with g / ⇧G.
- **Updating opens the new version by itself**: the installer waits for the running app to be gone before opening the
  new copy (opened while the old one was still quitting, macOS brought that one forward, and nothing stayed open).
- **The Zotero bridge comes with each Mac release** (its .xpi and .sha256), and each bridge release with the Mac app.
- **A merged version is released by itself**: a new MARKETING_VERSION on master, with its notes, is tagged and published
  by CI. Pull requests that change no code (notes, docs, the version) skip the UI tests.

### The Mac app (`macos-v0.4.2`)

- **A paper's ranking pills beside the breadcrumb keep their size**: in 0.4.1 the breadcrumb took the bar's width
  first and squeezed them. The breadcrumb wraps in the space left.
- **The UI tests are fixed and gate the build** (on pull requests and master): three had been failing unnoticed, as
  the tests didn't see one-line rows and the chat test asked its second question too soon.

### The Mac app (`macos-v0.4.1`)

- **No empty strip at the top of the launcher**: it kept room for its hidden title bar (about 28pt) above its own
  margin. The breadcrumb now sits 8pt from the top and the search box 8pt below it (12pt at the top level). Open as a
  window is unchanged.
- **A long breadcrumb wraps onto a second line** instead of being cut short; where you are can take two lines itself.
  The ranks and the count stay beside the first line.
- **The key hints at the bottom wrap onto a second line** instead of dropping the ones that don't fit. esc and ⌫ are
  always shown.

### The Mac app (`macos-v0.4.0`)

- **Open as a window** (Settings › General, off by default): the hotkey opens a regular window instead of the overlay,
  one that stays when you click away and that window managers such as Raycast's can move and tile. It comes back where
  you left it. W still switches between the two for one opening. Also in the menu bar icon › Hotkey and Login….
- **A catch-up checks first**: Enter on a Bring papers up to date row asks again which papers need it (the page's count
  may be old) and runs exactly those: `Started: 5 processes on 3 papers`, or `Nothing to do: every paper is up to date`.
- **When the app opens, it offers to catch up**: it counts what needs bringing up to date and, when something does,
  opens the launcher on a question (`Bring 7 papers up to date?`, with what it found). Not now leaves it; esc too.
  Settings › Defaults › When the app opens turns it off (*Ask to catch up when the app opens*), and *What the app checks when it opens*
  chooses what it looks at: the text, the taxonomies and each prompt on the papers added lately, and the taxonomies and
  prompts that changed. Until you choose, it checks what New papers runs. Only the machine automation runs on asks.
- **The background automation starts with the app**: it waited for the launcher's first opening.

### The Mac app (`macos-v0.3.7`)

- **The launcher resizes from its edges and corners**, and keeps the size you give it (also when it moves into a
  window with W and back); it never opens smaller than 560 by 360 or larger than the screen. It's a titled panel with
  its title bar hidden: a borderless one doesn't resize from its edges, and its clear corners passed the clicks to the
  app behind. (The size handling comes from PR #30.)

### The Mac app (`macos-v0.3.6`)

- **The one-line install stopped at once in a UTF-8 Terminal** (`TAG?: unbound variable`): macOS's bash read the "…"
  after `$TAG` as part of the variable's name. Written `${TAG}` now, and a test keeps every script's variables clear of
  non-ASCII characters (the Omarchy launcher's scripts too).

### The Mac app (`macos-v0.3.5`)

- **Copying a citation or bibliography entry (i, r) works under a paper's menu and in a note**: in its Notes (and
  its other views) and in the note reader they said "Nothing to cite here". In the reader they copy the note's own
  paper.
- **P leaves the highlight where you were**: moving a row to Other (or back) kept the highlight on it, so it jumped to
  the bottom; it now stays on the row that was below it.
- **The launcher is no longer see-through**: its background was a translucent material, so what was behind it (more
  so while it wasn't the window in front) made the text hard to read. It is solid now, in light and dark.
- **task: and has:task found nothing on the Mac**: the search (and the @ picker's values) sent the bridge no tasks.
  They now send your tasks and their statuses, as the Omarchy launcher does.
- **A removed task status left its tag on papers** (`t/<status>`), which brought the status back after a restart. Its
  tasks' tags now move with them.
- **After Alt+→ / Shift+Alt+→, the paper's tags were the ones from before** (the tag editor showed the old status
  on); Zotero's answer is kept.
- **Tag renames and deletes Zotero missed are sent when it's back**: renaming or removing a paper or task status while
  Zotero was closed left the old tags on papers (and brought the status back). They're kept on this Mac, after a
  restart too, and sent once Zotero answers; meanwhile the old tag isn't read back as a status.
- **Task tag changes made while Zotero was away reach it** when it's back, and every paper's task tags are set again
  then (not only once per launch), so tasks changed on another computer follow too.
- **Taxonomy records from two computers are merged, paper by paper** (a sync conflict on `taxonomy.json` kept only the
  newer file, losing the other computer's tagging and the labels you confirmed or dismissed there). Each record now
  says when it last changed (both launchers).
- **A paper with two statuses keeps one**: changing it took off only the first.
- **The paper in view follows a tag renamed or deleted everywhere** (its status and pills showed the old tag).

### The Mac app (`macos-v0.3.4`)

- **A paper's pills wrap**: its taxonomy labels (under the path) and the footer's pills ran on one line, the rest cut
  off at the panel's edge. They now take as many lines as they need; each taxonomy's name stays beside its first label.
- **More compact lists**: rows in a smaller font (12 pt, from 13) with less room above and below, so more fit; a
  match's bold no longer keeps the old size.

### The Mac app (`macos-v0.3.3`)

- **Hotkey and Login… opened its window out of sight**, behind the app in front (SwiftUI's SettingsLink doesn't bring
  a menu bar app forward), so the hotkey seemed impossible to change. It now comes to the front. (⌃⌥Z, the default,
  is also the Claude app's voice shortcut: if you use both, pick another one there.)
- **A chat's window fits the screen** (it opened at 1100 by 900: giant on a laptop), and keeps the size you give it.
  **esc goes back** to the launcher, on the paper's menu, when nothing is typed or running; the button says *Back*.
- **The launcher can be moved**: drag it by its header, its footer or any empty part.
- **Catching up redid what was already there**: papers tagged, or given a prompt's note, on another computer (their
  tags and notes sync, this machine's records don't) were done again. Zotero is now asked first: a paper with the
  prompt's note, or with taxonomy tags, is left alone (on one library: 90 jobs instead of 205).
- **Catch up: only where missing, or replace** (*Settings › Defaults › Bring papers up to date*), for prompts and for
  taxonomies apart: replacing runs a prompt again and sends its earlier note to Zotero's trash once the new one is
  saved, or tags every paper again (both launchers).
- **Catching up runs up to Processes at once** too, never two jobs on one paper at a time (it ran one at a time).
- **Processes: Stop all** (it asks first: what waits is dropped, what runs stops) and **pills** that show one state at
  a time (All, Running, Pending, Finished, Failed, each with its count).
- **The highlighted row stayed out of sight** when moving down into a section near the bottom of the list (its
  heading and the row now scroll as one, checked again once laid out).
- **Updates keep your configuration**: they replace only the app and the runner's own folder, never your settings,
  prompts, taxonomies, searches, keys or hotkey (now checked by a test of the installers).
- **A pin keeps the launcher open** (the pin at the header's right): it stays over other apps while you use them, and
  esc doesn't close it (⌘W, the hotkey or the pin do).

### The Mac app (`macos-v0.3.2`)

- **Updates are checked against the release's SHA-256s** (GitHub's asset digests): the installer and the app it
  downloads, before anything is replaced.
- **Processes at once stays on each Mac** with a sync folder (what one machine can run isn't another's); the rest of
  Defaults travels as before (`contracts/Paths.js`, both launchers).
- **A Settings link lands on its row**: *The classifier* on the Jev key, *Tag new papers…* on *Tag a paper when you
  open it* (both launchers).
- **Omarchy too: a setting found from the search does what its row does** (a switch flips), on the same list of rows
  as the Mac (`Views.SETTING_ACTS_FROM_SEARCH`).

### The Mac app (`macos-v0.3.1`)

#### Fixed

- **A menu showed the results' rows.** Opening a paper's menu, the keys view or any other list after the results
  kept drawing the results under the new headings, and ↑↓ seemed to do nothing. Each list is now drawn anew.
- **Back out of a collection or a tag** lands on its row again, not on the first one.
- **Enter on an empty task list** starts a new task, as its hint says (Omarchy too).
- **Extracting a PDF on an external drive failed** with "Operation not permitted": the app now says why it reads your
  files, so macOS asks once, and the runner's error says where to allow it (System Settings › Privacy & Security ›
  Files and Folders).
- **A Jev key Jev refuses** stopped tagging with only "HTTP 401"; it now says to replace the key, or remove it to
  tag with your prompts model.
- **Typing a two-digit year one key at a time** (`holling 7`, then `holling 73`) found nothing (the Zotero plugin).
- **Saved searches in the results took the cursor** from your papers and split Go to in two; they come after it now,
  and the cursor starts on the first paper. **⇧↵ on a saved search** opens its menu (it asked Zotero to open it).
- **Tagging, prompts and extraction with several processes at once** could tag a paper twice, run two prompts that
  both extracted its text first, or lose a tagged paper's record; each paper is now taken by one at a time.
- **Updates**: a failed download or a folder it can't write no longer quits the app without installing; the app is
  replaced where it is (not always /Applications), the old copy is put back if the new one can't go in, and a failure
  says why (the log is in ~/Library/Logs). A failed check is tried again within the hour.
- **A setting found from the search does what it says**: Enter on *Keys on the results* turns it off there and
  then, on its page, instead of only opening the page; rows that run, install, clear or remove something are only shown (`↵ show it`).
- **Home and End** go to the first and the last row of a list.
- **The ‹ beside the search box goes back** when clicked, as esc does; inside a collection or a tag too (it showed
  the search's glass there).

#### Changed

- **Delete is ⌘⌫ on the Mac** in lists (tasks, notes, chats, Review's suggestions), as in Finder and Mail; ⌦ still
  works. `g sort` in the hints (both launchers); the provider's switch says *Use OpenAI*; Go to's *Defaults*.

- **Search, by author and year as people type them** (the Zotero plugin): a bare two-digit number is also the
  year's last two digits (`holling 73`), and a first author's whole surname outranks a title word that only starts
  with it (`smith` finds Smith, J. before *Smithian economics*). Words and four-digit years worked already.
- **Settings, reorganized:** the classifier (Jev's key, its test) is in *Models & providers*; *Tag a paper when
  you open it* sits with *Extract a paper's text when you open it* under *Defaults › When you open a paper* (tagging
  new papers was there already); *Taxonomies* points to both. In both launchers.

#### Added

- **On/off settings show a switch** on their right (VoiceOver reads "on" or "off").
- **Processes at once** (*Settings › Defaults › Processes at once*, 1 to 4, 1 by default): extraction, tagging and prompts
  on new papers each run up to that many together, never the same paper twice; the catch-up stays one at a time, and
  a prompt you run yourself never waits.
- **The sort, named and both ways**: oldest added, oldest changed and oldest published join the newest ones in what
  `g` / `⇧G` cycle (both launchers); on the Mac the sort shows at the badges' right (`↓ Newest published`,
  `Grouped by paper status`, `By relevance`), a click is the next one.
- **Updates from the menu bar**: once a day the app looks at GitHub's releases for a newer `macos-v*`; *Check for
  Updates…* asks now, and *Update to …* installs it with its `install.sh` (no Apple Developer Program needed).
- **Empty states with a symbol**: an SF Symbol above what the list says (no matches, Zotero down, loading…).
- **The library's size at the top level**: `3 open · 2,648 items`, from the bridge's ping, as on Omarchy.
- **Saved searches in the results**: typing a word of a saved search's name or query lists it under *Saved
  searches*; Enter opens it (both launchers).
- **The bottom bar counts processes**: `2 running · 3 pending`, and `1 failed` until you open Processes; a click
  opens them.

- **The submenu arrow (›) everywhere Enter opens another list**, the search results too (a paper, a collection, a
  tag, a place); never on a row that acts at once, asks first or opens outside the launcher. Chats, artifacts and
  *Edit your own instructions* say where they open instead (`window`, `browser`, `editor`), in both launchers; a
  finished process keeps the arrow only when Enter reads its note or edits its prompt.
- Go to's *Searches* is now *Saved searches*, and Processes rows name their paper after a `·`.
- **A breadcrumb** above the search box: `Results › Holling, 1973 › Tags`; click a level to go back there.
- **Smooth moves between lists**: the next one slides in (from the left going back), none with Reduce Motion.
- **Rankings take less room in the results**: on the second line, abbreviated as on Omarchy (ABS 4* → A 4*, ABDC A →
  D A, FT50 → F, UTD24 → U), each with its full name on hover; the title keeps the whole first line.

### The Mac app (`macos-v0.3.0`)

- **Everything the Omarchy launcher does**, as a native menu-bar app (`macos/`): all 166 row ids of
  [its plan](macos/PLAN.md), phases 1 to 10. It runs the same view logic (`lib/`, in JavaScriptCore) and its own copy
  of the prompt runner, and talks to the same Zotero plugin.
- **The keys view** (`?`, or F1 anywhere): the keys for where you are first, then every key, in the Mac's notation;
  a note's or a chat's window shows its own with `?` or F1 (F1 in a chat's box).
- **Open at login** and a **menu bar menu**: the launcher, Chats, Processes, Settings, Sync Zotero, Open at
  Login, the hotkey.
- **Accessibility:** VoiceOver reads each row as one element (label, detail, keys, state) and pills by their kind;
  nothing animates with Reduce Motion on.
- **Releases:** a `macos-v*` tag builds and publishes the app with an `install.sh` for that version, beside the
  nightly build. Signed ad hoc, not notarized.

## [0.2.6] - 2026-10-29

### Added

- **The bridge sorts a list before it cuts it.** A search with nothing typed can ask for a sort (`sort: { by:
  "added" | "modified" | "year" | "title" | "author", order }`): the top level then lists the library's first papers
  in it (up to the results limit, not only the recent few), and a collection's or a tag's papers are picked in it, so
  "year, oldest first" in a big collection shows its oldest papers, not the newest 60 re-sorted. A paper without the
  value comes last either way.

## [0.2.5] - 2026-10-29

### Fixed

- **Nothing runs on a paper in a library you can only read** (a group you're a reader of, a feed). A prompt that
  writes a note, tagging, automatic extraction and a catch-up skip it before any model is asked; they used to run
  the model and then fail at the save (45 Opus runs on one read-only group in a week). Chat and artifacts still work
  on those papers. The bridge's paper picks and pending extraction now list only the libraries you can write to.

## [0.2.4] - 2026-10-29

### Fixed

- **An author's surname comes first when you type it**, a co-author's too. Typing `kong` listed titles with "Hong
  Kong" and authors named Kongsberg above the papers Kong co-wrote: only the first author's whole surname counted,
  and a title holding the word got a bonus a surname didn't. A whole surname now ranks a paper above a title word or
  a surname that only starts with it; the first author's above a co-author's.

## [0.2.3] - 2026-10-29

### Fixed

- **Search finds authors typed as a citation writes them** (the bridge; the launcher, saved searches and review
  tables all search through it). `Ivanov et al.`, `Ivanov et al. (2020)`, `D. Ivanov`, `Ivanov, D.` and
  `Ivanov & Dolgui` found nothing: the dots, commas, `et al.` and `&` had to be in the paper too. They're left out
  now. A name quoted in the order it's said (`"Dmitry Ivanov"`, `a:"Dmitry Ivanov"`) finds *Ivanov, Dmitry*, and
  `a:ivanov$` matches a surname. A plain surname (`ivanov`) always matched.

### Changed

- **The Zotero plugin's file is `zotero-companion-bridge-<version>.xpi`** (it was `oma-zotero-launcher-<version>.xpi`).
  The add-on's id, name and update URL are unchanged, so installed bridges keep updating themselves. v0.2.2 carries
  both names (the same file).

## [0.2.2] - 2026-10-18

### Added

- **One repository, three projects, a new name:** `oma-zotero-launcher` is now
  `zotero-companion-launcher`, holding the Omarchy launcher (at the root, installed as before), the
  Zotero bridge (`zotero-bridge/`), the sync format both launchers share (`contracts/`: `Paths.js`
  and `SYNC-FORMAT.md`), and the Mac app (`macos/`, from zotero-launcher-macos with its history).
  GitHub redirects the old links (`omarchy plugin add` with the old URL still works); the next bridge
  release checks for updates at the new name.
- **Sync between machines**: *Settings › General › Sync folder* puts your pins, saved searches, to-dos,
  layout, prompts, taxonomies, rules, chats and artifacts in a folder you sync yourself (Syncthing, Dropbox).
  Setting it copies your files there, or, when the folder has data already, adopts it and backs yours up;
  clearing it brings the files back. Read-only, never a second copy, while the folder is missing. API keys and
  the addresses they are sent to stay on each machine. See [Sync between machines](README.md#sync-between-machines).
- **This machine's name** and **Automation runs on**, in *Settings › General › Sync*: only the machine the
  second names handles new papers (empty: every machine).
- **25 more theories** in the bundled Theories taxonomy: absorptive capacity, resource dependence, conservation of
  resources, paradox, sensemaking, bricolage, practice and process theory, actor-network and assemblage theory,
  sociomateriality, socio-technical systems, the multi-level perspective, path dependence, punctuated equilibrium,
  coevolution, complex adaptive systems, game theory, ecosystems, platforms, service-dominant and public service
  logic, critical theory, cliodynamics, integral theory. Papers tagged before are out of date with it: Settings ›
  Defaults › Tag again where a taxonomy changed.

- **Delete a note**, yours too: `Delete` on a note (a paper's menu, Notes, the reader) or *Delete this note* on a
  note's menu asks first, then sends it to Zotero's trash, where you can restore it. The bridge's new
  `/notes/delete` does it (`/notes/trash` still trashes only the notes the launcher wrote). Update the plugin for it.
- **Scans read by OCR**: with Tesseract installed, the pages of a PDF with no text layer are read by OCR when its
  text is extracted (pdftoppm draws each page, tesseract reads it, in English and your system's language when it's
  installed), and the note says which pages OCR read. A page OCR can't read keeps what pdftotext found; a paper's OCR
  stops after 10 minutes. *Settings › Setup* offers Tesseract (optional); *Read the N skipped scans by OCR* reads the
  scans left alone before, just those, a few at a time.
- **Search, by author and year as people type them**: a bare two-digit number is also the year's last two digits
  (`holling 73`), and a first author's whole surname outranks a title word that only starts with it (`smith` finds
  Smith, J. before *Smithian economics*). Words and four-digit years worked already.

### Changed

- **Turning off a bundled taxonomy you changed asks first** (your changes to it go), and **a taxonomy changed with
  AI keeps whether it's shown and its Suggested from** unless the proposal changes them (accepting one made a hidden
  taxonomy shown again and put Suggested from back to 30%).
- **Deleting a chat or an artifact asks first**, as deleting a note or a tag does: *Delete the chat “T”?* (its
  answers saved as notes stay in Zotero), *Delete the artifact “T”?* (all its versions).
- **Every path from one place**: the launcher and the prompt runner find every file through `lib/Paths.js`
  (an installed runner gets a copy). The launcher now follows `XDG_CONFIG_HOME` for its settings file, as the
  runner always did.
- The runner writes prompts, taxonomies, chats and artifacts atomically (a temporary file renamed over the old one).
- **What waits its turn shows**: the footer's processes say how many are pending (a catch-up's jobs, papers left to
  extract or tag), and Processes lists them under Pending, in the order they'll run.
- **No failed extraction for a PDF that isn't on this disk** (not synced here): a run skips extracting it first.
- **The Zotero plugin is the Zotero Omarchy Bridge**, in the launcher's menus and in Zotero's add-on list (with a
  link to the repository). `scripts/bridge-dev-link.sh` clears Zotero's cached copy of a linked bridge, so a new
  version or name shows after a restart.

### Fixed

- **Prompt version numbers**: a number is taken by the first note a text writes, not when the prompt list is
  read, so a new prompt's first note is v1 (its placeholder text no longer took v1, nor every saved edit a number).
  The numbers come from the notes themselves, which sync: another machine running a prompt continues from the
  numbers its notes carry. A second note of the same version on a paper says so ("Findings v2 (2): …").
- **Note titles Zotero takes as they are**: a paper's rich-text title (`<i>…</i>`, `<sub>`) gives its words, not
  its tags; control and invisible characters (line breaks, zero-width and bidi marks) are left out; and a title stays
  within Zotero's 120 characters, the paper's title shortened first, so the prompt's name and version always show.
  The citation and the paper's title are joined by " · ".
- **A scan's menu** no longer tries to extract it at every opening (with *Extract a paper's text when you open it*
  on), each time with a "Couldn't extract the text" notification: it's tried once, then left alone like the others.
- A scan behind a cover sheet (one page of text, the rest scanned) was extracted almost empty without a word; its
  scanned pages are now read by OCR (with Tesseract installed).
- **Typing a two-digit year one key at a time** (`holling 7`, then `holling 73`) found nothing.

## [0.2.1] - 2026-10-04

### Added

- **New papers, handled on their own.** Settings › Defaults › New papers gathers what runs on each paper added to
  Zotero, in the background: extracting its text, tagging it by your taxonomies, and the prompts you pick (Prompts to
  run on new papers, `defaults.autoPrompts`). A prompt runs once per paper, on the papers added from when it's turned
  on (after their text, when extraction is on). The prompt's editor shows the same toggle: Run on new papers.
- **Bring papers up to date** (Settings › Defaults): tag again the papers a taxonomy tagged in an older version; run
  prompts again where a paper's note or artifact comes from an older version of the prompt; catch up the papers added
  in the last days (`defaults.catchUpDays`, 30) with what New papers runs. Each says how many first; one job at a time,
  in Processes, resumed after a restart, Enter stops it.
- **Prompt versions.** A prompt's text (with what it makes) gets a version number when it changes; its notes say it in
  their title ("Findings and Takeaways v2: …") and their last line, with the version's hash, so an older one is told
  apart on any machine. Running it again adds a new note next to the old one. Notes from before are left as they are.

### Changed

- **Prompts on new papers and catch-ups run on the extracted text**: the run saves the paper's text as its note first
  when it has none, and a paper just added waits three minutes (Zotero may still be fetching its PDF).
- **Finished processes clear themselves a day later** (failed ones stay until you clear them).
- **Shift+Esc never closes the launcher**: from anywhere it goes back to the results; there, it clears the search and
  the list takes the keys. Esc still closes it from the results.

### Fixed

- **Moving a menu row (P, p, Shift+↑↓) kept the highlight on it**: a row sliding under a still mouse pointer took it.
- **A PDF added on its own stayed in the results after Zotero gave it a parent** (Retrieve Metadata moves it under a
  new item): the index now drops it, and the new parent shows with its PDF.

## [0.2.0] - 2026-10-04

### Changed

- **A paper's row, more compact**: its status over its task, its journal rankings on two lines; no pin icon (pinned
  papers are in Pinned). The task icon only for tasks beyond its default one (which has its own pill).
- **The footer, in two rows.** The keys for where you are on one line, whole hints only (as many as fit, going back
  always; `? keys` lists the rest), the keys brighter than what they do; under it what's going on: a confirmation
  or an error on the left, your open tasks, Zotero's last sync and the processes on the right (failures in red).

- **Pills, one standard everywhere.** Filled: the one chosen among choices (a status on the status line, a task's
  priority, the active search); tinted: something the item has (a result's status or task, a top journal grade, a
  taxonomy label); a faint outline: the other choices. Each kind has its colour from your theme (status in the
  accent, task, ranking, taxonomy, scope, priority), kept apart from the others and readable on the background.

- **A context bar above the search box**, below the top level: the paper and the submenu (with its rankings, which
  moved up from the status line), a note's paper, a task and its paper, a collection, tag or saved search (and its
  papers while you type), or the Settings path. The search box then holds only what you type, and its placeholder
  says what typing does there ("Type to filter", "Type to search in it"); the scope chip gave way to the bar.
- **The extracted text is behind its row, not among the notes.** It no longer crowds your notes (a paper's menu,
  `n`, the notes under a result, the other notes above the one you read; a result's note count leaves it out
  too). On *Text extracted ✓*, `Enter` reads it, and `Shift+Enter` (or `x`) offers *Read it*, *Extract it again*,
  *Open in Zotero* and *Delete it*. Prompts and chat use it as before, and it stays a note in Zotero.
- **Keys: one key acts, no Alt.** The search box has the keys when the launcher opens; `Esc` hands them to the
  list, where one key acts (after a short wait, 300 ms by default, so two quick keys are typing and go back to the
  search box); `/` or `Tab` returns to the search box. New keys: `c` chat, `.` processes, `;` settings, `#` tags,
  `x` extract text, `y` copy a note (was `c`). The old Alt keys stay available: *Settings › General › How keys
  act*. The header shows where the keys go (a caret) and what the search is limited to (a chip).
- **Settings**: every choice opens as a page (Enter picks, Esc goes back unchanged), in Settings and the prompt
  editor; *General* is grouped in sections.

### Security

- **Answers load nothing by themselves.** The chat window rendered a model's Markdown as is, so an image in an
  answer (which a paper could steer) loaded its URL on display, even with Ollama. Answers, streaming or saved, and
  the notes prompts write now have their images turned into links and raw HTML tags shown as text: a zero-width
  space between `!` and `[`, and after a `<` opening a tag, with no Markdown parsing that could disagree with the
  renderer (code spans, fences, escapes).
- **ChatGPT (subscription) reads only the paper.** Codex's "read-only" sandbox could still read every file you
  can, so a paper carrying instructions could have pulled other files (credentials) into the conversation. Its
  commands now run under a permission profile that reads only the system and Codex itself (no writes, no
  network), without the `--sandbox` flag that would override it; the tools that act outside the sandbox are off.
  Tested end to end against the bundled `codex`. A codex of your own (`OMA_CODEX_BIN`) gets its own files only (the
  binary, its code-mode helper, its packaged `codex-resources`), never the folders around it such as `~/bin`
  or `~/.local`; a wrapper script is refused.
- **Installers never write through a link.** `install-runner.sh` and `dev-sync.sh` replace a directory wholesale
  (`rsync --delete`); before that they check it (`scripts/safe-dest.sh`): no symbolic link at it or on the way to
  it, inside its base once resolved, yours, and empty or already ours (the runner, this plugin). Otherwise they
  stop and touch nothing. `~/.local/bin/oma-zotero-prompt` is only ever replaced if it is a link.

### Added

- **Settings from any menu's search**: typing in a menu lists the matching settings in a Settings section below its
  own rows; `Enter` opens the page on the setting.
- **Search by when a paper was added or changed**: `added:`, `modified:` and `recent:` (either), with `7d`, `2w`, `3m`, `1y`
  (the last days, weeks, months, years), `today`, `>2026-01-01`, `<2026`, `2026-01..2026-03` (a year or a month is all of
  it); in the @ picker, Added, Modified and Recent offer the usual spans, and After, Before and Between a date of your own.
- **A paper's menu, its footer**: whether its text is extracted and whether it's tagged by taxonomies (how many labels,
  being tagged), as pills in the status row; a warning when its taxonomies need an update (never tagged, out of date).
- **Change a paper's taxonomy labels by hand from the audit**: a check on the labels it has; `Enter` cycles one through
  auto → on, by you → off, by you → auto (`classify-decide --auto`); yours are kept on later passes. A refreshed list
  keeps its place. Dismissing a label now also takes its tag off the paper.
- **Move a paper's menu row out of the way**: `P` (`Shift+p`) puts the highlighted row in *Other*, at the bottom of every
  paper's menu; `P` again puts it back.
- **A paper's taxonomies** (its menu › Taxonomies): every taxonomy in a section, its labels on the paper. A taxonomy
  can be hidden on papers (its page › On papers); the pills under the status line wrap onto as many lines as needed.
- **Audit the taxonomies** (a paper's menu): every label's probability and what became of it; `Enter` tags one,
  `Delete` dismisses it. Every label's probability is kept with the result. `oma-zotero-prompt classify-show`.
- **Edit taxonomies in the launcher.** *Settings › Taxonomies* opens a page for each, a form like a task's (its fields
  typed in place): name, tag prefix, unique (one label per paper) or several, question, thresholds; its labels (add,
  rename, define, move, delete), with an offer to rename or delete their tags on papers; turn a bundled one off (and
  back on), delete yours, back to the bundled one. `oma-zotero-prompt taxonomy-show`, `taxonomy-save` (checked:
  valid, its prefix not another's; `--new`), `taxonomy-remove`.
- **Taxonomies with AI.** *New taxonomy with AI…* and *Change it with AI…*: your prompts model proposes it, each
  change marked; discuss it (it revises its proposal), then accept it or discard it. `oma-zotero-prompt taxonomy-draft`.
- **Unique taxonomies keep one label per paper**: a label put on by hand wins over the classifier's (which goes to
  Review), an accepted suggestion replaces the paper's label, and the tag editor replaces the other one.
- **Scripted keys and typing go into a form's field** (`omarchy-shell oma-zotero-launcher type` / `key`), for tests.
- **Taxonomy filters in the @ picker**: each taxonomy, its labels with how many papers have each.
- **Every setting from the search**: typing part of a setting's name lists it under *Go to*; `Enter` opens its page
  on it.
- **Extract and tag a paper when you open it.** *Settings › Defaults › Extract a paper's text when you open it* and
  *Settings › Taxonomies › Tag a paper when you open it*: opening a paper's menu extracts its text when it has a PDF
  and none, and tags it by the taxonomies it isn't up to date with (never tagged, or tagged by an earlier version
  of one: each result keeps the taxonomy's fingerprint), after its text. `oma-zotero-prompt classify-status`.
- **A paper's taxonomy labels as pills**, under its status line in its menu and submenus (a click: the papers with
  that label), with a word when they're being tagged, out of date or missing.
- **Pin a menu's rows, and order them.** In a paper's menu, `p` pins the highlighted row into a *Pinned* section
  on top of every paper's menu; `Shift+↑`/`↓` moves any row within its section (kept for every paper's menu).
- **The keys for where you are.** `?` (and `F1`, from anywhere, while you type too) opens Keybindings with a
  *Here* section first: the keys of the view you're in; the footer always starts with `? keys`. The note window
  (`?`, `F1`, a *Keys* button) and the chat window (`F1`) show theirs in a panel. The keybindings list is complete
  (the note reader's, the tag editor's, Settings', the chat window's keys were missing).
- **Whether each API key works.** A key is tested when you set it, and once when Settings opens if it hasn't been
  (or not since it changed); the provider's line, its key row and *Settings › Taxonomies › Test the Jev key* say
  *✓ Works · tested 10 min ago*, *✗ Failed: …* or *Not tested yet*. The last test is kept
  (`~/.local/state/oma-zotero/key-tests.json`, with the masked key only). `oma-zotero-prompt provider-test jev`.
- **Tag papers by taxonomies.** Paper type, ontology, epistemology, method and theories come bundled, as tags
  (`type/…`, `ont/…`, `epi/…`, `method/…`, `theory/…`); add your own or edit them (JSON files, a definition per
  label) in *Settings › Taxonomies*. One paper (its menu), a collection, a tag or a saved search (*Go to*, asking
  first), or each new paper as it arrives. Classified by Jev (TypeSafe's System One model, key in the keyring),
  else your prompts model, from the title, the abstract and the extracted text. Labels under the threshold
  are suggested, in a review list (accept or dismiss); a later pass replaces only the tags an earlier one added.
  `g` groups the results by any taxonomy. The Literature Review prompt's *Type of paper* uses the same labels.
- **Automatic text extraction**: *Settings › Defaults › Extract new papers' text* extracts a paper's text when its PDF
  arrives in Zotero, in the background (launcher open or not); *Extract every paper's text* (or Go to › *Extract…*,
  for a collection, a tag or a saved search too) catches up on the rest, a few at a time, resumable, with how many
  are left. PDFs over *Skip PDFs larger than* (40 MB) and scans are skipped after one try (*Try the skipped again*).
  New: the bridge's `/extract/pending` (and each paper's newest PDF date in its index), the runner's
  `extract-batch`, `extract.json` for the queue's state.
- **Group and sort the results' papers** (`g`, `G` back): by paper status, task status, task group, newest added,
  changed or published, or relevance; a heading per group, the papers' relevance kept within each. Collections,
  tags, Go to and pinned papers stay put. The header names it, and it's remembered (`view.json`). The bridge's
  results carry their dates added and changed.
- **A tag into a status**: the tag editor's `Shift+Enter` on a tag offers *Make it a paper status…* and *Make it a task
  status…*: a new status named after it, or merged into one of yours. The tag is renamed on every paper (`s/…`,
  `t/…`), after asking with the count; a task status gives each of its papers its default task in it (the bridge's
  `/tags/items` lists them).
- **Status tags out of the tag editor**: `s/…` and `t/…` tags aren't listed or counted there; two *Statuses* rows
  say the paper's status and its tasks' statuses and open their Settings page.
- **Statuses from the note view and the note window**: `Alt+→` / `Alt+←` change the paper's status and
  `Shift+Alt+→` / `Shift+Alt+←` its default task while you read one of its notes; the header's pills move at once
  and Zotero gets the tags a second later. The note window shows both pills under the paper. A note on no paper
  (or on another paper than the one whose details are loaded) shows none.
- **A paper's default task**: a task status applied to the paper itself ("this paper: Reading"). `Shift+Alt+→` /
  `Shift+Alt+←` on a paper (the results, its menu) moves it along the task statuses: the first press makes it
  ("Read {cite}", *Settings › Tasks › A paper's default task*), past either end it's done, not deleted; saved a
  second after the last press, its `t/` tag following. Its status is an outlined pill on the paper's row and in its
  menu's top line; *This paper* has a *Task* row. It's a task like the others, one per paper (marked `isDefault`).
- **Sync Zotero** from the launcher: under Go to (type *sync*) or `S`, Zotero's own sync starts without switching to
  Zotero (the bridge's `/sync/start` and `/sync/status`). It shows in Processes with what Zotero is doing, then
  *Synced* or Zotero's error, and the results are searched again; the footer says when Zotero last synced. Until
  Zotero sync is set up, it says so instead of starting.
- **Copy a citation or a bibliography entry**: in a paper's menu, *Copy citation* ("(Adner & Helfat, 2003)") and
  *Copy bibliography entry* show what they copy; `i` and `r` copy them from the results, the paper's menu and the
  note reader. Zotero formats them in your style, *Settings › General › Citation style* (the styles installed in
  Zotero; APA 7th edition by default, `citationStyle` in the file). The bridge lists the styles (`/styles`).
- **Artifacts**: a prompt can make a diagram (Mermaid), a mind map (markmap), an image (SVG), an HTML page or a
  Markdown file instead of a note (*Makes* in the prompt editor; `output:` in the file). A chat makes and changes
  them when asked, with `<artifact>` blocks any model can write; answers link to them and the chat's sidebar lists
  them. The paper's menu lists them: open, change it with AI (a new version), edit it yourself, undo, rename,
  delete. Every version is kept, in *Settings › General › Artifacts folder*, a folder per paper. What the model
  writes is checked (asked once more with what was wrong), stripped of scripts and outside links, and shown under a
  policy that blocks scripts and the network; the drawing libraries are fetched once, pinned by SHA-256.
- **Saved searches.** `s` (or `Ctrl+S` while typing) saves what the results show, the typed search within the
  collection, tag or saved search it's in, under a name. `f` lists them (also *Searches* under Go to): `Enter`
  opens one (type to search within it), `Shift+Enter` opens, pins, renames, edits or deletes it, `p` pins it,
  `Shift+↑`/`↓` reorders. **Pinned searches are badges above the results**: `Alt+→` / `Alt+←` move along them
  (*All* first), and the results search within the selected one. Kept in
  `~/.config/omarchy/oma-zotero-launcher/searches.json`.
- **`@` in a new task's line**: a menu of actions, the paper's citation, statuses, quick due dates and priorities,
  each put in as a block; a kind already in the line isn't offered again. The actions are yours to edit in
  *Settings › Tasks* (add, rename, remove, reorder).
- **The list has the keys** in menus, going back and on opening, unless something is typed in the search box;
  pages for typing (names, a task's line, dates, the `@` pickers, the tag editor) start in the search box. A
  setting, *General › Where the keys start*, brings back the search box first.
- **Statuses in Zotero, with a prefix**: paper statuses are `s/…` tags and task statuses `t/…` tags on the task's
  paper, kept in step as tasks change. Renaming or removing a paper status offers to rename or delete its tag on
  every paper (with the count); task statuses' tags follow theirs. *Settings › Paper status* moves older,
  unprefixed status tags to `s/`. The tag editor renames or deletes a tag everywhere (`Shift+Enter`). And back: `s/…` and
  `t/…` tags made in Zotero become statuses, and renames made in Zotero rename them (the bridge logs Zotero's
  tag changes); renaming a status renames its tag, removing one deletes it (asked first).
- **Reading a note**: select text with the mouse and it's copied (a short "Copied N words" in the footer).
- **A paper's tasks show their status as a pill** in its menu.
- **Pinned in saved searches**: in a saved search, what you pinned and it matches comes first, under *Pinned*;
  elsewhere in the results a pin marks it.
- **A task icon on papers in the results** when they have open tasks; red when one is overdue.
- **One look for every list**: the same icon size, row height (a little more compact) and fonts in the results,
  menus, tasks, processes and settings; every icon outlined (books, reports, notes, folders, tags, settings… were
  solid and looked black next to the others).
- **Reading a note**: the paper's other notes are listed above it, and `Shift+↑` / `Shift+↓` moves to the
  previous / next one; `t` starts a task about the note (and its own paper, wherever you opened it from).
- **A paper's notes under it**: `Space` on a paper in the results shows its notes as indented rows below it
  (`Enter` or `→` reads one; `Space` or `←` hides them).
- **Keybindings** (`?`, or *Keybindings* under Go to): every key, by section, with search.
- **`Alt+Backspace`** clears the search box.
- **The launcher as a window**: `W` moves it into a regular window (it stays when you click elsewhere); `W` again
  puts it back as the overlay. `closeIfOpen` (IPC) lets Super+W close the launcher when it's open.
- **A task's page is a form**: the description and notes are edited in place (notes: `Enter` is a new line),
  status and priority are pills that `Tab` / `Shift+Tab` change on their row, and the due date opens a calendar.
  `Enter` adds a task and opens its page; `Shift+Enter` just adds it.
- **Keys swapped**: `Tab` / `Shift+Tab` move along the pinned searches' badges; `Alt+→` / `Alt+←` change a
  paper's status (Tab still changes a task's).
- **Search titles and abstracts**: `ta:"…"` (title or abstract) and `ab:"…"` (abstract only); in the `@` picker,
  *Title* and *Title and abstract* put the prefix and its quotes in, the cursor inside. Dead keys (US intl.:
  `"` `'` `^` `~` `` ` ``) now type in the search box.
- **Search by status, tasks, chats and more**: `status:reading` / `status:none` (a paper status), `task:waiting`
  (a task's status or group), `has:task`, `has:chat`, `has:collection` and their `!has:` opposites, and years
  compared: `y:>=2020`, `y:<2010`. The `@` picker has *Paper status*, *Tasks* and each *Has* both ways, counted.
- **`@` in the search box**: a picker for tags, authors, publications, years, collections, item types, *has a
  PDF / notes / files*, your saved searches, the operators and the syntax; `Enter` puts its term in the search at
  the caret.
- **The search box**: operators and finished terms show as blocks labelled by what they are (*A: Smith, John*,
  *P: …*, *# risk*, *OR*), deleted and stepped over whole; the rest is text in the theme's colours. It has a caret
  (`←` `→` `Home` `End`), and `(` and `"` close themselves around it.
- **Boolean search**: `AND`, `OR`, `NOT` (uppercase) and `( )`, e.g. `(#risk OR #resilience) NOT y:..2010`;
  quoted names (`#"supply chain"`, `a:"Smith, John"`) match the whole name; new filters `c:collection` (with its
  subcollections), `type:book`, `has:pdf` / `has:notes` / `has:files`, and `p:`, `journal:`, `tag:` aliases.
  The bridge's `/search` takes `within` (a saved search), and the new `/facets` matches the picker's values as
  you type (in the bridge, a few milliseconds even over 10,000 authors) and sends the best 100.
- **Development**: `scripts/dev-sync.sh --as NAME` installs a checkout as a second plugin,
  `io.github.mbradaschia.oma-zotero-NAME`, answering IPC as `oma-zotero-launcher-NAME`, next to the installed one.
- **Write a prompt with AI**: in *New prompt…*, type what the prompt should do and pick *Write it with AI*; your
  default prompts model drafts its title and text from a meta prompt (modeled on the bundled prompts, following
  your rules) and it opens in the editor to review. From a terminal: `oma-zotero-prompt new-ai --describe "…"`.
- **Rules for prompts and chat** (*Settings*): the rules the model follows are no longer hard-coded but a
  checklist to turn on and off: grounded in the paper, academic rigor, APA 7 in-text citations with pages, an APA 7
  reference list, and the format; all on by default. Plus your own instructions, added after them
  (`instructions.md`, edited from the same page). From a terminal: `oma-zotero-prompt system [--chat]` prints the
  system prompt as sent; `system edit|clear` your instructions.
- **Prompts in the chat window**: *Prompts ▾* next to the model puts one of your prompts in the question box.
- **Paper status**: your status tags (to read, reading, read to start with; *Settings › Paper status*) as a badge
  on each result and a *Status* row in a paper's menu. `Tab` / `Shift+Tab` on a paper cycles it; Zotero gets the
  new tag and loses the old one a second after the last press. The bridge's search takes `statusTags` and says
  each result's status.
- **Tasks**: a to-do list about your papers. `t` lists them by status (Backlog, Next, Active, Waiting, Completed:
  your statuses, in *Settings › Tasks*: add, rename, remove, reorder); `a` adds one about the highlighted paper
  and note or chat; each has a description, status, priority, due date, notes, and its paper, note or chat.
  `Tab` / `Shift+Tab` cycles the status, `Shift+↑`/`Shift+↓` reorders (into the next status past the ends); a
  paper's menu lists its tasks; the footer shows a badge per group.
  Adding is one line (`#status !priority @due`, previewed; `Enter` adds and stays, `Shift+Enter` opens it), or
  typed straight into Tasks; `d` done, `!` priority, `Delete` (`u` undoes) act on a task without opening it.
- **Go to**: what you type also finds Chats, Processes, Settings and its pages, and New chat…, on top of the results;
  the cursor still starts on the first paper that matches.
- **Processes in the footer**: running, finished and failed, always in view. *Tasks* is now called *Processes*,
  `.` opens it, and it's grouped under Running, Finished and Failed.
- The results before you type are only your papers: the Processes, Chats and Settings rows are gone (keys `.`, `c`,
  `;`, and *Go to* when you type their names).
- The note window's *Chat* (`c`).
- **Setup in Settings**: a checklist (Zotero, the Zotero plugin, the keybinding, Node.js, the AI features, a model,
  pdftotext, the keyring) with each step's state, and `Enter` to do it: start Zotero, download the latest Zotero
  plugin (checked) with the steps to install it, add the keybinding, run an install command in a terminal. When
  Zotero or its plugin isn't working, the results show those steps.
- **Zotero command** (*General › Advanced*): how to start Zotero, `zotero` by default.
- **Reorder pins**: `Shift+↑` / `Shift+↓` on a pinned item.
- **Chats by paper**: the Chats list groups chats under their paper, the paper with the newest chat first.
- **A paper's chats in its menu**: `Enter` continues one; `Shift+Enter` renames or deletes it (`chat-delete` in the
  runner).
- **Extract the text first** (*Settings › Defaults*): a chat or prompt on a paper without extracted text extracts it
  first. The extraction row shows it running and updates when it's done (it used to keep its old state).
- **Reorder**: `Shift+↑`/`Shift+↓` moves a note in a paper's menu; `Ctrl+Shift+↑`/`Ctrl+Shift+↓` moves a whole section
  in any menu or the results. Both are kept (`~/.config/omarchy/oma-zotero-launcher/view.json`).
- Every menu starts with the search box (reopening keeps where the keys were); the setup steps show a
  checkmark when done, starting with *Install Zotero*.
- A blinking block cursor in the search box while it has the keys; `/ search` first in the footer when the list
  has them.

### Fixed

- **Inside a saved search, only what you type is highlighted**: its own terms aren't (every paper in it has them). The
  Zotero plugin's search takes the query to highlight apart from the one searched.
- **Several-label taxonomies (Method, Theories) tagged nothing**: Jev's yes/no answers (`{ noul: p }`) were read as 0.
  Results from before count as out of date, so papers are tagged again.
- *Edit* on a bundled taxonomy and *New taxonomy…* failed: the runner wrote the file with a function it didn't import.

- **Room between a row's two lines.** Each line is as tall as its font's own line (its metrics, so a font with
  tall ones no longer overflows), with a fixed gap between them; pills on the second line (a task's status and
  priority) are sized to it and no longer run into the line above. The row height stays 38 px with the theme's
  fonts, and only grows when a font needs it.

## [0.1.0] - 2026-09-30

First release.

### Added

- **Search.** Fuzzy search over your Zotero library from anywhere in Omarchy (SUPER+SHIFT+Z):
  titles, authors, years, tags, with fzf-style terms (`a:`, `t:`, `y:2019..2021`, `#tag`, `!`, `|`).
  Before you type: your pinned papers and collections, the papers open in Zotero, then the most recent
  ones (each by the newer of its added and modified dates).
- **Collections.** Matching collections listed by their full path as you type; open one to list and
  search its papers (subcollections included), pin it, or select it in Zotero.
- **Tags in the search.** Up to three tags matching what you type, under *Tags*; `Enter` lists a tag's
  papers (search among them), `Alt+P` pins it.
- **Picks up where you left off.** Reopening the launcher returns to the same view, submenu, query, row and
  collection, tag or paper; `Esc` still goes back a level.
- **Note text size.** `Ctrl+-` / `Ctrl++` (and `Ctrl+0`) in the note reader and the note windows; the
  size is kept for the next notes. A small gap between paragraphs, and none between bullets.
- **Compact rows.** Smaller type in the results and the paper's menu, and a taller window: more fits.
- **Item menu** (`Enter`; `Shift+Enter` opens the item in Zotero), in sections: its notes; prompts, chat
  and text extraction; the paper (pin, open in Zotero, the PDF externally or in its own Zotero window,
  tags, show in library).
- **Notes.** Listed under the item; read them in the launcher or in their own resizable window with the
  paper cited APA 7 style ("Sirmon et al. (2007)"), its journal and rankings; open them in Zotero, copy
  them as Markdown, or save them as `.md` files. Plain keys while reading (`z`, `w`, `c`, `s`, `j`/`k`).
- **Prompts.** Run a prompt on a paper and get the answer saved as a child note. Two prompts
  included: *Literature Review* and *Findings and Takeaways*, with verbatim quotes, APA 7 citations with
  pages and an APA 7 reference list. Add and edit prompts in the launcher, with a model (grouped by
  provider, or the default) and an effort; prompt files name models as `provider:model`.
- **Chat with a paper.** A chat window grounded in the paper's text (its extracted-text note, else the
  PDF), with past chats per paper, streamed answers that quote with pages, and Copy / Save to Zotero /
  Download for each answer and for the whole chat. A chat can switch models and providers between questions.
- **Model providers, for anyone.** Prompts and chat run on the Claude or ChatGPT subscription you already
  have (Claude Agent SDK, Codex SDK), an API key (OpenAI, Anthropic, Google Gemini, OpenRouter, through the
  Vercel AI SDK), a private model on your computer (Ollama, with the context each request needs), or an
  OpenAI-compatible endpoint (LM Studio, vLLM, llama.cpp, institutional gateways). A settings file from
  before providers keeps using Claude.
- **Settings in the launcher.** A *Settings* row at the top of the results, in sections: *Models &
  providers* (what's already on your computer under *Ready to use*, one `Enter` to turn it on; a page per
  provider with Test connection, its key, base URL and context size, what leaves your computer and what a
  run costs), *Defaults* (model and effort for prompts and for chat, a fallback model), *General* (every
  launcher setting, from a schema) and *Requirements* (Node.js, the AI features, pdftotext, the keyring).
  Every change is validated and saved at once, in a sectioned settings file.
- **Onboarding.** Without a model, the paper's menu shows *Set up an AI model*; *Install AI features*
  installs the prompt runner from the launcher, with its progress in Tasks.
- **Keys in the keyring.** API keys go from the clipboard straight to the system keyring (secret-tool),
  and the clipboard is cleared; never to a file. Keys in the environment work too.
- **Quote check.** Every quotation in an answer or a note is looked up in what the model was given;
  the ones not found word for word are flagged under the answer and listed at the end of the note.
- **Costs and tokens.** Tasks show each run's model, tokens and cost (subscriptions: in your plan); chat
  answers show their model and cost.
- **Fitting the model.** The paper, highlights and notes are fitted to each model's context (notes left
  out first, then the text cut from the end, and the output says so).
- **Chat context.** A meter of the model's context window in use; long chats summarize their earlier
  exchanges (quotes and pages kept, the paper never summarized) before the window fills, and retry after
  a prompt-too-long error.
- **Tasks and chats.** A task queue (prompt runs, extractions: running, finished, failed) in the footer
  and at the top of the results (`Alt+Q` from anywhere); a finished task opens its note. A Chats list
  reopens any chat; *New chat…* picks the paper, in the launcher or in the chat window. The chat window
  shows whether the text is extracted (and extracts it), grounds new chats in the `.md` note or the PDF,
  and renames chats.
- **Extract the text.** The PDF's text as a note, page by page with the journal's printed page numbers
  (pdftotext); chats and prompts ground on it.
- **Tags.** Add, remove and create tags, with colors and counts; undoable in Zotero.
- **Journal rankings.** ABS (Chartered ABS *Academic Journal Guide* 2024), ABDC (*Journal Quality List*
  2025), FT50 and UTD24 labels on results and in the note window, matched by ISSN or journal name.
- **One set of keys everywhere:** `Enter` the main action, `Shift+Enter` open in Zotero, `Alt+letter` in
  lists = the bare letter while reading (`W` window, `C` copy, `S` save, `P` pin, …), `Alt+1…9` picks the
  numbered row, `Esc` back.
- **Zotero bridge** (`.xpi`, Zotero 10): token-protected local routes for search, items, notes (read,
  create), full text, annotations, citations (CSL, APA 7), tags and tabs. Updates itself from the
  GitHub releases.

[Unreleased]: https://github.com/mbradaschia/zotero-companion-launcher/compare/v0.2.6...HEAD
[0.2.6]: https://github.com/mbradaschia/zotero-companion-launcher/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/mbradaschia/zotero-companion-launcher/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/mbradaschia/zotero-companion-launcher/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/mbradaschia/zotero-companion-launcher/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/mbradaschia/zotero-companion-launcher/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/mbradaschia/oma-zotero-launcher/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/mbradaschia/oma-zotero-launcher/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/mbradaschia/oma-zotero-launcher/releases/tag/v0.1.0
