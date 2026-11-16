import SwiftUI

// The bars above the list (LauncherView.swift is the card): a paper's taxonomy strip, and the breadcrumb.

// A paper's taxonomy labels under the context bar (Views.taxonomyStrip): a pill each, a click opens its papers;
// then a word on them (tagging…, out of date, not tagged yet). They wrap onto more lines when they don't fit.
struct TaxonomyStrip: View {
    let model: LauncherModel
    let strip: [String: Any]
    let items: [[String: Any]]

    var body: some View {
        FlowLayout(spacing: 6, lineSpacing: 4) {
            Text("Taxonomies").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            ForEach(Array(items.enumerated()), id: \.offset) { _, t in
                TaxonomyGroup(model: model, name: t["name"] as? String ?? "", prefix: t["prefix"] as? String ?? "", labels: t["labels"] as? [String] ?? [])
            }
            if let note = strip["note"] as? String, !note.isEmpty { Text(note).font(.caption).foregroundStyle(.secondary) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.top, 6)
    }
}

// One taxonomy in the strip: its name, then its labels on the paper, each a click away from its papers. (Its own
// view, typed: the strip's nested ForEach with Any lookups was too slow for CI's compiler to type-check.) The name
// goes with the first label, so a line never ends on a name; the other labels wrap one by one.
struct TaxonomyGroup: View {
    let model: LauncherModel
    let name: String
    let prefix: String
    let labels: [String]
    var caption: String? = nil // "Taxonomies", glued to the first group so a line never ends on it

    var body: some View {
        HStack(spacing: 6) {
            if let caption { Text(caption).font(.caption.weight(.semibold)).foregroundStyle(.secondary) }
            Text(name).font(.caption).foregroundStyle(.secondary).padding(.leading, 4)
            if let first = labels.first { pill(first) }
        }
        ForEach(Array(labels.dropFirst().enumerated()), id: \.offset) { _, label in
            pill(label)
        }
    }

    private func pill(_ label: String) -> some View {
        let tag: String = prefix + label
        let help: String = "\(name): \(tag) · its papers"
        return PillView(text: label, selected: false, mode: "tag", kind: "taxonomy")
            .onTapGesture { model.openTaggedPapers(tag) }
            .onHover { inside in if inside { NSCursor.pointingHand.push() } else { NSCursor.pop() } }
            .help(help)
            .accessibilityLabel("\(name): \(label)")
            .accessibilityAddTraits(.isButton)
    }
}

// The breadcrumb (above the search box, below the top level): where you came from, then where you are, in bold.
// A click on an earlier level goes back there; a long path keeps its first level and its last ones. A path too wide
// for one line goes on onto a second (each level with the › before it), where you are taking up to two lines itself.
// In a paper's menu (`venue` set) the paper is a heading: on its own line under the path, no › before it, and where it
// was published under it.
struct BreadcrumbBar: View {
    let crumbs: [String]
    var venue: String? = nil
    let jump: (Int) -> Void
    static let shown = 5

