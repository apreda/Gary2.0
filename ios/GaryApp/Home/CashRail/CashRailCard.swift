import SwiftUI

/// The mock's own type and greys (agents/opus-1.html), set at its exact sizes:
/// GaryFonts.display scales, and this card was approved pixel for pixel.
enum CR {
    static func bebas(_ size: CGFloat) -> Font { .custom(GaryFonts.displayFace, size: size) }
    static func sys(_ size: CGFloat, _ weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight).monospacedDigit()
    }
    static let ink = Color(hex: "#F4EFE6")
    static let ink2 = Color(hex: "#CEC7BB")
    static let mute = Color(hex: "#8D867B")
    static let mute2 = Color(hex: "#615B53")
    static let line = Color(hex: "#272320")
    static let line2 = Color(hex: "#1D1A18")
}

/// CASH RAIL — the live NFL marquee card (founder-picked, Oct 29 2026).
/// Scoreboard on top, the rail of the night's landings, the latest cash big,
/// the next three by price, and every hit behind ALL HITS ›.
struct CashRailCard: View {
    let awayName: String
    let homeName: String
    let awayAbbr: String?
    let homeAbbr: String?
    let awayScore: Int?
    let homeScore: Int?
    /// "GB −6.5 · GARY PACKERS −6.5"
    let marketLine: String?
    /// "Q2 4:30" / "HALF" / "FINAL"
    let clockBig: String
    let board: CashRailBoard?
    let onOpenGame: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Namespace private var priceSpace
    @State private var showSheet = false
    @State private var heroElapsed: Int? = nil
    @State private var landing = false

    private var hero: CashRailHit? { board?.hero }

