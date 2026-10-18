import Foundation

// Settings › Defaults › Bring papers up to date (Service.qml:1536-1663): the runner counts what's
// out of date (`catchup-plan`), Enter runs one part's jobs one at a time (extract, classify, a
// prompt), kept in extract.json's `update` so it resumes; the waiting ones are in Processes.
extension LauncherModel {
    // catchup-plan's argv for a kind (GlueSettings.js's catchUpPlanArgs): "all" (the page's counts), "taxonomies",
    // "prompts", "recent" (what New papers runs, on the papers added lately), "launch" (what the app's opening checks).
    // [] when it checks nothing.
    func catchUpArgs(_ kind: String) -> [String] {
        guard let core else { return [] }
        return (try? core.glue("catchUpPlanArgs", [settingsJSON, kind, ai.promptsJSON, Self.zoteroDate(daysAgo: Double(catchUpDays))], as: [String].self)) ?? []
    }

    func refreshCatchUp() {
        guard runnerInstalled else { return }
        _ = once("catchup-plan") {
            sched.plan = nil // "Counting…"
            settingsShowChange()
            runRunner(catchUpArgs("all"), timeout: 300, quiet: false) { [weak self] r in // (as the QML: it notifies nothing)
                guard let self else { return }
                let plan = r.json as? [String: Any]
                self.sched.planProblem = plan == nil ? (r.ok ? "the runner didn't answer" : r.problem) : ""
                self.sched.plan = plan ?? [:]
                self.finished("catchup-plan") { self.refreshCatchUp() }
                self.settingsShowChange()
            }
        }
    }

    // A catch-up (taxonomies, prompts, recent; launch: what the app's opening checks), checked first: the runner asked
    // again what needs it (the page's counts may be old), exactly those jobs started. `plan`: one made moments ago
    // (the app's opening), used as it is. done: what to say (started, nothing to do, or why not).
    func startCatchUp(_ kind: String, title: String, plan fresh: [String: Any]? = nil, _ done: @escaping @MainActor (String) -> Void) {
        if extractFile?.upToDate != nil { return done("One is running: stop it first") }
        if sched.checking || sched.launchCheck == .checking { return done("Still checking which papers need it") }
        if let fresh { return done(startCatchUpJobs(kind, title: title, plan: fresh)) }
        let args = catchUpArgs(kind)
        guard !args.isEmpty else { return done("Nothing to do: every paper is up to date") }
        sched.checking = true
        runRunner(args, timeout: 300, quiet: false) { [weak self] r in
            guard let self else { return }
            self.sched.checking = false
            guard let plan = r.json as? [String: Any] else { return done("Couldn't check which papers need it: " + (r.ok ? "the runner didn't answer" : r.problem)) }
            if kind != "launch", self.sched.plan != nil, let part = plan[kind] as? [String: Any], part["jobs"] is [Any] { self.sched.plan?[kind] = part } // (the page counts the fresh one)
            done(self.startCatchUpJobs(kind, title: title, plan: plan))
            self.settingsShowChange()
        }
    }

