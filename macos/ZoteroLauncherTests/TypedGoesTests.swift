import XCTest
@testable import ZoteroLauncher

// A row chosen from what was typed: the typing goes. From the results, a place, a setting or a saved search empties the
// box (a paper keeps it: back, the results you chose from); in a menu, the menu's rows come back whole, on the way back
// or right there with the chosen row still highlighted.
@MainActor
final class TypedGoesTests: XCTestCase {
    private var home: URL!
    private var bridge: FakeBridge!
    private var model: LauncherModel!

    override func setUp() async throws {
        home = FileManager.default.temporaryDirectory.appendingPathComponent("typed-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        bridge = FakeBridge()
        let typed = Fixture.bridge("search-typed")
        bridge.answers["/search"] = { body in var a = typed; a["query"] = body["query"] ?? ""; return .ok(a) }
        bridge.answers["/item"] = { _ in .ok(Fixture.bridge("item")) }
        model = LauncherModel(bridge: bridge, desktop: FakeDesktop(), env: ["HOME": home.path, "hostname": "mac"], runner: FakeRunner(), fetcher: FakeFetcher())
        model.willShow()
    }
    override func tearDown() async throws { try? FileManager.default.removeItem(at: home) }

    private func select(_ test: (ListRow) -> Bool) throws {
        model.store.selectedIndex = try XCTUnwrap(model.listRows.firstIndex(where: test), "no such row in \(model.store.view)")
    }

    private var lastQuery: String { bridge.calls.last { $0.route == "/search" }?.body["query"] as? String ?? "?" }

    func testAPlaceChosenFromTheResultsEmptiesTheBox() throws {
        model.setFilter("settings")
        model.enterActions(try XCTUnwrap(model.searchRows.firstIndex { $0.kind == "settings" }))
        XCTAssertEqual(model.store.view, "settings")
        XCTAssertEqual(model.breadcrumb.first, "Results", "the crumb names the results, not what was typed")
        XCTAssertTrue(model.back())
        XCTAssertEqual(model.store.view, "search")
        XCTAssertEqual(model.store.filterText, "")
        XCTAssertEqual(lastQuery, "", "the results asked again for nothing typed")
    }

    func testASettingChosenFromTheResultsEmptiesTheBox() throws {
        model.setFilter("keys on the results")
        model.enterActions(try XCTUnwrap(model.searchRows.firstIndex { $0.kind == "setting" && $0.title == "Keys on the results" }))
        XCTAssertEqual(model.store.view, "settings-general")
        model.goHome()
        XCTAssertEqual(model.store.filterText, "")
    }

    func testAPaperKeepsWhatWasTyped() throws {
        model.setFilter("work")
        model.enterActions(try XCTUnwrap(model.searchRows.firstIndex { $0.kind == "item" }))
        XCTAssertEqual(model.store.view, "actions")
        XCTAssertTrue(model.back())
        XCTAssertEqual(model.store.filterText, "work", "back from a paper: the results you chose it from")
    }

    func testARowFoundInAMenuBringsTheWholeMenuBack() throws {
        model.setFilter("work")
        model.enterActions(try XCTUnwrap(model.searchRows.firstIndex { $0.kind == "item" }))
        model.setFilter("keys on the results")
        try select { $0.rowId == "setting-go" }
        model.activateAction(model.store.selectedIndex)
        XCTAssertNotEqual(model.store.view, "actions")
        while model.store.view != "actions" && model.back() {}
        XCTAssertEqual(model.store.view, "actions")
        XCTAssertEqual(model.store.filterText, "")
        XCTAssertFalse(model.listRows.contains { $0.rowId == "setting-go" }, "the menu's own rows, nothing typed")
        XCTAssertTrue(model.back())
        XCTAssertEqual(model.store.filterText, "work", "the results below keep theirs")
    }

    func testARowDoneInPlaceStaysHighlightedWithTheWholePage() throws {
        model.openSettings("general")
        model.setFilter("keys on the results")
        let found = model.listRows.count
        try select { $0.rowId == "set-toggle" && $0.label == "Keys on the results" }
        model.activateAction(model.store.selectedIndex)
        XCTAssertEqual(model.store.view, "settings-general")
        XCTAssertEqual(model.store.filterText, "")
        XCTAssertGreaterThan(model.listRows.count, found, "the whole page")
        XCTAssertEqual(model.selectedListRow?.label, "Keys on the results")
    }

    func testAStackedLevelForgetsWhatWasTypedThere() {
        let store = AppStore()
        store.view = "actions"
        store.filterText = "tag"
        store.selectedIndex = 3
        store.push("tags")
        store.forgetTyped(at: 0)
        XCTAssertTrue(store.back())
        XCTAssertEqual(store.view, "actions")
        XCTAssertEqual(store.filterText, "")
        XCTAssertEqual(store.selectedIndex, 0)
    }
}
