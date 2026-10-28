import AppKit
import CryptoKit
import SwiftUI
import WebKit

// The review table's grid (phase 11a's design, section 3). Unlike the note and chat views (decision 5), this page runs
// its own script: a grid you resize, drag and drive by keys needs one. It is held as tightly: its CSP lets one script
// run, the bundled one (ReviewCore.js and ReviewGrid.js, allowed by their hash), and nothing else (no network, no
// images, no frames); its data store keeps nothing; every navigation is cancelled; it draws every value as text. It
// talks to the app through one message handler, `review`; the app answers with RT.load, in the page's world.
struct ReviewWebView: NSViewRepresentable {
    let model: ReviewWindowModel

    static let handler = "review"

    // The page, as the app builds it once: its style, then its script, whose hash the CSP names.
    static let shell: String = {
        func resource(_ name: String) -> String {
            Bundle.main.url(forResource: name, withExtension: nil).flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? ""
        }
        return page(css: resource("ReviewGrid.css"), script: resource("ReviewCore.js") + "\n" + resource("ReviewGrid.js"))
    }()

    static func page(css: String, script: String) -> String {
        let hash = Data(SHA256.hash(data: Data(script.utf8))).base64EncodedString()
        return "<!doctype html><html><head><meta charset=\"utf-8\">" +
            "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-\(hash)'\">" +
            "<style>\(css)</style></head><body><div id=\"app\"></div><script>\(script)</script></body></html>"
    }

    func makeCoordinator() -> Coordinator { Coordinator(model: model) }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.userContentController.add(WeakHandler(context.coordinator), name: Self.handler)
        let view = WKWebView(frame: .zero, configuration: config)
        view.allowsLinkPreview = false
        view.allowsMagnification = false
        view.navigationDelegate = context.coordinator
        view.setAccessibilityLabel("Review table")
        context.coordinator.view = view
        model.page = context.coordinator
        view.loadHTMLString(Self.shell, baseURL: nil)
        return view
    }

    func updateNSView(_ view: WKWebView, context: Context) {}

    static func dismantleNSView(_ view: WKWebView, coordinator: Coordinator) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: handler)
    }

    // (WKUserContentController keeps its handler: this one doesn't keep the coordinator, so the window can go.)
    @MainActor
    final class WeakHandler: NSObject, WKScriptMessageHandler {
        weak var target: WKScriptMessageHandler?
        init(_ target: WKScriptMessageHandler) { self.target = target }
        func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) { target?.userContentController(c, didReceive: message) }
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler, ReviewPage {
        weak var view: WKWebView?
        weak var model: ReviewWindowModel?
        private var loaded = false

        init(model: ReviewWindowModel) { self.model = model }

        // (the data as a JSON literal, run in the page's world: the app's own call, which the page's CSP doesn't stop)
        func load(_ data: [String: Any]) { call("RT.load", data) }
        func flash(_ text: String) { call("RT.flash", [text]) }
        func segments(_ text: String, _ list: [Any]) { call("RT.segments", [text, list]) }

        private func call(_ function: String, _ value: Any) {
            guard JSONSerialization.isValidJSONObject(value), let json = try? JSONSerialization.data(withJSONObject: value) else { return }
            let arg = String(decoding: json, as: UTF8.self)
            view?.evaluateJavaScript(value is [Any] ? "\(function).apply(null, \(arg))" : "\(function)(\(arg))", in: nil, in: .page) { _ in }
        }

        func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame, let body = message.body as? [String: Any] else { return }
            model?.handle(body)
        }

        // The page's process gone (memory pressure, a crash): the page again; it says it's ready, and is loaded again.
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            loaded = false
            webView.loadHTMLString(ReviewWebView.shell, baseURL: nil)
        }

        // Only the page itself loads; a link, a dropped file, anything else is cancelled.
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            let first = !loaded && action.navigationType == .other && (action.request.url?.absoluteString == "about:blank" || action.request.url?.scheme == nil)
            if first { loaded = true }
            decisionHandler(first ? .allow : .cancel)
        }
    }
}

// What the window's model calls on its page.
@MainActor
protocol ReviewPage: AnyObject {
    func load(_ data: [String: Any])
    func flash(_ text: String)
    func segments(_ text: String, _ list: [Any]) // the source box's query, read as the launcher reads it
}
