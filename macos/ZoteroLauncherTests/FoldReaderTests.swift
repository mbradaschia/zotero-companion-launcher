import AppKit
import CoreText
import CryptoKit
import PDFKit
import WebKit
import XCTest
@testable import ZoteroLauncher

// The fold reader's native side (docs/fold-reader/SPEC.md; criteria 22, 49 to 53, 55, 56 and the word and image
// budgets of section 11): PDFKit's words and page images, the zlfold scheme, the page's shell, TextFold's client on a
// stubbed URLProtocol, the store, the window's messages, and the launcher's way in (the menu's row and v).
@MainActor
final class FoldReaderTests: XCTestCase {
    private var home: URL!
    private var bridge: FakeBridge!

    override func setUp() async throws {
        home = FileManager.default.temporaryDirectory.appendingPathComponent("fold-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        bridge = FakeBridge()
        let typed = Fixture.bridge("search-typed"), item = Fixture.bridge("item")
        bridge.answers["/search"] = { _ in .ok(typed) }
        bridge.answers["/item"] = { _ in .ok(item) }
        bridge.answers["/attachment"] = { _ in .error("the file is missing from disk") }
        FoldStub.reset()
    }

    override func tearDown() async throws { try? FileManager.default.removeItem(at: home) }

    private func launcher() -> LauncherModel {
        let model = LauncherModel(bridge: bridge, desktop: FakeDesktop(), env: ["HOME": home.path, "hostname": "mac"], runner: FakeRunner(), fetcher: FakeFetcher())
        model.willShow(query: "")
        return model
    }

    private func stubClient(home: URL? = nil, env: [String: String] = [:]) -> TextFoldClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [FoldStub.self]
        return TextFoldClient(configuration: config, environment: env, home: home ?? self.home)
    }

    // ---- a PDF made here: known words at known places (CoreText), the second page turned 90°

    private static let line = "alpha beta gamma"
    private static let origin = CGPoint(x: 72, y: 700)
    private static let fontSize: CGFloat = 12

