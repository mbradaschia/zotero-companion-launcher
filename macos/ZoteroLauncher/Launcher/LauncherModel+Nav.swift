import Foundation

// Where you are and how you got there: the results' submenu arrows, the breadcrumb.
extension LauncherModel {
    // Go to's places that act at once (a sync, a question first, a background job): no arrow.
    static let placesActingAtOnce: Set<String> = ["sync", "classify-all", "extract-all"]

    // Whether Enter on a result opens another list (its › in SearchRowView): a collection or a tag (its papers, while
    // picking a paper too), a paper (its menu) and a note under it (the reader), and Go to's places that have a view.
    // Picking a paper, Enter on one picks it; a kind not listed here gets no arrow.
    func searchRowOpens(_ row: SearchRow) -> Bool {
        if row.kind == "collection" || row.kind == "tag" || row.kind == "saved-search" { return true }
        guard store.pickFor.isEmpty else { return false }
        if row.kind == "item" || row.kind == "note-child" { return true }
        let place = Self.goToPlaces.contains(row.kind) || row.kind.hasPrefix("settings") || row.kind == "setting" // (a setting found by name: its page)
        return place && !Self.placesActingAtOnce.contains(row.kind)
    }
}

// The breadcrumb's path, shortened from the middle when it's long: the first level and the last ones kept.
enum Breadcrumb {
    static func fit(_ crumbs: [String], max: Int) -> [String] {
        guard crumbs.count > max, max >= 3 else { return crumbs }
        return [crumbs[0], "…"] + crumbs.suffix(max - 2)
    }
}

extension LauncherModel {
    // Every level's name, where you came from first: empty at the top level (the bar is hidden there).
    var breadcrumb: [String] {
        guard !store.stack.isEmpty else { return [] }
        // a paper's level is named when drawn: its authors and year may arrive after you left its menu
        let paper = actionItem != nil ? Self.crumbPart(paperLabel) : nil
        let names = store.crumbs.indices.map { i in store.stack[i].view == "actions" ? paper ?? store.crumbs[i] : store.crumbs[i] }
        return names + [crumbTitle(current: true)]
    }

    // A level's name in the breadcrumb: the results by what's typed or what they're in, a paper by its authors and
    // year (in full where you are), a page by its own title (the last part of its placeholder's).
    func crumbTitle(current: Bool) -> String {
        let fromPaper = store.stack.contains { $0.view == "actions" } // (a paper's menu below names the paper)
        switch store.view {
        case "search":
            if store.pickFor == "chat" { return "New chat: pick a paper" }
            if store.pickFor == "todo" { return "Pick the task's paper" }
            if !store.pickFor.isEmpty { return "Pick a paper" }
            if let scope = store.scope { return scope.title }
            let typed = store.filterText.trimmingCharacters(in: .whitespaces)
            if !typed.isEmpty { return "“\(typed)”" }
            return searchScope?.title ?? "Results" // (a saved search's badge, nothing typed)
        case "actions":
            return current ? paperLabel : Self.crumbPart(placeholder())
        case "tag-menu":
            return tags.menuName.isEmpty ? "Tag" : "#" + tags.menuName
        case "todo-edit":
            let about = (currentTodo()?["description"] as? String ?? "").trimmingCharacters(in: .whitespaces)
            return about.isEmpty ? "Task" : String(about.prefix(48))
        case "chat-menu", "artifact-menu":
            let thing = store.view == "chat-menu" ? chat.menu : chat.artifact
            let title = thing?["title"] as? String ?? (store.view == "chat-menu" ? "Chat" : "Artifact")
            let paper = thing?["paper"] as? String ?? ""
            return current && !fromPaper && !paper.isEmpty ? paper + " · " + title : title
        case "note":
            let title = noteParts.title
            guard current, !fromPaper else { return title }
            if actionItem == nil { return title + " · a note on no paper" }
            return Self.crumbPart(paperLabel) + " · " + title
        default:
            return Self.crumbPart(placeholder())
        }
    }

