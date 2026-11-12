# What the Mac app copied, and from where

The Mac app owns its view logic and its prompt runner. They began as one-time copies of the Omarchy
launcher's (the root of this repository) at commit `3c3a0d6` (2026-10-13), and changed here on
their own since. Only `contracts/` and the bridge's HTTP API are shared, read in place.

| Here | From the root | Changed in the copy |
|---|---|---|
| `js/lib/` | `lib/*.js` (Client, Fuzzy, Settings, Sidebar, Todos, Views) | nothing |
| `runner/` | `daemon/` (without `node_modules`) | `lib/paths.mjs` loads `../../../contracts/Paths.js` in a checkout. The Mac's own since: review tables (`lib/reviews.mjs`), the list chat (`lib/listchat.mjs`), the fold reader (`lib/fold.mjs`, `lib/fold-replies.mjs`), and what they need in `bin/oma-zotero-prompt.mjs`, `lib/chat.mjs`, `lib/generate.mjs` and `lib/providers/api.mjs`; a version of its own (`package.json`: the app offers *Install the AI features* when it grows) |
| `scripts/install-runner.sh`, `safe-dest.sh`, `copy-shared-paths.sh` | `scripts/` | install `runner/`; copy `../contracts/Paths.js` |
| `js/tests/` | 43 files of `tests/` | paths to `../../runner/`, `macos/`, `../contracts/`; the bridge's tests left out of `collections`, `paper-status`, `sync`; the two `dev-sync.sh` tests left out of `safe-dest` (the Omarchy plugin's script) |
| `reference/*.qml` | `ZoteroSearch.qml`, `Service.qml`, `ChatWindow.qml`, `NoteWindow.qml` | nothing; read while porting and by `parity.sh`, never built; copied again from the root when the Mac follows a change there (last: 2026-10-29, the cursor on a place typed in full) |
| `ZoteroLauncher/Reader/FoldCore.js` (part) | TextFold (github.com/chenxiachan/textfold, commit `f0e5b607eb01b74ac1efeadc6883ad48b3aaaa42`, Apache License 2.0, `ZoteroLauncher/Reader/TEXTFOLD-LICENSE.txt`): `textfold/tokens.py` (`WORD`, `STOP`, `ABBREV`, `split_sentences`, `norm`, `lcs_pairs`), `textfold/ladder.py` (`locate`, `head_words`), `textfold/web/reader.js` (`pdfNorm`, `indexWords`, `locate`, `boxesOf`) | rewritten in ES5 JavaScript; tokens rebuilt from the doc's sentence strings; the PDF words as boxes from 0 to 1 of each page; results shaped for the fold reader (FoldCore.js's header says the same) |
| `ZoteroLauncher/Reader/FoldMake.js` (part) | TextFold (the same commit and licence): `textfold/pdftext.py` (`_join`, `_body_size`, `_frame`, `_lines`' gap rule, `_running_heads`, `_title`, `_heading_of`, `_joined_headings`, `PAGE_NO`, `STAMP`, `CAPTION_AT`, `TABLE_AT`), `textfold/pdfdoc.py` (`ABSTRACT`, `REFS`, `NUMBERED`, `FRONT`, `BOILER`, `depth`) | rewritten in ES5 JavaScript; fed PDFKit's lines (words with boxes, sizes, bold) instead of pdf-inspector's Markdown and MinerU's blocks; the blocks, kinds, sections and ids are the reader's own; alphabetic languages only (FoldMake.js's header says the same) |
| `runner/lib/fold.mjs` (part) | TextFold (the same commit and licence, `runner/TEXTFOLD-LICENSE.txt`, a copy installed with the runner): `textfold/ladder.py` (`ROLES`, `BUDGET`, `SCHEMA`, `SECTION_SCHEMA`, `KIND`, `PART_UNITS`, `parts`, `outline`, `_abstract`, `_section_rule`, `prompt_for`, `section_prompt`, `clean`, `locate`, `is_word`, `head_words`, `assemble`'s string rules, `topic_tokens`' choice, `section_ladder`), `textfold/llm.py` (`SYSTEM`, the cache key of `call`, `as_obj`, `units_of`) | rewritten in JavaScript for this runner's providers (`generate()`); the English path only (no CJK rules); the reader's own doc; the levels written as strings, not tokens (fold.mjs's header says the same). The Mac's own: `daemon/` has no copy |

Vendored from npm (not the root's): `js/vendor/marked.umd.js`, marked 16.4.2 (MIT, `js/vendor/marked.LICENSE.md`),
the build the runner installs (`macos/runner/node_modules/marked`), loaded by JavaScriptCore as `Marked` for a chat's
answers (Markdown to HTML, after `Views.safeMarkdown`). Updated with the runner's: copy `lib/marked.umd.js` and its licence.

Not copied: `contracts/` (shared, read in place), `zotero-bridge/` (used over HTTP), the Omarchy
plugin's scripts (`dev-sync.sh`, `sync-apply.sh`, the end-to-end scripts) and their tests.
