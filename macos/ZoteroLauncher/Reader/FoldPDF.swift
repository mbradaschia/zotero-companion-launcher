import AppKit
import CoreText
import CryptoKit
import Foundation
import PDFKit
import WebKit

// The fold reader's PDF (docs/fold-reader/SPEC.md 5.4, 6.2; R5-SPEC.md 3.1): PDFKit on its own serial queue, never the
// main thread. It gives the pages' sizes, their words with their boxes (0 to 1 of the crop box, in display orientation,
// origin top left), their lines (the words, the font size, bold and italic: what FoldMake.js reads the doc from), the
// file's SHA-256, and each page drawn as a PNG at one of five widths, the last 12 kept.
final class FoldPDF: @unchecked Sendable {
    let url: URL
    let token: String // this window's: a page URL without it is refused
    private let queue = DispatchQueue(label: "zotero-launcher.fold-reader.pdf", qos: .userInitiated)
    private var document: PDFDocument? // (only on queue)
    private var images: [String: Data] = [:] // "n@w" → PNG (only on queue)
    private var recent: [String] = []

    static let widths = [600, 900, 1200, 1800, 2400]
    static let maxWords = 20000 // a page's
    static let batch = 8 // pages of words a FR.words call carries
    static let keep = 12 // page images kept

    struct Info {
        let pages: Int
        let sizes: [[Double]] // points, after rotation
    }

    init(url: URL, token: String = FoldPDF.newToken()) {
        self.url = url
        self.token = token
    }

