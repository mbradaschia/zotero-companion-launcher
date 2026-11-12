import AppKit
import Foundation

// One paper's fold reader window (docs/fold-reader/SPEC.md 6.3, 7, 9; R5-SPEC.md 5): the paper (the bridge's /item),
// its first PDF (its path through /attachment, never marked opened) read into the doc here (FoldPDF's lines and
// FoldMaker, on the PDF's queue), the doc, its link map, the marks and the last fold kept for it (FoldStore), the fold
// itself (the runner's `fold`, streamed: Fold with AI is the only thing that sends the paper to a model), and the
// messages between the page and the app. The page draws; FoldCore.js and FoldMake.js decide, here (through Glue) and
// in the page alike.
@MainActor
final class FoldWindowModel: ObservableObject {
    unowned let launcher: LauncherModel
    let paper: PaperRef
    @Published private(set) var title: String
    weak var page: FoldPage?
    var close: () -> Void = {}
    let scheme = FoldSchemeHandler()

    private var ready = false
    private var closed = false
    private var details: [String: Any]?
    private var pdf: FoldPDF?
    private var pdfInfo: [String: Any]? // FR.load's pdf ({pages, sizes, name, urlPattern, bytes, modified} or {problem})
    private var doc: [String: Any]?
    private var state: [String: Any] = ["kind": "loading"]
    private var opening = 0 // each open (and ⌘R) its own: what an older one answers is dropped
    private var wordBatches: [[String: Any]] = []
    private var wordsStarted = false
    private var wordsDone = false
    private var sendWords = false // the page drew a doc without a valid link map (R1's, D9): it takes the words
    private(set) var store: FoldStore?

    // the fold (R5-SPEC 5.1)
    private(set) var run: [String: Any]? // fold.json
    private var runBefore: [String: Any]? // (kept while a run starts: put back if the runner can't fold)
    private var plan: [String: Any]? // fold --plan's answer
    private var stream: RunnerStream?
    private var stopEvent: [String: Any]? // this run's stop line
    private var runner = "ok" // "ok", "missing", "old"
    private var pdfChanged = false
    private var foldAfterReading = false // Fold again on a doc an older FoldMake read: read again first
    private var runs = 0 // each fold its own: a line of an older one is dropped
    private var lastLoad = Date.distantPast
    private var loadSoon = false
    var folding: Bool { stream != nil }

    // the outline pass (R5-SPEC 3.7)
    private var outlineAnswer: (@MainActor ([String: Any]?) -> Void)? // the reading that waits on the model's answer
    private var outlineAsks = 0 // each ask its own: a skipped one's answer is dropped
    private var outlineNote: String? // why the sections weren't checked, said once the paper shows
    private var outlineHere = false // asked in this window: a paper still owed the pass isn't read again and again
    private var refreshing = false // the pass owed to a paper already showing, made behind it

    init(paper: PaperRef, launcher: LauncherModel) {
        self.paper = paper
        self.launcher = launcher
        title = "Read · " + (paper.title.isEmpty ? "a paper" : paper.title)
        store = FoldStore(runnerState: launcher.pathsJSON["runnerState"] as? String ?? "", libraryID: paper.libraryID, key: paper.key)
        if var r = store?.readRun() {
            // (left folding: the app quit or crashed meanwhile)
            if r["status"] as? String == "folding" {
                r["status"] = "stopped"
                try? store?.writeRun(r)
            }
            run = r
        }
        loadItem()
    }

    static func iso(_ d: Date) -> String { ISO8601DateFormatter().string(from: d) }

    // ---- the window's settings (this Mac, every paper)

    private static let prefsKey = "ZLFoldPrefs"
    static var prefs: [String: Any] {
        get { UserDefaults.standard.dictionary(forKey: prefsKey) ?? [:] }
        set { UserDefaults.standard.set(newValue, forKey: prefsKey) }
    }

    // A prefs message's values, checked (SPEC 6.3), merged into ZLFoldPrefs.
    static func mergePrefs(_ m: [String: Any]) {
        var p = prefs
        if let l = m["level"] as? String, ["full", "brief", "key", "takeaway", "topic"].contains(l) { p["level"] = l }
        for k in ["pdf", "pdfLeft", "margin"] { if let b = m[k] as? Bool { p[k] = b } }
        let ranges: [String: ClosedRange<Double>] = ["pdfWidth": 300...4000, "marginWidth": 160...420, "pdfZoom": 1...3]
        for (k, r) in ranges { if let v = (m[k] as? NSNumber)?.doubleValue, !(m[k] is Bool) { p[k] = min(r.upperBound, max(r.lowerBound, v)) } }
        prefs = p
    }

