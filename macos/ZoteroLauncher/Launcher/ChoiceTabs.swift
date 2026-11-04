import SwiftUI

// One of a few choices, as tabs: each with its symbol and its name; the chosen one framed, filled and in bold (never
// its colour alone), so it reads as chosen in any theme and to a colour-blind eye. Compact, the names go (each on hover
// and to VoiceOver). The chat's Paper/List and what a paper's chat reads (.md, PDF, Metadata).
struct ChoiceTabs: View {
    struct Choice: Identifiable {
        let id: String
        let title: String
        let symbol: String
        var help = ""
    }

    let choices: [Choice]
    let selection: String
    var compact = false
    let pick: (String) -> Void
    @Environment(\.palette) private var palette
    @Environment(\.isEnabled) private var enabled

    var body: some View {
        HStack(spacing: 2) {
            ForEach(choices) { c in
                let on = c.id == selection
                Button { if !on { pick(c.id) } } label: {
                    HStack(spacing: 4) {
                        Image(systemName: c.symbol)
                        if !compact { Text(c.title) }
                    }
                    .font(.callout.weight(on ? .semibold : .regular))
                    .foregroundStyle(on ? palette.text : palette.subtext)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(RoundedRectangle(cornerRadius: 6).fill(on ? palette.accent.opacity(0.16) : Color.clear))
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(on ? palette.text.opacity(0.55) : Color.clear, lineWidth: 1.5))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help(c.help.isEmpty ? c.title : c.help)
                .accessibilityLabel(c.title)
                .accessibilityAddTraits(on ? [.isSelected] : [])
            }
        }
        .padding(2)
        .background(RoundedRectangle(cornerRadius: 8).strokeBorder(palette.subtext.opacity(0.35), lineWidth: 1))
        .opacity(enabled ? 1 : 0.5)
        .fixedSize()
    }
}
