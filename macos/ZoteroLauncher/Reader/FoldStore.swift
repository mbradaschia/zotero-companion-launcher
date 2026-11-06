import Foundation

// The fold reader's files for one paper (docs/fold-reader/SPEC.md 5.6, R5-SPEC.md 5.2): <runnerState>/fold-reader/
// <libraryID>-<KEY>/, in the app's state folder (Paths.js's runnerState), never the sync folder: doc.json (the doc read
// from the PDF, with the levels a fold wrote), links.json (the link map for that doc and that PDF), marks.json,
// fold.json (the last fold: its model, status and sections, written by the app) and replies/ (the model's answers,
// written by the runner). Every write goes to a temporary file in the same folder, then is renamed over the old one. A
// marks.json or doc.json that can't be read is never overwritten: it is renamed <name>.damaged-<YYYYMMDD-HHMMSS>
// (marks: the reader starts with none; the doc: the PDF is read again).
struct FoldStore {
    let folder: URL

    static let doc = "doc.json"
    static let links = "links.json"
    static let marks = "marks.json"
    static let run = "fold.json"

    // nil for a key that isn't a Zotero key, or no state folder.
    init?(runnerState: String, libraryID: Int, key: String) {
        guard !runnerState.isEmpty, libraryID > 0, key.range(of: "^[A-Z0-9]{8}$", options: .regularExpression) != nil else { return nil }
        folder = URL(fileURLWithPath: runnerState, isDirectory: true)
            .appendingPathComponent("fold-reader", isDirectory: true)
            .appendingPathComponent("\(libraryID)-\(key)", isDirectory: true)
    }

    func url(_ name: String) -> URL { folder.appendingPathComponent(name) }

    func read(_ name: String) -> String? {
        guard let data = try? Data(contentsOf: url(name)) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func readJSON(_ name: String) -> [String: Any]? {
        guard let text = read(name) else { return nil }
        return (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any]
    }

    // Written atomically: a temporary file beside it, then rename(2) over it.
    func write(_ name: String, _ text: String) throws {
        let fm = FileManager.default
        try fm.createDirectory(at: folder, withIntermediateDirectories: true)
        let tmp = folder.appendingPathComponent(".\(name).\(UUID().uuidString).tmp")
        do {
            try Data(text.utf8).write(to: tmp)
            guard rename(tmp.path, url(name).path) == 0 else { throw CocoaError(.fileWriteUnknown) }
        } catch {
            try? fm.removeItem(at: tmp)
            throw error
        }
    }

    func writeJSON(_ name: String, _ object: Any) throws {
        guard JSONSerialization.isValidJSONObject(object) else { throw CocoaError(.fileWriteInvalidFileName) }
        let data = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys])
        try write(name, String(decoding: data, as: UTF8.self) + "\n")
    }

    // ---- marks

    struct Marks {
        var store: [String: Any]? // nil: none yet, or the file was damaged
        var damaged: String? // the name the damaged file was kept under
        var dropped = 0
    }

    static func stamp(_ date: Date = Date()) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyyMMdd-HHmmss"
        return f.string(from: date)
    }

    // marks.json read through Glue.foldMarksParse; a damaged file is moved aside first.
    func readMarks(_ core: JSCore, now: Date = Date()) -> Marks {
        guard let text = read(Self.marks) else { return Marks() }
        guard let json = try? core.glueJSON("foldMarksParse", [text]),
              let parsed = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any] else { return Marks() }
        if parsed["damaged"] as? Bool == true { return Marks(store: nil, damaged: keepDamaged(now: now)) }
        return Marks(store: parsed["store"] as? [String: Any], damaged: nil, dropped: parsed["dropped"] as? Int ?? 0)
    }

    // A damaged file (marks.json by default) renamed beside itself (another name if that one is taken): its new name,
    // or nil.
    func keepDamaged(_ file: String = FoldStore.marks, now: Date = Date()) -> String? {
        let base = file + ".damaged-" + Self.stamp(now)
        var name = base
        var n = 2
        while FileManager.default.fileExists(atPath: url(name).path) { name = base + "-\(n)"; n += 1 }
        return (try? FileManager.default.moveItem(at: url(file), to: url(name))) != nil ? name : nil
    }

    // ---- the doc and the fold's record

    struct Doc {
        var doc: [String: Any]? // nil: none, or it was damaged
        var damaged: String? // the name the damaged file was kept under
    }

    // doc.json, checked by FoldCore (Glue.foldDocProblem); one that doesn't parse or that FoldCore refuses is moved
    // aside, and the PDF is read again.
    func readDoc(_ core: JSCore, now: Date = Date()) -> Doc {
        guard let text = read(Self.doc) else { return Doc() }
        if let doc = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any],
           let problem = try? core.glue("foldDocProblem", [doc], as: String.self), problem.isEmpty {
            return Doc(doc: doc, damaged: nil)
        }
        return Doc(doc: nil, damaged: keepDamaged(Self.doc, now: now))
    }

    // fold.json (written by the app, R5-SPEC 5.1): {format: "zl-fold-run", version: 1, doc, model, started, status,
    // sections, errors, stop}; nil when there's none or it isn't one.
    func readRun() -> [String: Any]? {
        guard let run = readJSON(Self.run), run["format"] as? String == "zl-fold-run", run["version"] as? Int == 1 else { return nil }
        return run
    }

    func writeRun(_ run: [String: Any]) throws {
        var r = run
        r["format"] = "zl-fold-run"
        r["version"] = 1
        try writeJSON(Self.run, r)
    }

    // The page's marks store, checked and written (Glue.foldMarksText). A marks.json there that doesn't parse is kept
    // aside first, never overwritten. → the damaged file's new name, if there was one.
    @discardableResult
    func writeMarks(_ store: Any, _ core: JSCore, now: Date = Date()) throws -> String? {
        let json = try core.glueJSON("foldMarksText", [store])
        guard let out = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any] else { throw FoldStoreError.invalid("no answer") }
        guard let text = out["text"] as? String else { throw FoldStoreError.invalid(out["error"] as? String ?? "not a marks store") }
        var kept: String?
        if let old = read(Self.marks),
           let check = try? core.glueJSON("foldMarksParse", [old]),
           ((try? JSONSerialization.jsonObject(with: Data(check.utf8))) as? [String: Any])?["damaged"] as? Bool == true {
            kept = keepDamaged(now: now)
            if kept == nil { throw FoldStoreError.invalid("the old marks.json couldn't be kept aside") }
        }
        try write(Self.marks, text)
        return kept
    }
}

enum FoldStoreError: Error, CustomStringConvertible {
    case invalid(String)
    var description: String {
        switch self { case .invalid(let why): return why }
    }
}
