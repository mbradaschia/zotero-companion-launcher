import XCTest
@testable import ZoteroLauncher

// The Lists panel (LauncherModel+Lists, phase L2) on the fake bridge: its counts from /facets, a list shown one level in
// (a status as a search of its terms, a collection as itself), Favorites in place of the badges (Tab, ⌘1…⌘9), p and
// folding kept in view.json, ⌘L's keys, its setting.
@MainActor
final class ListsPanelTests: XCTestCase {
    private var home: URL!
    private var bridge: FakeBridge!
    private var model: LauncherModel!

    override func setUp() async throws {
        home = FileManager.default.temporaryDirectory.appendingPathComponent("lists-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        bridge = FakeBridge()
        let typed = Fixture.bridge("search-typed")
        // as the bridge does: the answer names its scope, and the query comes back
        bridge.answers["/search"] = { body in
            var answer = typed
            answer["query"] = body["query"] ?? ""
            if let within = body["within"] as? [String: Any] {
                answer["scope"] = ["kind": "search", "key": within["id"] ?? "", "libraryID": 0, "title": within["title"] ?? "", "query": within["query"] ?? ""]
            }
            if let c = body["collection"] as? [String: Any] {
                answer["scope"] = ["kind": "collection", "key": c["key"] ?? "", "libraryID": c["libraryID"] ?? 1, "title": "Topics"]
            }
            return .ok(answer)
        }
        bridge.answers["/facets"] = { body in
            let field = body["field"] as? String ?? ""
            var values: [[String: Any]] = []
            switch field {
            case "status":
                values = [["value": "none", "label": "No status", "count": 4, "token": "status:none"], ["value": "reading", "label": "reading", "count": 2, "token": "status:\"reading\""]]
            case "collection":
                values = [["value": "Topics", "label": "Topics", "count": 6, "token": "c:\"Topics\"", "detail": "", "key": "AAAAAAAA", "libraryID": 1]]
            case "has":
                values = [["value": "!collection", "label": "In no collection", "count": 7, "token": "!has:collection"]]
            default:
                break
            }
            return .ok(["field": field, "query": "", "values": values, "count": values.count, "total": values.count])
        }
        model = LauncherModel(bridge: bridge, desktop: FakeDesktop(), env: ["HOME": home.path, "hostname": "mac"], runner: FakeRunner(), fetcher: FakeFetcher())
    }

    override func tearDown() async throws { try? FileManager.default.removeItem(at: home) }

    private var searchesFile: URL { home.appendingPathComponent(".config/omarchy/oma-zotero-launcher/searches.json") }

    private func writeSearches(_ list: [[String: Any]]) throws {
        try FileManager.default.createDirectory(at: searchesFile.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONSerialization.data(withJSONObject: ["searches": list]).write(to: searchesFile)
    }

    // A list in its own section (not its favorite's copy).
    private func item(_ id: String) -> ListsItem? {
        model.lists.rows.compactMap(\.item).first { $0.id == id && $0.section != "favorites" }
    }

    private func viewJSON() throws -> [String: Any] {
        let path = try XCTUnwrap(model.paths?.view)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: path))) as? [String: Any])
    }

    private func open() {
        model.listsEnabled = true
        model.willShow()
    }

    func testOffByDefaultUnderTheTestsAndNothingAsked() {
        model.willShow()
        XCTAssertFalse(model.listsEnabled)
        XCTAssertTrue(model.lists.rows.isEmpty)
        XCTAssertFalse(bridge.bodies("/facets").contains { $0["field"] as? String == "collection" })
    }

    func testItsCountsComeFromTheBridgeEveryField() throws {
        open()
        let fields = Set(bridge.bodies("/facets").compactMap { $0["field"] as? String })
        XCTAssertEqual(fields, ["status", "task", "tag", "collection", "has"])
        XCTAssertTrue(bridge.bodies("/facets").allSatisfy { $0["limit"] is NSNull || $0["limit"] == nil }) // (every tag and collection)
        XCTAssertEqual(item("status:reading")?.count, 2)
        XCTAssertEqual(item("status:none")?.count, 4)
        XCTAssertEqual(item("lib:unfiled")?.count, 7)
        XCTAssertEqual(item("col:1:AAAAAAAA")?.count, 6)
        let titles = model.lists.rows.compactMap(\.section?.title)
        XCTAssertEqual(Array(titles.prefix(3)), ["Saved searches", "Quick lists", "Reading status"]) // (no favorites yet)
        XCTAssertEqual(model.lists.problem, "")
    }

    func testAStatusShowsAsASearchOfItsTermsOneLevelInAndEscGoesBack() throws {
        open()
        model.openListItem(try XCTUnwrap(item("status:reading")))
        XCTAssertEqual(model.store.scope?.type, "search")
        XCTAssertEqual(model.store.scope?.key, "list:status:reading")
        let within = try XCTUnwrap(bridge.bodies("/search").last?["within"] as? [String: Any])
        XCTAssertEqual(within["query"] as? String, "status:\"reading\"")
        XCTAssertEqual(model.listsSelected, "status:reading")
        XCTAssertEqual(model.context?.text, "Reading status › reading") // (named for where it is, not "Saved search")
        XCTAssertEqual(model.breadcrumb.last, "Reading status › reading")
        XCTAssertFalse(model.searchRows.isEmpty) // the answer is this scope's: kept
        model.execute(.back)
        XCTAssertTrue(model.store.atRoot)
        XCTAssertEqual(model.listsSelected, "")
    }

    func testACollectionShowsAsItselfAndAgainGoesBackToAll() throws {
        open()
        let topics = try XCTUnwrap(item("col:1:AAAAAAAA"))
        model.openListItem(topics)
        XCTAssertEqual(model.store.scope?.type, "collection")
        XCTAssertEqual(model.store.scope?.key, "AAAAAAAA")
        XCTAssertEqual((bridge.bodies("/search").last?["collection"] as? [String: Any])?["key"] as? String, "AAAAAAAA")
        XCTAssertEqual(model.listsSelected, "col:1:AAAAAAAA")
        model.openListItem(topics) // the one shown, clicked again
        XCTAssertTrue(model.store.atRoot)
    }

    func testFavoritesTakeTheBadgesPlaceTabGoesThroughThem() throws {
        try writeSearches([["id": "s1", "name": "Mine", "query": "a:smith", "pinned": true]])
        open()
        XCTAssertFalse(model.badges.isEmpty) // (the badges are still made…)
        XCTAssertTrue(model.badgesShown.isEmpty) // (…but not drawn: the favorites stand for them)
        XCTAssertEqual(model.lists.favorites.map(\.base), ["search:s1"])
        XCTAssertTrue(model.keyState.pinnedSearches)
        XCTAssertEqual(model.tabHint, ["tab next favorite"])
        model.execute(.cycleSearch(1)) // Tab
        XCTAssertEqual(model.store.scope?.key, "s1")
        XCTAssertEqual((bridge.bodies("/search").last?["within"] as? [String: Any])?["query"] as? String, "a:smith")
        XCTAssertTrue(model.keyState.inFavorite)
        XCTAssertEqual(KeyRouter.route(KeyEvent(key: .tab, text: ""), model.keyState), .cycleSearch(1)) // (in a favorite: on to the next)
        model.execute(.cycleSearch(1))
        XCTAssertTrue(model.store.atRoot) // round to the top
        XCTAssertEqual(model.searchState.active, "") // (never a badge's)
    }

    func testPMakesAFavoriteKeptInViewJSONAndCmdNumberOpensIt() throws {
        open()
        model.toggleListFavorite(try XCTUnwrap(item("status:reading")))
        XCTAssertEqual(model.lists.favorites.map(\.base), ["status:reading"])
        XCTAssertEqual((try viewJSON()["lists"] as? [String: Any])?["favorites"] as? [String], ["status:reading"])
        XCTAssertTrue(model.flash.hasPrefix("In Favorites"))
        model.execute(.favorite(1))
        XCTAssertEqual(model.store.scope?.key, "list:status:reading")
        model.execute(.favorite(1)) // (⌘1 again: it stays)
        XCTAssertEqual(model.store.scope?.key, "list:status:reading")
        model.execute(.favorite(4))
        XCTAssertEqual(model.flash, "Favorites go up to ⌘1")
        model.toggleListFavorite(try XCTUnwrap(item("status:reading")))
        XCTAssertTrue(model.lists.favorites.isEmpty)
    }

    func testASavedSearchsFavoriteIsItsPin() throws {
        try writeSearches([["id": "s1", "name": "Mine", "query": "a:smith"]])
        open()
        model.toggleListFavorite(try XCTUnwrap(item("search:s1")))
        let saved = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: searchesFile)) as? [String: Any])
        XCTAssertEqual((saved["searches"] as? [[String: Any]])?.first?["pinned"] as? Bool, true)
        XCTAssertEqual(model.lists.favorites.map(\.base), ["search:s1"])
        XCTAssertEqual(model.flash, "In Favorites: Tab goes through them")
    }

    func testAFoldedSectionHidesItsListsAndStaysFolded() throws {
        open()
        let status = try XCTUnwrap(model.lists.sections.first { $0.id == "status" })
        model.toggleListsSection(status)
        XCTAssertNil(item("status:reading"))
        XCTAssertEqual(((try viewJSON()["lists"] as? [String: Any])?["folded"] as? [String: Any])?["status"] as? Bool, true)
        model.willShow() // (read again from view.json)
        XCTAssertEqual(model.lists.sections.first { $0.id == "status" }?.folded, true)
    }

    func testCmdLGivesThePanelTheKeysEnterShowsAListEscGivesThemBack() throws {
        open()
        XCTAssertFalse(model.listsFull) // the overlay starts as the rail
        model.execute(.focusLists)
        XCTAssertTrue(model.listsFull) // (opened for the keys)
        XCTAssertTrue(model.lists.focus)
        model.lists.cursor = "status:status:reading"
        XCTAssertTrue(model.handle(KeyEvent(key: .enter, text: "")))
        XCTAssertEqual(model.store.scope?.key, "list:status:reading")
        XCTAssertTrue(model.lists.focus) // (still the panel's: ↑↓ to the next list)
        XCTAssertTrue(model.handle(KeyEvent(key: .down, text: "")))
        XCTAssertNotEqual(model.lists.cursor, "status:status:reading")
        XCTAssertTrue(model.handle(KeyEvent(key: .escape, text: "")))
        XCTAssertFalse(model.lists.focus)
        XCTAssertEqual(model.store.scope?.key, "list:status:reading") // (esc only gave the keys back)
    }

    func testTheToggleFoldsToTheRailAndTheSettingTurnsItOff() throws {
        open()
        model.toggleLists()
        XCTAssertTrue(model.listsFull)
        model.toggleLists()
        XCTAssertFalse(model.listsFull)
        model.listsWidthChanged(narrow: true)
        model.toggleLists() // (narrow: opened there anyway)
        XCTAssertTrue(model.listsFull)
        model.toggleSetting("mac.listsPanel")
        XCTAssertFalse(model.listsEnabled)
        XCTAssertEqual(model.flash, "Off: the badges above the results instead")
        model.execute(.toggleLists)
        XCTAssertTrue(model.flash.hasPrefix("The Lists panel is off"))
    }
}
