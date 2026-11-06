import AppKit
import Foundation

// The Lists panel (lib/Sidebar.js; docs/lists-panel/PLAN.md, phase L2): every kind of list the launcher knows, in
// sections, with their papers' counts, beside the results. A click (or ↵ once ⌘L gives the panel the keys) shows a
// list's papers as Enter on a collection does, one level in (esc goes back): a collection, a tag or a saved search as
// itself; a status, a task status, a taxonomy's label or a quick list as a search of its own terms (status:"reading"),
// named for where it is (Reading status › reading). Its Favorites stand in for the badges above the results (your
// pinned saved searches first): Tab and ⇧Tab go through them, ⌘1…⌘9 open one. The panel keeps no lists of its own:
// only which are favorites, and which sections and folders are folded (view.json's `lists`).

// What lib/Sidebar.js gives (Glue.listsPanel), decoded.
struct ListsScope: Codable, Equatable {
    var type: String // "collection", "tag" or "search"
    var key: String
    var libraryID: Int
    var title: String
    var query: String?
}

struct ListsTarget: Codable, Equatable {
    var type: String // "scope", "query", "top", "review" or "view"
    var query: String?
    var which: String? // a top-level section: recent, open, pinned
    var id: String? // a review table's
    var view: String?
    var scope: ListsScope?
}

struct ListsItem: Codable, Equatable {
    var id: String
    var section: String
    var kind: String
    var label: String
    var count: Int?
    var depth: Int
    var parent: String
    var group: String
    var folder: Bool
    var target: ListsTarget?
    var path: String
    var of: String? // a favorite's: the item it stands for

    var base: String { of ?? id }
}

struct ListsSection: Codable, Equatable {
    var id: String
    var title: String
    var icon: String
    var folded: Bool
    var items: [ListsItem]?
}

struct ListsRow: Codable, Equatable, Identifiable {
    var row: String // "section", "group" or "item"
    var key: String
    var section: ListsSection?
    var label: String?
    var item: ListsItem?

    var id: String { key }
}

struct ListsBuilt: Codable {
    var rows: [ListsRow]
    var favorites: [ListsItem]
    var sections: [ListsSection]
}

struct ListsState {
    var facets: [String: Any] = [:] // the bridge's counts: /facets' values, by field
    var reviews: [[String: Any]] = [] // the review tables, as last read
    var asked = 0 // the newest round of counts (an older round's answers are dropped)
    var rows: [ListsRow] = []
    var favorites: [ListsItem] = []
    var sections: [ListsSection] = []
    var problem = "" // why the panel couldn't be made
    var focus = false // ⌘L: the panel has the keys
    var cursor = "" // the row the keys are on (its key)
    var narrow = false // the launcher under 760 points wide: the rail, whatever you chose…
    var narrowOpen = false // …unless you opened it there
    var popover = "" // the rail's section shown as a pop-over
    var timer: Timer?
}

extension LauncherModel {
    static let listsFields = ["status", "task", "tag", "collection", "has"]
    nonisolated static let listsDefaultWidth: CGFloat = 220
    nonisolated static let listsWidths: ClosedRange<CGFloat> = 180...320
    nonisolated static let listsRailWidth: CGFloat = 46
    nonisolated static let listsNarrow: CGFloat = 760
    nonisolated static var keptListsWidth: CGFloat {
        let w = UserDefaults.standard.double(forKey: "ZLListsWidth")
        return w > 0 ? min(max(CGFloat(w), listsWidths.lowerBound), listsWidths.upperBound) : listsDefaultWidth
    }
    static let listKeyPrefix = "list:" // a list's scope key (a search of its terms): "list:" and its item's id

    // view.json's lists: { favorites, folded, hidden, order }.
    var listsPrefs: [String: Any] { prefs?.values["lists"] as? [String: Any] ?? [:] }

    // Open here (the window's choice, or the overlay's), and drawn open: not while the launcher is too narrow for it,
    // unless you opened it there.
    var listsOpen: Bool { windowed ? listsOpenWindow : listsOpenOverlay }
    var listsFull: Bool { listsEnabled && listsOpen && (!lists.narrow || lists.narrowOpen) }
    // How much wider the overlay is for the open panel than for the rail (it grows to the left by it).
    var listsGrowth: CGFloat { listsEnabled && listsOpenOverlay ? listsWidth - Self.listsRailWidth : 0 }