    // The text size (⌘- ⌘+ ⌘0), the review table's steps, kept for the next paper.
    private static let zoomKey = "ZLFoldZoom"
    static let zoomSteps: [Double] = [0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8, 2]
    static var zoom: Double {
        get { let z = UserDefaults.standard.double(forKey: zoomKey); return zoomSteps.contains(z) ? z : 1 }
        set { UserDefaults.standard.set(newValue == 1 ? nil : newValue, forKey: zoomKey) }
    }
    var zoomed: (Double) -> Void = { _ in }

    func stepZoom(_ step: Int) {
        let i = Self.zoomSteps.firstIndex(of: Self.zoom) ?? 3
        let next = step == 0 ? 1 : Self.zoomSteps[max(0, min(Self.zoomSteps.count - 1, i + step))]
        Self.zoom = next
        zoomed(next)
        page?.flash("Text \(Int((next * 100).rounded()))%" + (next == 1 ? "" : " (⌘0 its size)"))
    }

    // ---- Glue, JSON in and out

    private func glue(_ function: String, _ arguments: [Any]) -> Any? {
        guard let core = launcher.core, let json = try? core.glueJSON(function, arguments) else { return nil }
        return try? JSONSerialization.jsonObject(with: Data(json.utf8), options: [.fragmentsAllowed])
    }

    // ---- the paper and its PDF

    private var ref: [String: Any] { ["key": paper.key, "libraryID": paper.libraryID] }

    func loadItem() {
        opening += 1
        let at = opening
        launcher.bridge.post("/item", ref, timeout: 10) { [weak self] result in
            MainActor.assumeIsolated {
                guard let self, !self.closed, at == self.opening else { return }
                if case .ok(let answer) = result { self.details = answer } else { self.details = nil }
                self.named()
                if self.paper.libraryID != 1 || (self.details?["library"] as? [String: Any])?["type"] as? String == "group" {
                    self.state = ["kind": "group-library"]
                    self.pdfInfo = ["problem": "no-pdf"]
                    return self.send()
                }
                self.openPdf(at)
            }
        }
    }

    private var paperInfo: [String: Any]? { details?["paper"] as? [String: Any] }

    private var cite: String { paperInfo.flatMap { (try? launcher.core?.glue("paperCite", [$0], as: String.self)) } ?? "" }

