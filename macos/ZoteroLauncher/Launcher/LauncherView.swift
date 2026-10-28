import SwiftUI

// The launcher: the context bar, the search box, the rows with their sections, the footer
// (ZoteroSearch.qml's card). The keys come through LauncherController's monitor, not the view.
struct LauncherView: View {
    @ObservedObject var model: LauncherModel
    @ObservedObject var store: AppStore
    @ObservedObject var theme: ThemeStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var top: Int? // the first row in view: 1…9 count from it

    init(model: LauncherModel) {
        self.model = model
        self.store = model.store
        self.theme = ThemeStore.shared
    }

    var body: some View {
        VStack(spacing: 0) {
            if let context = model.context {
                HStack(alignment: .top, spacing: 8) { // (the ranks and the count beside the breadcrumb's first line)
                    BreadcrumbBar(crumbs: model.breadcrumb, jump: { model.jumpToCrumb($0) })
                    Spacer(minLength: 8)
                    // (whole: the breadcrumb wraps in what's left, the pills never squeezed)
                    HStack(spacing: 8) {
                        ForEach(context.ranks, id: \.self) { PillView(text: $0, selected: false, kind: "rank") }
                        if !context.count.isEmpty { Text(context.count).font(.callout).foregroundStyle(.secondary) }
                    }
                    .fixedSize()
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            if let (strip, items) = stripShown {
                TaxonomyStrip(model: model, strip: strip, items: items)
            }
            HStack(spacing: 10) {
                // at the top level the search's glass; below it (a collection or a tag too) the way back, as esc goes
                if store.atRoot {
                    Image(systemName: "magnifyingglass").font(.title2).foregroundStyle(.secondary)
                } else {
                    Button { model.back() } label: {
                        Image(systemName: "chevron.left").font(.title2).foregroundStyle(.secondary)
                            .frame(width: 22, height: 26).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .help("Back (esc)")
                    .accessibilityLabel("Back")
                }
                StyledTextField(text: store.filterText, caretBack: store.caretBack, live: store.queryLive,
                                focused: Binding(get: { store.searchFocus }, set: { if store.searchFocus != $0 { store.searchFocus = $0 } }),
                                placeholder: model.headerPlaceholder(), segments: { model.segments($0, caret: $1) },
                                onEdit: { model.typed($0, caretBack: $1) }, onCaret: { store.caretBack = $0 })
                    .id(model.shown) // each opening: the field takes the keys again if it should
                Text(model.countText).font(.callout).foregroundStyle(.secondary)
                if store.inSearch && store.pickFor.isEmpty { ReviewTableButton { model.openReviewHere() } } // (⌘T)
                PinButton(pinned: model.pinnedOpen) { model.pinnedOpen.toggle() }
            }
            .padding(.horizontal, 16)
            .padding(.top, model.context == nil ? 12 : 8) // (closer under the breadcrumb)
            .padding(.bottom, 12)

            if !model.badges.isEmpty || !model.sortLabel.isEmpty { BadgeBar(model: model) } // (in a scope too: the sort is always shown)
            if store.view == "tasks" && !model.processesAndPending.isEmpty { ProcessFilterBar(model: model) }
            Divider()
            // a new list slides in: from the right going in, from the left going back; the old one fades (its own
            // transition is the one it was drawn with, which knows nothing of this move). None with Reduce Motion, nor
            // to or from the reader and the calendar (a web view, a grid: they'd come in blank).
            ZStack {
                rows
                    .id(levelKey)
                    .transition(.asymmetric(insertion: .move(edge: store.movedIn ? .trailing : .leading).combined(with: .opacity), removal: .opacity))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()
            .animation(slide, value: levelKey)
            Divider()
            FooterView(model: model)
        }
        .frame(minWidth: LauncherPanel.minSize.width, maxWidth: .infinity, minHeight: LauncherPanel.minSize.height, maxHeight: .infinity) // (resizable: it fills the panel)
        // solid, not a see-through material: what's behind (lighter still while it isn't the window in front) made the text hard to read
        .background(theme.palette.background, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .themed()
    }

    // The paper's taxonomy strip, when it has a label or a note to show.
    private var stripShown: ([String: Any], [[String: Any]])? {
        guard let strip = model.taxonomyStrip else { return nil }
        let items: [[String: Any]] = strip["items"] as? [[String: Any]] ?? []
        let note: String = strip["note"] as? String ?? ""
        return items.isEmpty && note.isEmpty ? nil : (strip, items)
    }

    @ViewBuilder
    private var rows: some View {
        if store.view == "todo-due" {
            CalendarView(model: model)
        } else if store.inNote && model.note.data != nil && !model.noteBodyHTML.isEmpty {
            NoteView(html: model.noteBodyHTML, size: model.noteTextSize, onLink: { model.openLink($0) }, display: { model.noteDisplay = $0 })
        } else if model.content.count == 0 {
            let empty = model.emptyState
            VStack(spacing: 6) {
                Spacer()
                Image(systemName: empty.symbol).font(.system(size: 28)).foregroundStyle(.secondary).padding(.bottom, 4).accessibilityHidden(true)
                Text(empty.title).font(.title3.weight(.semibold))
                if !empty.detail.isEmpty { Text(empty.detail).font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center) }
                Spacer()
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 24)
        } else {
            list
        }
    }

    private var list: some View {
        let hint = Access.hint(model.hints())
        return ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    switch model.content {
                    case .search(let rows):
                        ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                            // (a section's heading and its first row: one target, so scrolling to the row brings both)
                            VStack(alignment: .leading, spacing: 0) {
                                section(row.section, first: index == 0 || rows[index - 1].section != row.section)
                                SearchRowView(row: row, selected: index == store.selectedIndex, hint: hint, opens: model.searchRowOpens(row),
                                              task: row.isPaper ? model.rowTasks["\(row.libraryID):\(row.key)"] ?? "" : "")
                                    .contentShape(Rectangle())
                                    .onTapGesture { store.selectedIndex = index; model.enterActions(index) }
                                    .accessibilityAction { store.selectedIndex = index; model.enterActions(index) }
                            }
                            .id(index)
                        }
                    case .list(let rows):
                        ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                            VStack(alignment: .leading, spacing: 0) {
                                section(row.section, first: index == 0 || rows[index - 1].section != row.section)
                                ListRowView(row: row, selected: index == store.selectedIndex, hint: hint)
                                    .contentShape(Rectangle())
                                    .onTapGesture { store.selectedIndex = index; model.activateAction(index) }
                                    .accessibilityAction { store.selectedIndex = index; model.activateAction(index) }
                            }
                            .id(index)
                        }
                    }
                }
                .padding(.vertical, 6)
                .scrollTargetLayout()
                // A new list for each view: the rows' ids (0, 1, 2…) repeat from one list to the next, and the lazy
                // stack kept drawing the last list's rows under them (a paper's menu showed the results).
                .id(listKey)
            }
            .scrollPosition(id: $top, anchor: .top)
            // the highlighted row in sight; again once laid out (a lazy stack guesses the heights of rows it hasn't drawn:
            // with a section's heading at the bottom, the first scroll stopped short and the row stayed out of sight)
            .onChange(of: store.selectedIndex) { _, selection in
                proxy.scrollTo(selection)
                DispatchQueue.main.async { if store.selectedIndex == selection { proxy.scrollTo(selection) } }
            }
            .onChange(of: top) { _, row in model.visibleTop = row ?? 0 }
            // a list drawn anew (each level is): the row you were on in view, numbered from what's shown
            .onAppear {
                top = nil
                model.visibleTop = 0
                if store.selectedIndex > 0 { proxy.scrollTo(store.selectedIndex) }
            }
        }
    }

    // A level: which view, how deep (the slide runs when it changes, never while you type or move in a list).
    private var levelKey: String { "\(store.view):\(store.stack.count)" }

    private var slide: Animation? {
        let still: Set<String> = ["note", "todo-due"]
        return still.contains(store.view) || still.contains(store.leftView) ? nil : Motion.slide(reduce: reduceMotion)
    }

    private var listKey: String {
        let kind: String
        if case .search = model.content { kind = "search" } else { kind = "list" }
        return "\(kind):\(store.view):\(store.stack.count)"
    }

    @ViewBuilder
    private func section(_ name: String, first: Bool) -> some View {
        if !name.isEmpty && first {
            Text(name)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 2)
                .accessibilityAddTraits(.isHeader)
        }
    }
}