    // The launcher's width crossed 760 points (the view's).
    func listsWidthChanged(narrow: Bool) {
        guard lists.narrow != narrow else { return }
        lists.narrow = narrow
        if !narrow { lists.narrowOpen = false }
    }

    // ⌃⌘S, or the button at the panel's top (and the rail's): open, or folded to the rail.
    func toggleLists() {
        guard listsEnabled else { return flashMessage("The Lists panel is off: Settings › General › Lists panel turns it on") }
        if listsFull {
            if windowed { listsOpenWindow = false } else { listsOpenOverlay = false }
            lists.narrowOpen = false
            lists.focus = false
            UsageLog.shared.count("lists:collapse")
        } else {
            if !listsOpen { if windowed { listsOpenWindow = true } else { listsOpenOverlay = true } }
            if lists.narrow { lists.narrowOpen = true }
            UsageLog.shared.count("lists:expand")
        }
        lists.popover = ""
    }

    // ---- the counts and the rows

    // Each field's counts asked of the bridge (all at once; the newest round wins), and the rows made as they come.
    func refreshLists() {
        guard listsEnabled, let core else { return }
        lists.timer?.invalidate()
        lists.reviews = reviewList().map { ["id": $0["id"] ?? "", "name": $0["name"] ?? ""] }
        lists.asked += 1
        let round = lists.asked
        buildLists()
        let tasks: Any = todos?.json ?? RawJSON(text: "[]")
        let chats: Any = chat.chats ?? []
        for field in Self.listsFields {
            // (no limit: every tag and collection)
            let body = (try? core.glueJSON("facetsBody", [field, "", NSNull(), settingsJSON, tasks, chats])).flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) } as? [String: Any] ?? [:]
            bridge.post("/facets", body, timeout: 8) { [weak self] result in
                MainActor.assumeIsolated {
                    guard let self, round == self.lists.asked else { return }
                    if case .ok(let answer) = result, let values = answer["values"] as? [Any] { self.lists.facets[field] = values }
                    self.buildLists()
                }
            }
        }
    }

    // A paper's status, task or tags changed (or Zotero synced): the counts again, once a burst of changes is over.
    func listsChanged() {
        guard listsEnabled else { return }
        lists.timer?.invalidate()
        lists.timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: false) { [weak self] _ in MainActor.assumeIsolated { self?.refreshLists() } }
    }

    // The rows from what is known now (the counts that came, your saved searches, prefs).
    func buildLists() {
        guard listsEnabled, let core else { return }
        do {
            let built = try core.glue("listsPanel", [lists.facets, savedSearches, lists.reviews, tax.taxonomies, settingsJSON, listsPrefs], as: ListsBuilt.self)
            lists.rows = built.rows
            lists.favorites = built.favorites
            lists.sections = built.sections
            lists.problem = ""
        } catch {
            lists.problem = String(describing: error)
        }
    }

    // An item by its id, in its own section (a favorite's own, not its copy).
    func listsItem(_ id: String) -> ListsItem? {
        for s in lists.sections where s.id != "favorites" {
            if let it = (s.items ?? []).first(where: { $0.id == id }) { return it }
        }
        return nil
    }

    // ---- what the results show

    // The item for what the results are in: the collection, tag or saved search opened (from the panel or not), or the
    // list opened from it. "" for none.
    var listsSelected: String {
        guard let s = store.scope else { return "" }
        switch s.type {
        case "collection": return "col:\(s.libraryID):\(s.key)"
        case "tag": return "tag:" + s.key.lowercased()
        default: return s.key.hasPrefix(Self.listKeyPrefix) ? String(s.key.dropFirst(Self.listKeyPrefix.count)) : "search:" + s.key
        }
    }

    // A list's scope: a collection, a tag or a saved search as itself; a search of its terms, named for where it is.
    func listScope(_ item: ListsItem) -> Scope? {
        guard let t = item.target else { return nil }
        if t.type == "scope", let s = t.scope {
            if s.type == "search" { return scopeOf(savedSearch(s.key)) } // (as the Searches view opens it)
            return Scope(type: s.type, key: s.key, libraryID: s.libraryID, title: s.type == "tag" && !s.title.hasPrefix("#") ? "#" + s.title : s.title)
        }
        guard t.type == "query", let q = t.query, !q.isEmpty else { return nil }
        return Scope(type: "search", key: Self.listKeyPrefix + item.base, libraryID: 0, title: listTitle(item), query: q)
    }

    // "Reading status › reading", "Theories › dynamic capabilities", "Tasks › Waiting".
    func listTitle(_ item: ListsItem) -> String {
        let own = listsItem(item.base) ?? item
        if own.kind == "label" && !own.path.isEmpty { return own.path }
        let section = lists.sections.first { $0.id == own.section }?.title ?? ""
        return section.isEmpty ? own.label : section + " › " + own.label
    }

    // A list clicked (or ↵ on it): its papers, one level in, as Enter on a collection shows them; the one shown already,
    // back to the top. A folder of lists (a taxonomy) opens or folds; a review table opens its window; All tags… the
    // tags to choose from; Recent, Open in Zotero and Pinned papers are the top level's own.
    func openListItem(_ item: ListsItem, again: Bool = true) {
        guard let target = item.target else { return toggleListsFold(item) }
        guard store.pickFor.isEmpty else { return flashMessage("Pick the paper first (esc stops picking)") }
        UsageLog.shared.count("lists:open")
        lists.popover = ""
        switch target.type {
        case "review":
            openReviewWindow(target.id ?? "")
        case "view":
            goHome()
            openPickerValues("tag")
        case "top":
            goHome()
            if !store.filterText.isEmpty { setFilter("") }
            let names = ["recent": ["Recently added", "Recently modified", "Recent", "Papers"], "open": ["Open in Zotero"], "pinned": ["Pinned"]][target.which ?? ""] ?? []
            if let i = searchRows.firstIndex(where: { names.contains($0.section) }) {
                store.followTop = false
                store.selectedIndex = i
            }
        case "scope", "query":
            guard let scope = listScope(item) else { return flashMessage("“\(item.label)” is gone") }
            if store.inSearch && store.scope == scope {
                if again { goHome() } // (the one shown, clicked again: back to all)
                return
            }
            goHome()
            store.push("search")
            store.scope = scope
            scopeTotal = ""
            response = nil
            rebuildSearch()
            requestSearch()
        default:
            break
        }
    }

    // ⌘1…⌘9: the favorite numbered so.
    func openFavorite(_ n: Int) {
        guard listsEnabled else { return }
        guard lists.favorites.indices.contains(n - 1) else {
            return flashMessage(lists.favorites.isEmpty ? "No favorites yet: ⌘L, then p on a list, pins it" : "Favorites go up to ⌘\(lists.favorites.count)")
        }
        openListItem(lists.favorites[n - 1], again: false)
    }

    // Tab and ⇧Tab: the next favorite (and the top level, as the badges' All), round and round.
    func cycleFavorite(_ delta: Int) {
        let ids = [""] + lists.favorites.map(\.base)
        let at = ids.firstIndex(of: listsSelected) ?? 0
        let next = ids[((at + delta) % ids.count + ids.count) % ids.count]
        if next.isEmpty { return goHome() }
        if let fav = lists.favorites.first(where: { $0.base == next }) { openListItem(fav, again: false) }
    }

    // Whether the results are in one of the favorites (Tab goes on to the next there, as at the top).
    var inFavorite: Bool {
        let id = listsSelected
        return !id.isEmpty && lists.favorites.contains { $0.base == id }
    }

    // ---- favorites, folding (view.json's lists)

    // p on a list: a favorite, or not. A saved search's is its pin (searches.json), the others' are view.json's.
    func toggleListFavorite(_ item: ListsItem) {
        let id = item.base
        guard item.kind != "hint" && item.kind != "more", item.target != nil else { return flashMessage("Only a list can be a favorite") }
        UsageLog.shared.count("lists:pin")
        if id.hasPrefix("search:") {
            toggleSearchPin(String(id.dropFirst("search:".count)))
            return buildLists()
        }
        var p = listsPrefs
        var fav = p["favorites"] as? [String] ?? []
        let was = fav.contains(id)
        if was { fav.removeAll { $0 == id } } else { fav.append(id) }
        p["favorites"] = fav
        writeListsPrefs(p)
        flashMessage(was ? "Out of Favorites" : "In Favorites: Tab goes through them, ⌘\(min(9, lists.favorites.count)) opens it")
    }

    // A section's heading, or a folder (a taxonomy, a task group, a collection with subcollections): open or folded.
    func toggleListsFold(_ item: ListsItem) {
        var p = listsPrefs
        var folded = p["folded"] as? [String: Any] ?? [:]
        let now = folded[item.base] as? Bool ?? (item.kind == "taxonomy")
        folded[item.base] = !now
        p["folded"] = folded
        writeListsPrefs(p)
    }

    func toggleListsSection(_ section: ListsSection) {
        var p = listsPrefs
        var folded = p["folded"] as? [String: Any] ?? [:]
        folded[section.id] = !section.folded
        p["folded"] = folded
        writeListsPrefs(p)
    }

    // ⌃⇧↑↓ on a section's heading: it moves.
    func moveListsSection(_ id: String, _ delta: Int) {
        guard let core, let order = try? core.glue("listsMoveSection", [listsPrefs, id, delta], as: [String].self) else { return }
        var p = listsPrefs
        p["order"] = order
        writeListsPrefs(p)
    }

    func writeListsPrefs(_ p: [String: Any]) {
        guard var prefs else { return }
        saved {
            try prefs.set("lists", p)
            self.prefs = prefs
        }
        buildLists()
    }

    // Whether a folder's lists are folded away (as lib/Sidebar.js decides).
    func listsFolderOpen(_ item: ListsItem) -> Bool {
        let folded = listsPrefs["folded"] as? [String: Any] ?? [:]
        return !(folded[item.base] as? Bool ?? (item.kind == "taxonomy"))
    }

    // ---- ⌘L: the panel's keys

    // ⌘L: the keys into the panel (opened, if it was the rail), on the list shown; again, back to the results.
    func focusLists() {
        guard listsEnabled else { return flashMessage("The Lists panel is off: Settings › General › Lists panel turns it on") }
        if lists.focus { lists.focus = false; return }
        if !listsFull { toggleLists() }
        let keys = listsKeyRows
        let shown = listsSelected
        lists.cursor = keys.first { $0.item?.base == shown && $0.item?.section != "favorites" }?.key ?? keys.first?.key ?? ""
        lists.focus = true
        store.searchFocus = false
        UsageLog.shared.count("lists:keys")
    }

    // The rows the keys move over: headings and lists (not the libraries' names, nor a hint).
    var listsKeyRows: [ListsRow] { lists.rows.filter { $0.row == "section" || ($0.row == "item" && $0.item?.kind != "hint") } }

    // A key while the panel has them. → nil: not the panel's (it leaves the panel and goes on).
    func listsKey(_ e: KeyEvent) -> Bool? {
        let plain = !e.command && !e.control && !e.option
        if e.command { return nil } // (⌘T, ⌘L, ⌃⌘S, ⌘1…: the launcher's)
        let rows = listsKeyRows
        let at = rows.firstIndex { $0.key == lists.cursor }
        let row = at.map { rows[$0] }
        switch e.key {
        case .escape, .tab, .backtab:
            lists.focus = false
            return true
        case .up, .down:
            let d = e.key == .up ? -1 : 1
            if e.shift && e.control, let s = row?.section { moveListsSection(s.id, d); return true }
            guard !rows.isEmpty else { return true }
            let i = at.map { min(max($0 + d, 0), rows.count - 1) } ?? 0
            lists.cursor = rows[i].key
            return true
        case .left, .right:
            let open = e.key == .right
            if let s = row?.section {
                if s.folded == open { toggleListsSection(s) }
            } else if let it = row?.item, it.folder, it.section != "favorites" {
                if listsFolderOpen(it) != open { toggleListsFold(it) }
            } else if !open, let it = row?.item, !it.parent.isEmpty, let parent = rows.first(where: { $0.item?.id == it.parent && $0.item?.section == it.section }) {
                lists.cursor = parent.key // (← on a list in a folder: to its folder)
            }
            return true
        case .enter:
            if let s = row?.section { toggleListsSection(s) } else if let it = row?.item { openListItem(it) }
            return true
        default:
            if e.key == .character("p") && plain && !e.shift { // p: a favorite, or not
                if let it = row?.item { toggleListFavorite(it) }
                return true
            }
            if e.printable { lists.focus = false; return nil } // (typing: into the search, as anywhere)
            return true
        }
    }
}
