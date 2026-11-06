import AppKit
import CoreText
import CryptoKit
import PDFKit
import WebKit
import XCTest
@testable import ZoteroLauncher

// The fold reader's native side (docs/fold-reader/SPEC.md; criteria 22, 49 to 53, 55, 56 and the word and image
// budgets of section 11; R5-SPEC.md R5-35 to R5-41): PDFKit's words, lines and page images, the zlfold scheme, the
// page's shell, the extraction (FoldMaker) on a paper drawn here, the store, the window's messages and its fold, and
// the launcher's way in (the menu's row and v).
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

    // 45 in the app's themes: the reader's text reads at 4.5:1 on the window, the selection's tint and a highlight
    func testTheReadersTextReadsOnItsTintsInEveryTheme() {
        for family in ThemeFamily.all {
            for dark in [false, true] {
                let t = FoldTheme.tokens(Palette(family), dark: dark)
                let c = FoldTheme.colours(t, dark: dark)
                let name = "\(family.name) (\(dark ? "dark" : "light"))"
                for text in ["ink", "muted", "faint", "cite"] {
                    for (ground, g) in [("window", t.background), ("sel", c["sel"]!), ("hl", c["hl"]!), ("head", c["head"]!)] {
                        XCTAssertGreaterThanOrEqual(c[text]!.contrast(g), 4.5, "\(name): --\(text) on \(ground)")
                    }
                }
                for (ground, g) in [("window", t.background), ("tax-soft", c["tax-soft"]!)] {
                    XCTAssertGreaterThanOrEqual(c["tax"]!.contrast(g), 4.5, "\(name): a taxonomy label (--tax) on \(ground)")
                }
                XCTAssertGreaterThanOrEqual(c["hl-line"]!.contrast(c["hl"]!), 3, name + ": a highlight's underline")
                if family.isSystem {
                    XCTAssertNotEqual(c["muted"]!.hex, c["ink"]!.hex, name + ": the second line, laid over the window, stays lighter than the ink")
                    XCTAssertGreaterThan(c["ink"]!.contrast(t.background), c["muted"]!.contrast(t.background), name + ": the ink reads stronger than the muted")
                }
            }
        }
        let css = FoldTheme.pageCSS(Palette(ThemeFamily.named("nord")))
        XCTAssertTrue(css.contains("--cite: #") && css.contains("--muted: #") && css.contains("@media (prefers-color-scheme: dark)"))
        XCTAssertTrue(css.hasPrefix(Palette(ThemeFamily.named("nord")).reviewCSS), "over the review table's")
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

    // ---- R5: a two-column paper made here (FIXTURE.md 6.5), every word's place recorded as the page shows it

    // R5-35: the lines payload: sizes, bold, the run-in heading, the words in order, their boxes
    func testLinesGiveSizesBoldRunInHeadingsWordsAndBoxes() throws {
        let paper = PaperPDF()
        let url = try paper.write(in: home)
        let doc = try XCTUnwrap(PDFDocument(url: url))
        XCTAssertEqual(doc.pageCount, 2)
        let payload = (0..<2).map { FoldPDF.page(doc.page(at: $0), n: $0 + 1) }
        XCTAssertEqual(payload.map { $0["size"] as? [Double] ?? [] }, [[612, 792], [792, 612]], "the sizes as the pages show")
        for drawn in paper.lines {
            let lines = payload[drawn.page]["lines"] as? [[String: Any]] ?? []
            let texts = drawn.words.map(\.text)
            let found = lines.filter { (($0["w"] as? [[Any]]) ?? []).compactMap { $0.first as? String } == texts }
            XCTAssertEqual(found.count, 1, "page \(drawn.page + 1): the line \(texts.joined(separator: " ")) once, its words in order (\(lines.count) lines read)")
            guard let line = found.first else { continue }
            XCTAssertEqual(line["t"] as? String, texts.joined(separator: " "))
            XCTAssertEqual((line["s"] as? Double) ?? 0, Double(drawn.size), accuracy: 0.5, "its size: \(texts.joined(separator: " "))")
            let bold = drawn.words.filter(\.bold).count * 2 > drawn.words.count
            XCTAssertEqual(((line["f"] as? Int) ?? 0) & 1, bold ? 1 : 0, "bold: \(texts.joined(separator: " "))")
            XCTAssertEqual(line["lb"] as? Int, drawn.words.prefix(while: { $0.bold }).count, "the bold words at its start: \(texts.joined(separator: " "))")
            let words = line["w"] as? [[Any]] ?? []
            for (w, want) in zip(words, drawn.words) {
                let got = w.dropFirst().compactMap { $0 as? Double }
                XCTAssertEqual(got.count, 4)
                for k in 0..<min(4, got.count) { XCTAssertEqual(got[k], want.box[k], accuracy: 0.01, "page \(drawn.page + 1) \(want.text) [\(k)]") }
            }
            let b = line["b"] as? [Double] ?? []
            XCTAssertEqual(b.count, 4)
            if b.count == 4, let first = words.first, let last = words.last {
                XCTAssertEqual(b[0], first[1] as? Double ?? -1, accuracy: 0.000001, "b is the words' union")
                XCTAssertEqual(b[2], last[3] as? Double ?? -1, accuracy: 0.000001, "b is the words' union")
            }
        }
        let runIn = try XCTUnwrap(paper.lines.first { $0.words.first?.text == "Abstract." })
        XCTAssertEqual(runIn.words.prefix(while: { $0.bold }).count, 1, "the run-in Abstract. is the one bold word")
        // the fonts of a run of words: the mean size, bold and italic for most characters, the bold words at its start
        let bold = NSFont(name: "Helvetica-Bold", size: 12) ?? NSFont.boldSystemFont(ofSize: 12)
        let plain = NSFont(name: "Helvetica", size: 10) ?? NSFont.systemFont(ofSize: 10)
        let a = NSMutableAttributedString(string: "2 Method ", attributes: [.font: bold])
        a.append(NSAttributedString(string: "body text", attributes: [.font: plain]))
        let chars = FoldPDF.charStyles(a, length: a.length)
        XCTAssertEqual(chars.count, 18)
        let words = [0..<1, 2..<8, 9..<13, 14..<18].map { Array(chars[$0]) }
        let style = FoldPDF.style(words)
        XCTAssertEqual(style.leadBold, 2)
        XCTAssertEqual(style.size ?? 0, (12.0 * 7 + 10.0 * 8) / 15, accuracy: 0.001)
        XCTAssertEqual(style.flags, 0, "bold in 7 of 15 letters: not the line's")
        XCTAssertEqual(FoldPDF.style(Array(words.prefix(2))).flags, 1)
        XCTAssertEqual(FoldPDF.charStyles(a, length: 5), [], "another length: its fonts aren't matched to the words")
        XCTAssertEqual(FoldPDF.style([[], []]), FoldPDF.LineStyle(), "no fonts: no size, nothing bold")
    }

    private func paperMeta(_ url: URL, pages: Int, sizes: [[Double]]) -> [String: Any] {
        let bytes = ((try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? NSNumber)?.intValue ?? 0
        return ["title": "Folding a Paper: A Small Synthetic Study", "authors": ["Rivera, Ana", "Okafor, Ben"], "date": "2026-01-15", "cite": "Rivera and Okafor, 2026",
                "pdf": ["sha256": FoldPDF.sha256(of: url) ?? "", "bytes": bytes, "modified": "2026-11-06T10:00:00Z", "pages": pages, "sizes": sizes],
                "made_with": "Zotero Launcher test", "exported": "2026-11-06T10:00:00Z"]
    }

    // R5-36: FoldMaker on that PDF: FIXTURE 6.3's ids and kinds for the units it holds, each unit's boxes where its
    // words were drawn; an image-only PDF is a scan
    func testFoldMakerReadsThePaperIntoItsUnitsAndBoxesAndAScanIsAScan() throws {
        let paper = PaperPDF()
        let url = try paper.write(in: home)
        let pdf = FoldPDF(url: url)
        guard case .success(let info) = pdf.openNow() else { return XCTFail("didn't open") }
        let pages = pdf.linesNow()
        XCTAssertEqual(FoldMaker.language(of: pages), "en")
        let maker = try FoldMaker()
        XCTAssertEqual(maker.extractor, 1)
        let made = try maker.read(pages, meta: paperMeta(url, pages: info.pages, sizes: info.sizes).merging(["lang": "en"]) { $1 })
        XCTAssertNil(made.problem)
        let doc = try XCTUnwrap(made.doc)
        let sections = doc["sections"] as? [[String: Any]] ?? []
        let got = sections.map { s in (s["id"] as? String ?? "") + ": " + (s["units"] as? [[String: Any]] ?? []).map { ($0["id"] as? String ?? "") + " " + ($0["kind"] as? String ?? "") }.joined(separator: ", ") }
        XCTAssertEqual(got, ["abstract: abstract.p1 abstract", "S1: S1.p1 paragraph, S1.p2 paragraph", "S2: S2.p1 paragraph", "Sx: Sx.n1 footnote"])
        let map = try XCTUnwrap((made.links?["map"]) as? [String: Any])
        for (unit, want) in paper.unitBoxes() {
            let entry = try XCTUnwrap(map[unit] as? [String: Any], unit)
            XCTAssertEqual(entry["page"] as? Int, want.page, unit)
            let boxes = entry["boxes"] as? [[Double]] ?? []
            XCTAssertEqual(boxes.count, want.boxes.count, "\(unit): one box a line")
            for (b, w) in zip(boxes, want.boxes) {
                XCTAssertEqual(b.count, w.count, "\(unit): a box on another page names it")
                for k in 0..<min(b.count, w.count) { XCTAssertEqual(b[k], w[k], accuracy: 0.01, "\(unit) [\(k)]") }
            }
        }
        XCTAssertEqual(((made.links?["coverage"]) as? [String: Any])?["linked"] as? Int, 5)

        // two pages of a picture only: a scan
        let scan = try PaperPDF.imageOnly(in: home)
        let spdf = FoldPDF(url: scan)
        guard case .success(let sinfo) = spdf.openNow() else { return XCTFail("the scan didn't open") }
        let none = try maker.read(spdf.linesNow(), meta: paperMeta(scan, pages: sinfo.pages, sizes: sinfo.sizes))
        XCTAssertEqual(none.problem, "scan")
        XCTAssertEqual(none.state?["kind"] as? String, "scan")
        XCTAssertNil(none.doc)
        XCTAssertEqual(FoldMaker.Made(problem: "too-long", units: 5001).state?["n"] as? Int, 5001)

        // the same through the PDF's queue, as the window runs it
        let ran = expectation(description: "made")
        var steps: [Int] = []
        FoldMaker.make(pdf, meta: paperMeta(url, pages: info.pages, sizes: info.sizes), progress: { d, _ in steps.append(d) }) { result in
            if case .success(let m) = result { XCTAssertEqual((m.doc?["lang"]) as? String, "en") } else { XCTFail("not made") }
            ran.fulfill()
        }
        wait(for: [ran], timeout: 10)
        XCTAssertEqual(steps.last, 2, "progress to the last page")
    }

    // R5-37: the doc's identity; a touched file keeps it, another file is read again; a damaged doc.json kept aside
    func testTheDocsIdIsTheFilesHashAndATouchedFileKeepsItAndAnotherIsReadAgain() throws {
        let paper = PaperPDF()
        let url = try paper.write(in: home)
        let data = try Data(contentsOf: url)
        let hex = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        XCTAssertEqual(FoldPDF(url: url).sha256(), hex, "the file's SHA-256, read in 1 MB parts")
        let pdf = FoldPDF(url: url)
        guard case .success(let info) = pdf.openNow() else { return XCTFail("didn't open") }
        let meta = paperMeta(url, pages: info.pages, sizes: info.sizes)
        let made = try FoldMaker().read(pdf.linesNow(), meta: meta)
        let doc = try XCTUnwrap(made.doc)
        XCTAssertEqual(doc["id"] as? String, "pdf-" + String(hex.prefix(16)))
        let bytes = data.count
        let links: [String: Any] = ["pdf": ["bytes": bytes, "modified": "2026-11-06T10:00:00Z", "pages": 2]]
        var asked = 0
        let same = { () -> String? in asked += 1; return hex }
        XCTAssertEqual(FoldMaker.cached(doc, links: links, bytes: bytes, modified: "2026-11-06T10:00:00Z", extractor: 1, sha256: same), .use)
        XCTAssertEqual(asked, 0, "the same size and date: not hashed")
        XCTAssertEqual(FoldMaker.cached(doc, links: links, bytes: bytes, modified: "2026-11-07T08:00:00Z", extractor: 1, sha256: same), .touched, "touched: the same bytes")
        XCTAssertEqual(asked, 1)
        XCTAssertEqual(FoldMaker.cached(doc, links: links, bytes: bytes + 10, modified: "2026-11-07T08:00:00Z", extractor: 1) { String(repeating: "f", count: 64) }, .changed, "another file")
        XCTAssertEqual(FoldMaker.cached(doc, links: links, bytes: bytes, modified: "2026-11-06T10:00:00Z", extractor: 2, sha256: same), .stale, "an older reading, nothing folded")
        var folded = doc
        var sections = doc["sections"] as? [[String: Any]] ?? []
        sections[1]["made"] = "ai"
        folded["sections"] = sections
        XCTAssertEqual(FoldMaker.cached(folded, links: links, bytes: bytes, modified: "2026-11-06T10:00:00Z", extractor: 2, sha256: same), .use, "an older reading with folds stays until Fold again")
        XCTAssertEqual(FoldMaker.cached(nil, links: nil, bytes: bytes, modified: "", extractor: 1, sha256: same), .read)
        // R1's docs (D9): kept with AI levels, read again with local ones
        let r1: [String: Any] = ["format": "textfold/doc", "version": 0, "id": "pdf-abc", "provenance": ["made_with": "TextFold 0.9", "ai_generated": true, "local": false], "sections": [Any]()]
        XCTAssertEqual(FoldMaker.cached(r1, links: nil, bytes: bytes, modified: "", extractor: 1, sha256: same), .kept)
        var local = r1
        local["provenance"] = ["made_with": "TextFold 0.9", "ai_generated": false, "local": true]
        XCTAssertEqual(FoldMaker.cached(local, links: nil, bytes: bytes, modified: "", extractor: 1, sha256: same), .read)

        // the store: fold.json, and a doc.json that can't be read kept aside
        let model = launcher()
        let core = try XCTUnwrap(model.core)
        let store = try XCTUnwrap(FoldStore(runnerState: home.appendingPathComponent("state").path, libraryID: 1, key: "P3NM4G92"))
        XCTAssertNil(store.readDoc(core).doc, "none yet")
        try store.writeJSON(FoldStore.doc, doc)
        XCTAssertEqual(store.readDoc(core).doc?["id"] as? String, doc["id"] as? String)
        try store.writeRun(["doc": doc["id"] ?? "", "model": "lab:m1", "started": "2026-11-06T10:00:00Z", "status": "folding", "sections": ["S1": "done"]])
        XCTAssertEqual(store.readRun()?["status"] as? String, "folding")
        XCTAssertEqual(store.readRun()?["format"] as? String, "zl-fold-run")
        let when = Date(timeIntervalSince1970: 1_800_000_000)
        for bad in ["{ half a do", #"{"format": "other", "version": 7}"#] {
            try store.write(FoldStore.doc, bad)
            let read = store.readDoc(core, now: when)
            XCTAssertNil(read.doc)
            let kept = try XCTUnwrap(read.damaged, bad)
            XCTAssertTrue(kept.hasPrefix("doc.json.damaged-" + FoldStore.stamp(when)), kept)
            XCTAssertEqual(try String(contentsOf: store.url(kept), encoding: .utf8), bad)
            XCTAssertFalse(FileManager.default.fileExists(atPath: store.url(FoldStore.doc).path))
        }
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
        let lines = FoldPDF.lineCount(of: try XCTUnwrap(doc.page(at: 0)))
        XCTAssertEqual(count, 40 * 45 * 12, "page 1: \(lines) lines, \(first.count) words; odd ones: \(first.filter { !vocab.contains($0) }.prefix(12))")
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

    // R5-40: the lines of 40 generated pages within 3 s
    func testLinesOf40PagesWithinTheirBudget() throws {
        let words = (0..<12).map { ["fold", "paper", "level", "reader", "words", "page", "brief", "key"][$0 % 8] }.joined(separator: " ")
        let url = try makePDF(pages: 40, lines: Array(repeating: words, count: 45), rotateSecond: false)
        let pdf = FoldPDF(url: url)
        guard case .success = pdf.openNow() else { return XCTFail("didn't open") }
        let t0 = Date()
        let pages = pdf.linesNow()
        let took = Date().timeIntervalSince(t0)
        XCTAssertEqual(pages.count, 40)
        var count = 0
        for page in pages {
            for line in page["lines"] as? [[String: Any]] ?? [] {
                count += (line["w"] as? [[Any]])?.count ?? 0
                XCTAssertEqual((line["s"] as? Double) ?? 0, 12, accuracy: 0.5)
            }
        }
        XCTAssertEqual(count, 40 * 45 * 12)
        XCTAssertLessThan(took, 3, "lines of 40 pages: \(took) s")
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

// R5's paper, drawn here with CoreText (FIXTURE.md 6.5): two pages, two columns (54 to 297 and 315 to 558 points),
// Helvetica 10 body, Helvetica-Bold 12 headings, Helvetica-Bold 10 `Abstract.` run into the abstract's first line, a
// Helvetica 8 footnote, Helvetica 9 page numbers; section 1's abstract, S1.p1.1, S1.p2.1 and S2.p1.1 sentences (and
// the fillers of 6.1); the second page turned 90° (its text drawn turned the other way, so it reads upright as the page
// shows). Every word's box is recorded as the page shows it (0 to 1, origin top left), with the unit it belongs to.
final class PaperPDF {
    struct Word {
        let text: String
        let bold: Bool
        let unit: String?
        var box: [Double] = []
    }

    struct Line {
        let page: Int // 0-based
        let x: CGFloat
        let baseline: CGFloat // points from the top, as the page shows
        let size: CGFloat
        var words: [Word]
    }

    static let shown = [CGSize(width: 612, height: 792), CGSize(width: 792, height: 612)]
    static let abstract = ["We study how readers move between a paper's own words and short summaries of it.",
                           "Readers who could fold the text found the main claims faster than readers of the plain text.", "We describe the reader and its limits."]
    static let intro = ["Researchers read many papers each week [1, 2].", "Most of that reading is skimming for the main claim (Lee et al., 2021).",
                        "Skimming saves time but misses how a claim is argued."]
    static let gap = ["Summaries written by language models are short.", "They do not show which of the author's sentences they rest on.",
                      "No reader we know links each summary line back to the text."]
    static let method = ["Each paragraph is folded into five levels, from a topic to the full text.",
                         "A word keeps its place across levels when it appears in both, scored by s = n / N.", "The PDF beside the text is matched by runs of three words."]
    static let fillers = ["Each level keeps the words that the next level needs.", "A reader can open any paragraph in place to see all of it.",
                          "The folds are stored beside the paper on this computer.", "Nothing in the library changes when a paper is folded."]

    private(set) var lines: [Line] = []

    // where a paragraph goes on: the column, its top, the baseline reached, its foot
    struct At {
        var page: Int
        var x0: CGFloat
        var x1: CGFloat
        var top: CGFloat
        var baseline: CGFloat
        var bottom: CGFloat
    }
    private var next: [At] = []

    init() { lay() }

    static func font(_ size: CGFloat, bold: Bool) -> CTFont { CTFontCreateWithName((bold ? "Helvetica-Bold" : "Helvetica") as CFString, size, nil) }

    static func attributed(_ words: [Word], size: CGFloat) -> NSAttributedString {
        let key = NSAttributedString.Key(kCTFontAttributeName as String)
        let out = NSMutableAttributedString()
        for (i, w) in words.enumerated() {
            if i > 0 { out.append(NSAttributedString(string: " ", attributes: [key: font(size, bold: words[i - 1].bold && w.bold)])) }
            out.append(NSAttributedString(string: w.text, attributes: [key: font(size, bold: w.bold)]))
        }
        return out
    }

    static func width(_ words: [Word], size: CGFloat) -> CGFloat {
        CGFloat(CTLineGetTypographicBounds(CTLineCreateWithAttributedString(attributed(words, size: size)), nil, nil, nil))
    }

    // A line kept with each word's box: CoreText's offsets along it, the font's ascent and descent about the baseline.
    private func add(_ page: Int, x: CGFloat, baseline: CGFloat, size: CGFloat, words: [Word]) {
        let ct = CTLineCreateWithAttributedString(Self.attributed(words, size: size))
        let s = Self.shown[page]
        var boxed: [Word] = []
        var at = 0
        for w in words {
            let font = Self.font(size, bold: w.bold)
            let x0 = x + CTLineGetOffsetForStringIndex(ct, at, nil), x1 = x + CTLineGetOffsetForStringIndex(ct, at + (w.text as NSString).length, nil)
            let top = baseline - CTFontGetAscent(font), foot = baseline + CTFontGetDescent(font)
            var b = w
            b.box = [Double(x0 / s.width), Double(top / s.height), Double(x1 / s.width), Double(foot / s.height)]
            boxed.append(b)
            at += (w.text as NSString).length + 1
        }
        lines.append(Line(page: page, x: x, baseline: baseline, size: size, words: boxed))
    }

    // A paragraph from `at`, a line every 1.2 × size, on into the next column past the foot of this one; where it ends.
    private func para(_ text: String, size: CGFloat, at start: At, unit: String?, indent: CGFloat = 0, bold: Bool = false, lead: [Word] = []) -> At {
        var at = start
        var cur: [Word] = []
        var x = at.x0 + indent
        for w in lead + text.split(separator: " ").map({ Word(text: String($0), bold: bold, unit: unit) }) {
            if !cur.isEmpty && x + Self.width(cur + [w], size: size) > at.x1 {
                add(at.page, x: x, baseline: at.baseline, size: size, words: cur)
                cur = []
                at.baseline += 1.2 * size
                x = at.x0
                if at.baseline > at.bottom, !next.isEmpty { at = next.removeFirst(); x = at.x0 }
            }
            cur.append(w)
        }
        if !cur.isEmpty { add(at.page, x: x, baseline: at.baseline, size: size, words: cur) }
        at.baseline += 1.2 * size
        return at
    }

    private func lay() {
        _ = para(Self.abstract.joined(separator: " "), size: 10, at: At(page: 0, x0: 54, x1: 558, top: 160, baseline: 160, bottom: 720), unit: "abstract.p1",
                 lead: [Word(text: "Abstract.", bold: true, unit: nil)])
        next = [At(page: 0, x0: 315, x1: 558, top: 250, baseline: 250, bottom: 380), At(page: 1, x0: 54, x1: 297, top: 64, baseline: 64, bottom: 520),
                At(page: 1, x0: 315, x1: 558, top: 64, baseline: 64, bottom: 520)]
        var at = At(page: 0, x0: 54, x1: 297, top: 250, baseline: 250, bottom: 380)
        func heading(_ t: String) {
            if at.baseline > at.top { at.baseline += 8 }
            at = para(t, size: 12, at: at, unit: nil, bold: true)
        }
        heading("1 Introduction")
        at = para(Self.intro.joined(separator: " "), size: 10, at: at, unit: "S1.p1")
        at = para((Self.gap + Self.fillers.prefix(3)).joined(separator: " "), size: 10, at: at, unit: "S1.p2", indent: 10)
        heading("2 Method")
        at = para((Self.method + Self.fillers).joined(separator: " "), size: 10, at: at, unit: "S2.p1")
        let one = Self.width([Word(text: "1", bold: false, unit: nil)], size: 9), two = Self.width([Word(text: "2", bold: false, unit: nil)], size: 9)
        _ = para("1", size: 9, at: At(page: 0, x0: 306 - one / 2, x1: 600, top: 765, baseline: 765, bottom: 800), unit: nil)
        _ = para("1 The readers were volunteers from one department.", size: 8, at: At(page: 1, x0: 54, x1: 297, top: 548, baseline: 548, bottom: 600), unit: "Sx.n1")
        _ = para("2", size: 9, at: At(page: 1, x0: 396 - two / 2, x1: 700, top: 590, baseline: 590, bottom: 612), unit: nil)
    }

    // Each unit's boxes as FoldMake gives them (R5-SPEC 3.4): its first page; one box a line, its words' union, a box on
    // another page carrying that page as a fifth element.
    func unitBoxes() -> [String: (page: Int, boxes: [[Double]])] {
        var out: [String: (page: Int, boxes: [[Double]])] = [:]
        for line in lines {
            var byUnit: [String: [Double]] = [:]
            var order: [String] = []
            for w in line.words {
                guard let u = w.unit else { continue }
                if let b = byUnit[u] { byUnit[u] = [min(b[0], w.box[0]), min(b[1], w.box[1]), max(b[2], w.box[2]), max(b[3], w.box[3])] } else { byUnit[u] = w.box; order.append(u) }
            }
            for u in order {
                guard var b = byUnit[u] else { continue }
                let first = out[u]?.page ?? line.page + 1
                if first != line.page + 1 { b.append(Double(line.page + 1)) }
                out[u] = (first, (out[u]?.boxes ?? []) + [b])
            }
        }
        return out
    }

    // The PDF: drawn, then its second page turned (written to a file of its own, never over the one read).
    func write(in dir: URL) throws -> URL {
        let made = dir.appendingPathComponent("paper-\(UUID().uuidString).pdf")
        var box = CGRect(x: 0, y: 0, width: 612, height: 792)
        guard let ctx = CGContext(made as CFURL, mediaBox: &box, nil) else { throw CocoaError(.fileWriteUnknown) }
        for p in 0..<2 {
            ctx.beginPDFPage(nil)
            ctx.saveGState()
            // (as shown, x across and y up: the page's own x is 612 less that y, its y that x)
            if p == 1 { ctx.concatenate(CGAffineTransform(a: 0, b: 1, c: -1, d: 0, tx: 612, ty: 0)) }
            ctx.textMatrix = .identity
            for line in lines where line.page == p {
                ctx.textPosition = CGPoint(x: line.x, y: Self.shown[p].height - line.baseline)
                CTLineDraw(CTLineCreateWithAttributedString(Self.attributed(line.words, size: line.size)), ctx)
            }
            ctx.restoreGState()
            ctx.endPDFPage()
        }
        ctx.closePDF()
        guard let doc = PDFDocument(url: made) else { throw CocoaError(.fileReadCorruptFile) }
        doc.page(at: 1)?.rotation = 90
        let turned = dir.appendingPathComponent("paper-turned-\(UUID().uuidString).pdf")
        guard doc.write(to: turned) else { throw CocoaError(.fileWriteUnknown) }
        return turned
    }

    // Two pages holding only a picture (a grey bitmap): a scan.
    static func imageOnly(in dir: URL) throws -> URL {
        let url = dir.appendingPathComponent("scan-\(UUID().uuidString).pdf")
        var box = CGRect(x: 0, y: 0, width: 612, height: 792)
        guard let ctx = CGContext(url as CFURL, mediaBox: &box, nil),
              let bitmap = CGContext(data: nil, width: 64, height: 64, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)
        else { throw CocoaError(.fileWriteUnknown) }
        bitmap.setFillColor(gray: 0.6, alpha: 1)
        bitmap.fill(CGRect(x: 0, y: 0, width: 64, height: 64))
        guard let image = bitmap.makeImage() else { throw CocoaError(.fileWriteUnknown) }
        for _ in 0..<2 {
            ctx.beginPDFPage(nil)
            ctx.draw(image, in: CGRect(x: 72, y: 72, width: 468, height: 648))
            ctx.endPDFPage()
        }
        ctx.closePDF()
        return url
    }
}
