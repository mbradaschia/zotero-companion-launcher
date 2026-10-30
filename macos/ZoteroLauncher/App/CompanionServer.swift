import AppKit
import CoreImage

// The reading companion (phase 12): your iPad's page beside Zotero, and its API, from a Node server the app runs while it
// runs (Resources/CompanionKit/macos/companion/server.mjs, laid out by scripts/companion-kit.sh), on 127.0.0.1 only.
// Tailscale brings your tailnet to it: the menu bar's Reading Companion › Show the iPad Link turns that on and shows
// the link (a QR code to scan, the link to copy). On unless turned off there; stopped when the app quits, and, the app
// gone any other way, when its stdin closes (--exit-with-stdin): no server left holding the port. What it did (started,
// stopped, why) and the server's own lines (method, path, status: never what's in the library) go to
// ~/Library/Logs/ZoteroLauncher-companion.log.
@MainActor
final class CompanionServer: ObservableObject {
    static let key = "ZLCompanionOn"
    nonisolated static let port = 8787

    enum State: Equatable {
        case off, starting, running
        case failed(String)
    }

    @Published private(set) var state: State = .off
    private let runner: ProcessRunner?
    private var process: Process?
    private var input: Pipe?
    private var stopping = false
    private var restarts = 0
    private var startedAt = Date()

    static var script: URL? { Bundle.main.resourceURL?.appendingPathComponent("CompanionKit/macos/companion/server.mjs") }
    nonisolated static let logURL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/ZoteroLauncher-companion.log")
    var enabled: Bool { UserDefaults.standard.object(forKey: Self.key) as? Bool ?? true }

    init(runner: Runner) { self.runner = runner as? ProcessRunner }

