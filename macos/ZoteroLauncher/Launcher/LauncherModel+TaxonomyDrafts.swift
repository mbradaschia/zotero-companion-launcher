import Foundation

// Settings › Taxonomies, continued (LauncherModel+Taxonomies.swift has the list and a taxonomy's form): a taxonomy
// drafted with AI (asked, discussed, accepted or not), and the review of labels below the threshold.
extension LauncherModel {
    // ---- AI drafts

    // A draft not accepted or discarded yet (asked and waiting, or proposed) is kept when you leave its page or the
    // launcher closes: opened again, it's as you left it. Starting another one first asks before it's dropped.
    func openTaxonomyDraft(_ id: String) {
        if !runnerInstalled { return flashMessage("Taxonomies with AI need the AI features: Settings › Setup installs them") }
        if needsSetup { return flashMessage("Set up an AI model first: Settings › Models & providers") }
        if syncedWriteRefused() { return } // (refused before a minute of work, not at its save)
        if let d = tax.draft, Self.draftPending(d) {
            if (d["id"] as? String ?? "") == id { return reopenTaxonomyDraft() }
            return askConfirm(ConfirmAsk(title: "Drop your AI draft “\(draftName(d))”?", yes: "Drop it and start this one", no: "Keep it",
                                         detail: "It isn't saved: accept it first to keep it", noDetail: "Its page: Settings › Taxonomies › " + draftPlace(d),
                                         run: { [weak self] in self?.startTaxonomyDraft(id) }))
        }
        startTaxonomyDraft(id)
    }

    private func startTaxonomyDraft(_ id: String) {
        tax.draft = ["id": id, "base": id.isEmpty ? NSNull() : (tax.edit ?? NSNull()), "input": "", "turns": [Any](), "busy": false, "error": "", "saveError": "", "proposal": NSNull(), "notes": ""]
        store.push("settings-tax-ai")
        rebuildList()
    }

    private func reopenTaxonomyDraft() {
        store.push("settings-tax-ai")
        rebuildList()
        if tax.draft?["proposal"] is [String: Any], tax.draft?["busy"] as? Bool != true { _ = selectRow { $0.rowId == "tax-ai-accept" } }
    }

    // (as Settings.js' pendingDraft: waiting, proposed, or the last ask failed)
    static func draftPending(_ d: [String: Any]) -> Bool { d["busy"] as? Bool == true || d["proposal"] is [String: Any] || !(d["error"] as? String ?? "").isEmpty }

    private func draftName(_ d: [String: Any]) -> String {
        (d["proposal"] as? [String: Any])?["name"] as? String ?? (d["base"] as? [String: Any])?["name"] as? String ?? "a new taxonomy"
    }

    // Where a draft's page is, from Settings › Taxonomies.
    private func draftPlace(_ d: [String: Any]) -> String {
        (d["id"] as? String ?? "").isEmpty ? "New taxonomy with AI" : ((d["base"] as? [String: Any])?["name"] as? String ?? "the taxonomy") + " › Change it with AI"
    }