    // The plan's jobs for the kind (each once; the extractions skipped before left out), kept in extract.json's `update`
    // so they resume, and started. → what to say.
    private func startCatchUpJobs(_ kind: String, title: String, plan: [String: Any]) -> String {
        if extractFile?.upToDate != nil { return "One is running: stop it first" }
        let jobs = (try? core?.glueJSON("catchUpJobs", [plan, kind, extractFile?.skipped ?? [:]])).flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) } as? [[String: Any]] ?? []
        if jobs.isEmpty { return "Nothing to do: every paper is up to date" }
        saveExtractState(["update": ["kind": kind, "title": title, "jobs": jobs, "done": 0, "failed": 0, "started": Self.isoNow()]])
        if status == "ready" { catchUpTick() } else { pingZotero() } // on when Zotero answers (status becoming ready)
        let papers = Set(jobs.map { $0["id"] as? String ?? "" }).count
        return "Started: \(jobs.count) \(jobs.count == 1 ? "process" : "processes") on \(papers) \(papers == 1 ? "paper" : "papers"), in the background (in Processes)"
    }

    // Said in the launcher, or when it opens next.
    func sayLater(_ text: String) {
        if opened { flashMessage(text) } else { laterNote = text }
    }

    // ---- when the app opens: the dry run of what Settings › Defaults › What it checks selects, then a question

    // Once a run of the app (appLaunched), on the machine automation runs on, with nothing catching up already and Ask to
    // catch up when the app opens on; Zotero not answering yet: when it first does (zoteroIsBack). Nothing to do (or no
    // answer): nothing said.
    func launchCatchUpCheck() {
        guard sched.launchCheck == .waiting else { return }
        guard defaultsRaw["launchCatchUp"] as? Bool != false, automationHere, runnerInstalled, extractFile?.upToDate == nil else { sched.launchCheck = .done; return }
        guard status == "ready" else { return pingZotero() }
        let args = catchUpArgs("launch")
        guard !args.isEmpty else { sched.launchCheck = .done; return }
        sched.launchCheck = .checking
        runRunner(args, timeout: 300, quiet: false) { [weak self] r in
            guard let self else { return }
            self.sched.launchCheck = .done
            guard self.extractFile?.upToDate == nil, let plan = r.json as? [String: Any], let core = self.core,
                  let ask = (try? core.glueJSON("launchCatchUpAsk", [plan, self.settingsJSON, self.ai.promptsJSON, self.extractFile?.skipped ?? [:]]))
                    .flatMap({ try? JSONSerialization.jsonObject(with: Data($0.utf8)) }) as? [String: Any] else { return }
            let at = Date()
            self.sched.launchAsk = ConfirmAsk(title: ask["title"] as? String ?? "", yes: ask["yes"] as? String ?? "", no: ask["no"] as? String ?? "",
                                              detail: ask["detail"] as? String ?? "", noDetail: ask["noDetail"] as? String ?? "", run: { [weak self] in
                guard let self else { return }
                self.sched.launchAsk = nil
                // (the plan just made, while it's fresh; else checked again)
                let fresh = Date().timeIntervalSince(at) < 300 ? plan : nil
                if fresh == nil { self.flashMessage("Checking which papers need it…") }
                self.startCatchUp("launch", title: "Bringing papers up to date", plan: fresh) { [weak self] in self?.sayLater($0) }
            }, cancel: { [weak self] in self?.sched.launchAsk = nil }, tag: Self.launchAskTag)
            self.presentLaunchAsk()
        }
    }

    static let launchAskTag = "launch-catchup"

    // The question in the launcher: asked where it is, or the launcher opened for it (its willShow asks it). Kept until
    // answered: closed, or left for another view, it's asked when the launcher opens next. It comes unasked for, so Not
    // now is highlighted: a Return meant for something else leaves the papers be.
    func presentLaunchAsk() {
        guard let ask = sched.launchAsk else { return }
        guard opened else { showLauncher?(); return }
        if store.view == "confirm" && confirmAsk?.tag == ask.tag { return } // (still there: the launcher kept its place)
        askConfirm(ask)
        store.selectedIndex = 1
    }

    // esc (or ⇧esc) on the question is Not now; another view opened over it (Go to…, a note's menu) isn't an answer.
    func escLaunchAsk() {
        if store.view == "confirm", confirmAsk?.tag == Self.launchAskTag { sched.launchAsk = nil }
    }

    func stopCatchUp() {
        saveExtractState(["update": nil])
        refreshCatchUp()
    }

    static func jobKey(_ j: [String: Any]) -> String { "\(j["id"] as? String ?? "")|\(j["op"] as? String ?? "")|\(j["prompt"] as? String ?? "")" }

    // The next jobs, up to Processes at once, never two on one paper at a time (R16); none left and none running: done.
    func catchUpTick() {
        guard let u = extractFile?.upToDate, status == "ready", runnerInstalled else { return }
        let jobs = u["jobs"] as? [[String: Any]] ?? []
        if jobs.isEmpty {
            guard sched.catchUpClaimed.isEmpty else { return }
            saveExtractState(["update": nil])
            let failed = u["failed"] as? Int ?? 0
            notify((u["title"] as? String ?? "Catch up") + " is done", "\(u["done"] as? Int ?? 0) done" + (failed > 0 ? ", \(failed) failed (in Processes)" : ""))
            return refreshCatchUp()
        }
        // (the list read afresh before each start: a job that ends at once is off it; at most Processes at once starts a
        // tick, so a loop can't run away)
        for _ in 0..<processesAtOnce {
            guard sched.catchUpClaimed.count < processesAtOnce, let now = extractFile?.upToDate?["jobs"] as? [[String: Any]] else { break }
            let busy = Set(sched.catchUpClaimed.map { String($0.split(separator: "|", omittingEmptySubsequences: false).first ?? "") })
            guard let job = now.first(where: { !sched.catchUpClaimed.contains(Self.jobKey($0)) && !busy.contains($0["id"] as? String ?? "") }) else { break }
            startCatchUpJob(job)
        }
    }

    private func startCatchUpJob(_ job: [String: Any]) {
        let id = job["id"] as? String ?? "", parts = id.split(separator: ":").map(String.init)
        let op = job["op"] as? String ?? ""
        let mb = (defaultsRaw["extractMaxMB"] as? NSNumber)?.intValue ?? 40
        let only = job["only"] as? [String] ?? []
        let args = op == "extract" ? ["extract-batch", "--items", id, "--max-mb", String(mb)]
            : op == "classify" ? ["classify", "--items", id] + (only.isEmpty ? [] : ["--taxonomies", only.joined(separator: ",")])
            : ["run", job["prompt"] as? String ?? "", "--key", parts.count > 1 ? parts[1] : "", "--library", parts.first ?? "1", "--extract-first"]
                + (job["replace"] as? Bool == true ? ["--replace"] : []) // (R13: the earlier note to the trash once the new one is saved)
        sched.catchUpClaimed.append(Self.jobKey(job))
        tasksSoon()
        runRunner(args, timeout: 3600, quiet: false) { [weak self] r in
            guard let self else { return }
            let results = (r.json as? [String: Any])?["results"] as? [[String: Any]] ?? []
            let ok = op == "extract" ? results.first?["status"] as? String == "saved"
                : op == "classify" ? !results.isEmpty && results.allSatisfy { $0["status"] as? String == "tagged" } : r.ok
            if ok { return self.catchUpJobDone(job, ok: true, results) }
            // failed: Zotero gone? Then the job waits for it (not counted failed, nor the rest after it)
            self.bridge.post("/sync/status", [:], timeout: 4) { [weak self] status in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    self.noteBridge(status)
                    guard case .ok = status else {
                        self.sched.catchUpClaimed.removeAll { $0 == Self.jobKey(job) }
                        return self.refreshTasks()
                    }
                    self.catchUpJobDone(job, ok: false, results)
                }
            }
        }
    }

    // A job's end: counted, taken off the list (wherever it is: others run beside it; gone if stopped meanwhile), the next.
    private func catchUpJobDone(_ job: [String: Any], ok: Bool, _ results: [[String: Any]]) {
        let key = Self.jobKey(job)
        sched.catchUpClaimed.removeAll { $0 == key }
        let id = job["id"] as? String ?? "", op = job["op"] as? String ?? ""
        var changes: [String: Any?] = [:]
        if op == "extract", !ok, let first = results.first {
            var sk = extractFile?.skipped ?? [:]
            sk[id] = first["reason"] ?? first["status"] ?? "failed" // left alone, like the others
            changes["skipped"] = sk
        }
        if var cur = extractFile?.upToDate, var left = cur["jobs"] as? [[String: Any]], let i = left.firstIndex(where: { Self.jobKey($0) == key }) {
            left.remove(at: i)
            cur["jobs"] = left
            cur[ok ? "done" : "failed"] = (cur[ok ? "done" : "failed"] as? Int ?? 0) + 1
            changes["update"] = cur
        }
        if !changes.isEmpty { saveExtractState(changes) }
        refreshTasks()
        catchUpTick()
    }

    // set-catchup, set-catchup-stop, set-auto-prompt, pe-auto. → handled.
    func scheduleAction(_ row: ListRow) -> Bool {
        switch row.rowId {
        case "set-catchup":
            let days = catchUpDays
            let title = row.value == "taxonomies" ? "Tagging again where a taxonomy changed" : row.value == "prompts" ? "Running prompts again where they changed"
                : "Catching up the last \(days) \(days == 1 ? "day" : "days")"
            flashMessage("Checking which papers need it…")
            startCatchUp(row.value, title: title) { [weak self] in self?.sayLater($0) }
        case "set-catchup-stop":
            stopCatchUp()
            flashMessage("Stopped: the one running finishes (in Processes)")
        case "set-auto-prompt":
            // What the app checks when it opens: its prompts (launch:<id>), checkboxes as on Prompts to run on new papers
            if row.value.hasPrefix("launch:") { toggleSetting("defaults.launchCatchUpWhat.prompt:" + String(row.value.dropFirst("launch:".count))) } else { toggleAutoPrompt(row.value) }
            return true
        case "pe-auto":
            guard let id = ai.promptEdit?["id"] as? String else { return true }
            toggleAutoPrompt(id)
            return true
        default: return false
        }
        store.followTop = false
        rebuildList()
        return true
    }

    // What waits its turn, for Processes: a catch-up's jobs after the running one, the papers left
    // in Extract every paper's text, the papers queued to tag (Service.qml's pendingTasks).
    var pendingTasks: [[String: Any]] {
        var out: [[String: Any]] = []
        let title = { (id: String) in (self.ai.prompts?.first { $0["id"] as? String == id }?["title"] as? String).map { "“\($0)”" } ?? id }
        if let u = extractFile?.upToDate {
            let jobs = (u["jobs"] as? [[String: Any]] ?? []).filter { !sched.catchUpClaimed.contains(Self.jobKey($0)) } // (the running ones are in Processes already)
            for (i, j) in jobs.enumerated() {
                let op = j["op"] as? String
                out.append(["id": "pending:update:\(i)", "status": "pending", "title": op == "extract" ? "Extract the text" : op == "classify" ? "Tag by taxonomies" : "Run " + title(j["prompt"] as? String ?? ""),
                            "paper": j["title"] ?? "", "detail": u["title"] ?? ""])
            }
        }
        if let c = extractFile?.catchup, let n = ai.extractPending, n > 0 {
            out.append(["id": "pending:extract-all", "status": "pending", "title": "Extract every paper's text", "paper": "",
                        "detail": "\(n) \(n == 1 ? "paper" : "papers") left" + ((c["title"] as? String).flatMap { $0.isEmpty ? nil : " in " + $0 } ?? "")])
        }
        if !ai.scanQueue.isEmpty {
            out.append(["id": "pending:scans", "status": "pending", "title": "Read the skipped scans by OCR", "paper": "",
                        "detail": "\(ai.scanQueue.count) \(ai.scanQueue.count == 1 ? "paper" : "papers") left"])
        }
        for (i, q) in sched.classifyQueue.enumerated() {
            for (k, it) in q.items.enumerated() { out.append(["id": "pending:classify:\(i):\(k)", "status": "pending", "title": "Tag by taxonomies", "paper": it["title"] ?? "", "detail": "Queued"]) }
        }
        return out
    }

    var pendingCount: Int { pendingTasks.count }

    // Settings.js's catchUp: { plan, running: { title, left, done, failed } | null, problem }.
    var catchUpContext: [String: Any] {
        let running: Any = extractFile?.upToDate.map { u -> Any in
            ["title": u["title"] ?? "", "left": (u["jobs"] as? [Any])?.count ?? 0, "done": u["done"] ?? 0, "failed": u["failed"] ?? 0]
        } ?? NSNull()
        return ["plan": sched.plan ?? NSNull(), "running": running, "problem": sched.planProblem]
    }
}