    static func newToken() -> String {
        var bytes = [UInt8](repeating: 0, count: 16)
        for i in bytes.indices { bytes[i] = UInt8.random(in: 0...255) }
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    // The page URLs' pattern the page fills in ({n}, {w}).
    var urlPattern: String { "zlfold://page/{n}?w={w}&d=" + token }

    // ---- open, sizes (on the queue; the answer on the main queue)

    func open(_ done: @escaping (Result<Info, FoldPDFError>) -> Void) {
        queue.async {
            let result = self.openNow()
            DispatchQueue.main.async { done(result) }
        }
    }

    // (on the queue, or a test's thread)
    func openNow() -> Result<Info, FoldPDFError> {
        if document == nil {
            guard FileManager.default.fileExists(atPath: url.path) else { return .failure(.missing) }
            guard let doc = PDFDocument(url: url) else { return .failure(.unreadable("it isn't a PDF PDFKit can read")) }
            if doc.isLocked { return .failure(.unreadable("it is locked with a password")) }
            document = doc
        }
        guard let doc = document, doc.pageCount > 0 else { return .failure(.unreadable("it has no pages")) }
        let sizes = (0..<doc.pageCount).map { i -> [Double] in
            guard let page = doc.page(at: i) else { return [612, 792] }
            let box = page.bounds(for: .cropBox)
            let turned = Self.rotation(page) % 180 != 0
            return [Double(turned ? box.height : box.width), Double(turned ? box.width : box.height)]
        }
        return .success(Info(pages: doc.pageCount, sizes: sizes))
    }

    static func rotation(_ page: PDFPage) -> Int { ((page.rotation % 360) + 360) % 360 }

    // ---- words (SPEC 5.4)

    // Every page's words, in batches of 8 pages, first pages first; each batch on the main queue, the last with done.
    func words(_ each: @escaping (_ pages: [[String: Any]], _ done: Bool) -> Void) {
        queue.async {
            guard let doc = self.document else { DispatchQueue.main.async { each([], true) }; return }
            var batch: [[String: Any]] = []
            for i in 0..<doc.pageCount {
                let words = doc.page(at: i).map { Self.words(of: $0) } ?? []
                batch.append(["n": i + 1, "words": words])
                let last = i == doc.pageCount - 1
                if batch.count == Self.batch || last {
                    let send = batch
                    batch = []
                    DispatchQueue.main.async { each(send, last) }
                }
            }
            if doc.pageCount == 0 { DispatchQueue.main.async { each([], true) } }
        }
    }

    // A page's words: runs of non-space characters of its text, each with the union of its characters' boxes (empty
    // ones skipped), normalized to the crop box in display orientation: [[text, x0, y0, x1, y1]].
    static func words(of page: PDFPage) -> [[Any]] {
        let box = page.bounds(for: .cropBox)
        let rot = rotation(page)
        var out: [[Any]] = []
        for line in pageLines(page) {
            for word in lineWords(line, on: page) {
                guard out.count < maxWords, !word.rect.isNull, !word.text.isEmpty else { continue }
                var row: [Any] = [word.text]
                for v in normalize(word.rect, in: box, rotation: rot) { row.append(v) }
                out.append(row)
            }
        }
        return out
    }

    // Line by line, as PDFKit lays the page out: CI showed page.string running one line's last word into the next
    // line's first, and its indices then disagreeing with characterBounds(at:). Each line's own text, its ranges and
    // its box agree with each other.
    static func pageLines(_ page: PDFPage) -> [PDFSelection] {
        page.selection(for: page.bounds(for: .mediaBox))?.selectionsByLine() ?? []
    }

    struct Word {
        let text: String
        let rect: CGRect // page points
        var chars: [CharStyle] = [] // its characters' fonts, when they are known (styled)
        var spread = false // no box of its own: placed along the line by its characters
    }

    // A line's text pieces: one for each of its ranges of the page's characters, each UTF-16 unit with the index of the
    // page character it is (what selection(for:) takes). The line's or the range's own text when it fits the
    // range (fit); else its characters one at a time, so every word keeps the boxes of its own characters. (R5's first
    // CI run: on the fixture paper's pages the words came out spread along their lines, the line's text not fitting
    // its range, and spread across the page on the turned one.)
    struct Piece {
        let text: NSString
        let owner: [Int] // each UTF-16 unit's page character
        let fonts: NSAttributedString?
    }

    // A text and its fonts fitted to a range's length: as it is, or without whitespace at its ends (a line break or a
    // space PDFKit adds to a line's text that no character of the range is); nil when neither fits.
    static func fit(_ text: String?, _ fonts: NSAttributedString?, to length: Int) -> (text: NSString, fonts: NSAttributedString?)? {
        guard let text else { return nil }
        let t = text as NSString
        if t.length == length { return (t, fonts) }
        // (CI: a line's range is its text and one more index, the break PDFKit counts after the line; the text is the
        // range's first characters)
        if t.length > 0, t.length < length, length - t.length <= 2 { return (t, fonts) }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines) as NSString
        guard trimmed.length == length, length > 0 else { return nil }
        let at = t.range(of: trimmed as String)
        guard at.location != NSNotFound else { return nil }
        let kept = fonts.flatMap { f in f.length == t.length ? f.attributedSubstring(from: at) : nil }
        return (trimmed, kept)
    }

