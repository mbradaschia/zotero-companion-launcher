import Foundation

// A row of the search results as lib/Views.js builds it (buildRows: papers, collections, tags,
// each with every field). Every field is required: a missing one is a shape change in the JS.
struct SearchRow: Decodable, Equatable {
    var section: String
    var kind: String
    var key: String
    var libraryID: Int
    var itemType: String
    var icon: String
    var title: String
    var titleHtml: String
    var subtitle: String
    var openState: String
    var pdfCount: Int
    var noteCount: Int
    var tagsText: String
    var ranks: String // "ABS 4*|FT50"
    var status: String // "\u{0}": unknown (an older Zotero plugin)

    var isPaper: Bool { kind == "item" }

    // Its status's name, "" for none or unknown (lib/Client.js's statusName: the tag without its s/).
    var statusName: String {
        guard !status.isEmpty, status != "\u{0}" else { return "" }
        return status.lowercased().hasPrefix("s/") ? String(status.dropFirst(2)) : status
    }

    // Whether it has a PDF attached (the bridge counts them for every paper).
    var hasPdf: Bool { isPaper && pdfCount > 0 }

    // An SF Symbol for the row (lib/Views.js's icons are Nerd Font glyphs, not installed on macOS). A paper's
    // symbol is its type's, solid when it has a PDF and hollow when it hasn't: a shape, never a colour alone.
    var symbol: String {
        switch kind {
        case "collection": return "folder"
        case "tag": return "tag"
        case "saved-search": return "magnifyingglass"
        case "item": return Self.paperSymbol(itemType, pdf: hasPdf)
        default: return "arrow.right.circle"
        }
    }

    static func paperSymbol(_ itemType: String, pdf: Bool) -> String {
        let base: String
        switch itemType {
        case "book": base = "book.closed"
        case "bookSection": base = "book"
        case "thesis": base = "graduationcap"
        case "conferencePaper": base = "person.3"
        case "report": base = "doc.plaintext"
        case "webpage", "blogPost": base = "globe.americas" // (plain globe has no solid form)
        case "preprint", "manuscript": base = "doc.badge.clock"
        default: base = "doc.text"
        }
        return pdf ? base + ".fill" : base
    }
}
