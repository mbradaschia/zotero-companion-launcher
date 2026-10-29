import KeyboardShortcuts
import SwiftUI

// The menu bar menu (macos/PLAN.md phase 10): the launcher (its hotkey named), its places as Go to names them, the
// reading companion (phase 12: the iPad's page, its link), the login item, updates (GitHub's releases), and Quit. The app's own Settings window (the hotkey, this Mac) is "Hotkey and Login…".
struct MenuBarMenu: View {
    let launcher: LauncherController
    @ObservedObject var login: LoginItem
    @ObservedObject var updates: UpdateCheck
    @ObservedObject var reviews: ReviewShelf
    @ObservedObject var companion: CompanionServer

    var body: some View {
        Button(openTitle) { UsageLog.shared.count("menu:open"); launcher.toggle() }
            .onAppear { reviews.refresh() } // (each time the menu opens: a review made on the other Mac shows)
        Divider()
        Menu("Review Tables") {
            if reviews.list.isEmpty { Text("None yet: ⌘T in the launcher opens its results as one") }
            ForEach(reviews.list) { r in Button(r.name) { UsageLog.shared.count("menu:review"); launcher.openReview(r.id) } }
        }
        Button("Chats…") { UsageLog.shared.count("menu:chats"); launcher.show(place: "chats") }
        Button("Processes…") { UsageLog.shared.count("menu:processes"); launcher.show(place: "tasks") }
        Button("Settings…") { UsageLog.shared.count("menu:settings"); launcher.show(place: "settings") }
        Button("Sync Zotero") { UsageLog.shared.count("menu:sync"); launcher.show(place: "sync") }
        Menu("Reading Companion") {
            Text(companion.statusLine)
            Button("Show the iPad Link…") { UsageLog.shared.count("menu:companion-link"); companion.showLink() }
                .disabled(companion.state != .running)
            Toggle("Run It With the App", isOn: Binding(get: { companion.enabled }, set: { companion.set($0) }))
        }
        Divider()
        Toggle("Open at Login", isOn: Binding(get: { login.enabled }, set: { login.set($0) }))
        if !login.problem.isEmpty || login.needsApproval { Text(login.detail) } // (a failure, said where it happened)
        OpenAppSettings() // Hotkey and Login…
        Button("Check for Updates…") { updates.checkFromMenu() }
        if let a = updates.available { Button("Update to \(a.version)…") { updates.confirmUpdate() } } // (asks first: Update / Later)
        Divider()
        Button("Quit Zotero Launcher") { NSApp.terminate(nil) }
            .keyboardShortcut("q")
            .onAppear { login.refresh() }
    }

    // "Open the Launcher  ⌃⌥Z": the hotkey as Settings has it now
    private var openTitle: String {
        guard let shortcut = KeyboardShortcuts.getShortcut(for: .toggleLauncher) else { return "Open the Launcher" }
        return "Open the Launcher  \(shortcut.description)"
    }
}

// Hotkey and Login…: the app's Settings window, in front. (SettingsLink opens it without bringing a menu bar app forward:
// it opened behind the app in front, out of sight, so the hotkey seemed impossible to change.)
struct OpenAppSettings: View {
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        Button("Hotkey and Login…") {
            NSApp.activate(ignoringOtherApps: true)
            openSettings()
            DispatchQueue.main.async { AppSettingsWindow.bringToFront() }
        }
        .keyboardShortcut(",")
    }
}

enum AppSettingsWindow {
    // SwiftUI's Settings window (its identifier names it), key and in front of every other app's windows.
    static func bringToFront() {
        NSApp.activate(ignoringOtherApps: true)
        guard let w = NSApp.windows.first(where: { $0.identifier?.rawValue.localizedCaseInsensitiveContains("settings") == true }) else { return }
        w.makeKeyAndOrderFront(nil)
        w.orderFrontRegardless()
    }
}

