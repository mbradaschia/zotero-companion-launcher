import AppKit
import Combine
import CryptoKit
import SwiftUI
import WebKit

// The fold reader's page (docs/fold-reader/SPEC.md 6.1 to 6.3), held as tightly as the review table's: its CSP lets
// one script run, the bundled one (FoldCore.js, FoldView.js and FoldBridge.js, allowed by their hash), images only from
// the zlfold scheme (this window's PDF pages, FoldSchemeHandler), nothing else (no network, no frames); its data store
// keeps nothing; every navigation is cancelled; it draws every value as text. It talks to the app through one message
// handler, `fold`; the app calls window.FR in the page's world.
struct FoldWebView: NSViewRepresentable {
    let model: FoldWindowModel

    static let handler = "fold"

    // The page, as the app builds it once: its style, then its script, whose hash the CSP names.
    static let shell: String = {
        func resource(_ name: String) -> String {
            Bundle.main.url(forResource: name, withExtension: nil).flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? ""
        }
        return page(css: resource("FoldReader.css"), script: script(resource))
    }()

    static func script(_ resource: (String) -> String) -> String {
        resource("FoldCore.js") + "\n" + resource("FoldView.js") + "\n" + resource("FoldBridge.js")
    }

    static func csp(script: String) -> String {
        let hash = Data(SHA256.hash(data: Data(script.utf8))).base64EncodedString()
        return "default-src 'none'; style-src 'unsafe-inline'; img-src \(FoldSchemeHandler.scheme):; script-src 'sha256-\(hash)'"
    }

    static func page(css: String, script: String) -> String {
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
            "<meta http-equiv=\"Content-Security-Policy\" content=\"\(csp(script: script))\">" +
            "<style>\(css)</style></head><body><div id=\"app\"></div><script>\(script)</script></body></html>"
    }

    func makeCoordinator() -> Coordinator { Coordinator(model: model) }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.userContentController.add(FoldWeakHandler(context.coordinator), name: Self.handler)
        config.setURLSchemeHandler(model.scheme, forURLScheme: FoldSchemeHandler.scheme)
        let view = WKWebView(frame: .zero, configuration: config)
        view.allowsLinkPreview = false
        view.allowsMagnification = false
        view.navigationDelegate = context.coordinator
        view.setAccessibilityLabel("Fold reader")
        context.coordinator.view = view
        view.pageZoom = CGFloat(FoldWindowModel.zoom)
        context.coordinator.watchTheme()
        model.page = context.coordinator
        view.loadHTMLString(ThemeStyle.page(Self.shell, FoldTheme.pageCSS(ThemeStore.shared.palette)), baseURL: nil)
        return view
    }

    func updateNSView(_ view: WKWebView, context: Context) {}

    static func dismantleNSView(_ view: WKWebView, coordinator: Coordinator) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: handler)
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler, FoldPage {
        weak var view: WKWebView?
        weak var model: FoldWindowModel?
        private var loaded = false
        private var theme: AnyCancellable?

        init(model: FoldWindowModel) { self.model = model }

        func watchTheme() {
            theme = ThemeStore.shared.$palette.dropFirst().sink { [weak self] palette in
                MainActor.assumeIsolated { self?.view?.evaluateJavaScript(ThemeStyle.script(FoldTheme.pageCSS(palette)), in: nil, in: .defaultClient) { _ in } }
            }
        }

        func load(_ data: [String: Any]) { call("FR.load", data) }
        func state(_ s: [String: Any]) { call("FR.state", s) }
        func fold(_ f: [String: Any]) { call("FR.fold", f) }
        func words(_ batch: [String: Any]) { call("FR.words", batch) }
        func paper(_ o: [String: Any]) { call("FR.paper", o) }
        func flash(_ text: String) { call("FR.flash", [text]) }
        func zoom(_ z: Double) { view?.pageZoom = CGFloat(z) }

        private func call(_ function: String, _ value: Any) {
            guard JSONSerialization.isValidJSONObject(value), let json = try? JSONSerialization.data(withJSONObject: value) else { return }
            let arg = String(decoding: json, as: UTF8.self)
            view?.evaluateJavaScript(value is [Any] ? "\(function).apply(null, \(arg))" : "\(function)(\(arg))", in: nil, in: .page) { _ in }
        }

        func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame, let body = message.body as? [String: Any] else { return }
            model?.handle(body)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            loaded = false
            webView.loadHTMLString(ThemeStyle.page(FoldWebView.shell, FoldTheme.pageCSS(ThemeStore.shared.palette)), baseURL: nil)
        }

        // Only the page itself loads; a link, a dropped file, anything else is cancelled.
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            let first = !loaded && action.navigationType == .other && (action.request.url?.absoluteString == "about:blank" || action.request.url?.scheme == nil)
            if first { loaded = true }
            decisionHandler(first ? .allow : .cancel)
        }
    }
}

