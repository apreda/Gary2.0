import SwiftUI

// MARK: - Receipt rows (search results only — the page section came off Aug 6)

struct HubReceipts: View {
    let signals: [Signal]
    let onTap: (Signal) -> Void
    @State private var showAll = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            let shown = showAll ? signals : Array(signals.prefix(12))
            ForEach(Array(shown.enumerated()), id: \.element.id) { i, s in
                Button { onTap(s) } label: { row(s) }.buttonStyle(.plain)
                if i < shown.count - 1 { HubRule(inset: 18) }
            }
            if signals.count > 12 {
                HubSeeAllButton(isOpen: showAll, total: signals.count) {
                    withAnimation(.easeInOut(duration: 0.2)) { showAll.toggle() }
                }
                .padding(.top, 10)
            }
        }
    }

    @ViewBuilder private func row(_ s: Signal) -> some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HubKicker(text: signalChipLabel(kind: s.kind, league: s.league), size: 9, color: GaryColors.gold.opacity(0.75))
                Text(s.headline)
                    .hubBodyFont(13)
                    .foregroundStyle(.white.opacity(0.88))
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
                if let note = s.resultNote, !note.isEmpty {
                    Text(note)
                        .hubDataFont(10.5, .medium)
                        .foregroundStyle(.white.opacity(0.62))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            Text(s.result == "hit" ? AppFlags.wonStamp : s.result == "push" ? "PUSH" : "LOST")
                .hubDataFont(10)
                .foregroundStyle(s.result == "hit" ? GaryColors.win
                                 : s.result == "push" ? GaryColors.gold
                                 : GaryColors.loss)
                .padding(.top, 2)
            Image(systemName: "chevron.right")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.white.opacity(0.25))
                .padding(.top, 4)
        }
        .padding(.horizontal, 18).padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}

