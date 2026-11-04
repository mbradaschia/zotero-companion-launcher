import AppKit
import SwiftUI

// The chat docked on the right of a review table: the app's chat (ChatWindowModel, ChatWindowView), about the panel's
// paper (it follows the selection) or about the list, the papers as the table shows them (the runner reads their
// citations and abstracts, and the columns you see). The panel's chat icon, the toolbar's and ⌥⌘C open it; ✕, esc in
// an empty box or ⌥⌘C again close it. A list's Ask each paper makes the question an AI column, the table shows the
// run's plan, and when the run is done its answers come back here to be summed up.
extension ReviewWindowModel {
    nonisolated private static let chatWidthKey = "ZLReviewChatWidth"
    nonisolated static let chatWidths: ClosedRange<Double> = 320...900
    nonisolated static var savedChatWidth: Double {
        let w = UserDefaults.standard.double(forKey: chatWidthKey)
        return w > 0 ? min(max(w, chatWidths.lowerBound), chatWidths.upperBound) : 420
    }

    func keepChatWidth(_ w: Double) {
        chatWidth = min(max(w, Self.chatWidths.lowerBound), Self.chatWidths.upperBound)
        UserDefaults.standard.set(chatWidth, forKey: Self.chatWidthKey)
    }

    static func paperRef(_ p: [String: Any]?) -> PaperRef? {
        guard let p, let key = p["key"] as? String, key.range(of: "^[A-Z0-9]{8}$", options: .regularExpression) != nil else { return nil }
        return PaperRef(key: key, libraryID: p["libraryID"] as? Int ?? 1, title: p["title"] as? String ?? "", itemType: p["itemType"] as? String ?? "")
    }

    // The page's chat icon (the panel's: its paper; the toolbar's: toggle), { mode, paper, toggle }.
    func chatAsked(_ m: [String: Any]) {
        if let p = Self.paperRef(m["paper"] as? [String: Any]) { chatPaper = p }
        if m["toggle"] as? Bool == true { return toggleChat() }
        openChat(m["mode"] as? String == "list" ? "list" : "paper")
    }

    func toggleChat() {
        if chatOpen { closeChat() } else { openChat(chatMode) }
    }

    func openChat(_ mode: String) {
        UsageLog.shared.count("window:review-chat-" + mode)
        if mode == "list" {
            if listChat == nil {
                listChat = ChatWindowModel(item: PaperRef(key: "", libraryID: 1, title: title, itemType: ""), launcher: launcher, docked: true,
                                           list: ChatList(review: id, name: { [weak self] in self?.title ?? "the list" },
                                                          read: { [weak self] done in self?.readList(done) ?? done(nil) },
                                                          askEach: { [weak self] q in self?.askEach(q) }))
                listChat?.close = { [weak self] in self?.closeChat() }
            }
        } else if let p = chatPaper {
            if let c = paperChat { c.follow(p) } else {
                paperChat = ChatWindowModel(item: p, launcher: launcher, docked: true)
                paperChat?.close = { [weak self] in self?.closeChat() }
            }
        }
        chatMode = mode
        chatOpen = true
        send()
        DispatchQueue.main.async { [weak self] in (mode == "list" ? self?.listChat : self?.paperChat)?.focusInput() }
    }

    func closeChat() {
        guard chatOpen else { return }
        chatOpen = false
        send()
    }

    // The panel's paper moved (the page says as you move): the paper's chat follows it, unless an answer is coming in.
    func chatPaperMoved(_ p: [String: Any]?) {
        guard let ref = Self.paperRef(p) else { return }
        chatPaper = ref
        if chatOpen, chatMode == "paper" {
            if let c = paperChat { c.follow(ref) } else { openChat("paper") }
        }
    }