    // how: per range, "line" (the line's text), "range" (the range's), "chars" (one at a time), "empty" (skipped).
    static func pieces(_ line: PDFSelection, on page: PDFPage, styled: Bool) -> (pieces: [Piece], how: [String]) {
        let n = line.numberOfTextRanges(on: page)
        var out: [Piece] = []
        var how: [String] = []
        for i in 0..<n {
            // (within the page's characters: selection(for:) raises, which Swift can't catch, for an empty range or one
            // that ends past them, and a line's range counts a break after its text that the page's last line may lack)
            guard let range = within(line.range(at: i, on: page), page.numberOfCharacters) else { how.append("empty"); continue }
            let owner = Array(range.location..<(range.location + range.length))
            if n == 1, let f = fit(line.string, styled ? line.attributedString : nil, to: range.length) {
                out.append(Piece(text: f.text, owner: Array(owner.prefix(f.text.length)), fonts: f.fonts))
                how.append("line")
                continue
            }
            let sub = page.selection(for: range)
            if let f = fit(sub?.string, styled ? sub?.attributedString : nil, to: range.length) {
                out.append(Piece(text: f.text, owner: Array(owner.prefix(f.text.length)), fonts: f.fonts))
                how.append("range")
                continue
            }
            let built = NSMutableString(), fonts = NSMutableAttributedString()
            var units: [Int] = []
            for at in owner {
                guard let one = page.selection(for: NSRange(location: at, length: 1)) else { continue }
                let c = (one.string ?? "").trimmingCharacters(in: .newlines) as NSString
                guard c.length > 0 else { continue }
                // (the break after a line reads as its last character again, CI showed: not a character of its own)
                if at == owner.last, at > owner[0], units.last == at - 1, built.length >= c.length,
                   built.substring(from: built.length - c.length) == c as String { continue }
                built.append(c as String)
                units += Array(repeating: at, count: c.length)
                guard styled else { continue }
                if let a = one.attributedString, a.string == c as String { fonts.append(a) } else if let a = one.attributedString, a.length > 0 {
                    // (its font, over the character as kept)
                    fonts.append(NSAttributedString(string: c as String, attributes: a.attributes(at: 0, effectiveRange: nil)))
                } else {
                    fonts.append(NSAttributedString(string: c as String))
                }
            }
            out.append(Piece(text: built, owner: units, fonts: styled ? fonts : nil))
            how.append("chars")
        }
        return (out, how)
    }

    // A range cut to the page's characters (0 to count), nil when nothing of it is left.
    static func within(_ r: NSRange, _ count: Int) -> NSRange? {
        guard r.location != NSNotFound, r.location >= 0, r.length > 0, r.location < count else { return nil }
        return NSRange(location: r.location, length: min(r.length, count - r.location))
    }

    // A part of a line's box, from a to b (0 to 1 of its length) along the way it reads: across, or down a page turned
    // 90 (up one turned 270), where a line runs along the page's own y.
    static func along(_ r: CGRect, _ a: CGFloat, _ b: CGFloat, rotation: Int) -> CGRect {
        if rotation % 180 != 0 && r.height > r.width {
            return rotation == 90 ? CGRect(x: r.minX, y: r.minY + r.height * a, width: r.width, height: r.height * (b - a))
                : CGRect(x: r.minX, y: r.maxY - r.height * b, width: r.width, height: r.height * (b - a))
        }
        if rotation == 180 { return CGRect(x: r.maxX - r.width * b, y: r.minY, width: r.width * (b - a), height: r.height) }
        return CGRect(x: r.minX + r.width * a, y: r.minY, width: r.width * (b - a), height: r.height)
    }

