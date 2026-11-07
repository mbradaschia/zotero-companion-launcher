// The fold reader's extraction benchmark (scripts/fold-bench/README.md): each PDF's lines and outline as FoldPDF
// gives them on this Mac, to OUT/<name>.lines.json and OUT/<name>.outline.json.
// usage: foldlines OUT a.pdf b.pdf ...
import Foundation

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
}
