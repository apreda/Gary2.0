import SwiftUI

/// Gary's own bets on the game, where the rail was (founder, Oct 30 2026,
/// rail option 1 from .superpowers/brainstorm/…/rail-options.html): his game
/// pick, his props and his darts, each with how it stands right now.
struct CashRailGaryStrip: View {
    let bets: [CashRailGaryBet]

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            ForEach(bets) { bet in
                box(bet).frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func color(_ status: String?, ok: Bool?) -> Color {
        switch status {
        case "won": return GaryColors.win
        case "lost": return GaryColors.loss
        default: return ok == true ? GaryColors.win : CR.mute
        }
    }

    private func box(_ bet: CashRailGaryBet) -> some View {
        let focus = bet.focus
        let status = focus?.status ?? bet.status
        let label = focus?.label ?? bet.label ?? ""
        let progress = focus?.progress ?? bet.progress
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 4) {
                Text(bet.title)
                    .font(.system(size: 9, weight: .bold)).tracking(1.2)
                    .foregroundStyle(GaryColors.gold)
                    .fitsOneLine()
                Spacer(minLength: 2)
                if bet.kind != "darts", let dots = bet.dots, dots.count > 1 { dotRow(dots, size: 5) }
            }
            Text(label)
                .font(CR.bebas(17)).tracking(0.5)
                .foregroundStyle(CR.ink)
                .fitsOneLine()
                .padding(.top, 5)
            // The bar is for a bet still in play; a settled one just says how it went.
            if let progress, status == "live" {
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(CR.line)
                        Capsule().fill(status == "won" ? GaryColors.win : GaryColors.gold)
                            .frame(width: g.size.width * min(1, max(0, progress)))
                    }
                }
                .frame(height: 4)
                .padding(.top, 6)
            }
            if bet.kind == "darts" {
                // One dot a dart: green hit, red miss, open while it can still land.
                dotRow(bet.dots ?? [], size: 7).padding(.top, 7)
            } else {
                Text(statusLine(bet, status: status))
                    .font(.system(size: 10, weight: .bold)).tracking(0.6)
                    .foregroundStyle(color(status, ok: focus?.ok ?? bet.ok))
                    .fitsOneLine()
                    .padding(.top, 6)
            }
        }
        .padding(.top, 7)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(bet.kind == "darts" ? CR.line : (status == "won" ? GaryColors.win : status == "lost" ? GaryColors.loss.opacity(0.7) : GaryColors.gold))
                .frame(height: 2)
        }
    }

    private func statusLine(_ bet: CashRailGaryBet, status: String?) -> String {
        switch status {
        case "won": return "✓ CASHED"
        case "lost": return "✗ LOST"
        default: return (bet.focus?.note ?? bet.note ?? "").uppercased()
        }
    }

    private func dotRow(_ dots: [String], size: CGFloat) -> some View {
        HStack(spacing: size / 2) {
            ForEach(Array(dots.enumerated()), id: \.offset) { _, d in
                Circle()
                    .fill(d == "won" ? GaryColors.win : d == "lost" ? GaryColors.loss.opacity(0.55) : Color.clear)
                    .overlay(Circle().stroke(d == "live" ? CR.mute : Color.clear, lineWidth: 1))
                    .frame(width: size, height: size)
            }
        }
    }
}
