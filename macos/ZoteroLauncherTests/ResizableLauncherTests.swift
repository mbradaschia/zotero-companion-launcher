import SwiftUI
import XCTest
@testable import ZoteroLauncher

// The launcher resizes from its edges and corners: a titled panel, its title bar hidden (a borderless one didn't resize
// from its edges, and its clear corners let the clicks through), no smaller than its minimum, the view filling it.
// (The kept size itself isn't written here: the test host shares the app's preferences.)
@MainActor
final class ResizableLauncherTests: XCTestCase {
    func testThePanelResizesFromItsEdgesWithoutATitleBarToSee() {
        let panel = LauncherPanel(content: NSView())
        XCTAssertTrue(panel.styleMask.contains(.resizable))
        XCTAssertTrue(panel.styleMask.contains(.titled))
        XCTAssertTrue(panel.styleMask.contains(.fullSizeContentView))
        XCTAssertTrue(panel.styleMask.contains(.nonactivatingPanel))
        XCTAssertEqual(panel.titleVisibility, .hidden)
        XCTAssertTrue(panel.titlebarAppearsTransparent)
        for button in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] {
            XCTAssertEqual(panel.standardWindowButton(button)?.isHidden ?? true, true)
        }
        XCTAssertEqual(panel.contentMinSize, LauncherPanel.minSize)
        XCTAssertTrue(panel.isOpaque || panel.backgroundColor != .clear) // no clear corners to click through
        XCTAssertTrue(panel.canBecomeKey)
    }

    func testAKeptSizeBelowTheMinimumIsDropped() {
        XCTAssertNil(LauncherPanel.fitting(NSSize(width: 300, height: 200)))
        XCTAssertNil(LauncherPanel.fitting(NSSize(width: 900, height: 200)))
        XCTAssertEqual(LauncherPanel.fitting(NSSize(width: 900, height: 640)), NSSize(width: 900, height: 640))
    }

    // Drawn bigger, the launcher fills it (the list gets the room).
    func testTheViewFillsABiggerPanel() throws {
        let home = FileManager.default.temporaryDirectory.appendingPathComponent("resize-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: home) }
        let bridge = FakeBridge()
        bridge.answers["/search"] = { _ in .ok(Fixture.bridge("search-typed")) }
        let model = LauncherModel(bridge: bridge, desktop: FakeDesktop(), env: ["HOME": home.path, "hostname": "mac"], runner: FakeRunner(), fetcher: FakeFetcher())
        model.willShow()
        let view = NSHostingView(rootView: LauncherView(model: model))
        view.sizingOptions = [.minSize]
        let big = NSSize(width: 1000, height: 720)
        view.frame = NSRect(origin: .zero, size: big)
        view.layoutSubtreeIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.2))
        XCTAssertEqual(view.frame.size, big) // (SwiftUI's ideal size didn't take it back)
        if let dir = ProcessInfo.processInfo.environment["SNAPSHOT_DIR"] {
            let rep = try XCTUnwrap(view.bitmapImageRepForCachingDisplay(in: view.bounds))
            view.cacheDisplay(in: view.bounds, to: rep)
            try XCTUnwrap(rep.representation(using: .png, properties: [:])).write(to: URL(fileURLWithPath: dir).appendingPathComponent("18-resized.png"))
        }
    }
}
