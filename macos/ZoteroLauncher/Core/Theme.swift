import AppKit
import Combine
import SwiftUI

// The app's colours (Settings › General › Theme, this Mac's own): one palette every window draws with, the launcher's
// rows, its search box (AppKit) and the web pages (a note, a chat, a review table) alike. Default is the Mac's own (the
// system's colours and accent, as before themes); the others are well-known editor themes, each a light and a dark
// variant. Light or dark follows the Mac unless Settings › General › Light or dark says always one: that is the app's
// appearance (NSApp.appearance), so the system's controls, menus and scroll bars follow too. A variant's colours are its
// theme's published ones; one used as text is darkened (light) or lightened (dark) until it reads on the background
// (WCAG: 4.5:1 for the second line and the accent, 3:1 for the pills' colours).

// A colour in sRGB, 0…1, with WCAG's luminance and contrast.
struct RGB: Equatable {
    var r: Double
    var g: Double
    var b: Double

    init(r: Double, g: Double, b: Double) {
        self.r = r
        self.g = g
        self.b = b
    }

    init(_ hex: UInt32) {
        self.init(r: Double((hex >> 16) & 0xff) / 255, g: Double((hex >> 8) & 0xff) / 255, b: Double(hex & 0xff) / 255)
    }

    // (nil: not a colour sRGB can hold)
    init?(_ color: NSColor) {
        guard let c = color.usingColorSpace(.sRGB) else { return nil }
        self.init(r: Double(c.redComponent), g: Double(c.greenComponent), b: Double(c.blueComponent))
    }

    static let black = RGB(0x000000)
    static let white = RGB(0xffffff)

    var hex: String {
        func byte(_ v: Double) -> Int { Int((min(max(v, 0), 1) * 255).rounded()) }
        return String(format: "#%02x%02x%02x", byte(r), byte(g), byte(b))
    }

    var luminance: Double {
        func linear(_ v: Double) -> Double { v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4) }
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
    }

    func contrast(_ other: RGB) -> Double {
        let a = luminance, b = other.luminance
        return (max(a, b) + 0.05) / (min(a, b) + 0.05)
    }

    // `amount` (0…1) of `other` mixed in.
    func mixed(_ other: RGB, _ amount: Double) -> RGB {
        RGB(r: r + (other.r - r) * amount, g: g + (other.g - g) * amount, b: b + (other.b - b) * amount)
    }

    // Darkened (on a light background) or lightened (on a dark one), a twentieth at a time, until it reads at `ratio`.
    func readable(on background: RGB, ratio: Double) -> RGB {
        let toward = background.luminance > 0.5 ? RGB.black : RGB.white
        var color = self
        var step = 0
        while color.contrast(background) < ratio && step < 20 {
            step += 1
            color = mixed(toward, Double(step) / 20)
        }
        return color
    }

    var ns: NSColor { NSColor(srgbRed: r, green: g, blue: b, alpha: 1) }
}

// What every window draws with: the background, the text and its second line, the accent (a selected row, a link, a
// chosen pill) and what's written on it, and the pills' colours (status orange, priority red, rank purple, taxonomy
// teal, task green; the query's operators orange, a negation red, a quote green).
struct Tokens<C> {
    var background: C
    var text: C
    var subtext: C
    var accent: C
    var onAccent: C
    var red: C
    var orange: C
    var yellow: C
    var green: C
    var teal: C
    var purple: C

    func map<D>(_ f: (C) -> D) -> Tokens<D> {
        Tokens<D>(background: f(background), text: f(text), subtext: f(subtext), accent: f(accent), onAccent: f(onAccent), red: f(red),
                  orange: f(orange), yellow: f(yellow), green: f(green), teal: f(teal), purple: f(purple))
    }

    static func zip<A, B>(_ a: Tokens<A>, _ b: Tokens<B>, _ f: (A, B) -> C) -> Tokens<C> {
        Tokens(background: f(a.background, b.background), text: f(a.text, b.text), subtext: f(a.subtext, b.subtext), accent: f(a.accent, b.accent),
               onAccent: f(a.onAccent, b.onAccent), red: f(a.red, b.red), orange: f(a.orange, b.orange), yellow: f(a.yellow, b.yellow),
               green: f(a.green, b.green), teal: f(a.teal, b.teal), purple: f(a.purple, b.purple))
    }
}

