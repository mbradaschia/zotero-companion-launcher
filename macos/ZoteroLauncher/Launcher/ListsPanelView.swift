import AppKit
import SwiftUI

// The Lists panel beside the results (LauncherModel+Lists): open, its sections and their lists with their papers'
// counts; folded, the icon rail (the same in every window), each section's icon opening its lists as a pop-over. Every
// heading and list leads with its kind's symbol; the list shown is filled and bold, the row the keys are on (⌘L) is
// outlined, a favorite carries a pin: never told by colour alone.
struct ListsColumn: View {
    @ObservedObject var model: LauncherModel

    var body: some View {
        if model.listsFull { ListsPanelView(model: model) } else { ListsRailView(model: model) }
    }
}

// The symbols: a section's (lib/Sidebar.js's icon names) and a list's, by its kind.
enum ListsIcons {
    static let section: [String: String] = [
        "pin": Icons.concept["pin"] ?? "pin", "search": "magnifyingglass", "bolt": "bolt", "status": Icons.concept["status"] ?? "flag",
        "task": Icons.concept["task"] ?? "checklist", "tax": Icons.concept["tax"] ?? "tag", "collection": "folder", "tag": "number",
        "review": "tablecells", "more": "ellipsis.circle",
    ]
    static let library: [String: String] = ["lib:recent": "clock", "lib:open": "arrow.up.forward.app", "lib:pinned": "pin", "lib:unfiled": "tray", "lib:nopdf": "doc"]
    static let kind: [String: String] = [
        "search": "magnifyingglass", "status": Icons.concept["status"] ?? "flag", "taskgroup": Icons.concept["task"] ?? "checklist",
        "task": Icons.concept["task"] ?? "checklist", "taxonomy": Icons.concept["tax"] ?? "tag", "label": Icons.concept["tax"] ?? "tag",
        "collection": "folder", "tag": "number", "more": "ellipsis", "review": "tablecells", "hint": "info.circle",
        "has": "line.3.horizontal.decrease", "type": "doc", "year": "calendar",
    ]

    static func of(_ item: ListsItem) -> String {
        if item.kind == "library" { return library[item.base] ?? "bolt" }
        return kind[item.kind] ?? "list.bullet"
    }
}

// The button at the top of the panel and of the rail: folded to icons, or open (⌃⌘S).
struct ListsToggleButton: View {
    @ObservedObject var model: LauncherModel
    @Environment(\.palette) private var palette

    var body: some View {
        let open = model.listsFull
        Button { model.toggleLists() } label: {
            Image(systemName: "sidebar.left").font(.callout).foregroundStyle(palette.subtext)
                .frame(width: 28, height: 24).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(open ? "Fold the lists to icons (⌃⌘S)" : "Open the lists (⌃⌘S)")
        .accessibilityLabel(open ? "Fold the lists to icons" : "Open the lists")
    }
}

// The places that aren't lists of papers, one click away: Chats, Tasks, Processes, Settings (their keys on hover).
struct ListsPlaces: View {
    @ObservedObject var model: LauncherModel
    var all = true // (the rail: Chats and Settings only)

    private struct Place {
        let id: String // Go to's place
        let symbol: String
        let name: String
        let key: String
    }

    private static let places = [Place(id: "chats", symbol: "bubble.left", name: "Chats", key: "c"), Place(id: "todos", symbol: "checklist", name: "Tasks", key: "t"),
                                 Place(id: "tasks", symbol: "gearshape.2", name: "Processes", key: "."), Place(id: "settings", symbol: "gearshape", name: "Settings", key: ";")]

    var body: some View {
        let shown: [Place] = Self.places.filter { all || $0.id == "chats" || $0.id == "settings" }
        ForEach(shown, id: \.id) { place in
            ListsIconButton(symbol: place.symbol, help: place.name + " (" + model.keyName(place.key) + ")", label: place.name) { model.openPlace(place.id) }
        }
    }
}

struct ListsIconButton: View {
    let symbol: String
    let help: String
    let label: String
    var on = false
    let tap: () -> Void
    @Environment(\.palette) private var palette

    var body: some View {
        let traits: AccessibilityTraits = on ? [.isButton, .isSelected] : .isButton
        Button(action: tap) {
            Image(systemName: symbol).font(.callout)
                .foregroundStyle(on ? palette.onAccent : palette.subtext)
                .frame(width: 32, height: 28)
                .background(RoundedRectangle(cornerRadius: 6).fill(on ? palette.accent : Color.clear))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(help)
        .accessibilityLabel(label)
        .accessibilityAddTraits(traits)
    }
}

// Open: the heading and its toggle, the rows, the places; its right edge drags its width (180 to 320).
struct ListsPanelView: View {
    @ObservedObject var model: LauncherModel
    @Environment(\.palette) private var palette
    @State private var dragFrom: CGFloat?

