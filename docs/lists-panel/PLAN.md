# Lists panel: plan

Status: approved 2026-11-06 (launcher first, review window after). L1 in progress. Mockup: https://claude.ai/artifact/CFWn5xVGZRfLRZDL5mW3mU (private to the owner).

## 1. What it is

A left column in the launcher that shows every kind of list the app already knows, grouped by type, with counts. One click (or ↵) shows that list's papers in the results, the same way Enter on a collection does today. Typing then searches inside it. ⌘T opens it as a review table, as now.

Nothing about the launcher's keyboard model goes away. The panel is a second way in for browsing, beside typing. Today you reach a status, a task status or a taxonomy label only by typing `status:reading`, `task:waiting` or `#"theory/resource-based view"` (or through the @ picker). The panel makes those lists visible and countable without remembering the syntax.

## 2. What goes in it (all from the code as it is today)

Every item is either an existing scope (collection, tag, saved search) or a query token the search already understands. So the panel needs no new list storage and ⌘T works on every item with no change to review tables (ReviewCore already takes a `query` source and `reviewFor` reuses a list's table).

| Section | Items | Icon (Icons.concept) | Where the data comes from | What a click searches |
|---|---|---|---|---|
| Favorites | Any item you pin (p). Starts with your pinned saved searches | `pin` | `searches.json` pinned + new `view.json` `favorites` | That item's own search |
| Saved searches | All your saved searches (your saved queries), in your order | `magnifyingglass` | `searches.json` | the saved search's scope |
| Quick lists | Recent, Open in Zotero, Pinned papers, Unfiled, No PDF | `bolt` | bridge `/search` empty query (recent, open, pinned); `/facets` `has` | top level; `!has:collection`; `!has:pdf` |
| Reading status | No status, To read, Reading, Read (your Settings › Paper status list, in order) | `flag` | `/facets` field `status` with `statusTags` | `status:reading`, `status:none` |
| Tasks | Task statuses under their groups: Backlog, Next, Active, Waiting (Completed folded) | `checklist` | `/facets` field `task` with marks; `lib/Todos.js` GROUPS | `task:reading`, `task:waiting` |
| Taxonomies | Paper type, Method, Theories, Epistemology, Ontology (your taxonomies), each folding open to its labels | `tag` | taxonomies in settings + `/facets` `tag` filtered by each prefix | `#"theory/resource-based view"` |
| Collections | The collection tree per library, group libraries as their own heading | `folder` | `/facets` `collection` (needs parent and key added, see 6) | collection scope |
| Tags | Your plain tags, most used first, top 8, then "All tags…" | `number` | `/facets` `tag` minus status and taxonomy prefixes | tag scope |
| Review tables | Your tables | `tablecells` | `reviews/` in the sync folder | opens the table's window |
| More (hidden by default) | Item types, Years, With notes, With a chat | per field | `/facets` `type`, `year`, `has` | `type:book`, `y:2024`, `has:notes` |

A footer row of four icons keeps the places that are not paper lists one click away: Chats (c), Tasks (t), Processes (.), Settings (;). Each shows its key on hover.

Taxonomy labels appear as their label names under the taxonomy's name, never as raw prefixed tags (`theory/x`), and statuses as their names, never `s/reading`. Same rule as every other surface.

## 3. How it behaves

- **Selecting.** Click or ↵ shows the list's papers. The breadcrumb reads `Reading status › Reading`, the count beside it. esc goes back to the top level and clears the selection, as leaving a collection does.
- **Combining.** ⌘-click adds an item to what is shown (AND); ⌥-click excludes it (NOT). The search box shows the tokens as its usual coloured segments, so you can see and edit the query, and save it with ⌘S. Example: Reading + Theories › dynamic capabilities + Paper type › empirical quantitative. Combined items carry a ✓ (an excluded one is struck through), so selection never depends on colour.
- **Favorites.** p on any item pins it to Favorites. Tab and ⇧Tab cycle Favorites, as they cycle the badges today. ⌘1 to ⌘9 jump to the first nine. Your pinned saved searches are the first Favorites, so nothing you have now is lost.
- **The badge bar.** While the panel is shown, the badges are the panel's Favorites, so the badge row hides and only Group ▾ Sort ▾ Order stay above the results. With the panel hidden, the badges come back as they are now.
- **Drop to apply.** Drag a paper from the results onto an item: a reading status sets its status (as ⌥→←), a task status sets its default task (as ⇧⌥→←), a taxonomy label adds that label (marked as yours), a tag adds the tag, a collection adds it to the collection. The target row gets a 2 px outline and a line saying what the drop does ("Drop: status Reading"). Lists that are searches (Recent, a saved search, a review table) take no drop. The flash says what changed: `Now: Reading`.
- **Keys.** A button at the top of the panel folds it to the icon rail, and the same button at the top of the rail opens it again; ⌃⌘S does the same (the Mac's own Show Sidebar key). ⌘L moves the keys into the panel: ↑↓ move, →← open or fold a section, ↵ show, p pin, ⌘T table, ⇧↵ apply the item to the highlighted paper (the keyboard way to drop), esc back to the results. All of these are free in the launcher today (the key router passes ⌘ keys other than ⌘S, ⌘T, ⌘V and the size keys).
- **Sections.** Right-click a heading: Hide, Move up, Move down (⌃⇧↑↓ when the panel has the keys, the existing convention), Show counts. Settings › General › Lists panel lists the sections with switches. Folded state, order and hidden sections live in `view.json` (synced, so both Macs match).
- **Counts.** Secondary text, right-aligned, tabular digits. Refreshed when the bridge's index changes or a status, task or tag changes (debounced). A folded section fetches nothing until you open it.

## 4. Sizes, tiling and the overlay

- **Window** (Settings › General › Open as a window): the panel is shown by default, 220 pt wide, drag its edge from 180 to 320 (remembered on this Mac, UserDefaults `ZLListsWidth`).
- **Overlay**: hidden by default. ⌃⌘S shows it for that opening; the overlay grows to the left by the panel's width, so the results keep their size.
- **Narrow (TileMyMac halves and thirds)**: below 760 pt of window width the panel becomes a 44 pt rail of section icons. Clicking an icon opens that section as a pop-over list. Above 760 pt it opens again. The launcher's minimum stays 560 by 360.
- **Colour-blind**: every section and item leads with its kind's symbol; selection is a filled row plus bold text; combined items get ✓, excluded ones are struck through; a drop target is an outline plus words; counts are numbers. No status or task is ever told by a coloured dot. The pills keep `SafeColours`.

## 5. The review window and the reader

Phase L4 puts the same panel in the review window, in place of the toolbar's source button. Clicking a list there previews its papers in the grid (the grid's existing `preview` mode, nothing written). "Keep as this list's table" saves it; a list that already has a table opens that table instead. This avoids the duplicate tables the October usage log showed (9 tables, mostly duplicates).

TextFold compatibility. The current pick on the TextFold thread is A+ (TextFold's own reader in a window tiled beside the review table), still waiting on Marcelo. The panel is built to fit that:
- The reader stays its own window. The panel never hosts it, so the reader can sit side by side with the table at full height.
- In the review window the panel defaults to the rail. On a 1512 pt MacBook screen split two-thirds and one-third, that leaves the review window 1008 pt: rail 44 + grid about 640 + Info/Chat pane 320, with the reader in the remaining third.
- Selection flows one way: panel → grid → reader. The reader follows the selected paper; marking a paper read there (a status change) updates the panel's Reading status counts on the next refresh.
- If a native side-by-side reader is ever built, it takes the right pane's place (a third tab beside Info and Chat), not the left panel's.

## 6. Build phases

Each phase follows the usual steps: spec, plan, tests, code review, UX-consistency review, fix pass. Rough sizes, not promises.

| Phase | What | Where | Size |
|---|---|---|---|
| L1 | `lib/Sidebar.js`: pure `buildLists(facets, searches, reviews, taxonomies, statuses, tasks, prefs)` → sections and items (id, kind, icon, label, count, scope or token, depth, droppable). Node tests. Vendored to `macos/js/lib`, a Glue wrapper | root `lib/` (both launchers) | 0.5 to 1 day |
| L1b | Bridge: the `collection` facet returns `key`, `parentKey`, `libraryID`, `libraryName`, so the tree is built from data, not split on " / ". New route `POST /collection/add` for dropping on a collection. Bridge release (Marcelo pushes the tag) | `zotero-bridge/` | 0.5 day |
| L2 | Mac launcher panel: `ListsPanel.swift` (SwiftUI, beside the results in `LauncherView`), selection → scope or token, breadcrumb, ⌃⌘S, ⌘L, Favorites and the badge bar merge, ⌘1 to ⌘9, counts, usage log events. One Mac release | `macos/` | 1.5 to 2 days |
| L3 | Drop to apply, ⇧↵ apply, ⌘-click and ⌥-click combine, section menu and Settings row, the rail and its pop-overs | `macos/` | 1.5 days |
| L4 | Review window panel (rail by default), preview then keep, replaces the source button | `macos/Review` | 1 day |
| L5 | Omarchy port (section 7) | root QML | 1.5 to 2 days, after port phase D3 |

Measure it. L2 logs `lists:open`, `lists:combine`, `lists:drop`, `lists:pin` in the usage log (counts only, as now). Two weeks after it ships, the usage report says whether the panel replaced typing for browsing or sits unused. If it sits unused, L3 to L5 wait.

## 7. Omarchy carry-over

- The model is `lib/Sidebar.js`, so the QML launcher gets the same sections, order, counts and tokens with no second implementation. Its tests run in root `make test`.
- QML: a `ListView` column on the left of `ZoteroSearch.qml`'s card, the same rows as the results (icon, label, count). Hyprland floats the launcher, so the rail is the default there and the full panel opens with the toggle.
- Colours follow the Omarchy theme (port decision D4); the safe pill colours are unconditional there.
- Keys: the same actions with Omarchy's notation. Toggle candidate Ctrl+B (Super is the window manager's); checked against the QML keymap in L5.
- Drop to apply: ⇧↵ apply works on day one (keyboard). Mouse drag in QML comes after, using `DragHandler`.
- The review window panel on Linux arrives with port D2 (review tables in a Chromium app window), because it is the same `ReviewGrid.js` page once D3 moves it to `shared/`.
- Port PR #83 is open; L1 lands in `lib/` and must keep `scripts/check-boundaries.sh` green (root never names `macos/`).

## 8. Decisions for Marcelo

1. **Where first** (decision card in the thread). Recommended: the launcher first (L2, L3), the review window after (L4). Alternative: the review window only, which keeps the launcher a pure keyboard overlay.
2. **The badge bar** hides while the panel is shown, its badges becoming Favorites. Recommended yes; the other way shows the same pinned searches twice.
3. **Default sections**: Favorites, Saved searches, Quick lists, Reading status, Tasks, Taxonomies, Collections, Review tables open; Tags folded; More hidden. Going with this unless you say otherwise.

## 9. Risks

- Width. The overlay grows by 220 pt when the panel is shown. On a laptop with the overlay centred, that is fine; tiled, the rail takes over.
- Counts cost. Five `/facets` calls per refresh. Status and task counts are counted on each request (the bridge's LIVE fields). Folded sections skip theirs; refreshes are debounced. If it is still slow on a 10,000-paper library, a batched `/facets` with several fields is a small bridge change.
- A second way to do the same thing. Typing stays the fast path; the panel is for browsing and for drops. If the usage log shows it unused after two weeks, stop at L2.
- Drops write to the Zotero library (tags, collections). They go through the bridge routes the app already uses for tags and statuses, plus the one new collection route; read-only libraries refuse the drop with the reason.
