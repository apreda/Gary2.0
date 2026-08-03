import SwiftUI

// ─────────────────────────────────────────────────────────────────────────────
// HOME ADDITIONS (Jul 26 2026, founder green-light): the five modules that
// join the front page — the receipts line, YOUR NIGHT (open slips with live
// state + the streak), the Fantasy Corner teaser, the Wire mini-feed, and
// the leaderboard podium. Every module is self-fetching, cancellation-safe
// (never latches an empty async result), and renders NOTHING when its data
// is absent — Home never shows an empty frame.
// ─────────────────────────────────────────────────────────────────────────────

// ── THE RECEIPTS LINE ───────────────────────────────────────────────────────
// One quiet line of proof under the morning strip: when today's card was
// first stored vs when the day opens. Data-backed or absent — never claimed.
struct HomeReceiptsLine: View {
    @State private var posted: String? = nil
    @State private var firstPitch: String? = nil

    var body: some View {
        if let posted {
            HStack(spacing: 6) {
                Text("CARD POSTED \(posted)")
                    .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                    .foregroundStyle(GaryColors.gold.opacity(0.85))
                if let firstPitch {
                    Text("· FIRST PITCH \(firstPitch)")
                        .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                        .foregroundStyle(.white.opacity(0.4))
                }
                Text("· NOTHING DELETED")
                    .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                    .foregroundStyle(.white.opacity(0.4))
                Spacer()
            }
            .padding(.horizontal, 20)
        } else {
            Color.clear.frame(width: 0, height: 0)
                .task { await load() }
        }
    }

    private func load() async {
        let today = SupabaseAPI.todayEST()
        guard var comps = URLComponents(url: Secrets.supabaseURL.appendingPathComponent("/rest/v1/daily_picks"),
                                        resolvingAgainstBaseURL: false) else { return }
        comps.queryItems = [URLQueryItem(name: "select", value: "created_at,picks"),
                            URLQueryItem(name: "date", value: "eq.\(today)")]
        guard let url = comps.url else { return }
        var req = URLRequest(url: url)
        req.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(Secrets.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        struct Row: Decodable {
            struct P: Decodable { let commence_time: String? }
            let created_at: String?
            let picks: [P]?
        }
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200,
              let row = (try? JSONDecoder().decode([Row].self, from: data))?.first,
              let created = row.created_at else { return }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let f = DateFormatter()
        f.dateFormat = "h:mm a"
        f.timeZone = TimeZone(identifier: "America/New_York")
        guard let createdDate = iso.date(from: created) ?? ISO8601DateFormatter().date(from: created) else { return }
        let starts = (row.picks ?? []).compactMap { p -> Date? in
            guard let c = p.commence_time else { return nil }
            return iso.date(from: c) ?? ISO8601DateFormatter().date(from: c)
        }
        // The claim only renders when the data actually supports it.
        if let first = starts.min(), createdDate < first {
            posted = f.string(from: createdDate)
            firstPitch = f.string(from: first)
        }
    }
}

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
            .padding(.horizontal, 16)
        } else if !loaded {
            Color.clear.frame(width: 0, height: 0)
                .task { await load() }
        }
    }

    @ViewBuilder private func slipTrailing(_ bet: UserBet) -> some View {
        if let live = liveScore(for: bet) {
            if live.isLive {
                HStack(spacing: 4) {
                    Circle().fill(Color(hex: "#EF4444")).frame(width: 5, height: 5)
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
        if !scores.isEmpty { liveScores = scores }
    }
}

// ── FANTASY CORNER TEASER ───────────────────────────────────────────────────
// One row: today's top add and top cut, straight off the desk. Routes to the
// Hub's FANTASY page.
struct HomeFantasyTeaser: View {
    var onOpen: () -> Void
    @State private var topAdd: String? = nil
    @State private var topCut: String? = nil

    var body: some View {
        if topAdd != nil || topCut != nil {
            Button(action: onOpen) {
                HStack(spacing: 8) {
                    Text("FANTASY CORNER")
                        .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                        .foregroundStyle(GaryColors.gold)
                    if let a = topAdd {
                        Text("Add \(a)")
                            .font(GaryFonts.text(12.5, .semibold))
                            .foregroundStyle(.white.opacity(0.85))
                            .lineLimit(1).minimumScaleFactor(0.8)
                    }
                    if topAdd != nil && topCut != nil {
                        Text("·").foregroundStyle(.white.opacity(0.3))
                    }
                    if let c = topCut {
                        Text("Cut \(c)")
                            .font(GaryFonts.text(12.5, .semibold))
                            .foregroundStyle(Color(hex: "#EF4444").opacity(0.9))
                            .lineLimit(1).minimumScaleFactor(0.8)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.4))
                }
                .padding(.horizontal, 20).padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } else {
            Color.clear.frame(width: 0, height: 0)
                .task { await load() }
        }
    }

    @MainActor private func load() async {
        let today = SupabaseAPI.todayEST()
        guard let conns = try? await SupabaseAPI.fetchInsightConnections(date: today, league: "MLB"),
              !conns.isEmpty else { return }
        let adds = conns.filter { ($0.category ?? "") == "fantasy_pickups" }
        let cuts = conns.filter { ($0.category ?? "") == "cut_list" }
        topAdd = adds.max { ($0.relevance_score ?? 0) < ($1.relevance_score ?? 0) }?.headline
        topCut = cuts.max { ($0.relevance_score ?? 0) < ($1.relevance_score ?? 0) }?.headline
    }
}

// ── THE WIRE MINI ───────────────────────────────────────────────────────────
// Three wire headlines (already written 3x daily) — the betting-news pulse
// on the front page, routing into the Hub.
struct HomeWireMini: View {
    var onOpen: () -> Void
    @State private var items: [SupabaseAPI.WireItem] = []

    var body: some View {
        if !items.isEmpty {
            // Dashboard container (Aug 3): the Wire wears the board's chrome
            // and the shared act-head grammar — no more naked list.
            VStack(alignment: .leading, spacing: 10) {
                HomeActHead(title: "The Wire", count: items.count)
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
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(GaryColors.warmWhite.opacity(0.03))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(GaryColors.warmWhite.opacity(0.07), lineWidth: 1))
                )
                .padding(.horizontal, 16)
            }
        } else {
            Color.clear.frame(width: 0, height: 0)
                .task {
                    let rows = await SupabaseAPI.fetchWireItems(date: SupabaseAPI.todayEST(), limit: 3)
                    if !rows.isEmpty { items = rows }
                }
        }
    }
}

