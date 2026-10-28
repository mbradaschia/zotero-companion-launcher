import Foundation

// A problem every paper would meet (Claude signed out, a refused key, out of credit, no network: GlueRunner.js's
// fatalProblem). The batch it's met in stops there instead of failing paper by paper, what to fix is said once, and
// the automation (a catch-up, new papers' taxonomies and prompts) starts no AI work until it's tried again
// (retryMin), something AI works again, or you start a catch-up yourself.
struct FatalProblem: Decodable, Equatable {
    var kind: String // signin, key, limit, busy, network, setup
    var message: String // what to fix
    var retryMin: Int
    var reason: String // the runner's own words
}

extension LauncherModel {
    // The runner's reason for a failed job → the problem every paper would meet; nil: this paper's own.
    func fatalProblem(_ reason: String) -> FatalProblem? {
        guard let core, !reason.isEmpty else { return nil }
        return (try? core.glue("fatalProblem", [reason], as: FatalProblem?.self)) ?? nil
    }

    // A classify's results → the problem its failed ones met (the runner stops the rest: "stopped").
    func fatalProblem(in results: [[String: Any]]) -> FatalProblem? {
        for r in results where ["failed", "stopped"].contains(r["status"] as? String ?? "") {
            if let p = fatalProblem(r["reason"] as? String ?? "") { return p }
        }
        return nil
    }

    // A classify result a problem every paper would meet stopped (not this paper's: it's tried again).
    func metFatal(_ r: [String: Any]) -> Bool {
        let st = r["status"] as? String ?? ""
        return st == "stopped" || (st == "failed" && fatalProblem(r["reason"] as? String ?? "") != nil)
    }

    // The automation waits (its time to try again not come).
    var aiOnHold: Bool { sched.hold.map { Date() < $0.until } ?? false }

    // `problem` met by what `what` names ("Prompts on new papers"): held; said unless that's said already (one job
    // beside another meets it too).
    func holdAI(_ problem: FatalProblem, _ what: String) {
        let said = aiOnHold && sched.hold?.problem.kind == problem.kind && sched.hold?.what == what
        sched.hold = (problem, what, Date().addingTimeInterval(Double(max(problem.retryMin, 1)) * 60))
        NSLog("ZoteroLauncher: AI work on hold (%@): %@", problem.kind, problem.reason)
        if !said { sayLater("\(what) stopped. \(problem.message) (\(problem.reason))") }
        refreshTasks()
    }

    // Something AI worked: nothing on hold.
    func aiWorks() {
        if sched.hold != nil { sched.hold = nil; refreshTasks() }
    }

    // For Processes: what's on hold, and why (while it is).
    var holdTask: [String: Any]? {
        guard aiOnHold, let h = sched.hold else { return nil }
        let at = DateFormatter.localizedString(from: h.until, dateStyle: .none, timeStyle: .short)
        return ["id": "pending:hold", "status": "pending", "title": "AI work on hold", "paper": "", "detail": h.problem.message + " · tried again at " + at]
    }
}
