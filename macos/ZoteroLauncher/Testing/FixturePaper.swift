#if DEBUG
import AppKit
import CoreText
import Foundation
import PDFKit

// The fold reader's fixture paper (FIXTURE.md 6.5, 6.6), made up and drawn with CoreText: two pages, two columns (54
// to 297 and 315 to 558 points), Helvetica 10 body, Helvetica-Bold 12 headings, Helvetica-Bold 10 `Abstract.` run into
// the abstract's first line, a Helvetica 8 footnote, Helvetica 9 page numbers; section 1's abstract, S1.p1.1, S1.p2.1
// and S2.p1.1 sentences (and the fillers of 6.1); the second page turned 90° (its text drawn turned the other way, so
// it reads upright as the page shows). Every word's box is recorded as the page shows it (0 to 1, origin top left),
// with the unit it belongs to. FoldReaderTests read it (R5-35 to R5-37); fixture mode opens it in the reader.
final class FixturePaper {
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

    // Fixture mode's PDF (the reader's /attachment answers it): written once a run, in the temporary folder.
    static let shared: URL? = {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("zl-fixture-paper-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return try? FixturePaper().write(in: dir)
    }()

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

#endif
