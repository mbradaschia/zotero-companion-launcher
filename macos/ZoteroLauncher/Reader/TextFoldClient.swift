import Foundation

// TextFold, the app that folds a paper into its five levels (docs/fold-reader/SPEC.md section 4): found through the
// server.json it writes, asked over HTTP on this computer only (an ephemeral session: no cookies, no cache, no proxy,
// no Origin). Looking a paper up and reading its doc never run a model; folding starts only when the page asks for it
// (Fold it with TextFold). Answers arrive on the main queue. The states are section 9's ({kind, ...}, FR.state's).
final class TextFoldClient {
    let session: URLSession
    let environment: [String: String]
    let home: URL
    static let fallback = URL(string: "http://127.0.0.1:3017")!
    static let pollEvery: TimeInterval = 2

    init(configuration: URLSessionConfiguration? = nil, environment: [String: String] = ProcessInfo.processInfo.environment,
         home: URL = FileManager.default.homeDirectoryForCurrentUser) {
        let config = configuration ?? URLSessionConfiguration.ephemeral
        config.httpCookieAcceptPolicy = .never
        config.httpShouldSetCookies = false
        config.httpCookieStorage = nil
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.connectionProxyDictionary = [:] // this computer only: never through a proxy
        session = URLSession(configuration: config)
        self.environment = environment
        self.home = home
    }

    // ---- finding it

    // Where server.json may be, in order: $TEXTFOLD_DATA, then the desktop app's (and a pip install's) folder.
    func serverFiles() -> [URL] {
        var out: [URL] = []
        if let data = environment["TEXTFOLD_DATA"], !data.isEmpty { out.append(URL(fileURLWithPath: data, isDirectory: true).appendingPathComponent("server.json")) }
        out.append(home.appendingPathComponent("Library/Application Support/TextFold/server.json"))
        return out
    }

    // A url TextFold wrote, kept only if it is http on this computer.
    static func loopback(_ text: String?) -> URL? {
        guard let text, let url = URL(string: text), url.scheme?.lowercased() == "http",
              let host = url.host?.lowercased(), ["127.0.0.1", "localhost", "::1", "[::1]"].contains(host) else { return nil }
        var s = url.absoluteString
        while s.hasSuffix("/") { s.removeLast() }
        return URL(string: s)
    }

    // The base URL to try: the first server.json that names one on this computer, else 127.0.0.1:3017.
    func base() -> URL {
        for file in serverFiles() {
            guard let data = try? Data(contentsOf: file), let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
            if let url = Self.loopback(o["url"] as? String) { return url }
        }
        return Self.fallback
    }

    // Whether it answers: GET <base>/api/zotero, JSON within 1.5 s.
    func ping(_ base: URL, _ done: @escaping (Bool) -> Void) {
        get(base, "/api/zotero", timeout: 1.5) { status, json, _ in done(status > 0 && json != nil) }
    }

    // ---- HTTP

    func get(_ base: URL, _ path: String, timeout: TimeInterval, _ done: @escaping (Int, Any?, String?) -> Void) {
        send("GET", base, path, nil, timeout: timeout, done)
    }

    func post(_ base: URL, _ path: String, _ body: [String: Any], timeout: TimeInterval, _ done: @escaping (Int, Any?, String?) -> Void) {
        send("POST", base, path, body, timeout: timeout, done)
    }

