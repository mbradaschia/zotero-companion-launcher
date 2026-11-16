import AppKit
import Combine

// The text size keys, the same in every view: ⌘- smaller, ⌘+ larger (⌘= too, no ⇧ needed), ⌘0 back to the default.
// Each view keeps its own size (the note's in view.json, the reader's, a review table's, the chat's this Mac's).
enum TextSize {
    // ⌘ or ⌃, with or without ⇧ (⌘⇧= is ⌘+ on a US keyboard; ⌘⇧- types _).
    static let modifiers: [NSEvent.ModifierFlags] = [.command, .control, [.command, .shift], [.control, .shift]]

    // A key's step in a window's own key monitor: nil when it isn't a text size key.
    static func step(_ e: NSEvent) -> Int? {
        let flags = e.modifierFlags.intersection([.command, .option, .control, .shift])
        guard modifiers.contains(flags) else { return nil }
        return step((e.charactersIgnoringModifiers ?? "").lowercased())
    }

    // What a step flashes, the same everywhere: "Text 16 px (⌘0 its size)", "Text 110%"; the hint only off the default.
    static func flash(px: Int, base: Int) -> String { "Text \(px) px" + (px == base ? "" : " (⌘0 its size)") }
    static func flash(zoom: Double) -> String { "Text \(Int((zoom * 100).rounded()))%" + (zoom == 1 ? "" : " (⌘0 its size)") }

    // The key's step: -1, 1, or 0 (the default); nil for another key.
    static func step(_ chars: String) -> Int? {
        switch chars {
        case "-", "_": return -1
        case "=", "+": return 1
        case "0": return 0
        default: return nil
        }
    }
}

// The chats' text size (a chat's window, the chat beside a note): this Mac's, 11 to 24 px, 14 by default. A chat
// docked in a review table takes the table's size instead.
@MainActor
final class ChatTextSize: ObservableObject {
    static let shared = ChatTextSize()
    static let base = 14
    static let range = 11...24
    private static let key = "ZLChatTextSize"
    @Published private(set) var px: Int

    private init() {
        let kept = UserDefaults.standard.integer(forKey: Self.key)
        px = Self.range.contains(kept) ? kept : Self.base
    }

    var zoom: CGFloat { CGFloat(px) / CGFloat(Self.base) }

    // A step (TextSize.step's): the flash that says the size.
    @discardableResult
    func step(_ by: Int) -> String {
        px = by == 0 ? Self.base : min(max(px + by, Self.range.lowerBound), Self.range.upperBound)
        UserDefaults.standard.set(px == Self.base ? 0 : px, forKey: Self.key)
        return TextSize.flash(px: px, base: Self.base)
    }
}

// The editing keys (⌘C ⌘V ⌘X ⌘A ⌘Z ⇧⌘Z) for a window's text: an app without an Edit menu doesn't send them, so each
// window's key monitor does (a chat's box, a review table's fields, the reader's).
enum EditKeys {
    static func send(_ e: NSEvent) -> Bool {
        let flags = e.modifierFlags.intersection([.command, .option, .control, .shift])
        let chars = (e.charactersIgnoringModifiers ?? "").lowercased()
        let edits: [String: Selector] = ["c": #selector(NSText.copy(_:)), "v": #selector(NSText.paste(_:)), "x": #selector(NSText.cut(_:)),
                                         "a": #selector(NSText.selectAll(_:)), "z": Selector(("undo:"))]
        if flags == .command, let action = edits[chars] { NSApp.sendAction(action, to: nil, from: nil); return true }
        if flags == [.command, .shift] && chars == "z" { NSApp.sendAction(Selector(("redo:")), to: nil, from: nil); return true }
        return false
    }
}
