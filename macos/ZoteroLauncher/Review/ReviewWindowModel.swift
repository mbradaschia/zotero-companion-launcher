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
    private(set) var review: [String: Any]?
    private var results: [[String: Any]] = []
    private var total = 0
    private var problem = ""
    private var loading = true
    private var searchSerial = 0
    private var searchedAt = Date.distantPast
    private var ready = false

    static let maxPapers = 200 // (the bridge's cap on a search)

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
        let scoped = (try? core.glueJSON("reviewScope", [review["source"] ?? [:], launcher.reviewContext()["searches"] ?? []])).flatMap(ReviewFiles.object) ?? [:]
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

    func send() {
        guard ready, let page, let core = launcher.core, let review else { return }
        let defs = files?.columns(core) ?? [:]
        let ids = (review["columns"] as? [[String: Any]] ?? []).compactMap { $0["id"] as? String }
        page.load([
            "review": review,
            "columns": defs,
            "cells": files?.cells(ids.filter { defs[$0] != nil }, core) ?? [:],
            "results": launcher.withPendingStatuses(results),
            "total": total,
            "ctx": launcher.reviewContext(),
            "readOnly": files?.readOnly ?? true,
            "problem": problem,
            "loading": loading
        ])
    }

    // What the page sends (ReviewGrid.js's post).
    func handle(_ m: [String: Any]) {
        switch m["type"] as? String ?? "" {
        case "ready": ready = true; send()
        case "refresh": reload(); search()
        case "layout": if let l = m["review"] as? [String: Any] { change { r in for k in ["columns", "sort", "lines", "panel"] { if let v = l[k] { r[k] = v } } } }
        case "rename":
            if let n = (m["name"] as? String)?.trimmingCharacters(in: .whitespaces), !n.isEmpty { change { $0["name"] = n } }
        case "source":
            guard let s = m["source"] as? [String: Any] else { return }
            let oldName = review.flatMap { r in try? launcher.core?.glue("reviewSourceName", [r["source"] ?? [:]], as: String.self) }
            change { r in
                // a name you didn't give it follows the source
                if oldName == nil || r["name"] as? String == oldName { r["name"] = (try? self.launcher.core?.glue("reviewSourceName", [s], as: String.self)) ?? r["name"] }
                r["source"] = s
            }
            search()
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
        default: break
        }
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
        if flags == .command && chars == "r" { reload(); search(); return true }
        // the editing keys, for the page's text fields (an app without an Edit menu doesn't send them)
        let edits: [String: Selector] = ["c": #selector(NSText.copy(_:)), "v": #selector(NSText.paste(_:)), "x": #selector(NSText.cut(_:)),
                                         "a": #selector(NSText.selectAll(_:)), "z": Selector(("undo:"))]
        if flags == .command, let action = edits[chars] { NSApp.sendAction(action, to: nil, from: nil); return true }
        if flags == [.command, .shift] && chars == "z" { NSApp.sendAction(Selector(("redo:")), to: nil, from: nil); return true }
        return false
    }
}
