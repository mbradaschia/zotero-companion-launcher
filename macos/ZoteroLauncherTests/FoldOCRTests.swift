import AppKit
import CoreText
import PDFKit
import XCTest
@testable import ZoteroLauncher

// A scan's pages read by OCR (docs/fold-reader/R5-SPEC.md 3.8, criteria R5-64 to R5-67): the fixture paper drawn as
// pictures, a publisher's download stamp the only text on each page (as Emerald's PDFs of older papers have it), read
// by Apple's Vision into the reader's doc; and the app's `--ocr` command the runner calls.
final class FoldOCRTests: XCTestCase {
    private var home: URL!

    override func setUp() async throws {
        home = FileManager.default.temporaryDirectory.appendingPathComponent("fold-ocr-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
    }

    override func tearDown() async throws { try? FileManager.default.removeItem(at: home) }

    static let stamp = "Downloaded from www.emerald.com/ijlm/article-pdf/12/1/1/898312/09574090110806190.pdf by FGV user on 12 November 2026"

    // The fixture paper's pages as pictures (drawn as they show, the turned one upright), one a page, with the stamp
    // in real text along the foot of each.
    private func scannedPaper() throws -> URL {
        let text = try FixturePaper().write(in: home)
        let source = try XCTUnwrap(PDFDocument(url: text))
        let url = home.appendingPathComponent("scanned-\(UUID().uuidString).pdf")
        let ctx = try XCTUnwrap(CGContext(url as CFURL, mediaBox: nil, nil))
        let font = CTFontCreateWithName("Helvetica" as CFString, 6, nil)
        for i in 0..<source.pageCount {
            let page = try XCTUnwrap(source.page(at: i))
            let image = try XCTUnwrap(FoldOCR.image(page))
            let box = page.bounds(for: .cropBox)
            let turned = FoldPDF.rotation(page) % 180 != 0
            var media = CGRect(x: 0, y: 0, width: turned ? box.height : box.width, height: turned ? box.width : box.height)
            let info = [kCGPDFContextMediaBox as String: NSData(bytes: &media, length: MemoryLayout<CGRect>.size)] as CFDictionary
            ctx.beginPDFPage(info)
            ctx.draw(image, in: media)
            let attr = NSAttributedString(string: Self.stamp, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font])
            ctx.textPosition = CGPoint(x: 40, y: 14)
            CTLineDraw(CTLineCreateWithAttributedString(attr), ctx)
            ctx.endPDFPage()
        }
        ctx.closePDF()
        return url
    }

    private func meta(_ url: URL, _ info: FoldPDF.Info) -> [String: Any] {
        ["title": "A reader that folds", "authors": ["Rivera, Ana"], "date": "2026", "cite": "Rivera, 2026",
         "pdf": ["bytes": 1000, "modified": "", "pages": info.pages, "sizes": info.sizes] as [String: Any]]
    }

    private func allText(_ doc: [String: Any]?) -> String {
        (doc?["sections"] as? [[String: Any]] ?? []).flatMap { ($0["units"] as? [[String: Any]] ?? []).map { ($0["sentences"] as? [String] ?? []).joined(separator: " ") } }.joined(separator: " ")
    }

    // R5-64: the stamp alone is no text: the PDF is a scan, both pages to read
    func testAPageWhoseOnlyTextIsADownloadStampIsAScan() throws {
        let url = try scannedPaper()
        let pdf = FoldPDF(url: url)
        guard case .success(let info) = pdf.openNow() else { return XCTFail("didn't open") }
        let lines = pdf.linesNow()
        let stamped = lines.flatMap { $0["lines"] as? [[String: Any]] ?? [] }.compactMap { $0["t"] as? String }
        XCTAssertTrue(stamped.allSatisfy { $0.hasPrefix("Downloaded from") }, "only the stamp is text: \(stamped)")
        let maker = try FoldMaker()
        let need = try maker.textless(lines, meta: meta(url, info))
        XCTAssertTrue(need.scan)
        XCTAssertEqual(need.pages, [1, 2])
        XCTAssertEqual(try maker.read(lines, meta: meta(url, info)).problem, "scan")
    }

    // R5-65: Vision reads a page's words, each with its box where the text PDF had it (within 0.02 of the page)
    func testVisionReadsThePagesWordsWithTheirBoxes() throws {
        let paper = FixturePaper()
        let text = try paper.write(in: home)
        let source = try XCTUnwrap(PDFDocument(url: text))
        let lines = try FoldOCR.lines(of: try XCTUnwrap(source.page(at: 0)))
        let words = lines.flatMap { $0.words }
        let said = words.map { $0.text }.joined(separator: " ")
        XCTAssertTrue(said.contains("Researchers read many papers each week"), "Vision read: \(said)")
        // the word "Researchers", where FoldPDF finds it in the text layer
        let truth = FoldPDF.lines(of: try XCTUnwrap(source.page(at: 0))).flatMap { $0["w"] as? [[Any]] ?? [] }.first { $0.first as? String == "Researchers" }
        let want = try XCTUnwrap(truth).dropFirst().compactMap { $0 as? Double }
        let got = try XCTUnwrap(words.first { $0.text == "Researchers" }, "no Researchers in \(said)").box
        for k in 0..<4 { XCTAssertEqual(got[k], want[k], accuracy: 0.02, "Researchers [\(k)]: \(got) vs \(want)") }
        // the payload FoldMake reads: text, box, a size near the body's 10 pt, the one family
        let page = FoldOCR.payload(lines, size: [612, 792])
        let body = try XCTUnwrap(page.first { ($0["t"] as? String ?? "").hasPrefix("Researchers read") })
        XCTAssertEqual(body["fn"] as? String, "ocr")
        let s = try XCTUnwrap(body["s"] as? Double)
        XCTAssertTrue(s >= 6 && s <= 14, "size \(s)")
        // a heading set in bold reads heavier than the body
        let heading = lines.first { $0.words.map(\.text).joined(separator: " ").hasSuffix("Introduction") }
        if let heading { XCTAssertTrue(heading.ink > 0, "ink measured") }
    }

