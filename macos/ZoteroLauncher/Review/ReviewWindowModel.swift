import AppKit
import Foundation
import UniformTypeIdentifiers

// One review table's window (phase 11a): its file, its columns and their values, the papers its source finds (the
// bridge's /search, as the launcher sends it), what the page sends (a layout, a value, a status, a task, an export)
// and what is written for it. The page draws; ReviewCore.js decides, here and in the page alike.
@MainActor
final class ReviewWindowModel: ObservableObject {
    unowned let launcher: LauncherModel
    let id: String
    @Published private(set) var title = "Review"
    weak var page: ReviewPage?
    var close: () -> Void = {}
    var pin: (Bool) -> Void = { _ in } // the window kept over the others' (ReviewWindows)
    private(set) var review: [String: Any]?
    private var results: [[String: Any]] = []
    private var total = 0
    private var problem = ""
    private var loading = true
    private var searchSerial = 0
    private var searchedAt = Date.distantPast
    private var ready = false
    private var preview: String? // a query typed in the source's box, searched as you type; ↵ keeps it, esc drops it
    private static let pinKey = "ZLReviewPinned"
    // Pinned: the windows stay over other apps' (as the launcher's pin); kept for the next table.
    var pinned: Bool {
        get { UserDefaults.standard.bool(forKey: Self.pinKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.pinKey); pin(newValue) }
    }

    static let maxPapers = 200 // (the bridge's cap on a search)

    // The tables' text size (⌘- ⌘+ ⌘0): the page zoomed, columns and all; kept for the next table.
    private static let zoomKey = "ZLReviewZoom"
    static let zoomSteps: [Double] = [0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8, 2]
    static var zoom: Double {
        get { let z = UserDefaults.standard.double(forKey: zoomKey); return zoomSteps.contains(z) ? z : 1 }
        set { UserDefaults.standard.set(newValue == 1 ? nil : newValue, forKey: zoomKey) }
    }
    var zoomed: (Double) -> Void = { _ in } // every table's page at that size (ReviewWindows)

    func stepZoom(_ step: Int) {
        let steps = Self.zoomSteps
        let i = steps.firstIndex(of: Self.zoom) ?? 3
        let next = step == 0 ? 1 : steps[max(0, min(steps.count - 1, i + step))]
        Self.zoom = next
        zoomed(next)
        page?.flash("Text \(Int((next * 100).rounded()))%" + (next == 1 ? "" : " (⌘0 its size)"))
    }

    init(id: String, launcher: LauncherModel) {
        self.id = id
        self.launcher = launcher
        reload()
        search()
    }

    private var files: ReviewFiles? { launcher.reviewFiles }

    // The review's file read again (another machine may have changed it).
    func reload() {
        guard let core = launcher.core, let files else { return }
        if let r = files.review(id, core) {
            review = r
            title = r["name"] as? String ?? "Review"
        } else if review == nil {
            problem = "This review table's file isn't there any more (\(launcher.shown(files.reviewURL(id).path)))"
        }
    }

    // ---- the papers

    // The source searched (again): the newest answer wins.
    func search() {
        guard let core = launcher.core, let review, let settings = launcher.settings else { return }
        searchSerial += 1
        let serial = searchSerial
        searchedAt = Date()
        loading = true
        var source: Any = review["source"] ?? [String: Any]()
        if let preview { source = ["type": "query", "query": preview] } // (typed in the box, not kept yet)
        let scoped = (try? core.glueJSON("reviewScope", [source, launcher.reviewContext()["searches"] ?? []])).flatMap(ReviewFiles.object) ?? [:]
        if scoped["gone"] as? Bool == true { problem = "Its saved search was deleted: the table searches what it last held. Pick another in the box above" } else { problem = "" }
        var body: [String: Any]
        do {
            let json = try core.glueJSON("searchBody", [scoped["query"] ?? "", scoped["scope"] ?? NSNull(), settings.json, [Any](), launcher.todos?.json ?? RawJSON(text: "[]"),
                                                        launcher.chat.chats ?? [], launcher.todoStatuses])
            body = ReviewFiles.object(json) ?? [:]
        } catch {
            loading = false
            problem = "Couldn't search: \(error)"
            return send()
        }
        body["limit"] = Self.maxPapers
        body.removeValue(forKey: "emptyQuery")
        body.removeValue(forKey: "pinned")
        if scoped["scope"] is NSNull || scoped["scope"] == nil, (scoped["query"] as? String ?? "").trimmingCharacters(in: .whitespaces).isEmpty {
            loading = false
            results = []
            total = 0
            problem = "No papers to list: pick a saved search or type a query in the box above"
            return send()
        }
        send()
        launcher.bridge.post("/search", body, timeout: 10) { [weak self] result in
            MainActor.assumeIsolated {
                guard let self, serial == self.searchSerial else { return }
                self.loading = false
                switch result {
                case .ok(let answer):
                    self.results = (answer["results"] as? [[String: Any]] ?? []).filter { ($0["itemType"] as? String).map { !["note", "attachment"].contains($0) } ?? true }
                    self.total = answer["total"] as? Int ?? self.results.count
                default:
                    self.problem = result.message
                }
                self.send()
            }
        }
    }

