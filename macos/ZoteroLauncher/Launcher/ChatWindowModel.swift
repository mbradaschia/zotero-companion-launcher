import AppKit
import Combine
import Foundation

// What a list's chat reads (a review table's docked chat, List): the table's papers as it shows them, asked of the
// page when a question goes (the runner reads them at a chat's first question, and keeps them in the chat).
struct ChatList {
    let review: String
    let name: () -> String
    let read: (@escaping ([String: Any]?) -> Void) -> Void // { name, papers } (ReviewCore.chatList), or nil: the page didn't answer
    let askEach: (String) -> Void // Ask each paper: the question as an AI column, run, then summed up here
}

// One paper's chat in its own window (reference/ChatWindow.qml): the runner's `chat`, a turn at a time,
// streamed; its past chats and artifacts; the source it reads, its model and effort; the outputs. The
// pure parts (the events, the lines under answers, the page, the transcript) are GlueChat.js's. Docked in a review
// table, the same chat: a paper's (it follows the table's selection), or the table's list's (`list`).
@MainActor
final class ChatWindowModel: ObservableObject {
    unowned let launcher: LauncherModel
    let docked: Bool
    let list: ChatList?
    @Published private(set) var item: PaperRef
    @Published var paper: [String: Any]? // the bridge's paper info: title, authors, year
    @Published var savedText: [String: Any]? // its extracted-text note, or nil
    @Published private(set) var state: [String: Any] = ChatWindowModel.freshState() // GlueChat's chat state
    @Published var sessions: [[String: Any]] = [] // this paper's past chats, newest first
    @Published var draft = ""
    @Published var flash = ""
    @Published var busy = false
    @Published var extracting = false
    @Published var groundSource = "note" // what a new chat reads: "note" (the .md note), "pdf", or "meta" (its metadata)
    // A docked paper chat's: the paper's columns as its table shows them (for "meta"); nil elsewhere (no Metadata).
    var cellsOf: ((PaperRef, @escaping ([[String: Any]]?) -> Void) -> Void)?
    @Published var effort: String
    @Published var showSidebar = false
    @Published var showKeys = false
    @Published var renaming = "" // the past chat being renamed
    @Published private(set) var page = "" // the conversation, as the web view's body
    var artifactViews: [String: String] = [:] // id → view, from this window's answers (before the list is read again)
    var close: () -> Void = {}
    var onDone: () -> Void = {}
    var focusInput: () -> Void = {} // (ChatInput's)
    private var turn: RunnerStream?
    private var turnId = 0 // the turn a line belongs to: a late one of an ended turn is dropped
    private var resumable = "" // the session id a turn started from ("" a new chat): kept unless the runner saved one (done)
    private var gotDone = false
    private var loading = 0 // a past chat being read (its token): a turn waits for it, and an old answer is dropped
    private var launcherSink: AnyCancellable?
    var saving = false
    private var flashTimer: Timer?
    private var renderTimer: Timer?
    private var renderDue = false

    init(item: PaperRef, launcher: LauncherModel, session: String = "", docked: Bool = false, list: ChatList? = nil) {
        self.item = item
        self.launcher = launcher
        self.docked = docked
        self.list = list
        effort = (launcher.defaultsRaw["chat"] as? [String: Any])?["effort"] as? String ?? "high"
        render()
        if list == nil { loadPaper() } else { setGrounding() }
        refreshSessions()
        if !session.isEmpty { openSession(session) }
        if launcher.runnerState.models == nil { launcher.refreshModels() }
        if launcher.ai.prompts == nil { launcher.refreshPrompts() }
        // the launcher's lists (artifacts, prompts, models) as they change, at most twice a second
        launcherSink = launcher.objectWillChange.throttle(for: .milliseconds(500), scheduler: RunLoop.main, latest: true)
            .sink { [weak self] _ in self?.objectWillChange.send() }
    }

    static func freshState() -> [String: Any] {
        ["messages": [[String: Any]](), "sessionId": "", "grounding": "", "model": "default", "contextUsed": 0, "contextWindow": 0, "statusText": "", "pendingQuotes": NSNull()]
    }

    // ---- what the view shows