    // Turned on: started a moment later (a server just stopped lets go of the port first). Turned off: stopped, and
    // Tailscale no longer serves its port (whatever listens there later isn't published to your tailnet).
    func set(_ on: Bool) {
        UserDefaults.standard.set(on, forKey: Self.key)
        if on {
            restarts = 0
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in MainActor.assumeIsolated { self?.start() } }
        } else {
            stop()
            if let runner, let script = Self.script {
                runner.run(["node", script.path, "--unshare", "--port", String(Self.port)], stdin: nil, timeout: 60) { _ in }
            }
        }
    }

    // Node looked for and the server started off the main thread: a slow shim must not freeze the app, and the main
    // thread may be held up at launch (reading the sync folder can wait on macOS asking for access to an external
    // drive), which mustn't keep the companion from starting.
    func start() {
        guard enabled, process == nil, state != .starting else { return log("start skipped: \(enabled ? "already \(state)" : "turned off")") }
        guard let runner, let script = Self.script, FileManager.default.fileExists(atPath: script.path) else { return fail("It isn't in this build of the app") }
        Self.trimLog()
        log("starting")
        state = .starting
        stopping = false
        runner.queue.async { [weak self] in
            guard let node = runner.findNode() else {
                return DispatchQueue.main.async { MainActor.assumeIsolated { self?.fail("It needs Node.js 22 or newer: Settings › Setup › Install Node.js") } }
            }
            let started = Self.spawn(node: node, env: runner.environment, home: runner.home, script: script) { proc, status in
                DispatchQueue.main.async { MainActor.assumeIsolated { self?.ended(proc, status: status) } }
            }
            DispatchQueue.main.async { MainActor.assumeIsolated { self?.launched(started, node: node) } }
        }
    }

    // The server's process, started (any thread). → the process and its stdin's pipe, or why it didn't start.
    nonisolated private static func spawn(node: ProcessRunner.Node, env: [String: String], home: String, script: URL,
                                          ended: @escaping @Sendable (Process, Int32) -> Void) -> Result<(Process, Pipe), Error> {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: node.path)
        p.arguments = [script.path, "--port", String(port), "--exit-with-stdin"]
        p.environment = env
        p.currentDirectoryURL = URL(fileURLWithPath: home)
        let pipe = Pipe()
        p.standardInput = pipe
        let out = logHandle()
        p.standardOutput = out ?? FileHandle.nullDevice
        p.standardError = out ?? FileHandle.nullDevice
        p.terminationHandler = { proc in ended(proc, proc.terminationStatus) }
        defer { try? out?.close() } // (the server has its own copy)
        do {
            try p.run()
        } catch {
            return .failure(error)
        }
        return .success((p, pipe))
    }

    private func launched(_ started: Result<(Process, Pipe), Error>, node: ProcessRunner.Node) {
        switch started {
        case .failure(let error):
            fail("It didn't start: \(error.localizedDescription)")
        case .success(let (p, pipe)):
            // Turned off (or quit) while it was starting: it goes again.
            guard !stopping, process == nil else {
                log("started, not wanted any more: stopped")
                p.terminate()
                try? pipe.fileHandleForWriting.close()
                return
            }
            log("started: \(node.path) \(node.version), pid \(p.processIdentifier)")
            process = p
            input = pipe
            startedAt = Date()
            state = .running
            if !p.isRunning { ended(p, status: p.terminationStatus) } // (gone before this was told it started)
        }
    }

    // Stopped by itself: started again (a few times, waiting longer each time). The port taken (exit 3) can be a server
    // just stopped that hasn't let go yet, so that's tried again too before it says so.
    private func ended(_ p: Process, status: Int32) {
        guard p === process else { return }
        log("ended: exit \(status)")
        process = nil
        try? input?.fileHandleForWriting.close()
        input = nil
        if stopping || !enabled { return state = .off }
        if Date().timeIntervalSince(startedAt) > 60 { restarts = 0 }
        restarts += 1
        guard restarts <= 3 else {
            return fail(status == 3 ? "Port \(Self.port) is in use by another program" : "It keeps stopping (exit \(status))")
        }
        state = .starting
        DispatchQueue.main.asyncAfter(deadline: .now() + Double(restarts * 5)) { [weak self] in
            MainActor.assumeIsolated {
                guard let self, self.state == .starting else { return }
                self.state = .off
                self.start()
            }
        }
    }

    func stop() {
        if process != nil { log("stopping") }
        stopping = true
        process?.terminate()
        try? input?.fileHandleForWriting.close()
        process = nil
        input = nil
        state = .off
    }

    private func fail(_ why: String) {
        log("failed: " + why)
        state = .failed(why)
    }

    private func log(_ line: String) {
        guard let h = Self.logHandle() else { return }
        h.write(Data("\(ISO8601DateFormatter().string(from: Date())) app: \(line)\n".utf8))
        try? h.close()
    }

    // Kept under a megabyte: past that, started again (when the server starts, so it never writes to a file gone).
    nonisolated private static func trimLog() {
        if let size = (try? FileManager.default.attributesOfItem(atPath: logURL.path))?[.size] as? Int, size > 1_000_000 { try? FileManager.default.removeItem(at: logURL) }
    }

    // The log, at its end.
    nonisolated private static func logHandle() -> FileHandle? {
        let fm = FileManager.default
        let path = logURL.path
        try? fm.createDirectory(at: logURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        if !fm.fileExists(atPath: path) { fm.createFile(atPath: path, contents: nil) }
        guard let h = FileHandle(forWritingAtPath: path) else { return nil }
        h.seekToEndOfFile()
        return h
    }

    var statusLine: String {
        switch state {
        case .off: return "Off"
        case .starting: return "Starting…"
        case .running: return "Running on this Mac"
        case .failed(let why): return why
        }
    }

    // Reading Companion › Show the iPad Link: Tailscale serving it on your tailnet (server.mjs --share), then the link
    // as a QR code to scan with the iPad's camera, and to copy.
    func showLink() {
        guard let runner, let script = Self.script else { return }
        runner.run(["node", script.path, "--share", "--port", String(Self.port)], stdin: nil, timeout: 90) { r in
            let json = r.json as? [String: Any]
            let link = json?["link"] as? String ?? ""
            let keyed = json?["keyed"] as? Bool ?? link.contains("key=")
            let problem = (json?["tailscale"] as? [String: Any])?["problem"] as? String ?? (r.ok ? "" : r.problem)
            Self.present(link: link, keyed: keyed, problem: problem)
        }
    }

    private static func present(link: String, keyed: Bool, problem: String) {
        let alert = NSAlert()
        if link.isEmpty {
            alert.messageText = "The iPad can't reach it yet"
            let why = (problem.isEmpty ? "Tailscale didn't give a link" : problem).trimmingCharacters(in: CharacterSet(charactersIn: ". "))
            alert.informativeText = why + ".\n\nThe companion reaches your iPad through Tailscale: install it on this Mac and on the iPad, sign in to the same account on both, and turn on HTTPS certificates in the Tailscale admin console (DNS). Then try again."
            alert.addButton(withTitle: "OK")
        } else {
            alert.messageText = "Open the reading companion on your iPad"
            alert.informativeText = "Scan this with the iPad's camera, or copy the link and open it in Safari. Then Share › Add to Home Screen.\n\n" +
                (keyed ? "The link holds the companion's key: keep it to your own devices." : "It opens on your devices signed in to Tailscale with this Mac's account, with nothing to type. Nobody else's device gets in.")
            alert.addButton(withTitle: "Copy the Link")
            alert.addButton(withTitle: "Done")
            if let qr = qrCode(link) {
                let view = NSImageView(frame: NSRect(x: 0, y: 0, width: 240, height: 240))
                view.image = qr
                view.imageScaling = .scaleProportionallyUpOrDown
                alert.accessoryView = view
            }
        }
        NSApp.activate(ignoringOtherApps: true)
        if alert.runModal() == .alertFirstButtonReturn, !link.isEmpty {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(link, forType: .string)
        }
    }

    static func qrCode(_ text: String) -> NSImage? {
        guard let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        filter.setValue(Data(text.utf8), forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let image = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 8, y: 8)) else { return nil }
        let rep = NSCIImageRep(ciImage: image)
        let out = NSImage(size: rep.size)
        out.addRepresentation(rep)
        return out
    }
}