    // R5-66: the scan read through FoldMaker.make: OCR's progress, then a doc of the paper's words that says which pages
    // OCR read; the turned page too
    func testAScanIsReadByOCRIntoTheDoc() throws {
        let url = try scannedPaper()
        let pdf = FoldPDF(url: url)
        guard case .success(let info) = pdf.openNow() else { return XCTFail("didn't open") }
        let made = expectation(description: "made")
        var steps: [Int] = []
        var result: FoldMaker.Made?
        FoldMaker.make(pdf, meta: meta(url, info), progress: { _, _ in }, ocr: { d, n in steps.append(d); XCTAssertEqual(n, 2) }) { r in
            if case .success(let m) = r { result = m } else { XCTFail("not made: \(r)") }
            made.fulfill()
        }
        wait(for: [made], timeout: 120)
        XCTAssertEqual(steps, [1, 2], "progress page by page")
        let m = try XCTUnwrap(result)
        XCTAssertNil(m.problem, "read, not \(m.problem ?? "")")
        let source = m.doc?["source"] as? [String: Any] ?? [:]
        XCTAssertEqual(source["ocr"] as? [Int], [1, 2])
        XCTAssertEqual(source["ocr_engine"] as? String, "vision")
        let text = allText(m.doc)
        XCTAssertTrue(text.contains("Most of that reading is skimming for the main claim"), "page 1: \(text)")
        XCTAssertTrue(text.contains("matched by runs of three words"), "page 2 (turned): \(text)")
        XCTAssertFalse(text.contains("Downloaded from"), "the stamp is furniture")
        let ids = (m.doc?["sections"] as? [[String: Any]] ?? []).compactMap { $0["id"] as? String }
        XCTAssertTrue(ids.contains("S1"), "a numbered heading read from the picture: \(ids)")
        // every unit is on the map, its boxes on the page
        let map = m.links?["map"] as? [String: Any] ?? [:]
        XCTAssertGreaterThan(map.count, 3)
        XCTAssertEqual(FoldMaker.Made(problem: "scan", ocr: "long", scanPages: 120).state?["ocr"] as? String, "long")
    }

    // R5-67: `ZoteroLauncher --ocr <pdf> <page>…` (the runner's OCR): a JSON line a page; usage and bad files say so
    func testTheOCRCommandPrintsAPagesLinesAsJSON() throws {
        let url = try scannedPaper()
        var out: [String] = [], err: [String] = []
        XCTAssertEqual(FoldOCR.command([url.path, "1", "3"], out: { out.append($0) }, err: { err.append($0) }), 0)
        XCTAssertEqual(out.count, 2)
        let first = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(out[0].utf8)) as? [String: Any])
        XCTAssertEqual(first["n"] as? Int, 1)
        let lines = first["lines"] as? [[String: Any]] ?? []
        XCTAssertTrue(lines.contains { ($0["t"] as? String ?? "").contains("Researchers read") }, "\(lines.prefix(5))")
        XCTAssertEqual((lines.first?["b"] as? [Double])?.count, 4)
        let missing = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(out[1].utf8)) as? [String: Any])
        XCTAssertEqual(missing["error"] as? String, "no page 3")
        XCTAssertEqual(FoldOCR.command([url.path], out: { _ in }, err: { err.append($0) }), 2)
        XCTAssertEqual(FoldOCR.command([url.path, "x"], out: { _ in }, err: { err.append($0) }), 2)
        XCTAssertEqual(FoldOCR.command([home.appendingPathComponent("none.pdf").path, "1"], out: { _ in }, err: { err.append($0) }), 3)
        XCTAssertEqual(err.count, 3)
    }

    // A word Vision gives the line's whole box is placed along the line by its characters
    func testWordsSpreadAlongALineWhenVisionGivesThemNoBoxes() {
        let text = "Supply chain metrics"
        var ranges: [Range<String.Index>] = []
        var at = text.startIndex
        for w in text.split(separator: " ") {
            let r = text.range(of: w, range: at..<text.endIndex)!
            ranges.append(r)
            at = r.upperBound
        }
        let words = FoldOCR.spread(text, ranges, [0.1, 0.2, 0.5, 0.22])
        XCTAssertEqual(words.map(\.text), ["Supply", "chain", "metrics"])
        XCTAssertEqual(words[0].box[0], 0.1, accuracy: 1e-6)
        XCTAssertEqual(words[2].box[2], 0.5, accuracy: 1e-6)
        XCTAssertTrue(words[0].box[2] < words[1].box[0] && words[1].box[2] < words[2].box[0])
        XCTAssertEqual(FoldOCR.topLeft(CGRect(x: 0.1, y: 0.7, width: 0.3, height: 0.05)), [0.1, 0.25, 0.4, 0.3])
    }
}
