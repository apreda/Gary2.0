import SwiftUI

// MARK: - Edge overlay (centered — founder: nothing pulls up from the bottom)

/// A tapped edge, as a centered card over the dimmed page: kicker + game,
/// the headline once, the value only when it isn't already in the headline,
/// and the complete original read. Long copy scrolls inside the centered panel
/// while its close button stays reachable. VIEW GAME → exact game on Picks.
struct HubEdgeOverlay: View {
    let signal: Signal
    var supportingNotice: String? = nil
    let onClose: () -> Void
    let onViewGame: (String) -> Void
    @State private var readHeight: CGFloat = 220
    @State private var headerHeight: CGFloat = 44

    private var isMatchup: Bool {
        guard signal.reg?.day != "tomorrow" else { return false }
        let g = signal.game.lowercased()
        return g.contains("@") || g.contains(" vs ") || g.contains(" v ")
    }

    var body: some View {
        GeometryReader { geo in
        ZStack {
            Color.black.opacity(0.62).ignoresSafeArea()
                .onTapGesture { onClose() }
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    HubKicker(text: signalChipLabel(kind: signal.kind, league: signal.league), size: 10.5)
                    Spacer()
                    if let r = signal.result {
                        Text(r == "hit" ? AppFlags.wonStamp : r == "push" ? "PUSH" : "LOST")
                            .hubDataFont(10.5)
                            .foregroundStyle(r == "hit" ? GaryColors.win : r == "push" ? GaryColors.gold : GaryColors.loss)
                    }
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.white.opacity(0.6))
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(Color.white.opacity(0.08)))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Close full read")
                }
                .background(GeometryReader { measured in
                    Color.clear
                        .onAppear { headerHeight = max(44, measured.size.height) }
                        .onChange(of: measured.size.height) { headerHeight = max(44, $0) }
                })
                ScrollView(showsIndicators: true) {
                    readBody
                        .fixedSize(horizontal: false, vertical: true)
                        .background(GeometryReader { measured in
                            Color.clear
                                .onAppear { if measured.size.height > 0 { readHeight = measured.size.height } }
                                .onChange(of: measured.size.height) { if $0 > 0 { readHeight = $0 } }
                        })
                }
                .frame(height: min(readHeight, max(60, geo.size.height * 0.8 - headerHeight - 48)))
            }
            .padding(18)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(Color(hex: "#141210"))
                    .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(GaryColors.gold.opacity(0.3), lineWidth: 1))
                    .shadow(color: .black.opacity(0.6), radius: 28, y: 12)
            )
            .padding(.horizontal, 26)
        }
        .frame(width: geo.size.width, height: geo.size.height)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape, onClose)
        }
    }

    private var readBody: some View {
        VStack(alignment: .leading, spacing: 12) {
                Text((signal.reg?.day == "tomorrow" ? "Tomorrow · " : "") + signal.game.uppercased())
                    .hubDataFont(10, .medium)
                    .foregroundStyle(.white.opacity(0.62))
                Text(signal.headline)
                    .hubTitleFont(21)
                    .foregroundStyle(GaryColors.warmWhite)
                    .fixedSize(horizontal: false, vertical: true)
                if !signal.valueEchoesHeadline, !signal.value.isEmpty {
                    Text(signal.value)
                        .hubDataFont(14, .medium)
                        .foregroundStyle(GaryColors.sectionSub)
                }
                let body = signal.detail.trimmingCharacters(in: .whitespacesAndNewlines)
                if !body.isEmpty {
                    Text(body)
                        .hubBodyFont(14)
                        .foregroundStyle(.white.opacity(0.8))
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let note = signal.resultNote, !note.isEmpty {
                    Text(note)
                        .hubDataFont(11, .medium)
                        .foregroundStyle(.white.opacity(0.7))
                }
                if let supportingNotice {
                    Text(supportingNotice)
                        .hubBodyFont(12)
                        .foregroundStyle(GaryColors.sectionSub)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if isMatchup {
                    Button { onViewGame(signal.game) } label: {
                        HStack(spacing: 6) {
                            Text("VIEW GAME")
                            Image(systemName: "arrow.right")
                        }
                        .hubDataFont(12)
                        .foregroundStyle(GaryColors.ink)
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .background(Capsule().fill(GaryColors.gold))
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 4)
                }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

