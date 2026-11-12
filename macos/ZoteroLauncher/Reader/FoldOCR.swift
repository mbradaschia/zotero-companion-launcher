import AppKit
import Foundation
import PDFKit
import Vision

// A scan's pages read by Apple's Vision, on this Mac (docs/fold-reader/R5-SPEC.md 3.8): nothing to install, nothing
// sent anywhere. A page is drawn in grey at about 300 dpi, as it shows (its crop box, its rotation), and Vision's
// accurate text recognition gives its lines; each line comes back as FoldPDF.lines(of:) gives one, its words with
// their boxes (0 to 1, origin top left), so FoldMake.js reads it as any other page and the panes stay linked. A line
// whose strokes are much heavier than the page's other lines reads as bold (a scan keeps no fonts).
//
// Also the AI features' OCR on a Mac (the runner's full-text note, chats, review tables): the app's own executable
// run as `ZoteroLauncher --ocr <pdf> <page> [<page>…]` prints each page's lines as JSON (command(_:)).
enum FoldOCR {
    static let maxPages = 80 // a longer scan is left alone (a book), as the runner's OCR_MAX_PAGES
    static let dpi: CGFloat = 300
    static let maxSide: CGFloat = 4200 // pixels: a poster-sized page is drawn smaller
    static let boldInk = 1.3 // a line this many times darker than the page's median line, at about its size, is bold

    struct Word {
        let text: String
        let box: [Double] // x0, y0, x1, y1: 0 to 1 of the page as it shows, origin top left
    }

    struct Line {
        let words: [Word]
        var ink: Double = 0 // its strokes' share of its box, from the page drawn
        var bold = false
    }

    // ---- drawing