    private func send(_ method: String, _ base: URL, _ path: String, _ body: [String: Any]?, timeout: TimeInterval, _ done: @escaping (Int, Any?, String?) -> Void) {
        guard let url = URL(string: base.absoluteString + path) else { return DispatchQueue.main.async { done(0, nil, "bad URL") } }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }
        session.dataTask(with: request) { data, response, error in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0, options: [.fragmentsAllowed]) }
            DispatchQueue.main.async { done(status, json, error?.localizedDescription) }
        }.resume()
    }

    // ---- the paper's doc

    enum Found {
        case doc(id: String, doc: [String: Any])
        case state([String: Any]) // not-folded, zotero-off, no-textfold, fold-failed
    }

    // The item's doc: the cached doc id first (GET /api/doc/<id>), else TextFold's library search by title, the row
    // with this key; its paper is the doc id ("" not folded). Only the user's library (users/0).
    func find(_ base: URL, key: String, title: String, cachedId: String?, _ done: @escaping (Found) -> Void) {
        if let id = cachedId, Self.validDocId(id) {
            return doc(base, id) { found in
                if case .doc = found { return done(found) }
                self.search(base, key: key, title: title, done)
            }
        }
        search(base, key: key, title: title, done)
    }

    // A query value with everything but letters, digits and - . _ ~ escaped (& = + # among them).
    static func encode(_ s: String) -> String {
        s.addingPercentEncoding(withAllowedCharacters: CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")) ?? ""
    }

    static func validDocId(_ id: String) -> Bool { id.range(of: "^[A-Za-z0-9_.-]{1,120}$", options: .regularExpression) != nil && !id.hasPrefix(".") }

    func search(_ base: URL, key: String, title: String, _ done: @escaping (Found) -> Void) {
        get(base, "/api/zotero/items?lib=users/0&q=" + Self.encode(String(title.prefix(200))), timeout: 20) { status, json, error in
            if let state = Self.zoteroState(status, json, error) { return done(.state(state)) }
            let rows = json as? [[String: Any]] ?? ((json as? [String: Any])?["items"] as? [[String: Any]]) ?? []
            let paper = rows.first { $0["key"] as? String == key }?["paper"] as? String ?? ""
            guard !paper.isEmpty, Self.validDocId(paper) else { return done(.state(["kind": "not-folded"])) }
            self.doc(base, paper, done)
        }
    }

    func doc(_ base: URL, _ id: String, _ done: @escaping (Found) -> Void) {
        get(base, "/api/doc/" + id, timeout: 20) { status, json, error in
            if status == 200, let doc = json as? [String: Any] { return done(.doc(id: id, doc: doc)) }
            if status == 404 { return done(.state(["kind": "not-folded"])) }
            done(.state(Self.zoteroState(status, json, error) ?? ["kind": "fold-failed", "error": Self.why(status, json, error)]))
        }
    }

    // No answer: TextFold isn't running; a 503: it can't reach Zotero. nil for anything else.
    static func zoteroState(_ status: Int, _ json: Any?, _ error: String?) -> [String: Any]? {
        if status == 0 { return ["kind": "no-textfold"] }
        if status == 503 { return ["kind": "zotero-off"] }
        return nil
    }

    static func why(_ status: Int, _ json: Any?, _ error: String?) -> String {
        if let e = (json as? [String: Any])?["error"] as? String, !e.isEmpty { return e }
        return error ?? "TextFold answered \(status)"
    }

    // ---- folding (only on the page's Fold it with TextFold)

    enum Folded {
        case job(String) // a job's id to poll
        case state([String: Any])
    }

    // POST /api/zotero/read {item: "users/0/<KEY>"}: a job, or online (ref: then /api/generate), or a state.
    func fold(_ base: URL, key: String, _ done: @escaping (Folded) -> Void) {
        post(base, "/api/zotero/read", ["item": "users/0/" + key], timeout: 120) { status, json, error in
            let reply = Self.readReply(status, json, error)
            if case .state(let s) = reply, let ref = s["generate"] as? String {
                return self.post(base, "/api/generate", ["paper": ref], timeout: 30) { status, json, error in
                    if status == 200, let id = (json as? [String: Any])?["id"] as? String { return done(.job(id)) }
                    done(.state(Self.zoteroState(status, json, error) ?? Self.failed(Self.why(status, json, error))))
                }
            }
            done(reply)
        }
    }

    // /api/zotero/read's reply: {ref, title} (→ generate it), {job, ...}, {needs: "engine"}, 400 {error}, 503.
    static func readReply(_ status: Int, _ json: Any?, _ error: String?) -> Folded {
        if let s = zoteroState(status, json, error) { return .state(s) }
        let o = json as? [String: Any] ?? [:]
        if status == 200 {
            if let ref = o["ref"] as? String, !ref.isEmpty { return .state(["kind": "folding", "generate": ref]) }
            if let id = (o["job"] as? [String: Any])?["id"] as? String { return .job(id) }
            if o["needs"] as? String == "engine" { return .state(["kind": "needs-engine"]) }
        }
        let e = o["error"] as? String ?? ""
        if ["no-file", "no-fulltext"].contains(e) { return .state(["kind": "no-file"]) }
        return .state(failed(why(status, json, error)))
    }

    static func failed(_ why: String) -> [String: Any] { ["kind": "fold-failed", "error": String(why.prefix(300))] }

    enum Polled {
        case running([String: Any]) // a folding state
        case moved(String) // the next job's id
        case done(String) // the doc id
        case state([String: Any]) // stopped there
    }

    // One job of GET /api/jobs, as what to do next.
    static func jobState(_ jobs: Any?, id: String) -> Polled {
        guard let list = jobs as? [[String: Any]], let job = list.first(where: { $0["id"] as? String == id }) else {
            return .state(failed("TextFold no longer lists this job"))
        }
        let status = job["status"] as? String ?? ""
        switch status {
        case "queued": return .running(["kind": "folding", "status": "queued"])
        case "running": return .running(["kind": "folding", "status": "running", "stage": job["stage"] as? String ?? "", "done": job["done"] as? Int ?? 0, "total": job["total"] as? Int ?? 0])
        case "done":
            let pid = job["pid"] as? String ?? ""
            return validDocId(pid) ? .done(pid) : .state(failed("TextFold finished without a document"))
        case "moved":
            if let next = job["next"] as? String, !next.isEmpty { return .moved(next) }
            return .state(failed("TextFold moved the job without saying where"))
        case "error":
            let e = job["error"] as? String ?? ""
            if e == "no-model" { return .state(["kind": "no-model"]) }
            if e == "needs-engine" { return .state(["kind": "needs-engine"]) }
            return .state(failed(e.isEmpty ? "TextFold's job failed" : e))
        case "stopped": return .state(failed("The job was stopped in TextFold"))
        default: return .state(failed("TextFold said “\(status)”"))
        }
    }

    // GET /api/jobs every 2 s until the job is done (then its doc), moved (followed) or stopped; `each` gets every
    // folding state on the way. `cancelled` stops the polling (the window closed).
    func poll(_ base: URL, job: String, each: @escaping ([String: Any]) -> Void, cancelled: @escaping () -> Bool, _ done: @escaping (Found) -> Void) {
        guard !cancelled() else { return }
        get(base, "/api/jobs", timeout: 10) { status, json, error in
            guard !cancelled() else { return }
            if let s = Self.zoteroState(status, json, error) { return done(.state(s)) }
            switch Self.jobState(json, id: job) {
            case .running(let s):
                each(s)
                DispatchQueue.main.asyncAfter(deadline: .now() + Self.pollEvery) { self.poll(base, job: job, each: each, cancelled: cancelled, done) }
            case .moved(let next): self.poll(base, job: next, each: each, cancelled: cancelled, done)
            case .done(let pid): self.doc(base, pid, done)
            case .state(let s): done(.state(s))
            }
        }
    }
}
