import AppKit
import SwiftUI

// The chat docked on the right of a review table: the app's chat (ChatWindowModel, ChatWindowView), about the panel's
// paper (it follows the selection) or about the list, the papers as the table shows them (the runner reads their
// citations and abstracts, and the columns you see). The page lays out the right pane: its tabs, Info and Chat, or both
// split (Info above, the chat below; a tab dragged down splits it); its width (a drag at its edge) and the split's
// heights are kept here, for the next table. The chat is drawn over the place the page leaves it (#chatslot).
// The Chat tab, the toolbar's icon and ⌥⌘C open it; the Info tab, esc in an empty box or ⌥⌘C again go back to Info.
// A list's Ask each paper makes the question an AI column, the table shows the run's plan, and when the run is done
// its answers come back here to be summed up.
extension ReviewWindowModel {
    nonisolated private static let chatWidthKey = "ZLReviewChatWidth"
    nonisolated static let chatWidths: ClosedRange<Double> = 260...900
    nonisolated static var savedChatWidth: Double {
        let w = UserDefaults.standard.double(forKey: chatWidthKey)
        return w > 0 ? min(max(w, chatWidths.lowerBound), chatWidths.upperBound) : 360
    }

    // The pane split (Info above, the chat below) and Info's share of its height, kept for the next table.
    nonisolated private static let splitKey = "ZLReviewPaneSplit"
    nonisolated private static let ratioKey = "ZLReviewPaneRatio"
    nonisolated static var paneSplit: Bool { UserDefaults.standard.bool(forKey: splitKey) }
    nonisolated static var paneRatio: Double {
        let r = UserDefaults.standard.double(forKey: ratioKey)
        return r > 0 ? min(max(r, 0.2), 0.8) : 0.5
    }

    func paneChanged(_ m: [String: Any]) {
        if let on = m["split"] as? Bool { UserDefaults.standard.set(on, forKey: Self.splitKey) }
        if let r = m["ratio"] as? Double { UserDefaults.standard.set(min(max(r, 0.2), 0.8), forKey: Self.ratioKey) }
        if let w = m["width"] as? Double { keepChatWidth(w) }
    }

    // The chat's place in the page moved (or went): the chat drawn there; a place and no chat yet: it's made.
    func slotMoved(_ s: [String: Any]?) {
        guard let s, let x = s["x"] as? Double, let y = s["y"] as? Double, let w = s["w"] as? Double, let h = s["h"] as? Double, w > 0, h > 0 else {
            if chatSlot != nil { chatSlot = nil }
            return
        }
        let next = CGRect(x: x, y: y, width: w, height: h)
        if next != chatSlot { chatSlot = next }
        makeChat(chatMode)
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
        if m["close"] as? Bool == true { return closeChat() } // (the pane hidden: ⌥⌘I)
        if m["toggle"] as? Bool == true { return toggleChat() }
        openChat(m["mode"] as? String == "list" ? "list" : "paper")
    }

    func toggleChat() {
        if chatOpen { showInfo() } else { openChat(chatMode) }
    }

    // The Info tab: the page's panel back in the pane (shown if you'd hidden it).
    func showInfo() {
        closeChat()
        page?.showInfo()
    }

    func openChat(_ mode: String) {
        UsageLog.shared.count("window:review-chat-" + mode)
        makeChat(mode)
        chatMode = mode
        chatOpen = true
        send()
        DispatchQueue.main.async { [weak self] in (mode == "list" ? self?.listChat : self?.paperChat)?.focusInput() }
    }

    // The mode's chat made, if it isn't yet (a paper's needs the panel's paper); a paper's follows it.
    func makeChat(_ mode: String) {
        if mode == "list" {
            if listChat == nil {
                listChat = ChatWindowModel(item: PaperRef(key: "", libraryID: 1, title: title, itemType: ""), launcher: launcher, docked: true,
                                           list: ChatList(review: id, name: { [weak self] in self?.title ?? "the list" },
                                                          read: { [weak self] done in self?.readList(done) ?? done(nil) },
                                                          askEach: { [weak self] q in self?.askEach(q) }))
                listChat?.close = { [weak self] in self?.showInfo() }
            }
        } else if let p = chatPaper {
            if let c = paperChat { c.follow(p) } else {
                paperChat = ChatWindowModel(item: p, launcher: launcher, docked: true)
                paperChat?.close = { [weak self] in self?.showInfo() }
                paperChat?.cellsOf = { [weak self] ref, done in self?.cellsOf(ref, done) ?? done(nil) }
            }
        }
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
        guard chatMode == "paper" else { return }
        if chatOpen { if let c = paperChat { c.follow(ref) } else { openChat("paper") } }
        else if chatSlot != nil { makeChat("paper") } // (split: the chat below follows too)
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

    // A paper's columns as the table shows them (its row of ReviewCore.chatList), for a paper chat on its metadata;
    // [] when it isn't in the list's first 200, nil when the page doesn't answer.
    func cellsOf(_ ref: PaperRef, _ done: @escaping ([[String: Any]]?) -> Void) {
        let id = "\(ref.libraryID == 0 ? 1 : ref.libraryID):\(ref.key)"
        readList { list in
            guard let list else { return done(nil) }
            let papers = list["papers"] as? [[String: Any]] ?? []
            done(papers.first { $0["id"] as? String == id }?["cells"] as? [[String: Any]] ?? [])
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

// A review table's window: the grid, and the chat drawn over the place the page leaves it in the right pane (its CSS
// px, scaled by the page's zoom).
struct ReviewWindowContent: View {
    @ObservedObject var model: ReviewWindowModel
    let launcher: LauncherModel

    var body: some View {
        ZStack(alignment: .topLeading) {
            ReviewWebView(model: model).frame(minWidth: 320, minHeight: ReviewWindows.minSize.height)
            if let s = model.chatSlot {
                let z = ReviewWindowModel.zoom
                ReviewChatPane(review: model, launcher: launcher)
                    .frame(width: s.width * z, height: s.height * z)
                    .background(ThemeStore.shared.palette.background)
                    .themed()
                    .offset(x: s.minX * z, y: s.minY * z)
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
                ChoiceTabs(choices: [
                    .init(id: "paper", title: "Paper", symbol: "doc.text", help: "Chat about the selected paper: its full text, or its metadata (below)"),
                    .init(id: "list", title: "List", symbol: "list.bullet", help: "Chat across the list: each paper's citation, abstract, and the columns you see"),
                ], selection: review.chatMode) { review.openChat($0) }
                Spacer()
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
