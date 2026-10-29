import AppKit
import Combine
import SwiftUI

// A Spotlight-style panel: no title bar to see, floating over every Space, takes the keys without
// activating the app (the window behind keeps its place), closes when it loses them. It resizes from
// its edges and corners, as the window (W) does, and both keep the size last given either.
// (Titled, its title bar hidden and transparent, rather than borderless: a borderless panel doesn't
// resize from its edges reliably, and its clear corners let the clicks through to the app behind.)
final class LauncherPanel: NSPanel {
    static let size = NSSize(width: 720, height: 480) // the first time
    static let minSize = NSSize(width: 560, height: 360) // (the box, the hints and a few rows still fit)
    private static let sizeKey = "ZLLauncherSize"
    static var lastSize: NSSize {
        get { UserDefaults.standard.string(forKey: sizeKey).map(NSSizeFromString).flatMap(fitting) ?? size }
        set { UserDefaults.standard.set(NSStringFromSize(newValue), forKey: sizeKey) }
    }
    // A kept size, if it's one: never below the minimum (an older or edited value is dropped).
    static func fitting(_ size: NSSize) -> NSSize? { size.width >= minSize.width && size.height >= minSize.height ? size : nil }

    static let style: NSWindow.StyleMask = [.titled, .fullSizeContentView, .resizable, .nonactivatingPanel]

    init(content: NSView) {
        super.init(contentRect: NSRect(origin: .zero, size: Self.lastSize), styleMask: Self.style, backing: .buffered, defer: false)
        titleVisibility = .hidden
        titlebarAppearsTransparent = true
        for button in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] { standardWindowButton(button)?.isHidden = true }
        contentMinSize = Self.minSize
        isFloatingPanel = true
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        hidesOnDeactivate = false
        isMovableByWindowBackground = true // (dragged by its background: the header, the footer, an empty list)
        isReleasedWhenClosed = false
        backgroundColor = ThemeStore.shared.palette.ns.background // (no clear corners: every pixel of it takes the clicks)
        hasShadow = true
        contentView = content
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

// Shows and hides the launcher, gives it the keys (a local monitor: each key through the router,
// what it doesn't take goes on to the search box), and moves it into a window and back (W).
@MainActor
final class LauncherController: NSObject, NSWindowDelegate {
    // the runner with the app's environment (HOME and the rest), as the model's paths have it; in a Debug build
    // started with ZL_FIXTURES (the UI tests), the fixtures instead, in a home of its own
    let model: LauncherModel = {
        let env = ProcessInfo.processInfo.environment
        #if DEBUG
        if let dir = FixtureMode.directory(env) {
            return LauncherModel(bridge: FixtureBridge(dir: dir), env: FixtureMode.environment(base: AppPaths.environment(), syncAway: env["ZL_FIXTURES_SYNC_AWAY"] == "1"),
                                 runner: FixtureRunner(dir: dir, env: env), fetcher: URLSessionFetcher())
        }
        #endif
        return LauncherModel(runner: ProcessRunner(environment: env.merging(AppPaths.environment()) { _, b in b }), fetcher: URLSessionFetcher())
    }()
    private let noteWindows = NoteWindows()
    private let chatWindows = ChatWindows()
    private let reviewWindows = ReviewWindows()
    let reviewShelf = ReviewShelf() // (the menu bar's Review Tables)
    private var monitor: Any?
    private var windowedSink: AnyCancellable?
    private var visible = false // shown, in the panel or the window
    private var moving = false // between the panel and the window: losing the keys then isn't closing