// (WKUserContentController keeps its handler: this one doesn't keep the coordinator, so the window can go.)
@MainActor
final class FoldWeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) { target?.userContentController(c, didReceive: message) }
}

// What the window's model calls on its page (window.FR).
@MainActor
protocol FoldPage: AnyObject {
    func load(_ data: [String: Any])
    func state(_ s: [String: Any])
    func fold(_ f: [String: Any])
    func words(_ batch: [String: Any])
    func paper(_ o: [String: Any])
    func flash(_ text: String)
    func zoom(_ z: Double)
}

// The reader's colours in the app's theme: the review table's (reviewCSS) and, over them, its text colours nudged until
// each reads at 4.5:1 on every ground it is drawn on (the window, the selection's tint, a highlight, the header), a
// highlight from the theme's yellow, its underline at 3:1. The page's own CSS keeps tested defaults for a browser.
enum FoldTheme {
    static func colours(_ t: Tokens<RGB>, dark: Bool) -> [String: RGB] {
        let bg = t.background
        let sel = t.accent.mixed(bg, dark ? 0.78 : 0.88) // (reviewCSS's --sel)
        let hl = t.yellow.mixed(bg, dark ? 0.7 : 0.72)
        let head = t.text.mixed(bg, 1 - 0.035) // (reviewCSS's --head)
        let taxSoft = t.teal.mixed(bg, dark ? 0.78 : 0.88) // (reviewCSS's --tax-soft: a taxonomy label's pill)
        func readable(_ c: RGB, on grounds: [RGB]) -> RGB {
            var out = c
            for _ in 0..<2 { for g in grounds { out = out.readable(on: g, ratio: 4.5) } }
            return out
        }
        // Lifting a lighter line to 4.5:1 on the tints can, a twentieth at a time, carry it past the line above it: the
        // ink then goes on until it reads stronger than the muted again, as the muted does over the faint.
        func stronger(_ c: RGB, than weaker: RGB) -> RGB {
            let toward = bg.luminance > 0.5 ? RGB.black : RGB.white
            var out = c
            var step = 0
            while out.contrast(bg) <= weaker.contrast(bg) && step < 20 {
                step += 1
                out = c.mixed(toward, Double(step) / 20)
            }
            return out
        }
        let grounds = [bg, sel, hl, head]
        let faint = readable(t.subtext.mixed(bg, 0.3), on: grounds)
        let muted = stronger(readable(t.subtext, on: grounds), than: faint)
        return ["ink": stronger(readable(t.text, on: grounds), than: muted), "muted": muted, "faint": faint,
                "cite": readable(t.accent, on: grounds), "tax": readable(t.teal, on: [bg, taxSoft, head]),
                "hl": hl, "hl-line": t.yellow.readable(on: hl, ratio: 3), "sel": sel, "head": head, "tax-soft": taxSoft]
    }

    // A theme's colours for one appearance. Default's are the Mac's own, some of them translucent (the second line is
    // the label's colour at half strength): each is laid over the window's background, so the muted text stays lighter
    // than the ink (RGB(NSColor) alone keeps the colour and drops its alpha).
    static func tokens(_ palette: Palette, dark: Bool) -> Tokens<RGB> {
        var out = palette.rgb(dark: dark)
        guard palette.family.variant(dark: dark) == nil else { return out }
        (NSAppearance(named: dark ? .darkAqua : .aqua) ?? NSAppearance.currentDrawing()).performAsCurrentDrawingAppearance {
            let bg = RGB(palette.ns.background) ?? out.background
            out = palette.ns.map { color in
                guard let c = color.usingColorSpace(.sRGB) else { return bg }
                return bg.mixed(RGB(r: Double(c.redComponent), g: Double(c.greenComponent), b: Double(c.blueComponent)), Double(c.alphaComponent))
            }
            out.background = bg
        }
        return out
    }

    static func css(_ palette: Palette) -> String {
        func vars(_ dark: Bool) -> String {
            colours(tokens(palette, dark: dark), dark: dark).filter { !["sel", "head", "tax-soft"].contains($0.key) }.sorted { $0.key < $1.key }
                .map { "--\($0.key): \($0.value.hex);" }.joined(separator: " ")
        }
        return ":root { \(vars(false)) } @media (prefers-color-scheme: dark) { :root { \(vars(true)) } }"
    }

    static func pageCSS(_ palette: Palette) -> String { palette.reviewCSS + " " + css(palette) }
}
