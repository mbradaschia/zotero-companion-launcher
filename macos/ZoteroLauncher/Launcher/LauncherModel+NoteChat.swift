import AppKit
import Foundation

// The chat beside a note: the reader's right pane, the paper's chat (ChatWindowModel, docked as in a review table), so
// a note and its paper's chat are read side by side. c opens it (or gives it the keys when it's open), ⌥⌘C shows or
// hides it, as in a review table; esc in its empty box gives the keys back to the note. It follows the note's paper.
// Shown or not, and its width, are this Mac's (kept for the next note); ⌘- ⌘+ ⌘0 in it are the chat's text size.
extension LauncherModel {
    nonisolated static let noteChatDefaultWidth: CGFloat = 340
    nonisolated static let noteChatWidths: ClosedRange<CGFloat> = 260...720
    nonisolated static let noteColumnMin: CGFloat = 280 // the note's text never narrower than this: the chat gives way
    nonisolated static var keptNoteChatWidth: CGFloat {
        let w = UserDefaults.standard.double(forKey: "ZLNoteChatWidth")
        return w > 0 ? min(max(CGFloat(w), 260), 720) : 340
    }

    // The note's paper, for its chat: the note's own parent (the menu left behind may be another paper's), else (the
    // note still loading) the paper whose menu this is; nil for a note on no paper.
    var notePaper: PaperRef? {
        if let p = note.data?["parent"] as? [String: Any], let key = p["key"] as? String, !["note", "attachment"].contains(p["itemType"] as? String ?? "") {
            return PaperRef(key: key, libraryID: p["libraryID"] as? Int ?? 1, title: p["title"] as? String ?? "", itemType: "")
        }
        if note.data == nil, let item = actionItem, !["note", "attachment"].contains(item.itemType) { return item }
        return nil
    }

    // The pane is drawn: reading a note, the pane on.
    var noteChatVisible: Bool { store.inNote && noteChatShown }

    // c in the reader: the chat beside the note, with the keys in its box (open already: the keys go there).
    func noteChatKey() {
        if noteChatVisible, noteChat != nil, noteChat?.item.id == notePaper?.id { return focusNoteChat() }
        showNoteChat()
    }

    // ⌥⌘C, the header's chat button: the pane shown or hidden.
    func toggleNoteChat() {
        if noteChatVisible { hideNoteChat() } else { showNoteChat() }
    }

    func showNoteChat(focus: Bool = true) {
        guard let paper = notePaper else { return flashMessage("This note isn't on a paper: nothing to chat about") }
        guard runnerInstalled else { return flashMessage("Chat needs the AI features: Settings › Setup installs them") }
        UsageLog.shared.count("pane:note-chat")
        makeNoteChat(paper)
        noteChatShown = true
        if focus { focusNoteChat() }
    }

    func hideNoteChat() {
        noteChatShown = false
        focusNote()
    }

    func focusNoteChat() {
        DispatchQueue.main.async { [weak self] in self?.noteChat?.focusInput() }
    }

    // The keys back to the note (esc in the chat's empty box, the pane hidden).
    func focusNote() {
        DispatchQueue.main.async { [weak self] in self?.noteDisplay?.takeKeys() }
    }

    // A note shown with the pane on: the chat follows its paper (not while an answer comes in: it stays on its paper).
    func noteChatFollow() {
        guard noteChatShown, store.inNote, let paper = notePaper, runnerInstalled else { return }
        makeNoteChat(paper)
    }

    private func makeNoteChat(_ paper: PaperRef) {
        if let chat = noteChat { return chat.follow(paper) }
        let chat = ChatWindowModel(item: paper, launcher: self, docked: true)
        chat.close = { [weak self] in self?.focusNote() } // (docked, esc in its empty box: the chat stays, the note gets the keys)
        chat.focusOnShow = false
        chat.popOut = { [weak self] in self?.noteChatInWindow() }
        chat.hide = { [weak self] in self?.hideNoteChat() }
        noteChat = chat
    }

    // The pane's chat, in its own window (the pane's button): the launcher closes, as c did before the pane.
    func noteChatInWindow() {
        guard let chat = noteChat else { return }
        let session = chat.sessionId
        noteChatShown = false
        openChatWindow(chat.item, session: session)
    }

    // A key while the chat beside the note has the keys (its box, or its page): → taken. The box keeps its own keys
    // (↵ sends, ⇧↵ a new line, esc stops the answer or gives the keys back); the launcher's ⌘W was handled before.
    func noteChatWindowKey(_ e: NSEvent) -> Bool {
        guard let chat = noteChat else { return false }
        let flags = e.modifierFlags.intersection([.command, .option, .control, .shift])
        let chars = (e.charactersIgnoringModifiers ?? "").lowercased()
        let inBox = e.window?.firstResponder is NSText
        if flags == [.command, .option] && chars == "c" { toggleNoteChat(); return true }
        if let step = TextSize.step(e) { chat.showFlash(ChatTextSize.shared.step(step)); return true } // (every chat's)
        if e.keyCode == 122 || (!inBox && chars == "?") { chat.showKeys.toggle(); return true } // ? or F1 (the box takes ? as text)
        if !inBox && e.keyCode == 53 { chat.escape(); return true }
        return EditKeys.send(e) // (the box's ⌘V, ⌘Z…)
    }
}
