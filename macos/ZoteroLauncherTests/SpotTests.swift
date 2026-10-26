import XCTest
@testable import ZoteroLauncher

// Where you were in the launcher, kept across the app's restarts: the first opening after one comes back there.
@MainActor
final class SpotTests: XCTestCase {
    private let paper = PaperRef(key: "ABCD1234", libraryID: 1, title: "A paper", itemType: "journalArticle")
    private let reading = Scope(type: "collection", key: "COLL1234", libraryID: 1, title: "Reading")

    private func level(_ view: String, pickFor: String = "") -> ViewLevel {
        ViewLevel(view: view, filterText: "", caretBack: 0, selectedIndex: 2, followTop: true, scope: nil, pickFor: pickFor, searchFocus: false)
    }

    func testAStoreComesBackWhereItWasAndResumesThere() {
        let store = AppStore()
        store.open()
        store.scope = reading
        store.filterText = "teece"
        store.selectedIndex = 3
        store.push("actions")
        store.selectedIndex = 5
        store.followTop = false
        let spot = store.spot
        XCTAssertEqual(spot.levels.map(\.view), ["search", "actions"])

        let again = AppStore()
        again.restore(spot)
        XCTAssertTrue(again.open(), "the first opening resumes it")
        XCTAssertEqual(again.view, "actions")
        XCTAssertEqual(again.selectedIndex, 5)
        XCTAssertEqual(again.stack, store.stack)
        XCTAssertEqual(again.crumbs, store.crumbs)
        again.back()
        XCTAssertEqual(again.scope, reading)
        XCTAssertEqual(again.filterText, "teece")
        XCTAssertEqual(again.selectedIndex, 3)
    }

    func testAPageThatCantBeDrawnAgainComesBackAsTheLevelUnderIt() throws {
        let spot = LauncherModel.Spot(store: AppStore.Spot(levels: [level("search"), level("actions"), level("note")], crumbs: ["Results", "A paper"]), paper: paper)
        let kept = try XCTUnwrap(LauncherModel.kept(spot))
        XCTAssertEqual(kept.store.levels.map(\.view), ["search", "actions"])
        XCTAssertEqual(kept.store.crumbs, ["Results"])
        XCTAssertFalse(kept.store.levels[1].followTop, "the row you came from stays highlighted")
        XCTAssertEqual(kept.paper, paper)
    }

    func testThePaperIsKeptOnlyForItsViews() throws {
        let settings = LauncherModel.Spot(store: AppStore.Spot(levels: [level("search"), level("settings"), level("settings-edit")], crumbs: ["Results", "Settings"]), paper: paper)
        let kept = try XCTUnwrap(LauncherModel.kept(settings))
        XCTAssertEqual(kept.store.levels.map(\.view), ["search", "settings"])
        XCTAssertNil(kept.paper)
        let noPaper = LauncherModel.Spot(store: AppStore.Spot(levels: [level("search"), level("actions")], crumbs: ["Results"]))
        XCTAssertEqual(LauncherModel.kept(noPaper)?.store.levels.map(\.view), ["search"])
    }

    func testPickingAPaperOrABrokenSpotStartsOver() {
        XCTAssertNil(LauncherModel.kept(LauncherModel.Spot(store: AppStore.Spot(levels: [level("search", pickFor: "chat")], crumbs: []))))
        XCTAssertNil(LauncherModel.kept(LauncherModel.Spot(store: AppStore.Spot(levels: [level("note")], crumbs: []))))
        XCTAssertNil(LauncherModel.kept(LauncherModel.Spot(store: AppStore.Spot(levels: [level("search"), level("todos")], crumbs: []))))
    }

    // The app quit on a paper's menu (an update): started again, its first opening is on that menu.
    func testANewRunOpensWhereTheLastOneWas() throws {
        let home = FileManager.default.temporaryDirectory.appendingPathComponent("spot-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        let suite = "spot-tests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer {
            defaults.removePersistentDomain(forName: suite)
            try? FileManager.default.removeItem(at: home)
        }
        func model() -> LauncherModel {
            let bridge = FakeBridge()
            let typed = Fixture.bridge("search-typed")
            bridge.answers["/search"] = { body in var a = typed; a["query"] = body["query"] ?? ""; return .ok(a) }
            let m = LauncherModel(bridge: bridge, desktop: FakeDesktop(), env: ["HOME": home.path, "hostname": "mac"], runner: FakeRunner(), fetcher: FakeFetcher())
            m.keepSpot(in: defaults)
            return m
        }
        let first = model()
        first.willShow()
        first.enterActionsFor(paper)
        first.saveSpot()

        let next = model()
        next.willShow()
        XCTAssertEqual(next.store.view, "actions")
        XCTAssertEqual(next.actionItem, paper)
        XCTAssertEqual(next.store.stack.map(\.view), ["search"])

        let untouched = LauncherModel(bridge: FakeBridge(), desktop: FakeDesktop(), env: ["HOME": home.path, "hostname": "mac"], runner: FakeRunner(), fetcher: FakeFetcher())
        untouched.willShow()
        XCTAssertEqual(untouched.store.view, "search", "without keepSpot (the tests, the fixtures) it starts at the results")
    }
}
