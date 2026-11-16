import SwiftUI

// A note with its paper's chat beside it (LauncherModel+NoteChat): the note's text on the left, never narrower than
// noteColumnMin; the chat on the right, its width dragged at its edge (kept on this Mac). The chat is the app's own
// (ChatWindowView, docked), at the chats' text size.
struct NoteWithChat<Note: View>: View {
    @ObservedObject var model: LauncherModel
    @ObservedObject private var textSize: ChatTextSize
    let note: Note
    @State private var dragFrom: CGFloat?

    init(model: LauncherModel, @ViewBuilder note: () -> Note) {
        self.model = model
        self.textSize = ChatTextSize.shared
        self.note = note()
    }

    var body: some View {
        GeometryReader { g in
            let room = max(0, g.size.width - LauncherModel.noteColumnMin - 1)
            let chatWidth = max(min(model.noteChatWidth, room), min(200, g.size.width / 2))
            HStack(spacing: 0) {
                note.frame(maxWidth: .infinity, maxHeight: .infinity)
                if model.noteChatVisible {
                    Divider()
                        .overlay {
                            // its edge: drag to size it (kept on this Mac)
                            Color.clear.frame(width: 7).contentShape(Rectangle())
                                .onHover { inside in if inside { NSCursor.resizeLeftRight.push() } else { NSCursor.pop() } }
                                .gesture(DragGesture(minimumDistance: 1, coordinateSpace: .global)
                                    .onChanged { drag in
                                        let from = dragFrom ?? chatWidth
                                        if dragFrom == nil { dragFrom = from }
                                        let w = min(from - drag.translation.width, room)
                                        model.noteChatWidth = min(max(w, LauncherModel.noteChatWidths.lowerBound), LauncherModel.noteChatWidths.upperBound)
                                    }
                                    .onEnded { _ in dragFrom = nil })
                                .help("Drag to size the chat")
                        }
                    pane.frame(width: chatWidth)
                }
            }
        }
    }

    @ViewBuilder private var pane: some View {
        if let chat = model.noteChat, model.notePaper != nil {
            ChatWindowView(model: chat, launcher: model)
                .environment(\.chatZoom, textSize.zoom)
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Chat about the paper")
        } else {
            VStack(spacing: 8) {
                Image(systemName: "bubble.left.and.text.bubble.right").font(.system(size: 24)).foregroundStyle(.secondary).accessibilityHidden(true)
                Text(!model.runnerInstalled ? "Chat needs the AI features: Settings › Setup installs them"
                     : model.note.data == nil ? "Loading the note…" : "This note isn't on a paper: nothing to chat about")
                    .font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .padding(16)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}