    var body: some View {
        let names = Breadcrumb.fit(crumbs, max: Self.shown)
        // (each shown name's level, nil for "…")
        let levels: [Int?] = crumbs.count > Self.shown ? [0, nil] + Array(crumbs.count - (Self.shown - 2) ..< crumbs.count) : Array(crumbs.indices)
        let path: Int = venue == nil ? names.count : names.count - 1 // (a heading: the last name goes under the path)
        let published: String = venue.map { $0.isEmpty ? "" : ", in " + $0 } ?? ""
        VStack(alignment: .leading, spacing: 2) {
            FlowLayout(spacing: 4, lineSpacing: 2) {
                ForEach(Array(names.prefix(path).enumerated()), id: \.offset) { i, name in
                    HStack(spacing: 4) {
                        if i > 0 { Text("›").font(.callout).foregroundStyle(.tertiary) }
                        crumb(name, level: levels[i], last: i == names.count - 1)
                    }
                }
            }
            if let venue, let title = names.last {
                crumb(title, level: nil, last: true)
                if !venue.isEmpty {
                    Text(venue).font(.callout).italic().foregroundStyle(.secondary).lineLimit(1).truncationMode(.tail).help(venue)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Path: " + crumbs.joined(separator: ", ") + published)
        .accessibilityActions {
            ForEach(Array(crumbs.dropLast().enumerated()), id: \.offset) { i, name in
                Button("Back to " + name) { jump(i) }
            }
        }
    }

    @ViewBuilder private func crumb(_ name: String, level: Int?, last: Bool) -> some View {
        if last {
            Text(name).font(.callout.weight(.semibold)).lineLimit(2).truncationMode(.middle)
        } else if let level {
            Text(name).font(.callout).foregroundStyle(.secondary).lineLimit(1).truncationMode(.tail)
                .onTapGesture { jump(level) }
                // (set, not pushed: a click can take the crumb away before the pointer leaves it)
                .onContinuousHover { phase in if case .active = phase { NSCursor.pointingHand.set() } else { NSCursor.arrow.set() } }
                .help("Back to " + name)
        } else {
            Text(name).font(.callout).foregroundStyle(.tertiary)
        }
    }
}

// The header's pin: pinned, the launcher stays open while you use other apps, and esc doesn't close it.
struct PinButton: View {
    let pinned: Bool
    let tap: () -> Void
    @Environment(\.palette) private var palette

    var body: some View {
        Button(action: tap) {
            Image(systemName: pinned ? "pin.fill" : "pin").font(.callout).foregroundStyle(pinned ? palette.accent : palette.subtext)
                .rotationEffect(.degrees(pinned ? 0 : 45)).frame(width: 20, height: 22).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(pinned ? "Pinned: it stays open over other apps; esc doesn't close it (⌘W does). Click to unpin" : "Pin it: it stays open while you use other apps")
        .accessibilityLabel(pinned ? "Unpin the launcher" : "Pin the launcher open")
    }
}

// ⌘T as a button, beside the pin: what the results list, as a review table in its own window.
struct ReviewTableButton: View {
    let tap: () -> Void

    var body: some View {
        Button(action: tap) {
            Image(systemName: "tablecells").font(.callout).foregroundStyle(.secondary)
                .frame(width: 20, height: 22).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help("Open the results as a review table (⌘T)")
        .accessibilityLabel("Open the results as a review table")
    }
}

// Processes' pills (R15): every state, or one (a click), each with its count; the one shown filled.
struct ProcessFilterBar: View {
    @ObservedObject var model: LauncherModel

    var body: some View {
        HStack(spacing: 6) {
            ForEach(model.processFilters, id: \.id) { f in
                BadgeChip(name: f.label + " " + String(f.count), id: f.id, active: model.ai.taskFilter == f.id) { model.setProcessFilter(f.id) }
                    .opacity(f.count == 0 && !f.id.isEmpty ? 0.45 : 1)
                    .accessibilityLabel("\(f.label): \(f.count)")
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }
}


// The reader's header (a note read in the launcher), compact: one line for the way back, where you came from, the chat
// beside the note (⌥⌘C) and the pin; the note's own title as the heading, its date on the same line; then the paper's
// facts in one wrapping flow (its ranks, status and task, then its taxonomies). The reader has no search box (nothing
// is typed there; the footer has its keys). Spans the note and the chat beside it.
struct NoteHeader: View {
    @ObservedObject var model: LauncherModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            NotePathRow(model: model)
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(model.noteHeading)
                    .font(.title3.weight(.semibold))
                    .lineLimit(2).truncationMode(.tail)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .help(model.noteParts.title)
                    .accessibilityAddTraits(.isHeader)
                Text(model.countText).font(.caption).monospacedDigit().foregroundStyle(.secondary).lineLimit(1).fixedSize()
            }
            .padding(.top, 2)
            PaperFacts(model: model).padding(.top, 6)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// The path line: back, where you came from (cut to fit: the paper's title first, then the first level into ···, then
// the paper's cite), then icons only (nothing on the right can squeeze the path).
struct NotePathRow: View {
    @ObservedObject var model: LauncherModel
    @Environment(\.palette) private var palette

    var body: some View {
        let path: NotePath = model.notePath
        let all: [NotePath.Crumb] = [path.first].compactMap { $0 } + path.hidden + path.tail
        let spoken: String = "Path: " + all.map { $0.name }.joined(separator: ", ")
        HStack(spacing: 6) {
            Button { model.back() } label: {
                Image(systemName: "chevron.left").font(.title3.weight(.medium)).foregroundStyle(.secondary)
                    .frame(width: 22, height: 24).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("Back (esc)")
            .accessibilityLabel("Back")
            ViewThatFits(in: .horizontal) {
                line(path, first: true, cut: false)
                line(path, first: false, cut: false)
                line(path, first: false, cut: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(spoken)
            .accessibilityActions {
                ForEach(Array(all.enumerated()), id: \.offset) { _, c in
                    if let level = c.level { Button("Back to " + c.name) { model.jumpToCrumb(level) } }
                }
            }
            HStack(spacing: 4) {
                chatToggle
                PinButton(pinned: model.pinnedOpen) { model.pinnedOpen.toggle() }
            }
            .fixedSize()
            .padding(.leading, 2)
        }
        .frame(height: 24)
    }

    // One way to draw the path: with its first level shown or in the menu; the last crumb whole, or cut to fit.
    @ViewBuilder private func line(_ path: NotePath, first: Bool, cut: Bool) -> some View {
        let menu: [NotePath.Crumb] = (first ? [] : [path.first].compactMap { $0 }) + path.hidden + (cut ? Array(path.tail.dropLast()) : [])
        let shown: [NotePath.Crumb] = cut ? Array(path.tail.suffix(1)) : path.tail
        HStack(spacing: 4) {
            if first, let f = path.first { crumb(f, shortTo: 28) }
            if !menu.isEmpty {
                if first && path.first != nil { separator }
                earlier(menu)
            }
            let lead: Bool = (first && path.first != nil) || !menu.isEmpty // (something before the tail: a › before it)
            ForEach(Array(shown.enumerated()), id: \.offset) { i, c in
                if i > 0 || lead { separator }
                if cut && i == shown.count - 1 {
                    crumbText(c).lineLimit(1).truncationMode(.tail)
                } else {
                    crumb(c, shortTo: 48)
                }
            }
            if !path.paperTitle.isEmpty {
                Text(" · " + path.paperTitle).font(.callout).foregroundStyle(.tertiary).lineLimit(1).truncationMode(.tail)
                    .frame(minWidth: 0, idealWidth: 0, maxWidth: .infinity, alignment: .leading)
                    .help(path.paperTitle)
            }
        }
    }

    private var separator: some View { Text("›").font(.callout).foregroundStyle(.tertiary) }

    private func crumb(_ c: NotePath.Crumb, shortTo max: Int) -> some View {
        crumbText(NotePath.Crumb(name: NotePath.short(c.name, max: max), level: c.level), help: c.name).lineLimit(1).fixedSize()
    }

    @ViewBuilder private func crumbText(_ c: NotePath.Crumb, help: String? = nil) -> some View {
        if let level = c.level {
            Text(c.name).font(.callout).foregroundStyle(.secondary)
                .onTapGesture { model.jumpToCrumb(level) }
                .onContinuousHover { phase in if case .active = phase { NSCursor.pointingHand.set() } else { NSCursor.arrow.set() } }
                .help("Back to " + (help ?? c.name))
        } else {
            Text(c.name).font(.callout).foregroundStyle(.secondary).help("The note's paper: " + (help ?? c.name))
        }
    }

    // The levels between, oldest first, each a way back.
    private func earlier(_ crumbs: [NotePath.Crumb]) -> some View {
        Menu {
            ForEach(Array(crumbs.enumerated()), id: \.offset) { _, c in
                if let level = c.level { Button("Back to " + NotePath.short(c.name, max: 48)) { model.jumpToCrumb(level) } }
            }
        } label: {
            Image(systemName: "ellipsis").font(.caption.weight(.bold)).foregroundStyle(.secondary)
                .frame(width: 22, height: 16)
                .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(palette.subtext.opacity(0.16)))
        }
        .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize()
        .help("Earlier levels")
        .accessibilityLabel("Earlier levels")
    }

    // The chat beside the note: on, a filled bubble on a filled square (two shapes, not a colour).
    private var chatToggle: some View {
        let on = model.noteChatVisible
        let none = model.notePaper == nil ? "This note isn't on a paper: nothing to chat about"
            : !model.runnerInstalled ? "Chat needs the AI features: Settings › Setup installs them" : nil
        return Button { model.toggleNoteChat() } label: {
            Image(systemName: on ? "bubble.left.fill" : "bubble.left")
                .font(.callout)
                .foregroundStyle(on ? palette.text : palette.subtext)
                .frame(width: 22, height: 22)
                .background(RoundedRectangle(cornerRadius: 5, style: .continuous).fill(on ? palette.subtext.opacity(0.28) : .clear))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(none != nil && !on)
        .opacity(none != nil && !on ? 0.45 : 1)
        .help(none ?? (on ? "Hide the chat (⌥⌘C)" : "Chat beside the note (c, ⌥⌘C)"))
        .accessibilityLabel(on ? "Hide the chat beside the note" : "Show the chat beside the note")
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

// A paper's facts in one flow: its ranks, its status and default task (menus: a click changes them, as ⌥→← and ⇧⌥→←
// do), then its taxonomies (the caption glued to the first group), then a word on them (tagging…).
struct PaperFacts: View {
    @ObservedObject var model: LauncherModel

    var body: some View {
        let strip = model.taxonomyStrip
        let items: [[String: Any]] = strip?["items"] as? [[String: Any]] ?? []
        let note: String = strip?["note"] as? String ?? ""
        FlowLayout(spacing: 6, lineSpacing: 4) {
            ForEach(model.menuRanks, id: \.self) { PillView(text: $0, selected: false, kind: "rank") }
            if let status = model.headerStatus { StatusMenuPill(model: model, status: status) }
            if let task = model.headerTask { TaskMenuPill(model: model, task: task) }
            ForEach(Array(items.enumerated()), id: \.offset) { i, t in
                TaxonomyGroup(model: model, name: t["name"] as? String ?? "", prefix: t["prefix"] as? String ?? "", labels: t["labels"] as? [String] ?? [],
                              caption: i == 0 ? "Taxonomies" : nil)
            }
            if !note.isEmpty {
                Text((items.isEmpty ? "Taxonomies " : "") + note).font(.caption).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// The paper's status as a pill that opens a menu (its chevron says so: a shape, not a colour).
struct StatusMenuPill: View {
    let model: LauncherModel
    let status: String

    var body: some View {
        Menu {
            Section("Status (⌥→←)") {
                ForEach(model.paperStatuses, id: \.self) { s in
                    Button { model.setPaperStatus(tag: "s/" + s) } label: {
                        if s.lowercased() == status.lowercased() { Label(s, systemImage: "checkmark") } else { Text(s) }
                    }
                }
            }
            Divider()
            Button { model.setPaperStatus(tag: "") } label: {
                if status.isEmpty { Label("No status", systemImage: "checkmark") } else { Text("No status") }
            }
        } label: {
            PillView(text: status.isEmpty ? "no status" : status, selected: false, mode: status.isEmpty ? "off" : "tag", kind: "status", menu: true)
        }
        .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize()
        .help("Its status: click, or ⌥→← to change it")
        .accessibilityLabel("status: " + (status.isEmpty ? "none" : status))
    }
}

// The paper's default task, the same way (⇧⌥→←); a task is made at the status chosen when it has none.
struct TaskMenuPill: View {
    let model: LauncherModel
    let task: String

    var body: some View {
        Menu {
            Section("Default task (⇧⌥→←)") {
                ForEach(Array(model.todoStatuses.enumerated()), id: \.offset) { _, s in
                    let name = s["name"] as? String ?? ""
                    Button { model.setHeaderTask(s["id"] as? String ?? "") } label: {
                        if name.lowercased() == task.lowercased() && !task.isEmpty { Label(name, systemImage: "checkmark") } else { Text(name) }
                    }
                }
            }
        } label: {
            PillView(text: task.isEmpty ? "no task" : task, selected: false, mode: task.isEmpty ? "off" : "tag", kind: "task", menu: true)
        }
        .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize()
        .help("Its default task: click, or ⇧⌥→← to change it")
        .accessibilityLabel("task: " + (task.isEmpty ? "none" : task))
    }
}
