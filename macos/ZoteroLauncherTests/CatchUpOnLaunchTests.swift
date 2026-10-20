import AppKit
import XCTest
@testable import ZoteroLauncher

// A catch-up checks what needs it before it starts; when the app opens it runs that check (what Settings › Defaults ›
// What the app checks when it opens selects) and asks first; the launcher resizes (macos/docs/superpowers/specs/2026-10-18-…).
@MainActor
final class CatchUpOnLaunchTests: XCTestCase {
    private var home: URL!
    private var bridge: FakeBridge!
    private var runner: FakeRunner!
    private var model: LauncherModel!
    private var shown = 0

    override func setUp() async throws {
        home = FileManager.default.temporaryDirectory.appendingPathComponent("launch-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        bridge = FakeBridge()
        let typed = Fixture.bridge("search-typed")
        bridge.answers["/search"] = { body in var a = typed; a["query"] = body["query"] ?? ""; return .ok(a) }
        bridge.answers["/sync/status"] = { _ in .ok(["ok": true, "configured": true, "running": false]) }
        bridge.answers["/extract/pending"] = { _ in .ok(["total": 0, "items": []]) }
        bridge.answers["/papers/select"] = { _ in .ok(["total": 0, "items": []]) }
        runner = FakeRunner()
        runner.answers["list"] = { _, _ in FakeRunner.json(Fixture.synthetic("prompts")) }
        runner.answers["tasks"] = { _, _ in FakeRunner.json(["tasks": []]) }
        runner.answers["providers"] = { _, _ in FakeRunner.json(Fixture.synthetic("providers")) }
        runner.answers["models"] = { _, _ in FakeRunner.json(Fixture.synthetic("models")) }
        runner.answers["catchup-plan"] = { _, _ in FakeRunner.json([String: Any]()) }
        runner.answers["run"] = { _, _ in RunnerResult(status: 0) }
        runner.hold = ["run"]
    }

    override func tearDown() async throws { try? FileManager.default.removeItem(at: home) }

    private var settingsFile: URL { home.appendingPathComponent(".config/omarchy/oma-zotero-launcher.json") }

    // The model on these settings; `launched`: as the app starts (the launcher closed, opened for the question), else
    // with the launcher open.
    private func make(_ settings: String, launched: Bool) throws {
        try FileManager.default.createDirectory(at: settingsFile.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(settings.utf8).write(to: settingsFile)
        model = LauncherModel(bridge: bridge, desktop: FakeDesktop(), env: ["HOME": home.path, "hostname": "mac"], runner: runner, fetcher: FakeFetcher())
        model.showLauncher = { [unowned self] in self.shown += 1; self.model.willShow() }
        if launched { model.appLaunched() } else { model.willShow() }
    }

    private var extractState: [String: Any] {
        (try? JSONSerialization.jsonObject(with: Data(contentsOf: home.appendingPathComponent(".config/omarchy/oma-zotero-launcher/extract.json")))) as? [String: Any] ?? [:]
    }

    private var savedDefaults: [String: Any] {
        ((try? JSONSerialization.jsonObject(with: Data(contentsOf: settingsFile))) as? [String: Any])?["defaults"] as? [String: Any] ?? [:]
    }

    private func select(_ test: (ListRow) -> Bool) throws {
        model.store.selectedIndex = try XCTUnwrap(model.listRows.firstIndex(where: test), "no such row")
    }

    private static let recent: [String: Any] = ["recent": ["papers": 1, "jobs": [["id": "1:NEW00001", "op": "prompt", "prompt": "summary", "title": "A"]]]]

    // ---- 2: a catch-up checks first

    func testEnterChecksAgainAndRunsWhatTheCheckFinds() throws {
        var calls = 0
        runner.answers["catchup-plan"] = { argv, _ in
            calls += 1
            // the page's count: two papers; the check at Enter: one of them is done meanwhile
            let jobs: [[String: Any]] = argv.contains("--stale-taxonomies") ? [["id": "1:OLD00001", "op": "prompt", "prompt": "summary"], ["id": "1:OLD00002", "op": "prompt", "prompt": "summary"]]
                : [["id": "1:OLD00002", "op": "prompt", "prompt": "summary"]]
            return FakeRunner.json(["recent": ["papers": jobs.count, "jobs": jobs]])
        }
        try make(#"{"defaults": {"autoPrompts": ["summary"]}}"#, launched: false)
        model.openSettings("defaults")
        let counted = calls
        try select { $0.rowId == "set-catchup" && $0.value == "recent" }
        model.execute(.activate)
        XCTAssertEqual(calls, counted + 1, "asked again at Enter")
        XCTAssertEqual(runner.calls("run").map { $0.argv[4] }, ["OLD00002"], "only what the check found")
        XCTAssertEqual(model.flash, "Started: 1 process on 1 paper, in the background (in Processes)")
    }

    func testNothingFoundStartsNothing() throws {
        try make(#"{"defaults": {"autoPrompts": ["summary"]}}"#, launched: false)
        model.openSettings("defaults")
        try select { $0.rowId == "set-catchup" && $0.value == "taxonomies" }
        model.execute(.activate)
        XCTAssertEqual(model.flash, "Nothing to do: every paper is up to date")
        XCTAssertNil(model.extractFile?.upToDate)
        XCTAssertEqual(runner.calls("catchup-plan").last?.argv.prefix(2), ["oma-zotero-prompt", "catchup-plan"])
        XCTAssertTrue(runner.calls("catchup-plan").last?.argv.contains("--stale-taxonomies") == true)
        XCTAssertFalse(runner.calls("catchup-plan").last?.argv.contains("--since") ?? true, "its part only")
    }

    func testACheckThatFailsSaysWhyAndStartsNothing() throws {
        try make(#"{"defaults": {"autoPrompts": ["summary"]}}"#, launched: false)
        model.openSettings("defaults")
        runner.answers["catchup-plan"] = { _, _ in RunnerResult(status: 1, stderr: "the bridge didn't answer") }
        try select { $0.rowId == "set-catchup" && $0.value == "prompts" }
        model.execute(.activate)
        XCTAssertTrue(model.flash.hasPrefix("Couldn't check which papers need it: "), model.flash)
        XCTAssertNil(model.extractFile?.upToDate)
    }

    // ---- 3: when the app opens

    func testTheAppsOpeningChecksAndAsksOnceAndYesRunsThem() throws {
        runner.answers["catchup-plan"] = { _, _ in FakeRunner.json(Self.recent) }
        try make(#"{"defaults": {"autoPrompts": ["summary"]}}"#, launched: true)
        let argv = try XCTUnwrap(runner.calls("catchup-plan").first?.argv)
        XCTAssertTrue(argv.contains("--prompts") && argv.contains("summary"), "\(argv)")
        XCTAssertFalse(argv.contains("--stale-prompts"), "the changed ones are off by default")
        XCTAssertEqual(shown, 1, "the launcher opened for the question")
        XCTAssertEqual(model.store.view, "confirm")
        XCTAssertEqual(model.confirmAsk?.title, "Bring 1 paper up to date?")
        XCTAssertEqual(model.listRows.map(\.label), ["Bring it up to date (in Processes)", "Not now"])
        XCTAssertEqual(model.listRows.first?.detail, "Added in the last 30 days: 1 paper needs “Summary”")
        XCTAssertEqual(model.store.selectedIndex, 1, "unasked for: Not now is highlighted, so a stray Return leaves them")
        model.answerConfirm(true)
        XCTAssertEqual(runner.calls("catchup-plan").count, 1, "the plan just made, not a second check")
        XCTAssertEqual(runner.calls("run").last?.argv, ["oma-zotero-prompt", "run", "summary", "--key", "NEW00001", "--library", "1", "--extract-first"])
        let u = try XCTUnwrap(extractState["update"] as? [String: Any])
        XCTAssertEqual(u["kind"] as? String, "launch")
        XCTAssertEqual(u["title"] as? String, "Bringing papers up to date")
        // Zotero back later: not asked again this run of the app
        model.status = "zotero-down"
        model.status = "ready"
        XCTAssertEqual(runner.calls("catchup-plan").count, 1)
    }

    func testNotNowLeavesThem() throws {
        runner.answers["catchup-plan"] = { _, _ in FakeRunner.json(Self.recent) }
        try make(#"{"defaults": {"autoPrompts": ["summary"]}}"#, launched: true)
        model.answerConfirm(false)
        XCTAssertTrue(runner.calls("run").isEmpty)
        XCTAssertNil(model.extractFile?.upToDate)
        XCTAssertNotEqual(model.store.view, "confirm")
        // answered: not asked at the next open
        model.didHide()
        model.willShow()
        XCTAssertNotEqual(model.store.view, "confirm")
    }

    func testEscIsNotNow() throws {
        runner.answers["catchup-plan"] = { _, _ in FakeRunner.json(Self.recent) }
        try make(#"{"defaults": {"autoPrompts": ["summary"]}}"#, launched: true)
        XCTAssertEqual(model.store.view, "confirm")
        model.execute(.back)
        XCTAssertNotEqual(model.store.view, "confirm")
        model.didHide()
        model.willShow()
        XCTAssertNotEqual(model.store.view, "confirm")
        XCTAssertTrue(runner.calls("run").isEmpty)
    }

    func testLeftForAnotherViewItIsAskedWhenTheLauncherOpensNext() throws {
        runner.answers["catchup-plan"] = { _, _ in FakeRunner.json(Self.recent) }
        try make(#"{"defaults": {"autoPrompts": ["summary"]}}"#, launched: true)
        XCTAssertEqual(model.store.view, "confirm")
        model.goHome() // (Go to… from the menu bar opened another view over it)
        model.didHide()
        model.willShow()
        XCTAssertEqual(model.store.view, "confirm")
        XCTAssertEqual(model.confirmAsk?.tag, LauncherModel.launchAskTag)
    }

    func testNothingToDoAsksNothing() throws {
        try make(#"{"defaults": {"autoPrompts": ["summary"]}}"#, launched: true)
        XCTAssertEqual(runner.calls("catchup-plan").count, 1)
        XCTAssertEqual(shown, 0)
        XCTAssertNil(model.confirmAsk)
    }

    func testOffChecksNothing() throws {
        try make(#"{"defaults": {"autoPrompts": ["summary"], "launchCatchUp": false}}"#, launched: true)
        XCTAssertTrue(runner.calls("catchup-plan").isEmpty)
        XCTAssertEqual(shown, 0)
    }

    func testNothingSelectedChecksNothing() throws {
        try make(#"{"defaults": {}}"#, launched: true)
        XCTAssertTrue(runner.calls("catchup-plan").isEmpty)
    }

    func testAnotherMachineRunsAutomationSoThisOneDoesntAsk() throws {
        try make(#"{"general": {"automationHost": "lab-mac"}, "defaults": {"autoPrompts": ["summary"]}}"#, launched: true)
        XCTAssertTrue(runner.calls("catchup-plan").isEmpty)
    }

    func testItWaitsForZotero() throws {
        runner.answers["catchup-plan"] = { _, _ in FakeRunner.json(Self.recent) }
        bridge.answers["/sync/status"] = { _ in .zoteroDown }
        try make(#"{"defaults": {"autoPrompts": ["summary"]}}"#, launched: true)
        XCTAssertTrue(runner.calls("catchup-plan").isEmpty)
        bridge.answers["/sync/status"] = { _ in .ok(["ok": true]) }
        model.pingZotero()
        XCTAssertEqual(runner.calls("catchup-plan").count, 1)
        XCTAssertEqual(model.store.view, "confirm")
    }

    func testClosedUnansweredItIsAskedWhenTheLauncherOpensNext() throws {
        runner.answers["catchup-plan"] = { _, _ in FakeRunner.json(Self.recent) }
        try make(#"{"defaults": {"autoPrompts": ["summary"]}}"#, launched: true)
        XCTAssertEqual(model.store.view, "confirm")
        model.didHide() // (it lost the keys)
        model.store.back { 0 } // (and came back elsewhere)
        model.willShow()
        XCTAssertEqual(model.store.view, "confirm")
        XCTAssertEqual(model.confirmAsk?.tag, LauncherModel.launchAskTag)
    }

    func testTheTestsAndFixturesDontStartIt() {
        XCTAssertFalse(LauncherModel.startsAtLaunch(["XCTestConfigurationFilePath": "/x"]))
        XCTAssertFalse(LauncherModel.startsAtLaunch(["ZL_FIXTURES": "/x"]))
        XCTAssertFalse(LauncherModel.startsAtLaunch(["XCTestBundlePath": "/x"]))
        XCTAssertFalse(LauncherModel.startsAtLaunch(["XCTestSessionIdentifier": "x"]))
        XCTAssertTrue(LauncherModel.startsAtLaunch([:]))
    }

    // ---- 4: what it checks

    func testWhatItChecksIsItsOwnPageAndEachSwitchWritesItsKey() throws {
        try make(#"{"defaults": {"autoExtractNew": true}}"#, launched: false)
        model.openSettings("defaults")
        let ask = try XCTUnwrap(model.listRows.first { $0.value == "defaults.launchCatchUp" })
        XCTAssertEqual(ask.section, "When the app opens")
        XCTAssertTrue(ask.checked)
        try select { $0.rowId == "set-nav" && $0.value == "launch-catchup" }
        model.execute(.activate)
        XCTAssertEqual(model.store.view, "settings-launch-catchup")
        XCTAssertEqual(model.placeholder(), "‹ Settings › Defaults › What the app checks when it opens")
        try select { $0.value == "defaults.launchCatchUpWhat.text" }
        XCTAssertTrue(try XCTUnwrap(model.selectedListRow).checked, "as Extract new papers' text")
        model.execute(.activate)
        XCTAssertEqual(savedDefaults["launchCatchUpWhat"] as? [String: Bool], ["text": false])
        try select { $0.rowId == "set-auto-prompt" && $0.value == "launch:summary" }
        XCTAssertTrue(model.hints().contains("↵ change"), "\(model.hints())") // a checkbox, as on Prompts to run on new papers
        model.execute(.activate)
        let what = try XCTUnwrap(savedDefaults["launchCatchUpWhat"] as? [String: Any])
        XCTAssertEqual(what["prompts"] as? [String], ["summary"])
        XCTAssertEqual(what["text"] as? Bool, false)
        // and the question's switch
        model.back()
        try select { $0.value == "defaults.launchCatchUp" }
        model.execute(.activate)
        XCTAssertEqual(savedDefaults["launchCatchUp"] as? Bool, false)
        XCTAssertEqual(model.flash, "Off: the app no longer asks when it opens")
    }

}
