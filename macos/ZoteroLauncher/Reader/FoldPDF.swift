import AppKit
import Foundation
import PDFKit
import WebKit

// The fold reader's PDF (docs/fold-reader/SPEC.md 5.4, 6.2): PDFKit on its own serial queue, never the main thread.
// It gives the pages' sizes, their words with their boxes (0 to 1 of the crop box, in display orientation, origin top
// left) and each page drawn as a PNG at one of five widths, the last 12 kept.
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
        guard let text = page.string, !text.isEmpty else { return [] }
        let s = text as NSString
        let box = page.bounds(for: .cropBox)
        let rot = rotation(page)
        let spaces = CharacterSet.whitespacesAndNewlines
        var out: [[Any]] = []
        var start = -1
        var rect = CGRect.null
        func flush(_ end: Int) {
            defer { start = -1; rect = .null }
            guard start >= 0, !rect.isNull, out.count < maxWords else { return }
            let word = s.substring(with: NSRange(location: start, length: end - start))
            var row: [Any] = [word]
            for v in normalize(rect, in: box, rotation: rot) { row.append(v) }
            out.append(row)
        }
        var last = CGRect.null // the word's last drawn character
        for i in 0..<s.length {
            let c = s.character(at: i)
            let space = UnicodeScalar(c).map { spaces.contains($0) } ?? false // (half a surrogate pair: part of a word)
            if space { flush(i); last = .null; continue }
            let r = page.characterBounds(at: i)
            let drawn = r.width > 0 || r.height > 0
            // PDFKit's text can run one line's last word into the next line's first with no space between: a
            // character that goes back to the left or onto another line starts a word of its own
            if start >= 0, drawn, !last.isNull, r.minX < last.minX - 0.5 || abs(r.midY - last.midY) > max(last.height, r.height) * 0.6 {
                flush(i); last = .null
            }
            if start < 0 { start = i }
            if drawn { rect = rect.union(r); last = r }
        }
        flush(s.length)
        return out
    }

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
