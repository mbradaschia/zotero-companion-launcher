import AppKit
import Combine
import SwiftUI

// The open fold readers, one window per paper ("<libraryID>:<KEY>"): opening one that is open brings it forward
// (docs/fold-reader/SPEC.md 7). Each window is the reader's page alone; its size is kept for the next (ZLFoldWindowSize).
// ⌘W closes it; esc never does (the page's: fold back, hide the bar).
@MainActor
final class FoldWindows: NSObject, NSWindowDelegate {
    private var open: [String: (window: NSWindow, model: FoldWindowModel, title: AnyCancellable)] = [:]
    private var monitor: Any?

    static let minSize = NSSize(width: 760, height: 480)
    static func initialSize(visible: NSRect) -> NSSize {
        NSSize(width: max(minSize.width, min(1440, (visible.width * 0.85).rounded(.down))), height: max(minSize.height, min(900, (visible.height * 0.85).rounded(.down))))
    }
    private static let sizeKey = "ZLFoldWindowSize"
    static var lastSize: NSSize? {
        get { UserDefaults.standard.string(forKey: sizeKey).map(NSSizeFromString).flatMap { $0.width >= minSize.width && $0.height >= minSize.height ? $0 : nil } }
        set { UserDefaults.standard.set(newValue.map(NSStringFromSize), forKey: sizeKey) }
    }

    var openIds: [String] { Array(open.keys) }
    func window(_ id: String) -> NSWindow? { open[id]?.window }

    func show(_ paper: PaperRef, launcher: LauncherModel) {
        guard paper.key.range(of: "^[A-Z0-9]{8}$", options: .regularExpression) != nil else { return }
        UsageLog.shared.count("window:fold-reader")
        if let existing = open[paper.id] {
            NSApp.activate()
            existing.window.makeKeyAndOrderFront(nil)
            return
        }
        let model = FoldWindowModel(paper: paper, launcher: launcher)
        let size = Self.lastSize ?? Self.initialSize(visible: NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 875))
        let window = NSWindow(contentRect: NSRect(origin: .zero, size: size), styleMask: [.titled, .closable, .miniaturizable, .resizable],
                              backing: .buffered, defer: false)
        window.title = model.title
        window.isReleasedWhenClosed = false
        window.contentMinSize = Self.minSize
        window.contentView = NSHostingView(rootView: FoldWebView(model: model).frame(minWidth: Self.minSize.width, minHeight: Self.minSize.height))
        ThemeStore.shared.adopt(window)
        window.delegate = self
        window.center()
        model.close = { [weak window] in window?.close() }
        model.zoomed = { [weak self] z in self?.zoomAll(z) }
        let title = model.$title.sink { [weak window] t in window?.title = t }
        open[paper.id] = (window, model, title)
        startMonitor()
        NSApp.activate()
        window.makeKeyAndOrderFront(nil)
    }

    private func zoomAll(_ z: Double) {
        for entry in open.values { entry.model.page?.zoom(z) }
    }

    private func startMonitor() {
        guard monitor == nil else { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            MainActor.assumeIsolated {
                guard let self, let entry = self.open.values.first(where: { $0.window === event.window }) else { return event }
                return entry.model.windowKey(event) ? nil : event
            }
        }
    }

    func windowDidEndLiveResize(_ notification: Notification) {
        if let w = notification.object as? NSWindow { Self.lastSize = w.contentRect(forFrameRect: w.frame).size }
    }

    func windowWillClose(_ notification: Notification) {
        guard let window = notification.object as? NSWindow, let key = open.first(where: { $0.value.window === window })?.key else { return }
        open[key]?.model.windowClosing()
        open[key] = nil
        if open.isEmpty, let monitor {
            NSEvent.removeMonitor(monitor)
            self.monitor = nil
        }
    }
}
