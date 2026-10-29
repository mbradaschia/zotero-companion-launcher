import XCTest
@testable import ZoteroLauncher

// The usage log (Files/UsageLog.swift): only the app's own names are counted, a file per machine holds a count per
// day, nothing is written while the sync folder is away, and turning it off drops what wasn't written.
@MainActor
final class UsageLogTests: XCTestCase {
    private var home: URL!
    private var model: LauncherModel!

    override func setUp() async throws {
        home = FileManager.default.temporaryDirectory.appendingPathComponent("usage-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        model = LauncherModel(bridge: FakeBridge(), desktop: FakeDesktop(), env: ["HOME": home.path, "hostname": "mac"], runner: FakeRunner(), fetcher: FakeFetcher())
        model.willShow()
    }

    override func tearDown() async throws {
        try? FileManager.default.removeItem(at: home)
    }

    private func log() -> UsageLog {
        let log = UsageLog(defaults: nil)
        log.writes = true
        log.paths = model.paths
        log.now = { Date(timeIntervalSince1970: 1_793_280_000) } // 2026-10-29, midday UTC
        return log
    }

    private func file(_ log: UsageLog) throws -> [String: Any] {
        let paths = try XCTUnwrap(log.paths)
        let url = URL(fileURLWithPath: try XCTUnwrap(paths.usage)).appendingPathComponent(UsageLog.fileName(paths.machine))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    func testOnlyTheAppsOwnNamesAreCounted() {
        for name in ["row:open", "key:#", "key:;", "key:.", "result:item>external", "view:settings-tax-ai", "cmd:cycleStatus", "review:cell"] {
            XCTAssertTrue(UsageLog.valid(name), name)
        }
        for name in ["open", "Row:open", "row:", ":open", "row:two words", "search:étic", "key:\"", "row:a\\b", "row:" + String(repeating: "x", count: 49)] {
            XCTAssertFalse(UsageLog.valid(name), name)
        }
    }

    func testTheFileLivesInTheStateFolderWithoutASyncFolder() throws {
        XCTAssertEqual(model.paths?.usage, home.path + "/.local/state/oma-zotero/usage")
        XCTAssertEqual(UsageLog.fileName("Marcelo's Mac mini"), "Marcelo-s-Mac-mini.json")
        XCTAssertEqual(UsageLog.fileName("…"), "this-machine.json")
    }

    func testCountsAddUpDayByDay() throws {
        let log = log()
        log.count("row:open")
        log.count("row:open")
        log.count("key:i")
        log.count("not a name")
        XCTAssertTrue(log.flush())
        XCTAssertTrue(log.pending.isEmpty)
        log.count("row:open")
        XCTAssertTrue(log.flush())
        let f = try file(log)
        XCTAssertEqual(f["version"] as? Int, 1)
        XCTAssertEqual(f["machine"] as? String, model.paths?.machine)
        let day = try XCTUnwrap((f["days"] as? [String: Any])?[UsageLog.day(log.now())] as? [String: Int])
        XCTAssertEqual(day, ["row:open": 3, "key:i": 1])
    }

    func testOldDaysAndWhatIsntACountAreDropped() {
        let old: [String: Any] = ["version": 1, "machine": "mac", "days": [
            "2024-01-01": ["row:open": 9],
            "2026-10-28": ["row:open": 2, "bad name": 4, "key:i": "x", "key:r": 0],
        ]]
        let merged = UsageLog.merged(old, adding: ["2026-10-28": ["row:open": 1], "2026-10-29": ["key:i": 1]], machine: "mac", oldest: "2025-09-24")
        let days = merged["days"] as? [String: [String: Int]]
        XCTAssertEqual(days, ["2026-10-28": ["row:open": 3], "2026-10-29": ["key:i": 1]])
    }

    func testNothingIsWrittenWhileTheSyncFolderIsAway() throws {
        let log = log()
        var away = try XCTUnwrap(model.paths)
        away.readOnly = true
        log.paths = away
        log.count("row:open")
        XCTAssertFalse(log.flush())
        XCTAssertEqual(log.pending[UsageLog.day(log.now())], ["row:open": 1]) // (kept for when it's back)
        log.paths = model.paths
        XCTAssertTrue(log.flush())
    }

    func testOffDropsWhatWasntWritten() {
        let log = log()
        log.count("row:open")
        log.enabled = false
        XCTAssertTrue(log.pending.isEmpty)
        log.count("row:open")
        XCTAssertTrue(log.pending.isEmpty)
        XCTAssertFalse(log.flush())
    }

    func testTheTestsNeverWriteThroughTheSharedLog() {
        XCTAssertFalse(UsageLog.shared.writes)
    }

    func testTheLauncherCountsKeysCommandsAndViews() {
        let before = UsageLog.shared.pending[UsageLog.day(Date())] ?? [:]
        model.execute(.openKeys)
        model.openSettings("")
        let after = UsageLog.shared.pending[UsageLog.day(Date())] ?? [:]
        XCTAssertEqual(after["cmd:openKeys", default: 0], before["cmd:openKeys", default: 0] + 1)
        XCTAssertGreaterThan(after.filter { $0.key.hasPrefix("view:") }.values.reduce(0, +), before.filter { $0.key.hasPrefix("view:") }.values.reduce(0, +))
        XCTAssertNil(LauncherModel.usageName(.move(1)))
        XCTAssertNil(LauncherModel.usageName(.typing("a")))
        XCTAssertEqual(LauncherModel.usageName(.cycleStatus(1)), "cycleStatus")
    }
}
