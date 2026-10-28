import Foundation

// The review tables' folder (contracts/SYNC-FORMAT.md, `reviews/`): a review per file (<id>.json), the columns of your
// own (columns/<id>.md) and their values (cells/<column id>.cells.json), read and written through ReviewCore.js (Glue's
// review wrappers). Names are checked ids only, so a file another machine sent never steers a write elsewhere. Writes
// are atomic, refused while the sync folder is away, and never over a file that is there but isn't what it should be
// (a half-synced copy: writing over it would lose what it holds).
struct ReviewFiles {
    enum WriteError: Error, Equatable {
        case readOnly
        case damaged(String) // the file's path
        case badId
    }

    let dir: URL
    var readOnly: Bool

    var columnsDir: URL { dir.appendingPathComponent("columns", isDirectory: true) }
    var cellsDir: URL { dir.appendingPathComponent("cells", isDirectory: true) }

    static func validReview(_ id: String) -> Bool { id.range(of: "^r-[a-z0-9]{10}$", options: .regularExpression) != nil }
    static func validColumn(_ id: String) -> Bool { id.range(of: "^c-[a-z0-9]{10}$", options: .regularExpression) != nil }

    func reviewURL(_ id: String) -> URL { dir.appendingPathComponent(id + ".json") }
    func columnURL(_ id: String) -> URL { columnsDir.appendingPathComponent(id + ".md") }
    func cellsURL(_ id: String) -> URL { cellsDir.appendingPathComponent(id + ".cells.json") }

    // ---- reviews

    // Every review here, newest change first: [{ id, name, updated }].
    func list(_ core: JSCore) -> [[String: Any]] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
        let out: [[String: Any]] = names.compactMap { name in
            guard name.hasSuffix(".json") else { return nil }
            let id = String(name.dropLast(5))
            guard Self.validReview(id), let r = review(id, core) else { return nil }
            return ["id": id, "name": r["name"] as? String ?? id, "updated": r["updated"] as? String ?? ""]
        }
        return out.sorted { ($0["updated"] as? String ?? "") > ($1["updated"] as? String ?? "") }
    }

    // A review, made whole (Glue.reviewParse); nil when it isn't there or isn't one.
    func review(_ id: String, _ core: JSCore) -> [String: Any]? {
        guard Self.validReview(id), let text = Self.text(reviewURL(id)) else { return nil }
        return (try? core.glueJSON("reviewParse", [text, id])).flatMap(Self.object)
    }

    func writeReview(_ review: [String: Any], _ core: JSCore, now: Date = Date()) throws {
        guard let id = review["id"] as? String, Self.validReview(id) else { throw WriteError.badId }
        let url = reviewURL(id)
        if let old = Self.text(url), !Self.blank(old), (try? core.glueJSON("reviewParse", [old, id])) == "null" { throw WriteError.damaged(url.path) }
        try write(core.glue("reviewText", [review, Self.iso(now)], as: String.self), to: url)
    }

    // ---- columns

    // Every column of your own: id → its definition (Glue.reviewColumnParse).
    func columns(_ core: JSCore) -> [String: [String: Any]] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: columnsDir.path)) ?? []
        var out: [String: [String: Any]] = [:]
        for name in names where name.hasSuffix(".md") {
            let id = String(name.dropLast(3))
            guard Self.validColumn(id), let text = Self.text(columnURL(id)),
                  let c = (try? core.glueJSON("reviewColumnParse", [text, id])).flatMap(Self.object) else { continue }
            out[id] = c
        }
        return out
    }

    func writeColumn(_ column: [String: Any], _ core: JSCore) throws {
        guard let id = column["id"] as? String, Self.validColumn(id) else { throw WriteError.badId }
        let text = try core.glue("reviewColumnText", [column], as: String.self)
        // what is written must read back as a column (a name, a kind): nothing half-made is saved
        guard (try? core.glueJSON("reviewColumnParse", [text, id])).flatMap(Self.object) != nil else { throw WriteError.badId }
        try write(text, to: columnURL(id))
    }

    // ---- cells

    // The values of these columns: column id → paper id → { v, updated, by } (an AI cell's facts too: ReviewCore.parseCells).
    func cells(_ ids: [String], _ core: JSCore) -> [String: Any] {
        var out: [String: Any] = [:]
        for id in ids where Self.validColumn(id) {
            guard let text = Self.text(cellsURL(id)) else { continue }
            out[id] = (try? core.glueJSON("reviewCells", [text])).flatMap(Self.object) ?? [:]
        }
        return out
    }

    func setCell(column: String, paper: String, value: String, by: String, _ core: JSCore, now: Date = Date()) throws {
        guard Self.validColumn(column) else { throw WriteError.badId }
        let url = cellsURL(column)
        let old = Self.text(url) ?? ""
        if !Self.blank(old), Self.object(old) == nil { throw WriteError.damaged(url.path) }
        let json = try core.glueJSON("reviewSetCell", [old, paper, value, Self.iso(now), by])
        guard let text = (try? JSONSerialization.jsonObject(with: Data(json.utf8), options: .fragmentsAllowed)) as? String else { throw WriteError.badId }
        try write(text, to: url)
    }

    // Back to the AI's answer: an AI cell you edited, as the AI last made it. False when there's nothing to go back to.
    func restoreCell(column: String, paper: String, _ core: JSCore, now: Date = Date()) throws -> Bool {
        guard Self.validColumn(column) else { throw WriteError.badId }
        let url = cellsURL(column)
        guard let old = Self.text(url) else { return false }
        if !Self.blank(old), Self.object(old) == nil { throw WriteError.damaged(url.path) }
        let json = try core.glueJSON("reviewRestoreCell", [old, paper, Self.iso(now)])
        guard let text = (try? JSONSerialization.jsonObject(with: Data(json.utf8), options: .fragmentsAllowed)) as? String else { return false }
        try write(text, to: url)
        return true
    }

    // ---- the files

    private func write(_ text: String, to url: URL) throws {
        guard !readOnly else { throw WriteError.readOnly }
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(text.utf8).write(to: url, options: .atomic)
    }

    // A plain file's text (never a link's: a synced folder could hold one pointing anywhere), at most 8 MB.
    static func text(_ url: URL) -> String? {
        guard let v = try? url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey]),
              v.isRegularFile == true, v.isSymbolicLink != true, (v.fileSize ?? 0) <= 8 << 20 else { return nil }
        return try? String(contentsOf: url, encoding: .utf8)
    }

    static func blank(_ text: String) -> Bool { text.allSatisfy { $0.isWhitespace } }

    static func object(_ json: String) -> [String: Any]? {
        (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any]
    }

    static func iso(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f.string(from: date)
    }
}