    var body: some View {
        let shown = model.listsSelected
        let cursor = model.lists.focus ? model.lists.cursor : ""
        let favorites = Set(model.lists.favorites.map(\.base))
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                Text("Lists").font(.caption.weight(.semibold)).foregroundStyle(.secondary).accessibilityAddTraits(.isHeader)
                Spacer(minLength: 4)
                ListsToggleButton(model: model)
            }
            .padding(.leading, 12).padding(.trailing, 6).padding(.top, 8).padding(.bottom, 2)
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(model.lists.rows) { row in
                            ListsRowView(model: model, row: row, shown: shown, cursor: cursor, favorite: row.item.map { favorites.contains($0.base) } ?? false)
                                .id(row.key)
                        }
                        if !model.lists.problem.isEmpty {
                            Text("The lists couldn't be made: " + model.lists.problem).font(.caption).foregroundStyle(.secondary).padding(12)
                        }
                    }
                    .padding(.bottom, 6)
                }
                .onChange(of: model.lists.cursor) { _, key in if model.lists.focus && !key.isEmpty { proxy.scrollTo(key) } }
            }
            Divider()
            HStack(spacing: 2) { ListsPlaces(model: model) }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 4)
        }
        .frame(width: model.listsWidth)
        .frame(maxHeight: .infinity)
        .background(palette.subtext.opacity(0.05))
        .overlay(alignment: .trailing) {
            // its edge: drag to size it (kept on this Mac)
            Color.clear.frame(width: 6).contentShape(Rectangle())
                .onHover { inside in if inside { NSCursor.resizeLeftRight.push() } else { NSCursor.pop() } }
                .gesture(DragGesture(minimumDistance: 1, coordinateSpace: .global)
                    .onChanged { drag in
                        let from = dragFrom ?? model.listsWidth
                        if dragFrom == nil { dragFrom = from }
                        let w = from + drag.translation.width
                        model.listsWidth = min(max(w, LauncherModel.listsWidths.lowerBound), LauncherModel.listsWidths.upperBound)
                    }
                    .onEnded { _ in dragFrom = nil })
                .help("Drag to size the lists (180 to 320 points)")
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Lists")
    }
}

// A row: a section's heading (it folds), a library's name in Collections, or a list.
struct ListsRowView: View {
    @ObservedObject var model: LauncherModel
    let row: ListsRow
    let shown: String
    let cursor: String
    let favorite: Bool
    @Environment(\.palette) private var palette

    var body: some View {
        if let s = row.section {
            heading(s)
        } else if row.row == "group" {
            Text(row.label ?? "").font(.caption2.weight(.semibold)).foregroundStyle(.secondary).lineLimit(1)
                .padding(.leading, 30).padding(.top, 6).padding(.bottom, 1)
        } else if let item = row.item {
            if item.kind == "hint" {
                Text(item.label).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                    .padding(.leading, 30).padding(.trailing, 10).padding(.vertical, 3)
            } else {
                list(item)
            }
        }
    }

