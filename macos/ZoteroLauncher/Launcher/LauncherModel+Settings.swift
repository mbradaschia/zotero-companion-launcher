import AppKit
import Foundation

// Settings: the pages lib/Settings.js builds, their rows, and saving one value into the machine and
// shared files (ZoteroSearch.qml:3573-3810, the set-* cases 1617-1937; Service.qml's saveSettings).
extension LauncherModel {
    // The page a settings view shows ("" the root).
    var settingsPageName: String {
        switch store.view {
        case "settings": return ""
        default: return String(store.view.dropFirst("settings-".count))
        }
    }

    // ; or the Settings row: the root page, or one of its pages on top of it (Esc goes back through the root).
    func openSettings(_ page: String) {
        runnerState.autoTested = []
        store.push("settings")
        if !page.isEmpty { store.push("settings-" + page) }
        if page == "styles" { refreshStyles() }
        if page == "providers" || page == "taxonomies" { refreshTaxonomies() } // (the classifier's key, the taxonomies)
        rebuildList()
        refreshProviders()
        refreshModels()
        refreshRequirements()
        refreshRules()
        refreshPrompts() // Defaults lists them
        refreshExtractCount()
        if page == "defaults" { refreshCatchUp() }
        refreshTaxonomies()
        autoTestKeys()
    }

    func settingsRows(_ core: JSCore) throws -> [ListRow] {
        var extra: [String: Any] = ["filter": store.filterText, "provider": runnerState.provider, "modelsPath": runnerState.modelsPath, "only": runnerState.modelsOnly]
        if paths?.syncDir != nil, let machineOnly = (try? core.glueJSON("machineOnly", [])).flatMap({ try? JSONSerialization.jsonObject(with: Data($0.utf8)) }) {
            extra["machineOnly"] = machineOnly
        }
        if store.view == "settings-choice" { extra["choice"] = settingsView.choice }
        if store.view == "settings-edit" { extra["edit"] = settingsView.edit ?? [:] }
        extra["taxEdit"] = tax.edit ?? NSNull()
        extra["taxLabel"] = tax.label
        extra["taxDraft"] = tax.draft ?? NSNull()
        extra["taxProblem"] = tax.problem
        extra["taxEditId"] = tax.editId
        extra["home"] = NSHomeDirectory()
        extra["openAsWindow"] = openAsWindow
        extra["dock"] = showInDock
        extra["theme"] = themeSettings
        if let review = tax.review { extra["review"] = review }
        return try core.glue("settingsPage", [settingsPageName, settingsJSON, settingsContext, extra], as: [ListRow].self)
    }

    // Settings › General › Appearance: the theme in effect, light or dark, and the app's themes (Core/Theme.swift), each
    // with its accent as a swatch.
    var themeSettings: [String: Any] {
        let theme = ThemeStore.shared
        return ["id": theme.chosen.id, "mode": theme.chosenMode.rawValue, // (the kept one checked, not the one previewed)
                "themes": ThemeFamily.all.map { f -> [String: Any] in
                    ["id": f.id, "name": f.name, "light": f.light?.name ?? "", "dark": f.dark?.name ?? "", "swatch": Palette(f).accentHex]
                }]
    }

    // A theme or light or dark chosen (this Mac's, not the settings file's): every window redraws in it at once.
    func chooseTheme(_ path: String, _ value: String) {
        if path == "mac.themeMode" { ThemeStore.shared.setMode(ThemeMode(rawValue: value) ?? .system) } else { ThemeStore.shared.setFamily(value) }
        runnerState.index = nil // (what the search finds says the one now in effect)
    }

    // Browsing Theme's (or Light or dark's) choices: the app in the row you're on, at once; ↵ keeps it, leaving any other
    // way (esc, ⌫, closing the launcher) puts back the one you had.
    func previewTheme() {
        let theme = ThemeStore.shared
        guard store.view == "settings-choice", settingsView.choice.hasPrefix("mac.theme"), let row = selectedListRow,
              row.rowId == "set-opt", row.value == settingsView.choice else { return theme.endPreview() }
        if row.value == "mac.themeMode" { theme.preview(mode: ThemeMode(rawValue: row.tag) ?? .system) } else { theme.preview(row.tag) }
    }

