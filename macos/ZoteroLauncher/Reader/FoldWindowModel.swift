import AppKit
import Foundation

// One paper's fold reader window (docs/fold-reader/SPEC.md 6.3, 7, 9): the paper (the bridge's /item), its first PDF
// (its path through /attachment, never marked opened), the doc TextFold gives (or the one saved last time), the marks
// and the link map kept for it (FoldStore), and the messages between the page and the app. The page draws; FoldCore.js
// decides, here (through Glue) and in the page alike.
@MainActor
final class FoldWindowModel: ObservableObject {
    unowned let launcher: LauncherModel
    let paper: PaperRef
    @Published private(set) var title: String
    weak var page: FoldPage?
    var close: () -> Void = {}
    let scheme = FoldSchemeHandler()
    let client: TextFoldClient

    private var ready = false
    private var closed = false
    private var details: [String: Any]?
    private var pdf: FoldPDF?
    private var pdfInfo: [String: Any]? // FR.load's pdf ({pages, sizes, name, urlPattern, bytes, modified} or {problem})
    private var doc: [String: Any]?
    private var saved: String? // when the doc came from the cache: when it was saved
    private var state: [String: Any] = ["kind": "loading"]
    private var base: URL?
    private var folding = false
    private var wordBatches: [[String: Any]] = []
    private var wordsStarted = false
    private var wordsDone = false
    private var sendWords = false // the page drew the doc without a valid link map: it takes the words
    private(set) var store: FoldStore?