    private func heading(_ s: ListsSection) -> some View {
        let here = cursor == row.key
        return Button { model.toggleListsSection(s) } label: {
            HStack(spacing: 6) {
                Image(systemName: s.folded ? "chevron.right" : "chevron.down").font(.system(size: 9, weight: .semibold)).frame(width: 10)
                Image(systemName: ListsIcons.section[s.icon] ?? "list.bullet").font(.caption).frame(width: 16)
                Text(s.title).font(.caption.weight(.semibold)).lineLimit(1)
                Spacer(minLength: 0)
            }
            .foregroundStyle(palette.subtext)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(RoundedRectangle(cornerRadius: 6).stroke(here ? palette.accent : Color.clear, lineWidth: 2))
            .padding(.horizontal, 4).padding(.top, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(s.folded ? "Show " + s.title : "Fold " + s.title)
        .accessibilityLabel(s.title)
        .accessibilityValue(s.folded ? "folded" : "open")
        .accessibilityAddTraits(.isHeader)
    }

    private func list(_ item: ListsItem) -> some View {
        let on = item.base == shown && item.target != nil
        let here = cursor == row.key
        let ink: Color = on ? palette.onAccent : palette.text
        let open = item.folder && item.section != "favorites" ? model.listsFolderOpen(item) : true
        let count: String = item.count.map { $0.formatted() } ?? ""
        let papers: String = count.isEmpty ? "" : count + (item.count == 1 ? " paper" : " papers")
        let title: String = model.listTitle(item)
        let tip: String = item.target == nil ? (open ? "Fold" : "Show its lists") : papers.isEmpty ? title : title + " · " + papers
        let value: String = papers + (favorite ? (papers.isEmpty ? "a favorite" : ", a favorite") : "")
        let traits: AccessibilityTraits = on ? [.isButton, .isSelected] : .isButton
        return HStack(spacing: 6) {
            if item.folder && item.section != "favorites" {
                Button { model.toggleListsFold(item) } label: {
                    Image(systemName: open ? "chevron.down" : "chevron.right").font(.system(size: 9, weight: .semibold)).frame(width: 10, height: 16).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help(open ? "Fold" : "Show its lists")
                .accessibilityLabel(open ? "Fold " + item.label : "Show " + item.label + "'s lists")
            } else {
                Color.clear.frame(width: 10, height: 1)
            }
            Image(systemName: ListsIcons.of(item)).font(.caption).frame(width: 16)
            Text(item.label).font(.callout.weight(on ? .semibold : .regular)).lineLimit(1).truncationMode(.middle)
            if favorite && item.section != "favorites" {
                Image(systemName: "pin.fill").font(.system(size: 8)).foregroundStyle(on ? palette.onAccent : palette.subtext).accessibilityHidden(true)
            }
            Spacer(minLength: 4)
            if !count.isEmpty { Text(count).font(.caption.monospacedDigit()).foregroundStyle(on ? palette.onAccent : palette.subtext) }
        }
        .foregroundStyle(ink)
        .padding(.leading, 8 + CGFloat(min(item.depth, 6)) * 12).padding(.trailing, 8).padding(.vertical, 3)
        .background(RoundedRectangle(cornerRadius: 6).fill(on ? palette.accent : Color.clear))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(here ? palette.accent : Color.clear, lineWidth: 2))
        .padding(.horizontal, 4)
        .contentShape(Rectangle())
        .onTapGesture { model.openListItem(item) }
        .contextMenu {
            if item.target != nil {
                Button(favorite ? "Remove from Favorites" : "Add to Favorites") { model.toggleListFavorite(item) }
            }
            if item.folder && item.section != "favorites" {
                Button(open ? "Fold" : "Show its lists") { model.toggleListsFold(item) }
            }
        }
        .help(tip)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityValue(value)
        .accessibilityAddTraits(traits)
        .accessibilityAction { model.openListItem(item) }
    }
}

// Folded: a rail of icons, the toggle on top, each section's icon opening its lists as a pop-over, Chats and Settings
// at the bottom.
struct ListsRailView: View {
    @ObservedObject var model: LauncherModel
    @Environment(\.palette) private var palette

    var body: some View {
        let shown = model.listsSelected
        VStack(spacing: 4) {
            ListsToggleButton(model: model)
            Divider().frame(width: 24).padding(.vertical, 2)
            ForEach(model.lists.sections.filter { !($0.items ?? []).isEmpty }, id: \.id) { s in
                let here = (s.items ?? []).contains { $0.base == shown }
                ListsIconButton(symbol: ListsIcons.section[s.icon] ?? "list.bullet", help: s.title, label: s.title, on: here || model.lists.popover == s.id) {
                    model.lists.popover = model.lists.popover == s.id ? "" : s.id
                }
                .popover(isPresented: Binding(get: { model.lists.popover == s.id }, set: { if !$0 && model.lists.popover == s.id { model.lists.popover = "" } }),
                         arrowEdge: .trailing) {
                    ListsPopover(model: model, section: s, shown: shown).themed()
                }
            }
            Spacer(minLength: 4)
            ListsPlaces(model: model, all: false)
        }
        .padding(.vertical, 8)
        .frame(width: LauncherModel.listsRailWidth)
        .frame(maxHeight: .infinity)
        .background(palette.subtext.opacity(0.05))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Lists, folded")
    }
}

// A section's lists from the rail: all of them (a folder's too), a click shows one.
struct ListsPopover: View {
    @ObservedObject var model: LauncherModel
    let section: ListsSection
    let shown: String
    @Environment(\.palette) private var palette

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Image(systemName: ListsIcons.section[section.icon] ?? "list.bullet").font(.caption)
                Text(section.title).font(.caption.weight(.semibold))
            }
            .foregroundStyle(palette.subtext)
            .padding(.horizontal, 12).padding(.top, 10).padding(.bottom, 4)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(Array((section.items ?? []).enumerated()), id: \.offset) { _, item in
                        ListsRowView(model: model, row: ListsRow(row: "item", key: section.id + ":" + item.id, section: nil, label: nil, item: popItem(item)),
                                     shown: shown, cursor: "", favorite: model.lists.favorites.contains { $0.base == item.base })
                    }
                }
                .padding(.bottom, 8)
            }
            .frame(maxHeight: 380)
        }
        .frame(width: 260)
        .background(palette.background)
    }

    // (no folding in the pop-over: every list shows, its depth kept)
    private func popItem(_ item: ListsItem) -> ListsItem {
        var it = item
        if it.target != nil { it.folder = false }
        return it
    }
}
