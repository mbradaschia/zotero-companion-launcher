import KeyboardShortcuts
import SwiftUI

struct SettingsView: View {
    @ObservedObject var model: LauncherModel
    @ObservedObject var login: LoginItem
    @State private var handshake = Handshake.load()
    @AppStorage(UsageLog.defaultsKey) private var countUsage = true

    var body: some View {
        Form {
            Section("Keys") {
                KeyboardShortcuts.Recorder("Open the launcher:", name: .toggleLauncher)
                Toggle("Open as a window", isOn: $model.openAsWindow)
            }
            Section("This Mac") {
                Toggle("In the Dock and ⌘Tab", isOn: $model.showInDock)
                Toggle("Open at login", isOn: Binding(get: { login.enabled }, set: { login.set($0) }))
                Text(login.detail).font(.caption).foregroundStyle(login.problem.isEmpty ? Color.secondary : Color.red)
                Toggle("Count which features I use", isOn: $countUsage)
                    .onChange(of: countUsage) { _, on in UsageLog.shared.enabled = on } // (off: what wasn't written yet is dropped)
                Text("A count a day of the keys, rows and views you use, in the sync folder's usage/ (a file per Mac). Never what you type, a paper or a tag; never sent anywhere.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            .onAppear { login.refresh() }
            Section("Zotero") {
                LabeledContent("Handshake") {
                    Text(Handshake.url().path)
                        .textSelection(.enabled)
                        .font(.caption.monospaced())
                }
                if let handshake {
                    LabeledContent("Bridge", value: "\(handshake.bridgeVersion) on port \(handshake.port)")
                    LabeledContent("Zotero", value: handshake.zoteroVersion)
                } else {
                    Text("No handshake: start Zotero, with the Zotero Omarchy Bridge plugin installed.")
                        .foregroundStyle(.secondary)
                }
                Button("Check again") { handshake = Handshake.load() }
            }
        }
        .formStyle(.grouped)
        .frame(width: 520)
        .padding()
    }
}