    // The window came forward: searched again if it's been a few seconds (the list is live).
    func becameKey() {
        reload()
        if Date().timeIntervalSince(searchedAt) > 3 { search() } else { send() }
    }

    // ---- the page

    private func columnIds(_ review: [String: Any]?) -> [String] {
        (review?["columns"] as? [[String: Any]] ?? []).compactMap { $0["id"] as? String }
    }

    func send() {
        guard ready, let page, let core = launcher.core, let review else { return }
        let defs = files?.columns(core) ?? [:]
        let ids = columnIds(review)
        page.load([
            "review": review,
            "columns": defs,
            "cells": files?.cells(ids.filter { defs[$0] != nil }, core) ?? [:],
            "results": launcher.withPendingStatuses(results),
            "total": total,
            "ctx": launcher.reviewContext(),
            "readOnly": files?.readOnly ?? true,
            "problem": problem,
            "loading": loading,
            "pinned": pinned,
            "preview": preview ?? NSNull(),
            "run": runTask ?? NSNull()
        ])
    }

    // What the page sends (ReviewGrid.js's post).
    func handle(_ m: [String: Any]) {
        let type = m["type"] as? String ?? ""
        if !["ready", "layout", "segments", "preview"].contains(type) { UsageLog.shared.count("review:" + type) } // (what the page sends on its own isn't a use)
        switch type {
        case "ready": ready = true; send()
        case "refresh": reload(); search()
        case "layout":
            guard let l = m["review"] as? [String: Any] else { return }
            let had = Set(columnIds(review))
            change { r in for k in ["columns", "sort", "group", "lines", "panel"] { if let v = l[k] { r[k] = v } } }
            if !Set(columnIds(review)).isSubset(of: had) { send() } // a column added from Columns: its cells (other tables' answers too)
        case "rename":
            if let n = (m["name"] as? String)?.trimmingCharacters(in: .whitespaces), !n.isEmpty { change { $0["name"] = n } }
        case "source":
            guard let s = m["source"] as? [String: Any] else { return }
            setSource(s)
        case "preview":
            let q = (m["query"] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
            preview = q.isEmpty ? nil : q
            search()
        case "segments": // the query as the launcher's search box reads it: its blocks and their labels
            let text = m["text"] as? String ?? ""
            let json = (try? launcher.core?.glueJSON("querySegments", [text, m["caret"] as? Int ?? text.utf16.count, true])) ?? "[]"
            page?.segments(text, (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [Any] ?? [])
        case "saveSearch": saveSearch(name: m["name"] as? String ?? "", query: m["query"] as? String ?? "")
        case "pin": pinned = m["on"] as? Bool ?? !pinned; send()
        case "cell": setCell(m)
        case "addColumn": addColumn(m["column"] as? [String: Any])
        case "status":
            guard let p = m["paper"] as? [String: Any] else { return } // (a tag in Zotero: the sync folder isn't needed)
            launcher.setPaperStatus(p, from: m["from"] as? String ?? "", to: m["to"] as? String ?? "")
        case "task":
            guard let p = m["paper"] as? [String: Any], let s = m["status"] as? String else { return }
            if launcher.syncFolderGone || launcher.paths?.readOnly == true { return refused("Not saved: " + launcher.syncFolderAway) } // (todos.json)
            launcher.setDefaultTask(p, status: s)
        case "open":
            guard let p = m["paper"] as? [String: Any] else { return }
            launcher.bridge.post("/reveal", ["key": p["key"] ?? "", "libraryID": p["libraryID"] ?? 1], timeout: 8) { [weak self] result in
                MainActor.assumeIsolated {
                    if case .ok = result { self?.launcher.desktop.activateZotero() } else { self?.page?.flash("Couldn't show it in Zotero: " + result.message) }
                }
            }
        case "csv": exportCSV(name: m["name"] as? String ?? title, text: m["text"] as? String ?? "")
        case "run": runAI(m["jobs"] as? [[String: Any]] ?? [])
        case "draftColumn": draftColumn(m)
        case "restore":
            guard let core = launcher.core, let files, let column = m["column"] as? String, let paper = m["paper"] as? String else { return }
            do {
                if try files.restoreCell(column: column, paper: paper, core) { page?.flash("Back to the AI's answer") }
                send()
            } catch {
                refused(launcher.reviewProblem(error))
            }
        default: break
        }
    }

    // The papers from another source: a saved search, a query. A name you didn't give it follows the source.
    private func setSource(_ s: [String: Any]) {
        preview = nil
        let oldName = review.flatMap { r in try? launcher.core?.glue("reviewSourceName", [r["source"] ?? [:]], as: String.self) }
        change { r in
            if oldName == nil || r["name"] as? String == oldName { r["name"] = (try? self.launcher.core?.glue("reviewSourceName", [s], as: String.self)) ?? r["name"] }
            r["source"] = s
        }
        search()
    }

    // ⌘S in the source's box: the query saved as a search (the launcher's, ⌘S there), and the table's source.
    private func saveSearch(name: String, query: String) {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        if launcher.syncFolderGone || launcher.paths?.readOnly == true { return refused("Not saved: " + launcher.syncFolderAway) } // (searches.json)
        guard launcher.saveSearches("addSearch", [name, q, false, launcher.nowMs]), let s = launcher.savedSearches.last, let id = s["id"] as? String else {
            return refused("Couldn't save the search")
        }
        let title = s["name"] as? String ?? q
        setSource(["type": "search", "key": id, "title": title, "query": q])
        page?.flash("Saved “\(title)” as a search: the launcher lists it too (Searches)")
    }

    // The review changed and saved; a failure said, and the page given the file as it is.
    private func change(_ edit: (inout [String: Any]) -> Void) {
        guard let core = launcher.core, let files, var r = review else { return }
        edit(&r)
        do {
            try files.writeReview(r, core)
            reload()
        } catch {
            refused(launcher.reviewProblem(error))
        }
    }

    private func refused(_ text: String) {
        page?.flash(text)
        reload()
        send()
    }

    private func setCell(_ m: [String: Any]) {
        guard let core = launcher.core, let files, let column = m["column"] as? String, let paper = m["paper"] as? String else { return }
        do {
            try files.setCell(column: column, paper: paper, value: m["value"] as? String ?? "", by: launcher.paths?.machine ?? "", core)
        } catch {
            refused(launcher.reviewProblem(error))
        }
    }

    private func addColumn(_ column: [String: Any]?) {
        guard let core = launcher.core, let files, let column else { return }
        do { try files.writeColumn(column, core) } catch { refused(launcher.reviewProblem(error)) }
    }

    // ---- AI columns (phase 11b)

    // This table's AI run, while one runs: { stage, started } (its task in Processes).
    private var runTask: [String: Any]? {
        guard let t = launcher.ai.tasks.first(where: { $0["kind"] as? String == "review" && $0["review"] as? String == id && $0["status"] as? String == "running" }) else { return nil }
        return ["stage": t["stage"] ?? "", "started": t["started"] ?? ""]
    }

    // Run… › Run: the plan's cells to review-run, the job made from the column files (their fingerprint now). The
    // cells come back as it writes them (the launcher draws the open tables again as the run's task moves).
    private func runAI(_ jobs: [[String: Any]]) {
        guard let core = launcher.core, let files, let review else { return }
        if launcher.syncFolderGone || files.readOnly { return refused("Not run: " + launcher.syncFolderAway) } // (the cells are in the sync folder)
        if runTask != nil { return refused("This table's AI run is still going: it's in Processes (Stop all stops it)") }
        let asked = Array(Set(jobs.compactMap { $0["column"] as? String })).sorted()
        let job = (try? core.glueJSON("reviewRunJob", [review, files.columns(core), launcher.reviewContext(), jobs, files.cells(asked, core)])).flatMap(ReviewFiles.object) ?? ["error": "Couldn't make the run"]
        if let e = job["error"] as? String { return refused(e) } // (refused draws the table again: the answers it hadn't shown too)
        let skipped = job["skipped"] as? Int ?? 0
        guard let data = try? JSONSerialization.data(withJSONObject: job), let stdin = String(data: data, encoding: .utf8) else { return }
        let n = (job["jobs"] as? [Any])?.count ?? 0
        if skipped > 0 { send() } // (the answers the table hadn't shown)
        page?.flash("Running \(n) \(n == 1 ? "cell" : "cells"): they fill in as each paper is done (Processes has the run)"
                    + (skipped > 0 ? "; \(skipped) had an answer already, left as \(skipped == 1 ? "it is" : "they are")" : ""))
        launcher.tasksSoon()
        launcher.runRunner(["review-run"], stdin: stdin, timeout: 3 * 3600, quiet: false) { [weak self] r in
            guard let self else { return }
            let out = r.json as? [String: Any]
            if out == nil, !r.ok {
                // (a runner from before 11b: review-run isn't one of its commands)
                let old = r.status == 2 && r.stderr.contains("usage:")
                self.page?.flash(old ? "The AI features here are older than the app: Settings › Setup › Install the AI features updates them" : "The run failed: " + r.problem)
            }
            self.launcher.refreshTasks()
            self.send()
        }
    }

    // + Column › An AI column › Write it with AI: what you described to review-draft (your prompts model); the column
    // it writes goes back to the dialog's fields, nothing saved.
    private func draftColumn(_ m: [String: Any]) {
        let input: [String: Any] = ["kind": m["kind"] as? String ?? "prompt", "request": m["request"] as? String ?? "", "current": m["current"] as? [String: Any] ?? [:]]
        guard let data = try? JSONSerialization.data(withJSONObject: input), let stdin = String(data: data, encoding: .utf8) else { return }
        launcher.runRunner(["review-draft"], stdin: stdin, timeout: 300) { [weak self] r in
            guard let self else { return }
            if let out = r.json as? [String: Any] {
                self.page?.drafted(out)
                return
            }
            let old = r.status == 2 && r.stderr.contains("usage:")
            self.page?.drafted(["error": old ? "the AI features here are older than the app: Settings › Setup › Install the AI features updates them" : r.problem.isEmpty ? "the model didn't answer" : r.problem])
        }
    }

    // ⌘E, Export ▾ › CSV: a save panel, the file written as the page made it.
    private func exportCSV(name: String, text: String) {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [UTType.commaSeparatedText]
        panel.nameFieldStringValue = Self.fileName(name) + ".csv"
        panel.canCreateDirectories = true
        panel.begin { [weak self] answer in
            MainActor.assumeIsolated {
                guard answer == .OK, let url = panel.url else { return }
                do {
                    try Data(text.utf8).write(to: url, options: .atomic)
                    self?.page?.flash("Exported: " + (self?.launcher.shown(url.path) ?? url.lastPathComponent))
                } catch {
                    self?.page?.flash("Couldn't export it: \(error.localizedDescription)")
                }
            }
        }
    }

    // A name as a file's: no slashes or colons, at most 80 characters.
    static func fileName(_ name: String) -> String {
        let cleaned = name.replacingOccurrences(of: "[/:\\\\\"“”]", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
        return cleaned.isEmpty ? "Review" : String(cleaned.prefix(80))
    }

    // ---- keys (the window's own; the page takes the rest)

    func windowKey(_ e: NSEvent) -> Bool {
        let flags = e.modifierFlags.intersection([.command, .option, .control, .shift])
        let chars = (e.charactersIgnoringModifiers ?? "").lowercased()
        if flags == .command && chars == "w" { close(); return true }
        // ⌘- ⌘+ ⌘0 (or ⌃): the tables' text smaller, larger, back to its size (every table: one setting, as the pin)
        let zoomFlags: [NSEvent.ModifierFlags] = [.command, .control, [.command, .shift], [.control, .shift]]
        if zoomFlags.contains(flags), let step = ["-": -1, "=": 1, "+": 1, "0": 0][chars] {
            stepZoom(step)
            return true
        }
        if flags == .command && chars == "r" { reload(); search(); return true }
        // the editing keys, for the page's text fields (an app without an Edit menu doesn't send them)
        let edits: [String: Selector] = ["c": #selector(NSText.copy(_:)), "v": #selector(NSText.paste(_:)), "x": #selector(NSText.cut(_:)),
                                         "a": #selector(NSText.selectAll(_:)), "z": Selector(("undo:"))]
        if flags == .command, let action = edits[chars] { NSApp.sendAction(action, to: nil, from: nil); return true }
        if flags == [.command, .shift] && chars == "z" { NSApp.sendAction(Selector(("redo:")), to: nil, from: nil); return true }
        return false
    }
}
