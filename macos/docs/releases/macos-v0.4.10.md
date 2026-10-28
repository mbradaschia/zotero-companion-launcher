The review table is easier to find, and both the results and the review table have Group, Sort and Order apart.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.10…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.10/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey.

**Open the results as a review table, from where you look.** A table button beside the pin, at the top of the
results, opens what they list as a review table, as ⌘T does. The footer now hints ⌘T table wherever the keys are (the
search box or the list), early enough that a narrow launcher keeps it; until now only the search box's hints had it.

**Group, Sort and Order, apart.** The results' one pill is now three controls on the bar:

- **Group ▾**: none, paper status, task status, task group, or one of your taxonomies.
- **Sort ▾**: relevance, date added, date changed, year published.
- **Order**: ↓ Desc or ↑ Asc (off while the sort is relevance).

g picks the next sort and G the next grouping, as the key hints say. Your view keeps them; an older saved grouping
(such as "year, oldest first") carries over.

**The review table groups too.** Its toolbar has Group ▾ (any column whose values papers share: year, type, status,
a taxonomy, a list column of yours), Sort ▾ (the columns sorted, ⇧-click on a header still adds one) and Order, which
turns the first sort key. Each group gets a header row with its count, papers without a value last, and the table
remembers its grouping.
