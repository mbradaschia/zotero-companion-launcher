import XCTest
@testable import ZoteroLauncher

// A problem every paper would meet (Claude signed out, out of credit, no network): the catch-up and the tagging queue
// stop at it instead of failing paper by paper, what to fix is said, and the automation holds; a paper's own problem
// doesn't stop anything. And one catch-up row while one runs.
@MainActor
final class FatalProblemTests: XCTestCase {
    private var home: URL!
    private var bridge: FakeBridge!
    private var runner: FakeRunner!
    private var model: LauncherModel!
    private let signedOut = RunnerResult(status: 1, stderr: "oma-zotero-prompt: Claude: Invalid API key · Please run /login\n")
    private func plan(_ n: Int) -> [String: Any] {
        ["recent": ["jobs": (1...n).map { ["id": "1:" + String(format: "AAAA%04d", $0), "op": "prompt", "prompt": "summary"] }]]
    }

    override func setUp() async throws {
        home = FileManager.default.temporaryDirectory.appendingPathComponent("fatal-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        bridge = FakeBridge()
        let typed = Fixture.bridge("search-typed")
        bridge.answers["/search"] = { body in var a = typed; a["query"] = body["query"] ?? ""; return .ok(a) } // (Zotero ready)
        bridge.answers["/sync/status"] = { _ in .ok([:]) } // (Zotero there: a failure isn't its being away)
        runner = FakeRunner()
        runner.answers["tasks"] = { _, _ in FakeRunner.json(["tasks": []]) }
        runner.answers["catchup-plan"] = { _, _ in FakeRunner.json([String: Any]()) }
        runner.answers["list"] = { _, _ in FakeRunner.json(Fixture.synthetic("prompts")) }
        runner.answers["providers"] = { _, _ in FakeRunner.json(Fixture.synthetic("providers")) }
        runner.answers["models"] = { _, _ in FakeRunner.json(Fixture.synthetic("models")) }
        model = LauncherModel(bridge: bridge, desktop: FakeDesktop(), env: ["HOME": home.path, "hostname": "mac"], runner: runner, fetcher: FakeFetcher())
        model.willShow()
    }

    override func tearDown() async throws { try? FileManager.default.removeItem(at: home) }

    func testTheClassifierTellsWhatToFix() throws {
        let p = try XCTUnwrap(model.fatalProblem("Claude: Invalid API key · Please run /login"))
        XCTAssertEqual(p.kind, "signin")
        XCTAssertEqual(p.message, "Claude isn't signed in (its login expired?): in Terminal, run claude, then /login")
        XCTAssertEqual(model.fatalProblem("rate limited or out of credit (429): slow down")?.kind, "limit")
        XCTAssertEqual(model.fatalProblem("can't reach api.anthropic.com: ENOTFOUND")?.kind, "network")
        XCTAssertNil(model.fatalProblem("the model sent an empty answer"))
        XCTAssertNil(model.fatalProblem("Zotero didn't answer /item: fetch failed"))
    }

    func testASignedOutClaudeStopsTheCatchUpAtTheFirstPaper() throws {
        runner.answers["run"] = { [unowned self] _, _ in self.signedOut }
        var said = ""
        model.startCatchUp("recent", title: "Catching up the last 30 days", plan: plan(3)) { said = $0 }
        XCTAssertTrue(said.hasPrefix("Started: 3 processes"), said)
        XCTAssertEqual(runner.calls("run").count, 1, "stopped there, not tried on the other papers")
        XCTAssertNil(model.extractFile?.upToDate, "the catch-up is over")
        XCTAssertEqual(model.sched.catchUpStopped?.title, "Catching up the last 30 days")
        XCTAssertTrue(model.aiOnHold)
        XCTAssertTrue(model.flash.contains("in Terminal, run claude, then /login"), model.flash)
        // Settings says so, where you'd start it again; Processes says what's on hold
        model.openSettings("defaults")
        let stopped = try XCTUnwrap(model.listRows.first { $0.label == "Stopped: Catching up the last 30 days" })
        XCTAssertTrue(stopped.detail.hasPrefix("Claude isn't signed in"), stopped.detail)
        XCTAssertTrue(model.pendingTasks.contains { $0["id"] as? String == "pending:hold" })
        // started again by you (signed in meanwhile): the hold is over
        runner.answers["run"] = { _, _ in RunnerResult(status: 0, stdout: "saved") }
        model.startCatchUp("recent", title: "Catching up the last 30 days", plan: plan(2)) { _ in }
        XCTAssertEqual(runner.calls("run").count, 3)
        XCTAssertFalse(model.aiOnHold)
        XCTAssertNil(model.sched.catchUpStopped)
    }

    func testAPapersOwnProblemDoesntStopIt() {
        runner.answers["run"] = { _, _ in RunnerResult(status: 1, stderr: "oma-zotero-prompt: the model sent an empty answer\n") }
        model.startCatchUp("recent", title: "Catching up", plan: plan(3)) { _ in }
        XCTAssertEqual(runner.calls("run").count, 3)
        XCTAssertFalse(model.aiOnHold)
        XCTAssertNil(model.sched.catchUpStopped)
    }

    func testTheTaggingQueueStopsAtIt() {
        runner.hold = ["classify"]
        var told: [[String: Any]] = []
        for k in ["AAAA0001", "AAAA0002", "AAAA0003"] { model.classify([["key": k, "libraryID": 1]]) { told += $0 } }
        XCTAssertEqual(runner.calls("classify").count, 1)
        runner.release("classify", FakeRunner.json(["results": [["id": "1:AAAA0001", "status": "failed", "reason": "Jev refused (401): invalid key"]]]))
        XCTAssertEqual(runner.calls("classify").count, 1, "the papers queued behind it aren't tried")
        XCTAssertEqual(told.map { $0["status"] as? String ?? "" }, ["failed", "stopped", "stopped"])
        XCTAssertTrue(model.sched.classifying.isEmpty)
        XCTAssertTrue(model.aiOnHold)
    }

    func testOneCatchUpRowWhileOneRuns() throws {
        runner.hold = ["run"]
        let jobs: [[String: Any]] = [["id": "1:AAAA0001", "op": "prompt", "prompt": "summary"], ["id": "1:AAAA0001", "op": "classify"], ["id": "1:AAAA0002", "op": "classify"]]
        model.startCatchUp("recent", title: "Catching up the last 30 days", plan: ["recent": ["jobs": jobs]]) { _ in }
        model.openSettings("defaults")
        XCTAssertFalse(model.listRows.contains { $0.rowId == "set-catchup" }, "no second offer beside the one running")
        let running = try XCTUnwrap(model.listRows.first { $0.rowId == "set-catchup-stop" })
        XCTAssertEqual(running.detail, "3 processes left on 2 papers · 0 done · Enter stops it")
    }
}