    init(paper: PaperRef, launcher: LauncherModel, client: TextFoldClient = TextFoldClient()) {
        self.paper = paper
        self.launcher = launcher
        self.client = client
        title = "Read · " + (paper.title.isEmpty ? "a paper" : paper.title)
        store = FoldStore(runnerState: launcher.pathsJSON["runnerState"] as? String ?? "", libraryID: paper.libraryID, key: paper.key)
        if let cached = store?.readJSON(FoldStore.doc) {
            doc = cached
            saved = store.flatMap { s in (try? FileManager.default.attributesOfItem(atPath: s.url(FoldStore.doc).path))?[.modificationDate] as? Date }.map(Self.iso)
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
        let ranges: [String: ClosedRange<Double>] = ["pdfWidth": 300...760, "marginWidth": 160...420, "pdfZoom": 1...3]
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

    // ---- the paper and its PDF

    private var ref: [String: Any] { ["key": paper.key, "libraryID": paper.libraryID] }

    func loadItem() {
        launcher.bridge.post("/item", ref, timeout: 10) { [weak self] result in
            MainActor.assumeIsolated {
                guard let self, !self.closed else { return }
                if case .ok(let answer) = result { self.details = answer } else { self.details = nil }
                self.named()
                if self.paper.libraryID != 1 || (self.details?["library"] as? [String: Any])?["type"] as? String == "group" {
                    self.state = ["kind": "group-library"]
                    self.pdfInfo = ["problem": "no-pdf"]
                    return self.send()
                }
                self.openPdf()
                self.lookUp()
            }
        }
    }

    private var paperInfo: [String: Any]? { details?["paper"] as? [String: Any] }

    // The window's title: Read · <its citation> (Eloundou et al. (2023)), else its title.
    private func named() {
        let cite = paperInfo.flatMap { (try? launcher.core?.glue("paperCite", [$0], as: String.self)) }.flatMap { $0.isEmpty ? nil : $0 }
        let name = cite ?? (paperInfo?["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? (paper.title.isEmpty ? "a paper" : paper.title)
        title = "Read · " + name
    }

    private func openPdf() {
        guard let details, let core = launcher.core,
              let json = try? core.glueJSON("foldFirstPdf", [details]),
              let att = (try? JSONSerialization.jsonObject(with: Data(json.utf8), options: [.fragmentsAllowed])) as? [String: Any],
              let key = att["key"] as? String else {
            pdfInfo = ["problem": "no-pdf"]
            return send()
        }
        let body: [String: Any] = ["key": key, "libraryID": att["libraryID"] as? Int ?? paper.libraryID, "target": "path", "markOpened": false]
        launcher.bridge.post("/attachment", body, timeout: 10) { [weak self] result in
            MainActor.assumeIsolated {
                guard let self, !self.closed else { return }
                guard case .ok(let answer) = result, let path = answer["path"] as? String, !path.isEmpty else {
                    self.pdfInfo = result.message.contains("missing") ? ["problem": "missing"] : ["problem": "unreadable", "detail": result.message]
                    return self.send()
                }
                self.open(URL(fileURLWithPath: path))
            }
        }
    }

    private func open(_ url: URL) {
        let pdf = FoldPDF(url: url)
        self.pdf = pdf
        pdf.open { [weak self] result in
            MainActor.assumeIsolated {
                guard let self, !self.closed else { return }
                switch result {
                case .success(let info):
                    let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
                    let bytes = (attrs?[.size] as? NSNumber)?.intValue ?? 0
                    let modified = (attrs?[.modificationDate] as? Date).map(Self.iso) ?? ""
                    self.scheme.pdf = pdf
                    self.scheme.pages = info.pages
                    self.pdfInfo = ["pages": info.pages, "sizes": info.sizes, "name": url.lastPathComponent, "urlPattern": pdf.urlPattern, "bytes": bytes, "modified": modified]
                case .failure(let e):
                    self.pdf = nil
                    self.pdfInfo = e.payload
                }
                self.send()
            }
        }
    }

    // ---- TextFold

    // TextFold found and asked for the paper's doc (never a model: that's fold()).
    func lookUp() {
        let base = client.base()
        self.base = base
        client.ping(base) { [weak self] up in
            MainActor.assumeIsolated {
                guard let self, !self.closed else { return }
                guard up else { self.state = ["kind": "no-textfold"]; return self.send() }
                self.client.find(base, key: self.paper.key, title: (self.paperInfo?["title"] as? String) ?? self.paper.title, cachedId: self.doc?["id"] as? String) { [weak self] found in
                    MainActor.assumeIsolated { self?.found(found) }
                }
            }
        }
    }

    private func found(_ f: TextFoldClient.Found) {
        guard !closed else { return }
        switch f {
        case .doc(_, let d):
            doc = d
            saved = nil
            state = ["kind": "ready"]
            try? store?.writeJSON(FoldStore.doc, d)
        case .state(let s):
            state = s
            if s["kind"] as? String == "not-folded" { doc = nil; saved = nil } // (TextFold has none now: the cached one isn't this paper's any more)
        }
        send()
    }

    // Fold it with TextFold (the page's button): read, then the job polled until its doc comes.
    func fold() {
        guard !folding, let base else { return lookUp() }
        folding = true
        state = ["kind": "folding", "status": "queued"]
        page?.state(state)
        client.fold(base, key: paper.key) { [weak self] folded in
            MainActor.assumeIsolated {
                guard let self, !self.closed else { return }
                switch folded {
                case .job(let id):
                    self.client.poll(base, job: id, each: { [weak self] s in
                        MainActor.assumeIsolated { guard let self, !self.closed else { return }; self.state = s; self.page?.state(s) }
                    }, cancelled: { [weak self] in MainActor.assumeIsolated { self?.closed ?? true } }) { [weak self] found in
                        MainActor.assumeIsolated {
                            self?.folding = false
                            self?.found(found)
                        }
                    }
                case .state(let s):
                    self.folding = false
                    self.state = s
                    self.send()
                }
            }
        }
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
        let cite = (try? launcher.core?.glue("paperCite", [p], as: String.self)) ?? ""
        let authors = (p["authors"] as? String).map { $0.isEmpty ? [] : [$0] } ?? []
        return ["key": paper.key, "libraryID": paper.libraryID, "title": (p["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? paper.title,
                "authors": authors, "year": p["year"] as? String ?? "", "publication": p["publication"] as? String ?? "", "cite": cite]
    }

    func send() {
        guard ready, !closed, let page else { return }
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
            "saved": saved ?? NSNull(),
            "marks": marks,
            "links": links ?? NSNull(),
            "prefs": Self.prefs,
            "pdf": pdfInfo ?? NSNull(),
        ])
        // the words, when the page has to link the panes itself (no valid links.json): what's read so far, then the rest
        sendWords = links == nil && pdf != nil && pdfInfo?["problem"] == nil
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
        case "fold": fold()
        case "retry": lookUp()
        default: break
        }
    }

    func windowClosing() { closed = true }

    // ⌘W closes; ⌘- ⌘+ ⌘0 the text size; ⌘R TextFold looked up again; the editing keys for the page's text boxes.
    // esc never closes the window (the page's: fold back, hide the bar).
    func windowKey(_ e: NSEvent) -> Bool {
        let flags = e.modifierFlags.intersection([.command, .option, .control, .shift])
        let chars = (e.charactersIgnoringModifiers ?? "").lowercased()
        if flags == .command && chars == "w" { close(); return true }
        let zoomFlags: [NSEvent.ModifierFlags] = [.command, .control, [.command, .shift], [.control, .shift]]
        if zoomFlags.contains(flags), let step = ["-": -1, "=": 1, "+": 1, "0": 0][chars] {
            stepZoom(step)
            return true
        }
        if flags == .command && chars == "r" { UsageLog.shared.count("fold:retry"); lookUp(); return true }
        let edits: [String: Selector] = ["c": #selector(NSText.copy(_:)), "v": #selector(NSText.paste(_:)), "x": #selector(NSText.cut(_:)),
                                         "a": #selector(NSText.selectAll(_:)), "z": Selector(("undo:"))]
        if flags == .command, let action = edits[chars] { NSApp.sendAction(action, to: nil, from: nil); return true }
        if flags == [.command, .shift] && chars == "z" { NSApp.sendAction(Selector(("redo:")), to: nil, from: nil); return true }
        return false
    }
}
