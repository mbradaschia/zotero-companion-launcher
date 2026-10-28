import Foundation

// The review tables (phase 11a): ⌘T opens what the results list as a review, the menu bar lists the reviews, and a
// review window changes a paper's status and its default task through the launcher's own pending changes (one
// write a second after the last press, whichever window it came from).
extension LauncherModel {
    var reviewFiles: ReviewFiles? {
        guard let dir = pathsJSON["reviews"] as? String, !dir.isEmpty else { return nil }
        return ReviewFiles(dir: URL(fileURLWithPath: dir, isDirectory: true), readOnly: paths?.readOnly ?? false)
    }

    // Every review, newest change first (the menu bar's Review Tables).
    func reviewList() -> [[String: Any]] {
        guard let core, let files = reviewFiles else { return [] }
        return files.list(core)
    }

    // What a review window draws with besides its papers: your statuses, the task statuses, each paper's default
    // task, the taxonomies (their labels and fingerprint: the AI columns on them), the saved searches, whether Jev's key
    // is set and the models (an AI column's).
    func reviewContext() -> [String: Any] {
        let statuses = todoStatuses
        let tasks = defaultTasks.mapValues { s -> [String: Any] in ["id": s["id"] ?? "", "name": s["name"] ?? "", "group": s["group"] ?? ""] }
        return [
            "statuses": paperStatuses,
            "taskStatusList": statuses.map { ["id": $0["id"] ?? "", "name": $0["name"] ?? "", "group": $0["group"] ?? ""] },
            "taskStatuses": statuses.compactMap { $0["name"] as? String },
            "tasks": tasks,
            "taxonomies": tax.taxonomies.map { ["id": $0["id"] ?? "", "name": $0["name"] ?? "", "prefix": $0["prefix"] ?? "", "kind": $0["kind"] ?? "",
                                                "labels": $0["labels"] ?? [], "threshold": $0["threshold"] ?? 0.6, "hash": $0["hash"] ?? ""] },
            "searches": savedSearches.map { ["id": $0["id"] ?? "", "name": $0["name"] ?? "", "query": $0["query"] ?? ""] },
            "jev": jevKeySet,
            "models": ((runnerModels as? [[String: Any]]) ?? []).map { ["value": $0["value"] ?? "", "label": $0["displayName"] ?? $0["value"] ?? "", "group": $0["group"] ?? ""] }
        ]
    }

    // ⌘T: the results as a review table, a new one: the scope (a collection, a tag, a saved search), else the query
    // typed. Its window opens; the launcher stays as it is.
    func openReviewHere() {
        guard let core, let files = reviewFiles else { return flashMessage("Couldn't open a review table: " + (coreError ?? "the files didn't load")) }
        let query = store.filterText.trimmingCharacters(in: .whitespaces)
        var source: [String: Any]
        if let s = searchScope {
            source = ["type": s.type, "key": s.key, "libraryID": s.libraryID == 0 ? 1 : s.libraryID, "title": s.type == "tag" && s.title.hasPrefix("#") ? String(s.title.dropFirst()) : s.title]
            if s.type == "search" { source["query"] = s.query }
        } else if !query.isEmpty {
            source = ["type": "query", "query": query]
        } else {
            return flashMessage("Type a query, or open a collection, a tag or a saved search: ⌘T opens its papers as a review table")
        }
        guard !syncFolderGone, !files.readOnly else { return flashMessage("Not saved: " + syncFolderAway) }
        do {
            let json = try core.glueJSON("reviewNew", [source, reviewContext(), ReviewFiles.iso(Date())])
            guard let review = ReviewFiles.object(json), let id = review["id"] as? String else { return }
            try files.writeReview(review, core)
            openReviewWindow(id)
            flashMessage("Opened “\(review["name"] as? String ?? "")” as a review table (in its own window)")
        } catch {
            flashMessage(reviewProblem(error))
        }
    }

    // A review file's write that failed, in the launcher's words.
    func reviewProblem(_ error: Error) -> String {
        switch error {
        case ReviewFiles.WriteError.readOnly: return "Not saved: " + syncFolderAway
        case ReviewFiles.WriteError.damaged(let path): return shown(path) + " isn't valid: not changed, so what it holds isn't lost (fix or remove it)"
        default: return "Couldn't save it: \(error)"
        }
    }

    // ---- a paper's status and default task, set from a review window

    // The status tag `to` ("" none) on a paper whose tag was `from`: shown at once wherever the launcher shows it,
    // saved a second after the last change (flushStatuses).
    func setPaperStatus(_ item: [String: Any], from: String, to: String) {
        let lib = item["libraryID"] as? Int ?? 1
        let key = item["key"] as? String ?? ""
        let id = "\(lib):\(key)"
        marks.statusShown[id] = to
        marks.statusPending[id] = (["key": key, "libraryID": lib], marks.statusPending[id]?.from ?? from, to)
        if case .search(var rows) = content, rows.contains(where: { $0.key == key && $0.libraryID == lib }) {
            for i in rows.indices where rows[i].key == key && rows[i].libraryID == lib { rows[i].status = to }
            content = .search(rows)
        }
        statusTimer?.invalidate()
        statusTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: false) { [weak self] _ in MainActor.assumeIsolated { self?.flushStatuses() } }
    }

    // The paper's default task at the status `status` (an id): made if it has none, saved a second after the last
    // change (flushDefaultTasks), its t/ tags with it.
    func setDefaultTask(_ item: [String: Any], status: String) {
        guard todoStatuses.contains(where: { $0["id"] as? String == status }) else { return }
        let lib = item["libraryID"] as? Int ?? 1
        let key = item["key"] as? String ?? ""
        let id = "\(lib):\(key)"
        let creator = item["creator"] as? String ?? ""
        let year = item["year"] as? String ?? ""
        let cite = !creator.isEmpty && !year.isEmpty ? "\(creator) (\(year))" : ""
        marks.taskShown[id] = status
        marks.taskPending[id] = (["key": key, "libraryID": lib, "title": item["title"] as? String ?? "", "cite": cite], status)
        refreshRowTasks()
        taskTimer?.invalidate()
        taskTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: false) { [weak self] _ in MainActor.assumeIsolated { self?.flushDefaultTasks() } }
    }

    // The statuses not yet saved, over a /search answer's rows (a window searching again meanwhile shows them).
    func withPendingStatuses(_ results: [[String: Any]]) -> [[String: Any]] {
        guard !marks.statusShown.isEmpty else { return results }
        return results.map { r in
            let id = "\(r["libraryID"] as? Int ?? 1):\(r["key"] as? String ?? "")"
            guard let shown = marks.statusShown[id] else { return r }
            var out = r
            out["status"] = shown
            return out
        }
    }
}
