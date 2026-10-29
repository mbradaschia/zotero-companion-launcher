import XCTest
@testable import ZoteroLauncher

// The results' Group, Sort and Order (R4, split in 0.4.10): each named, g the next sort, G the next grouping, and
// the older one-key grouping read, then replaced. They arrange a list you browse (a collection, a tag, a saved search);
// what you type is by relevance (0.4.17). Sort › Manual: your order per list, Shift+↑/↓ or drag and drop (0.4.17).
@MainActor
final class SortLabelTests: XCTestCase {
    private var home: URL!
    private var model: LauncherModel!

    override func setUp() async throws {
        home = FileManager.default.temporaryDirectory.appendingPathComponent("sort-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        let bridge = FakeBridge()
        let typed = Fixture.bridge("search-typed")
        // as the bridge does: a collection's answer names its scope, and the query comes back
        bridge.answers["/search"] = { body in
            var a = typed
            a["query"] = body["query"] ?? ""
            if let c = body["collection"] as? [String: Any] { a["scope"] = ["kind": "collection", "key": c["key"] ?? "", "libraryID": c["libraryID"] ?? 1, "title": "Topics"] }
            return .ok(a)
        }
        let runner = FakeRunner()
        runner.answers["tasks"] = { _, _ in FakeRunner.json(["tasks": []]) }
        model = LauncherModel(bridge: bridge, desktop: FakeDesktop(), env: ["HOME": home.path, "hostname": "mac"], runner: runner, fetcher: FakeFetcher())
        model.willShow()
    }

    override func tearDown() async throws { try? FileManager.default.removeItem(at: home) }

    private func settle() { RunLoop.main.run(until: Date().addingTimeInterval(0.2)) }

    // A collection's papers, nothing typed: a list to arrange.
    private func openACollection() throws {
        model.setFilter("work")
        settle()
        model.store.selectedIndex = try XCTUnwrap(model.searchRows.firstIndex { $0.kind == "collection" })
        model.execute(.enterActions)
        settle()
        XCTAssertNotNil(model.store.scope)
    }

    func testNothingTypedNothingSorted() {
        settle()
        XCTAssertEqual(model.sortLabel, "", "the top level's recent papers aren't sorted")
    }

    func testGroupSortAndOrderEachNamed() throws {
        try openACollection()
        XCTAssertEqual(model.sortLabel, "By relevance")
        model.setGroup("status")
        XCTAssertEqual(model.sortLabel, "Paper status · By relevance")
        model.setSort("added")
        XCTAssertEqual(model.sortLabel, "Paper status · ↓ Date added")
        model.toggleOrder()
        XCTAssertEqual(model.sortLabel, "Paper status · ↑ Date added")
        XCTAssertEqual(model.flash, "Papers: by date added, oldest first, grouped by paper status")
        model.setGroup("")
        XCTAssertEqual(model.sortLabel, "↑ Date added")
    }

    // "essuman" sorted by year put his papers below older ones that only matched a few letters (the user's, 2026-10-29).
    func testWhatYouTypeIsByRelevance() throws {
        model.setSort("year")
        model.setFilter("work")
        settle()
        XCTAssertEqual(model.sortLabel, "", "typed: by relevance, not arranged")
        XCTAssertFalse(model.arrangeable)
        model.setSort("added")
        XCTAssertEqual(model.flash, "Papers: by date added, newest first (in a collection, a tag or a saved search: what you type is by relevance)")
        try openACollection()
        XCTAssertTrue(model.arrangeable)
        XCTAssertEqual(model.sortLabel, "↓ Date added")
        model.setFilter("work")
        settle()
        XCTAssertEqual(model.sortLabel, "", "typed in a collection: by relevance too")
    }

    func testGTheNextSortShiftGTheNextGrouping() {
        model.setFilter("work")
        settle()
        model.cycleSort(1)
        XCTAssertEqual(model.arrangement.sort, "added")
        model.cycleSort(-1)
        XCTAssertEqual(model.arrangement.sort, "relevance")
        model.cycleSort(-1)
        XCTAssertEqual(model.arrangement.sort, "manual") // (it wraps)
        model.cycleGroup(1)
        XCTAssertEqual(model.arrangement.group, "status")
    }

    func testTheOlderOneKeyGroupingIsReadThenReplaced() throws {
        let url = home.appendingPathComponent(".config/omarchy/oma-zotero-launcher/view.json")
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(#"{"grouping": "year:asc"}"#.utf8).write(to: url)
        model.willShow()
        XCTAssertEqual(model.arrangement, Arrangement(group: "", sort: "year", order: "asc"))
        model.setGroup("task")
        let view = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        XCTAssertNil(view["grouping"])
        XCTAssertEqual(view["group"] as? String, "task")
        XCTAssertEqual(view["sort"] as? String, "year")
        XCTAssertEqual(view["order"] as? String, "asc")
    }

    // Sort › Manual

    private var papers: [String] { model.searchRows.filter { $0.isPaper && $0.section != "Pinned" }.map(LauncherModel.paperId) }
    private func selectPaper(_ n: Int) throws {
        let id = papers[n]
        model.store.selectedIndex = try XCTUnwrap(model.searchRows.firstIndex { $0.isPaper && LauncherModel.paperId($0) == id })
    }
    private func viewJSON() throws -> [String: Any] {
        let url = home.appendingPathComponent(".config/omarchy/oma-zotero-launcher/view.json")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    func testShiftArrowMovesAPaperAndSwitchesToManual() throws {
        try openACollection()
        let before = papers
        XCTAssertGreaterThanOrEqual(before.count, 3)
        try selectPaper(0)
        model.execute(.moveRow(1))
        XCTAssertEqual(model.arrangement.sort, "manual", "moving a paper sorted another way switches the list to Manual")
        XCTAssertEqual(Array(papers.prefix(3)), [before[1], before[0], before[2]])
        XCTAssertEqual(model.selectedSearchRow.map(LauncherModel.paperId), before[0], "the moved paper stays highlighted")
        XCTAssertEqual(model.sortLabel, "Your order")
        XCTAssertTrue(model.flash.hasPrefix("Papers: in your order"))
        let list = try XCTUnwrap(model.store.scope?.id)
        let order = try XCTUnwrap((try viewJSON()["paperOrder"] as? [String: Any])?[list] as? [String])
        XCTAssertEqual(Array(order.prefix(3)), [before[1], before[0], before[2]], "kept in view.json, from the order you saw")
        XCTAssertEqual(try viewJSON()["sort"] as? String, "manual")
        model.execute(.moveRow(-1))
        XCTAssertEqual(papers, before)
        model.execute(.moveRow(-1))
        XCTAssertEqual(papers, before, "the first paper goes no higher")
        XCTAssertEqual(model.flash, "It's the first paper")
    }

    func testOtherSortsStillWorkAndManualComesBack() throws {
        try openACollection()
        let before = papers
        try selectPaper(1)
        model.execute(.moveRow(-1))
        let mine = papers
        model.setSort("relevance")
        XCTAssertEqual(papers, before)
        model.setSort("manual")
        XCTAssertEqual(papers, mine, "your order is kept while the list is sorted another way")
    }

    func testDroppingAPaperOnAnotherTakesItsPlace() throws {
        try openACollection()
        let before = papers
        let rows = model.searchRows
        let from = try XCTUnwrap(rows.firstIndex { $0.isPaper && LauncherModel.paperId($0) == before[0] })
        let onto = try XCTUnwrap(rows.firstIndex { $0.isPaper && LauncherModel.paperId($0) == before[2] })
        XCTAssertFalse(model.dropPaper("some text from elsewhere", onto: onto))
        XCTAssertTrue(model.dropPaper(LauncherModel.paperLink(rows[from]), onto: onto))
        XCTAssertEqual(Array(papers.prefix(3)), [before[1], before[2], before[0]])
        XCTAssertEqual(model.arrangement.sort, "manual")
        XCTAssertEqual(model.selectedSearchRow.map(LauncherModel.paperId), before[0])
    }

    func testWhatYouTypeDoesNotMove() throws {
        try openACollection()
        model.setFilter("work")
        settle()
        let before = papers
        try selectPaper(0)
        model.execute(.moveRow(1))
        XCTAssertEqual(papers, before)
        XCTAssertNotEqual(model.arrangement.sort, "manual")
        XCTAssertEqual(model.flash, "What you type is by relevance: clear it, then ⇧↑↓ moves a paper")
    }
}
