import SwiftUI

// ─────────────────────────────────────────────────────────────────────────────
// HOME ADDITIONS (Jul 26 2026, founder green-light): the five modules that
// join the front page — the receipts line, YOUR NIGHT (open slips with live
// state + the streak), the Fantasy Corner teaser, the Wire mini-feed, and
// the leaderboard podium. Every module is self-fetching, cancellation-safe
// (never latches an empty async result), and renders NOTHING when its data
// is absent — Home never shows an empty frame.
// ─────────────────────────────────────────────────────────────────────────────

// (THE RECEIPTS LINE removed Aug 4 2026 — founder: "needs to be removed".
// The proof-of-post claim lives on in the Winners day card's manifest.)

// ── YOUR NIGHT ──────────────────────────────────────────────────────────────
// The user's open slips with live game state + the streak's day. The single
// stickiest thing on the page: your action, breathing, on the front door.
struct HomeYourNight: View {
    var onOpenBook: () -> Void
    @State private var slips: [UserBet] = []
    @State private var streak: UserBookAPI.UserStreak? = nil
    @State private var todayPicks: [GaryPick] = []
    @State private var liveScores: [LiveScore] = []
    @State private var loaded = false

    private var showable: Bool {
        !slips.isEmpty || (streak?.current ?? 0) > 0
    }

    var body: some View {
        if loaded, showable {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Text("YOUR NIGHT")
                        .font(GaryFonts.mono(10, bold: true)).tracking(1.2)
                        .foregroundStyle(Color(hex: "#E5844B"))
                    if let s = streak, s.current > 0 {
                        Text("· DAY \(s.current) OF THE STREAK")
                            .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                            .foregroundStyle(.white.opacity(0.5))
                    }
                    Spacer()
                    Button(action: onOpenBook) {
                        Text("YOUR BOOK")
                            .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                            .foregroundStyle(GaryColors.gold)
                    }
                    .buttonStyle(.plain)
                }
                ForEach(slips.prefix(3)) { bet in
                    HStack(spacing: 10) {
                        Text(bet.kind == "fade" ? "FADE" : bet.kind == "tail" ? "TAIL" : "YOURS")
                            .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
                            .foregroundStyle(bet.kind == "fade" ? Color(hex: "#8B93A7") : GaryColors.gold)
                            .frame(width: 36, alignment: .leading)
                        Text(bet.pick_text)
                            .font(GaryFonts.text(13))
                            .foregroundStyle(.white.opacity(0.88))
                            .lineLimit(1).minimumScaleFactor(0.75)
                        if bet.streak_pick == true {
                            Text("STREAK")
                                .font(GaryFonts.mono(8, bold: true)).tracking(0.6)
                                .foregroundStyle(Color(hex: "#E5844B"))
                        }
                        Spacer(minLength: 8)
                        slipTrailing(bet)
                    }
                }
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 12).fill(Color(hex: "#E5844B").opacity(0.06)))
            .pageGutter()
        } else if !loaded {
            Color.clear.frame(width: 0, height: 0)
                .task { await load() }
        }
    }

    @ViewBuilder private func slipTrailing(_ bet: UserBet) -> some View {
        if let live = liveScore(for: bet) {
            if live.isLive {
                HStack(spacing: 4) {
                    Circle().fill(GaryColors.loss).frame(width: 5, height: 5)
                    Text("\(live.away_score ?? 0)-\(live.home_score ?? 0)\(live.detail.map { " · \($0)" } ?? "")")
                        .font(GaryFonts.mono(10, bold: true))
                        .foregroundStyle(.white.opacity(0.8))
                }
            } else if live.isFinal {
                Text("SETTLING")
                    .font(GaryFonts.mono(8.5, bold: true)).tracking(0.6)
                    .foregroundStyle(.white.opacity(0.45))
            } else if let t = startTime(bet) {
                Text(t).font(GaryFonts.mono(10, bold: true)).foregroundStyle(.white.opacity(0.5))
            }
        } else if let t = startTime(bet) {
            Text(t).font(GaryFonts.mono(10, bold: true)).foregroundStyle(.white.opacity(0.5))
        } else {
            Text("OPEN")
                .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
                .foregroundStyle(.white.opacity(0.35))
        }
    }

    private func liveScore(for bet: UserBet) -> LiveScore? {
        guard bet.game_date == SupabaseAPI.todayEST(), bet.pick_type == "game" else { return nil }
        guard let gid = todayPicks.first(where: { ($0.pick ?? "") == bet.pick_text })?.game_id else { return nil }
        return liveScores.first { $0.game_id == String(gid) }
    }

    private func startTime(_ bet: UserBet) -> String? {
        guard let lock = bet.lock_at else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let d = iso.date(from: lock) ?? ISO8601DateFormatter().date(from: lock) else { return nil }
        let f = DateFormatter()
        f.dateFormat = "h:mm a"
        f.timeZone = TimeZone(identifier: "America/New_York")
        return f.string(from: d)
    }

    @MainActor private func load() async {
        defer { loaded = true }
        guard AuthManager.shared.bearerToken != nil else { return }
        let bets = await UserBookAPI.fetchMyBets()
        let open = bets.filter { $0.isPending && $0.kind != "manual" }
            .sorted { ($0.lock_at ?? "9999") < ($1.lock_at ?? "9999") }
        if !open.isEmpty { slips = open }
        if let s = await UserBookAPI.fetchMyStreak() { streak = s }
        guard !open.isEmpty else { return }
        let today = SupabaseAPI.todayEST()
        if let picks = try? await SupabaseAPI.fetchDailyPicks(date: today), !picks.isEmpty {
            todayPicks = picks
        }
        let scores = await SupabaseAPI.fetchLiveScores(date: today)
        if let scores, !scores.isEmpty { liveScores = scores }
    }
}