    // The page drawn in grey, white behind it, as it shows: scale 300 dpi, the longer side at most maxSide pixels.
    static func image(_ page: PDFPage) -> CGImage? {
        let box = page.bounds(for: .cropBox)
        let turned = FoldPDF.rotation(page) % 180 != 0
        let pw = turned ? box.height : box.width, ph = turned ? box.width : box.height
        guard pw > 0, ph > 0 else { return nil }
        let scale = min(dpi / 72, maxSide / max(pw, ph))
        let w = max(1, Int((pw * scale).rounded())), h = max(1, Int((ph * scale).rounded()))
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return nil }
        ctx.setFillColor(gray: 1, alpha: 1)
        ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
        ctx.interpolationQuality = .high
        ctx.scaleBy(x: scale, y: scale)
        page.draw(with: .cropBox, to: ctx) // (the crop box's origin and the page's rotation applied)
        return ctx.makeImage()
    }

    // ---- reading

    // The page's lines, in Vision's order (FoldMake puts them in reading order). Throws when Vision fails.
    static func lines(of page: PDFPage) throws -> [Line] {
        guard let image = image(page) else { return [] }
        return try lines(in: image)
    }

    static func lines(in image: CGImage) throws -> [Line] {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.automaticallyDetectsLanguage = true
        request.minimumTextHeight = 0.006 // (a footnote's letters on a page 1000 pixels high: 6)
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        try handler.perform([request])
        var out: [Line] = []
        for observation in request.results ?? [] {
            guard let best = observation.topCandidates(1).first else { continue }
            let words = Self.words(best, line: observation.boundingBox)
            if !words.isEmpty { out.append(Line(words: words)) }
        }
        let pixels = Pixels(image)
        for i in out.indices { out[i].ink = pixels.map { ink(of: out[i], in: $0) } ?? 0 }
        markBold(&out)
        return out
    }

    // A recognized line's words: runs of non-space characters, each with Vision's box for its range. When Vision gives
    // every word the line's whole box (it can, at the accurate level), the words are spread along the line by their
    // characters instead.
    static func words(_ candidate: VNRecognizedText, line: CGRect) -> [Word] {
        let text = candidate.string
        var ranges: [Range<String.Index>] = []
        var start: String.Index?
        for i in text.indices {
            if text[i].isWhitespace {
                if let s = start { ranges.append(s..<i); start = nil }
            } else if start == nil { start = i }
        }
        if let s = start { ranges.append(s..<text.endIndex) }
        guard !ranges.isEmpty else { return [] }
        let boxes: [CGRect?] = ranges.map { r in (try? candidate.boundingBox(for: r))?.boundingBox }
        let whole = topLeft(line)
        let degenerate = ranges.count > 1 && boxes.allSatisfy { b in
            guard let b else { return true }
            return abs(b.width - line.width) < 0.02 * max(line.width, 0.0001)
        }
        if degenerate { return spread(text, ranges, whole) }
        return zip(ranges, boxes).map { r, b in Word(text: String(text[r]), box: b.map(topLeft) ?? whole) }
    }

    // Words placed along a line's box by their share of its characters (spaces counted).
    static func spread(_ text: String, _ ranges: [Range<String.Index>], _ box: [Double]) -> [Word] {
        let total = Double(max(1, text.count))
        return ranges.map { r in
            let a = Double(text.distance(from: text.startIndex, to: r.lowerBound)) / total
            let b = Double(text.distance(from: text.startIndex, to: r.upperBound)) / total
            let w = box[2] - box[0]
            return Word(text: String(text[r]), box: [box[0] + a * w, box[1], box[0] + b * w, box[3]].map(round6))
        }
    }

    // Vision's box (0 to 1, origin bottom left) as the reader's: x0, y0, x1, y1 with the origin top left.
    static func topLeft(_ r: CGRect) -> [Double] {
        [Double(r.minX), 1 - Double(r.maxY), Double(r.maxX), 1 - Double(r.minY)].map { round6(min(1, max(0, $0))) }
    }

    static func round6(_ v: Double) -> Double { (v * 1_000_000).rounded() / 1_000_000 }

    // ---- bold, from the strokes

    // The grey pixels of a page drawn, for reading how dark a line's box is.
    struct Pixels {
        let data: [UInt8]
        let width: Int, height: Int, row: Int

        init?(_ image: CGImage) {
            let w = image.width, h = image.height
            guard w > 0, h > 0, let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                                                    space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return nil }
            ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
            guard let base = ctx.data else { return nil }
            data = Array(UnsafeBufferPointer(start: base.assumingMemoryBound(to: UInt8.self), count: w * h))
            width = w
            height = h
            row = w
        }

        // The share of dark pixels (under half grey) in a box (0 to 1, origin top left; the bitmap's rows run from the top).
        func dark(_ box: [Double]) -> Double {
            let x0 = max(0, Int(box[0] * Double(width))), x1 = min(width, Int((box[2] * Double(width)).rounded(.up)))
            let y0 = max(0, Int(box[1] * Double(height))), y1 = min(height, Int((box[3] * Double(height)).rounded(.up)))
            guard x1 > x0, y1 > y0 else { return 0 }
            var n = 0
            for y in y0..<y1 {
                let at = y * row
                for x in x0..<x1 where data[at + x] < 128 { n += 1 }
            }
            return Double(n) / Double((x1 - x0) * (y1 - y0))
        }
    }

    // How dark a line is: its words' dark pixels over their boxes' area (the gaps between words left out).
    static func ink(of line: Line, in pixels: Pixels) -> Double {
        var dark = 0.0, area = 0.0
        for w in line.words {
            let a = (w.box[2] - w.box[0]) * (w.box[3] - w.box[1])
            guard a > 0 else { continue }
            dark += pixels.dark(w.box) * a
            area += a
        }
        return area > 0 ? dark / area : 0
    }

    // A line at least boldInk times as dark as the median of the page's lines of about its height (within a quarter),
    // with 5 or more such lines to compare with, reads as bold.
    static func markBold(_ lines: inout [Line]) {
        let heights = lines.map { height($0) }
        for i in lines.indices {
            let h = heights[i]
            guard h > 0 else { continue }
            let peers = lines.indices.filter { j in j != i && heights[j] > 0 && abs(heights[j] - h) <= 0.25 * h }.map { lines[$0].ink }.sorted()
            guard peers.count >= 5 else { continue }
            let median = peers[peers.count / 2]
            lines[i].bold = median > 0 && lines[i].ink >= boldInk * median
        }
    }

    static func height(_ line: Line) -> Double {
        let hs = line.words.map { $0.box[3] - $0.box[1] }.sorted()
        return hs.isEmpty ? 0 : hs[hs.count / 2]
    }

    // ---- as FoldPDF.lines gives a page

    // The lines in FoldPDF.lines(of:)'s shape: {t, b, s, f, lb, li, fn, w}. s: 0.8 of the words' median height in
    // points (FoldPDF's own rule for a line with no font); f: 1 when bold; fn: "ocr" (one family: no fonts in a scan).
    static func payload(_ lines: [Line], size: [Double]) -> [[String: Any]] {
        let shownH = size.count > 1 ? size[1] : 792
        return lines.map { line in
            let boxes = line.words.map { $0.box }
            let b = FoldPDF.union(boxes)
            let pt = 0.8 * height(line) * shownH
            let rows: [[Any]] = line.words.map { w in [w.text as Any] + w.box.map { $0 as Any } }
            return ["t": line.words.map { $0.text }.joined(separator: " "), "b": b, "s": (pt * 2).rounded() / 2, "f": line.bold ? 1 : 0,
                    "lb": line.bold ? line.words.count : 0, "li": 0, "fn": "ocr", "w": rows]
        }
    }

    // ---- the AI features' OCR (the runner's: macos/runner/lib/vision.mjs)

    // `--ocr <pdf> <page>…` (pages from 1): one JSON object a page on stdout, {n, size: [w, h], lines: [{t, b}]}, or
    // {n, error}. → the exit code: 0, 2 for a usage error, 3 when the PDF can't be read.
    static func command(_ args: [String], out: (String) -> Void = { print($0); fflush(stdout) }, err: (String) -> Void = { FileHandle.standardError.write(Data(($0 + "\n").utf8)) }) -> Int32 {
        guard args.count >= 2 else { err("usage: ZoteroLauncher --ocr <pdf> <page>…"); return 2 }
        let url = URL(fileURLWithPath: args[0])
        guard let doc = PDFDocument(url: url), !doc.isLocked else { err("couldn't read \(url.lastPathComponent) as a PDF"); return 3 }
        for arg in args.dropFirst() {
            guard let n = Int(arg), n >= 1 else { err("not a page number: \(arg)"); return 2 }
            var row: [String: Any] = ["n": n]
            if let page = doc.page(at: n - 1) {
                let box = page.bounds(for: .cropBox)
                let turned = FoldPDF.rotation(page) % 180 != 0
                row["size"] = [Double(turned ? box.height : box.width), Double(turned ? box.width : box.height)]
                do {
                    row["lines"] = try autoreleasepool { try lines(of: page) }.map { line -> [String: Any] in
                        ["t": line.words.map { $0.text }.joined(separator: " "), "b": FoldPDF.union(line.words.map { $0.box })]
                    }
                } catch {
                    row["error"] = "Vision couldn't read page \(n): \(error.localizedDescription)"
                }
            } else {
                row["error"] = "no page \(n)"
            }
            guard let data = try? JSONSerialization.data(withJSONObject: row, options: [.sortedKeys, .withoutEscapingSlashes]),
                  let text = String(data: data, encoding: .utf8) else { return 3 }
            out(text)
        }
        return 0
    }
}