// ── THE PODIUM ──────────────────────────────────────────────────────────────
// The week's top three verified books. Appears once the standings have
// bodies; routes to the YOU page's full board.
struct HomeLeaderboardPodium: View {
    var onOpen: () -> Void
    @State private var rows: [UserBookAPI.BoardRow] = []

    var body: some View {
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("THE STANDINGS · 7 DAYS")
                        .font(GaryFonts.mono(10, bold: true)).tracking(1.2)
                        .foregroundStyle(GaryColors.gold)
                    Spacer()
                    Button(action: onOpen) {
                        Text("FULL BOARD")
                            .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                            .foregroundStyle(.white.opacity(0.5))
                    }
                    .buttonStyle(.plain)
                }
                ForEach(Array(rows.prefix(3).enumerated()), id: \.element.id) { i, r in
                    HStack(spacing: 10) {
                        Text("\(i + 1)")
                            .font(GaryFonts.mono(10, bold: true))
                            .foregroundStyle(i == 0 ? GaryColors.gold : .white.opacity(0.45))
                            .frame(width: 14, alignment: .leading)
                        Text(r.display_name)
                            .font(GaryFonts.text(12.5, .semibold))
                            .foregroundStyle(.white.opacity(0.88))
                            .lineLimit(1)
                        Spacer()
                        Text("\(r.wins)-\(r.losses)")
                            .font(GaryFonts.mono(10.5, bold: true))
                            .foregroundStyle(.white.opacity(0.55))
                        Text(String(format: "%+.1fu", r.units))
                            .font(GaryFonts.mono(10.5, bold: true))
                            .foregroundStyle(r.units >= 0 ? Color(hex: "#22C55E") : Color(hex: "#EF4444"))
                    }
                }
            }
            .padding(.horizontal, 20)
        } else {
            Color.clear.frame(width: 0, height: 0)
                .task {
                    let board = await UserBookAPI.fetchLeaderboard(window: "7d")
                    if !board.isEmpty { rows = board }
                }
        }
    }
}
