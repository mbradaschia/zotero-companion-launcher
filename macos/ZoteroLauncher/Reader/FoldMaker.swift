import Foundation
import JavaScriptCore
import NaturalLanguage

// The fold reader's own extraction (R5-SPEC.md 3.2 to 3.5): FoldPDF's lines read into the doc and its link map by
// FoldMake.js (FoldCore.js loaded before it), in a JSContext of its own on FoldPDF's queue, never the main thread. The
// rules are all in FoldMake.js (node tests them on synthetic lines); here: the lines gathered, the text's language,
// the call, and whether a cached doc.json still stands for the file (3.5).
final class FoldMaker {
    static let files = ["FoldCore", "FoldMake"]

    // What FoldMake.read gave: the doc and its links.json, or a problem (scan, too-long, no-text) with the units seen.
    // ask: what the outline pass sends the model (the candidate lines, the PDF's bookmarks), when there is any.
    struct Made {
        var doc: [String: Any]?
        var links: [String: Any]?
        var problem: String?
        var units = 0
        var ask: [String: Any]?
        // a scan OCR didn't read (R5-SPEC 3.8): "long" (more pages than FoldOCR.maxPages: scanPages), "failed" (why)
        var ocr: String?
        var scanPages = 0
        var why = ""

        // FR.load's state for a problem (R5-SPEC 6.1): a PDF with no text to fold reads as a scan.
        var state: [String: Any]? {
            guard let problem else { return nil }
            if problem == "too-long" { return ["kind": "too-long", "n": units] }
            if ocr == "long" { return ["kind": "scan", "ocr": "long", "n": scanPages, "max": FoldOCR.maxPages] }
            if ocr == "failed" { return ["kind": "scan", "ocr": "failed", "why": why] }
            return ["kind": "scan"]
        }
    }

    private let context: JSContext
    private var exception: String?

    // resources: the folder holding FoldCore.js and FoldMake.js (the app bundle's Resources).
    init(resources: URL? = Bundle.main.resourceURL) throws {
        guard let context = JSContext() else { throw JSCoreError.noContext }
        self.context = context
        context.exceptionHandler = { [weak self] _, e in self?.exception = e?.toString() ?? "unknown error" }
        for name in Self.files {
            guard let file = resources?.appendingPathComponent(name + ".js"), let source = try? String(contentsOf: file, encoding: .utf8)
            else { throw JSCoreError.missing(name + ".js") }
            let wrapped = "(function () { var module = { exports: {} }; var exports = module.exports;\n\(source)\n;return module.exports })()"
            let value = context.evaluateScript(wrapped, withSourceURL: file)
            if let e = take() { throw JSCoreError.exception("\(name).js: \(e)") }
            guard let value, value.isObject else { throw JSCoreError.missing(name + ".js") }
            context.setObject(value, forKeyedSubscript: name as NSString) // (FoldMake finds FoldCore as a global)
        }
    }

    private func take() -> String? {
        defer { exception = nil }
        return exception
    }

    // FoldMake.EXTRACTOR: a doc.json read by an older one is read again (3.5).
    var extractor: Int { Int(context.evaluateScript("FoldMake.EXTRACTOR")?.toInt32() ?? 0) }