    // "‹ Settings › General · its hint" → "General"
    static func crumbPart(_ placeholder: String) -> String {
        var t = placeholder.hasPrefix("‹ ") ? String(placeholder.dropFirst(2)) : placeholder
        if let dot = t.range(of: " · ") { t = String(t[..<dot.lowerBound]) }
        if let last = t.components(separatedBy: " › ").last { t = last }
        return t.trimmingCharacters(in: .whitespaces)
    }

    // A click on a crumb: back to that level (0 is the top), as that many esc presses would.
    func jumpToCrumb(_ index: Int) {
        while store.stack.count > index && back() {}
    }
}

// The results' Group, Sort and Order (view.json's group, sort, order), set from the three menus above them, g (the next
// sort) and G (the next grouping).
struct Arrangement: Decodable, Equatable {
    var group: String // "" none, "status", "task", "taskgroup", "tax:<prefix>"
    var sort: String // "relevance", "added", "modified", "year", "title", "author", "manual" (your order, per list:
    // view.json's paperOrder); before you type, "recent" or one of the bridge's
    var order: String // "desc", "asc"
}

struct ArrangeOptions: Decodable {
    let groups: [[String]] // [id, name]
    let sorts: [[String]]
}

extension LauncherModel {
    var arrangement: Arrangement {
        (try? core?.glue("arrangement", [prefs?.values ?? [String: Any]()], as: Arrangement.self)) ?? Arrangement(group: "", sort: "relevance", order: "desc")
    }

    var arrangeOptions: ArrangeOptions {
        (try? core?.glue("arrangeOptions", [tax.taxonomies], as: ArrangeOptions.self)) ?? ArrangeOptions(groups: [["", "None"]], sorts: [["relevance", "Relevance"]])
    }

    // The top level's sort (view.json's topSort, topOrder): only a sort and its order, no grouping or your own order.
    var topArrangement: Arrangement {
        (try? core?.glue("topArrangement", [prefs?.values ?? [String: Any]()], as: Arrangement.self)) ?? Arrangement(group: "", sort: "recent", order: "desc")
    }

    var topSortOptions: [[String]] { (try? core?.glue("topSortOptions", [], as: [[String]].self)) ?? [["recent", "Recent"]] }

    // The top level with nothing typed (no saved search's badge either): its papers have a Sort and an Order.
    var topList: Bool {
        guard store.inSearch, store.atRoot, store.pickFor.isEmpty, searchScope == nil, let response else { return false }
        return !(response["scope"] is [String: Any]) && (response["query"] as? String ?? "").trimmingCharacters(in: .whitespaces).isEmpty
    }

    // What the bridge sorts before it cuts the list to its limit (Glue.searchBody's sort): the top level's, or a
    // collection's or a tag's by a date, the year, the title or the author; nil for the list's own order.
    var bridgeSort: [String: String]? {
        guard store.filterText.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        let a = searchScope == nil ? topArrangement : arrangement
        guard ["added", "modified", "year", "title", "author"].contains(a.sort) else { return nil }
        return ["by": a.sort, "order": a.order]
    }

    // Whether the papers are arranged: a list you browse (a collection, a tag, a saved search) with nothing typed. What
    // you type is by relevance; the top level has its own sort (topList).
    var arrangeable: Bool {
        guard store.inSearch, let response else { return false }
        return (response["scope"] is [String: Any]) && (response["query"] as? String ?? "").trimmingCharacters(in: .whitespaces).isEmpty
    }

    // The arrangement in words, as the three menus show it: "By relevance", "↓ Date added", "Paper status · ↑ Year
    // published", "Your order"; "" where the papers aren't arranged.
    var sortLabel: String {
        if topList, core != nil {
            let a = topArrangement
            return a.sort == "recent" ? "Recent" : (a.order == "asc" ? "↑ " : "↓ ") + (topSortOptions.first { $0.first == a.sort }?.last ?? a.sort)
        }
        guard arrangeable, core != nil else { return "" }
        let a = arrangement, o = arrangeOptions
        let group = o.groups.first { $0.first == a.group }?.last ?? ""
        let sort = a.sort == "relevance" ? "By relevance" : a.sort == "manual" ? "Your order"
            : (a.order == "asc" ? "↑ " : "↓ ") + (o.sorts.first { $0.first == a.sort }?.last ?? a.sort)
        return a.group.isEmpty ? sort : group + " · " + sort
    }

