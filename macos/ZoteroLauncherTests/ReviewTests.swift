import CryptoKit
import XCTest
@testable import ZoteroLauncher

// Phases 11a and 11b: the review tables' files (ReviewFiles), the grid page as the app builds it, ⌘T in the launcher and a
// review window's messages, on the fake bridge.
@MainActor
final class ReviewTests: XCTestCase {
    private var home: URL!
    private var bridge: FakeBridge!
    private var model: LauncherModel!
    private var runner: FakeRunner!

    override func setUp() async throws {
        home = FileManager.default.temporaryDirectory.appendingPathComponent("11a-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        bridge = FakeBridge()
        let typed = Fixture.bridge("search-typed")
        bridge.answers["/search"] = { body in var a = typed; a["query"] = body["query"] ?? ""; return .ok(a) }
        bridge.answers["/sync/status"] = { _ in .ok(["ok": true, "configured": true, "running": false]) }
        runner = FakeRunner()
        model = LauncherModel(bridge: bridge, desktop: FakeDesktop(), env: ["HOME": home.path, "hostname": "mac"], runner: runner, fetcher: FakeFetcher())
    }

    override func tearDown() async throws { try? FileManager.default.removeItem(at: home) }

    private var reviewsDir: URL { home.appendingPathComponent(".config/omarchy/oma-zotero-launcher/reviews") }

    private func files(readOnly: Bool = false) -> ReviewFiles { ReviewFiles(dir: reviewsDir, readOnly: readOnly) }

    private func core() throws -> JSCore { try XCTUnwrap(model.core) }

    private func newReview(_ source: [String: Any] = ["type": "query", "query": "capabilities"]) throws -> [String: Any] {
        let json = try core().glueJSON("reviewNew", [source, [String: Any](), "2026-10-27T10:00:00Z"])
        return try XCTUnwrap(ReviewFiles.object(json))
    }

    // ---- the files

    func testAReviewWrittenReadsBackWholeNewestFirst() throws {
        let f = files()
        let first = try newReview()
        try f.writeReview(first, try core(), now: Date(timeIntervalSince1970: 1_800_000_000))
        var second = try newReview(["type": "tag", "title": "to-read"])
        second["name"] = "Second"
        try f.writeReview(second, try core(), now: Date(timeIntervalSince1970: 1_800_000_100))
        let id = try XCTUnwrap(first["id"] as? String)
        XCTAssertTrue(ReviewFiles.validReview(id))
        let back = try XCTUnwrap(f.review(id, try core()))
        XCTAssertEqual(back["name"] as? String, "“capabilities”")
        XCTAssertEqual((back["columns"] as? [[String: Any]])?.first?["id"] as? String, "title")
        XCTAssertEqual(f.list(try core()).map { $0["name"] as? String }, ["Second", "“capabilities”"])
    }

    func testReadOnlyRefusedADamagedFileKeptABadIdRefused() throws {
        let review = try newReview()
        XCTAssertThrowsError(try files(readOnly: true).writeReview(review, try core())) { XCTAssertEqual($0 as? ReviewFiles.WriteError, .readOnly) }
        let id = try XCTUnwrap(review["id"] as? String)
        try FileManager.default.createDirectory(at: reviewsDir, withIntermediateDirectories: true)
        try Data("{ half a fi".utf8).write(to: files().reviewURL(id))
        XCTAssertThrowsError(try files().writeReview(review, try core())) { XCTAssertEqual($0 as? ReviewFiles.WriteError, .damaged(files().reviewURL(id).path)) }
        XCTAssertEqual(try String(contentsOf: files().reviewURL(id), encoding: .utf8), "{ half a fi") // not written over
        var bad = review
        bad["id"] = "../elsewhere"
        XCTAssertThrowsError(try files().writeReview(bad, try core())) { XCTAssertEqual($0 as? ReviewFiles.WriteError, .badId) }
        XCTAssertNil(files().review("../elsewhere", try core()))
    }

    func testAColumnOfYourOwnAndItsCellsByPaper() throws {
        let f = files()
        let column: [String: Any] = ["id": "c-abcdefghij", "label": "Method", "kind": "own", "type": "choice", "options": ["case study", "survey"]]
        try f.writeColumn(column, try core())
        let defs = f.columns(try core())
        XCTAssertEqual(defs["c-abcdefghij"]?["label"] as? String, "Method")
        XCTAssertEqual(defs["c-abcdefghij"]?["options"] as? [String], ["case study", "survey"])
        try f.setCell(column: "c-abcdefghij", paper: "1:P3NM4G92", value: "survey", by: "mac", try core())
        try f.setCell(column: "c-abcdefghij", paper: "1:AAAA0001", value: "case study", by: "mac", try core())
        try f.setCell(column: "c-abcdefghij", paper: "1:AAAA0001", value: "", by: "mac", try core()) // emptied, kept with its date
        let cells = try XCTUnwrap(f.cells(["c-abcdefghij"], try core())["c-abcdefghij"] as? [String: Any])
        XCTAssertEqual((cells["1:P3NM4G92"] as? [String: Any])?["v"] as? String, "survey")
        XCTAssertEqual((cells["1:AAAA0001"] as? [String: Any])?["v"] as? String, "")
        XCTAssertNotNil((cells["1:AAAA0001"] as? [String: Any])?["updated"])
        XCTAssertThrowsError(try f.setCell(column: "c-../x", paper: "1:A", value: "v", by: "mac", try core())) { XCTAssertEqual($0 as? ReviewFiles.WriteError, .badId) }
    }

    // Several of a list (your column): the file keeps its type and choices, a cell its list of labels; a message's
    // list is saved as one.
    func testSeveralOfAListKeepsEachPapersLabels() throws {
        let f = files()
        try f.writeColumn(["id": "c-00000multi", "label": "Themes", "kind": "own", "type": "multi", "options": ["trust", "power"]], try core())
        XCTAssertEqual(f.columns(try core())["c-00000multi"]?["type"] as? String, "multi")
        try f.setCell(column: "c-00000multi", paper: "1:P3NM4G92", value: ["trust", "power"], by: "mac", try core())
        var cells = try XCTUnwrap(f.cells(["c-00000multi"], try core())["c-00000multi"] as? [String: Any])
        XCTAssertEqual((cells["1:P3NM4G92"] as? [String: Any])?["v"] as? [String], ["trust", "power"])
        let (window, _) = try openWindow()
        window.handle(["type": "cell", "column": "c-00000multi", "paper": "1:AAAA0001", "value": ["power"]])
        cells = try XCTUnwrap(model.reviewFiles?.cells(["c-00000multi"], try core())["c-00000multi"] as? [String: Any])
        XCTAssertEqual((cells["1:AAAA0001"] as? [String: Any])?["v"] as? [String], ["power"])
    }

    // ---- the page

    func testThePageRunsOnlyItsOwnScriptByItsHash() {
        let script = "var RT = 1"
        let page = ReviewWebView.page(css: "body{}", script: script)
        let hash = Data(SHA256.hash(data: Data(script.utf8))).base64EncodedString()
        XCTAssertTrue(page.contains("script-src 'sha256-\(hash)'"), page)
        XCTAssertTrue(page.contains("default-src 'none'"))
        XCTAssertFalse(page.contains("unsafe-eval"))
        XCTAssertTrue(ReviewWebView.shell.contains("ReviewCore") && ReviewWebView.shell.contains("RT.ready"), "the bundled grid isn't in the page")
    }

    // ---- ⌘T

    func testCommandTOpensTheResultsAsAReviewInItsWindow() throws {
        var opened: [String] = []
        model.openReviewWindow = { opened.append($0) }
        model.willShow(query: "dynamic capabilities")
        model.execute(.openReview)
        let id = try XCTUnwrap(opened.first)
        let review = try XCTUnwrap(model.reviewFiles?.review(id, try core()))
        XCTAssertEqual((review["source"] as? [String: Any])?["query"] as? String, "dynamic capabilities")
        XCTAssertEqual(model.flash, "Opened “\(review["name"] as? String ?? "")” as a review table (in its own window)")
        XCTAssertEqual(model.reviewList().count, 1)
    }

    func testCommandTOnTheSameListReopensItsReviewAsYouLeftIt() throws {
        var opened: [String] = []
        model.openReviewWindow = { opened.append($0) }
        model.willShow(query: "dynamic capabilities")
        model.execute(.openReview)
        let id = try XCTUnwrap(opened.first)
        let window = ReviewWindowModel(id: id, launcher: model)
        window.handle(["type": "layout", "review": ["columns": [["id": "title", "width": 420], ["id": "year"]]]])
        model.willShow(query: "dynamic  capabilities ") // (the same query, spaced otherwise)
        model.execute(.openReview)
        XCTAssertEqual(opened, [id, id])
        XCTAssertEqual(model.reviewList().count, 1)
        XCTAssertTrue(model.flash.hasSuffix("this list's review table, as you left it"), model.flash)
        let saved = try XCTUnwrap(model.reviewFiles?.review(id, try core()))
        XCTAssertEqual((saved["columns"] as? [[String: Any]])?.first?["width"] as? Int, 420)
        model.willShow(query: "absorptive capacity") // another list: a review of its own
        model.execute(.openReview)
        XCTAssertEqual(opened.count, 3)
        XCTAssertNotEqual(opened[2], id)
        XCTAssertEqual(model.reviewList().count, 2)
    }

    func testCommandTIsHintedInTheResultsWhereverTheKeysAre() throws {
        model.willShow(query: "dynamic capabilities")
        model.store.searchFocus = true
        XCTAssertTrue(model.hintsFor().contains("⌘T table"), "\(model.hintsFor())")
        model.store.searchFocus = false // the list has the keys, on a paper
        model.store.selectedIndex = try XCTUnwrap(model.searchRows.firstIndex { $0.kind == "item" })
        XCTAssertTrue(model.hintsFor().contains("⌘T table"), "\(model.hintsFor())")
        XCTAssertLessThan(try XCTUnwrap(model.hintsFor().firstIndex(of: "⌘T table")), 6) // early: a narrow footer keeps it
    }

    func testCommandTWithNothingTypedSaysWhatItNeeds() {
        var opened: [String] = []
        model.openReviewWindow = { opened.append($0) }
        model.willShow()
        model.execute(.openReview)
        XCTAssertTrue(opened.isEmpty)
        XCTAssertEqual(model.flash, "Type a query, or open a collection, a tag or a saved search: ⌘T opens its papers as a review table")
    }

    // ---- a review window

    @MainActor
    private final class FakePage: ReviewPage {
        var loads: [[String: Any]] = []
        var flashes: [String] = []
        var segments: [(text: String, list: [Any])] = []
        func load(_ data: [String: Any]) { loads.append(data) }
        func flash(_ text: String) { flashes.append(text) }
        func segments(_ text: String, _ list: [Any]) { segments.append((text, list)) }
        var drafts: [[String: Any]] = []
        var zooms: [Double] = []
        func drafted(_ out: [String: Any]) { drafts.append(out) }
        func zoom(_ z: Double) { zooms.append(z) }
        var notes: [(paper: String, out: [String: Any])] = []
        func notes(_ paper: String, _ out: [String: Any]) { notes.append((paper, out)) }
    }

    private func openWindow() throws -> (ReviewWindowModel, FakePage) {
        var opened: [String] = []
        model.openReviewWindow = { opened.append($0) }
        model.willShow(query: "dynamic capabilities")
        model.execute(.openReview)
        let window = ReviewWindowModel(id: try XCTUnwrap(opened.first), launcher: model)
        let page = FakePage()
        window.page = page
        window.handle(["type": "ready"])
        return (window, page)
    }

    func testReadyLoadsThePapersTheSourceFinds() throws {
        let (window, page) = try openWindow()
        let data = try XCTUnwrap(page.loads.last)
        XCTAssertEqual((data["results"] as? [[String: Any]])?.count, 20)
        XCTAssertEqual(data["loading"] as? Bool, false)
        XCTAssertEqual(data["readOnly"] as? Bool, false)
        XCTAssertEqual((data["review"] as? [String: Any])?["id"] as? String, window.id)
        XCTAssertEqual(bridge.bodies("/search").last?["limit"] as? Int, ReviewWindowModel.maxPapers)
        XCTAssertEqual(bridge.bodies("/search").last?["query"] as? String, "dynamic capabilities")
    }

    func testLayoutRenameAndAValueAreSaved() throws {
        let (window, _) = try openWindow()
        window.handle(["type": "layout", "review": ["lines": 1, "panel": false]])
        window.handle(["type": "rename", "name": "Capabilities, the review"])
        let saved = try XCTUnwrap(model.reviewFiles?.review(window.id, try core()))
        XCTAssertEqual(saved["lines"] as? Int, 1)
        XCTAssertEqual(saved["panel"] as? Bool, false)
        XCTAssertEqual(window.title, "Capabilities, the review")

        window.handle(["type": "addColumn", "column": ["id": "c-0123456789", "label": "Notes", "kind": "own", "type": "text"]])
        window.handle(["type": "cell", "column": "c-0123456789", "paper": "1:P3NM4G92", "value": "a first look"])
        let cells = model.reviewFiles?.cells(["c-0123456789"], try core())["c-0123456789"] as? [String: Any]
        XCTAssertEqual((cells?["1:P3NM4G92"] as? [String: Any])?["v"] as? String, "a first look")
        XCTAssertEqual((cells?["1:P3NM4G92"] as? [String: Any])?["by"] as? String, "mac")
    }

    func testAStatusIsTheLaunchersPendingChange() throws {
        let (window, page) = try openWindow()
        window.handle(["type": "status", "paper": ["key": "P3NM4G92", "libraryID": 1], "from": "", "to": "s/reading"])
        XCTAssertEqual(model.marks.statusShown["1:P3NM4G92"], "s/reading")
        XCTAssertEqual(model.marks.statusPending["1:P3NM4G92"]?.to, "s/reading")
        window.send()
        let row = (page.loads.last?["results"] as? [[String: Any]])?.first { $0["key"] as? String == "P3NM4G92" }
        XCTAssertEqual(row?["status"] as? String, "s/reading") // shown before it's saved
    }

    // A paper's letters, as the launcher's: i r copy its citation or bibliography entry (said in the table), o and n open
    // the launcher on its menu, at its PDF or its notes.
    func testAPapersLettersActAsInTheLauncher() throws {
        bridge.answers["/cite"] = { _ in .ok(["ok": true, "entries": [["text": "Teece, D. J. (2007).\nExplicating."]]]) }
        let (window, page) = try openWindow()
        let paper: [String: Any] = ["key": "P3NM4G92", "libraryID": 1, "title": "Explicating dynamic capabilities", "itemType": "journalArticle"]
        window.handle(["type": "paper", "what": "citation", "paper": paper])
        XCTAssertEqual(bridge.bodies("/cite").last?["mode"] as? String, "citation")
        XCTAssertEqual(bridge.bodies("/cite").last?["keys"] as? [String], ["P3NM4G92"])
        XCTAssertEqual((model.desktop as? FakeDesktop)?.copied.last, "Teece, D. J. (2007).\nExplicating.")
        XCTAssertEqual(page.flashes.last, "Copied: Teece, D. J. (2007). Explicating.")
        window.handle(["type": "paper", "what": "bibliography", "paper": paper])
        XCTAssertEqual(bridge.bodies("/cite").last?["mode"] as? String, "bibliography")
        var shown = 0
        model.showLauncher = { shown += 1 }
        window.handle(["type": "paper", "what": "notes", "paper": paper])
        XCTAssertEqual(shown, 1, "the launcher in front")
        XCTAssertEqual(model.actionItem?.key, "P3NM4G92", "on the paper's menu")
        window.handle(["type": "paper", "what": "external", "paper": ["key": "", "libraryID": 1]])
        XCTAssertEqual(shown, 1, "no paper, nothing")
    }

    // The panel's notes: the paper's own (not its extracted text), asked of the bridge; a click opens one in its window.
    func testThePanelListsThePapersNotesAndAClickOpensOneInItsWindow() throws {
        bridge.answers["/item"] = { _ in .ok(Fixture.bridge("item")) }
        let (window, page) = try openWindow()
        window.handle(["type": "notes", "paper": ["key": "P3NM4G92", "libraryID": 1]])
        XCTAssertEqual(bridge.bodies("/item").last?["key"] as? String, "P3NM4G92")
        let got = try XCTUnwrap(page.notes.last)
        XCTAssertEqual(got.paper, "1:P3NM4G92")
        XCTAssertEqual((got.out["notes"] as? [[String: Any]])?.compactMap { $0["key"] as? String }, ["JJ8XY5CM", "95IYVEX3", "SVSWPE6S"], "the extracted text isn't one")
        bridge.answers["/item"] = { _ in .zoteroDown }
        window.handle(["type": "notes", "paper": ["key": "P3NM4G92", "libraryID": 1]])
        XCTAssertNotNil(page.notes.last?.out["error"] as? String, "or why not")
        var opened: [[String: Any]] = []
        model.openWindow = { opened.append($0) }
        window.handle(["type": "note", "note": ["key": "JJ8XY5CM", "libraryID": 1, "title": ""]])
        XCTAssertEqual(opened.first?["key"] as? String, "JJ8XY5CM")
        XCTAssertEqual(opened.first?["title"] as? String, "Untitled note")
        window.handle(["type": "note", "note": ["key": ""]])
        XCTAssertEqual(opened.count, 1, "no note, nothing")
    }

    // Delete this table… (asked in the page): the file to the Trash, the window closed, gone from the list; refused for a
    // bad id or while the sync folder is away.
    func testDeletingATableTrashesItsFileAndClosesItsWindow() throws {
        let (window, _) = try openWindow()
        var closed = 0
        window.close = { closed += 1 }
        let url = try XCTUnwrap(model.reviewFiles).reviewURL(window.id)
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))
        XCTAssertThrowsError(try files(readOnly: true).deleteReview(window.id)) { XCTAssertEqual($0 as? ReviewFiles.WriteError, .readOnly) }
        XCTAssertThrowsError(try files().deleteReview("../../settings")) { XCTAssertEqual($0 as? ReviewFiles.WriteError, .badId) }
        window.handle(["type": "delete"])
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
        XCTAssertEqual(closed, 1)
        XCTAssertFalse(model.reviewList().contains { $0["id"] as? String == window.id })
        XCTAssertTrue(model.flash.hasPrefix("Deleted the table “"), model.flash)
    }

    func testAMessageForAnotherColumnIdIsRefusedAndSaid() throws {
        let (window, page) = try openWindow()
        window.handle(["type": "cell", "column": "../../settings", "paper": "1:P3NM4G92", "value": "x"])
        XCTAssertEqual(page.flashes.count, 1)
        XCTAssertFalse(FileManager.default.fileExists(atPath: reviewsDir.appendingPathComponent("cells").path))
    }

    func testAQueryTypedInTheBoxIsSearchedAsYouTypeThenKeptOrDropped() throws {
        let (window, page) = try openWindow()
        window.handle(["type": "preview", "query": "teece y:2015.."])
        XCTAssertEqual(bridge.bodies("/search").last?["query"] as? String, "teece y:2015..")
        XCTAssertEqual(page.loads.last?["preview"] as? String, "teece y:2015..")
        XCTAssertEqual((model.reviewFiles?.review(window.id, try core())?["source"] as? [String: Any])?["query"] as? String, "dynamic capabilities") // not kept yet
        window.handle(["type": "preview", "query": NSNull()]) // esc
        XCTAssertEqual(bridge.bodies("/search").last?["query"] as? String, "dynamic capabilities")
        XCTAssertTrue(page.loads.last?["preview"] is NSNull)
        window.handle(["type": "preview", "query": "teece"])
        window.handle(["type": "source", "source": ["type": "query", "query": "teece"]]) // ↵
        XCTAssertEqual((model.reviewFiles?.review(window.id, try core())?["source"] as? [String: Any])?["query"] as? String, "teece")
        XCTAssertTrue(page.loads.last?["preview"] is NSNull)
    }

    func testTheQueryIsReadAsTheLaunchersSearchBoxReadsIt() throws {
        let (window, page) = try openWindow()
        window.handle(["type": "segments", "text": "resilience y:2015.. x", "caret": 21])
        let answer = try XCTUnwrap(page.segments.last)
        XCTAssertEqual(answer.text, "resilience y:2015.. x")
        let blocks = answer.list.compactMap { $0 as? [String: Any] }.filter { $0["block"] as? Bool == true }
        XCTAssertEqual(blocks.compactMap { $0["text"] as? String }, ["y:2015.."])
    }

    func testCommandSInTheBoxSavesTheQueryAsASearchAndTheTableFollowsIt() throws {
        let (window, page) = try openWindow()
        let before = model.savedSearches.count
        window.handle(["type": "preview", "query": "capabilities a:teece"])
        window.handle(["type": "saveSearch", "name": "Teece on capabilities", "query": "capabilities a:teece"])
        XCTAssertEqual(model.savedSearches.count, before + 1)
        let s = try XCTUnwrap(model.savedSearches.last)
        XCTAssertEqual(s["name"] as? String, "Teece on capabilities")
        XCTAssertEqual(s["query"] as? String, "capabilities a:teece")
        let source = try XCTUnwrap(model.reviewFiles?.review(window.id, try core())?["source"] as? [String: Any])
        XCTAssertEqual(source["type"] as? String, "search")
        XCTAssertEqual(source["key"] as? String, s["id"] as? String)
        XCTAssertEqual(page.flashes.last, "Saved “Teece on capabilities” as a search: the launcher lists it too (Searches)")
        XCTAssertTrue(page.loads.last?["preview"] is NSNull)
    }

    func testThePinKeepsTheWindowsOnTopAndIsRemembered() throws {
        UserDefaults.standard.removeObject(forKey: "ZLReviewPinned")
        defer { UserDefaults.standard.removeObject(forKey: "ZLReviewPinned") }
        let (window, page) = try openWindow()
        var levels: [Bool] = []
        window.pin = { levels.append($0) }
        XCTAssertEqual(page.loads.last?["pinned"] as? Bool, false)
        window.handle(["type": "pin", "on": true])
        XCTAssertEqual(levels, [true])
        XCTAssertEqual(page.loads.last?["pinned"] as? Bool, true)
        XCTAssertTrue(ReviewWindowModel(id: window.id, launcher: model).pinned) // the next table's too
        window.handle(["type": "pin", "on": false])
        XCTAssertEqual(levels, [true, false])
    }

    // ---- AI columns (phase 11b)

    private func aiColumn(_ window: ReviewWindowModel) throws -> String {
        let json = try core().glueJSON("reviewColumnParse", ["---\nlabel: \"Gap\"\nkind: prompt\nreads: full\nshape: text\n---\nWhat gap does it fill?\n", "c-0123456789"])
        window.handle(["type": "addColumn", "column": try XCTUnwrap(ReviewFiles.object(json))])
        return "c-0123456789"
    }

    func testRunSendsReviewRunTheJobFromTheColumnFiles() throws {
        let (window, page) = try openWindow()
        let id = try aiColumn(window)
        var done = 0
        runner.answers["review-run"] = { _, _ in done += 1; return FakeRunner.json(["papers": 1, "cells": 1, "failed": 0]) }
        window.handle(["type": "run", "jobs": [["column": id, "paper": "1:P3NM4G92"], ["column": "title", "paper": "1:P3NM4G92"], ["column": id, "paper": "../x"]]])
        XCTAssertEqual(done, 1)
        let call = try XCTUnwrap(runner.calls.last { $0.argv.contains("review-run") })
        let job = try XCTUnwrap(ReviewFiles.object(try XCTUnwrap(call.stdin)))
        XCTAssertEqual(job["review"] as? String, window.id)
        let columns = try XCTUnwrap(job["columns"] as? [[String: Any]])
        XCTAssertEqual(columns.map { $0["id"] as? String }, [id])
        XCTAssertEqual(columns.first?["description"] as? String, "What gap does it fill?")
        XCTAssertEqual((columns.first?["hash"] as? String)?.count, 12)
        XCTAssertEqual((job["jobs"] as? [[String: Any]])?.count, 1) // (the title isn't an AI column; a bad paper id left out)
        XCTAssertTrue(page.flashes.contains { $0.hasPrefix("Running 1 cell") })
        // nothing an AI column asked: said, nothing run
        window.handle(["type": "run", "jobs": [["column": "title", "paper": "1:P3NM4G92"]]])
        XCTAssertEqual(done, 1)
        XCTAssertEqual(page.flashes.last, "Nothing to run: no AI cell was asked for")
    }

    func testWriteItWithAIAsksReviewDraftAndAnswersTheDialog() throws {
        let (window, page) = try openWindow()
        runner.answers["review-draft"] = { _, _ in FakeRunner.json(["column": ["label": "Sample", "prompt": "How many firms?", "shape": "number"], "notes": "A number."]) }
        window.handle(["type": "draftColumn", "kind": "prompt", "request": "the sample size", "current": ["label": "", "description": ""]])
        let call = try XCTUnwrap(runner.calls.last { $0.argv.contains("review-draft") })
        let sent = try XCTUnwrap(ReviewFiles.object(try XCTUnwrap(call.stdin)))
        XCTAssertEqual(sent["request"] as? String, "the sample size")
        XCTAssertEqual(sent["kind"] as? String, "prompt")
        XCTAssertEqual((page.drafts.last?["column"] as? [String: Any])?["label"] as? String, "Sample")
        // a runner from before it: said so
        runner.answers["review-draft"] = { _, _ in RunnerResult(status: 2, stderr: "usage: oma-zotero-prompt …") }
        window.handle(["type": "draftColumn", "kind": "prompt", "request": "x"])
        XCTAssertTrue((page.drafts.last?["error"] as? String)?.contains("older than the app") == true)
    }

    func testCommandMinusAndPlusSizeTheTablesTextAndCommandZeroGoesBack() throws {
        let (window, page) = try openWindow()
        var zoomed: [Double] = []
        window.zoomed = { zoomed.append($0) }
        defer { ReviewWindowModel.zoom = 1 }
        ReviewWindowModel.zoom = 1
        func key(_ c: String, _ flags: NSEvent.ModifierFlags) -> NSEvent {
            NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: flags, timestamp: 0, windowNumber: 0, context: nil, characters: c, charactersIgnoringModifiers: c, isARepeat: false, keyCode: 0)!
        }
        XCTAssertTrue(window.windowKey(key("=", .command)))
        XCTAssertTrue(window.windowKey(key("=", .command)))
        XCTAssertTrue(window.windowKey(key("-", .control)))
        XCTAssertEqual(zoomed, [1.1, 1.25, 1.1])
        XCTAssertEqual(ReviewWindowModel.zoom, 1.1) // kept for the next table
        XCTAssertEqual(page.flashes.last, "Text 110% (⌘0 its size)")
        XCTAssertTrue(window.windowKey(key("0", .command)))
        XCTAssertEqual(zoomed.last, 1)
        XCTAssertEqual(page.flashes.last, "Text 100%")
        XCTAssertFalse(window.windowKey(key("-", .option))) // (the page's)
    }

    func testRunIsRefusedWhileTheSyncFolderIsAway() throws {
        let (window, page) = try openWindow()
        let id = try aiColumn(window)
        model.paths?.readOnly = true
        window.handle(["type": "run", "jobs": [["column": id, "paper": "1:P3NM4G92"]]])
        XCTAssertFalse(runner.calls.contains { $0.argv.contains("review-run") })
        XCTAssertTrue(page.flashes.last?.hasPrefix("Not run: ") == true)
    }

    func testAnAIColumnTickedInColumnsBringsItsAnswersAndARunDoesntRedoThem() throws {
        let (first, _) = try openWindow()
        let id = try aiColumn(first)
        let job = try XCTUnwrap(ReviewFiles.object(try core().glueJSON("reviewRunJob", [try XCTUnwrap(first.review), try XCTUnwrap(model.reviewFiles).columns(try core()), model.reviewContext(), [["column": id, "paper": "1:P3NM4G92"]]])))
        let hash = try XCTUnwrap((job["columns"] as? [[String: Any]])?.first?["hash"] as? String)
        let f = try XCTUnwrap(model.reviewFiles)
        try FileManager.default.createDirectory(at: f.cellsDir, withIntermediateDirectories: true)
        try Data("{\"cells\": {\"1:P3NM4G92\": {\"v\": \"a gap\", \"by\": \"ai\", \"hash\": \"\(hash)\"}}}".utf8).write(to: f.cellsURL(id))
        // another list's table: the column ticked in its Columns menu
        var opened: [String] = []
        model.openReviewWindow = { opened.append($0) }
        model.willShow(query: "absorptive capacity")
        model.execute(.openReview)
        let window = ReviewWindowModel(id: try XCTUnwrap(opened.first), launcher: model)
        let page = FakePage()
        window.page = page
        window.handle(["type": "ready"])
        XCTAssertNil((page.loads.last?["cells"] as? [String: Any])?[id])
        window.handle(["type": "layout", "review": ["columns": [["id": "title"], ["id": id]]]])
        let shown = (page.loads.last?["cells"] as? [String: Any])?[id] as? [String: Any]
        XCTAssertEqual((shown?["1:P3NM4G92"] as? [String: Any])?["v"] as? String, "a gap", "its answers, from the other table's run")
        // a run asked before the table showed them (the cell seen as not run): nothing spent on it
        var runs = 0
        runner.answers["review-run"] = { _, _ in runs += 1; return FakeRunner.json(["papers": 1, "cells": 1, "failed": 0]) }
        window.handle(["type": "run", "jobs": [["column": id, "paper": "1:P3NM4G92", "seen": "empty"]]])
        XCTAssertEqual(runs, 0)
        XCTAssertEqual(page.flashes.last, "Nothing run: that cell has an answer already (shown now)")
        // Run it again (seen up to date): runs
        window.handle(["type": "run", "jobs": [["column": id, "paper": "1:P3NM4G92", "seen": "ok"]]])
        XCTAssertEqual(runs, 1)
    }

    func testAnEditedAICellGoesBackToTheAIsAnswer() throws {
        let (window, page) = try openWindow()
        let id = try aiColumn(window)
        let ai = "{\"cells\": {\"1:P3NM4G92\": {\"v\": \"the AI's\", \"updated\": \"2026-10-28T10:00:00Z\", \"by\": \"ai\", \"model\": \"claude:sonnet\", \"hash\": \"abc\"}}}"
        let f = try XCTUnwrap(model.reviewFiles)
        try FileManager.default.createDirectory(at: f.cellsDir, withIntermediateDirectories: true)
        try Data(ai.utf8).write(to: f.cellsURL(id))
        window.handle(["type": "cell", "column": id, "paper": "1:P3NM4G92", "value": "mine"])
        var cell = (f.cells([id], try core())[id] as? [String: Any])?["1:P3NM4G92"] as? [String: Any]
        XCTAssertEqual(cell?["v"] as? String, "mine")
        XCTAssertEqual((cell?["ai"] as? [String: Any])?["v"] as? String, "the AI's")
        window.handle(["type": "restore", "column": id, "paper": "1:P3NM4G92"])
        cell = (f.cells([id], try core())[id] as? [String: Any])?["1:P3NM4G92"] as? [String: Any]
        XCTAssertEqual(cell?["v"] as? String, "the AI's")
        XCTAssertEqual(cell?["by"] as? String, "ai")
        XCTAssertEqual(page.flashes.last, "Back to the AI's answer")
    }

    func testTheTableKnowsTheTaxonomiesFingerprintsAndTheModels() throws {
        let ctx = model.reviewContext()
        XCTAssertNotNil(ctx["jev"] as? Bool)
        XCTAssertNotNil(ctx["models"] as? [[String: Any]])
        XCTAssertNotNil(ctx["taxonomies"] as? [[String: Any]])
    }

    func testAFileNameFromAReviewsName() {
        XCTAssertEqual(ReviewWindowModel.fileName("a/b: “c”"), "a b   c")
        XCTAssertEqual(ReviewWindowModel.fileName("  "), "Review")
    }
}
