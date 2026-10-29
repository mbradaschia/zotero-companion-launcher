import AppKit

// The footer's hints on a line or two (lib/Views.js's hintParts and fitHints, ported: they measure
// text): the ones that go back (esc, ⌫) always, then the others in order while there is room.
enum FitHints {
    static let keyWords: Set<String> = ["tab", "esc", "del", "space", "pgup", "pgdn", "home", "end", "enter"]
    static let most = 6 // a footer's hints besides going back: / search, ? keys and four for where you are

    // "⇧↵ z zotero" → keys "⇧↵ z", desc "zotero".
    static func parts(_ hint: String) -> (keys: String, desc: String) {
        let words = hint.split(whereSeparator: \.isWhitespace).map(String.init)
        var n = 0
        while n < words.count - 1, words[n].count == 1 || words[n].contains(where: { !("a"..."z").contains($0) && $0 != "-" }) || keyWords.contains(words[n]) { n += 1 }
        return (words.prefix(n).joined(separator: " "), words.dropFirst(n).joined(separator: " "))
    }

    // The hints shown on `lines` lines of `width`, each line laid out as FlowLayout lays out the footer's; at most `most`
    // besides the ones that go back (the rest are in ? keys).
    static func fit(_ hints: [String], width: CGFloat, gap: CGFloat, lines: Int = 1, most: Int = .max, widthOf: (String) -> CGFloat) -> [String] {
        let widths = hints.map(widthOf)
        let back = Set(hints.indices.filter { parts(hints[$0]).keys.contains("esc") || parts(hints[$0]).keys.contains("⌫") })
        var take = back
        for i in hints.indices where !take.contains(i) && widths[i] <= width && take.count - back.count < most {
            let tried = take.union([i])
            let shown = hints.indices.filter(tried.contains).map { widths[$0] }
            if FlowLayout.lines(widths: shown, maxWidth: width, spacing: gap).count <= lines { take = tried }
        }
        return hints.enumerated().filter { take.contains($0.offset) }.map(\.element)
    }

    // A hint's width in the footer's fonts: its keys in the bold one, its words in the regular.
    static func width(_ hint: String, size: CGFloat = NSFont.smallSystemFontSize) -> CGFloat {
        let p = parts(hint)
        let keys = (p.keys as NSString).size(withAttributes: [.font: NSFont.boldSystemFont(ofSize: size)]).width
        let desc = (p.desc as NSString).size(withAttributes: [.font: NSFont.systemFont(ofSize: size)]).width
        return keys + (p.keys.isEmpty || p.desc.isEmpty ? 0 : 4) + desc
    }
}