    // FoldMake.read(pages, meta), JSON in and out.
    func read(_ pages: [[String: Any]], meta: [String: Any]) throws -> Made {
        guard let json = context.objectForKeyedSubscript("JSON"), let make = context.objectForKeyedSubscript("FoldMake") else { throw JSCoreError.noContext }
        let p = json.invokeMethod("parse", withArguments: [try JSCore.jsonText(pages)])
        let m = json.invokeMethod("parse", withArguments: [try JSCore.jsonText(meta)])
        let result = make.invokeMethod("read", withArguments: [p as Any, m as Any])
        if let e = take() { throw JSCoreError.exception("FoldMake.read: \(e)") }
        guard let text = json.invokeMethod("stringify", withArguments: [result as Any])?.toString(),
              let out = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any]
        else { throw JSCoreError.exception("FoldMake.read returned nothing") }
        let units = ((out["stats"] as? [String: Any])?["units"] as? NSNumber)?.intValue ?? 0
        if let problem = out["problem"] as? String { return Made(problem: problem, units: units) }
        guard let doc = out["doc"] as? [String: Any], let links = out["links"] as? [String: Any] else { throw JSCoreError.exception("FoldMake.read gave no doc") }
        return Made(doc: doc, links: links, units: units, ask: out["ask"] as? [String: Any])
    }

    // FoldMake.textless(pages, meta): whether the PDF is a scan, and its pages with no text of their own (R5-SPEC 3.8).
    func textless(_ pages: [[String: Any]], meta: [String: Any]) throws -> (scan: Bool, pages: [Int]) {
        guard let json = context.objectForKeyedSubscript("JSON"), let make = context.objectForKeyedSubscript("FoldMake") else { throw JSCoreError.noContext }
        let p = json.invokeMethod("parse", withArguments: [try JSCore.jsonText(pages)])
        let m = json.invokeMethod("parse", withArguments: [try JSCore.jsonText(meta)])
        let result = make.invokeMethod("textless", withArguments: [p as Any, m as Any])
        if let e = take() { throw JSCoreError.exception("FoldMake.textless: \(e)") }
        guard let text = json.invokeMethod("stringify", withArguments: [result as Any])?.toString(),
              let out = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any]
        else { throw JSCoreError.exception("FoldMake.textless returned nothing") }
        return (out["scan"] as? Bool ?? false, (out["pages"] as? [NSNumber] ?? []).map(\.intValue))
    }

    // The text's language (3.3): ISO 639-1 of the dominant language of the lines' first 5000 characters, when
    // NaturalLanguage is at least 80% sure of it, else en.
    static func language(of pages: [[String: Any]]) -> String {
        var text = ""
        outer: for page in pages {
            for line in page["lines"] as? [[String: Any]] ?? [] {
                text += (line["t"] as? String ?? "") + "\n"
                if text.count >= 5000 { break outer }
            }
        }
        let sample = String(text.prefix(5000))
        guard !sample.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return "en" }
        let recognizer = NLLanguageRecognizer()
        recognizer.processString(sample)
        guard let best = recognizer.languageHypotheses(withMaximum: 1).max(by: { $0.value < $1.value }), best.value >= 0.8 else { return "en" }
        let code = best.key.rawValue.split(separator: "-").first.map(String.init) ?? ""
        return code.count == 2 ? code.lowercased() : "en"
    }

    // The PDF read into the doc on its own queue: the lines (progress after each page, on the main queue), the
    // language, FoldMake.read. meta: Zotero's title, authors, date, cite, the pdf's identity, made_with, exported.
    // outline (the outline pass, R5-SPEC 3.7): called on the main queue with what to ask the model (Made.ask) once the
    // PDF is read; its answer ({ n, headings, model }) has the same lines read again with the model's headings, and no
    // answer (nil) leaves the sections the rules found. It is not called for a PDF with a problem or no candidates.
    typealias Outline = @MainActor (_ ask: [String: Any], _ answer: @escaping @MainActor ([String: Any]?) -> Void) -> Void
    // ocr: a scan's pages read by OCR (R5-SPEC 3.8): its progress (pages read, pages to read), on the main queue.
    static func make(_ pdf: FoldPDF, meta: [String: Any], resources: URL? = Bundle.main.resourceURL, outline: Outline? = nil,
                     progress: @escaping @MainActor (_ done: Int, _ pages: Int) -> Void,
                     ocr: (@MainActor (_ done: Int, _ pages: Int) -> Void)? = nil,
                     done: @escaping @MainActor (Result<Made, Error>) -> Void) {
        pdf.onQueue { pdf in
            var pages = pdf.linesNow { d, n in
                if d == n || d % 4 == 0 { DispatchQueue.main.async { MainActor.assumeIsolated { progress(d, n) } } }
            }
            var m = meta
            m["outline"] = pdf.outlineNow()
            var identity = m["pdf"] as? [String: Any] ?? [:]
            if (identity["sha256"] as? String ?? "").isEmpty, let sha = pdf.sha256() { identity["sha256"] = sha }
            m["pdf"] = identity
            let maker: FoldMaker
            let first: Made
            do {
                maker = try FoldMaker(resources: resources)
                // (a scan: its pages with no text of their own read by Vision, then the whole PDF read as any other)
                let need = try maker.textless(pages, meta: m)
                var skipped: Made?
                if need.scan, !need.pages.isEmpty {
                    if need.pages.count > FoldOCR.maxPages {
                        skipped = Made(problem: "scan", ocr: "long", scanPages: need.pages.count)
                    } else {
                        let got = pdf.ocrNow(need.pages, into: pages) { d, n in
                            if let ocr { DispatchQueue.main.async { MainActor.assumeIsolated { ocr(d, n) } } }
                        }
                        pages = got.pages
                        if !got.read.isEmpty { m["ocr"] = got.read; m["ocr_engine"] = "vision" }
                        else if let why = got.error { skipped = Made(problem: "scan", ocr: "failed", why: why) }
                    }
                }
                m["lang"] = FoldMaker.language(of: pages)
                first = try skipped ?? maker.read(pages, meta: m)
            } catch {
                DispatchQueue.main.async { MainActor.assumeIsolated { done(.failure(error)) } }
                return
            }
            guard let outline, first.problem == nil, let ask = first.ask else {
                DispatchQueue.main.async { MainActor.assumeIsolated { done(.success(first)) } }
                return
            }
            let read = m, lines = pages
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    outline(ask) { answer in
                        guard let answer else { return done(.success(first)) }
                        // (the same lines, with the model's headings; a reading that fails keeps the first)
                        pdf.onQueue { _ in
                            var again = read
                            again["headings"] = answer
                            let made = (try? maker.read(lines, meta: again)).flatMap { $0.doc == nil ? nil : $0 } ?? first
                            DispatchQueue.main.async { MainActor.assumeIsolated { done(.success(made)) } }
                        }
                    }
                }
            }
        }
    }

    // Who set a doc's sections (doc.source.outline): "ai", "bookmarks" or "rules"; "" for a doc read before extractor 4.
    static func outlineBy(_ doc: [String: Any]?) -> String { (doc?["source"] as? [String: Any])?["outline"] as? String ?? "" }

    // A doc of ours whose sections no model has answered for yet (it was read offline, with the AI features away or
    // older than the app, or with the outline pass off): the pass is still owed.
    static func outlineOwed(_ doc: [String: Any]?) -> Bool {
        guard ours(doc), let source = doc?["source"] as? [String: Any] else { return false }
        return source["outline"] as? String != "ai" && source["outline_tried"] as? Bool != true
    }

    // ---- a cached doc.json and the file (3.5)

    enum Cached: Equatable {
        case use // ours, the same size and date: as it is
        case touched // ours, the same SHA-256 under another date: kept, links.json written again with the new date
        case changed // ours, another file: read again, the fold shows pdf-changed
        case stale // ours, read by an older FoldMake and nothing folded yet: read again
        case kept // R1's doc with AI levels (D9): kept as it is, linked by the word vote
        case read // none, R1's local levels (D9), or not one we know: the PDF is read
    }

    static func provenance(_ doc: [String: Any]?) -> [String: Any] { doc?["provenance"] as? [String: Any] ?? [:] }

    // A doc this app read from a PDF (its source names our extractor).
    static func ours(_ doc: [String: Any]?) -> Bool {
        guard let source = doc?["source"] as? [String: Any] else { return false }
        return source["kind"] as? String == "pdf" && source["extractor"] is NSNumber
    }

    static func folded(_ doc: [String: Any]?) -> Bool {
        (doc?["sections"] as? [[String: Any]] ?? []).contains { $0["made"] as? String == "ai" }
    }

    // links: the cached links.json (it holds the file's date the doc was read or checked against); sha256: the file's,
    // asked only when the size or the date differ.
    static func cached(_ doc: [String: Any]?, links: [String: Any]?, bytes: Int, modified: String, extractor: Int, sha256: () -> String?) -> Cached {
        guard let doc else { return .read }
        guard ours(doc) else {
            // (R1's, the only other kind there is: its levels kept when a model wrote them)
            let p = provenance(doc)
            return p["local"] as? Bool != true && p["ai_generated"] as? Bool != false ? .kept : .read
        }
        let source = doc["source"] as? [String: Any] ?? [:]
        let old = ((source["extractor"] as? NSNumber)?.intValue ?? 0) < extractor && !folded(doc)
        let sameSize = (source["bytes"] as? NSNumber)?.intValue == bytes
        let sameDate = !modified.isEmpty && ((links?["pdf"] as? [String: Any])?["modified"] as? String) == modified
        if sameSize && sameDate { return old ? .stale : .use }
        guard let sha = sha256(), let had = source["sha256"] as? String, !had.isEmpty else { return old ? .stale : .use }
        if sha != had { return .changed }
        return old ? .stale : .touched
    }
}