    var handshakeVersion: String { (bridge as? BridgeClient)?.handshake?.bridgeVersion ?? "" }

    // One setting saved, said in the footer. → saved?
    @discardableResult
    func saveSetting(_ path: String, _ value: Any?, _ message: String) -> Bool {
        guard let core, let settings, let paths else { return false }
        if syncFolderGone {
            flashMessage("Not saved: " + syncFolderAway)
            return false
        }
        switch SettingsWriter.save(core, settings: settings, paths: paths, pathsJSON: pathsJSON, path: path, value: value) {
        case .refused(let why):
            flashMessage("Not saved: " + why)
            return false
        case .saved:
            reloadSettings()
            if !message.isEmpty { flashMessage(message) }
            if !path.hasPrefix("general.") {
                refreshProviders()
                refreshModels()
            }
            store.followTop = false
            rebuildList()
            return true
        }
    }

    func reloadSettings() {
        runnerState.index = nil
        defer { followSchedule() } // something turned on or off
        guard let core, let paths else { return }
        let next = AppSettings.load(core, paths: paths, machine: AppPaths.readJSON(paths.settings))
        settings = next
        store.searchFirst = next.searchFirst
        store.keys = KeyBuffer(delay: next.keyDelay)
        // what Bring papers up to date counts follows the settings (ZoteroSearch.qml:724)
        if opened && ["settings-defaults", "settings-auto-prompts"].contains(store.view) { refreshCatchUp() }
    }

