import Foundation

// A drag out of the app (Marcelo, 2026-11-04: "it should carry the text by default", in every view). What a thing
// carries is its text, as plain text, so any app takes it: a paper a reference line (ReviewCore.reference: APA 7's
// shape, from the search's first creator, year, title and journal), a note its text, a citation row the citation in
// your style, a collection or a tag its name, a task its description. No link and no file beside it: an app that
// prefers a link (Mail, Notes, a browser) would take that instead of the text.
extension LauncherModel {
    // Whether a result can be dragged out (cheap: the rows' bodies ask it; the text is made when the drag starts).
    static func dragsOut(_ row: SearchRow) -> Bool {
        ["item", "note-child", "collection", "tag", "saved-search"].contains(row.kind)
    }

    // A drag starting from a result: its text, the row noted (a paper dropped back on the list moves: dropPaper).
    func startDrag(_ row: SearchRow) -> String {
        dragSource = Self.paperId(row)
        return dragText(row) ?? row.title
    }

    // A result's text, nil when it carries none.
    func dragText(_ row: SearchRow) -> String? {
        switch row.kind {
        case "item":
            if row.itemType == "note" { return noteDragText(key: row.key, title: row.title, excerpt: "") }
            if row.itemType == "attachment" { return row.title }
            return paperReference(row)
        case "note-child":
            // (its subtitle: "<date> · <excerpt>")
            let excerpt = row.subtitle.range(of: " · ").map { String(row.subtitle[$0.upperBound...]) } ?? ""
            return noteDragText(key: row.key, title: row.title, excerpt: excerpt)
        case "collection", "tag", "saved-search":
            return row.title.isEmpty ? nil : row.title
        default:
            return nil
        }
    }

    // Whether a list row can be dragged out.
    static func dragsOut(_ row: ListRow) -> Bool {
        !row.noteKey.isEmpty || ["cite-copy", "tag", "todo"].contains(row.rowId)
    }

    // A list row's text: a note's (the paper's notes, Read note), a citation row's citation, a tag's name, a task's
    // description; nil for the others (a menu's actions carry nothing).
    func dragText(_ row: ListRow) -> String? {
        if !row.noteKey.isEmpty {
            let title = row.rowId == "read" ? actionItem?.title ?? "" : row.label
            return noteDragText(key: row.noteKey, title: title, excerpt: row.detail)
        }
        switch row.rowId {
        case "cite-copy":
            let mine = citePreview.flatMap { p in actionItem.map { p.id == $0.id && p.style == citationStyle } } ?? false
            let text = mine ? citePreview?.text(row.value) ?? "" : ""
            return text.isEmpty ? nil : text
        case "tag": return row.tag.isEmpty ? nil : row.tag
        case "todo": return row.label.isEmpty ? nil : row.label
        default: return nil
        }
    }

    // A paper's reference line: from its row in the last search's answer (its creator, year and journal), else from the
    // row's own subtitle ("<creator> · <year> · <journal>"), else its title.
    func paperReference(_ row: SearchRow) -> String {
        let results = response?["results"] as? [[String: Any]] ?? []
        let raw = results.first { ($0["key"] as? String) == row.key && (($0["libraryID"] as? Int).flatMap { $0 == 0 ? nil : $0 } ?? 1) == row.libraryID }
            ?? Self.paperFields(row)
        let text = (try? core?.call("ReviewCore", "reference", [raw], as: String.self)) ?? nil
        return text.flatMap { $0.isEmpty ? nil : $0 } ?? row.title
    }

    // A result's creator, year and journal read back from its subtitle (Views.subtitle joins them with " · ", each
    // only when there is one): what comes before the year is the creator, after it the journal.
    static func paperFields(_ row: SearchRow) -> [String: Any] {
        let parts = row.subtitle.components(separatedBy: " · ")
        var out: [String: Any] = ["title": row.title, "creator": "", "year": "", "publication": ""]
        if let y = parts.firstIndex(where: { $0.count == 4 && Int($0) != nil }) {
            out["creator"] = parts[..<y].joined(separator: " · ")
            out["year"] = parts[y]
            out["publication"] = parts[(y + 1)...].joined(separator: " · ")
        } else if let first = parts.first, !first.isEmpty {
            out["creator"] = first
            out["publication"] = parts.dropFirst().joined(separator: " · ")
        }
        return out
    }

    // A note's whole text, once Zotero has given it (the reader's cache; a note row the pointer rests on is asked for
    // ahead: prefetchNote); before that, its title and the excerpt the list shows.
    func noteDragText(key: String, title: String, excerpt: String) -> String {
        if let html = note.cache[key]?["html"] as? String, let text = plainText(html: html) { return text }
        return [title, excerpt].filter { !$0.isEmpty }.joined(separator: "\n\n")
    }

    // A note's HTML as plain text (ReviewCore.htmlText), nil when there's none.
    func plainText(html: String) -> String? {
        let text = (try? core?.call("ReviewCore", "htmlText", [html], as: String.self)) ?? nil
        return text.flatMap { $0.isEmpty ? nil : $0 }
    }

    // The note the reader shows, as its grip drags it out.
    var readerDragText: String {
        (note.data?["html"] as? String).flatMap { plainText(html: $0) } ?? note.target?["title"] as? String ?? ""
    }

    // A note row the pointer moved onto: the note asked of Zotero now (once an opening, kept in the reader's cache),
    // so a drag that follows carries its whole text, and the reader opens it at once.
    func prefetchNote(key: String, libraryID: Int) {
        guard !key.isEmpty, note.cache[key] == nil, !notesAsked.contains(key) else { return }
        notesAsked.insert(key) // (a failure isn't asked again this opening: the drag carries the excerpt)
        bridge.post("/note", ["key": key, "libraryID": libraryID, "format": "html"], timeout: 8) { [weak self] result in
            MainActor.assumeIsolated {
                guard let self, case .ok(let answer) = result, self.note.cache[key] == nil else { return }
                self.note.cache[key] = answer
            }
        }
    }

    // The note a row is, if it is one (to ask for it ahead).
    static func noteOf(_ row: SearchRow) -> (key: String, libraryID: Int)? {
        guard row.kind == "note-child" || (row.kind == "item" && row.itemType == "note") else { return nil }
        return (key: row.key, libraryID: row.libraryID)
    }

    static func noteOf(_ row: ListRow) -> (key: String, libraryID: Int)? {
        guard !row.noteKey.isEmpty else { return nil }
        return (key: row.noteKey, libraryID: row.noteLibraryID)
    }
}