    var body: some View {
        VStack(spacing: 0) {
            Button(action: onOpenGame) { scoreboard }
                .buttonStyle(.plain)
            CashRailRailView(elapsed: board?.elapsed_s ?? 0,
                             hits: board?.hits ?? [],
                             live: board?.status != "final")
                .padding(.horizontal, 14).padding(.bottom, 10)
            if let hero, let board {
                hits(hero: hero, board: board)
            }
        }
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(GaryColors.cardBg))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(landing ? GaryColors.lightGold : GaryColors.gold.opacity(0.5), lineWidth: 1)
        )
        .shadow(color: GaryColors.gold.opacity(landing ? 0.22 : 0), radius: 17)
        .animation(reduceMotion ? nil : .spring(response: 0.6, dampingFraction: 0.85), value: board?.hits.map(\.key))
        .onChange(of: hero?.key) { _ in land() }
        .onAppear { heroElapsed = hero?.elapsed }
        .sheet(isPresented: $showSheet) {
            CashRailSheet(awayName: awayName, homeName: homeName,
                          awayScore: awayScore, homeScore: homeScore,
                          clock: clockBig, board: board)
        }
    }

    /// A new latest cash flashes the border; a hit taken back by a review
    /// (an older hero returning) changes nothing on screen but the rows.
    private func land() {
        guard let hero else { heroElapsed = nil; return }
        defer { heroElapsed = hero.elapsed }
        guard let previous = heroElapsed, hero.elapsed > previous, !reduceMotion else { return }
        landing = true
        withAnimation(.easeOut(duration: 1.5)) { landing = false }
    }

    // MARK: Scoreboard

    private var scoreboard: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 0) {
                teamRow(awayName, score: awayScore, home: false, ball: hasBall(awayAbbr))
                teamRow(homeName, score: homeScore, home: true, ball: hasBall(homeAbbr))
                if let marketLine, !marketLine.isEmpty {
                    Text(marketLine.uppercased())
                        .font(CR.sys(11)).tracking(0.66)
                        .foregroundStyle(CR.mute)
                        .fitsOneLine()
                        .padding(.top, 7)
                }
            }
            Rectangle().fill(CR.line).frame(width: 1)
            VStack(alignment: .leading, spacing: 6) {
                Text(clockBig)
                    .font(CR.bebas(33)).tracking(1.15)
                    .foregroundStyle(GaryColors.gold)
                    .fitsOneLine()
                Text(board?.situation ?? " ")
                    .font(CR.sys(10.5)).tracking(0.63)
                    .foregroundStyle(CR.mute)
                    .fitsOneLine()
            }
            .frame(width: 128, alignment: .leading)
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 14).padding(.top, 14).padding(.bottom, 12)
        .contentShape(Rectangle())
    }

    private func hasBall(_ abbr: String?) -> Bool {
        guard board?.status == "live", let abbr, let poss = board?.possession else { return false }
        return abbr.uppercased() == poss.uppercased()
    }

    private func teamRow(_ name: String, score: Int?, home: Bool, ball: Bool) -> some View {
        HStack(spacing: 0) {
            Text(name.uppercased())
                .font(CR.bebas(29)).tracking(1.0)
                .foregroundStyle(home ? GaryColors.gold : CR.ink)
                .fitsOneLine()
            Spacer(minLength: 6)
            Text(score.map(String.init) ?? "0")
                .font(CR.bebas(31)).tracking(0.6)
                .foregroundStyle(home ? GaryColors.gold : CR.ink)
                .contentTransition(.numericText())
                .frame(minWidth: 30, alignment: .trailing)
            Rectangle().fill(GaryColors.gold)
                .frame(width: 6, height: 6)
                .rotationEffect(.degrees(45))
                .opacity(ball ? 1 : 0)
                .frame(width: 14, alignment: .trailing)
        }
        .frame(height: 31)
    }

    // MARK: Hits

    private func hits(hero: CashRailHit, board: CashRailBoard) -> some View {
        VStack(spacing: 0) {
            CashRailHeroView(hit: hero, space: priceSpace, glowKey: landing)
                .padding(.top, 14).padding(.bottom, 13)
            HStack {
                Text("CASHED")
                Spacer()
                Text("$10 PAID")
            }
            .font(CR.sys(9.5, .bold)).tracking(1.52)
            .foregroundStyle(CR.mute2)
            .padding(.top, 12).padding(.bottom, 3)
            .overlay(alignment: .top) { Rectangle().fill(CR.line).frame(height: 1) }
            let rows = Array(board.ranked.prefix(3))
            ForEach(Array(rows.enumerated()), id: \.element.key) { i, hit in
                CashRailRow(hit: hit, space: priceSpace)
                    .overlay(alignment: .top) {
                        if i > 0 { Rectangle().fill(CR.line2).frame(height: 1) }
                    }
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
            HStack {
                Text("\(board.cashedCount) \(board.cashedCount == 1 ? "BET" : "BETS") CASHED")
                    .font(CR.sys(10, .bold)).tracking(1.5)
                    .foregroundStyle(CR.mute)
                Spacer()
                Button { showSheet = true } label: {
                    Text("ALL HITS ›")
                        .font(CR.sys(11.5, .bold)).tracking(1.7)
                        .foregroundStyle(GaryColors.gold)
                        .padding(.vertical, 4)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 12).padding(.bottom, 13)
            .overlay(alignment: .top) { Rectangle().fill(CR.line).frame(height: 1) }
        }
        .padding(.horizontal, 14)
        .overlay(alignment: .top) { Rectangle().fill(CR.line).frame(height: 1) }
    }
}

/// The latest cash, big: price and what $10 returned on the left, who and what on the right.
struct CashRailHeroView: View {
    let hit: CashRailHit
    let space: Namespace.ID
    let glowKey: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var blink = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("JUST CASHED")
                    .foregroundStyle(blink ? CR.mute : GaryColors.gold)
                Spacer()
                Text(hit.when).tracking(0.8)
                    .foregroundStyle(CR.mute)
            }
            .font(CR.sys(10, .bold)).tracking(1.6)
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(CashRailFormat.price(hit.price))
                        .font(CR.bebas(50)).tracking(0.5)
                        .foregroundStyle(GaryColors.lightGold)
                        .shadow(color: GaryColors.lightGold.opacity(glowKey ? 0.9 : 0), radius: 13)
                        .matchedGeometryEffect(id: "price-\(hit.key)", in: space)
                        .fitsOneLine()
                    (Text("$10 → ").foregroundColor(CR.mute)
                     + Text(CashRailFormat.payout10(hit.price)).foregroundColor(GaryColors.win).fontWeight(.bold))
                        .font(CR.sys(12.5))
                        .fitsOneLine()
                }
                .frame(width: 118, alignment: .leading)
                VStack(alignment: .leading, spacing: 0) {
                    (Text(hit.who.uppercased()).font(CR.bebas(24)).tracking(0.84).foregroundColor(CR.ink)
                     + garyTag(hit, size: 9.5))
                        .padding(.top, 2)
                    Text(hit.displayMarket)
                        .font(CR.sys(13.5, .medium))
                        .foregroundStyle(CR.ink2)
                        .padding(.top, 5)
                    if let play = hit.play, !play.isEmpty {
                        Text(play)
                            .font(.system(size: 12))
                            .foregroundStyle(CR.mute)
                            .padding(.top, 3)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.top, 11)
            if hit.showsStrip, let rungs = hit.rungs {
                CashRailRungStrip(rungs: rungs, big: true).padding(.top, 13)
            }
        }
        .id(hit.key)
        .transition(.opacity.combined(with: .offset(y: 10)))
        .onAppear { blinkTwice() }
    }

    private func blinkTwice() {
        guard !reduceMotion else { return }
        Task { @MainActor in
            for _ in 0..<2 {
                blink = true; try? await Task.sleep(nanoseconds: 180_000_000)
                blink = false; try? await Task.sleep(nanoseconds: 180_000_000)
            }
        }
    }
}

/// "  GARY'S PICK" trailing a name, when the bet is Gary's own.
func garyTag(_ hit: CashRailHit, size: CGFloat) -> Text {
    guard hit.gary == true else { return Text("") }
    return Text("  GARY\u{2019}S PICK").font(.system(size: size, weight: .bold)).tracking(1.33).foregroundColor(GaryColors.gold)
}