// ── FANTASY CORNER TEASER ───────────────────────────────────────────────────
// ── THE WIRE MINI ───────────────────────────────────────────────────────────
// Three wire headlines (already written 3x daily) — the betting-news pulse
// on the front page, routing into the Hub.
struct HomeWireMini: View {
    let items: [SupabaseAPI.WireItem]
    var onOpen: () -> Void

    var body: some View {
        if !items.isEmpty {
            // Dashboard container (Aug 3): the Wire wears the board's chrome
            // and the shared act-head grammar — no more naked list.
            VStack(alignment: .leading, spacing: 10) {
                // Nameless rule — the rows' own LINE MOVE / INJURY / RESULT
                // chips already say what this is.
                HomeSectionRule()
                VStack(spacing: 0) {
                    ForEach(Array(items.prefix(3).enumerated()), id: \.offset) { i, item in
                        Button(action: onOpen) {
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                // Raw tokens never reach the page ("LINE_MOVE"
                                // wrapped as "LINE_MO VE" — Aug 3). One line,
                                // always: the mono helper floors at 12pt, so
                                // the column is sized for its real render.
                                Text((item.kind ?? "wire").replacingOccurrences(of: "_", with: " ").uppercased())
                                    .font(GaryFonts.mono(8, bold: true)).tracking(0.6)
                                    .foregroundStyle(.white.opacity(0.45))
                                    .lineLimit(1).minimumScaleFactor(0.85)
                                    .frame(width: 76, alignment: .leading)
                                // NO lineLimit — the headline wraps to whatever
                                // it needs (the 2-line cap printed "…", the
                                // hard-law violation, Aug 3 loop 2).
                                Text(item.headline ?? "")
                                    .font(GaryFonts.text(12.5))
                                    .foregroundStyle(.white.opacity(0.85))
                                    .multilineTextAlignment(.leading)
                                    .fixedSize(horizontal: false, vertical: true)
                                Spacer(minLength: 0)
                            }
                            .padding(.horizontal, 14).padding(.vertical, 9)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if i < min(items.count, 3) - 1 {
                            Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1).padding(.leading, 14)
                        }
                    }
                }
                .padding(.vertical, 3)
                .garyPanel(radius: 12)
                .pageGutter()
            }
        }
    }
}
