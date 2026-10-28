import AppKit
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

    func testTheSearchFindsTheTheme() {
        XCTAssertTrue(model.settingsIndex.text.contains("\"value\":\"mac.theme\""), "Go to and a menu's Settings rows find it")
        XCTAssertTrue(model.settingsIndex.text.contains("\"value\":\"mac.themeMode\""))
    }
}
