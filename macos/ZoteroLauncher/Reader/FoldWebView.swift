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
        view.loadHTMLString(ThemeStyle.page(Self.shell, ThemeStore.shared.palette.reviewCSS), baseURL: nil)
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
                MainActor.assumeIsolated { self?.view?.evaluateJavaScript(ThemeStyle.script(palette.reviewCSS), in: nil, in: .defaultClient) { _ in } }
            }
        }

        func load(_ data: [String: Any]) { call("FR.load", data) }
        func state(_ s: [String: Any]) { call("FR.state", s) }
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
            webView.loadHTMLString(ThemeStyle.page(FoldWebView.shell, ThemeStore.shared.palette.reviewCSS), baseURL: nil)
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
    func words(_ batch: [String: Any])
    func paper(_ o: [String: Any])
    func flash(_ text: String)
    func zoom(_ z: Double)
}