    private lazy var hosting: NSHostingView<LauncherView> = {
        let view = NSHostingView(rootView: LauncherView(model: model))
        view.sizingOptions = [.minSize] // (SwiftUI's ideal size never snaps the panel back: you size it)
        view.safeAreaRegions = [] // (no room kept for the panel's hidden title bar: the card starts at its top edge)
        return view
    }()
    private lazy var panel: LauncherPanel = {
        let panel = LauncherPanel(content: hosting)
        panel.delegate = self
        ThemeStore.shared.adopt(panel)
        return panel
    }()
    private lazy var window: NSWindow = {
        let window = NSWindow(contentRect: NSRect(origin: .zero, size: LauncherPanel.lastSize), styleMask: [.titled, .closable, .miniaturizable, .resizable],
                              backing: .buffered, defer: false)
        window.title = "Zotero"
        window.contentMinSize = LauncherPanel.minSize
        window.collectionBehavior = [.managed, .fullScreenPrimary] // (a window like any other: it stays on its Space, a window manager tiles it, full screen)
        if !window.setFrameUsingName("ZLLauncherWindow") { window.center() } // where you (or a window manager) left it
        window.setFrameAutosaveName("ZLLauncherWindow")
        window.isReleasedWhenClosed = false
        window.delegate = self
        ThemeStore.shared.adopt(window)
        return window
    }()

    override init() {
        super.init()
        // where you are, kept for the next run (not under the tests, nor on the fixtures)
        if LauncherModel.startsAtLaunch(ProcessInfo.processInfo.environment) { model.keepSpot(in: .standard) }
        model.close = { [weak self] in self?.hide() }
        model.openWindow = { [weak self] note in
            guard let self else { return }
            self.noteWindows.show(note, launcher: self.model)
        }
        noteWindows.showMenu = { [weak self] item, select in self?.showMenu(item, select: select) }
        model.closeNoteWindow = { [weak self] key in self?.noteWindows.close(key) }
        model.openChat = { [weak self] item, session in
            guard let self else { return }
            self.chatWindows.show(item, session: session, launcher: self.model)
        }
        model.showMenuFor = { [weak self] item, select in
            self?.showMenu(["key": item.key, "libraryID": item.libraryID, "title": item.title, "itemType": item.itemType], select: select)
        }
        model.showLauncher = { [weak self] in self?.show() } // (in front, also when it was open behind the chat)
        model.chatDeleted = { [weak self] item, id in self?.chatWindows.deleted(item, id) }
        model.openReviewWindow = { [weak self] id in
            guard let self else { return }
            self.reviewWindows.show(id, launcher: self.model)
        }
        reviewShelf.read = { [weak self] in self?.model.reviewList() ?? [] }
        model.reviewsRefresh = { [weak self] in self?.reviewWindows.refreshAll() }
        windowedSink = model.$windowed.dropFirst().removeDuplicates().sink { [weak self] windowed in
            self?.place(windowed: windowed)
        }
    }

    private var current: NSWindow { model.windowed ? window : panel }

    // A review table's window (the menu bar's Review Tables), the files read first if the launcher hasn't yet.
    func openReview(_ id: String) {
        if model.paths == nil { model.loadFiles() }
        if model.tax.report == nil { model.refreshTaxonomies() } // (their columns: drawn when the report comes)
        reviewWindows.show(id, launcher: model)
    }

    func toggle() {
        guard visible else { return show() }
        // the window behind another app: brought to the front, as it was
        if model.windowed && !(window.isKeyWindow && NSApp.isActive) {
            NSApp.activate()
            return window.makeKeyAndOrderFront(nil)
        }
        hide()
    }

    func show() {
        // each opening as Settings › General › Open as a window says (W switches for this one)
        if !visible && model.windowed != model.openAsWindow { model.windowed = model.openAsWindow }
        // On the screen with the pointer, a little above the middle.
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { NSMouseInRect(mouse, $0.frame, false) } ?? NSScreen.main
        if let frame = screen?.visibleFrame, !model.windowed {
            // at the size last given it, never past the screen
            let kept = LauncherPanel.lastSize
            let size = NSSize(width: max(LauncherPanel.minSize.width, min(kept.width, frame.width)), height: max(LauncherPanel.minSize.height, min(kept.height, frame.height)))
            let y = min(frame.midY - size.height / 2 + frame.height * 0.08, frame.maxY - size.height) // (a tall one never under the menu bar)
            panel.setFrame(NSRect(origin: NSPoint(x: frame.midX - size.width / 2, y: max(frame.minY, y)), size: size), display: false)
        }
        model.willShow()
        visible = true
        startMonitor()
        if model.windowed { NSApp.activate() }
        current.makeKeyAndOrderFront(nil)
    }

