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
    }

    override func tearDown() async throws { try? FileManager.default.removeItem(at: home) }

    private func launcher() -> LauncherModel {
        let model = LauncherModel(bridge: bridge, desktop: FakeDesktop(), env: ["HOME": home.path, "hostname": "mac"], runner: FakeRunner(), fetcher: FakeFetcher())
        model.willShow(query: "")
        return model
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
        let paper = FixturePaper()
        let url = try paper.write(in: home)
        let doc = try XCTUnwrap(PDFDocument(url: url))
        XCTAssertEqual(doc.pageCount, 2)
        let payload = (0..<2).map { FoldPDF.page(doc.page(at: $0), n: $0 + 1) }
        XCTAssertEqual(payload.map { $0["size"] as? [Double] ?? [] }, [[612, 792], [792, 612]], "the sizes as the pages show")
        // (what PDFKit gave for each line: its text, box, ranges, how they were read and how many words had no box)
        let reports = try (0..<2).map { FoldPDF.lineReport(of: try XCTUnwrap(doc.page(at: $0))) }
        for drawn in paper.lines {
            let lines = payload[drawn.page]["lines"] as? [[String: Any]] ?? []
            let texts = drawn.words.map(\.text)
            let seen = reports[drawn.page].filter { r in texts.prefix(2).allSatisfy { r.contains($0) } }.joined(separator: " // ")
            let found = lines.filter { (($0["w"] as? [[Any]]) ?? []).compactMap { $0.first as? String } == texts }
            XCTAssertEqual(found.count, 1, "page \(drawn.page + 1): the line \(texts.joined(separator: " ")) once, its words in order (\(lines.count) lines read); PDFKit: \(seen)")
            guard let line = found.first else { continue }
            XCTAssertEqual(line["t"] as? String, texts.joined(separator: " "))
            XCTAssertEqual((line["s"] as? Double) ?? 0, Double(drawn.size), accuracy: 0.5, "its size: \(texts.joined(separator: " ")), its box \((line["b"] as? [Double]) ?? []); PDFKit: \(seen)")
            let bold = drawn.words.filter(\.bold).count * 2 > drawn.words.count
            XCTAssertEqual(((line["f"] as? Int) ?? 0) & 1, bold ? 1 : 0, "bold: \(texts.joined(separator: " "))")
            XCTAssertEqual(line["lb"] as? Int, drawn.words.prefix(while: { $0.bold }).count, "the bold words at its start: \(texts.joined(separator: " "))")
            let words = line["w"] as? [[Any]] ?? []
            for (w, want) in zip(words, drawn.words) {
                let got = w.dropFirst().compactMap { $0 as? Double }
                XCTAssertEqual(got.count, 4)
                for k in 0..<min(4, got.count) {
                    XCTAssertEqual(got[k], want.box[k], accuracy: 0.01, "page \(drawn.page + 1) \(want.text) [\(k)]: got \(got), drawn \(want.box); PDFKit: \(seen)")
                }
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
        XCTAssertEqual(style.family, "Helvetica", "the family most of its characters are set in")
    }

    // R5-SPEC 3.1 (extractor 2): font names that say bold or italic, and the PDF's own outline in order with levels
    // and pages
    // Extractor 3: the fonts the page's content stream shows its text in give each word its weight, as PDFKit does
    // where it can (a PDF whose fonts PDFKit reads only as plain Helvetica has nothing else to tell its headings by).
    func testThePagesOwnFontsGiveEachWordItsWeight() throws {
        let url = try FixturePaper().write(in: home)
        let page = try XCTUnwrap(PDFDocument(url: url)?.page(at: 0))
        let shown = FoldPDF.shown(on: page)
        XCTAssertFalse(shown.isEmpty, "the page's text is shown somewhere")
        XCTAssertTrue(shown.contains { $0.bold }, "Helvetica-Bold says bold")
        let index = FoldPDF.Shown.index(shown)
        var bold = 0, found = 0, plain = 0, wrong = 0
        for line in FoldPDF.pageLines(page) {
            for w in FoldPDF.lineWords(line, on: page, styled: true) where !w.chars.isEmpty && !w.rect.isNull {
                let isBold = w.chars.filter { $0.bold }.count * 2 > w.chars.count
                let again = index.restyle(FoldPDF.Word(text: w.text, rect: w.rect))
                let says = again.chars.filter { $0.bold }.count * 2 > again.chars.count
                if isBold { bold += 1; if says { found += 1 } } else { plain += 1; if says { wrong += 1 } }
                XCTAssertEqual(again.chars.first?.family, "Helvetica", w.text + ": its font's family")
            }
        }
        XCTAssertGreaterThan(bold, 0)
        XCTAssertGreaterThanOrEqual(Double(found), 0.9 * Double(bold), "\(found) of \(bold) bold words found by their fonts")
        XCTAssertLessThanOrEqual(Double(wrong), 0.02 * Double(plain), "\(wrong) of \(plain) plain words read as bold")
    }

    func testFontNamesSayBoldOrItalicAndTheOutlineComesInOrder() throws {
        for (name, bold, italic) in [("NimbusRomNo9L-Medi", true, false), ("NimbusRomNo9L-ReguItal", false, true), ("NimbusRomNo9L-MediItal", true, true),
                                     ("Helvetica-Medium", true, false), ("MinionPro-Bold", true, false), ("Intermedia-Regular", false, false),
                                     ("DSDigital", false, false), ("Times-Italic", false, true), ("NimbusRomNo9L-Regu", false, false),
                                     ("AdvOT5af5756d.B", true, false), ("AdvOT87d8d5de.I", false, true), ("AdvOTff5eba6d.BI", true, true),
                                     ("AdvOTb44e3105", false, false), ("Memphis-Bold", true, false), ("AdvPSSym", false, false)] {
            let t = FoldPDF.traits(named: name)
            XCTAssertEqual(t.bold, bold, name + ": bold")
            XCTAssertEqual(t.italic, italic, name + ": italic")
        }
        // (extractor 3: a BaseFont's subset tag and a composite font's encoding aren't its name)
        XCTAssertEqual(FoldPDF.baseName("ABCDEF+AdvOT5af5756d.B"), "AdvOT5af5756d.B")
        XCTAssertEqual(FoldPDF.baseName("QWERTY+Minion-Bold-Identity-H"), "Minion-Bold")
        XCTAssertEqual(FoldPDF.baseName("Helvetica"), "Helvetica")
        for (name, family) in [("MinionPro-Bold", "MinionPro"), ("AdvOT5af5756d.B", "AdvOT5af5756d"), ("AdvOTb44e3105", "AdvOTb44e3105"),
                               ("Times-Roman", "Times"), ("Helvetica", "Helvetica")] {
            XCTAssertEqual(FoldPDF.family(name), family, name)
        }
        let url = try FixturePaper().write(in: home)
        XCTAssertEqual(FoldPDF(url: url).outlineNow().count, 0, "no outline: none")
        let doc = try XCTUnwrap(PDFDocument(url: url))
        let root = PDFOutline()
        let intro = PDFOutline(), scope = PDFOutline(), method = PDFOutline()
        intro.label = "1 Introduction"
        intro.destination = PDFDestination(page: try XCTUnwrap(doc.page(at: 0)), at: .zero)
        scope.label = "1.1 Scope"
        scope.destination = PDFDestination(page: try XCTUnwrap(doc.page(at: 1)), at: .zero)
        method.label = " 2 Method "
        root.insertChild(intro, at: 0)
        root.insertChild(method, at: 1)
        intro.insertChild(scope, at: 0)
        doc.outlineRoot = root
        let outlined = home.appendingPathComponent("outlined.pdf")
        XCTAssertTrue(doc.write(to: outlined))
        let got = FoldPDF(url: outlined).outlineNow().map { "\($0["l"] as? Int ?? 0) \($0["p"] as? Int ?? -1) \($0["t"] as? String ?? "")" }
        XCTAssertEqual(got, ["1 1 1 Introduction", "2 2 1.1 Scope", "1 0 2 Method"], "its entries in order, levels from 1, pages from 1 (0 with none)")
    }

    private func paperMeta(_ url: URL, pages: Int, sizes: [[Double]]) -> [String: Any] {
        let bytes = ((try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? NSNumber)?.intValue ?? 0
        return ["title": "Folding a Paper: A Small Synthetic Study", "authors": ["Rivera, Ana", "Okafor, Ben"], "date": "2026-01-15", "cite": "Rivera and Okafor, 2026",
                "pdf": ["sha256": FoldPDF.sha256(of: url) ?? "", "bytes": bytes, "modified": "2026-11-06T10:00:00Z", "pages": pages, "sizes": sizes],
                "made_with": "Zotero Launcher test", "exported": "2026-11-06T10:00:00Z"]
    }

    // R5-SPEC 3.2: Zotero's abstract goes to FoldMake with the rest of the paper's meta (what finds an abstract set
    // without a heading, or one the front matter would take)
    func testTheReadMetaCarriesZoterosAbstract() throws {
        let paper = try XCTUnwrap(Fixture.bridge("item")["paper"] as? [String: Any])
        let abstract = try XCTUnwrap(paper["abstract"] as? String)
        XCTAssertFalse(abstract.isEmpty)
        let info: [String: Any] = ["bytes": 1234, "modified": "2026-11-06T10:00:00Z", "pages": 2, "sizes": [[612.0, 792.0], [792.0, 612.0]]]
        let meta = FoldWindowModel.readMeta(paper, title: "A paper", cite: "Doe (2016)", pdf: info, version: "0.4.35", now: Date(timeIntervalSince1970: 0))
        XCTAssertEqual(meta["abstract"] as? String, abstract)
        XCTAssertEqual(meta["title"] as? String, paper["title"] as? String)
        XCTAssertEqual(meta["cite"] as? String, "Doe (2016)")
        XCTAssertEqual((meta["pdf"] as? [String: Any])?["pages"] as? Int, 2)
        XCTAssertEqual(meta["made_with"] as? String, "Zotero Launcher 0.4.35")
        XCTAssertEqual(FoldWindowModel.readMeta([:], title: "A paper", cite: "", pdf: info, version: "", now: Date())["abstract"] as? String, "", "none: empty")
    }

    // R5-26: a Fold again's Finish or Try it again carries the sections that Fold again had folded, so a second Stop
    // counts them and the next Finish doesn't ask for them again; anything else starts with none
    func testAFoldAgainsFinishCarriesTheSectionsItHadFolded() {
        let again: [String: Any] = ["doc": "pdf-1", "force": true, "status": "stopped", "sections": ["abstract": "done", "S1": "failed", "S2": "done"]]
        let left = ["S1", "S2.SS1", "A1"]
        XCTAssertEqual(FoldWindowModel.carried(again, doc: "pdf-1", force: true, only: left) as? [String: String], ["abstract": "done", "S2": "done"])
        XCTAssertEqual(FoldWindowModel.carried(again, doc: "pdf-1", force: true, only: ["S2"]) as? [String: String], ["abstract": "done"], "what it asks for again isn't carried")
        XCTAssertTrue(FoldWindowModel.carried(again, doc: "pdf-1", force: true, only: nil).isEmpty, "Fold again itself starts over")
        XCTAssertTrue(FoldWindowModel.carried(again, doc: "pdf-1", force: false, only: left).isEmpty, "a first fold's Finish counts the doc's sections")
        XCTAssertTrue(FoldWindowModel.carried(again, doc: "pdf-2", force: true, only: left).isEmpty, "another doc's run")
        var first = again
        first["force"] = false
        XCTAssertTrue(FoldWindowModel.carried(first, doc: "pdf-1", force: true, only: left).isEmpty, "after a first fold")
        XCTAssertTrue(FoldWindowModel.carried(nil, doc: "pdf-1", force: true, only: left).isEmpty)
    }

    // R5-35: two columns' lines PDFKit gave as one across a 14.45 pt gutter, their spaces 7 to 8 pt (under
    // cutAtMiddle's twice): cut at the gutter the page's other lines show; a justified line across the page stays whole
    func testALooselyJustifiedLineAcrossTheGutterIsCutThere() {
        let W = 612.0, H = 792.0, size = 10.0
        func run(_ xs: [(Double, Double)], y: Double) -> [(word: FoldPDF.Word, box: [Double])] {
            xs.map { (word: FoldPDF.Word(text: "word", rect: .zero), box: [$0.0 / W, (y - size) / H, $0.1 / W, y / H]) }
        }
        // (words 28 pt wide from x0 to x1, spaced evenly: 7 to a column leave spaces of 8.1 pt)
        func words(_ x0: Double, _ x1: Double, _ n: Int) -> [(Double, Double)] {
            let space = (x1 - x0 - 28 * Double(n)) / Double(n - 1)
            return (0..<n).map { i in let a = x0 + Double(i) * (28 + space); return (a, a + 28) }
        }
        let L1 = (W - 14.45) / 2, R0 = L1 + 14.45
        var page: [[(word: FoldPDF.Word, box: [Double])]] = []
        for i in 0..<6 { page.append(run(words(54, L1, 7), y: 100 + Double(i) * 12)); page.append(run(words(R0, 558, 7), y: 100 + Double(i) * 12)) }
        let gutter = FoldPDF.gutter(page, shownW: W)
        XCTAssertEqual(gutter?.a ?? 0, L1, accuracy: 0.01, "the left column's right edge: \(String(describing: gutter))")
        XCTAssertEqual(gutter?.b ?? 0, R0, accuracy: 0.01, "the right column's left edge: \(String(describing: gutter))")
        let merged = run(words(54, L1, 7) + words(R0, 558, 7), y: 200)
        let spaces = (1..<merged.count).map { String(format: "%.1f", (merged[$0].box[0] - merged[$0 - 1].box[2]) * W) }.joined(separator: ",")
        XCTAssertEqual(FoldPDF.cutAtMiddle(merged, shownW: W, high: size).count, 1, "cutAtMiddle keeps it (spaces \(spaces))")
        if let g = gutter {
            let parts = FoldPDF.cutAtGutter(merged, g, shownW: W, high: size)
            XCTAssertEqual(parts.map { $0.count }, [7, 7], "cut at the gutter (spaces \(spaces))")
            XCTAssertEqual(FoldPDF.cutAtGutter(run(words(54, 558, 14), y: 300), g, shownW: W, high: size).count, 1, "a justified line across the page")
        }
        XCTAssertNil(FoldPDF.gutter(Array(page.prefix(6)), shownW: W), "fewer than 5 lines a side: no gutter")
    }

    // R5-36: FoldMaker on that PDF: FIXTURE 6.3's ids and kinds for the units it holds, each unit's boxes where its
    // words were drawn; an image-only PDF is a scan
    func testFoldMakerReadsThePaperIntoItsUnitsAndBoxesAndAScanIsAScan() throws {
        let paper = FixturePaper()
        let url = try paper.write(in: home)
        let pdf = FoldPDF(url: url)
        guard case .success(let info) = pdf.openNow() else { return XCTFail("didn't open") }
        let pages = pdf.linesNow()
        XCTAssertEqual(FoldMaker.language(of: pages), "en")
        let maker = try FoldMaker()
        XCTAssertEqual(maker.extractor, 3)
        let made = try maker.read(pages, meta: paperMeta(url, pages: info.pages, sizes: info.sizes).merging(["lang": "en"]) { $1 })
        XCTAssertNil(made.problem)
        let doc = try XCTUnwrap(made.doc)
        let sections = doc["sections"] as? [[String: Any]] ?? []
        let got = sections.map { s in (s["id"] as? String ?? "") + ": " + (s["units"] as? [[String: Any]] ?? []).map { ($0["id"] as? String ?? "") + " " + ($0["kind"] as? String ?? "") }.joined(separator: ", ") }
        // (the lines FoldMake was given, each its size, flags, bold run-in and box, for a message that explains itself)
        let given = pages.map { p in (p["lines"] as? [[String: Any]] ?? []).map { l in "p\((p["n"] as? Int) ?? 0) s\((l["s"] as? Double) ?? 0) f\((l["f"] as? Int) ?? 0) lb\((l["lb"] as? Int) ?? 0) \((l["b"] as? [Double]) ?? []) \((l["t"] as? String) ?? "")" } }
            .flatMap { $0 }.joined(separator: " // ")
        XCTAssertEqual(got, ["abstract: abstract.p1 abstract", "S1: S1.p1 paragraph, S1.p2 paragraph", "S2: S2.p1 paragraph", "Sx: Sx.n1 footnote"], "the lines: \(given)")
        let map = try XCTUnwrap((made.links?["map"]) as? [String: Any])
        for (unit, want) in paper.unitBoxes() {
            guard let entry = map[unit] as? [String: Any] else { XCTFail("\(unit) isn't in the link map: \(map.keys.sorted())"); continue }
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
        let scan = try FixturePaper.imageOnly(in: home)
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
        let paper = FixturePaper()
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
        XCTAssertEqual(FoldMaker.cached(doc, links: links, bytes: bytes, modified: "2026-11-06T10:00:00Z", extractor: 3, sha256: same), .stale, "an older reading, nothing folded")
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
        let paper = PaperRef(key: "P3NM4G92", libraryID: 1, title: "A paper", itemType: "journalArticle")
        let window = FoldWindowModel(paper: paper, launcher: model)
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
        XCTAssertEqual(FoldWindowModel.prefs["pdfWidth"] as? Double, 4000, "no fixed cap: the page narrows it to the window")
        XCTAssertEqual(FoldWindowModel.prefs["margin"] as? Bool, false)

        // the toolbar's text size buttons: one step of the window's zoom each way (as ⌘- ⌘+)
        FoldWindowModel.zoom = 1
        defer { FoldWindowModel.zoom = 1 }
        window.handle(["type": "zoom", "step": 1])
        XCTAssertEqual(FoldWindowModel.zoom, 1.1)
        window.handle(["type": "zoom", "step": 9])
        XCTAssertEqual(FoldWindowModel.zoom, 1.25, "one step at a time")
        window.handle(["type": "zoom", "step": -1])
        window.handle(["type": "zoom", "step": -1])
        XCTAssertEqual(FoldWindowModel.zoom, 1)
        window.handle(["type": "prefs", "level": "nonsense"])
        XCTAssertEqual(FoldWindowModel.prefs["level"] as? String, "key")
        UserDefaults.standard.removeObject(forKey: "ZLFoldPrefs")
        window.windowClosing()
    }

    // ---- R5: the window's fold

    private static let paperRef = PaperRef(key: "P3NM4G92", libraryID: 1, title: "A paper", itemType: "journalArticle")

    // The main run loop turned until `cond` holds, or `timeout` seconds went by; whether it held.
    private func until(_ timeout: TimeInterval = 10, _ cond: () -> Bool) -> Bool {
        let end = Date().addingTimeInterval(timeout)
        while !cond() && Date() < end { RunLoop.main.run(until: Date().addingTimeInterval(0.01)) }
        return cond()
    }

    private func object(_ text: String?) -> [String: Any] {
        (text.flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) } as? [String: Any]) ?? [:]
    }

    // Settings › Defaults › Fold with AI: its model and effort are what the plan and a fold ask, and Fold again's model;
    // a stopped run's Finish keeps the model it began with.
    func testFoldWithAIAsksTheModelAndEffortOfSettingsDefaults() throws {
        let settingsFile = home.appendingPathComponent(".config/omarchy/oma-zotero-launcher.json")
        try FileManager.default.createDirectory(at: settingsFile.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(#"{"defaults": {"fold": {"model": "lab:m2", "effort": "high"}}}"#.utf8).write(to: settingsFile)
        let model = launcher()
        let runner = try XCTUnwrap(model.runner as? FakeRunner)
        let pdfURL = try FixturePaper().write(in: home)
        bridge.answers["/attachment"] = { _ in .ok(["path": pdfURL.path]) }
        let plan: [String: Any] = ["model": "lab:m2", "name": "Lab two", "provider": "Lab", "effort": "high", "sections": 3, "calls": 3, "cached": 0, "inputTokens": 900, "outputTokens": 300, "costUsd": 0.004]
        runner.answers["fold"] = { _, _ in FakeRunner.json(plan) }
        runner.holdStreams.insert("fold")
        let window = FoldWindowModel(paper: Self.paperRef, launcher: model)
        let page = FakeFoldPage()
        window.page = page
        window.handle(["type": "ready"])
        XCTAssertTrue(until { page.folds.last?["calls"] as? Int == 3 }, "the plan on the page: \(page.folds.last ?? [:])")
        let asked = object(runner.calls("fold").first?.stdin)
        XCTAssertEqual([asked["model"] as? String, asked["effort"] as? String], ["lab:m2", "high"])
        XCTAssertEqual(page.folds.last?["effort"] as? String, "high", "the banner's effort")
        window.handle(["type": "fold"])
        let first = object(runner.calls("fold").last?.stdin)
        XCTAssertEqual([first["model"] as? String, first["effort"] as? String], ["lab:m2", "high"])
        let run = try XCTUnwrap(runner.streams.last)
        run.emit(["type": "start", "model": "lab:m3", "name": "Lab three", "provider": "Lab", "sections": 3, "calls": 3, "cached": 0]) // (as a fallback answers)
        window.handle(["type": "stop"])
        XCTAssertTrue(until { page.folds.last?["kind"] as? String == "stopped" })
        window.handle(["type": "fold", "only": ["S1", "S2"]])
        let finish = object(runner.calls("fold").last?.stdin)
        XCTAssertEqual([finish["model"] as? String, finish["effort"] as? String], ["lab:m3", "high"], "Finish folding: the model it began with, the effort set")
        window.handle(["type": "stop"])
        window.windowClosing()
    }

    // R5-38: the plan and a fold with a fake runner: the stdin, the events into doc.json, links.json and fold.json,
    // Stop and closing, 143, 127, an old runner, a fold.json left folding
    func testThePlanAndAFoldStreamedFromAFakeRunnerAndEveryWayAFoldEnds() throws {
        let model = launcher()
        let runner = try XCTUnwrap(model.runner as? FakeRunner)
        let pdfURL = try FixturePaper().write(in: home)
        bridge.answers["/attachment"] = { _ in .ok(["path": pdfURL.path]) }
        let plan: [String: Any] = ["model": "lab:m1", "name": "Lab model", "provider": "Lab", "sections": 3, "calls": 3, "cached": 0, "inputTokens": 900, "outputTokens": 300, "costUsd": 0.004]
        runner.answers["fold"] = { _, _ in FakeRunner.json(plan) }
        runner.holdStreams.insert("fold")
        let window = FoldWindowModel(paper: Self.paperRef, launcher: model)
        let page = FakeFoldPage()
        window.page = page
        window.handle(["type": "ready"])
        XCTAssertTrue(until { page.folds.last?["calls"] as? Int == 3 }, "the plan on the page: \(page.folds.last ?? [:]), \(page.states.last ?? [:])")
        let asked = try XCTUnwrap(runner.calls("fold").first)
        XCTAssertEqual(Array(asked.argv.suffix(3)), ["fold", "--plan", "--quiet"])
        let input = object(asked.stdin)
        XCTAssertEqual(Set(input.keys), ["paper", "model", "effort", "force", "only", "doc"])
        XCTAssertEqual(input["paper"] as? String, "1:P3NM4G92")
        XCTAssertEqual(input["model"] as? String, "default")
        XCTAssertEqual(input["effort"] as? String, "low", "Settings › Defaults › Fold with AI's effort: low unless picked")
        XCTAssertEqual(((input["doc"] as? [String: Any])?["sections"] as? [[String: Any]])?.compactMap { $0["id"] as? String }, ["abstract", "S1", "S2"])
        XCTAssertFalse((asked.stdin ?? "").contains("\"key\""), "no key in what the runner is sent")
        XCTAssertEqual(page.folds.last?["kind"] as? String, "unfolded")
        XCTAssertEqual(page.folds.last?["name"] as? String, "Lab model")
        let store = try XCTUnwrap(window.store)
        let docId = try XCTUnwrap(store.readJSON(FoldStore.doc)?["id"] as? String)
        XCTAssertTrue(docId.hasPrefix("pdf-"))

        // a fold, streamed: each section into doc.json, links.json and fold.json as it comes
        window.handle(["type": "fold"])
        let run = try XCTUnwrap(runner.streams.last)
        let call = try XCTUnwrap(runner.calls("fold").last)
        XCTAssertTrue(call.argv.contains("--quiet") && !call.argv.contains("--plan"), call.argv.joined(separator: " "))
        XCTAssertEqual(page.folds.last?["kind"] as? String, "folding")
        XCTAssertEqual(store.readRun()?["status"] as? String, "folding")
        run.emit(["type": "start", "model": "lab:m1", "name": "Lab model", "provider": "Lab", "sections": 3, "calls": 3, "cached": 0])
        XCTAssertEqual(page.flashes.last, "Started: folding 3 sections with Lab model")
        let unit: [String: Any] = ["id": "S1.p1", "role": "claim", "evidence": [0], "key": "Researchers read many papers each week.", "takeaway": "Researchers read many papers", "topic": "papers"]
        run.emit(["type": "section", "id": "S1", "model": "lab:m1", "cached": false, "section": ["takeaway": "Readers skim many papers", "topic": "papers"], "units": [unit], "warnings": [Any]()])
        let doc = try XCTUnwrap(store.readJSON(FoldStore.doc))
        let s1 = (doc["sections"] as? [[String: Any]] ?? []).first { $0["id"] as? String == "S1" }
        XCTAssertEqual(s1?["made"] as? String, "ai")
        XCTAssertEqual((s1?["units"] as? [[String: Any]])?.first?["takeaway"] as? String, "Researchers read many papers")
        let made = (doc["provenance"] as? [String: Any])?["levels_made"] as? String ?? ""
        XCTAssertFalse(made.isEmpty)
        XCTAssertEqual((store.readJSON(FoldStore.links)?["doc"] as? [String: Any])?["levels_made"] as? String, made, "links.json follows the doc")
        XCTAssertEqual((store.readRun()?["sections"] as? [String: Any])?["S1"] as? String, "done")
        XCTAssertEqual(page.folds.last?["done"] as? Int, 1)
        run.emit(["type": "failed", "id": "S2", "error": "the reply has no JSON"])
        run.emit(["type": "done", "folded": 1, "failed": 1, "stopped": "", "costUsd": 0.002, "models": ["lab:m1"]])
        run.end()
        XCTAssertEqual(store.readRun()?["status"] as? String, "partial")
        XCTAssertEqual((store.readRun()?["errors"] as? [String: Any])?["S2"] as? String, "the reply has no JSON")
        XCTAssertEqual(page.flashes.last, "Folding is done: 1 folded, 1 failed")
        XCTAssertEqual(page.folds.last?["kind"] as? String, "partial")
        XCTAssertEqual(page.folds.last?["failed"] as? [String], ["S2"])
        XCTAssertEqual((page.loads.last?["fold"] as? [String: Any])?["kind"] as? String, "partial", "FR.load carries the fold")
        XCTAssertEqual((page.loads.last?["doc"] as? [String: Any])?["id"] as? String, docId)

        // Try it again: only the failed one, with fold.json's model; Stop: the stream stopped, 143, stopped
        window.handle(["type": "fold", "only": ["S2"]])
        let again = object(runner.calls("fold").last?.stdin)
        XCTAssertEqual(again["only"] as? [String], ["S2"])
        XCTAssertEqual(again["model"] as? String, "lab:m1", "one paper, one model")
        let second = try XCTUnwrap(runner.streams.last)
        window.handle(["type": "fold"]) // (ignored while a run goes)
        XCTAssertTrue(runner.streams.last === second)
        window.handle(["type": "stop"])
        XCTAssertTrue(second.stopped)
        XCTAssertEqual(store.readRun()?["status"] as? String, "stopped")
        XCTAssertEqual(page.folds.last?["kind"] as? String, "stopped")
        XCTAssertEqual(page.flashes.last, "Stopped: 1 of 3 sections folded, the rest show first sentences")

        // Fold again: everything, with the default model; closing the window stops it
        window.handle(["type": "fold", "force": true])
        let forced = object(runner.calls("fold").last?.stdin)
        XCTAssertEqual(forced["force"] as? Bool, true)
        XCTAssertEqual(forced["model"] as? String, "default")
        let third = try XCTUnwrap(runner.streams.last)
        XCTAssertFalse(third === second)
        window.windowClosing()
        XCTAssertTrue(third.stopped, "closing the window stops the fold")
        XCTAssertEqual(store.readRun()?["status"] as? String, "stopped")

        // a fold.json left folding (the app quit meanwhile) opens as stopped
        var left = try XCTUnwrap(store.readRun())
        left["status"] = "folding"
        try store.writeRun(left)
        let reopened = FoldWindowModel(paper: Self.paperRef, launcher: model)
        XCTAssertEqual(reopened.run?["status"] as? String, "stopped")
        XCTAssertEqual(store.readRun()?["status"] as? String, "stopped")
        let page2 = FakeFoldPage()
        reopened.page = page2
        reopened.handle(["type": "ready"])
        XCTAssertTrue(until { page2.folds.last?["kind"] as? String == "stopped" }, "\(page2.folds.last ?? [:])")
        reopened.windowClosing()

        // the runner not there (127): no-runner; older than the app (2, its usage): old-runner
        for (result, kind) in [(RunnerResult(status: 127, missing: true), "no-runner"), (RunnerResult(status: 2, stderr: "usage: oma-zotero-prompt <command>"), "old-runner")] {
            runner.answers["fold"] = { _, _ in result }
            let w = FoldWindowModel(paper: Self.paperRef, launcher: model)
            let p = FakeFoldPage()
            w.page = p
            w.handle(["type": "ready"])
            // (one line, read when the check fails: an annotation shows only a message's first line, and a dictionary's
            // arrays print over several)
            let seen = { () -> String in
                let f = p.folds.last ?? [:], kept = store.readRun() ?? [:]
                let one = { (v: Any?) -> String in v.map { "\($0)" } ?? "none" }
                return "kind \(one(f["kind"])) disabled \(one(f["disabled"])) again \(one(f["again"])) done \(one(f["done"])) of \(one(f["total"]))" +
                    " left \((f["left"] as? [String] ?? []).joined(separator: ",")); fold.json status \(one(kept["status"])) force \(one(kept["force"]))"
            }
            XCTAssertTrue(until { p.folds.last?["kind"] as? String == kind }, "\(kind): \(seen())")
            XCTAssertEqual(p.folds.last?["disabled"] as? String, kind, seen())
            w.windowClosing()
        }
    }

    // R5-39: fixture mode answers fold --plan from fold-plan.json and fold from fold-stream.jsonl: the fixture paper
    // opens, folds and shows folded
    func testFixtureModeOpensFoldsAndShowsTheFixturePaperFolded() throws {
        let dir = try XCTUnwrap(Bundle(for: FakeBridge.self).resourceURL).appendingPathComponent("Fixtures")
        let runner = FixtureRunner(dir: dir, streamDelay: 0.01)
        let model = LauncherModel(bridge: FixtureBridge(dir: dir), desktop: FakeDesktop(), env: ["HOME": home.path, "hostname": "mac"], runner: runner, fetcher: FakeFetcher())
        model.willShow(query: "")
        let window = FoldWindowModel(paper: Self.paperRef, launcher: model)
        let page = FakeFoldPage()
        window.page = page
        window.handle(["type": "ready"])
        XCTAssertTrue(until { page.folds.last?["calls"] as? Int == 5 }, "fold-plan.json's plan: \(page.folds.last ?? [:]), \(page.states.last ?? [:])")
        XCTAssertEqual(page.folds.last?["kind"] as? String, "unfolded")
        XCTAssertEqual(page.folds.last?["name"] as? String, "Fixture model")
        XCTAssertTrue(runner.calls.contains { $0.contains("fold") && $0.contains("--plan") })
        window.handle(["type": "fold"])
        XCTAssertTrue(until { page.folds.last?["kind"] as? String == "folded" }, "\(page.folds.last ?? [:])")
        XCTAssertEqual(page.flashes.last, "Folding is done: 3 sections")
        let doc = try XCTUnwrap(page.loads.last?["doc"] as? [String: Any])
        XCTAssertEqual((doc["provenance"] as? [String: Any])?["model"] as? String, "fixture:model")
        window.windowClosing()
    }

    // A PDF of `pages` pages of 45 lines of Helvetica 10, each its own sentence.
    private func makeLongPDF(pages: Int) throws -> URL {
        let made = home.appendingPathComponent("long-\(UUID().uuidString).pdf")
        var box = CGRect(x: 0, y: 0, width: 612, height: 792)
        let ctx = try XCTUnwrap(CGContext(made as CFURL, mediaBox: &box, nil))
        let font = CTFontCreateWithName("Helvetica" as CFString, 10, nil)
        for p in 0..<pages {
            ctx.beginPDFPage(nil)
            for i in 0..<45 {
                let text = "Page \(p + 1), part \(i + 1): each level keeps the words that the next level needs."
                let attr = NSAttributedString(string: text, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font])
                ctx.textPosition = CGPoint(x: 72, y: 700 - CGFloat(i) * 13)
                CTLineDraw(CTLineCreateWithAttributedString(attr), ctx)
            }
            ctx.endPDFPage()
        }
        ctx.closePDF()
        return made
    }

    // R5-40: a 40-page PDF, nothing cached: the window open to its text within 5 s (the state reading meanwhile)
    func testAWindowOpensA40PagePaperToItsTextWithinItsBudget() throws {
        let url = try makeLongPDF(pages: 40)
        bridge.answers["/attachment"] = { _ in .ok(["path": url.path]) }
        let model = launcher()
        let t0 = Date()
        let window = FoldWindowModel(paper: Self.paperRef, launcher: model)
        let page = FakeFoldPage()
        window.page = page
        window.handle(["type": "ready"])
        XCTAssertTrue(until(10) { page.loads.contains { $0["doc"] is [String: Any] } }, "\(page.states.last ?? [:])")
        let took = Date().timeIntervalSince(t0)
        XCTAssertLessThan(took, 5, "open to text: \(took) s")
        XCTAssertTrue(page.loads.contains { ($0["state"] as? [String: Any])?["kind"] as? String == "reading" } || page.states.contains { $0["kind"] as? String == "reading" },
                      "the state reading meanwhile")
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
    var folds: [[String: Any]] = []
    var batches: [[String: Any]] = []
    var papers: [[String: Any]] = []
    var flashes: [String] = []
    func load(_ data: [String: Any]) { loads.append(data) }
    func state(_ s: [String: Any]) { states.append(s) }
    func fold(_ f: [String: Any]) { folds.append(f) }
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
