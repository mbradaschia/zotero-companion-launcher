import AppKit

// Which features you use, counted on this Mac and never sent anywhere (Hotkey and Login… › This Mac › Count which
// features I use). Only names the app itself gives are counted (a row's id, a key, a view, a review table's message,
// what a paper was opened with), never what you type, a paper, a note, a tag or a search: so the file says what's
// used and what isn't, and nothing about your library. One file per machine (`usage/<machine>.json`, in the sync
// folder when there is one, else this Mac's state folder), so two Macs never write the same file; a count per day and
// name, the last 400 days. Written a minute after the first count, when the launcher closes and when the app quits;
// nothing is written while the sync folder is away (the counts wait).
@MainActor
final class UsageLog {
    static let shared = UsageLog()
    static let keepDays = 400
    static let defaultsKey = "ZLUsageLog"

    // The file's place and this machine's name (AppPaths: `usage`, `machine`, `readOnly`), set as the launcher reads its files.
    var paths: AppPaths?
    var flushDelay: TimeInterval = 60
    var now: () -> Date = Date.init
    private(set) var pending: [String: [String: Int]] = [:] // day → name → count, not written yet
    private let defaults: UserDefaults? // nil under the tests: kept in memory
    var writes: Bool // false under the tests, unless a test asks: nothing lands in a fixture's folder
    private var memoryEnabled = true
    private var flushTask: Task<Void, Never>?

    init(defaults: UserDefaults? = NSClassFromString("XCTestCase") != nil ? nil : .standard) {
        self.defaults = defaults
        writes = defaults != nil
        guard defaults != nil else { return }
        NotificationCenter.default.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: .main) { _ in
            MainActor.assumeIsolated { _ = UsageLog.shared.flush() }
        }
    }

    // On unless turned off (kept on this Mac). Off drops what wasn't written yet.
    var enabled: Bool {
        get { defaults.map { $0.object(forKey: Self.defaultsKey) as? Bool ?? true } ?? memoryEnabled }
        set {
            if let defaults { defaults.set(newValue, forKey: Self.defaultsKey) } else { memoryEnabled = newValue }
            if !newValue { pending = [:]; flushTask?.cancel(); flushTask = nil }
        }
    }

    // One use of `name` ("row:open", "key:i", "view:settings"…); a name that isn't one of the app's own is dropped.
    func count(_ name: String) {
        guard enabled, Self.valid(name) else { return }
        pending[Self.day(now()), default: [:]][name, default: 0] += 1
        guard flushTask == nil, defaults != nil else { return }
        let delay = flushDelay
        flushTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.flushTask = nil
            self?.flush()
        }
    }

    // The counts added to the machine's file. → whether they were written (else they wait for the next time).
    @discardableResult
    func flush() -> Bool {
        flushTask?.cancel()
        flushTask = nil
        guard writes, !pending.isEmpty, let paths, let dir = paths.usage, !paths.readOnly else { return false }
        let url = URL(fileURLWithPath: dir).appendingPathComponent(Self.fileName(paths.machine))
        let old = FileManager.default.contents(atPath: url.path).flatMap { try? JSONSerialization.jsonObject(with: $0) }
        let merged = Self.merged(old, adding: pending, machine: paths.machine, oldest: Self.day(now().addingTimeInterval(-Double(Self.keepDays) * 86400)))
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try JSONSerialization.data(withJSONObject: merged, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: url, options: .atomic)
            pending = [:]
            return true
        } catch {
            return false
        }
    }

    // ---- pure

    // "<kind>:<what>": a lowercase kind, then up to 48 of the app's own characters (ids, a key's character, ⌘-less).
    static func valid(_ name: String) -> Bool {
        guard name.count <= 64, let colon = name.firstIndex(of: ":") else { return false }
        let kind = name[..<colon], what = name[name.index(after: colon)...]
        guard !kind.isEmpty, kind.count <= 12, kind.allSatisfy({ $0.isASCII && $0.isLowercase }) else { return false }
        guard !what.isEmpty, what.count <= 48 else { return false }
        return what.unicodeScalars.allSatisfy { $0.isASCII && $0.value > 32 && $0.value < 127 && !"\"\\`".unicodeScalars.contains($0) }
    }

    // The local day, "2026-10-29".
    static func day(_ date: Date) -> String {
        let c = Calendar(identifier: .gregorian).dateComponents(in: .current, from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    // A machine's file name: its name made safe for a file ("Marcelo's Mac mini" → "Marcelo-s-Mac-mini.json").
    static func fileName(_ machine: String) -> String {
        let safe = machine.replacingOccurrences(of: "[^A-Za-z0-9._-]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-."))
        return (safe.isEmpty ? "this-machine" : safe) + ".json"
    }

    // The file with `adding` counted in: { version, machine, days: { day: { name: count } } }, days before `oldest`
    // left out, anything in it that isn't a count dropped.
    static func merged(_ old: Any?, adding: [String: [String: Int]], machine: String, oldest: String) -> [String: Any] {
        var days: [String: [String: Int]] = [:]
        if let o = old as? [String: Any], let d = o["days"] as? [String: Any] {
            for (day, v) in d {
                guard let counts = v as? [String: Any] else { continue }
                for (name, n) in counts { if let n = n as? Int, n > 0, valid(name) { days[day, default: [:]][name] = n } }
            }
        }
        for (day, counts) in adding { for (name, n) in counts { days[day, default: [:]][name, default: 0] += n } }
        days = days.filter { $0.key >= oldest && !$0.value.isEmpty }
        return ["version": 1, "machine": machine, "days": days]
    }
}