    // One line's words, in page points (styled: with their characters' fonts): each word's box the union of its own
    // characters' boxes on this line (pieces); a word with none, or a line with no pieces, spread along the line.
    static func lineWords(_ line: PDFSelection, on page: PDFPage, styled: Bool = false) -> [Word] {
        guard let text = line.string, !text.isEmpty else { return [] }
        let r = line.bounds(for: page)
        guard r.width > 0, r.height > 0 else { return [] }
        let rot = rotation(page)
        let spaces = CharacterSet.whitespacesAndNewlines
        func runs(_ t: NSString) -> [NSRange] {
            func space(_ k: Int) -> Bool { UnicodeScalar(t.character(at: k)).map { spaces.contains($0) } ?? false }
            var out: [NSRange] = []
            var k = 0
            while k < t.length {
                if space(k) { k += 1; continue }
                var j = k
                while j < t.length, !space(j) { j += 1 }
                out.append(NSRange(location: k, length: j - k))
                k = j
            }
            return out
        }
        // (no box of its own for any word: the line's text, its words spread along its box by their fonts' advances)
        func spreadLine() -> [Word] {
            let t = text as NSString
            let attributed = line.attributedString
            let whole = styled ? charStyles(attributed, length: t.length) : []
            let at = offsets(attributed, length: t.length)
            return runs(t).map { (w: NSRange) -> Word in
                Word(text: t.substring(with: w), rect: along(r, at[w.location], at[w.location + w.length], rotation: rot),
                     chars: whole.isEmpty ? [] : Array(whole[w.location..<(w.location + w.length)]), spread: true)
            }
        }
        let parts = pieces(line, on: page, styled: styled).pieces.filter { $0.text.length > 0 }
        guard !parts.isEmpty else { return spreadLine() }
        var words: [Word] = []
        let total = CGFloat(max(1, parts.reduce(-1) { $0 + $1.text.length + 1 }))
        var offset = 0
        for part in parts {
            let fonts = styled ? charStyles(part.fonts, length: part.text.length) : []
            for w in runs(part.text) {
                // (the word's own selection: its box is in the ranges' index, which counts a break after each line;
                // characterBounds(at:) doesn't, so on CI its boxes ran one character later each line down the page)
                var rect = CGRect.null
                let from = part.owner[w.location], to = part.owner[w.location + w.length - 1]
                if to >= from, let word = within(NSRange(location: from, length: to - from + 1), page.numberOfCharacters),
                   let sel = page.selection(for: word) {
                    let b = sel.bounds(for: page)
                    if !b.isNull, b.width > 0 || b.height > 0, b.midY >= r.minY - 1, b.midY <= r.maxY + 1 { rect = b } // (only a box on this line)
                }
                let spread = rect.isNull
                if spread { rect = along(r, CGFloat(offset + w.location) / total, CGFloat(offset + w.location + w.length) / total, rotation: rot) }
                words.append(Word(text: part.text.substring(with: w), rect: rect, chars: fonts.isEmpty ? [] : Array(fonts[w.location..<(w.location + w.length)]), spread: spread))
            }
            offset += part.text.length + 1
        }
        return !words.isEmpty && words.allSatisfy(\.spread) ? spreadLine() : words
    }

    // Where each UTF-16 unit of a line's text starts, 0 to 1 of the line's length (length + 1 of them): CoreText's
    // advances in the fonts PDFKit gives, else the characters counted.
    static func offsets(_ a: NSAttributedString?, length: Int) -> [CGFloat] {
        let counted = (0...max(length, 0)).map { CGFloat($0) / CGFloat(max(length, 1)) }
        guard let a, a.length == length, length > 0 else { return counted }
        let ct = CTLineCreateWithAttributedString(a)
        let end = CTLineGetOffsetForStringIndex(ct, length, nil)
        guard end > 0 else { return counted }
        return (0...length).map { min(1, max(0, CTLineGetOffsetForStringIndex(ct, $0, nil) / end)) }
    }

    // For a test's message: each PDFKit line of the page, its text, its box, its ranges and how each was read.
    static func lineReport(of page: PDFPage) -> [String] {
        pageLines(page).map { line in
            let r = line.bounds(for: page)
            let n = line.numberOfTextRanges(on: page)
            let ranges = (0..<n).map { i -> String in let g = line.range(at: i, on: page); return "\(g.location)+\(g.length)" } + ["of \(page.numberOfCharacters)"]
            let read = pieces(line, on: page, styled: false)
            let words = lineWords(line, on: page)
            let texts = read.pieces.map { "\"\($0.text)\" (\($0.text.length))" }
            let length = ((line.string ?? "") as NSString).length
            return "\"\(line.string ?? "")\" (\(length)) at \(Int(r.minX)),\(Int(r.minY)) \(Int(r.width))x\(Int(r.height)): " +
                "ranges \(ranges.joined(separator: " ")) read \(read.how.joined(separator: " ")) as \(texts.joined(separator: " | ")); " +
                "\(words.filter(\.spread).count) of \(words.count) words spread"
        }
    }

    // ---- lines (R5-SPEC 3.1)