    // The window's title: Read · <its citation> (Rivera et al. (2026)), else its title.
    private func named() {
        let name = cite.isEmpty ? ((paperInfo?["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? (paper.title.isEmpty ? "a paper" : paper.title)) : cite
        title = "Read · " + name
    }

    // No PDF to read (R5-SPEC 6.1): a doc kept from before still reads (the PDF pane says why it's away); else the
    // state takes the text pane.
    private func noPdf(_ problem: [String: Any]) {
        pdfInfo = problem
        if doc == nil, let kept = store.flatMap({ s in launcher.core.map { s.readDoc($0) } }), let d = kept.doc { doc = d }
        if doc == nil {
            let kind = problem["problem"] as? String ?? "no-pdf"
            state = kind == "unreadable" ? ["kind": "unreadable", "why": Self.sentence(problem["detail"] as? String ?? "")] : ["kind": kind]
        } else {
            state = ["kind": "ready"]
        }
        send()
        askPlan()
    }

    // "it is locked with a password" → "It is locked with a password."
    static func sentence(_ s: String) -> String {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let first = t.first else { return "" }
        let body = first.uppercased() + t.dropFirst()
        return body.hasSuffix(".") ? body : body + "."
    }

    private func openPdf(_ at: Int) {
        guard let details, let att = glue("foldFirstPdf", [details]) as? [String: Any], let key = att["key"] as? String else { return noPdf(["problem": "no-pdf"]) }
        let body: [String: Any] = ["key": key, "libraryID": att["libraryID"] as? Int ?? paper.libraryID, "target": "path", "markOpened": false]
        launcher.bridge.post("/attachment", body, timeout: 10) { [weak self] result in
            MainActor.assumeIsolated {
                guard let self, !self.closed, at == self.opening else { return }
                guard case .ok(let answer) = result, let path = answer["path"] as? String, !path.isEmpty else {
                    return self.noPdf(result.message.contains("missing") ? ["problem": "missing"] : ["problem": "unreadable", "detail": result.message])
                }
                self.open(URL(fileURLWithPath: path), at)
            }
        }
    }

    private func open(_ url: URL, _ at: Int) {
        let pdf = FoldPDF(url: url)
        self.pdf = pdf
        pdf.open { [weak self] result in
            MainActor.assumeIsolated {
                guard let self, !self.closed, at == self.opening else { return }
                switch result {
                case .success(let info):
                    let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
                    let bytes = (attrs?[.size] as? NSNumber)?.intValue ?? 0
                    let modified = (attrs?[.modificationDate] as? Date).map(Self.iso) ?? ""
                    self.scheme.pdf = pdf
                    self.scheme.pages = info.pages
                    self.pdfInfo = ["pages": info.pages, "sizes": info.sizes, "name": url.lastPathComponent, "urlPattern": pdf.urlPattern, "bytes": bytes, "modified": modified]
                    self.identify(url, bytes: bytes, modified: modified, at)
                case .failure(let e):
                    self.pdf = nil
                    self.noPdf(e.payload)
                }
            }
        }
    }

    // ---- the doc: the one kept, or the PDF read again (R5-SPEC 3.5)

    private var extractor: Int { Int((try? launcher.core?.evaluate("FoldMake.EXTRACTOR")) ?? "") ?? 1 }

    private func identify(_ url: URL, bytes: Int, modified: String, _ at: Int) {
        guard let core = launcher.core else { return }
        let kept = store?.readDoc(core) ?? FoldStore.Doc()
        if let name = kept.damaged, let store { page?.flash(launcher.shown(store.url(FoldStore.doc).path) + " wasn't valid: kept beside it as " + name) }
        let cachedLinks = store?.readJSON(FoldStore.links)
        let extractor = self.extractor
        let old = kept.doc
        // (hashed off the main thread, only when the size or the date changed)
        DispatchQueue.global(qos: .userInitiated).async {
            let verdict = FoldMaker.cached(old, links: cachedLinks, bytes: bytes, modified: modified, extractor: extractor) { FoldPDF.sha256(of: url) }
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    guard !self.closed, at == self.opening else { return }
                    self.identified(verdict, old, links: cachedLinks)
                }
            }
        }
    }

    private func identified(_ verdict: FoldMaker.Cached, _ old: [String: Any]?, links: [String: Any]?) {
        switch verdict {
        case .use, .kept:
            doc = old
            state = ["kind": "ready"]
            send()
            askPlan(thenOutline: true)
        case .touched:
            doc = old
            if var l = links, let p = pdfIdentity {
                l["pdf"] = p
                try? store?.writeJSON(FoldStore.links, l)
            }
            state = ["kind": "ready"]
            send()
            askPlan(thenOutline: true)
        case .changed:
            pdfChanged = true
            read()
        case .stale, .read:
            read()
        }
    }

    // The PDF read into the doc (lines, FoldMaker), the state `reading` meanwhile; then doc.json and links.json. With
    // the outline pass on (Settings › Defaults › Fold with AI), the model is asked which lines are the headings before
    // the paper shows (the state says so, with Skip), and the lines are read again with its answer.
    private func read() {
        guard let pdf, let info = pdfInfo, info["problem"] == nil else { return }
        let at = opening
        doc = nil
        state = ["kind": "reading", "done": 0, "pages": info["pages"] ?? 0]
        send()
        outlineNote = nil
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        let meta = Self.readMeta(paperInfo ?? [:], title: paper.title, cite: cite, pdf: info, version: version, now: Date())
        FoldMaker.make(pdf, meta: meta, outline: outlineAsker(at, shown: true), progress: { [weak self] done, pages in
            guard let self, !self.closed, at == self.opening, self.doc == nil, self.outlineAnswer == nil else { return }
            self.state = ["kind": "reading", "done": done, "pages": pages]
            self.page?.state(self.state)
        }, done: { [weak self] result in
            guard let self, !self.closed, at == self.opening else { return }
            switch result {
            case .success(let made):
                if let s = made.state {
                    self.state = s
                    self.foldAfterReading = false
                    return self.send()
                }
                guard let d = made.doc else { return }
                self.doc = d
                try? self.store?.writeJSON(FoldStore.doc, d)
                if let l = made.links { try? self.store?.writeJSON(FoldStore.links, l) }
                self.state = ["kind": "ready"]
                self.send()
                if let note = self.outlineNote { self.outlineNote = nil; self.page?.flash(note) }
                if self.foldAfterReading {
                    self.foldAfterReading = false
                    self.startFold(force: true, only: nil)
                } else {
                    self.askPlan()
                }
            case .failure:
                // (FoldMaker's own error names its internals: the state says it plainly)
                self.foldAfterReading = false
                self.state = ["kind": "unreadable", "why": "Its text couldn't be read, so there are no words to fold."]
                self.send()
            }
        })
    }

    // ---- the outline pass (R5-SPEC 3.7): the model says which lines are the headings, once per paper

    // FoldMaker's outline step for this reading, or none with the pass off. shown: the paper waits on it (the state
    // tells, Skip ends the wait); else it runs behind a paper already showing.
    private func outlineAsker(_ at: Int, shown: Bool) -> FoldMaker.Outline? {
        guard launcher.foldOutline else { return nil }
        outlineHere = true
        return { [weak self] ask, answer in
            guard let self, !self.closed, at == self.opening else { return answer(nil) }
            self.askOutline(ask, at: at, shown: shown, answer)
        }
    }

    // The runner's `outline`: the candidates and the bookmarks in, the headings out ({ n, headings, model }); no
    // answer (the AI features away or older than the app, no model, offline, a reply of no use) leaves the rules'.
    private func askOutline(_ ask: [String: Any], at: Int, shown: Bool, _ answer: @escaping @MainActor ([String: Any]?) -> Void) {
        var input = ask
        input["paper"] = paperId
        input["model"] = defaultModel
        input["effort"] = effort
        guard let text = try? JSCore.jsonText(input) else { return answer(nil) }
        outlineAsks += 1
        let this = outlineAsks
        outlineAnswer = answer
        if shown {
            state = ["kind": "reading", "done": pdfInfo?["pages"] ?? 0, "pages": pdfInfo?["pages"] ?? 0, "outline": true]
            page?.state(state)
        }
        launcher.runRunner(["outline"], stdin: text, timeout: 150) { [weak self] r in
            guard let self, this == self.outlineAsks, let answer = self.outlineAnswer else { return } // (skipped)
            self.outlineAnswer = nil
            guard !self.closed, at == self.opening else { return answer(nil) }
            let o = r.ok ? r.json as? [String: Any] : nil
            if let o, let headings = o["headings"] as? [Any] {
                UsageLog.shared.count("fold:outline")
                let name = (o["name"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? o["model"] as? String ?? ""
                return answer(["n": o["n"] ?? 0, "headings": headings, "model": name])
            }
            self.outlineNote = Self.outlineProblem(r, o)
            answer(nil)
        }
    }

    // Why the sections weren't checked, for the flash; nil when the fold's own banner says it (no runner, no model).
    static func outlineProblem(_ r: RunnerResult, _ answer: [String: Any]?) -> String? {
        let kind = runnerKind(r)
        if kind == "missing" { return nil }
        if kind == "old" { return "Sections not checked by AI: the AI features are older than the app (Settings › Setup › Install the AI features)" }
        if r.timedOut { return "Sections not checked by AI: the model took too long" }
        if let answer {
            if answer["kind"] as? String == "setup" { return nil }
            let e = (answer["error"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return "Sections not checked by AI" + (e.isEmpty ? "" : ": " + String(e.prefix(120)))
        }
        return "Sections not checked by AI: " + String(r.problem.prefix(120))
    }

    // The page's Skip: the paper shows now, with the sections the reader found on its own. (The request goes on: its
    // answer is kept, and the next time the paper opens its sections follow it.)
    func skipOutline() {
        guard let answer = outlineAnswer else { return }
        outlineAnswer = nil
        outlineAsks += 1
        answer(nil)
    }

    // A paper already showing that is still owed the pass (read offline, with the AI features away or older, or with
    // the pass off) and has nothing folded: once the plan says a model is there, its PDF is read again behind it and
    // the model asked; the doc is replaced only when an answer came. Once per window (⌘R asks again).
    private func outlineIfOwed() {
        guard launcher.foldOutline, !outlineHere, !refreshing, !folding, !closed, runner == "ok", let plan, plan["error"] == nil,
              let pdf, let info = pdfInfo, info["problem"] == nil, state["kind"] as? String == "ready",
              let doc, FoldMaker.outlineOwed(doc), !FoldMaker.folded(doc) else { return }
        let at = opening
        let id = doc["id"] as? String
        refreshing = true
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        let meta = Self.readMeta(paperInfo ?? [:], title: paper.title, cite: cite, pdf: info, version: version, now: Date())
        FoldMaker.make(pdf, meta: meta, outline: outlineAsker(at, shown: false), progress: { _, _ in }, done: { [weak self] result in
            guard let self else { return }
            self.refreshing = false
            self.outlineNote = nil
            guard !self.closed, at == self.opening, !self.folding, self.doc?["id"] as? String == id, !FoldMaker.folded(self.doc),
                  case .success(let made) = result, let d = made.doc, !FoldMaker.outlineOwed(d) else { return }
            self.doc = d
            try? self.store?.writeJSON(FoldStore.doc, d)
            if let l = made.links { try? self.store?.writeJSON(FoldStore.links, l) }
            self.send()
            if FoldMaker.outlineBy(d) == "ai" { self.page?.flash("Sections checked by AI") }
            self.askPlan()
        })
    }

    // FoldMake.read's meta (R5-SPEC 3.2) from the bridge's paper: its title, authors, date, Zotero's abstract (what
    // finds an abstract the page sets without a heading, or as front matter), the cite and the PDF's identity.
    static func readMeta(_ p: [String: Any], title: String, cite: String, pdf info: [String: Any], version: String, now: Date) -> [String: Any] {
        let authors = (p["authors"] as? String).map { $0.isEmpty ? [String]() : [$0] } ?? []
        return [
            "title": (p["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? title, "authors": authors, "date": p["year"] as? String ?? "",
            "abstract": p["abstract"] as? String ?? "", "cite": cite,
            "pdf": ["bytes": info["bytes"] ?? 0, "modified": info["modified"] ?? "", "pages": info["pages"] ?? 0, "sizes": info["sizes"] ?? [Any]()] as [String: Any],
            "made_with": ("Zotero Launcher " + version).trimmingCharacters(in: .whitespaces), "exported": iso(now),
        ]
    }

    // ---- the fold (R5-SPEC 5.1)

    private var paperId: String { "\(paper.libraryID):\(paper.key)" }

    private func foldable(_ d: [String: Any]?) -> [[String: Any]] {
        (d?["sections"] as? [[String: Any]] ?? []).filter { s in (s["units"] as? [[String: Any]] ?? []).contains { !["reference", "footnote", "equation"].contains($0["kind"] as? String ?? "") } }
    }

    // The sections not folded yet (what Finish folding asks for).
    private var notFolded: [String] {
        foldable(doc).filter { $0["made"] as? String != "ai" }.compactMap { $0["id"] as? String }
    }

    // Settings › Defaults › Fold with AI: its model ("default": the prompts') and effort (low unless picked).
    private var foldDefaults: [String: Any] { launcher.defaultsRaw["fold"] as? [String: Any] ?? [:] }
    private var defaultModel: String { (foldDefaults["model"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "default" }
    private var effort: String { foldDefaults["effort"] as? String ?? "low" }

    // A run's own model while it isn't finished (Finish folding asks the one that began it), else the setting's.
    private var model: String {
        guard let m = run?["model"] as? String, !m.isEmpty, run?["doc"] as? String == doc?["id"] as? String else { return defaultModel }
        return m
    }

    // The page's fold object (FoldMake.foldView), sent with FR.load and as FR.fold.
    var foldObject: [String: Any]? {
        guard let doc else { return nil }
        let live: [String: Any] = ["folding": folding, "runner": runner, "pdfChanged": pdfChanged, "stop": (stopEvent as Any?) ?? NSNull(),
                                   "scan": state["kind"] as? String == "scan"]
        var thisRun: Any = NSNull(), thePlan: Any = NSNull()
        if let r = run, r["doc"] as? String == doc["id"] as? String { thisRun = r }
        if let p = plan { thePlan = p }
        return glue("foldView", [doc, thisRun, thePlan, live]) as? [String: Any]
    }

    private func pushFold() {
        guard ready, !closed, let f = foldObject else { return }
        page?.fold(f)
    }

    // fold --plan: how many requests, the model, the price; asked when the runner is there and nothing folds.
    // thenOutline: for a doc kept from before, the outline pass it may still be owed follows the plan's answer.
    func askPlan(thenOutline: Bool = false) {
        guard let doc, !folding, !closed else { return pushFold() }
        let all = notFolded
        let again = all.isEmpty
        let only: Any = again || all.count == foldable(doc).count ? NSNull() as Any : all as Any
        let o: [String: Any] = ["paper": paperId, "model": again ? defaultModel : model, "effort": effort, "force": again, "only": only]
        guard let input = glue("foldInput", [doc, o]) as? [String: Any],
              input["error"] == nil, let text = try? JSCore.jsonText(input) else { return pushFold() }
        let id = doc["id"] as? String
        launcher.runRunner(["fold", "--plan"], stdin: text, timeout: 60) { [weak self] r in
            guard let self, !self.closed, self.doc?["id"] as? String == id else { return }
            self.runner = Self.runnerKind(r)
            self.plan = r.ok ? r.json as? [String: Any] : nil
            self.pushFold()
            if thenOutline { self.outlineIfOwed() }
        }
    }

    // ok, or missing (not installed: 127) or old (it doesn't know `fold`: its usage, status 2).
    static func runnerKind(_ r: RunnerResult) -> String {
        if r.missing || r.status == 127 { return "missing" }
        if r.status == 2 && r.stderr.contains("usage:") { return "old" }
        return "ok"
    }

    // The page's fold message: {force?, only?}; ignored while a run goes.
    func fold(_ m: [String: Any] = [:]) {
        guard !folding, doc != nil else { return }
        if refreshing { page?.flash("Checking the sections with AI first: fold in a moment"); return }
        let force = m["force"] as? Bool == true
        let only = (m["only"] as? [Any])?.compactMap { $0 as? String }
        // Fold again on R1's doc (D9), one an older FoldMake read, or one still owed the outline pass: the PDF read
        // again first, then folded
        let source = doc?["source"] as? [String: Any] ?? [:]
        if force, pdf != nil, !FoldMaker.ours(doc) || ((source["extractor"] as? NSNumber)?.intValue ?? 0) < extractor || (launcher.foldOutline && FoldMaker.outlineOwed(doc)) {
            foldAfterReading = true
            return read()
        }
        startFold(force: force, only: only.flatMap { $0.isEmpty ? nil : $0 })
    }

    private func startFold(force: Bool, only: [String]?) {
        guard let doc, !folding else { return }
        let use = force ? defaultModel : model
        var o: [String: Any] = ["paper": paperId, "model": use, "effort": effort, "force": force, "only": NSNull()]
        if let only { o["only"] = only }
        guard let input = glue("foldInput", [doc, o]) as? [String: Any] else { return }
        if let e = input["error"] as? String { page?.flash("Not folded: " + e); return }
        guard let text = try? JSCore.jsonText(input) else { return }
        UsageLog.shared.count("fold:run")
        runBefore = run
        // (force: a Fold again, so an end before every section came back counts this run's, not the doc's earlier ones)
        run = ["doc": doc["id"] ?? "", "model": use, "started": Self.iso(Date()), "status": "folding", "force": force,
               "sections": Self.carried(runBefore, doc: doc["id"] as? String ?? "", force: force, only: only), "errors": [String: Any]()]
        saveRun()
        stopEvent = nil
        pdfChanged = false
        let id = doc["id"] as? String
        runs += 1
        let this = runs
        var over = false // (a runner may answer at once, before stream() returns)
        let started = launcher.runner.stream(launcher.runnerArgv(["fold", "--quiet"]), stdin: text, onLine: { [weak self] line in
            guard let self, self.doc?["id"] as? String == id, this == self.runs else { return }
            self.line(line)
        }, completion: { [weak self] r in
            over = true
            guard let self, this == self.runs else { return }
            self.ended(r)
        })
        guard let started else {
            if !over { ended(RunnerResult(status: 127, missing: true)) }
            return
        }
        if !over { stream = started }
        pushFold()
    }

    // A new run's sections to start from: none, except for a Fold again's Finish or Try it again (force, only), which
    // carries the sections the Fold again it finishes had folded, so they count and aren't asked for again.
    static func carried(_ before: [String: Any]?, doc: String, force: Bool, only: [String]?) -> [String: Any] {
        guard force, let only, let before, before["force"] as? Bool == true, !doc.isEmpty, before["doc"] as? String == doc,
              let sections = before["sections"] as? [String: Any] else { return [:] }
        var out: [String: Any] = [:]
        for (id, state) in sections where state as? String == "done" && !only.contains(id) { out[id] = "done" }
        return out
    }

    private func saveRun() {
        guard let run else { return }
        try? store?.writeRun(run)
    }

    private func line(_ text: String) {
        guard var event = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any], let type = event["type"] as? String else { return }
        switch type {
        case "start":
            if let m = event["model"] as? String, !m.isEmpty { run?["model"] = m }
            saveRun()
            let n = event["sections"] as? Int ?? 0
            page?.flash("Started: folding \(n) \(n == 1 ? "section" : "sections") with " + ((event["name"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? model))
        case "section":
            guard let doc, let id = event["id"] as? String, let merged = glue("foldMerge", [doc, event, Self.iso(Date())]) as? [String: Any] else { return }
            self.doc = merged
            try? store?.writeJSON(FoldStore.doc, merged)
            if let links = store?.readJSON(FoldStore.links), FoldMaker.ours(merged), let relinked = glue("foldRelink", [links, merged]) as? [String: Any] {
                try? store?.writeJSON(FoldStore.links, relinked)
            }
            mark(id, "done")
            pushFold()
            loadAtMostEverySecond()
        case "failed":
            guard let id = event["id"] as? String else { return }
            mark(id, "failed", error: event["error"] as? String ?? "")
            pushFold()
        case "stop":
            event.removeValue(forKey: "type")
            stopEvent = event
            run?["stop"] = event
            saveRun()
            pushFold()
        case "done":
            let stopped = event["stopped"] as? String ?? ""
            let failed = event["failed"] as? Int ?? 0, folded = event["folded"] as? Int ?? 0
            run?["status"] = !stopped.isEmpty ? "stopped" : failed > 0 ? "partial" : "done"
            saveRun()
            if stopped.isEmpty { page?.flash(failed > 0 ? "Folding is done: \(folded) folded, \(failed) failed" : "Folding is done: \(folded) \(folded == 1 ? "section" : "sections")") }
        default: break // (call: its count is in Processes)
        }
    }

    private func mark(_ id: String, _ status: String, error: String? = nil) {
        var sections = run?["sections"] as? [String: Any] ?? [:]
        sections[id] = status
        run?["sections"] = sections
        if let error {
            var errors = run?["errors"] as? [String: Any] ?? [:]
            errors[id] = String(error.prefix(200))
            run?["errors"] = errors
        }
        saveRun()
    }

    // The run's end: stopped (130, 143, or its done line said a fatal error stopped it), the runner missing or older
    // than the app (fold.json as it was before: nothing ran), or done (its done line said how).
    private func ended(_ r: RunnerResult) {
        stream = nil
        runner = Self.runnerKind(r)
        if runner != "ok" {
            if runner == "missing" { launcher.runnerState.missing = true }
            run = runBefore
            if let before = runBefore { try? store?.writeRun(before) } else if let store { try? FileManager.default.removeItem(at: store.url(FoldStore.run)) }
        } else {
            let unfinished = run?["status"] as? String == "folding" // (no done line)
            if unfinished {
                run?["status"] = "stopped"
                saveRun()
            }
            if r.status == 130 || r.status == 143 || (!unfinished && run?["status"] as? String == "stopped") {
                let f = foldObject // (FoldMake's count: this run's when it was a Fold again)
                let again = f?["again"] as? Bool == true
                page?.flash("Stopped: \(f?["done"] as? Int ?? 0) of \(f?["total"] as? Int ?? 0) sections folded" + (again ? " again, the others keep their earlier levels" : ", the rest show first sentences"))
            } else if unfinished {
                page?.flash("Folding stopped: " + r.problem)
            }
        }
        loadSoon = false
        send()
        askPlan()
    }

    func stop() { stream?.stop() }

    // FR.load at most once a second while sections come in (FR.fold goes at once).
    private func loadAtMostEverySecond() {
        let wait = 1 - Date().timeIntervalSince(lastLoad)
        if wait <= 0 { return send() }
        guard !loadSoon else { return }
        loadSoon = true
        DispatchQueue.main.asyncAfter(deadline: .now() + wait) { [weak self] in
            MainActor.assumeIsolated {
                guard let self, self.loadSoon else { return }
                self.loadSoon = false
                self.send()
            }
        }
    }

    // ⌘R and Try again: the paper and its PDF read again (R5-SPEC 3.5); a run going on goes on.
    func retry() {
        guard !folding, !refreshing else { return }
        skipOutline()
        outlineHere = false
        pdf = nil
        pdfInfo = nil
        doc = nil
        plan = nil
        state = ["kind": "loading"]
        wordBatches = []
        wordsStarted = false
        wordsDone = false
        send()
        loadItem()
    }

    // ---- the page

    private var docIdentity: [String: Any]? {
        guard let doc, let id = doc["id"] as? String else { return nil }
        return ["id": id, "lang": doc["lang"] as? String ?? "", "levels_made": ((doc["provenance"] as? [String: Any])?["levels_made"] as? String) ?? ""]
    }

    private var pdfIdentity: [String: Any]? {
        guard let p = pdfInfo, p["problem"] == nil else { return nil }
        return ["bytes": p["bytes"] ?? 0, "modified": p["modified"] ?? "", "pages": p["pages"] ?? 0]
    }

    // The cached links.json, if it is for this doc and this PDF file.
    private func validLinks() -> [String: Any]? {
        guard let core = launcher.core, let links = store?.readJSON(FoldStore.links), let d = docIdentity, let p = pdfIdentity,
              let ok = try? core.glue("foldLinksValid", [links, d, p], as: Bool.self), ok else { return nil }
        return links
    }

    private func statusPayload() -> [String: Any] {
        let id = paper.id
        let current = launcher.marks.statusShown[id] ?? (try? launcher.core?.glue("paperStatusOf", [details?["tags"] ?? [Any](), launcher.paperStatusTags], as: String.self)) ?? ""
        return ["current": current, "options": launcher.paperStatuses]
    }

    private func taskPayload() -> Any {
        let statuses = launcher.todoStatuses
        guard !statuses.isEmpty else { return NSNull() }
        let current = launcher.defaultTasks[paper.id]?["id"] as? String ?? ""
        return ["current": current, "description": "", "options": statuses.map { ["id": $0["id"] ?? "", "name": $0["name"] ?? ""] }]
    }

    private func taxonomiesPayload() -> [[String: Any]] {
        let tags = (details?["tags"] as? [Any] ?? []).map { t -> String in ((t as? [String: Any])?["tag"] as? String) ?? (t as? String) ?? "" }
        return launcher.tax.taxonomies.compactMap { t in
            guard t["show"] as? Bool != false, let prefix = (t["prefix"] as? String)?.lowercased(), !prefix.isEmpty else { return nil }
            let labels = tags.filter { $0.lowercased().hasPrefix(prefix) && $0.count > prefix.count }.map { String($0.dropFirst(prefix.count)) }
            return labels.isEmpty ? nil : ["name": t["name"] as? String ?? prefix, "labels": labels]
        }
    }

    private func paperPayload() -> [String: Any] {
        let p = paperInfo ?? [:]
        let authors = (p["authors"] as? String).map { $0.isEmpty ? [] : [$0] } ?? []
        return ["key": paper.key, "libraryID": paper.libraryID, "title": (p["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? paper.title,
                "authors": authors, "year": p["year"] as? String ?? "", "publication": p["publication"] as? String ?? "", "cite": cite]
    }

    func send() {
        guard ready, !closed, let page else { return }
        lastLoad = Date()
        var marks: Any = NSNull()
        if doc != nil, let core = launcher.core, let read = store?.readMarks(core) {
            if let s = read.store { marks = s }
            if let kept = read.damaged, let store {
                page.flash(launcher.shown(store.url(FoldStore.marks).path) + " wasn't valid: kept beside it as " + kept)
            }
        }
        let links = doc != nil ? validLinks() : nil
        page.load([
            "paper": paperPayload(),
            "status": statusPayload(),
            "task": taskPayload(),
            "taxonomies": taxonomiesPayload(),
            "doc": doc ?? NSNull(),
            "state": state,
            "saved": NSNull(),
            "marks": marks,
            "links": links ?? NSNull(),
            "prefs": Self.prefs,
            "pdf": pdfInfo ?? NSNull(),
            "fold": foldObject ?? NSNull(),
        ])
        // the words, when the page has to link the panes itself (R1's doc without a valid links.json): what's read so
        // far, then the rest
        sendWords = doc != nil && links == nil && pdf != nil && pdfInfo?["problem"] == nil
        guard sendWords, let pdf else { return }
        for (i, b) in wordBatches.enumerated() { page.words(["pages": b["pages"] ?? [Any](), "done": wordsDone && i == wordBatches.count - 1]) }
        guard !wordsStarted else { return }
        wordsStarted = true
        pdf.words { [weak self] pages, done in
            MainActor.assumeIsolated {
                guard let self, !self.closed else { return }
                self.wordBatches.append(["pages": pages])
                self.wordsDone = done
                if self.sendWords { self.page?.words(["pages": pages, "done": done]) }
            }
        }
    }

    // What the page sends (FoldBridge.js's post).
    func handle(_ m: [String: Any]) {
        let type = m["type"] as? String ?? ""
        if !["ready", "prefs", "links", "marks"].contains(type) { UsageLog.shared.count("fold:" + type) } // (what the page sends on its own isn't a use)
        switch type {
        case "ready": ready = true; send()
        case "prefs": Self.mergePrefs(m)
        case "marks":
            guard let s = m["marks"], let core = launcher.core else { return }
            guard let store else { page?.flash("Not saved: the app's state folder isn't known"); return }
            do {
                if let kept = try store.writeMarks(s, core) { page?.flash(launcher.shown(store.url(FoldStore.marks).path) + " wasn't valid: kept beside it as " + kept) }
            } catch {
                page?.flash("Not saved: \(error)")
            }
        case "links":
            guard let links = m["links"] as? [String: Any], let core = launcher.core, let d = docIdentity, let p = pdfIdentity,
                  (try? core.glue("foldLinksValid", [links, d, p], as: Bool.self)) == true else { return }
            try? store?.writeJSON(FoldStore.links, links)
        case "status":
            launcher.setPaperStatus(ref, from: m["from"] as? String ?? "", to: m["to"] as? String ?? "")
            page?.paper(["status": statusPayload()])
        case "task":
            guard let s = m["status"] as? String else { return }
            if launcher.syncFolderGone || launcher.paths?.readOnly == true { page?.flash("Not saved: " + launcher.syncFolderAway); return } // (todos.json)
            var item = ref
            item["title"] = paperInfo?["title"] as? String ?? paper.title
            item["creator"] = paperInfo?["authors"] as? String ?? ""
            item["year"] = paperInfo?["year"] as? String ?? ""
            launcher.setDefaultTask(item, status: s)
            page?.paper(["task": taskPayload()])
        case "fold": fold(m)
        case "zoom": stepZoom(max(-1, min(1, (m["step"] as? NSNumber)?.intValue ?? 0))) // (the toolbar's text size buttons)
        case "stop": stop()
        case "skip": skipOutline()
        case "retry": retry()
        default: break
        }
    }

    // The window closing: a fold going on is stopped (what came back stays).
    func windowClosing() {
        closed = true
        stream?.stop()
        skipOutline()
    }

    // ⌘W closes; ⌘- ⌘+ ⌘0 the text size; ⌘R the paper and its PDF read again; the editing keys for the page's text
    // boxes. esc never closes the window (the page's: fold back, hide the bar). No key starts a fold.
    func windowKey(_ e: NSEvent) -> Bool {
        let flags = e.modifierFlags.intersection([.command, .option, .control, .shift])
        let chars = (e.charactersIgnoringModifiers ?? "").lowercased()
        if flags == .command && chars == "w" { close(); return true }
        let zoomFlags: [NSEvent.ModifierFlags] = [.command, .control, [.command, .shift], [.control, .shift]]
        if zoomFlags.contains(flags), let step = ["-": -1, "=": 1, "+": 1, "0": 0][chars] {
            stepZoom(step)
            return true
        }
        if flags == .command && chars == "r" { UsageLog.shared.count("fold:retry"); retry(); return true }
        let edits: [String: Selector] = ["c": #selector(NSText.copy(_:)), "v": #selector(NSText.paste(_:)), "x": #selector(NSText.cut(_:)),
                                         "a": #selector(NSText.selectAll(_:)), "z": Selector(("undo:"))]
        if flags == .command, let action = edits[chars] { NSApp.sendAction(action, to: nil, from: nil); return true }
        if flags == [.command, .shift] && chars == "z" { NSApp.sendAction(Selector(("redo:")), to: nil, from: nil); return true }
        return false
    }
}