    func toggleSetting(_ path: String) {
        // Settings › General › Open as a window: this Mac's, not the settings file's
        if path == "mac.openAsWindow" {
            openAsWindow.toggle()
            flashMessage(openAsWindow ? "On: the hotkey opens a window from now on (\(keyName("W")) switches to the overlay)" : "Off: the hotkey opens the overlay from now on")
            return
        }
        if path == "mac.dock" {
            showInDock.toggle()
            flashMessage(showInDock ? "On: the app is in the Dock and ⌘Tab" : "Off: only the menu bar's icon from now on")
            return
        }
        guard let core else { return }
        // Settings › Defaults › What it checks: a switch writes its own key of launchCatchUpWhat (the others keep following
        // their defaults)
        let what = "defaults.launchCatchUpWhat."
        if path.hasPrefix(what) {
            let next = (try? core.glueJSON("launchCatchUpToggled", [settingsJSON, ai.promptsJSON, String(path.dropFirst(what.count))]))
                .flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) }
            if let next { saveSetting("defaults.launchCatchUpWhat", next, "") }
            return
        }
        let on = (try? core.glue("settingValue", [settingsJSON, path], as: Bool.self)) ?? false
        guard saveSetting(path, !on, "") else { return }
        if path == "defaults.launchCatchUp" {
            flashMessage(on ? "Off: the app no longer asks when it opens" : "On: when the app opens" + onHost + ", it checks what needs catching up and asks first")
        }
        if path == "defaults.autoExtractNew" && !on {
            extractNewTurnedOn()
            flashMessage("On: a paper's text is extracted when its PDF arrives" + onHost + " (the ones from before: Extract every paper's text)")
        }
        if path == "defaults.autoTagNew" && !on {
            tagNewTurnedOn()
            flashMessage("On: each new paper is tagged by the taxonomies once" + onHost + " (the ones from before: Settings › Defaults › Catch up the last \(catchUpDays) \(catchUpDays == 1 ? "day" : "days"))")
        }
        // a provider or an endpoint turned on or off (ZoteroSearch.qml:3750)
        let parts = path.split(separator: ".").map(String.init)
        if parts.count == 3, ["providers", "endpoint"].contains(parts[0]), parts[2] == "enabled" {
            flashMessage(on ? "Off: its models leave the pickers" : "On")
            if !on { afterEnable(parts[1]) }
        }
    }

    func openSettingsEdit(_ path: String) {
        guard let core, let edit = (try? core.glueJSON("settingEdit", [path, settingsJSON])).flatMap({ try? JSONSerialization.jsonObject(with: Data($0.utf8)) }) as? [String: Any]
        else { return }
        settingsView.edit = edit
        store.push("settings-edit")
        store.filterText = edit["current"] as? String ?? ""
        rebuildList()
    }

    func saveSettingsEdit(_ text: String) {
        guard let edit = settingsView.edit, let core else { return }
        if saveProviderEdit(edit, text) { return }
        if saveTaxonomyEdit(edit, text) { return }
        guard let item = edit["item"] else { return }
        let parsed = (try? core.glueJSON("parseValue", [item, text])).flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) } as? [String: Any] ?? [:]
        if let error = parsed["error"] as? String { return flashMessage(error) }
        if saveSetting(edit["path"] as? String ?? "", parsed["value"], "Saved") { back() }
    }

    // The citation styles installed in Zotero (/styles), for Settings › General › Citation style.
    func refreshStyles() {
        bridge.post("/styles", [:], timeout: 8) { [weak self] result in
            MainActor.assumeIsolated {
                guard let self else { return }
                if case .ok(let answer) = result {
                    self.settingsView.styles = answer["styles"] as? [Any] ?? []
                    self.settingsView.stylesProblem = ""
                } else {
                    self.settingsView.stylesProblem = result.message
                }
                if self.store.view == "settings-styles" {
                    self.store.followTop = false
                    self.rebuildList()
                    self.selectRow { $0.checked }
                }
            }
        }
    }

    // The set-* rows (ActionMap's): what Enter does on each.
    func settingsAction(_ row: ListRow) {
        if providerAction(row) || setupAction(row) { return }
        switch row.rowId {
        case "set-nav":
            if row.value == "root" { back(); return }
            store.push("settings-" + row.value)
            if row.value == "styles" { refreshStyles() }
            if row.value == "defaults" { refreshCatchUp() }
            if row.value == "auto-prompts" || row.value == "launch-catchup" { refreshPrompts() }
            // a link that names its row ("rowId|value", the tag) lands on it, not on the page's first row
            let target = row.tag.split(separator: "|", maxSplits: 1).map(String.init)
            if let id = target.first, !id.isEmpty { navTarget = ("settings-" + row.value, id, target.count > 1 ? target[1] : "") }
            if row.value == "taxonomies" || row.value == "providers" { refreshTaxonomies() } // (the classifier is in Models & providers)
            rebuildList()
            if row.value == "providers" { refreshProviders(); refreshModels() } // (as Settings opens it: what's on now)
        case "set-toggle":
            toggleSetting(row.value)
        case "set-choice":
            settingsView.choice = row.value
            store.push("settings-choice")
            rebuildList()
            selectRow { $0.checked }
        case "set-opt":
            let path = row.value
            if path == "mac.theme" || path == "mac.themeMode" {
                chooseTheme(path, row.tag)
                back()
                selectRow { $0.rowId == "set-choice" && $0.value == path }
            } else if saveSetting(path, row.tag, "") {
                back()
                selectRow { $0.rowId == "set-choice" && $0.value == path }
            }
        case "set-edit":
            openSettingsEdit(row.value)
        case "set-save":
            saveSettingsEdit(row.value)
        case "set-styles":
            store.push("settings-styles")
            refreshStyles()
            rebuildList()
            selectRow { $0.checked }
        case "set-style-opt":
            if saveSetting("general.citationStyle", row.value == "apa" ? nil : row.value, "Citations in " + row.label) {
                back()
                selectRow { $0.rowId == "set-styles" }
            }
        case "set-link":
            if let url = URL(string: row.value), ["http", "https"].contains(url.scheme ?? "") {
                _ = desktop.open(url: url)
                flashMessage("Opened in your browser")
            }
        case "tags-status":
            openSettings(row.value)
        default:
            break
        }
    }

    // Ctrl+V / ⌘V in a page for typing: the clipboard into what you type.
    func pasteIntoFilter() {
        guard let text = desktop.pasteboardText(), !text.isEmpty else { return }
        setFilter(store.filterText + text.components(separatedBy: .newlines).joined(separator: " ").trimmingCharacters(in: .whitespaces))
    }
}