    // Every page's lines, in batches of 8 pages, first pages first; each batch on the main queue, the last with done.
    func lines(_ each: @escaping (_ pages: [[String: Any]], _ done: Bool) -> Void) {
        queue.async {
            if self.document == nil { _ = self.openNow() }
            guard let doc = self.document, doc.pageCount > 0 else { DispatchQueue.main.async { each([], true) }; return }
            var batch: [[String: Any]] = []
            for i in 0..<doc.pageCount {
                batch.append(Self.page(doc.page(at: i), n: i + 1))
                let last = i == doc.pageCount - 1
                if batch.count == Self.batch || last {
                    let send = batch
                    batch = []
                    DispatchQueue.main.async { each(send, last) }
                }
            }
        }
    }

    // Every page's lines at once (on the queue, or a test's thread); progress(pages done, pages) after each page.
    func linesNow(progress: ((Int, Int) -> Void)? = nil) -> [[String: Any]] {
        if document == nil { _ = openNow() }
        guard let doc = document else { return [] }
        var out: [[String: Any]] = []
        for i in 0..<doc.pageCount {
            out.append(Self.page(doc.page(at: i), n: i + 1))
            progress?(i + 1, doc.pageCount)
        }
        return out
    }

    // Work on the PDF's own queue (FoldMaker's extraction: its JSContext lives there).
    func onQueue(_ work: @escaping (FoldPDF) -> Void) {
        queue.async { work(self) }
    }

    // A page's entry of the lines payload: {n, size: [w, h] (points, as it shows), lines}.
    static func page(_ page: PDFPage?, n: Int) -> [String: Any] {
        guard let page else { return ["n": n, "size": [612.0, 792.0], "lines": [[String: Any]]()] }
        let box = page.bounds(for: .cropBox)
        let turned = rotation(page) % 180 != 0
        return ["n": n, "size": [Double(turned ? box.height : box.width), Double(turned ? box.width : box.height)], "lines": lines(of: page)]
    }

    // A page's lines, in PDFKit's order: [{t, b, s, f, lb, w}] (R5-SPEC 3.1). w: the line's words as words(of:) gives
    // them; t: the words joined by one space; b: their boxes' union; s: the font size in points; f: 1 bold, 2 italic,
    // for most of its characters; lb: how many words at its start are bold (a run-in heading). A line with no words is
    // left out; at most 20000 words a page. A PDFKit line that runs across a gap wider than 1.5 times its height (two
    // columns' lines on one baseline) is given as one line a side, each with its own fonts.
    static func lines(of page: PDFPage) -> [[String: Any]] {
        let box = page.bounds(for: .cropBox)
        let rot = rotation(page)
        let turned = rot % 180 != 0
        let shownW = Double(turned ? box.height : box.width), shownH = Double(turned ? box.width : box.height)
        var out: [[String: Any]] = []
        var count = 0
        for line in pageLines(page) {
            guard count < maxWords else { break }
            var words: [(word: Word, box: [Double])] = []
            for word in lineWords(line, on: page, styled: true) {
                guard count < maxWords, !word.rect.isNull, !word.text.isEmpty else { continue }
                words.append((word, normalize(word.rect, in: box, rotation: rot)))
                count += 1
            }
            guard let first = words.first else { continue }
            // (the words' median height, not the line's: two columns' lines a little apart in height make a taller union,
            // and a narrow gutter then stays under the cut)
            let heights = words.map { ($0.box[3] - $0.box[1]) * shownH }.sorted()
            let lineHigh = heights[heights.count / 2]
            let across = !down(words.map { $0.box }, letters: first.word.text.count, shownW, shownH)
            // (cut where the next word starts more than 1.5 heights after the last one ends, on a line across the page)
            var runs: [[(word: Word, box: [Double])]] = [[]]
            for w in words {
                if let prev = runs[runs.count - 1].last, across, (w.box[0] - prev.box[2]) * shownW > 1.5 * lineHigh { runs.append([]) }
                runs[runs.count - 1].append(w)
            }
            if across { runs = runs.flatMap { Self.cutAtMiddle($0, shownW: shownW, high: lineHigh) } }
            for run in runs where !run.isEmpty {
                let boxes = run.map { $0.box }
                let b = union(boxes)
                let height = down(boxes, letters: run[0].word.text.count, shownW, shownH) ? (b[2] - b[0]) * shownW : (b[3] - b[1]) * shownH
                let style = Self.style(run.map { $0.word.chars })
                var size = 0.8 * height
                if let pt = style.size, height > 0, pt >= 0.5 * height, pt <= 1.6 * height { size = pt }
                let rows: [[Any]] = run.map { w in [w.word.text as Any] + w.box.map { $0 as Any } }
                out.append(["t": run.map { $0.word.text }.joined(separator: " "), "b": b, "s": (size * 2).rounded() / 2, "f": style.flags, "lb": style.leadBold, "w": rows])
            }
        }
        return out
    }