    // The list as the page shows it (ReviewCore.chatList), for a list chat's question; nil when the page doesn't
    // answer in a few seconds.
    func readList(_ done: @escaping ([String: Any]?) -> Void) {
        listAsked += 1
        let token = listAsked
        listAsks[token] = done
        page?.chatList(token)
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
            guard let self, let late = self.listAsks.removeValue(forKey: token) else { return }
            late(nil)
        }
    }

    func listAnswered(_ m: [String: Any]) {
        guard let token = m["token"] as? Int, let done = listAsks.removeValue(forKey: token) else { return }
        done(m["list"] as? [String: Any])
    }

    // Ask each paper: the page makes the column and shows the run's plan; its answers come back as askedEach.
    func askEach(_ question: String) {
        if launcher.syncFolderGone || files?.readOnly != false { listChat?.showFlash("Not asked: " + launcher.syncFolderAway); return }
        page?.askEach(["question": question])
        listChat?.showFlash("The table shows the run's plan: Run starts it, and the answers come back here")
    }

    // The column's run is done: { question, label, answers: [{ cite, value }], papers }. The chat is asked to sum them up.
    func askedEach(_ m: [String: Any]) {
        guard let chat = listChat else { return }
        let question = m["question"] as? String ?? ""
        let label = m["label"] as? String ?? "the new column"
        let answers = (m["answers"] as? [[String: Any]] ?? []).compactMap { a -> String? in
            let v = (a["value"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return v.isEmpty ? nil : "- " + (a["cite"] as? String ?? "") + ": " + v.replacingOccurrences(of: "\n", with: " ")
        }
        guard !question.isEmpty, !answers.isEmpty else { chat.showFlash("No answers came back from “\(label)”: nothing to sum up"); return }
        let papers = m["papers"] as? Int ?? answers.count
        let text = "I asked each paper in the list, reading its full text: “\(question)”\n\nTheir answers (the table's new column “\(label)”), one per paper:\n\n"
            + answers.joined(separator: "\n")
            + "\n\nNow answer my question across the papers, from these answers and the list: group what they say, say how many papers support each point, name the ones that disagree or don't address it, and cite each paper with its in-text citation."
        let display = "Asked each paper: “\(question)” (\(answers.count) of \(papers) answered, in “\(label)”)"
        if !chatOpen || chatMode != "list" { openChat("list") }
        if chat.busy { return chat.showFlash("“\(label)” is filled: ask the chat to sum it up when this answer ends") }
        chat.ask(text, display: display)
    }
}

// A review table's window: the grid, and the chat docked on its right when it's open (its width dragged at its edge,
// kept for the next table).
struct ReviewWindowContent: View {
    @ObservedObject var model: ReviewWindowModel
    let launcher: LauncherModel
    @State private var dragFrom: Double?

    var body: some View {
        HStack(spacing: 0) {
            ReviewWebView(model: model).frame(minWidth: 320, minHeight: ReviewWindows.minSize.height)
            if model.chatOpen {
                ZStack {
                    Color.clear
                    Rectangle().fill(Color(nsColor: .separatorColor)).frame(width: 1)
                }
                .frame(width: 6)
                .contentShape(Rectangle())
                .onHover { inside in if inside { NSCursor.resizeLeftRight.push() } else { NSCursor.pop() } }
                .gesture(DragGesture(minimumDistance: 1, coordinateSpace: .global).onChanged { g in
                    let from = dragFrom ?? model.chatWidth
                    if dragFrom == nil { dragFrom = from }
                    model.chatWidth = min(max(from - g.translation.width, ReviewWindowModel.chatWidths.lowerBound), ReviewWindowModel.chatWidths.upperBound)
                }.onEnded { _ in
                    dragFrom = nil
                    model.keepChatWidth(model.chatWidth)
                })
                .help("Drag: the chat's width")
                ReviewChatPane(review: model, launcher: launcher)
                    .frame(width: model.chatWidth)
                    .themed()
            }
        }
    }
}

// The docked chat: Paper or List, then the chat itself.
struct ReviewChatPane: View {
    @ObservedObject var review: ReviewWindowModel
    let launcher: LauncherModel

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Picker("", selection: Binding(get: { review.chatMode }, set: { review.openChat($0) })) {
                    Text("Paper").tag("paper")
                    Text("List").tag("list")
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .fixedSize()
                .help("What the chat reads: the selected paper (its text, highlights and notes), or the list (each paper's citation, abstract and the columns you see)")
                Spacer()
                Button { review.closeChat() } label: { Image(systemName: "xmark") }
                    .buttonStyle(.borderless)
                    .help("Close the chat (⌥⌘C): it's kept, the icon brings it back")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            Divider()
            if review.chatMode == "list", let m = review.listChat {
                ChatWindowView(model: m, launcher: launcher).id("list")
            } else if review.chatMode == "paper", let m = review.paperChat {
                ChatWindowView(model: m, launcher: launcher).id("paper")
            } else {
                VStack(spacing: 8) {
                    Text("Pick a paper in the table to chat about it, or switch to List to ask across the papers.")
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(24)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }
}