// One variant of a theme, as its authors publish it.
struct ThemeVariant: Equatable {
    var name: String
    var background: RGB
    var text: RGB
    var subtext: RGB
    var accent: RGB
    var red: RGB
    var orange: RGB
    var yellow: RGB
    var green: RGB
    var teal: RGB
    var purple: RGB

    init(_ name: String, _ c: [UInt32]) { // background, text, subtext, accent, red, orange, yellow, green, teal, purple
        precondition(c.count == 10)
        self.name = name
        background = RGB(c[0]); text = RGB(c[1]); subtext = RGB(c[2]); accent = RGB(c[3])
        red = RGB(c[4]); orange = RGB(c[5]); yellow = RGB(c[6]); green = RGB(c[7]); teal = RGB(c[8]); purple = RGB(c[9])
    }

    // As drawn: what's text made to read on the background; on the accent, the background or the text, whichever reads better.
    var tokens: Tokens<RGB> {
        func ink(_ c: RGB) -> RGB { c.readable(on: background, ratio: 3) }
        let accent = self.accent.readable(on: background, ratio: 4.5)
        return Tokens(background: background, text: text, subtext: subtext.readable(on: background, ratio: 4.5), accent: accent,
                      onAccent: background.contrast(accent) >= text.contrast(accent) ? background : text,
                      red: ink(red), orange: ink(orange), yellow: ink(yellow), green: ink(green), teal: ink(teal), purple: ink(purple))
    }
}

// A theme: Default (the Mac's own) or a light and a dark variant.
struct ThemeFamily: Identifiable, Equatable {
    let id: String
    let name: String
    let light: ThemeVariant?
    let dark: ThemeVariant?

    var isSystem: Bool { light == nil || dark == nil }

    func variant(dark: Bool) -> ThemeVariant? { dark ? self.dark : light }

    static let system = ThemeFamily(id: "default", name: "Default", light: nil, dark: nil)