    // Two columns' lines on one line a narrow gutter apart (under the 1.5 heights cut): cut at the widest gap over the
    // page's middle when it is half a height or wider and twice the line's other gaps, as FoldMake cuts again (a
    // justified line across the page has its spaces alike, so it stays whole). Each side then has its own fonts.
    static func cutAtMiddle(_ run: [(word: Word, box: [Double])], shownW: Double, high: Double) -> [[(word: Word, box: [Double])]] {
        guard run.count >= 4, let first = run.first, let last = run.last else { return [run] }
        let mid = shownW / 2
        guard first.box[0] * shownW < mid - high, last.box[2] * shownW > mid + high else { return [run] }
        var gaps: [(i: Int, a: Double, b: Double)] = []
        for i in 1..<run.count { gaps.append((i: i, a: run[i - 1].box[2] * shownW, b: run[i].box[0] * shownW)) }
        guard let at = gaps.filter({ $0.a <= mid + high && $0.b >= mid - high }).max(by: { ($0.b - $0.a) < ($1.b - $1.a) }),
              at.b - at.a >= 0.5 * high else { return [run] }
        let others = gaps.filter { $0.i != at.i }.map { $0.b - $0.a }.sorted()
        let typical = others.isEmpty ? 0 : others[others.count / 2]
        guard at.b - at.a >= 2 * typical else { return [run] }
        return [Array(run[..<at.i]), Array(run[at.i...])]
    }

    static func union(_ boxes: [[Double]]) -> [Double] {
        [boxes.map { $0[0] }.min() ?? 0, boxes.map { $0[1] }.min() ?? 0, boxes.map { $0[2] }.max() ?? 0, boxes.map { $0[3] }.max() ?? 0]
    }

    // Whether words run down the page as it shows (a stamp set up its edge): their centres move more down than across;
    // one word of 3 letters or more: 3 times taller than wide.
    static func down(_ boxes: [[Double]], letters: Int, _ shownW: Double, _ shownH: Double) -> Bool {
        guard let first = boxes.first, let last = boxes.last else { return false }
        if boxes.count > 1 {
            return abs((last[1] + last[3]) - (first[1] + first[3])) * shownH > abs((last[0] + last[2]) - (first[0] + first[2])) * shownW
        }
        return letters >= 3 && (first[3] - first[1]) * shownH > 3 * (first[2] - first[0]) * shownW
    }

    struct CharStyle: Equatable {
        var size: Double? // its font's point size, nil with no font
        var bold = false
        var italic = false
    }

    struct LineStyle: Equatable {
        var size: Double? // the character-weighted mean point size of its fonts, nil with none
        var flags = 0 // 1 bold, 2 italic: most of its characters'
        var leadBold = 0 // the words at its start bold in 80% of their characters
    }

