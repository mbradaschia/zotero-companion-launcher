import Foundation

// Where you are in the launcher: the view, what is typed, the selected row, and the levels you
// came through, as ZoteroSearch.qml keeps them. Its functions are the QML's, in its order: push
// (pushView), back, goHome, open and resume. Building the rows and asking the bridge stay with the
// callers: the store says what to show, not how.
@MainActor
final class AppStore: ObservableObject {
    @Published var view = "search"
    @Published var filterText = ""
    @Published var caretBack = 0
    @Published var queryLive = false // the word at the caret is being typed: not a finished block yet
    @Published var selectedIndex = 0 { didSet { selectionChanged() } }
    @Published var followTop = true // the selection stays on the top row as rows arrive
    @Published var scope: Scope?
    @Published var pickFor = ""
    @Published var searchFocus = true // the search box has the keys (else the list)
    @Published private(set) var stack: [ViewLevel] = []
    // The breadcrumb: each level's name, taken as you leave it (crumbName, the model's), one per stack level.
    @Published private(set) var crumbs: [String] = []
    var crumbName: (() -> String)?
    // The last move between levels: in (a push) or back, for the list's slide (from the right, or from the left).
    private(set) var movedIn = true
    private(set) var leftView = "" // the view that move left (the reader and the calendar don't slide)
    var keys = KeyBuffer() // a single key waiting to be told from typing; cleared with each view
    var levelChanged: () -> Void = {} // a level pushed or popped (the model clears its last error, as pushView and back do)
    var selectionChanged: () -> Void = {} // another row selected (or the same one again; the model previews a theme)
    var entered: (String) -> Void = { _ in } // a view pushed (the usage log counts it)

    // The keys start in the search box (the keysStart setting), not the list.
    var searchFirst: Bool
    private var hasState = false // opened before: reopening resumes

    init(searchFirst: Bool = false) {
        self.searchFirst = searchFirst
    }

    var inSearch: Bool { view == "search" }
    var inNote: Bool { view == "note" }
    var inSettings: Bool { view.hasPrefix("settings") }
    var atRoot: Bool { inSearch && scope == nil && pickFor.isEmpty }
    var textEntry: Bool { ViewKind.textEntry.contains(view) }
    var typingView: Bool { ViewKind.typing.contains(view) }

    // Into `next`, keeping this level to come back to (ZoteroSearch.qml:759-772).
    func push(_ next: String) {
        crumbs.append(crumbName?() ?? view)
        movedIn = true
        leftView = view
        stack.append(ViewLevel(view: view, filterText: filterText, caretBack: caretBack, selectedIndex: selectedIndex,
                               followTop: followTop, scope: scope, pickFor: pickFor, searchFocus: searchFocus))
        caretBack = 0
        queryLive = false
        keys.clear()
        levelChanged()
        view = next
        searchFocus = searchFirst || typingView
        filterText = ""
        selectedIndex = 0
        followTop = true
        entered(next)
    }

    // Back one level, restoring its query, caret, scope and row; false at the root
    // (ZoteroSearch.qml:775-827). `rebuild` builds that level's rows (followTop is off meanwhile,
    // so the row you were on stays) and says how many; the row is kept within them.
    @discardableResult
    func back(rebuild: () -> Int = { .max }) -> Bool {
        guard let saved = stack.popLast() else { return false }
        if !crumbs.isEmpty { crumbs.removeLast() }
        movedIn = false
        leftView = view
        keys.clear()
        queryLive = false
        levelChanged()
        scope = saved.scope
        pickFor = saved.pickFor
        view = saved.view
        // Back with something typed: the keys where they were. With nothing typed: the list has
        // them, but on a page for typing; keys starting in the box keep it, except in the results.
        if !saved.filterText.isEmpty { searchFocus = saved.searchFocus }
        else if searchFirst { searchFocus = atRoot ? false : saved.searchFocus }
        else { searchFocus = typingView }
        filterText = saved.filterText
        caretBack = saved.caretBack
        followTop = false
        selectedIndex = saved.selectedIndex
        let count = rebuild()
        selectedIndex = max(0, min(count - 1, saved.selectedIndex))
        followTop = saved.followTop
        return true
    }

    // The level `depth` down the stack as if left with nothing typed (a row chosen from what was typed there): back
    // there, all its rows, the cursor at the top.
    func forgetTyped(at depth: Int) {
        guard stack.indices.contains(depth) else { return }
        stack[depth].filterText = ""
        stack[depth].caretBack = 0
        stack[depth].selectedIndex = 0
        stack[depth].followTop = true
    }

    // Back out to the results (ZoteroSearch.qml:855).
    func goHome() {
        while !atRoot && back() {}
    }

    // The launcher shown (ZoteroSearch.qml:262-325). With nothing asked (the hotkey), after the
    // first time: back where you left it. A query asked for starts over at the results.
    // → whether it resumed.
    @discardableResult
    func open(query: String? = nil) -> Bool {
        keys.clear()
        if query == nil && hasState {
            resume()
            return true
        }
        hasState = true
        view = "search"
        stack = []
        crumbs = []
        scope = nil
        pickFor = ""
        filterText = query ?? ""
        caretBack = 0
        queryLive = false
        selectedIndex = 0
        followTop = true
        searchFocus = true
        // Nothing typed: the list has the keys; a query asked for keeps the search box.
        if filterText.isEmpty { searchFocus = searchFirst || typingView }
        return false
    }

    // Reopened (ZoteroSearch.qml:371-408): the same view, levels, query, scope and row.
    private func resume() {
        if filterText.isEmpty && (!searchFirst || atRoot) { searchFocus = searchFirst ? false : typingView }
        followTop = false // the row you were on stays selected as the list refreshes
    }

    // Where you are, kept across the app's restarts (an update, a login): every level, this one last, and the
    // breadcrumb's names (one per level below this one).
    struct Spot: Codable, Equatable {
        var levels: [ViewLevel]
        var crumbs: [String]
    }

    var spot: Spot {
        Spot(levels: stack + [ViewLevel(view: view, filterText: filterText, caretBack: caretBack, selectedIndex: selectedIndex,
                                        followTop: followTop, scope: scope, pickFor: pickFor, searchFocus: searchFocus)],
             crumbs: crumbs)
    }

    // Back where a spot says, as if the launcher had been open there: the next open resumes it.
    func restore(_ spot: Spot) {
        guard let here = spot.levels.last, spot.crumbs.count == spot.levels.count - 1 else { return }
        stack = Array(spot.levels.dropLast())
        crumbs = spot.crumbs
        view = here.view
        filterText = here.filterText
        caretBack = here.caretBack
        selectedIndex = here.selectedIndex
        followTop = here.followTop
        scope = here.scope
        pickFor = here.pickFor
        searchFocus = here.searchFocus
        queryLive = false
        keys.clear()
        hasState = true
    }
}