// The badges above the results (ZoteroSearch.qml:5680): All, your pinned searches, and a hint that
// saves what is typed. The one the results are in is filled; a click selects it (or saves).
struct BadgeBar: View {
    @ObservedObject var model: LauncherModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 8) {
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(model.badges, id: \.id) { badge in
                            BadgeChip(name: badge.name, id: badge.id, active: badge.id != "+save" && badge.id == model.searchState.active) {
                                badge.id == "+save" ? model.saveSearchPrompt() : model.selectSearch(badge.id)
                            }
                        }
                    }
                    .padding(.leading, 16)
                }
                .onChange(of: model.searchState.active) { _, id in withAnimation(Motion.animation(reduce: reduceMotion)) { proxy.scrollTo(id) } }
            }
            // how the papers are arranged: Group ▾, Sort ▾ and the order (g the next sort, G the next grouping)
            if model.arrangeable { ArrangeBar(model: model).padding(.trailing, 16) }
        }
        .padding(.bottom, 8)
    }
}

// The results' Group ▾, Sort ▾ and Order, at the badges' right: each menu lists its choices, a check on the one in use;
// the order flips ascending and descending (relevance has one order).
struct ArrangeBar: View {
    @ObservedObject var model: LauncherModel

    var body: some View {
        let a = model.arrangement, o = model.arrangeOptions
        HStack(spacing: 4) {
            ArrangeMenu(title: "Group", options: o.groups, chosen: a.group, key: model.keyName("G")) { model.setGroup($0) }
            ArrangeMenu(title: "Sort", options: o.sorts, chosen: a.sort, key: model.keyName("g")) { model.setSort($0) }
            Button { model.toggleOrder() } label: {
                ArrangeChip(text: a.order == "asc" ? "↑ Asc" : "↓ Desc")
            }
            .buttonStyle(.plain)
            .disabled(a.sort == "relevance")
            .opacity(a.sort == "relevance" ? 0.45 : 1)
            .help(a.sort == "relevance" ? "Order: relevance has one order (sort by a date or the year to choose)" : a.order == "asc" ? "Ascending: oldest first. Click for descending" : "Descending: newest first. Click for ascending")
            .accessibilityLabel(a.order == "asc" ? "Order: ascending" : "Order: descending")
        }
        .fixedSize()
    }
}