    var messages: [[String: Any]] { state["messages"] as? [[String: Any]] ?? [] }
    var sessionId: String { state["sessionId"] as? String ?? "" }
    var model: String { state["model"] as? String ?? "default" }
    var models: Any { launcher.runnerModels }
    var cite: String {
        if let list { return list.name() }
        return paperCite
    }
    private var paperCite: String { (paper.flatMap { (try? launcher.core?.glue("paperCite", [$0], as: String.self)) }).flatMap { $0.isEmpty ? nil : $0 } ?? item.title }
    var paperTitle: String { paper?["title"] as? String ?? item.title }
    // The top bar: the cite, and the title once Zotero says it (not "Title · Title" meanwhile).
    var paperLine: String {
        if list != nil { return "The list · " + cite }
        return paper?["title"] is String ? cite + " · " + paperTitle : cite
    }
    var windowTitle: String { "Chat · " + cite }
    var chatDefault: String { (launcher.runnerState.models?["defaults"] as? [String: Any])?["chat"] as? String ?? "" }

    var artifacts: [[String: Any]] { list == nil ? launcher.artifacts(of: item) : [] }

    var infoLine: (text: String, high: Bool) {
        var o = state
        o["effort"] = effort
        let out = (try? launcher.core?.glueJSON("chatInfoLine", [o, models, chatDefault])).flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) } as? [String: Any]
        return (out?["text"] as? String ?? "", out?["high"] as? Bool ?? false)
    }

    var groundingNote: String { state["grounding"] as? String ?? "" }

    var modelMenu: [String: Any] {
        (try? launcher.core?.glueJSON("modelMenu", [models, model, effort, chatDefault])).flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) } as? [String: Any] ?? [:]
    }

    var modelButton: String {
        let label = (try? launcher.core?.glue("modelLabel", [models, model, chatDefault], as: String.self)) ?? model
        return label + " · " + (effort.isEmpty ? "default" : effort)
    }

    // ---- the page (re-rendered at most every 150 ms while an answer streams in)

    private func render() {
        let status = state["statusText"] as? String ?? ""
        var o: [String: Any] = ["cite": cite, "status": status]
        if let list { o["list"] = "the papers of “\(list.name())”" }
        page = (try? launcher.core?.glue("chatHtml", [messages, o], as: String.self)) ?? ""
    }

    private func renderSoon() {
        renderDue = true
        guard renderTimer == nil else { return }
        renderTimer = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.renderTimer = nil
                if self.renderDue { self.renderDue = false; self.render() }
            }
        }
    }

    private func setState(_ next: [String: Any], now: Bool = true) {
        state = next
        if now { render() } else { renderSoon() }
    }

    func showFlash(_ text: String) {
        flash = text
        flashTimer?.invalidate()
        flashTimer = Timer.scheduledTimer(withTimeInterval: 4, repeats: false) { [weak self] _ in MainActor.assumeIsolated { self?.flash = "" } }
    }

    // ---- the paper

    var itemArgs: [String] {
        if let list { return ["--review", list.review] }
        return ["--key", item.key, "--library", String(item.libraryID == 0 ? 1 : item.libraryID)]
    }

    func loadPaper() {
        guard list == nil else { return }
        let asked = item
        launcher.bridge.post("/item", ["key": item.key, "libraryID": item.libraryID == 0 ? 1 : item.libraryID], timeout: 8) { [weak self] result in
            MainActor.assumeIsolated {
                guard let self, case .ok(let d) = result, asked == self.item else { return } // (a docked chat moved on to another paper)
                self.paper = d["paper"] as? [String: Any]
                self.savedText = (try? self.launcher.core?.glueJSON("fulltextNote", [d])).flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) } as? [String: Any]
                if self.sessionId.isEmpty { self.setGrounding() }
                self.render()
                // Settings › Defaults › Extract the text first: as the window opens (the runner would at the first question)
                let hasPdf = (try? self.launcher.core?.glue("hasPdf", [d], as: Bool.self)) ?? false
                if self.launcher.defaultOn("autoExtract") && self.savedText == nil && hasPdf {
                    self.showFlash("Extracting the text first (Settings › Defaults)…")
                    self.extract()
                }
            }
        }
    }

    func setGrounding() {
        if list != nil {
            var s = state
            s["grounding"] = "the table's papers as it shows them: citations, abstracts, the columns you see (read at the first question)"
            state = s
            return
        }
        if groundSource == "meta" {
            var s = state
            s["grounding"] = "its metadata: abstract, highlights, notes and the table's columns (not the full text)"
            state = s
            return
        }
        if savedText == nil { groundSource = "pdf" }
        var s = state
        s["grounding"] = groundSource == "note" && savedText != nil ? "the extracted text (.md note), page by page" : "the PDF, read when you ask"
        state = s
    }

    // Ground new chats in the .md note or the PDF; a chat in progress keeps its source, so switching starts a new one.
    func setSource(_ src: String) {
        guard list == nil, src != groundSource, !busy else { return }
        if src == "note" && savedText == nil { return showFlash("Extract the text first") }
        if src == "meta" && cellsOf == nil { return }
        groundSource = src
        if !messages.isEmpty {
            newChat()
            showFlash("A new chat, grounded in " + (src == "note" ? "the extracted text" : src == "meta" ? "its metadata" : "the PDF"))
        }
        setGrounding()
    }

    func extract() {
        guard list == nil, !extracting else { return }
        extracting = true
        showFlash("Extracting the text…")
        launcher.runRunner(["extract", "--json"] + itemArgs, timeout: 3600) { [weak self] r in
            guard let self else { return }
            self.extracting = false
            guard r.ok, let j = r.json as? [String: Any] else { return self.showFlash("Couldn't extract: " + r.problem) }
            self.savedText = ["key": j["note"] ?? "", "title": ""]
            if self.sessionId.isEmpty && self.groundSource != "meta" { self.groundSource = "note"; self.setGrounding() }
            self.showFlash(j["status"] as? String == "exists" ? "The text was already extracted"
                : "Extracted \(j["pages"] ?? 0) pages (p. \(j["first"] ?? "")–\(j["last"] ?? "")): new chats use it")
        }
    }

    // ---- sessions

    func refreshSessions() {
        let asked = item
        launcher.runRunner(["chats"] + itemArgs, timeout: 30) { [weak self] r in
            guard let self, asked == self.item else { return }
            self.sessions = (r.json as? [String: Any])?["chats"] as? [[String: Any]] ?? []
        }
    }

    // A docked paper chat follows the table's selection: the paper's chat it had in this window comes back, else a new
    // one. While an answer comes in it stays on its paper.
    private var lastSessions: [String: String] = [:]
    func follow(_ next: PaperRef) {
        guard list == nil, next.id != item.id, !busy else { return }
        if !sessionId.isEmpty { lastSessions[item.id] = sessionId }
        item = next
        paper = nil
        savedText = nil
        sessions = []
        loading = 0
        if groundSource != "meta" { groundSource = "note" } // (full text or metadata: the choice follows to the next paper)
        setState(Self.freshState())
        setGrounding()
        loadPaper()
        refreshSessions()
        if let s = lastSessions[next.id] { openSession(s) }
    }

    func openSession(_ id: String) {
        guard !busy else { return }
        loading += 1
        let token = loading
        launcher.runRunner(["chat-show", "--session", id] + itemArgs, timeout: 30) { [weak self] r in
            guard let self, token == self.loading, !self.busy else { return } // a later click, or a turn started meanwhile
            defer { self.loading = 0 }
            guard r.ok, let s = r.json as? [String: Any] else { return self.showFlash("Couldn't open that chat: " + r.problem) }
            var next = Self.freshState()
            next["messages"] = (try? self.launcher.core?.glueJSON("sessionMessages", [s, self.models])).flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) } ?? []
            next["sessionId"] = s["id"] ?? ""
            let ctx = s["context"] as? [String: Any]
            next["contextUsed"] = ctx?["used"] ?? 0
            next["contextWindow"] = ctx?["window"] ?? 0
            if let m = s["model"] as? String, !m.isEmpty { next["model"] = m }
            if let e = s["effort"] as? String { self.effort = e }
            if let g = s["grounding"] as? [String: Any] {
                next["grounding"] = g["label"] ?? ""
                let src = g["source"] as? String
                self.groundSource = src == "note" || src == "meta" ? src! : "pdf"
            }
            self.setState(next)
        }
    }

    func newChat() {
        guard !busy else { return }
        var next = Self.freshState()
        next["grounding"] = state["grounding"] ?? ""
        effort = (launcher.defaultsRaw["chat"] as? [String: Any])?["effort"] as? String ?? "high"
        setState(next)
        setGrounding()
        focusInput()
    }

    func renameSession(_ id: String, _ title: String) {
        renaming = ""
        let t = title.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return }
        launcher.runRunner(["chat-rename", "--session", id, "--title", t] + itemArgs, timeout: 30) { [weak self] r in
            guard let self else { return }
            if !r.ok { self.showFlash("Couldn't rename it: " + r.problem) }
            self.refreshSessions()
            self.launcher.refreshChats()
        }
    }

    // ---- a turn

    func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !busy, launcher.core != nil else { return }
        guard loading == 0 else { return showFlash("Opening the chat: a moment") }
        draft = ""
        ask(text)
    }

    // A question: the box's, or (a list's) Ask each paper's, shown as `display` (what you asked) while the model reads
    // the answers too. A list's goes with the table's papers as it shows them now.
    func ask(_ text: String, display: String = "") {
        guard !text.isEmpty, !busy, let core = launcher.core else { return }
        guard loading == 0 else { return showFlash("Opening the chat: a moment") }
        var s = state
        var ms = messages
        ms.append(["role": "user", "text": display.isEmpty ? text : display, "pending": false, "failed": false, "info": ""])
        ms.append(["role": "assistant", "text": "", "pending": true, "failed": false, "info": ""])
        s["messages"] = ms
        setState(s)
        busy = true
        var o = state
        o["effort"] = effort
        o["source"] = groundSource
        let target: [String: Any] = list.map { ["review": $0.review] } ?? ["key": item.key, "libraryID": item.libraryID == 0 ? 1 : item.libraryID]
        let args = (try? core.glue("chatArgs", [target, o], as: [String].self)) ?? []
        turnId += 1
        let id = turnId
        resumable = sessionId
        gotDone = false
        if list == nil && groundSource == "meta" {
            // its metadata: the question with the paper's columns as the table shows them (none outside a table)
            let send: ([[String: Any]]?) -> Void = { [weak self] cells in
                guard let self, id == self.turnId else { return }
                guard let data = try? JSONSerialization.data(withJSONObject: ["question": text, "cells": cells ?? []]), let stdin = String(data: data, encoding: .utf8) else { return }
                self.start(args, stdin: stdin, id: id)
            }
            if let cellsOf { cellsOf(item, send) } else { send([]) }
            return
        }
        guard let list else { return start(args, stdin: text, id: id) }
        list.read { [weak self] papers in
            guard let self, id == self.turnId else { return }
            guard let papers else { return self.turnEnded(RunnerResult(status: 1, stderr: "the table didn't give its papers: try again")) }
            var input: [String: Any] = ["question": text, "list": papers]
            if !display.isEmpty { input["display"] = display }
            guard let data = try? JSONSerialization.data(withJSONObject: input), let stdin = String(data: data, encoding: .utf8) else { return }
            self.start(args, stdin: stdin, id: id)
        }
    }

    private func start(_ args: [String], stdin: String, id: Int) {
        turn = launcher.runner.stream(launcher.runnerArgv(args), stdin: stdin, onLine: { [weak self] line in
            guard let self, id == self.turnId else { return }
            self.event(line)
        }, completion: { [weak self] r in
            guard let self, id == self.turnId else { return }
            self.turnEnded(r)
        })
        if !busy { turn = nil } // (ended already)
    }

    private func event(_ line: String) {
        // a delta, the most frequent: appended here (not the whole chat through JavaScriptCore each time)
        let ev = (try? JSONSerialization.jsonObject(with: Data(line.utf8))) as? [String: Any]
        if let ev, ev["type"] as? String == "delta" {
            var s = state
            var ms = messages
            guard var last = ms.popLast(), last["pending"] as? Bool == true else { return }
            last["text"] = (last["text"] as? String ?? "") + (ev["text"] as? String ?? "")
            ms.append(last)
            s["messages"] = ms
            s["statusText"] = ""
            return setState(s, now: false)
        }
        if ev?["type"] as? String == "done" { gotDone = true }
        guard let core = launcher.core,
              let out = (try? core.glueJSON("chatEvent", [state, line, models])).flatMap({ try? JSONSerialization.jsonObject(with: Data($0.utf8)) }) as? [String: Any],
              let next = out["state"] as? [String: Any] else { return }
        let done = (next["messages"] as? [[String: Any]])?.last?["pending"] as? Bool == false
        setState(next, now: done)
        if let flash = out["flash"] as? String, !flash.isEmpty { showFlash(flash) }
        if let a = out["artifact"] as? [String: Any], let id = a["id"] as? String {
            artifactViews[id] = a["view"] as? String ?? ""
            showSidebar = true
            launcher.refreshArtifacts()
        }
    }

    private func turnEnded(_ r: RunnerResult) {
        busy = false
        turn = nil
        let last = r.stderr.split(whereSeparator: \.isNewline).last.map { String($0).replacingOccurrences(of: "oma-zotero-prompt: ", with: "") } ?? (r.missing ? "the AI features aren't installed (Settings › Setup)" : "")
        if let next = (try? launcher.core?.glueJSON("turnEnded", [state, last])).flatMap({ try? JSONSerialization.jsonObject(with: Data($0.utf8)) }) as? [String: Any] {
            // the runner saves a chat only when its answer is done: a turn that failed or was stopped leaves the chat as
            // it was (the session it started from, or none: the next question starts a new chat)
            var s = next
            if !gotDone { s["sessionId"] = resumable }
            setState(s)
        }
        refreshSessions()
        launcher.refreshChats()
    }

    func stop() {
        if let turn { return turn.stop() }
        // (a list's question waiting for the table's papers: it doesn't go)
        if busy, list != nil {
            turnId += 1
            turnEnded(RunnerResult(status: 143))
        }
    }

    // ---- the box

    func usePrompt(_ p: [String: Any]) {
        let text = (p["body"] as? String ?? p["excerpt"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        let had = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        draft = had.isEmpty ? text : had + "\n\n" + text
        focusInput()
        showFlash("“\(p["title"] as? String ?? "")” is in the question box: edit it, or press Enter")
    }

    func pickModel(_ spec: String) {
        var s = state
        s["model"] = spec
        state = s
        effort = (try? launcher.core?.glue("effortFor", [models, spec, effort], as: String.self)).flatMap { $0.isEmpty ? nil : $0 } ?? effort
    }

    func askToChange(_ a: [String: Any]) {
        draft = "Change the “\(a["title"] as? String ?? "")” " + (a["formatLabel"] as? String ?? "artifact").lowercased() + ": "
        focusInput()
    }

    func openArtifact(_ id: String) {
        let view = artifacts.first { $0["id"] as? String == id }?["view"] as? String ?? artifactViews[id] ?? ""
        if view.isEmpty || !launcher.desktop.open(path: view) { showFlash("That artifact isn't there any more") }
    }

    // ---- keys: Glue's windowKeys("chat-window"), shown by WindowKeys

    // esc: the keys hidden, else a running answer stopped, else (nothing typed) back to the launcher on the paper's
    // menu, the window closed (the chat is kept: the menu reopens it). A question being typed stays.
    // Docked in a table: nothing typed, esc closes the chat (the table stays).
    func escape() {
        if showKeys { showKeys = false } else if busy { stop() } else if draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            if !docked { backToMenu() }
            close()
        }
    }

    // Ask each paper (a list's): the question in the box becomes an AI column that reads each paper's full text; the
    // table shows its run's plan (Run starts it), and the chat sums up the answers when the run is done.
    func askEach() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let list, !text.isEmpty, !busy else { return }
        draft = ""
        list.askEach(text)
    }

    // The window's own keys (its local monitor). → taken
    func windowKey(_ e: NSEvent) -> Bool {
        let flags = e.modifierFlags.intersection([.command, .option, .control, .shift]) // (Caps Lock aside)
        let chars = (e.charactersIgnoringModifiers ?? "").lowercased()
        let inBox = e.window?.firstResponder is NSText // the box, a rename field: their own keys
        if flags == .command && chars == "w" { close(); return true }
        if flags == .option && e.keyCode == 46 { backToMenu(); return true } // ⌥M
        if e.keyCode == 122 { showKeys.toggle(); return true } // F1
        if !inBox && chars == "?" { showKeys.toggle(); return true }
        if !inBox && e.keyCode == 53 { escape(); return true }
        return false
    }

    func windowClosing() {
        stop()
        onDone()
    }
}
