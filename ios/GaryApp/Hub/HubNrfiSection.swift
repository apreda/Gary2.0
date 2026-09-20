import SwiftUI

// MARK: - The NRFI Watch (mock N10 story card — founder pick, Aug 6)

struct HubNrfiSection: View {
    let rows: [Signal]
    var showsHeader: Bool = true
    let onTap: (Signal) -> Void

    private let green = HubPalette.green
    private let red = HubPalette.red

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if showsHeader { HubHead(title: "The NRFI Watch", count: rows.count) }
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { i, s in
                    Button { onTap(s) } label: { card(s) }.buttonStyle(.plain)
                    if i < rows.count - 1 { HubRule(inset: 18) }
                }
            }
        }
    }

    private func sideWord(_ s: Signal) -> String {
        switch s.nrfi?.side {
        case "NRFI": return "NRFI"
        case "YRFI": return "YRFI"
        case "TEAM_QUIET": return "Quiet Start"
        case "TEAM_HOT": return "Hot Start"
        default: return "First Inning"
        }
    }

    @ViewBuilder private func card(_ s: Signal) -> some View {
        let m = s.nrfi
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                HubKicker(text: sideWord(s), size: 9.5, color: GaryColors.gold.opacity(0.9))
                Spacer()
                Text(s.game.uppercased())
                    .hubDataFont(9.5, .medium)
                    .foregroundStyle(.white.opacity(0.55))
            }
            Text(s.headline)
                .hubTitleFont(21)
                .foregroundStyle(GaryColors.warmWhite)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 7)
            Text(s.detail)
                .hubBodyFont(13.5)
                .foregroundStyle(.white.opacity(0.82))
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
            // The evidence: both sides' sequences, or the one side the row is
            // about — drawn only when the payload really carries them.
            VStack(alignment: .leading, spacing: 6) {
                if let abbr = m?.away_abbr, let seq = m?.away_seq, !seq.isEmpty {
                    seqRow(abbr, seq)
                }
                if let abbr = m?.home_abbr, let seq = m?.home_seq, !seq.isEmpty {
                    seqRow(abbr, seq)
                }
                if let abbr = m?.team_abbr, let seq = m?.team_seq, !seq.isEmpty,
                   m?.away_seq == nil, m?.home_seq == nil {
                    seqRow(abbr, seq)
                }
            }
            .padding(.top, 10)
            if let p = m?.price, p.over != nil || p.under != nil {
                HStack(spacing: 12) {
                    Text("1ST-INNING RUN")
                        .hubKickerFont(9).tracking(1.2)
                        .foregroundStyle(.white.opacity(0.45))
                    if let o = p.over { priceBit("O0.5", o) }
                    if let u = p.under { priceBit("U0.5", u) }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.25))
                }
                .padding(.top, 10)
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    private func priceBit(_ side: String, _ odds: Int) -> some View {
        HStack(spacing: 4) {
            Text(side)
                .hubDataFont(10, .semibold)
                .foregroundStyle(.white.opacity(0.62))
            Text(odds > 0 ? "+\(odds)" : "\(odds)")
                .hubDataFont(12, .bold)
                .foregroundStyle(GaryColors.gold)
        }
    }

    @ViewBuilder private func seqRow(_ abbr: String, _ seq: [Int]) -> some View {
        let clean = seq.filter { $0 == 0 }.count
        HStack(spacing: 8) {
            Text(abbr.uppercased())
                .hubKickerFont(11).foregroundStyle(.white.opacity(0.85))
                .frame(width: 40, alignment: .leading)
            HStack(spacing: 3.5) {
                ForEach(Array(seq.enumerated()), id: \.offset) { _, v in
                    RoundedRectangle(cornerRadius: 2.5, style: .continuous)
                        .fill(v > 0 ? green.opacity(0.9) : red.opacity(0.45))
                        .frame(width: 10, height: 10)
                }
            }
            Spacer(minLength: 6)
            Text("CLEAN \(clean)/\(seq.count)")
                .hubDataFont(10, .bold).foregroundStyle(.white.opacity(0.7))
        }
    }
}

