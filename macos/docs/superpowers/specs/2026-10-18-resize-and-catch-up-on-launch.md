# A resizable launcher; catching up checks first, and when the app opens

Four asks (2026-10-18), all in the Mac app:

1. Let the window be resizable.
2. When a catch-up runs, it first checks which papers need it.
3. When the app opens, it runs the catch-up's dry run and asks whether to run it (a setting in Defaults, on by
   default).
4. That catch-up lets you choose what it does: the text, the taxonomies, the prompts and which ones.

## 1. The launcher resizes

- The panel and the window (W) both resize from their edges, never below 560 by 360 (the hints, the box and a
  few rows still fit). The size you last gave either is kept (`ZLLauncherSize` in the app's defaults, as the chat
  window keeps `ZLChatWindowSize`) and the panel opens at it, centred as before. The first time: 720 by 480.
- The view fills the frame (no fixed size): the rows, the reader and the calendar take the room; the footer's hints
  already fit the width they get (`FitHints`).
- The hosting view reports only its minimum to the window (`sizingOptions = [.minSize]`): SwiftUI's ideal size
  never snaps the window back.

## 2. A catch-up checks first

Enter on a *Bring papers up to date* row (Tag again, Run prompts again, Catch up the last N days) no longer starts
from the counts on the page, which may be minutes or days old. It asks the runner again (`catchup-plan`, only that
part's flags), then saves and starts exactly the jobs that answer lists:

- `Checking which papers need it…` while it asks; Enter again meanwhile: `Still checking which papers need it`.
- Nothing left: `Nothing to do: every paper is up to date`. Else `Started: 5 jobs on 3 papers, in the background
  (in Processes)`. The page's count is the fresh one.
- The runner fails: `Couldn't check which papers need it: <why>`; nothing starts.
- One is running already: `One is running: stop it first` (as before).

The plan already leaves out what Zotero shows done (another computer's notes and tags) unless *Replace them* is
chosen; extractions skipped once (scans, large PDFs) stay out.

## 3. When the app opens

- The app reads its files when it starts (not only when the launcher first opens), so the background automation
  runs from the start, as `LauncherModel+Scheduler.swift` always said it did.
- Then, once per run of the app, on the machine automation runs on (automationHost), with the AI features
  installed, nothing catching up already and `defaults.launchCatchUp` on (the default), it runs the dry run of what
  4 selects. Zotero not answering yet: it waits for Zotero's first answer.
- Nothing to do: nothing is said. Else the launcher opens on a question (the confirm view):
  - `Bring 7 papers up to date?`
  - `Bring them up to date (in Processes)`, its detail what it found: `Added in the last 30 days: 3 need their
    text, 2 their taxonomies, 4 “Summary” · 2 tagged by an older taxonomy · 1 note from an older prompt`.
  - `Not now`, its detail `Settings › Defaults › Ask to catch up when the app opens turns this question off`.
- Yes runs those jobs as one catch-up, `Bringing papers up to date` (its end: `Bringing papers up to date is done:
  …`), from the plan it just made when that is under five minutes old, else checked again (2).
- The launcher closed with the question unanswered (it lost the keys, the app in front changed): asked when it
  opens next. esc, as on every question, is Not now.

## 4. What it checks

Settings › Defaults › When the app opens:

- `Ask to catch up when the app opens` (switch, `defaults.launchCatchUp`, default on).
- `What it checks` (a page of its own, `settings-launch-catchup`), its detail the list in effect.

The page, `defaults.launchCatchUpWhat` (shared, like the other defaults):

| Section | Row | Key | Default |
|---|---|---|---|
| Papers added in the last N days | Their text | `text` | Extract new papers' text |
| | Their taxonomies | `taxonomies` | Tag new papers by taxonomies |
| | each prompt, a checkbox | `prompts` (ids) | Prompts to run on new papers |
| Every paper | Taxonomies that changed | `changedTaxonomies` | off |
| | Prompts that changed | `changedPrompts` | off |

A key left out follows its default, so a new install checks what New papers runs; a switch changed writes its own
key. The "changed" ones are off by default: running every changed prompt again can cost a lot, so it's your choice.
The days and Replace them are Bring papers up to date's (`catchUpDays`, `catchUpPrompts`, `catchUpTaxonomies`).
Nothing selected: no check, no question.

## Where the code goes

- Shared (`lib/` and `macos/js/lib/`, identical): `Client.normalizeDefaults` checks and keeps the two keys
  (`launchCatchUp` true by default; `launchCatchUpWhat` an object of booleans and a list of prompt ids),
  `Settings.toFile` writes them only when they differ from the default. The Omarchy launcher keeps them and shows
  nothing for them.
- The Mac's (`Core/GlueSettings.js`, node-tested, goldens): the rows, the page, the plan's argv for each kind, the
  jobs a plan holds, the question's words, and a switch of the page toggled. Swift (`LauncherModel+CatchUp.swift`):
  the check, the question, the start.
- Row ids are the QML's (`set-toggle`, `set-nav`): parity stays as it is.

## Tests

- Node: normalize and toFile (both copies), the argv per kind, the merged jobs, the question's words, the toggles
  following their defaults, the rows and the page.
- Swift: Enter checks before it starts (the fresh plan's jobs run, not the page's); nothing to do; the runner
  failing; the launch check asking once, yes running the jobs, Not now leaving them, nothing to do saying nothing,
  off saying nothing; the panel and the window resizable with their minimum, and the size kept.