    static func traits(_ font: NSFont) -> (bold: Bool, italic: Bool) {
        let t = font.fontDescriptor.symbolicTraits
        let name = font.fontName
        let bold = t.contains(.bold) || name.range(of: "bold|black|heavy|semibold|demi", options: [.regularExpression, .caseInsensitive]) != nil
        let italic = t.contains(.italic) || name.range(of: "italic|oblique", options: [.regularExpression, .caseInsensitive]) != nil
        return (bold, italic)
    }

    // Each character's font (an attributed string's .font runs); [] when there is none, or its length isn't the text's
    // (its characters couldn't be matched to the words).
    static func charStyles(_ attributed: NSAttributedString?, length: Int) -> [CharStyle] {
        guard let a = attributed, a.length > 0, a.length == length else { return [] }
        var chars = [CharStyle](repeating: CharStyle(), count: a.length)
        a.enumerateAttribute(.font, in: NSRange(location: 0, length: a.length), options: []) { value, range, _ in
            guard let font = value as? NSFont, range.length > 0 else { return }
            let t = traits(font)
            for k in range.location..<(range.location + range.length) {
                chars[k].size = Double(font.pointSize)
                chars[k].bold = t.bold
                chars[k].italic = t.italic
            }
        }
        return chars
    }

    // A run of words' fonts (each word's characters'): the mean size, bold and italic for most of the characters, and
    // the words at its start bold in 80% of theirs.
    static func style(_ words: [[CharStyle]]) -> LineStyle {
        let all = words.flatMap { $0 }
        var style = LineStyle()
        let sized = all.compactMap { $0.size }
        if !sized.isEmpty { style.size = sized.reduce(0, +) / Double(sized.count) }
        if !all.isEmpty {
            if all.filter({ $0.bold }).count * 2 > all.count { style.flags |= 1 }
            if all.filter({ $0.italic }).count * 2 > all.count { style.flags |= 2 }
        }
        for w in words {
            guard !w.isEmpty, Double(w.filter { $0.bold }.count) >= 0.8 * Double(w.count) else { break }
            style.leadBold += 1
        }
        return style
    }

    // ---- the file's identity (R5-SPEC 3.5)

    // The file's SHA-256 as hex, read 1 MB at a time; nil when it can't be read. Any thread (the file, not PDFKit).
    func sha256() -> String? { Self.sha256(of: url) }

