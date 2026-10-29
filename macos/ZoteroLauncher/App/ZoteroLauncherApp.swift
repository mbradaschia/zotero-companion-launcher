import AppKit
import KeyboardShortcuts
import SwiftUI

extension KeyboardShortcuts.Name {
    // ⌃⌥Z by default: ⌘⇧Z is Redo in most apps. Rebind it in Settings.
    static let toggleLauncher = Self("toggleLauncher", default: .init(.z, modifiers: [.control, .option]))
}

@main
struct ZoteroLauncherApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        MenuBarExtra("Zotero Launcher", systemImage: "books.vertical") {
            MenuBarMenu(launcher: appDelegate.launcher, login: appDelegate.login, updates: appDelegate.updates, reviews: appDelegate.launcher.reviewShelf,
                        companion: appDelegate.companion)
        }
        Settings {
            SettingsView(model: appDelegate.launcher.model, login: appDelegate.login)
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let launcher = LauncherController()
    let login = LoginItem()
    let updates = UpdateCheck(fetcher: URLSessionFetcher())
    lazy var companion = CompanionServer(runner: launcher.model.runner)
    private var updateTimer: Timer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        Icons.registerBundledFonts()
        ThemeStore.shared.applyAppearance() // Settings › General › Light or dark, as it was left
        DockPresence.apply(launcher.model.showInDock) // (and In the Dock and ⌘Tab)
        KeyboardShortcuts.onKeyUp(for: .toggleLauncher) { [weak self] in
            MainActor.assumeIsolated { self?.launcher.toggle() }
        }
        // The UI tests (ZoteroLauncherUITests): the launcher open from the start, as the hotkey would open it; else the files
        // read (the background automation runs from now) and the catch-up's question (Settings › Defaults › When the app opens)
        if UserDefaults.standard.bool(forKey: "ZLOpenOnLaunch") { launcher.show() }
        else if LauncherModel.startsAtLaunch(ProcessInfo.processInfo.environment), NSClassFromString("XCTestCase") == nil {
            launcher.model.appLaunched()
            companion.start() // the iPad's reading companion, while the app runs (the menu bar's Reading Companion)
        }
        // GitHub's releases, once a day (the check itself skips a day already asked)
        if UpdateCheck.automatic(ProcessInfo.processInfo.environment) {
            updates.check(now: false)
            updateTimer = Timer.scheduledTimer(withTimeInterval: 3600, repeats: true) { [weak self] _ in
                MainActor.assumeIsolated { self?.updates.check(now: false) }
            }
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        companion.stop()
    }

    // Its Dock icon clicked: the launcher, unless a window of the app's is on screen (or in the Dock, which brings it back).
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if hasVisibleWindows || NSApp.windows.contains(where: \.isMiniaturized) { return true }
        launcher.showIfNothingShown()
        return false
    }

    // Switched to (⌘Tab) with nothing of it on screen: the launcher, as the hotkey opens it. A moment later, so a window the
    // app is opening (its Settings, an alert) counts.
    func applicationDidBecomeActive(_ notification: Notification) {
        guard launcher.model.showInDock else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            MainActor.assumeIsolated {
                guard NSApp.isActive, NSApp.modalWindow == nil else { return }
                self?.launcher.showIfNothingShown()
            }
        }
    }
}

// Settings › General › In the Dock and ⌘Tab (this Mac's, on until turned off): a regular app, its icon in the Dock and in
// ⌘Tab; off, an accessory (the menu bar's icon and the hotkey only). The bundle says regular (LSUIElement NO): tiling
// window managers (AeroSpace, yabai, Amethyst) decide at launch whether an app's windows are theirs to manage, and an
// app that starts as an accessory never is. Turned off, its icon shows a moment at launch.
enum DockPresence {
    static let key = "ZLShowInDock"
    static var kept: Bool { UserDefaults.standard.object(forKey: key) as? Bool ?? true }

    @MainActor
    static func keep(_ on: Bool) {
        UserDefaults.standard.set(on, forKey: key)
        apply(on)
    }

    @MainActor
    static func apply(_ on: Bool) {
        NSApp.setActivationPolicy(on ? .regular : .accessory)
    }
}
