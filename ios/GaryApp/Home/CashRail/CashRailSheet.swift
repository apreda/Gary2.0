import SwiftUI

/// ALL HITS › — every bet the game has cashed, biggest first or latest first.
struct CashRailSheet: View {
    let awayName: String
    let homeName: String
    let awayScore: Int?
    let homeScore: Int?
    let clock: String
    let board: CashRailBoard?

    @Environment(\.dismiss) private var dismiss
    @State private var latest = false

    private var hits: [CashRailHit] {
        let all = board?.hits ?? []
        return latest
            ? all.sorted { $0.elapsed > $1.elapsed }
            : all.sorted { a, b in
                let (da, db) = (CashRailFormat.decimal(a.price), CashRailFormat.decimal(b.price))
                return da != db ? da > db : a.elapsed > b.elapsed
            }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .lastTextBaseline) {
                Text("ALL HITS").font(CR.bebas(36)).tracking(1.44).foregroundStyle(CR.ink)
                Spacer()
                Button("CLOSE") { dismiss() }
                    .font(CR.sys(11.5, .bold)).tracking(1.7)
                    .foregroundStyle(GaryColors.gold)
                    .buttonStyle(.plain)
            }
            .padding(.horizontal, 16).padding(.top, 28).padding(.bottom, 6)
            Text("\(awayName) \(awayScore ?? 0) · \(homeName) \(homeScore ?? 0) · \(clock) · \(board?.cashedCount ?? 0) CASHED".uppercased())
                .font(CR.sys(10.5, .bold)).tracking(1.47)
                .foregroundStyle(CR.mute)
                .fitsLines(2)
                .padding(.horizontal, 16)
            HStack(spacing: 24) {
                tab("BIGGEST", on: !latest) { latest = false }
                tab("LATEST", on: latest) { latest = true }
            }
            .padding(.horizontal, 16).padding(.top, 18).padding(.bottom, 12)
            Rectangle().fill(CR.line).frame(height: 1)
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(Array(hits.enumerated()), id: \.element.key) { i, hit in
                        CashRailRow(hit: hit, space: nil)
                            .overlay(alignment: .top) {
                                if i > 0 { Rectangle().fill(CR.line2).frame(height: 1) }
                            }
                    }
                }
                .padding(.horizontal, 16).padding(.bottom, 40)
            }
        }
        .background(GaryColors.darkBg.ignoresSafeArea())
        .presentationDragIndicator(.visible)
    }

    private func tab(_ label: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(CR.sys(11.5, .bold)).tracking(1.84)
                .foregroundStyle(on ? GaryColors.gold : CR.mute)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}
