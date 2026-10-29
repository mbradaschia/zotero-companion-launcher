import AppKit
import SwiftUI
import XCTest
@testable import ZoteroLauncher

// Settings › General › Theme and Light or dark (Core/Theme.swift): Default is the Mac's own colours; every other theme
// has a light and a dark variant whose text reads; one palette reaches the review table's page too.
@MainActor
final class ThemeTests: XCTestCase {
    private var home: URL!
    private var model: LauncherModel!

    override func setUp() async throws {
        home = FileManager.default.temporaryDirectory.appendingPathComponent("theme-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        model = LauncherModel(bridge: FakeBridge(), desktop: FakeDesktop(), env: ["HOME": home.path, "hostname": "mac"], runner: FakeRunner(), fetcher: FakeFetcher())
        model.willShow()
    }

    override func tearDown() async throws {
        ThemeStore.shared.setSafe(true)
        ThemeStore.shared.setFamily("default")
        ThemeStore.shared.setMode(.system)
        try? FileManager.default.removeItem(at: home)
    }

    func testContrastIsWCAGs() {
        XCTAssertEqual(RGB.black.contrast(.white), 21, accuracy: 0.01)
        XCTAssertEqual(RGB(0x777777).contrast(.white), 4.48, accuracy: 0.01)
        XCTAssertEqual(RGB(0x1e66f5).hex, "#1e66f5")
        let nudged = RGB(0xebcb8b).readable(on: RGB(0xeceff4), ratio: 3)
        XCTAssertGreaterThanOrEqual(nudged.contrast(RGB(0xeceff4)), 3)
    }

    func testEveryThemeHasALightAndADarkVariantThatRead() {
        XCTAssertEqual(ThemeFamily.all.first?.id, "default")
        XCTAssertEqual(Set(ThemeFamily.all.map(\.id)).count, ThemeFamily.all.count, "two themes share an id")
        XCTAssertGreaterThanOrEqual(ThemeFamily.all.count, 10)
        for family in ThemeFamily.all where !family.isSystem {
            for dark in [false, true] {
                guard let variant = family.variant(dark: dark) else { return XCTFail("\(family.name) has no \(dark ? "dark" : "light") variant") }
                let t = variant.tokens
                let name = "\(family.name) (\(variant.name))"
                XCTAssertEqual(t.background.luminance < 0.4, dark, "\(name) isn't \(dark ? "dark" : "light")")
                XCTAssertGreaterThanOrEqual(t.text.contrast(t.background), 4.5, name + ": text")
                XCTAssertGreaterThanOrEqual(t.subtext.contrast(t.background), 4.5, name + ": second line")
                XCTAssertGreaterThanOrEqual(t.accent.contrast(t.background), 4.5, name + ": accent")
                XCTAssertGreaterThanOrEqual(t.onAccent.contrast(t.accent), 4.5, name + ": a selected row's text")
                for (kind, c) in [("red", t.red), ("orange", t.orange), ("yellow", t.yellow), ("green", t.green), ("teal", t.teal), ("purple", t.purple)] {
                    XCTAssertGreaterThanOrEqual(c.contrast(t.background), 3, "\(name): \(kind)")
                }
            }
        }
    }

    func testDefaultIsTheMacsOwn() {
        XCTAssertEqual(ThemeFamily.named("no-such-theme").id, "default")
        let palette = Palette(.system)
        XCTAssertTrue(palette.family.isSystem)
        XCTAssertEqual(palette.ns.accent, NSColor.controlAccentColor)
        XCTAssertEqual(palette.ns.background, NSColor.windowBackgroundColor)
        XCTAssertEqual(palette.pageCSS, "", "a note's and a chat's page keep the system's colours")
        XCTAssertEqual(ThemeStore.shared.family.id, "default", "the theme until you choose one")
        XCTAssertEqual(ThemeStore.shared.mode, .system)
        XCTAssertNil(ThemeMode.system.appearance)
        XCTAssertEqual(ThemeMode.dark.appearance?.name, .darkAqua)
    }

    // ReviewGrid.css draws with its custom properties: the theme sets every colour among them, light and dark.
    func testTheReviewTablesPageGetsEveryColour() throws {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "ReviewGrid.css", withExtension: nil))
        let css = try String(contentsOf: url, encoding: .utf8)
        let regex = try NSRegularExpression(pattern: "--([a-z0-9-]+):\\s*#")
        let names = Set(regex.matches(in: css, range: NSRange(css.startIndex..., in: css)).compactMap { Range($0.range(at: 1), in: css).map { String(css[$0]) } })
        XCTAssertTrue(names.contains("ink") && names.contains("accent"), "\(names)")
        for family in ThemeFamily.all {
            let theme = Palette(family).reviewCSS
            XCTAssertTrue(theme.contains("@media (prefers-color-scheme: dark)"), family.name)
            for name in names { XCTAssertTrue(theme.contains("--\(name): #"), "\(family.name) doesn't set --\(name)") }
        }
        let nord = Palette(.named("nord"))
        XCTAssertTrue(nord.reviewCSS.contains("--win: #eceff4;"), "Nord Light's background")
        XCTAssertTrue(nord.reviewCSS.contains("--win: #2e3440;"), "Nord's background")
        XCTAssertTrue(nord.pageCSS.contains("--zl-text: #2e3440;"))
        let page = ThemeStyle.page("<html><head><style>a{}</style></head><body></body></html>", nord.pageCSS)
        XCTAssertTrue(page.contains("<style>a{}</style><style id=\"zl-theme\">"), "after the page's own style, which it overrides")
        XCTAssertTrue(ThemeStyle.script(nord.pageCSS).contains("zl-theme"))
    }

    func testThemeAndLightOrDarkAreChosenInGeneral() throws {
        model.openSettings("general")
        let row = try XCTUnwrap(model.listRows.first { $0.value == "mac.theme" })
        XCTAssertEqual(row.section, "Appearance")
        XCTAssertEqual(row.rowId, "set-choice")
        XCTAssertTrue(row.submenu)
        XCTAssertTrue(row.detail.hasPrefix("Default · the Mac's own colours"), row.detail)
        model.store.selectedIndex = try XCTUnwrap(model.listRows.firstIndex { $0.value == "mac.theme" })
        model.execute(.activate)
        XCTAssertEqual(model.store.view, "settings-choice")
        XCTAssertEqual(model.listRows.map(\.tag), ThemeFamily.all.map(\.id))
        XCTAssertEqual(model.listRows.first { $0.checked }?.tag, "default")
        XCTAssertTrue(model.listRows.allSatisfy { StyledText.fontColor(in: $0.swatch) != nil }, "each theme shows its accent")
        model.store.selectedIndex = try XCTUnwrap(model.listRows.firstIndex { $0.tag == "nord" })
        model.execute(.activate)
        XCTAssertEqual(ThemeStore.shared.family.id, "nord")
        XCTAssertEqual(model.store.view, "settings-general", "back on the page, as a choice goes")
        let chosen = try XCTUnwrap(model.listRows.first { $0.value == "mac.theme" })
        XCTAssertEqual(chosen.detail, "Nord · Nord Light when light, Nord when dark")
        XCTAssertEqual(model.store.selectedIndex, model.listRows.firstIndex { $0.value == "mac.theme" })

        let mode = try XCTUnwrap(model.listRows.firstIndex { $0.value == "mac.themeMode" })
        XCTAssertTrue(model.listRows[mode].detail.hasPrefix("As the Mac"), model.listRows[mode].detail)
        model.store.selectedIndex = mode
        model.execute(.activate)
        XCTAssertEqual(model.listRows.map(\.tag), ["system", "light", "dark"])
        model.store.selectedIndex = try XCTUnwrap(model.listRows.firstIndex { $0.tag == "dark" })
        model.execute(.activate)
        XCTAssertEqual(ThemeStore.shared.mode, .dark)
        XCTAssertEqual(model.listRows.first { $0.value == "mac.themeMode" }?.detail, "Dark · always")
    }

    // Browsing the themes shows each at once; ↵ keeps the one you're on, esc or ⌫ (or closing the launcher) puts back yours.
    func testBrowsingTheThemesPreviewsThem() throws {
        let theme = ThemeStore.shared
        model.openSettings("general")
        func open(_ path: String) throws {
            model.store.selectedIndex = try XCTUnwrap(model.listRows.firstIndex { $0.value == path && $0.rowId == "set-choice" })
            model.execute(.activate)
            XCTAssertEqual(model.store.view, "settings-choice")
        }
        func browse(to tag: String) throws { model.store.selectedIndex = try XCTUnwrap(model.listRows.firstIndex { $0.tag == tag }) }

        try open("mac.theme")
        XCTAssertFalse(theme.previewing, "on the one you have")
        try browse(to: "nord")
        XCTAssertEqual(theme.family.id, "nord", "drawn in it, no ↵ needed")
        XCTAssertEqual(theme.chosen.id, "default", "not kept")
        XCTAssertEqual(model.listRows.first { $0.checked }?.tag, "default", "the check stays on yours")
        model.handle(KeyEvent(key: .down, text: ""))
        XCTAssertEqual(theme.family.id, model.selectedListRow?.tag, "the arrows preview too")
        XCTAssertTrue(model.handle(KeyEvent(key: .escape, text: "")))
        XCTAssertEqual(model.store.view, "settings-general")
        XCTAssertEqual(theme.family.id, "default", "esc puts yours back")

        try open("mac.theme")
        try browse(to: "dracula")
        XCTAssertTrue(model.handle(KeyEvent(key: .backspace, text: "")))
        XCTAssertEqual(model.store.view, "settings-general")
        XCTAssertEqual(theme.family.id, "default", "⌫ too")

        try open("mac.theme")
        try browse(to: "gruvbox")
        model.didHide()
        XCTAssertEqual(theme.family.id, "default", "and closing the launcher")
        model.willShow()
        XCTAssertEqual(theme.family.id, "gruvbox", "back on the list: the row you're on again")
        model.execute(.activate)
        XCTAssertEqual(theme.chosen.id, "gruvbox", "↵ keeps it")
        XCTAssertFalse(theme.previewing)
        XCTAssertEqual(model.store.view, "settings-general")

        try open("mac.themeMode")
        try browse(to: "dark")
        XCTAssertEqual(theme.mode, .dark)
        XCTAssertEqual(theme.chosenMode, .system)
        XCTAssertTrue(model.handle(KeyEvent(key: .escape, text: "")))
        XCTAssertEqual(theme.mode, .system, "light or dark previews the same way")
    }

    // The launcher draws in a theme, light and dark (its rows, the search box, a selected row on the accent).
    func testTheLauncherDrawsInATheme() throws {
        ThemeStore.shared.setFamily("dracula")
        XCTAssertEqual(ThemeStore.shared.family.name, "Dracula")
        model.openSettings("general")
        for name in [NSAppearance.Name.aqua, .darkAqua] {
            let view = NSHostingView(rootView: LauncherView(model: model))
            view.appearance = NSAppearance(named: name)
            view.frame = NSRect(origin: .zero, size: LauncherPanel.size)
            view.layoutSubtreeIfNeeded()
            RunLoop.main.run(until: Date().addingTimeInterval(0.2))
            let rep = try XCTUnwrap(view.bitmapImageRepForCachingDisplay(in: view.bounds))
            view.cacheDisplay(in: view.bounds, to: rep)
            XCTAssertGreaterThan(try XCTUnwrap(rep.representation(using: .png, properties: [:])).count, 1000)
        }
    }

    // Settings › General › In the Dock and ⌘Tab: this Mac's switch, on until turned off.
    func testTheDockSwitch() throws {
        model.openSettings("general")
        let i = try XCTUnwrap(model.listRows.firstIndex { $0.value == "mac.dock" })
        XCTAssertEqual(model.listRows[i].section, "The launcher")
        XCTAssertTrue(model.listRows[i].checked, "on by default")
        XCTAssertTrue(model.listRows[i].detail.hasPrefix("On · the app has a Dock icon"), model.listRows[i].detail)
        model.store.selectedIndex = i
        model.execute(.activate)
        XCTAssertFalse(model.showInDock)
        let off = try XCTUnwrap(model.listRows.first { $0.value == "mac.dock" })
        XCTAssertFalse(off.checked)
        XCTAssertTrue(off.detail.hasPrefix("Off · only the menu bar's icon"), off.detail)
        XCTAssertTrue(model.settingsIndex.text.contains("\"value\":\"mac.dock\""), "the search finds it")
    }

    // Colour-blind safe colours (on by default): in every theme, light and dark, the five pill kinds stay apart for a
    // protanope's and a deuteranope's eye (Machado et al. 2009's simulation, CIELAB ΔE ≥ 15), and still read (3:1).
    func testTheSafeColoursKeepThePillKindsApartForAColourBlindEye() {
        let protan = Self.protan, deutan = Self.deutan
        func apart(_ t: Tokens<RGB>, _ name: String) {
            let kinds: [(String, RGB)] = [("status", t.orange), ("priority", t.red), ("rank", t.purple), ("taxonomy", t.teal), ("task", t.green)]
            let eyes: [(String, [[Double]])] = [("protanope", protan), ("deuteranope", deutan)]
            for (eye, m) in eyes {
                for i in kinds.indices { for j in kinds.indices where j > i {
                    let d: Double = Self.deltaE(Self.lab(kinds[i].1, m), Self.lab(kinds[j].1, m))
                    XCTAssertGreaterThanOrEqual(d, 15, "\(name): \(kinds[i].0) and \(kinds[j].0) look alike to a \(eye)")
                } }
            }
            for (kind, c) in kinds { XCTAssertGreaterThanOrEqual(c.contrast(t.background), 3, "\(name): \(kind)") }
        }
        for family in ThemeFamily.all {
            let palette = Palette(family, safe: true)
            if family.isSystem { // (the Mac's window background as the hues were made to read on it)
                var light = palette.rgb(dark: false), dark = palette.rgb(dark: true)
                light.background = SafeColours.lightBackground
                dark.background = SafeColours.darkBackground
                apart(light, "Default (light)")
                apart(dark, "Default (dark)")
            } else {
                apart(palette.rgb(dark: false), family.name + " (light)")
                apart(palette.rgb(dark: true), family.name + " (dark)")
            }
        }
    }

    // Machado et al. 2009's simulation (severity 1), on linear sRGB, then CIELAB (D65).
    private static let protan: [[Double]] = [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]]
    private static let deutan: [[Double]] = [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]]

    private static func linear(_ v: Double) -> Double { v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4) }

    private static func labF(_ t: Double) -> Double {
        let e: Double = 216.0 / 24389.0, k: Double = 24389.0 / 27.0
        return t > e ? cbrt(t) : (k * t + 16.0) / 116.0
    }

    private static func lab(_ c: RGB, _ m: [[Double]]) -> [Double] {
        let l: [Double] = [linear(c.r), linear(c.g), linear(c.b)]
        var s: [Double] = []
        for row in m {
            let v: Double = row[0] * l[0] + row[1] * l[1] + row[2] * l[2]
            s.append(min(1.0, max(0.0, v)))
        }
        let x: Double = 0.4124 * s[0] + 0.3576 * s[1] + 0.1805 * s[2]
        let y: Double = 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]
        let z: Double = 0.0193 * s[0] + 0.1192 * s[1] + 0.9505 * s[2]
        let fx: Double = labF(x / 0.95047), fy: Double = labF(y), fz: Double = labF(z / 1.08883)
        return [116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz)]
    }

    private static func deltaE(_ a: [Double], _ b: [Double]) -> Double {
        let d0: Double = a[0] - b[0], d1: Double = a[1] - b[1], d2: Double = a[2] - b[2]
        return (d0 * d0 + d1 * d1 + d2 * d2).squareRoot()
    }

    // On by default, a switch in General › Appearance; off, the theme's own colours.
    func testTheSafeColoursSwitch() throws {
        let theme = ThemeStore.shared
        XCTAssertTrue(theme.safe, "on until turned off")
        XCTAssertTrue(theme.palette.safe)
        theme.setFamily("catppuccin")
        XCTAssertEqual(theme.palette.rgb(dark: false).red, SafeColours.red.readable(on: RGB(0xeff1f5), ratio: 3))
        model.openSettings("general")
        let i = try XCTUnwrap(model.listRows.firstIndex { $0.value == "mac.safeColours" })
        XCTAssertEqual(model.listRows[i].section, "Appearance")
        XCTAssertTrue(model.listRows[i].checked)
        model.store.selectedIndex = i
        model.execute(.activate)
        XCTAssertFalse(theme.safe)
        XCTAssertFalse(theme.palette.safe)
        XCTAssertEqual(theme.palette.rgb(dark: false).red, ThemeFamily.named("catppuccin").light?.tokens.red, "the theme's own")
        XCTAssertNotEqual(Palette(.named("catppuccin")).id, Palette(.named("catppuccin"), safe: true).id, "a field's colours drawn again")
        XCTAssertFalse(try XCTUnwrap(model.listRows.first { $0.value == "mac.safeColours" }).checked)
        theme.setSafe(true)
    }

    // Every pill kind has a symbol, so two kinds are never told apart by colour alone (the form's choices and a text with
    // its own sign excepted).
    func testEachPillKindHasItsSymbol() {
        let kinds = ["status", "task", "priority", "rank", "taxonomy"]
        let symbols = kinds.compactMap(PillView.symbol)
        XCTAssertEqual(symbols.count, kinds.count)
        XCTAssertEqual(Set(symbols).count, kinds.count, "two kinds share a symbol")
        for name in symbols { XCTAssertNotNil(NSImage(systemSymbolName: name, accessibilityDescription: nil), name) }
        XCTAssertEqual(PillView.symbol("status"), Icons.symbol(rowId: "paper-status"), "as a status's row")
        XCTAssertEqual(PillView.symbol("taxonomy"), Icons.symbol(rowId: "tag"), "as a tag's row")
        XCTAssertNil(PillView.symbol("neutral"))
        XCTAssertFalse(PillView.showsSymbol("\u{2713} text extracted"))
        XCTAssertFalse(PillView.showsSymbol("\u{26a0} taxonomies: not tagged"))
        XCTAssertTrue(PillView.showsSymbol("Reading"))
        let text = NSMutableAttributedString(string: "!a:smith")
        StyledTextField.Coordinator.apply(TextSegment(start: 0, end: 8, role: "neg", block: true), to: text)
        XCTAssertNotNil(text.attribute(.strikethroughStyle, at: 3, effectiveRange: nil), "a negated block is struck through")
    }

    func testTheSearchFindsTheTheme() {
        XCTAssertTrue(model.settingsIndex.text.contains("\"value\":\"mac.theme\""), "Go to and a menu's Settings rows find it")
        XCTAssertTrue(model.settingsIndex.text.contains("\"value\":\"mac.themeMode\""))
    }
}
