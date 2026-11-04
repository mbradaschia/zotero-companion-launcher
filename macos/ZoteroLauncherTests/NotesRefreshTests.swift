import XCTest
@testable import ZoteroLauncher

// A paper's menu lists a note made while it was open: by a prompt that finished (also while you were in its
// Prompts), by a chat window's Save, or in Zotero (seen when the launcher is back in front). On the fake bridge.
@MainActor
final class NotesRefreshTests: XCTestCase {
    private var home: URL!
    private var bridge: FakeBridge!
    private var runner: FakeRunner!
    private var model: LauncherModel!
    private var item: [String: Any]!

    override func setUp() async throws {
        home = FileManager.default.temporaryDirectory.appendingPathComponent("nr-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        bridge = FakeBridge()
        let typed = Fixture.bridge("search-typed")
        item = Fixture.bridge("item")
        bridge.answers["/search"] = { _ in .ok(typed) }
        bridge.answers["/item"] = { [unowned self] _ in .ok(self.item) }
        bridge.answers["/sync/status"] = { _ in .ok(["ok": true]) }
        bridge.answers["/extract/pending"] = { _ in .ok(["total": 0, "items": []]) }
        runner = FakeRunner()
        runner.answers["list"] = { _, _ in FakeRunner.json(Fixture.synthetic("prompts")) }
        runner.answers["tasks"] = { _, _ in FakeRunner.json(["tasks": []]) }
        runner.answers["providers"] = { _, _ in FakeRunner.json(Fixture.synthetic("providers")) }
        runner.answers["models"] = { _, _ in FakeRunner.json(Fixture.synthetic("models")) }
        runner.answers["catchup-plan"] = { _, _ in FakeRunner.json([String: Any]()) }
        let file = home.appendingPathComponent(".config/omarchy/oma-zotero-launcher.json")
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("{}".utf8).write(to: file)
        model = LauncherModel(bridge: bridge, desktop: FakeDesktop(), env: ["HOME": home.path, "hostname": "mac"], runner: runner, fetcher: FakeFetcher())
        model.willShow(query: "")
        model.enterActions(try XCTUnwrap(model.searchRows.firstIndex { $0.kind == "item" }))
    }

    override func tearDown() async throws { try? FileManager.default.removeItem(at: home) }

    private var noteKeys: [String] { model.listRows.filter { $0.rowId == "note" }.map(\.noteKey) }

    // A new note, first among the paper's notes (Zotero's answer from now on).
    private func addNote(_ key: String = "NEWNOTE1") {
        var notes = item["notes"] as? [[String: Any]] ?? []
        notes.insert(["key": key, "libraryID": 1, "title": "Summary", "dateModified": "2026-11-04 12:00:00", "excerpt": "The paper's claims", "fulltext": false], at: 0)
        item["notes"] = notes
        item["noteCount"] = notes.filter { $0["fulltext"] as? Bool != true }.count
    }

    func testBackOnTheLauncherTheMenuListsANoteMadeMeanwhile() throws {
        XCTAssertFalse(noteKeys.contains("NEWNOTE1"))
        addNote()
        model.cameBack() // right after the menu read its details: not asked again
        XCTAssertFalse(noteKeys.contains("NEWNOTE1"))
        model.detailsAsked = .distantPast // (a while later)
        model.cameBack()
        XCTAssertTrue(noteKeys.contains("NEWNOTE1"))
    }

    func testTheCursorStaysOnItsRowWhenANoteComesAboveIt() throws {
        let i = try XCTUnwrap(model.listRows.firstIndex { $0.rowId == "note" })
        model.store.selectedIndex = i
        let key = model.listRows[i].noteKey
        addNote()
        model.detailsAsked = .distantPast
        model.cameBack()
        XCTAssertEqual(model.selectedListRow?.noteKey, key)
    }

    func testAChatWindowsSaveListsTheNoteOnThatPapersMenu() throws {
        let paper = try XCTUnwrap(model.actionItem)
        addNote()
        model.paperNotesChanged(PaperRef(key: "OTHER123", libraryID: 1, title: "", itemType: ""))
        XCTAssertFalse(noteKeys.contains("NEWNOTE1")) // another paper's note
        model.paperNotesChanged(paper)
        XCTAssertTrue(noteKeys.contains("NEWNOTE1"))
    }

    func testAPromptThatFinishedWhileInItsPromptsShowsItsNoteBackOnTheMenu() throws {
        let paper = try XCTUnwrap(model.actionItem)
        model.store.push("prompts")
        model.rebuildList()
        addNote()
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let file = home.appendingPathComponent(".local/state/oma-zotero/tasks/tasks.json")
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        let task: [String: Any] = ["id": "t1", "kind": "prompt", "status": "done", "title": "Summary", "promptId": "summary", "key": paper.key, "libraryID": 1,
                                   "started": iso.string(from: Date()), "finished": iso.string(from: Date().addingTimeInterval(5)), "noteKey": "NEWNOTE1"]
        try JSONSerialization.data(withJSONObject: ["tasks": [task]]).write(to: file)
        model.readTasks()
        model.back()
        XCTAssertEqual(model.store.view, "actions")
        XCTAssertTrue(noteKeys.contains("NEWNOTE1"))
    }
}