struct ArrangeMenu: View {
    let title: String
    let options: [[String]] // [id, name]
    let chosen: String
    let key: String
    let pick: (String) -> Void

    private var name: String { options.first { $0.first == chosen }?.last ?? chosen }

    var body: some View {
        Menu {
            ForEach(options, id: \.self) { option in
                Button { pick(option.first ?? "") } label: {
                    if option.first == chosen { Label(option.last ?? "", systemImage: "checkmark") } else { Text(option.last ?? "") }
                }
            }
        } label: {
            ArrangeChip(text: title + ": " + name + " ▾")
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .fixedSize()
        .help(title + " the papers (" + key + " the next)")
        .accessibilityLabel(title + ": " + name)
    }
}

struct ArrangeChip: View {
    let text: String
    @Environment(\.palette) private var palette

    var body: some View {
        Text(text).font(.caption.weight(.medium)).lineLimit(1)
            .padding(.horizontal, 8).padding(.vertical, 2)
            .background(Capsule().fill(palette.subtext.opacity(0.14)))
            .foregroundStyle(.secondary)
    }
}

// A badge: All, a pinned search (⌕ and its name), or the hint that saves what is typed. (Its own view, typed, so
// the bar's ForEach stays quick to type-check.)
struct BadgeChip: View {
    let name: String
    let id: String
    let active: Bool
    let tap: () -> Void
    @Environment(\.palette) private var palette