    func setGroup(_ id: String) { var a = arrangement; a.group = id; setArrangement(a) }
    func setSort(_ id: String) {
        if topList { var a = topArrangement; a.sort = id; return setTopArrangement(a) }
        var a = arrangement; a.sort = id; setArrangement(a)
    }
    func toggleOrder() {
        if topList { var a = topArrangement; a.order = a.order == "asc" ? "desc" : "asc"; return setTopArrangement(a) }
        var a = arrangement; a.order = a.order == "asc" ? "desc" : "asc"; setArrangement(a)
    }

    // g / G: the next sort, the next grouping (each wraps around).
    func cycleSort(_ delta: Int) {
        let ids = (topList ? topSortOptions : arrangeOptions.sorts).compactMap(\.first)
        let i = ids.firstIndex(of: topList ? topArrangement.sort : arrangement.sort) ?? 0
        setSort(ids[((i + delta) % ids.count + ids.count) % ids.count])
    }

    func cycleGroup(_ delta: Int) {
        if topList { return flashMessage("Group works in a collection, a tag or a saved search (\(keyName("g")) sorts these)") }
        let ids = arrangeOptions.groups.compactMap(\.first), i = ids.firstIndex(of: arrangement.group) ?? 0
        setGroup(ids[((i + delta) % ids.count + ids.count) % ids.count])
    }

    // Kept in view.json (defaults left out); the older one-key grouping goes, as these three replace it.
    func setArrangement(_ a: Arrangement) {
        guard var prefs else { return }
        saved {
            try writeArrangement(a, &prefs)
            self.prefs = prefs
        }
        store.followTop = false
        if store.inSearch { rebuildSearch() }
        if arrangeable { requestSearch() } // (the bridge picks a collection's first papers in this sort)
        let now = arrangement, o = arrangeOptions
        let group = now.group.isEmpty ? "" : ", grouped by " + (o.groups.first { $0.first == now.group }?.last ?? now.group).lowercased()
        let sort = now.sort == "relevance" ? "by relevance" : now.sort == "manual" ? "in your order (⇧↑↓ or drag moves one)"
            : "by " + (o.sorts.first { $0.first == now.sort }?.last ?? now.sort).lowercased() + ", " + Self.orderWords(now)
        flashMessage("Papers: " + sort + group + (arrangeable || !store.inSearch ? "" : " (in a collection, a tag or a saved search: what you type is by relevance)"))
    }

    // "newest first", "oldest first"; a title or an author: "A to Z", "Z to A".
    static func orderWords(_ a: Arrangement) -> String {
        if a.sort == "title" || a.sort == "author" { return a.order == "asc" ? "A to Z" : "Z to A" }
        return a.order == "asc" ? "oldest first" : "newest first"
    }

    // The top level's sort, kept in view.json (topSort, topOrder; defaults left out), and the papers asked for again:
    // the bridge picks the library's first ones in it.
    func setTopArrangement(_ a: Arrangement) {
        guard var prefs else { return }
        saved {
            try prefs.set("topSort", a.sort == "recent" ? nil : a.sort)
            try prefs.set("topOrder", a.order == "desc" ? nil : a.order)
            self.prefs = prefs
        }
        store.followTop = true
        rebuildSearch()
        requestSearch()
        let now = topArrangement
        let name = (topSortOptions.first { $0.first == now.sort }?.last ?? now.sort).lowercased()
        flashMessage(now.sort == "recent" ? "Papers: the recent ones" : "Papers: your library's first \(settings?.values.maxResults ?? 60) by \(name), " + Self.orderWords(now))
    }

    func writeArrangement(_ a: Arrangement, _ prefs: inout ViewPrefs) throws {
        try prefs.set("group", a.group.isEmpty ? nil : a.group)
        try prefs.set("sort", a.sort == "relevance" ? nil : a.sort)
        try prefs.set("order", a.order == "desc" ? nil : a.order)
        try prefs.set("grouping", nil)
    }
}
