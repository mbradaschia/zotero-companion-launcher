import Combine
import Foundation

// Where you were in the launcher, kept across the app's restarts (an update, a login, a quit): the first opening after
// one comes back there, as every later opening does, instead of starting over at the results. Only the views that can
// be drawn again from what's kept (the levels, the paper, the files' purpose); a page that needs more (a note being
// read, a setting being edited, a picker) comes back as the level under it.
extension LauncherModel {
    struct Spot: Codable, Equatable {
        var store: AppStore.Spot
        var paper: PaperRef?
        var filePurpose = "external"
    }

    static let spotKey = "ZLLauncherSpot"
    static let paperViews: Set<String> = ["actions", "notes", "files"]
    static let keptViews: Set<String> = paperViews.union(["search", "todos", "tasks", "chats", "searches", "prompts", "settings",
        "settings-general", "settings-defaults", "settings-providers", "settings-tasks", "settings-paper-status",
        "settings-taxonomies", "settings-setup", "settings-auto-prompts", "settings-rules"])

    // The levels up to the first that can't be drawn again (nil: not even the first); the paper only for its views.
    static func kept(_ spot: Spot) -> Spot? {
        let levels = spot.store.levels
        let n = levels.firstIndex { !keptViews.contains($0.view) || ($0.view == "search" && !$0.pickFor.isEmpty) || (paperViews.contains($0.view) && spot.paper == nil) } ?? levels.count
        guard n > 0, spot.store.crumbs.count == levels.count - 1 else { return nil }
        var out = spot
        out.store = AppStore.Spot(levels: Array(levels.prefix(n)), crumbs: Array(spot.store.crumbs.prefix(n - 1)))
        if n < levels.count { out.store.levels[n - 1].followTop = false } // (the row you came from stays highlighted)
        if !out.store.levels.contains(where: { paperViews.contains($0.view) }) { out.paper = nil }
        return out
    }

    var spot: Spot { Spot(store: store.spot, paper: actionItem, filePurpose: filePurpose) }

    // From now on, where you are is written down a moment after it changes (also while the launcher is open: an update
    // quits the app from it).
    func keepSpot(in defaults: UserDefaults) {
        spotDefaults = defaults
        spotSink = store.objectWillChange
            .debounce(for: .milliseconds(500), scheduler: RunLoop.main)
            .sink { [weak self] _ in MainActor.assumeIsolated { self?.saveSpot() } }
    }

    func saveSpot() {
        guard let defaults = spotDefaults, let data = try? JSONEncoder().encode(spot) else { return }
        defaults.set(data, forKey: Self.spotKey)
    }

    // The first opening: back where the last run left it. → whether there was somewhere to go back to.
    @discardableResult
    func restoreSpot() -> Bool {
        guard let data = spotDefaults?.data(forKey: Self.spotKey), let saved = try? JSONDecoder().decode(Spot.self, from: data),
              let spot = Self.kept(saved) else { return false }
        if let paper = spot.paper { actionItem = paper }
        filePurpose = spot.filePurpose
        store.restore(spot.store)
        return true
    }
}
