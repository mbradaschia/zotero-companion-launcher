// The fold reader's extraction benchmark (scripts/fold-bench/README.md): each PDF's lines and outline as FoldPDF
// gives them on this Mac, to OUT/<name>.lines.json and OUT/<name>.outline.json.
// usage: foldlines OUT a.pdf b.pdf ...
// FOLD_OCR=1: also every page read by OCR (FoldOCR, Apple's Vision), as the reader reads a scan's, to
// OUT/<name>.ocr.json ([{n, size, lines}], the lines in FoldPDF's shape) for ocr-check.mjs.
import Foundation
import PDFKit

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: foldlines OUT a.pdf ...\n".data(using: .utf8)!)
    exit(2)
}
let out = URL(fileURLWithPath: args[1], isDirectory: true)
try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
for path in args[2...] {
    let url = URL(fileURLWithPath: path)
    let name = url.deletingPathExtension().lastPathComponent
    let pdf = FoldPDF(url: url)
    guard case .success = pdf.openNow() else { print(name, "didn't open"); continue }
    let started = Date()
    let lines = pdf.linesNow()
    let seconds = Date().timeIntervalSince(started)
    let outline = pdf.outlineNow()
    for (data, ext) in [(lines as Any, "lines"), (outline as Any, "outline")] {
        let json = try JSONSerialization.data(withJSONObject: data, options: [.sortedKeys])
        try json.write(to: out.appendingPathComponent(name + "." + ext + ".json"))
    }
    print(name, lines.count, "pages,", outline.count, "outline entries,", String(format: "%.2f s", seconds))
    if ProcessInfo.processInfo.environment["FOLD_OCR"] == "1", let doc = PDFDocument(url: url) {
        let began = Date()
        let read = pdf.ocrNow(Array(1...max(1, doc.pageCount)), into: lines)
        let pages = read.pages.filter { p in read.read.contains(p["n"] as? Int ?? 0) }
        let json = try JSONSerialization.data(withJSONObject: pages, options: [.sortedKeys])
        try json.write(to: out.appendingPathComponent(name + ".ocr.json"))
        print(name, read.read.count, "pages read by OCR,", String(format: "%.2f s", Date().timeIntervalSince(began)), read.error ?? "")
    }
}