    // (their published palettes: catppuccin.com, ethanschoonover.com/solarized, github.com/morhetz/gruvbox, nordtheme.com,
    // draculatheme.com (Alucard its light one), github.com/folke/tokyonight.nvim, Atom's One, GitHub's Primer, rosepinetheme.com)
    static let all: [ThemeFamily] = [
        system,
        ThemeFamily(id: "catppuccin", name: "Catppuccin",
                    light: ThemeVariant("Latte", [0xeff1f5, 0x4c4f69, 0x6c6f85, 0x1e66f5, 0xd20f39, 0xfe640b, 0xdf8e1d, 0x40a02b, 0x179299, 0x8839ef]),
                    dark: ThemeVariant("Mocha", [0x1e1e2e, 0xcdd6f4, 0xa6adc8, 0x89b4fa, 0xf38ba8, 0xfab387, 0xf9e2af, 0xa6e3a1, 0x94e2d5, 0xcba6f7])),
        ThemeFamily(id: "solarized", name: "Solarized",
                    light: ThemeVariant("Solarized Light", [0xfdf6e3, 0x586e75, 0x657b83, 0x268bd2, 0xdc322f, 0xcb4b16, 0xb58900, 0x859900, 0x2aa198, 0x6c71c4]),
                    dark: ThemeVariant("Solarized Dark", [0x002b36, 0x93a1a1, 0x839496, 0x268bd2, 0xdc322f, 0xcb4b16, 0xb58900, 0x859900, 0x2aa198, 0x6c71c4])),
        ThemeFamily(id: "gruvbox", name: "Gruvbox",
                    light: ThemeVariant("Gruvbox Light", [0xfbf1c7, 0x3c3836, 0x7c6f64, 0x076678, 0x9d0006, 0xaf3a03, 0xb57614, 0x79740e, 0x427b58, 0x8f3f71]),
                    dark: ThemeVariant("Gruvbox Dark", [0x282828, 0xebdbb2, 0xa89984, 0x83a598, 0xfb4934, 0xfe8019, 0xfabd2f, 0xb8bb26, 0x8ec07c, 0xd3869b])),
        ThemeFamily(id: "nord", name: "Nord",
                    light: ThemeVariant("Nord Light", [0xeceff4, 0x2e3440, 0x4c566a, 0x5e81ac, 0xbf616a, 0xd08770, 0xebcb8b, 0xa3be8c, 0x8fbcbb, 0xb48ead]),
                    dark: ThemeVariant("Nord", [0x2e3440, 0xd8dee9, 0xa5abb6, 0x88c0d0, 0xbf616a, 0xd08770, 0xebcb8b, 0xa3be8c, 0x8fbcbb, 0xb48ead])),
        ThemeFamily(id: "dracula", name: "Dracula",
                    light: ThemeVariant("Alucard", [0xfffbeb, 0x1f1f1f, 0x635d97, 0x644ac9, 0xcb3a2a, 0xa34d14, 0x846e15, 0x14710a, 0x036a96, 0xa3144d]),
                    dark: ThemeVariant("Dracula", [0x282a36, 0xf8f8f2, 0x6272a4, 0xbd93f9, 0xff5555, 0xffb86c, 0xf1fa8c, 0x50fa7b, 0x8be9fd, 0xff79c6])),
        ThemeFamily(id: "tokyo-night", name: "Tokyo Night",
                    light: ThemeVariant("Tokyo Night Day", [0xe1e2e7, 0x3760bf, 0x6172b0, 0x2e7de9, 0xf52a65, 0xb15c00, 0x8c6c3e, 0x587539, 0x118c74, 0x9854f1]),
                    dark: ThemeVariant("Tokyo Night", [0x1a1b26, 0xc0caf5, 0xa9b1d6, 0x7aa2f7, 0xf7768e, 0xff9e64, 0xe0af68, 0x9ece6a, 0x73daca, 0xbb9af7])),
        ThemeFamily(id: "one", name: "One",
                    light: ThemeVariant("One Light", [0xfafafa, 0x383a42, 0x696c77, 0x4078f2, 0xe45649, 0xc18401, 0x986801, 0x50a14f, 0x0184bc, 0xa626a4]),
                    dark: ThemeVariant("One Dark", [0x282c34, 0xabb2bf, 0x7f848e, 0x61afef, 0xe06c75, 0xd19a66, 0xe5c07b, 0x98c379, 0x56b6c2, 0xc678dd])),
        ThemeFamily(id: "github", name: "GitHub",
                    light: ThemeVariant("GitHub Light", [0xffffff, 0x1f2328, 0x59636e, 0x0969da, 0xd1242f, 0xbc4c00, 0x9a6700, 0x1a7f37, 0x1b7c83, 0x8250df]),
                    dark: ThemeVariant("GitHub Dark", [0x0d1117, 0xe6edf3, 0x9198a1, 0x4493f8, 0xf85149, 0xdb6d28, 0xd29922, 0x3fb950, 0x39c5cf, 0xab7df8])),
        ThemeFamily(id: "rose-pine", name: "Rosé Pine",
                    light: ThemeVariant("Rosé Pine Dawn", [0xfaf4ed, 0x575279, 0x797593, 0x907aa9, 0xb4637a, 0xd7827e, 0xea9d34, 0x286983, 0x56949f, 0x907aa9]),
                    dark: ThemeVariant("Rosé Pine", [0x191724, 0xe0def4, 0x908caa, 0xc4a7e7, 0xeb6f92, 0xebbcba, 0xf6c177, 0x31748f, 0x9ccfd8, 0xc4a7e7])),
    ]

    // (an id this version doesn't know: Default)
    static func named(_ id: String) -> ThemeFamily { all.first { $0.id == id } ?? system }
}

// Light or dark: as the Mac says (System Settings › Appearance), or always one.
enum ThemeMode: String, CaseIterable {
    case system, light, dark

    var appearance: NSAppearance? {
        switch self {
        case .system: return nil
        case .light: return NSAppearance(named: .aqua)
        case .dark: return NSAppearance(named: .darkAqua)
        }
    }
}