    private func makePDF(pages: Int = 2, lines: [String]? = nil, rotateSecond: Bool = true) throws -> URL {
        let made = home.appendingPathComponent("made-\(UUID().uuidString).pdf")
        var box = CGRect(x: 0, y: 0, width: 612, height: 792)
        let ctx = try XCTUnwrap(CGContext(made as CFURL, mediaBox: &box, nil))
        let font = CTFontCreateWithName("Helvetica" as CFString, Self.fontSize, nil)
        for _ in 0..<pages {
            ctx.beginPDFPage(nil)
            let texts = lines ?? [Self.line]
            for (i, text) in texts.enumerated() {
                let attr = NSAttributedString(string: text, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font])
                let ct = CTLineCreateWithAttributedString(attr)
                ctx.textPosition = CGPoint(x: Self.origin.x, y: Self.origin.y - CGFloat(i) * 15)
                CTLineDraw(ct, ctx)
            }
            ctx.endPDFPage()
        }
        ctx.closePDF()
        guard rotateSecond, pages > 1 else { return made }
        // (turned and written to a file of its own: never over the file the document is read from)
        let doc = try XCTUnwrap(PDFDocument(url: made))
        doc.page(at: 1)?.rotation = 90
        let turned = home.appendingPathComponent("turned-\(UUID().uuidString).pdf")
        XCTAssertTrue(doc.write(to: turned))
        return turned
    }

    // Where CoreText put each word of the line, as boxes in page points: [x0, y0 (bottom), x1, y1 (top)].
    private func expectedBoxes() -> [(String, CGRect)] {
        let font = CTFontCreateWithName("Helvetica" as CFString, Self.fontSize, nil)
        let attr = NSAttributedString(string: Self.line, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font])
        let ct = CTLineCreateWithAttributedString(attr)
        let ascent = CTFontGetAscent(font), descent = CTFontGetDescent(font)
        var out: [(String, CGRect)] = []
        var at = 0
        for word in Self.line.split(separator: " ") {
            let x0 = CTLineGetOffsetForStringIndex(ct, at, nil), x1 = CTLineGetOffsetForStringIndex(ct, at + word.count, nil)
            out.append((String(word), CGRect(x: Self.origin.x + x0, y: Self.origin.y - descent, width: x1 - x0, height: ascent + descent)))
            at += word.count + 1
        }
        return out
    }

    // 49
    func testWordsInOrderWithTheirBoxesOnAPlainAndATurnedPage() throws {
        let pdf = FoldPDF(url: try makePDF())
        guard case .success(let info) = pdf.openNow() else { return XCTFail("didn't open") }
        XCTAssertEqual(info.pages, 2)
        XCTAssertEqual(info.sizes[0], [612, 792])
        XCTAssertEqual(info.sizes[1], [792, 612], "a turned page's size, as it shows")
        let doc = try XCTUnwrap(PDFDocument(url: pdf.url))
        let box = CGRect(x: 0, y: 0, width: 612, height: 792)
        for (n, rotation) in [(0, 0), (1, 90)] {
            let words = FoldPDF.words(of: try XCTUnwrap(doc.page(at: n)))
            XCTAssertEqual(words.compactMap { $0.first as? String }, ["alpha", "beta", "gamma"], "page \(n + 1)'s words, in order")
            for (i, (word, rect)) in expectedBoxes().enumerated() {
                let want = FoldPDF.normalize(rect, in: box, rotation: rotation)
                let got = words[i].dropFirst().compactMap { $0 as? Double }
                XCTAssertEqual(got.count, 4)
                for k in 0..<4 { XCTAssertEqual(got[k], want[k], accuracy: 0.01, "page \(n + 1) \(word) [\(k)]") }
            }
        }
        // the turn itself: a box near the top left of the page shows near the top right
        XCTAssertEqual(FoldPDF.normalize(CGRect(x: 0, y: 692, width: 61.2, height: 100), in: box, rotation: 90), [0.873737, 0, 1, 0.1])
        XCTAssertEqual(FoldPDF.normalize(CGRect(x: 0, y: 692, width: 61.2, height: 100), in: box, rotation: 0), [0, 0, 0.1, 0.126263])
    }

    // 50
    func testTheSchemeServesAPNGOfItsWidthAndRefusesTheRest() throws {
        let pdf = FoldPDF(url: try makePDF(), token: "abc123")
        guard case .success = pdf.openNow() else { return XCTFail("didn't open") }
        let handler = FoldSchemeHandler()
        handler.pdf = pdf
        handler.pages = 2
        let web = WKWebView()
        func load(_ s: String) -> FakeSchemeTask {
            let task = FakeSchemeTask(URLRequest(url: URL(string: s)!))
            handler.webView(web, start: task)
            let until = Date().addingTimeInterval(5)
            while !task.finished && Date() < until { RunLoop.main.run(until: Date().addingTimeInterval(0.01)) }
            return task
        }
        let ok = load("zlfold://page/1?w=1200&d=abc123")
        XCTAssertEqual(ok.status, 200)
        XCTAssertEqual(ok.mime, "image/png")
        XCTAssertEqual(NSBitmapImageRep(data: ok.data)?.pixelsWide, 1200)
        XCTAssertEqual(NSBitmapImageRep(data: load("zlfold://page/2?w=600&d=abc123").data)?.pixelsWide, 600, "the turned page, 600 wide")
        for bad in ["zlfold://page/1?w=1200&d=nope", "zlfold://page/3?w=1200&d=abc123", "zlfold://page/0?w=1200&d=abc123",
                    "zlfold://page/1?w=1000&d=abc123", "zlfold://page/1?d=abc123", "zlfold://other/1?w=1200&d=abc123"] {
            let t = load(bad)
            XCTAssertEqual(t.status, 404, bad)
            XCTAssertTrue(t.data.isEmpty, bad)
        }
        XCTAssertEqual(pdf.urlPattern, "zlfold://page/{n}?w={w}&d=abc123")
    }

    // 51
    func testTheShellsCSPIsExactlyItsOwnAndTheHashIsTheScripts() throws {
        func resource(_ name: String) -> String {
            Bundle.main.url(forResource: name, withExtension: nil).flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? ""
        }
        let script = FoldWebView.script(resource)
        XCTAssertTrue(script.contains("var FoldCore") && script.contains("var FoldView") && script.contains("var FR"), "the bundled page isn't in the script")
        let hash = Data(SHA256.hash(data: Data(script.utf8))).base64EncodedString()
        let csp = "default-src 'none'; style-src 'unsafe-inline'; img-src zlfold:; script-src 'sha256-\(hash)'"
        XCTAssertEqual(FoldWebView.csp(script: script), csp)
        XCTAssertTrue(FoldWebView.shell.contains("content=\"\(csp)\""), "the shell's CSP")
        XCTAssertTrue(FoldWebView.shell.contains("<script>\(script)</script>"), "the shell runs that script")
        XCTAssertFalse(FoldWebView.shell.contains("unsafe-eval"))
        XCTAssertEqual(FoldWebView.handler, "fold")
    }

    // 52: where TextFold is
    func testServerJsonIsReadInOrderOnlyLoopbackAndFallsBackTo3017() throws {
        let data = home.appendingPathComponent("tfdata"), app = home.appendingPathComponent("Library/Application Support/TextFold")
        try FileManager.default.createDirectory(at: data, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: app, withIntermediateDirectories: true)
        XCTAssertEqual(stubClient().base().absoluteString, "http://127.0.0.1:3017", "nothing written: the default port")
        try Data(#"{"format": "textfold/server", "version": 1, "url": "http://127.0.0.1:4555/", "port": 4555}"#.utf8).write(to: app.appendingPathComponent("server.json"))
        XCTAssertEqual(stubClient().base().absoluteString, "http://127.0.0.1:4555")
        try Data(#"{"url": "http://localhost:4666"}"#.utf8).write(to: data.appendingPathComponent("server.json"))
        XCTAssertEqual(stubClient(env: ["TEXTFOLD_DATA": data.path]).base().absoluteString, "http://localhost:4666", "$TEXTFOLD_DATA first")
        try Data(#"{"url": "http://example.com:4666"}"#.utf8).write(to: data.appendingPathComponent("server.json"))
        XCTAssertEqual(stubClient(env: ["TEXTFOLD_DATA": data.path]).base().absoluteString, "http://127.0.0.1:4555", "another host's URL is refused")
        for bad in ["https://127.0.0.1:3017", "http://10.0.0.2:3017", "http://127.0.0.1.example.com", "file:///tmp/x"] { XCTAssertNil(TextFoldClient.loopback(bad), bad) }
        XCTAssertNotNil(TextFoldClient.loopback("http://[::1]:3017"))
    }

    // 52: every reply mapped to its state
    func testEveryReplyMapsToItsState() {
        func kind(_ f: TextFoldClient.Folded) -> String {
            switch f {
            case .job(let id): return "job:" + id
            case .state(let s): return (s["kind"] as? String ?? "") + ((s["generate"] as? String).map { ":" + $0 } ?? "")
            }
        }
        XCTAssertEqual(kind(TextFoldClient.readReply(200, ["ref": "2201.11903", "title": "T"], nil)), "folding:2201.11903")
        XCTAssertEqual(kind(TextFoldClient.readReply(200, ["job": ["id": "j1", "pid": "pdf-a"], "via": "file"], nil)), "job:j1")
        XCTAssertEqual(kind(TextFoldClient.readReply(200, ["needs": "engine", "upload": "pdf-a"], nil)), "needs-engine")
        XCTAssertEqual(kind(TextFoldClient.readReply(400, ["error": "no-file"], nil)), "no-file")
        XCTAssertEqual(kind(TextFoldClient.readReply(400, ["error": "no-fulltext"], nil)), "no-file")
        XCTAssertEqual(kind(TextFoldClient.readReply(400, ["error": "bad-item"], nil)), "fold-failed")
        XCTAssertEqual(kind(TextFoldClient.readReply(503, ["error": "api-off"], nil)), "zotero-off")
        XCTAssertEqual(kind(TextFoldClient.readReply(0, nil, "refused")), "no-textfold")
        func polled(_ job: [String: Any]) -> String {
            switch TextFoldClient.jobState([job], id: "j1") {
            case .running(let s): return "folding:" + (s["status"] as? String ?? "")
            case .moved(let next): return "moved:" + next
            case .done(let pid): return "done:" + pid
            case .state(let s): return s["kind"] as? String ?? ""
            }
        }
        XCTAssertEqual(polled(["id": "j1", "status": "queued"]), "folding:queued")
        XCTAssertEqual(polled(["id": "j1", "status": "running", "stage": "levels", "done": 3, "total": 12]), "folding:running")
        XCTAssertEqual(polled(["id": "j1", "status": "done", "pid": "pdf-a"]), "done:pdf-a")
        XCTAssertEqual(polled(["id": "j1", "status": "moved", "next": "j2"]), "moved:j2")
        XCTAssertEqual(polled(["id": "j1", "status": "error", "error": "no-model"]), "no-model")
        XCTAssertEqual(polled(["id": "j1", "status": "error", "error": "needs-engine"]), "needs-engine")
        XCTAssertEqual(polled(["id": "j1", "status": "error", "error": "boom"]), "fold-failed")
        XCTAssertEqual(polled(["id": "j1", "status": "stopped"]), "fold-failed")
    }

    // 52: over HTTP (stubbed): the lookup, the fold, a moved job followed, no Origin sent
    func testLookupAndFoldOverHTTPFollowMovedJobsAndSendNoOrigin() throws {
        let doc: [String: Any] = ["format": "textfold/doc", "version": 0, "id": "pdf-abc", "lang": "en", "sections": [Any]()]
        FoldStub.answer("/api/zotero") { _ in (200, ["ok": true, "library": "users/0"]) }
        FoldStub.answer("/api/zotero/items") { _ in (200, [["key": "OTHERKEY", "paper": "pdf-zzz"], ["key": "P3NM4G92", "paper": "pdf-abc"]]) }
        FoldStub.answer("/api/doc/pdf-abc") { _ in (200, doc) }
        FoldStub.answer("/api/zotero/read") { _ in (200, ["job": ["id": "j1"], "via": "file"]) }
        FoldStub.answer("/api/jobs") { _ in (200, [["id": "j1", "status": "moved", "next": "j2"], ["id": "j2", "status": "done", "pid": "pdf-abc"]]) }
        let client = stubClient()
        let base = URL(string: "http://127.0.0.1:3017")!

        let up = expectation(description: "ping")
        client.ping(base) { XCTAssertTrue($0); up.fulfill() }
        let found = expectation(description: "found")
        client.find(base, key: "P3NM4G92", title: "A title & more", cachedId: nil) { f in
            if case .doc(let id, let d) = f { XCTAssertEqual(id, "pdf-abc"); XCTAssertEqual(d["id"] as? String, "pdf-abc") } else { XCTFail("no doc") }
            found.fulfill()
        }
        wait(for: [up, found], timeout: 5)
        let search = try XCTUnwrap(FoldStub.requests().first { $0.url?.path == "/api/zotero/items" })
        XCTAssertEqual(search.url?.query, "lib=users/0&q=A%20title%20%26%20more")

        let folded = expectation(description: "folded")
        client.fold(base, key: "P3NM4G92") { f in
            guard case .job(let id) = f else { XCTFail("no job"); return folded.fulfill() }
            client.poll(base, job: id, each: { _ in }, cancelled: { false }) { f in
                if case .doc(let id, _) = f { XCTAssertEqual(id, "pdf-abc") } else { XCTFail("no doc after the moved job") }
                folded.fulfill()
            }
        }
        wait(for: [folded], timeout: 5)
        let read = try XCTUnwrap(FoldStub.requests().first { $0.url?.path == "/api/zotero/read" })
        XCTAssertEqual(read.httpMethod, "POST")
        XCTAssertEqual(FoldStub.bodies["/api/zotero/read"]?["item"] as? String, "users/0/P3NM4G92")
        for r in FoldStub.requests() {
            XCTAssertNil(r.value(forHTTPHeaderField: "Origin"), r.url?.path ?? "")
            XCTAssertNil(r.value(forHTTPHeaderField: "Cookie"), r.url?.path ?? "")
        }

        // nothing answers: TextFold isn't running; a 503: it can't reach Zotero
        FoldStub.reset()
        FoldStub.answer("/api/zotero/items") { _ in (503, ["error": "not-running"]) }
        let off = expectation(description: "off")
        client.search(base, key: "P3NM4G92", title: "x") { f in
            if case .state(let s) = f { XCTAssertEqual(s["kind"] as? String, "zotero-off") } else { XCTFail() }
            off.fulfill()
        }
        let none = expectation(description: "none")
        client.ping(base) { XCTAssertFalse($0); none.fulfill() }
        wait(for: [off, none], timeout: 5)
    }

    // 22
    func testADamagedMarksFileIsKeptAsideNeverOverwrittenAndWritesAreAtomic() throws {
        let model = launcher()
        let core = try XCTUnwrap(model.core)
        let store = try XCTUnwrap(FoldStore(runnerState: home.appendingPathComponent("state").path, libraryID: 1, key: "P3NM4G92"))
        XCTAssertTrue(store.folder.path.hasSuffix("state/fold-reader/1-P3NM4G92"))
        XCTAssertNil(FoldStore(runnerState: home.path, libraryID: 1, key: "../../x"))
        try FileManager.default.createDirectory(at: store.folder, withIntermediateDirectories: true)
        try Data("{ half a fi".utf8).write(to: store.url(FoldStore.marks))
        let when = Date(timeIntervalSince1970: 1_800_000_000)
        let read = store.readMarks(core, now: when)
        XCTAssertNil(read.store)
        let kept = try XCTUnwrap(read.damaged)
        XCTAssertEqual(kept, "marks.json.damaged-" + FoldStore.stamp(when))
        XCTAssertEqual(try String(contentsOf: store.url(kept), encoding: .utf8), "{ half a fi")
        XCTAssertFalse(FileManager.default.fileExists(atPath: store.url(FoldStore.marks).path))

        // a damaged file found when writing: kept aside first, then the new one written
        try Data("not json".utf8).write(to: store.url(FoldStore.marks))
        let marks = Self.marksStore()
        let aside = try XCTUnwrap(try store.writeMarks(marks, core, now: when))
        XCTAssertEqual(aside, "marks.json.damaged-" + FoldStore.stamp(when) + "-2")
        XCTAssertEqual(try String(contentsOf: store.url(aside), encoding: .utf8), "not json")
        let back = store.readMarks(core)
        XCTAssertEqual(((back.store?["marks"] as? [[String: Any]])?.first)?["id"] as? String, "m-abc123def0")
        // atomic: no temporary file left beside it; an invalid store refused, the file as it was
        let names = try FileManager.default.contentsOfDirectory(atPath: store.folder.path)
        XCTAssertFalse(names.contains { $0.hasSuffix(".tmp") }, names.joined(separator: " "))
        let before = try String(contentsOf: store.url(FoldStore.marks), encoding: .utf8)
        XCTAssertThrowsError(try store.writeMarks(["format": "other"], core))
        XCTAssertEqual(try String(contentsOf: store.url(FoldStore.marks), encoding: .utf8), before)
    }

    static func marksStore() -> [String: Any] {
        ["format": "zl-fold-marks", "version": 1, "paper": "1:P3NM4G92", "doc": ["id": "pdf-abc", "lang": "en"],
         "marks": [["id": "m-abc123def0", "kind": "note", "unit": "S1.p1.1", "from": 3, "to": 5, "quote": "papers each week", "text": "Check it",
                    "created": "2026-11-06T10:00:00.000Z", "updated": "2026-11-06T10:00:00.000Z"]]]
    }

    // 53
    func testThePagesMarksAreWrittenAndItsStatusGoesThroughTheLauncher() throws {
        let model = launcher()
        FoldStub.answer("/api/zotero") { _ in (200, ["ok": true]) }
        FoldStub.answer("/api/zotero/items") { _ in (200, [Any]()) }
        let paper = PaperRef(key: "P3NM4G92", libraryID: 1, title: "A paper", itemType: "journalArticle")
        let window = FoldWindowModel(paper: paper, launcher: model, client: stubClient())
        let page = FakeFoldPage()
        window.page = page
        window.handle(["type": "ready"])
        XCTAssertFalse(page.loads.isEmpty, "ready: the page is loaded")
        XCTAssertEqual((page.loads.last?["paper"] as? [String: Any])?["key"] as? String, "P3NM4G92")
        XCTAssertTrue(bridge.bodies("/attachment").allSatisfy { $0["target"] as? String == "path" && $0["markOpened"] as? Bool == false }, "the PDF's path, never marked opened")

        window.handle(["type": "marks", "marks": Self.marksStore()])
        let store = try XCTUnwrap(window.store)
        let text = try String(contentsOf: store.url(FoldStore.marks), encoding: .utf8)
        XCTAssertTrue(text.contains("\"m-abc123def0\"") && text.hasSuffix("\n"), text)
        let state = try XCTUnwrap(model.pathsJSON["runnerState"] as? String)
        XCTAssertTrue(store.folder.path.hasPrefix(state), "under the app's state folder, not the sync folder")

        window.handle(["type": "status", "from": "", "to": "s/reading"])
        XCTAssertEqual(model.marks.statusShown["1:P3NM4G92"], "s/reading")
        XCTAssertEqual(((page.papers.last?["status"] as? [String: Any])?["current"] as? String), "s/reading")

        window.handle(["type": "prefs", "level": "key", "pdfWidth": 9000, "margin": false])
        XCTAssertEqual(FoldWindowModel.prefs["level"] as? String, "key")
        XCTAssertEqual(FoldWindowModel.prefs["pdfWidth"] as? Double, 760)
        XCTAssertEqual(FoldWindowModel.prefs["margin"] as? Bool, false)
        window.handle(["type": "prefs", "level": "nonsense"])
        XCTAssertEqual(FoldWindowModel.prefs["level"] as? String, "key")
        UserDefaults.standard.removeObject(forKey: "ZLFoldPrefs")
        window.windowClosing()
    }

    // 55
    func testVAndTheMenuRowOpenTheReaderForThatPaperAndNotThroughActionMap() throws {
        XCTAssertNil(ActionMap.handlers["fold-read"], "fold-read is the Mac's own, never in ActionMap")
        let model = launcher()
        var opened: [PaperRef] = []
        model.openFoldReader = { opened.append($0) }
        let i = try XCTUnwrap(model.searchRows.firstIndex { $0.kind == "item" })
        let row = model.searchRows[i]
        model.store.selectedIndex = i
        XCTAssertTrue(model.keyAction("v"), "v on the results' paper")
        XCTAssertEqual(opened.last?.id, "\(row.libraryID):\(row.key)")
        model.enterActions(i)
        let at = try XCTUnwrap(model.listRows.firstIndex { $0.rowId == "fold-read" })
        XCTAssertEqual(model.listRows[at - 1].rowId, "window")
        model.activateAction(at)
        XCTAssertEqual(opened.count, 2)
        XCTAssertTrue(model.keyAction("v"), "v in the paper's menu")
        XCTAssertEqual(opened.count, 3)
        XCTAssertEqual(Set(opened.map(\.id)).count, 1, "the same paper each time")

        // the windows: the same paper's comes forward, never a second
        let windows = FoldWindows()
        let paper = try XCTUnwrap(opened.last)
        windows.show(paper, launcher: model)
        let first = windows.window(paper.id)
        windows.show(paper, launcher: model)
        XCTAssertEqual(windows.openIds, [paper.id])
        XCTAssertTrue(windows.window(paper.id) === first)
        XCTAssertEqual(first?.title.hasPrefix("Read · "), true)
        XCTAssertGreaterThanOrEqual(first?.contentMinSize.width ?? 0, 760)
        first?.close()
        XCTAssertTrue(windows.openIds.isEmpty)
    }

    // 56
    func testTheRowsSymbolAndEveryReaderConceptExist() {
        XCTAssertEqual(Icons.symbol(rowId: "fold-read"), "text.book.closed")
        XCTAssertNotNil(NSImage(systemSymbolName: Icons.symbol(rowId: "fold-read"), accessibilityDescription: nil))
        XCTAssertEqual(Set(Icons.readerConcept.keys), ["pdf", "swap", "highlight", "foldback", "zoomout", "zoomin", "fit"])
        for (name, symbol) in Icons.readerConcept { XCTAssertNotNil(NSImage(systemSymbolName: symbol, accessibilityDescription: nil), "\(name): \(symbol)") }
    }

    // The budgets (SPEC 11): the words of 40 generated pages within 2 s; one page image at 1200 px within 150 ms.
    func testWordsOf40PagesAndAPageImageWithinTheirBudgets() throws {
        let words = (0..<12).map { ["fold", "paper", "level", "reader", "words", "page", "brief", "key"][$0 % 8] }.joined(separator: " ")
        let url = try makePDF(pages: 40, lines: Array(repeating: words, count: 45), rotateSecond: false)
        let pdf = FoldPDF(url: url)
        guard case .success = pdf.openNow() else { return XCTFail("didn't open") }
        let doc = try XCTUnwrap(PDFDocument(url: url))
        var count = 0
        let t0 = Date()
        for i in 0..<doc.pageCount { count += FoldPDF.words(of: try XCTUnwrap(doc.page(at: i))).count }
        let took = Date().timeIntervalSince(t0)
        // (when it doesn't add up, the words that aren't one of the eight say how they came apart or together)
        let first = FoldPDF.words(of: try XCTUnwrap(doc.page(at: 0))).compactMap { $0.first as? String }
        let vocab: Set<String> = ["fold", "paper", "level", "reader", "words", "page", "brief", "key"]
        XCTAssertEqual(count, 40 * 45 * 12, "page 1: \(first.count) words; odd ones: \(first.filter { !vocab.contains($0) }.prefix(12))")
        XCTAssertLessThan(took, 2, "words of 40 pages: \(took) s")
        _ = pdf.pngNow(1, width: 600) // (the document warm)
        let t1 = Date()
        let png = pdf.pngNow(2, width: 1200)
        let image = Date().timeIntervalSince(t1)
        XCTAssertNotNil(png)
        XCTAssertLessThan(image, 0.15, "a page at 1200 px: \(image) s")
        for n in 1...14 { _ = pdf.pngNow(((n - 1) % 40) + 1, width: 900) }
        XCTAssertLessThanOrEqual(pdf.cachedImages, FoldPDF.keep, "at most 12 images kept")
    }
}

// What the window's model calls on its page, recorded.
@MainActor
final class FakeFoldPage: FoldPage {
    var loads: [[String: Any]] = []
    var states: [[String: Any]] = []
    var batches: [[String: Any]] = []
    var papers: [[String: Any]] = []
    var flashes: [String] = []
    func load(_ data: [String: Any]) { loads.append(data) }
    func state(_ s: [String: Any]) { states.append(s) }
    func words(_ batch: [String: Any]) { batches.append(batch) }
    func paper(_ o: [String: Any]) { papers.append(o) }
    func flash(_ text: String) { flashes.append(text) }
    func zoom(_ z: Double) {}
}

// A scheme task, recorded.
final class FakeSchemeTask: NSObject, WKURLSchemeTask {
    let request: URLRequest
    var status = 0
    var mime: String?
    var data = Data()
    var finished = false
    init(_ request: URLRequest) { self.request = request }
    func didReceive(_ response: URLResponse) { status = (response as? HTTPURLResponse)?.statusCode ?? 0; mime = response.mimeType }
    func didReceive(_ data: Data) { self.data.append(data) }
    func didFinish() { finished = true }
    func didFailWithError(_ error: Error) { finished = true }
}

// TextFold, stubbed: answers by path, every request kept (with its body).
final class FoldStub: URLProtocol {
    private static let lock = NSLock()
    private static var answers: [String: (URLRequest) -> (Int, Any)] = [:]
    private static var seen: [URLRequest] = []
    static var bodies: [String: [String: Any]] {
        lock.lock(); defer { lock.unlock() }
        var out: [String: [String: Any]] = [:]
        for r in seen { if let path = r.url?.path, let b = body(r) { out[path] = b } }
        return out
    }

    static func reset() { lock.lock(); answers = [:]; seen = []; lock.unlock() }
    static func answer(_ path: String, _ f: @escaping (URLRequest) -> (Int, Any)) { lock.lock(); answers[path] = f; lock.unlock() }
    static func requests() -> [URLRequest] { lock.lock(); defer { lock.unlock() }; return seen }

    private static func body(_ r: URLRequest) -> [String: Any]? {
        var data = r.httpBody
        if data == nil, let stream = r.httpBodyStream {
            stream.open()
            var d = Data()
            var buf = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable { let n = stream.read(&buf, maxLength: buf.count); if n <= 0 { break }; d.append(buf, count: n) }
            stream.close()
            data = d
        }
        return data.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lock.lock()
        Self.seen.append(request)
        let f = request.url.flatMap { Self.answers[$0.path] }
        Self.lock.unlock()
        guard let f, let url = request.url else {
            client?.urlProtocol(self, didFailWithError: URLError(.cannotConnectToHost))
            return
        }
        let (status, json) = f(request)
        let data = (try? JSONSerialization.data(withJSONObject: json, options: [.fragmentsAllowed])) ?? Data()
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
