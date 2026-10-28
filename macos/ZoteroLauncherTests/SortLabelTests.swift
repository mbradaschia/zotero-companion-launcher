import XCTest
@testable import ZoteroLauncher

// The results' Group, Sort and Order (R4, split in 0.4.10): each named, g the next sort, G the next grouping, and
// the older one-key grouping read, then replaced.
@MainActor
final class SortLabelTests: XCTestCase {
    private var home: URL!
    private var model: LauncherModel!

    override func setUp() async throws {
        home = FileManager.default.temporaryDirectory.appendingPathComponent("sort-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        let bridge = FakeBridge()
        let typed = Fixture.bridge("search-typed")
        bridge.answers["/search"] = { body in var a = typed; a["query"] = body["query"] ?? ""; return .ok(a) }
        let runner = FakeRunner()
        runner.answers["tasks"] = { _, _ in FakeRunner.json(["tasks": []]) }
        model = LauncherModel(bridge: bridge, desktop: FakeDesktop(), env: ["HOME": home.path, "hostname": "mac"], runner: runner, fetcher: FakeFetcher())
        model.willShow()
    }

    override func tearDown() async throws { try? FileManager.default.removeItem(at: home) }

    private func settle() { RunLoop.main.run(until: Date().addingTimeInterval(0.2)) }

    func testNothingTypedNothingSorted() {
        settle()
        XCTAssertEqual(model.sortLabel, "", "the top level's recent papers aren't sorted")
    }

    func testGroupSortAndOrderEachNamed() {
        model.setFilter("work")
        settle()
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

    func testGTheNextSortShiftGTheNextGrouping() {
        model.setFilter("work")
        settle()
        model.cycleSort(1)
        XCTAssertEqual(model.arrangement.sort, "added")
        model.cycleSort(-1)
        XCTAssertEqual(model.arrangement.sort, "relevance")
        model.cycleSort(-1)
        XCTAssertEqual(model.arrangement.sort, "year") // (it wraps)
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
}