    // Ask the AI: the request (with the conversation so far) to your prompts model; its proposal shown.
    func sendTaxonomyRequest() {
        guard var d = tax.draft, d["busy"] as? Bool != true else { return }
        let request = (d["input"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !request.isEmpty else { return flashMessage("Type what you want first") }
        guard !tax.drafting else { return flashMessage("One request at a time: wait for the one running") }
        let turns = d["turns"] as? [[String: Any]] ?? []
        let input: [String: Any] = ["id": d["id"] ?? "", "request": request, "turns": turns.map { ["request": $0["request"] ?? "", "taxonomy": $0["taxonomy"] ?? NSNull(), "notes": $0["notes"] ?? ""] }]
        d["busy"] = true
        d["error"] = ""
        d["saveError"] = ""
        d["input"] = request
        let clock = DateFormatter()
        clock.dateFormat = "HH:mm"
        d["since"] = clock.string(from: Date())
        tax.draft = d
        tax.drafting = true
        let serial = UUID().uuidString
        tax.draft?["serial"] = serial
        store.followTop = false
        rebuildList()
        runRunner(["taxonomy-draft"], stdin: taxJSON(input), timeout: 600) { [weak self] r in
            guard let self else { return }
            self.tax.drafting = false
            guard var next = self.tax.draft, next["serial"] as? String == serial else { return } // left, or another one since
            let model = self.resolvedPromptsModel
            let out = r.json as? [String: Any] ?? ["error": r.timedOut ? "no answer in 10 minutes" + (model.isEmpty ? "" : " from " + model) + " (Settings › Models & providers picks another)"
                                                                      : r.problem.isEmpty ? "the model didn't answer" : r.problem]
            next["busy"] = false
            if let e = out["error"] as? String {
                next["error"] = e + ((out["notes"] as? String).flatMap { $0.isEmpty ? nil : " (" + $0 + ")" } ?? "")
            } else {
                next["turns"] = turns + [["request": request, "taxonomy": out["taxonomy"] ?? NSNull(), "notes": out["notes"] ?? ""]]
                next["proposal"] = out["taxonomy"] ?? NSNull()
                next["notes"] = out["notes"] ?? ""
                next["input"] = ""
            }
            next["since"] = ""
            self.tax.draft = next
            let failed = out["error"] != nil
            if self.store.view == "settings-tax-ai" {
                self.store.followTop = false
                self.rebuildList()
                _ = self.selectRow { $0.rowId == (failed ? "tax-ai-ask" : "tax-ai-accept") }
                return self.flashMessage(failed ? "The AI couldn't: " + (out["error"] as? String ?? "") : "A proposal: accept it, or ask for changes")
            }
            // left meanwhile: the draft waits on its page, its row in Settings › Taxonomies says so
            if self.store.inSettings { self.store.followTop = false; self.rebuildList() }
            self.flashMessage(failed ? "The AI couldn't: " + (out["error"] as? String ?? "") + " · Settings › Taxonomies › " + self.draftPlace(next)
                                     : "A proposal for “\(self.draftName(next))” waits: Settings › Taxonomies › " + self.draftPlace(next))
        }
    }

    func acceptTaxonomyDraft() {
        guard let d = tax.draft, let p = d["proposal"] as? [String: Any], d["busy"] as? Bool != true, let core else { return }
        let id = d["id"] as? String ?? ""
        let saved = (try? core.glueJSON("acceptedDraft", [p, d["base"] ?? NSNull()])) ?? "{}"
        taxJob(id.isEmpty ? ["taxonomy-save", "--new"] : ["taxonomy-save", id], stdin: saved) { [weak self] ok, data, error in
            guard let self else { return }
            guard ok, let data else {
                // said on the page too (a flash goes in 3 seconds), the draft kept to accept again or change
                self.tax.draft?["saveError"] = error
                if self.store.view == "settings-tax-ai" { self.store.followTop = false; self.rebuildList() }
                return self.flashMessage("Not saved: " + error)
            }
            self.tax.draft = nil
            if self.store.view == "settings-tax-ai" { _ = self.back() }
            if !id.isEmpty {
                self.tax.edit = data
                if self.store.inSettings { self.store.followTop = false; self.rebuildList() }
                self.flashMessage("Accepted: saved as yours")
            } else {
                self.openTaxonomy(data["id"] as? String ?? "")
                self.flashMessage("Made “\(data["name"] as? String ?? "")”: tag papers by it from a paper's menu, or a collection's Go to")
            }
        }
    }

    // ---- the review

    // Enter (tag it) or Delete (dismiss it) on a suggestion: by its id, not its place (the list may change meanwhile).
    func decideSuggestion(_ row: ListRow, accept: Bool) {
        guard let i = Int(row.value), let s = tax.review?[safe: i] else { return }
        let args = ["classify-decide", "--item", s["id"] as? String ?? "", "--taxonomy", s["taxonomy"] as? String ?? "", "--label", s["label"] as? String ?? "", accept ? "--accept" : "--dismiss"]
        taxJob(args) { [weak self] ok, _, error in
            guard let self else { return }
            self.flashMessage(!ok ? "Couldn't save it: " + error : accept ? "Tagged " + (s["prefix"] as? String ?? "") + (s["label"] as? String ?? "") : "Dismissed")
            self.refreshTaxonomyReview()
        }
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