    static func sha256(of url: URL) -> String? {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? handle.close() }
        var hasher = SHA256()
        do {
            while let data = try handle.read(upToCount: 1 << 20), !data.isEmpty { hasher.update(data: data) }
        } catch {
            return nil
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    // How many lines PDFKit finds on a page (the tests' diagnostics)
    static func lineCount(of page: PDFPage) -> Int { pageLines(page).count }

    // A box in page space (PDF points, origin bottom left) as 0 to 1 of the crop box, origin top left, turned as the
    // page displays: 0: (u, v); 90: (1 - v, u); 180: (1 - u, 1 - v); 270: (v, 1 - u); min and max taken again.
    static func normalize(_ r: CGRect, in box: CGRect, rotation: Int) -> [Double] {
        let w = max(box.width, 0.0001), h = max(box.height, 0.0001)
        func uv(_ x: CGFloat, _ y: CGFloat) -> (Double, Double) {
            let u = Double((x - box.minX) / w), v = Double((box.maxY - y) / h)
            switch rotation {
            case 90: return (1 - v, u)
            case 180: return (1 - u, 1 - v)
            case 270: return (v, 1 - u)
            default: return (u, v)
            }
        }
        let a = uv(r.minX, r.maxY), b = uv(r.maxX, r.minY)
        func clamp(_ x: Double) -> Double { (min(1, max(0, x)) * 1_000_000).rounded() / 1_000_000 }
        return [clamp(min(a.0, b.0)), clamp(min(a.1, b.1)), clamp(max(a.0, b.0)), clamp(max(a.1, b.1))]
    }

    // ---- page images (SPEC 6.2)

    // zlfold://page/<n>?w=<px>&d=<token>: (n, w), or nil for anything else.
    static func parse(_ url: URL?, pages: Int, token: String) -> (n: Int, w: Int)? {
        guard let url, url.scheme == "zlfold", url.host == "page",
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let path = url.path.hasPrefix("/") ? String(url.path.dropFirst()) : url.path
        guard let n = Int(path), (1...max(1, pages)).contains(n), pages > 0 else { return nil }
        let items = parts.queryItems ?? []
        guard let w = items.first(where: { $0.name == "w" })?.value.flatMap(Int.init), widths.contains(w),
              items.first(where: { $0.name == "d" })?.value == token else { return nil }
        return (n, w)
    }

    // Page n (1-based) drawn `width` pixels wide, white behind it, as PNG (on the queue, or a test's thread).
    func pngNow(_ n: Int, width: Int) -> Data? {
        let key = "\(n)@\(width)"
        if let data = images[key] {
            recent.removeAll { $0 == key }
            recent.append(key)
            return data
        }
        if document == nil { _ = openNow() }
        guard let page = document?.page(at: n - 1), let data = Self.png(page, width: width) else { return nil }
        images[key] = data
        recent.append(key)
        while recent.count > Self.keep { images[recent.removeFirst()] = nil }
        return data
    }

    func png(_ n: Int, width: Int, _ done: @escaping (Data?) -> Void) {
        queue.async {
            let data = self.pngNow(n, width: width)
            DispatchQueue.main.async { done(data) }
        }
    }

    var cachedImages: Int { queue.sync { images.count } }

    static func png(_ page: PDFPage, width: Int) -> Data? {
        let box = page.bounds(for: .cropBox)
        let turned = rotation(page) % 180 != 0
        let pw = turned ? box.height : box.width, ph = turned ? box.width : box.height
        guard pw > 0, ph > 0 else { return nil }
        let scale = CGFloat(width) / pw
        let height = max(1, Int((ph * scale).rounded()))
        guard let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        ctx.interpolationQuality = .high
        ctx.scaleBy(x: scale, y: scale)
        page.draw(with: .cropBox, to: ctx) // (the crop box's origin and the page's rotation applied)
        guard let image = ctx.makeImage() else { return nil }
        return NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])
    }
}

enum FoldPDFError: Error, Equatable {
    case missing
    case unreadable(String)

    // FR.load's pdf: { problem, detail }
    var payload: [String: Any] {
        switch self {
        case .missing: return ["problem": "missing"]
        case .unreadable(let why): return ["problem": "unreadable", "detail": why]
        }
    }
}

// zlfold://page/<n>?w=<px>&d=<token> for the page's images: the window's PDF drawn at that width; anything else 404.
@MainActor
final class FoldSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "zlfold"
    var pdf: FoldPDF?
    var pages = 0
    private var stopped = Set<ObjectIdentifier>()

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        let url = task.request.url
        guard let pdf, let url, let at = FoldPDF.parse(url, pages: pages, token: pdf.token) else { return Self.notFound(task) }
        let id = ObjectIdentifier(task)
        pdf.png(at.n, width: at.w) { [weak self] data in
            MainActor.assumeIsolated {
                guard let self, !self.stopped.contains(id) else { return }
                guard let data else { return Self.notFound(task) }
                let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                               headerFields: ["Content-Type": "image/png", "Content-Length": String(data.count), "Cache-Control": "no-store"])
                task.didReceive(response ?? URLResponse(url: url, mimeType: "image/png", expectedContentLength: data.count, textEncodingName: nil))
                task.didReceive(data)
                task.didFinish()
            }
        }
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        stopped.insert(ObjectIdentifier(task))
    }

    private static func notFound(_ task: WKURLSchemeTask) {
        let url = task.request.url ?? URL(string: "zlfold://page/0")!
        if let response = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Length": "0"]) { task.didReceive(response) }
        task.didReceive(Data())
        task.didFinish()
    }
}
