import XCTest
@testable import ZoteroLauncher

// The breadcrumb above the search box: each level by name, where you came from first; hidden at the top level.
@MainActor
final class BreadcrumbTests: XCTestCase {
    private var home: URL!
    private var model: LauncherModel!

    override func setUp() async throws {
        home = FileManager.default.temporaryDirectory.appendingPathComponent("crumb-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        let bridge = FakeBridge()
        let typed = Fixture.bridge("search-typed"), item = Fixture.bridge("item")
        bridge.answers["/search"] = { body in var a = typed; a["query"] = body["query"] ?? ""; return .ok(a) }
        bridge.answers["/item"] = { _ in .ok(item) }
        bridge.answers["/tags/list"] = { _ in .ok(Fixture.bridge("tags-list")) }
        let runner = FakeRunner()
        runner.answers["tasks"] = { _, _ in FakeRunner.json(["tasks": []]) }
        let chats: [[String: Any]] = [["id": "2026-10-12T08-00-00-000Z-abc123", "title": "Its argument", "created": "2026-10-12", "updated": "2026-10-12T08:05:00Z",
                                       "turns": 2, "model": "", "key": "P3NM4G92", "libraryID": 1, "paper": "Doe (2016)"]]
        runner.answers["chats"] = { _, _ in FakeRunner.json(["chats": chats]) }
        model = LauncherModel(bridge: bridge, desktop: FakeDesktop(), env: ["HOME": home.path, "hostname": "mac"], runner: runner, fetcher: FakeFetcher())
        model.willShow()
        settle()
    }

    override func tearDown() async throws { try? FileManager.default.removeItem(at: home) }

    private func settle() { RunLoop.main.run(until: Date().addingTimeInterval(0.15)) }

    func testHiddenAtTheTopLevel() {
        XCTAssertEqual(model.breadcrumb, [])
    }

    func testAPapersMenuAndItsTags() throws {
        model.setFilter("work")
        settle()
        model.enterActions(try XCTUnwrap(model.searchRows.firstIndex { $0.kind == "item" }))
        settle()
        let crumbs = model.breadcrumb
        XCTAssertEqual(crumbs.count, 2)
        XCTAssertEqual(crumbs.first, "“work”")
        XCTAssertEqual(crumbs.last, model.paperLabel, "the paper you're on, in full")
        model.enterTags()
        settle()
        let cite = String(model.paperLabel.split(separator: "·").first ?? "").trimmingCharacters(in: .whitespaces)
        XCTAssertEqual(model.breadcrumb, ["“work”", cite, "Tags"], "a paper left behind: by its authors and year")
        model.back()
        XCTAssertEqual(model.breadcrumb, crumbs)
    }

    func testWhatWasTypedAndACollection() throws {
        model.setFilter("work")
        settle()
        let (index, row) = try XCTUnwrap(model.searchRows.enumerated().first { $0.element.kind == "collection" })
        model.enterActions(index)
        settle()
        XCTAssertEqual(model.breadcrumb, ["“work”", row.title])
    }

    func testSettingsPagesByTheirOwnName() {
        model.openSettings("general")
        XCTAssertEqual(model.breadcrumb, ["Results", "Settings", "General"])
        model.goHome()
        model.openPlace("tasks")
        XCTAssertEqual(model.breadcrumb, ["Results", "Processes"])
    }

    func testALongPathKeepsItsEnds() {
        XCTAssertEqual(Breadcrumb.fit(["a", "b", "c", "d", "e", "f"], max: 4), ["a", "…", "e", "f"])
        XCTAssertEqual(Breadcrumb.fit(["a", "b", "c"], max: 4), ["a", "b", "c"])
    }

    func testClickingACrumbGoesBackThere() {
        model.openSettings("general")
        XCTAssertEqual(model.store.stack.count, 2)
        model.jumpToCrumb(1) // "Settings"
        XCTAssertEqual(model.store.view, "settings")
        model.jumpToCrumb(0) // "Results"
        XCTAssertTrue(model.store.atRoot)
        XCTAssertEqual(model.breadcrumb, [])
    }

    func testATagsMenuIsNamedByTheTag() throws {
        model.setFilter("work")
        settle()
        model.enterActions(try XCTUnwrap(model.searchRows.firstIndex { $0.kind == "item" }))
        settle()
        model.enterTags()
        settle()
        let tag = try XCTUnwrap(model.listRows.first { $0.rowId == "tag" }).tag
        model.openTagMenu(tag)
        XCTAssertEqual(model.breadcrumb.last, "#" + tag)
    }

    func testPickingAPaperSaysWhatFor() {
        model.store.push("search")
        model.store.pickFor = "chat"
        XCTAssertEqual(model.breadcrumb.last, "New chat: pick a paper")
        model.store.pickFor = "todo"
        XCTAssertEqual(model.breadcrumb.last, "Pick the task's paper")
    }

    // From Chats there's no paper's menu below: the chat's crumb names its paper first.
    func testAChatsMenuFromChatsNamesItsPaper() throws {
        model.openPlace("chats")
        settle()
        model.store.selectedIndex = try XCTUnwrap(model.listRows.firstIndex { $0.rowId == "chat-open" })
        model.execute(.alternate)
        XCTAssertEqual(model.store.view, "chat-menu")
        XCTAssertEqual(model.breadcrumb.last, "Doe (2016) · Its argument")
    }

    // The reader's crumb is the note's title: the line under it doesn't say it again.
    func testTheReadersPlaceholderDoesntRepeatTheCrumb() throws {
        model.setFilter("work")
        settle()
        model.enterActions(try XCTUnwrap(model.searchRows.firstIndex { $0.kind == "item" }))
        settle()
        guard let i = model.listRows.firstIndex(where: { $0.rowId == "note" }) else { throw XCTSkip("the item fixture has no notes") }
        model.activateAction(i)
        settle()
        XCTAssertTrue(model.store.inNote)
        XCTAssertEqual(model.headerPlaceholder(), "") // (no search box in the reader: its header has the path and the heading)
        // the path ends on the paper (its cite), a level to go back to; the note is the heading, not a crumb
        let path = model.notePath
        XCTAssertEqual(path.tail.first?.level, 1)
        XCTAssertFalse(path.tail.contains { $0.name == model.breadcrumb.last })
        XCTAssertFalse(model.noteHeading.isEmpty)
    }

    // The reader's heading: the note's own title, without the paper the runner's titles repeat after it.
    func testTheNoteHeadingDropsThePaper() {
        XCTAssertEqual(NoteHeading.strip(title: "Concepts and Definitions v1: Doe et al., 2020 · Allostasis and work", cite: "Doe et al., 2020", paperTitle: "Allostasis and work"), "Concepts and Definitions v1")
        XCTAssertEqual(NoteHeading.strip(title: "Full text: Allostasis and organizational excellence", cite: "Doe et al., 2020", paperTitle: "Allostasis and organizational excellence"), "Full text")
        XCTAssertEqual(NoteHeading.strip(title: "Re: methods", cite: "Doe et al., 2020", paperTitle: "Allostasis and work"), "Re: methods")
        XCTAssertEqual(NoteHeading.strip(title: "My reading notes", cite: "Doe et al., 2020", paperTitle: ""), "My reading notes")
        XCTAssertEqual(NoteHeading.strip(title: "Summary: doe ET AL., 2020", cite: "Doe et al., 2020", paperTitle: ""), "Summary")
        // another cite shape (the note window's), the paper's title after it
        XCTAssertEqual(NoteHeading.strip(title: "Key ideas v2: Doe et al., 2020 · Allostasis and work", cite: "Doe et al. (2020)", paperTitle: "Allostasis and work"), "Key ideas v2")
    }

    // The reader's path: the first level, the levels between in a menu, the paper and what's under it (not the note).
    func testTheNotePath() {
        let fromMenu = NotePath.make(crumbs: ["#fatigue", "“work”", "Doe et al., 2020", "Notes", "Concepts v1"], views: ["search", "search", "actions", "notes"],
                                     loosePaper: "Doe et al., 2020", paperTitle: "Allostasis and work")
        XCTAssertEqual(fromMenu.first, NotePath.Crumb(name: "#fatigue", level: 0))
        XCTAssertEqual(fromMenu.hidden, [NotePath.Crumb(name: "“work”", level: 1)])
        XCTAssertEqual(fromMenu.tail, [NotePath.Crumb(name: "Doe et al., 2020", level: 2), NotePath.Crumb(name: "Notes", level: 3)])
        XCTAssertEqual(fromMenu.paperTitle, "Allostasis and work")
        // opened from the results: the paper isn't a level, so it closes the path without a way back
        let fromResults = NotePath.make(crumbs: ["“work”", "Doe et al., 2020 · Concepts v1"], views: ["search"], loosePaper: "Doe et al., 2020", paperTitle: "Allostasis")
        XCTAssertNil(fromResults.first)
        XCTAssertEqual(fromResults.tail, [NotePath.Crumb(name: "“work”", level: 0), NotePath.Crumb(name: "Doe et al., 2020", level: nil)])
        // a note on no paper, from the top: the results only
        let loose = NotePath.make(crumbs: ["Results", "A note"], views: ["search"], loosePaper: nil, paperTitle: "")
        XCTAssertEqual(loose.tail, [NotePath.Crumb(name: "Results", level: 0)])
        XCTAssertEqual(loose.paperTitle, "")
        XCTAssertEqual(NotePath.short("abcdefghij", max: 5), "abcd…")
    }

    // A paper's menu: the paper is the heading, where it was published under it; under the paper (its tags) a plain path.
    func testAPapersMenuNamesItsVenue() throws {
        XCTAssertNil(model.paperVenue)
        model.setFilter("work")
        settle()
        model.enterActions(try XCTUnwrap(model.searchRows.firstIndex { $0.kind == "item" }))
        settle()
        let published = (Fixture.bridge("item")["paper"] as? [String: Any])?["publication"] as? String ?? ""
        XCTAssertEqual(model.paperVenue, published.trimmingCharacters(in: .whitespaces))
        XCTAssertFalse(model.paperVenue?.isEmpty ?? true)
        model.enterTags()
        settle()
        XCTAssertNil(model.paperVenue)
    }
}