/// One ranked hit: price, who + market + when, what $10 paid, and a climbing ladder's strip.
struct CashRailRow: View {
    let hit: CashRailHit
    let space: Namespace.ID?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 10) {
                price
                    .frame(width: 54, alignment: .trailing)
                VStack(alignment: .leading, spacing: 2) {
                    (Text(hit.who).font(CR.sys(13.5)).foregroundColor(CR.ink) + garyTag(hit, size: 9.5))
                    Text("\(hit.displayMarket) · \(hit.when)")
                        .font(.system(size: 12).monospacedDigit())
                        .foregroundStyle(CR.mute)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(CashRailFormat.payout10(hit.price))
                    .font(CR.sys(13))
                    .foregroundStyle(GaryColors.win)
                    .fitsOneLine()
                    .frame(width: 58, alignment: .trailing)
            }
            if hit.showsStrip, let rungs = hit.rungs {
                CashRailRungStrip(rungs: rungs, big: false).padding(.leading, 64)
            }
        }
        .padding(.vertical, 9)
    }

    @ViewBuilder private var price: some View {
        let t = Text(CashRailFormat.price(hit.price))
            .font(CR.bebas(24)).tracking(0.5)
            .foregroundColor(hit.price >= 500 ? GaryColors.lightGold : GaryColors.gold)
        if let space { t.matchedGeometryEffect(id: "price-\(hit.key)", in: space).fitsOneLine() }
        else { t.fitsOneLine() }
    }
}

/// A ladder's cashed rungs low → high: label, price, a bar that grows with the climb.
struct CashRailRungStrip: View {
    let rungs: [CashRailRung]
    let big: Bool

    var body: some View {
        HStack(spacing: 3) {
            ForEach(Array(rungs.enumerated()), id: \.offset) { i, r in
                let span = Double(max(1, rungs.count - 1))
                VStack(spacing: 4) {
                    Text(r.label)
                        .font(.system(size: big ? 10 : 9.5, weight: .medium))
                        .foregroundStyle(CR.mute)
                        .fitsOneLine()
                    Text(CashRailFormat.price(r.price))
                        .font(CR.sys(big ? 12.5 : 11))
                        .foregroundStyle(GaryColors.gold)
                        .fitsOneLine()
                    Rectangle().fill(GaryColors.gold)
                        .opacity(0.35 + 0.65 * Double(i) / span)
                        .frame(height: 2 + (8 * Double(i) / span).rounded())
                        .frame(height: big ? 12 : 10, alignment: .bottom)
                }
                .frame(maxWidth: big ? 62 : 50)
            }
        }
    }
}

#if DEBUG
#Preview("Cash Rail · mid Q3") {
    ScrollView {
        CashRailCard(awayName: "Panthers", homeName: "Packers", awayAbbr: "CAR", homeAbbr: "GB",
                     awayScore: 24, homeScore: 24,
                     marketLine: "GB \u{2212}6.5 · GARY PACKERS \u{2212}6.5",
                     clockBig: "Q3 2:55",
                     board: CashRailBoard(league: "NFL", game_id: "1392323", status: "live", possession: "GB",
                                          situation: "2ND & 7 · CAR 34", elapsed_s: 2525, clock: "Q3 2:55",
                                          hits: [
            CashRailHit(key: "sanders|first_td", who: "Ja'Tavion Sanders", market: "First TD scorer", price: 2200, rungs: nil, elapsed: 205, when: "Q1 11:35", play: "14-yd TD catch from Bryce Young", gary: nil),
            CashRailHit(key: "kraft|anytime_td", who: "Tucker Kraft", market: "Anytime TD", price: 250, rungs: nil, elapsed: 520, when: "Q1 6:20", play: "9-yd TD catch from Jordan Love", gary: nil),
            CashRailHit(key: "h1|tie", who: "Halftime", market: "Tie", price: 1000, rungs: nil, elapsed: 1800, when: "HALF", play: "17–17 at the half", gary: nil),
            CashRailHit(key: "game|total", who: "Game total", market: "Over 46.5", price: -110, rungs: nil, elapsed: 2580, when: "Q3 2:00", play: "Hubbard TD made it 48 points", gary: true),
            CashRailHit(key: "reed|receiving_yards", who: "Jayden Reed", market: "Rec yards", price: 500, rungs: [
                CashRailRung(label: "40+", price: -165), CashRailRung(label: "O 52.5", price: -115),
                CashRailRung(label: "60+", price: 125), CashRailRung(label: "70+", price: 185),
                CashRailRung(label: "80+", price: 260), CashRailRung(label: "90+", price: 360),
                CashRailRung(label: "100+", price: 500)], elapsed: 2330, when: "Q3 4:10", play: "13-yd catch · 102 yds", gary: nil),
        ]), onOpenGame: {})
        .padding(16)
    }
    .background(GaryColors.darkBg)
}
#endif
