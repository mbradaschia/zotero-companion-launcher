import AppKit
import Combine
import SwiftUI

// The open review tables, one window per review: opening one that is open brings it forward. Each window is the
// grid page alone (its toolbar, panel and footer are the page's); its size is kept for the next, as a chat
// window's is. ⌘W closes it, ⌘R searches again; coming forward, it searches again too (the list is live).
@MainActor
final class ReviewWindows: NSObject, NSWindowDelegate {
    private var open: [String: (window: NSWindow, model: ReviewWindowModel, title: AnyCancellable)] = [:]
    private var monitor: Any?

    static let minSize = NSSize(width: 640, height: 420)
    static func initialSize(visible: NSRect) -> NSSize {
        NSSize(width: max(minSize.width, min(1280, (visible.width * 0.85).rounded(.down))), height: max(minSize.height, min(820, (visible.height * 0.85).rounded(.down))))
    }
    private static let sizeKey = "ZLReviewWindowSize"
    static var lastSize: NSSize? {
        get { UserDefaults.standard.string(forKey: sizeKey).map(NSSizeFromString).flatMap { $0.width >= minSize.width && $0.height >= minSize.height ? $0 : nil } }
        set { UserDefaults.standard.set(newValue.map(NSStringFromSize), forKey: sizeKey) }
    }

    var openIds: [String] { Array(open.keys) }

    // Every open table drawn again (what the launcher knows changed: the taxonomies).
    func refreshAll() { for entry in open.values { entry.model.send() } }

    func show(_ id: String, launcher: LauncherModel) {
        guard ReviewFiles.validReview(id) else { return }
        if let existing = open[id] {
            NSApp.activate()
            existing.window.makeKeyAndOrderFront(nil)
            return
        }
        let model = ReviewWindowModel(id: id, launcher: launcher)
        let size = Self.lastSize ?? Self.initialSize(visible: NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 875))
        let window = NSWindow(contentRect: NSRect(origin: .zero, size: size), styleMask: [.titled, .closable, .miniaturizable, .resizable],
                              backing: .buffered, defer: false)
        window.title = "Review · " + model.title
        window.isReleasedWhenClosed = false
        window.contentMinSize = Self.minSize
        window.contentView = NSHostingView(rootView: ReviewWebView(model: model).frame(minWidth: Self.minSize.width, minHeight: Self.minSize.height))
        ThemeStore.shared.adopt(window)
        window.delegate = self
        window.center()
        model.close = { [weak window] in window?.close() }
        model.pin = { [weak self] on in self?.pinAll(on) } // (one setting: every table's window)
        if model.pinned { window.level = .floating }
        let title = model.$title.sink { [weak window] t in window?.title = "Review · " + t }
        open[id] = (window, model, title)
        startMonitor()
        NSApp.activate()
        window.makeKeyAndOrderFront(nil)
    }

    private func pinAll(_ on: Bool) {
        for entry in open.values {
            entry.window.level = on ? .floating : .normal
            entry.model.send()
        }
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

    func windowDidBecomeKey(_ notification: Notification) {
        guard let window = notification.object as? NSWindow, let entry = open.values.first(where: { $0.window === window }) else { return }
        entry.model.becameKey()
    }

    func windowDidEndLiveResize(_ notification: Notification) {
        if let w = notification.object as? NSWindow { Self.lastSize = w.contentRect(forFrameRect: w.frame).size }
    }

    func windowWillClose(_ notification: Notification) {
        guard let window = notification.object as? NSWindow, let key = open.first(where: { $0.value.window === window })?.key else { return }
        open[key] = nil
        if open.isEmpty, let monitor {
            NSEvent.removeMonitor(monitor)
            self.monitor = nil
        }
    }
}

// The menu bar's Review Tables: the reviews by name, newest change first, read again as the menu opens.
@MainActor
final class ReviewShelf: ObservableObject {
    struct Entry: Identifiable, Equatable {
        let id: String
        let name: String
    }

    @Published private(set) var list: [Entry] = []
    var read: () -> [[String: Any]] = { [] }

    func refresh() {
        let next = read().compactMap { r -> Entry? in
            guard let id = r["id"] as? String else { return nil }
            return Entry(id: id, name: r["name"] as? String ?? id)
        }
        if next != list { list = next }
    }
}