// A theme as the views draw it: SwiftUI's colours (palette.accent) and AppKit's (palette.ns.accent), each following the
// window's appearance (a variant's light colours in a light window, its dark ones in a dark one).
@dynamicMemberLookup
struct Palette {
    let family: ThemeFamily
    let colors: Tokens<Color>
    let ns: Tokens<NSColor>

    subscript(dynamicMember key: KeyPath<Tokens<Color>, Color>) -> Color { colors[keyPath: key] }

    init(_ family: ThemeFamily) {
        self.family = family
        guard let light = family.light?.tokens, let dark = family.dark?.tokens else {
            // the Mac's own, exactly as the views drew before themes
            ns = Tokens(background: .windowBackgroundColor, text: .labelColor, subtext: .secondaryLabelColor, accent: .controlAccentColor, onAccent: .white,
                        red: .systemRed, orange: .systemOrange, yellow: .systemYellow, green: .systemGreen, teal: .systemTeal, purple: .systemPurple)
            colors = Tokens(background: Color(nsColor: .windowBackgroundColor), text: .primary, subtext: .secondary, accent: .accentColor, onAccent: .white,
                            red: .red, orange: .orange, yellow: .yellow, green: .green, teal: .teal, purple: .purple)
            return
        }
        let ns = Tokens<NSColor>.zip(light, dark) { l, d in
            let lc = l.ns, dc = d.ns
            return NSColor(name: nil) { $0.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? dc : lc }
        }
        self.ns = ns
        colors = ns.map { Color(nsColor: $0) }
    }

    static let system = Palette(.system)

    // The colours as hex for one appearance (the web pages', which say light and dark in their CSS).
    func rgb(dark: Bool) -> Tokens<RGB> {
        if let variant = family.variant(dark: dark) { return variant.tokens }
        var out = ns.map { _ in RGB.black }
        (NSAppearance(named: dark ? .darkAqua : .aqua) ?? NSAppearance.currentDrawing()).performAsCurrentDrawingAppearance {
            out = ns.map { RGB($0) ?? .black }
        }
        return out
    }

    // The accent's hex as the window in front draws it (lib/Views.js's colour for a match).
    @MainActor var accentHex: String {
        rgb(dark: NSApp?.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua).accent.hex
    }

    // A note's and a chat's page: the text, the links, a question's bubble (--zl-*, read with the system's colours as
    // their fallback); nothing for Default, whose pages keep the system's own (CanvasText, AccentColor).
    var pageCSS: String {
        guard !family.isSystem else { return "" }
        func vars(_ t: Tokens<RGB>) -> String {
            "--zl-text: \(t.text.hex); --zl-subtext: \(t.subtext.hex); --zl-accent: \(t.accent.hex); --zl-line: \(t.text.mixed(t.background, 0.75).hex);"
        }
        return ":root { \(vars(rgb(dark: false))) } @media (prefers-color-scheme: dark) { :root { \(vars(rgb(dark: true))) } }"
    }

    // The review table's page: every custom property ReviewGrid.css draws with, for light and for dark (Default's from
    // the system's colours, as the launcher draws).
    var reviewCSS: String {
        func vars(_ t: Tokens<RGB>, dark: Bool) -> String {
            let bg = t.background
            func soft(_ c: RGB) -> String { c.mixed(bg, dark ? 0.78 : 0.88).hex }
            func line(_ amount: Double) -> String { t.text.mixed(bg, 1 - amount).hex }
            let pairs: [(String, String)] = [
                ("ink", t.text.hex), ("muted", t.subtext.hex), ("faint", t.subtext.mixed(bg, 0.3).hex), ("line", line(0.16)), ("line2", line(0.09)),
                ("accent", t.accent.hex), ("accent-soft", soft(t.accent)), ("win", bg.hex), ("chrome", line(0.06)), ("head", line(0.035)),
                ("row-alt", line(0.018)), ("sel", soft(t.accent)),
                ("status", t.orange.hex), ("status-soft", soft(t.orange)), ("rank", t.purple.hex), ("rank-soft", soft(t.purple)),
                ("tax", t.teal.hex), ("tax-soft", soft(t.teal)), ("task", t.green.hex), ("task-soft", soft(t.green)),
                ("you", t.purple.hex), ("you-soft", soft(t.purple)), ("red", t.red.hex), ("red-soft", soft(t.red)),
                ("amber", t.yellow.hex), ("amber-soft", soft(t.yellow)), ("on-accent", t.onAccent.hex),
            ]
            return pairs.map { "--\($0.0): \($0.1);" }.joined(separator: " ")
        }
        return ":root { \(vars(rgb(dark: false), dark: false)) } @media (prefers-color-scheme: dark) { :root { \(vars(rgb(dark: true), dark: true)) } }"
    }
}

