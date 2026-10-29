import AppKit
import CoreImage

// The reading companion (phase 12): your iPad's page beside Zotero, and its API, from a Node server the app runs while it
// runs (Resources/CompanionKit/macos/companion/server.mjs, laid out by scripts/companion-kit.sh), on 127.0.0.1 only.
// Tailscale brings your tailnet to it: the menu bar's Reading Companion › Show the iPad Link turns that on and shows
// the link (a QR code to scan, the link to copy). On unless turned off there; stopped when the app quits, and, the app
// gone any other way, when its stdin closes (--exit-with-stdin): no server left holding the port.
@MainActor
final class CompanionServer: ObservableObject {
    static let key = "ZLCompanionOn"
    static let port = 8787

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

    // Node looked for off the main thread (a slow shim must not freeze the app), then started.
    func start() {
        guard enabled, process == nil, state != .starting else { return }
        guard let runner, let script = Self.script, FileManager.default.fileExists(atPath: script.path) else { return state = .failed("It isn't in this build of the app") }
        state = .starting
        stopping = false
        runner.queue.async { [weak self] in
            let node = runner.findNode()
            let env = runner.environment
            DispatchQueue.main.async { MainActor.assumeIsolated { self?.launch(node: node, env: env, script: script) } }
        }
    }

    private func launch(node: ProcessRunner.Node?, env: [String: String], script: URL) {
        guard !stopping, process == nil else { return }
        guard let node else { return state = .failed("It needs Node.js 22 or newer: Settings › Setup › Install Node.js") }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: node.path)
        p.arguments = [script.path, "--port", String(Self.port), "--exit-with-stdin"]
        p.environment = env
        p.currentDirectoryURL = URL(fileURLWithPath: runner?.home ?? NSHomeDirectory())
        let pipe = Pipe()
        p.standardInput = pipe
        p.standardOutput = FileHandle.nullDevice
        p.standardError = FileHandle.nullDevice
        p.terminationHandler = { [weak self] proc in
            let status = proc.terminationStatus
            DispatchQueue.main.async { MainActor.assumeIsolated { self?.ended(proc, status: status) } }
        }
        do {
            try p.run()
        } catch {
            return state = .failed("It didn't start: \(error.localizedDescription)")
        }
        process = p
        input = pipe
        startedAt = Date()
        state = .running
    }

    // Stopped by itself: started again (a few times, waiting longer each time), unless the port is someone else's.
    private func ended(_ p: Process, status: Int32) {
        guard p === process else { return }
        process = nil
        try? input?.fileHandleForWriting.close()
        input = nil
        if stopping || !enabled { return state = .off }
        if status == 3 { return state = .failed("Port \(Self.port) is in use by another program") }
        if Date().timeIntervalSince(startedAt) > 60 { restarts = 0 }
        restarts += 1
        guard restarts <= 3 else { return state = .failed("It keeps stopping (exit \(status))") }
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
        stopping = true
        process?.terminate()
        try? input?.fileHandleForWriting.close()
        process = nil
        input = nil
        state = .off
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
            let problem = (json?["tailscale"] as? [String: Any])?["problem"] as? String ?? (r.ok ? "" : r.problem)
            Self.present(link: link, problem: problem)
        }
    }

    private static func present(link: String, problem: String) {
        let alert = NSAlert()
        if link.isEmpty {
            alert.messageText = "The iPad can't reach it yet"
            let why = (problem.isEmpty ? "Tailscale didn't give a link" : problem).trimmingCharacters(in: CharacterSet(charactersIn: ". "))
            alert.informativeText = why + ".\n\nThe companion reaches your iPad through Tailscale: install it on this Mac and on the iPad, sign in to the same account on both, and turn on HTTPS certificates in the Tailscale admin console (DNS). Then try again."
            alert.addButton(withTitle: "OK")
        } else {
            alert.messageText = "Open the reading companion on your iPad"
            alert.informativeText = "Scan this with the iPad's camera, or copy the link and open it in Safari. Then Share › Add to Home Screen.\n\nThe link holds the companion's key: keep it to your own devices."
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