    var body: some View {
        let save: Bool = id == "+save"
        let plain: Bool = id.isEmpty || save
        let fill: Color = active ? palette.accent : .clear
        let stroke: Color = palette.subtext.opacity(save || active ? 0 : 0.4)
        let ink: Color = active ? palette.onAccent : palette.text
        let traits: AccessibilityTraits = active ? [.isButton, .isSelected] : .isButton
        Text(plain ? name : "\u{2315} " + name)
            .font(.caption.weight(active ? .semibold : .regular))
            .lineLimit(1)
            .padding(.horizontal, 10)
            .padding(.vertical, 3)
            .background(Capsule().fill(fill))
            .overlay(Capsule().strokeBorder(stroke))
            .foregroundStyle(ink)
            .opacity(save ? 0.6 : 1)
            .onTapGesture(perform: tap)
            .accessibilityLabel(plain ? name : "saved search: " + name)
            .accessibilityAddTraits(traits)
    }
}

// The footer: the paper's pills in its menu, the note (a flash, an error), and the hints that fit.
struct FooterView: View {
    @ObservedObject var model: LauncherModel
    @Environment(\.palette) private var palette
    @State private var hintsWidth: CGFloat = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            let pills = model.paperPills
            if !pills.isEmpty {
                FlowLayout(spacing: 6, lineSpacing: 4) {
                    ForEach(Array(pills.enumerated()), id: \.offset) { _, pill in PillView(text: pill.text, selected: false, mode: pill.mode, kind: pill.kind) }
                }
            }
            let note = model.footerNote
            let sync = model.syncFooter
            let processes = model.processesFooter
            if !note.isEmpty || !sync.isEmpty || !processes.isEmpty {
                HStack(alignment: .firstTextBaseline) {
                    Text(note).font(.callout).foregroundStyle(.secondary).lineLimit(2).accessibilityIdentifier("footer-note")
                    Spacer(minLength: 8)
                    // what's running, waiting or failed: a click opens Processes
                    if !processes.isEmpty {
                        Button { model.openTasks() } label: {
                            Label(processes, systemImage: processes.contains("failed") ? "exclamationmark.triangle" : "gearshape.2").font(.caption)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(processes.contains("failed") ? palette.orange : palette.subtext)
                        .help("Processes (" + model.keyName(".") + ")")
                        .accessibilityLabel("Processes: " + processes.replacingOccurrences(of: " · ", with: ", "))
                    }
                    if !sync.isEmpty { Label(sync, systemImage: "arrow.triangle.2.circlepath").font(.caption).foregroundStyle(.secondary) }
                }
            }
            // the hints on two lines when one isn't enough (the width measured, as the hints are)
            let fitted = FitHints.fit(model.hints(), width: hintsWidth, gap: 14, lines: 2, widthOf: { FitHints.width($0) })
            FlowLayout(spacing: 14, lineSpacing: 4) {
                ForEach(fitted, id: \.self) { hint in
                    let p = FitHints.parts(hint)
                    HStack(spacing: 4) {
                        Text(p.keys).bold()
                        Text(p.desc).foregroundStyle(.secondary)
                    }
                    .font(.system(size: NSFont.smallSystemFontSize))
                    .fixedSize()
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(GeometryReader { g in
                Color.clear.onAppear { hintsWidth = g.size.width }.onChange(of: g.size.width) { _, w in hintsWidth = w }
            })
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }
}
