import Foundation

// The fold reader (docs/fold-reader/SPEC.md 7.1): Read with folds on a paper's menu, v on a paper (the results' or the
// menu's). The window itself is FoldWindows' (LauncherPanel); here only which paper, and whether it can have one.
extension LauncherModel {
    // The paper whose menu is open: its reader, if its row says it can (a paper of your own library).
    func openFoldReaderForMenu() {
        guard let item = actionItem else { return }
        if let details, let core, let json = try? core.glueJSON("foldMenuRow", [details]),
           let row = (try? JSONSerialization.jsonObject(with: Data(json.utf8), options: [.fragmentsAllowed])) as? [String: Any] {
            if row["available"] as? Bool == false { return flashMessage(row["detail"] as? String ?? "Read with folds isn't available here") }
        } else if details != nil {
            return flashMessage("Read with folds is for a paper, not a note or a file")
        }
        openFoldReaderChecked(item)
    }

    // A paper's reader window, unless it isn't a paper of your own library (Zotero's user library is libraryID 1).
    func openFoldReaderChecked(_ ref: PaperRef) {
        if ["note", "attachment"].contains(ref.itemType) { return flashMessage("Read with folds is for a paper, not a note or a file") }
        if ref.libraryID != 1 { return flashMessage("Your own library's papers only, for now") }
        openFoldReader(ref)
    }
}
