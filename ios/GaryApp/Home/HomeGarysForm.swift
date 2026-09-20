import SwiftUI

/// One cell of the LIVE FORM — a single sport's GAME-pick record for the current
/// active slate day. Built today as games settle (LIVE while in progress), then
/// holds last night's final until the next day's results land.
struct DailyFormCell: Identifiable {
    enum State { case live, today, lastNight }
    let league: String
    let wins: Int
    let losses: Int
    let pushes: Int
    let state: State
    var id: String { league }
    var record: String { pushes > 0 ? "\(wins)-\(losses)-\(pushes)" : "\(wins)-\(losses)" }
    var stateLabel: String {
        switch state {
        case .live:      return "LIVE"
        case .today:     return "TODAY"
        case .lastNight: return "LAST NIGHT"
        }
    }
}

struct HomeGarysForm: View {
    struct Model {
        let pips: [String]      // oldest → newest, the WHOLE graded history
        let story: String       // the editorial headline — what the data means
        let net: Double         // last-10 net units — the one colored number
        let total: Int          // graded count, for the footer affordance
    }
    let model: Model
    let onTap: () -> Void

    private let win = GaryColors.win
    private let loss = GaryColors.loss

    /// Fills only — no outlines (fill contrast and weight carry the
    /// difference); older picks fade as they recede left, so the rail
    /// itself shows time direction.
    private func pip(_ p: String, age: Double) -> some View {
        let base: Color = p == "W" ? win : p == "L" ? loss : GaryColors.gold
        let isWin = p == "W"
        return Text(p)
            .font(GaryFonts.mono(10.5, bold: isWin))
            .foregroundStyle(base.opacity(isWin ? 0.95 : 0.6))
            .frame(width: 20, height: 24)
            .background(
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(base.opacity(isWin ? 0.16 : 0.09))
            )
            .opacity(0.35 + 0.65 * age)   // oldest 0.35 → newest 1.0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HubSectionHeader(eyebrow: "Gary's form", sub: "Newest on the right — drag for history")
            Button(action: onTap) {
                VStack(alignment: .leading, spacing: 0) {
                    // The headline: one sentence with a point of view, and the
                    // net as the single number the eye should land on.
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(model.story)
                            .font(GaryFonts.text(15, .semibold))
                            .foregroundStyle(.white.opacity(0.92))
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 8)
                        // STORE-SAFE BRIDGE: the story sentence stands alone —
                        // no unit tally beside it.
                        if !AppFlags.storeSafe {
                            Text(String(format: "%+.1fu", model.net))
                                .font(GaryFonts.mono(15, bold: true))
                                .foregroundStyle(model.net >= 0 ? win : loss)
                        }
                    }
                    .padding(.horizontal, 14).padding(.top, 13).padding(.bottom, 11)

                    // The rail — every graded pick, anchored at NOW.
                    ScrollViewReader { proxy in
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 4) {
                                ForEach(Array(model.pips.enumerated()), id: \.offset) { i, p in
                                    pip(p, age: model.pips.count > 1 ? Double(i) / Double(model.pips.count - 1) : 1)
                                        .id(i)
                                }
                            }
                            .padding(.horizontal, 14)
                        }
                        .onAppear { proxy.scrollTo(model.pips.count - 1, anchor: .trailing) }
                    }
                    .padding(.bottom, 12)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Form, oldest to newest: \(model.pips.joined(separator: " "))")

                    Rectangle().fill(Color.white.opacity(0.05)).frame(height: 1)

                    HStack {
                        Text("ALL \(model.total) GRADED")
                            .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                            .foregroundStyle(.white.opacity(0.62))
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.62))
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .garyPanel(radius: 12)
            .pageGutter()
        }
    }
}