    // The app brought forward (its Dock icon, ⌘Tab) with no window of its own on screen: the launcher, as the hotkey opens it.
    func showIfNothingShown() {
        guard !visible, !NSApp.windows.contains(where: { $0.isVisible && $0.styleMask.contains(.titled) }) else { return }
        show()
    }

    // From the menu bar menu: the launcher, on one of Go to's places (chats, tasks, settings, sync).
    func show(place: String) {
        if !visible { show() } else { current.makeKeyAndOrderFront(nil); NSApp.activate() }
        model.openPlace(place)
    }

    // From a note window: the launcher, on that paper's menu, with the row the window came from.
    func showMenu(_ item: [String: Any], select: [String: Any]) {
        if !visible { show() }
        let ref = PaperRef(key: item["key"] as? String ?? "", libraryID: item["libraryID"] as? Int ?? 1, title: item["title"] as? String ?? "", itemType: item["itemType"] as? String ?? "")
        let rowId = select["rowId"] as? String ?? "", noteKey = select["noteKey"] as? String
        model.enterActionsFor(ref, select: { $0.rowId == rowId && (noteKey == nil || $0.noteKey == noteKey) })
    }

    func hide() {
        visible = false
        panel.orderOut(nil)
        window.orderOut(nil)
        stopMonitor()
        model.didHide()
    }

    // W: the same view, moved between the panel and a regular window.
    private func place(windowed: Bool) {
        let from: NSWindow = windowed ? panel : window
        let to: NSWindow = windowed ? window : panel
        if to.contentView !== hosting {
            from.contentView = nil
            to.contentView = hosting
        }
        guard visible else { return } // hidden: it shows in its new place next time
        moving = true
        defer { moving = false }
        if windowed {
            window.setFrame(window.frameRect(forContentRect: panel.contentRect(forFrameRect: panel.frame)), display: false)
            NSApp.activate()
        } else {
            panel.setFrame(panel.frameRect(forContentRect: window.contentRect(forFrameRect: window.frame)), display: false) // (the size it had as a window)
        }
        from.orderOut(nil)
        to.makeKeyAndOrderFront(nil)
    }

    private func startMonitor() {
        guard monitor == nil else { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self, event.window === self.current else { return event }
            return MainActor.assumeIsolated { self.handle(event) ? nil : event }
        }
    }

    private func stopMonitor() {
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
    }

    private func handle(_ event: NSEvent) -> Bool {
        if let editor = current.firstResponder as? NSTextView {
            // an input method composing (Japanese, Chinese…): every key is the composition's
            if editor.hasMarkedText() { return false }
            // where the caret is in the search box: → at its end opens the menu, before it moves the caret
            model.store.caretBack = max(0, (editor.string as NSString).length - editor.selectedRange().upperBound)
        }
        let flags = event.modifierFlags
        // ⌘W closes the launcher as its close button does, as the hotkey opens it next time (Omarchy's Super+W; the app
        // has no menu bar of its own to do it)
        if flags.intersection([.command, .shift, .control, .option]) == .command, event.charactersIgnoringModifiers?.lowercased() == "w" {
            model.dismiss()
            return true
        }
        let key = KeyEvent(keyCode: event.keyCode, characters: event.characters, ignoringModifiers: event.charactersIgnoringModifiers,
                           shift: flags.contains(.shift), control: flags.contains(.control), option: flags.contains(.option), command: flags.contains(.command))
        return model.handle(key)
    }

    // Resized from an edge (the panel or the window): the size kept for the next opening.
    func windowDidEndLiveResize(_ notification: Notification) {
        guard let w = notification.object as? NSWindow, w === panel || w === window else { return }
        LauncherPanel.lastSize = w.contentRect(forFrameRect: w.frame).size
    }

    func windowDidResignKey(_ notification: Notification) {
        if (notification.object as? NSWindow) === panel && !model.windowed && !moving && !model.pinnedOpen { hide() } // (pinned: it stays)
    }

    // The window closed (its button, ⌘W): the launcher is dismissed, as the QML's floatWin does.
    func windowWillClose(_ notification: Notification) {
        if (notification.object as? NSWindow) === window && visible { model.dismiss() }
    }
}