// A web page in the theme: its style, put in before the page's own head ends, and set again in place when the theme
// changes (from the app's own world: the pages' CSP and their JavaScript being off don't stop it).
enum ThemeStyle {
    static func page(_ html: String, _ css: String) -> String {
        guard let end = html.range(of: "</head>") else { return html }
        return html.replacingCharacters(in: end.lowerBound..<end.lowerBound, with: "<style id=\"zl-theme\">\(css)</style>")
    }

    static func script(_ css: String) -> String {
        let json = String(decoding: (try? JSONSerialization.data(withJSONObject: [css])) ?? Data("[\"\"]".utf8), as: UTF8.self)
        return "(function(){var s=document.getElementById('zl-theme');if(!s){s=document.createElement('style');s.id='zl-theme';document.head.appendChild(s)}" +
            "s.textContent=\(json)[0]})()"
    }
}

private struct PaletteKey: EnvironmentKey {
    static let defaultValue = Palette.system
}

extension EnvironmentValues {
    var palette: Palette {
        get { self[PaletteKey.self] }
        set { self[PaletteKey.self] = newValue }
    }
}

// The theme in effect, kept on this Mac (UserDefaults; under the tests, in memory only). A change redraws every window:
// the SwiftUI views through the environment (.themed()), the windows' own backgrounds (adopt), the web pages (their
// coordinators watch `palette`).
@MainActor
final class ThemeStore: ObservableObject {
    static let shared = ThemeStore()

    static let themeKey = "ZLTheme"
    static let modeKey = "ZLThemeMode"

    @Published private(set) var palette: Palette
    @Published private(set) var mode: ThemeMode
    private let defaults: UserDefaults?
    private let windows = NSHashTable<NSWindow>.weakObjects()

    init(defaults: UserDefaults? = LauncherModel.underTests ? nil : .standard) {
        self.defaults = defaults
        palette = Palette(.named(defaults?.string(forKey: Self.themeKey) ?? ""))
        mode = ThemeMode(rawValue: defaults?.string(forKey: Self.modeKey) ?? "") ?? .system
    }

    var family: ThemeFamily { palette.family }

    func setFamily(_ id: String) {
        let next = ThemeFamily.named(id)
        defaults?.set(next.id, forKey: Self.themeKey)
        guard next != family else { return }
        palette = Palette(next)
        restyle()
    }

    func setMode(_ next: ThemeMode) {
        defaults?.set(next.rawValue, forKey: Self.modeKey)
        guard next != mode else { return }
        mode = next
        applyAppearance()
    }

    // Light or dark for the whole app (its windows, menus, alerts); not under the tests.
    func applyAppearance() {
        guard defaults != nil else { return }
        NSApp.appearance = mode.appearance
    }

    // A window of the app's, drawn in the theme from now on: its background, and (a theme's own) its title bar in it too.
    func adopt(_ window: NSWindow) {
        windows.add(window)
        style(window)
    }

    private func restyle() {
        for window in windows.allObjects { style(window) }
    }

    private func style(_ window: NSWindow) {
        window.backgroundColor = palette.ns.background
        if !(window is NSPanel) { window.titlebarAppearsTransparent = !family.isSystem } // (the overlay's is hidden anyway)
    }
}

// A window's SwiftUI root, in the theme: the palette for its views, the text's colour (so .secondary is the theme's
// second line), and the accent for its controls.
struct Themed: ViewModifier {
    @ObservedObject var theme: ThemeStore

    func body(content: Content) -> some View {
        content
            .environment(\.palette, theme.palette)
            .foregroundStyle(theme.palette.text)
            .tint(theme.palette.accent)
    }
}

extension View {
    func themed() -> some View { modifier(Themed(theme: .shared)) }
}
