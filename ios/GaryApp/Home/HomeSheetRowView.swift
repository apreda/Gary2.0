import SwiftUI

/// One row of THE SHEET — matchup (or live score), Gary's call in gold, the
/// rolling status on the right. The whole row taps through to the game.
struct HomeSheetRowView: View {
    let row: HomeSheetRow
    /// On the ALL board each row names its league under the time, in the
    /// sport's own color (founder, Sep 24 2026: "People will start to
    /// associate which accent colors go with each sport").
    var showLeague = false
    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 7) {
                    // Team names in the HERO face (founder, Aug 3: the italic
                    // accent read wrong here) — Bebas caps, the same voice the
                    // marquee's PIRATES/BREWERS speak, upright and confident.
                    Text(row.title)
                        .font(GaryFonts.display(19))
                        .tracking(0.5)
                        .foregroundStyle(GaryColors.warmWhite.opacity(0.94))
                        .lineLimit(1).minimumScaleFactor(0.75)
                    // The clock belongs to the SCORE (founder, Aug 5): "LAA 2 ·
                    // BAL 3   ▶ INN 8". Gold while live, neutral once final —
                    // the same weight the verdict slot used to carry it at.
                    if let clock = row.clockText {
                        Text(clock)
                            .font(.system(size: 13, weight: .semibold).monospacedDigit())
                            .foregroundStyle(
                                row.zone == .live || row.zone == .interrupted
                                    ? GaryColors.gold : Color.white.opacity(0.55)
                            )
                            .lineLimit(1).fixedSize()
                    }
                    if row.onWinnersBoard {
                        Image(systemName: "star.fill")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(GaryColors.gold.opacity(0.9))
                            .accessibilityLabel("Winners pick")
                    }
                    // No "THE BIG ONE" tag on the row (founder, Sep 10 2026):
                    // the star already marks a Winners pick; the row's
                    // bigOne flag stays for the marquee, unlabeled here.
                }
                if let call = row.callLine {
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(call.components(separatedBy: "  ·  "), id: \.self) { line in
                            Text(line)
                                .font(.system(size: 13.5, weight: .semibold).monospacedDigit())
                                .foregroundStyle(GaryColors.gold.opacity(0.95))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                } else if let pending = row.pendingLine {
                    // The market line wears GOLD (founder, Aug 4: the board had
                    // "nothing pulling any attention" pre-pick). One step dimmer
                    // + lighter than Gary's call, so the slot speaks gold all
                    // day and the posted call still visibly outranks the market.
                    Text(pending)
                        .font(.system(size: 13, weight: .medium).monospacedDigit())
                        .foregroundStyle(GaryColors.gold.opacity(0.8))
                }
            }
            Spacer(minLength: 8)
            // The status CENTERS on the row (founder, Aug 3): with the hits
            // ledger gone it's a single element against a two-line stack, so
            // top-hugging left a dead corner under it. Centered, it sits
            // between the score and the gold call and binds them — and every
            // row wears the same geometry, live or scheduled.
            // (hitLines data still rides the rows for a future home that
            // doesn't warp the queue.)
            // Empty on a live row Gary has no call on (or hasn't been decided
            // yet) — the slot says how HIS call stands, so it says nothing when
            // there's nothing to stand on, rather than echoing the clock.
            VStack(alignment: .trailing, spacing: 3) {
                HStack(spacing: 8) {
                    if !row.statusText.isEmpty {
                        Text(row.statusText)
                            .font(.system(size: 13.5, weight: .semibold).monospacedDigit())
                            .foregroundStyle(row.statusColor)
                            .lineLimit(1).fixedSize()
                    }
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.62))
                }
                if showLeague {
                    Text(row.league)
                        .font(.system(size: 10, weight: .heavy).monospacedDigit())
                        .tracking(1.2)
                        .foregroundStyle(Self.leagueColor(row.league))
                        .fixedSize()
                }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .contentShape(Rectangle())
    }

    /// The sport's accent, the one its pick cards wear: MLB's grass, the
    /// NFL's blue, college red.
    static func leagueColor(_ league: String) -> Color {
        league.uppercased() == "MLB" ? GaryColors.mlbGrass : Sport.from(league: league).accentColor
    }
}

