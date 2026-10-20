import SwiftUI

// MARK: - NBA game intelligence
//
// The NBA game page under the pick (founder, Oct 20 2026: "the Picks page for
// NBA has very little below the pick compared to MLB NFL and NCAAF"). It mounts
// the modules MLB and football mount, in their order: THE STARS (each team's
// lead player, the books' highest points line, with Gary's take), THE NEWS,
// THE BIG NUMBERS rail (the two teams side by side), THE HEAD-TO-HEAD, PLAYER
// INTEL, AVAILABILITY, THE LINE and MORE INTEL. Every value is a stored lane
// row (nbaStars, nbaTeamTape, nbaOwned, nbaBeneficiary, nbaRestFatigue), the
// wire, a player card or the odds ledger; a module without its rows is absent.

struct NBAGameIntelView: View {
    let matchup: String
    let picks: [GaryPick]
    let row: TomorrowBoardRow?
    let edges: [Signal]
    var wire: [SupabaseAPI.WireItem] = []
    var gameDate: String? = nil
    var scheduledGameID: Int? = nil
    var scheduledTip: Date? = nil

    @State private var starCard: ScoutArmsPlate?

    private var primaryPick: GaryPick? { picks.first }

    private var exactGameID: String? {
        let ids = [scheduledGameID.map(String.init), primaryPick?.game_id.map(String.init), row?.bdl_game_id.map(String.init)]
            .compactMap { $0 }
        guard let first = ids.first, ids.allSatisfy({ $0 == first }) else { return nil }
        return first
    }

    private var sides: (away: String, home: String) {
        let split = matchup.components(separatedBy: " @ ")
        let away = primaryPick?.awayTeam ?? split.first ?? row?.away_team ?? "Away"
        let home = primaryPick?.homeTeam ?? (split.count > 1 ? split[1] : nil) ?? row?.home_team ?? "Home"
        return (away, home)
    }
    private var awayAbbr: String { scoreboardTeamAbbreviation(sides.away, stored: row?.away_abbr, league: "NBA") }
    private var homeAbbr: String { scoreboardTeamAbbreviation(sides.home, stored: row?.home_abbr, league: "NBA") }

    /// This game's rows: the exact provider id when the page has one, else the abbreviations.
    private func matchesThisGame(_ s: Signal) -> Bool {
        if let exactGameID { return s.gameId == exactGameID }
        let g = s.game.uppercased()
        return !g.isEmpty && g.contains(awayAbbr.uppercased()) && g.contains(homeAbbr.uppercased())
    }
    private var mine: [Signal] { edges.filter(matchesThisGame) }

    // ── THE STARS ────────────────────────────────────────────────────────
    private var starsRow: Signal? { mine.first { $0.kind == .nbaStars } }

    private static func one(_ v: Double) -> String {
        v == v.rounded() ? String(format: "%.0f", v) : String(format: "%.1f", v)
    }

    private func plate(side: String) -> ScoutArmsPlate? {
        guard let s = starsRow?.lane?.stars?.value?.first(where: { $0.side == side }),
              let name = s.name, !name.isEmpty else { return nil }
        let window = s.scope == "this season" ? "this season" : "last season"
        var stacks: [ScoutArmsStack] = []
        if let v = s.pts { stacks.append(ScoutArmsStack(label: "Points · \(window)", value: Self.one(v))) }
        if let v = s.reb { stacks.append(ScoutArmsStack(label: "Rebounds", value: Self.one(v))) }
        if let v = s.ast { stacks.append(ScoutArmsStack(label: "Assists", value: Self.one(v))) }
        if let v = s.line { stacks.append(ScoutArmsStack(label: "Points line tonight", value: Self.one(v))) }
        return ScoutArmsPlate(name: name.uppercased(), stacks: stacks, playerId: s.player_id, fullName: name, team: s.team)
    }

    // ── THE NEWS: one wire line per team, today's injury first ──────────────
    private var newsLines: [String] {
        guard let today = gameDate else { return [] }
        func line(_ full: String) -> String? {
            guard let nickname = full.components(separatedBy: " ").last?.lowercased(), !nickname.isEmpty else { return nil }
            let mineWire = wire.filter { ($0.league ?? "").uppercased() == "NBA" && ($0.headline ?? "").lowercased().contains(nickname) }
            let injuries = mineWire.filter { $0.kind == "injury" }
            if let inj = injuries.first(where: { $0.date == today }) ?? injuries.first { return inj.headline }
            return mineWire.first(where: { $0.date == today })?.headline
        }
        var out: [String] = []
        for h in [line(sides.away), line(sides.home)].compactMap({ $0 }) where !out.contains(h) { out.append(h) }
        return out
    }

    // ── THE BIG NUMBERS: the two teams side by side, five rows ───────────────
    private var bigNumberRows: [ScoutBigNumberRow] {
        var seen: Set<String> = []
        return mine.filter { $0.kind == .nbaTape && seen.insert($0.headline.lowercased()).inserted }
            .prefix(5)
            .map { ScoutBigNumberRow(id: "tape-\($0.id)", numeral: $0.value, bold: $0.headline, rest: "") }
    }

    // ── AVAILABILITY: the injury report by team ("… is OUT for BOS") ─────────
    private func injuries(abbr: String) -> [Signal] {
        mine.filter { s in
            guard s.kind == .injury, let r = s.headline.range(of: #"\bfor ([A-Z]{2,4})$"#, options: .regularExpression) else { return false }
            return s.headline[r].dropFirst(4).uppercased() == abbr.uppercased()
        }
    }

    // ── MORE INTEL: what the sections above don't show ──────────────────────
    private var moreIntel: [Signal] {
        let shown: Set<SignalKind> = [.nbaStars, .nbaTape, .h2h, .injury]
        return Array(mine.filter { !shown.contains($0.kind) }.prefix(6))
    }

    private var lineAnchor: LineGaryAnchor? {
        guard let text = primaryPick?.pick?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        return LineGaryAnchor(label: text, postedAt: nil)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let take = starsRow?.detail.trimmingCharacters(in: .whitespacesAndNewlines), !take.isEmpty,
               plate(side: "away") != nil || plate(side: "home") != nil {
                ScoutArmsLayout(title: "THE STARS", take: take,
                                left: plate(side: "away"), right: plate(side: "home"),
                                onName: { starCard = $0 })
                    .background(Color.clear.sheet(item: $starCard) { p in
                        if let id = p.playerId.flatMap({ Int($0) }) {
                            PlayerInsightSheet(signal: nil, directPlayerId: id, directName: p.fullName ?? p.name,
                                               directLeague: "NBA", directGameId: exactGameID)
                        } else {
                            PlayerCardByName(name: p.fullName ?? p.name, league: "NBA")
                        }
                    })
            }
            if !newsLines.isEmpty {
                ScoutNewsCard(text: newsLines.joined(separator: " "))
            }
            ScoutBigNumbersRail(rows: bigNumberRows)
            GameH2HSection(edges: mine)
            PlayerIntelSection(matchup: matchup, league: "NBA", gameId: exactGameID, gameDate: gameDate)
            NBAAvailabilityCard(awayLabel: awayAbbr, homeLabel: homeAbbr,
                                away: injuries(abbr: awayAbbr), home: injuries(abbr: homeAbbr))
            if let gameID = exactGameID, let date = ExactGameIdentity.easternDate(of: scheduledTip) ?? gameDate {
                LineLadderCard(sportKey: "basketball_nba", gameDate: date, gameID: gameID, league: "NBA",
                               awayAbbr: awayAbbr, homeAbbr: homeAbbr, kickoff: scheduledTip, gary: lineAnchor)
            }
            if !moreIntel.isEmpty {
                EdgesSection(title: "MORE INTEL", edges: moreIntel, contained: true).padding(.top, 8)
            }
        }
    }
}

/// AVAILABILITY for an NBA game: each team's injury report, one line a player
/// (name and status); a tap opens the report's own note. Absent when neither
/// team lists anyone.
private struct NBAAvailabilityCard: View {
    let awayLabel: String
    let homeLabel: String
    let away: [Signal]
    let home: [Signal]
    @State private var open: Set<UUID> = []

    private static func name(_ s: Signal) -> String {
        s.headline.components(separatedBy: " is ").first ?? s.headline
    }

    @ViewBuilder private func column(_ label: String, _ rows: [Signal]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label)
                .font(GaryFonts.data(10, .semibold)).tracking(1.1)
                .foregroundStyle(.white.opacity(0.5))
                .padding(.bottom, 6)
            if rows.isEmpty {
                Text("None listed")
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.45))
                    .padding(.vertical, 6)
            }
            ForEach(rows, id: \.id) { s in
                Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                Button {
                    if open.contains(s.id) { open.remove(s.id) } else { open.insert(s.id) }
                } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(Self.name(s))
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(ScoutMock.warm)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(s.value.uppercased())
                            .font(GaryFonts.data(10, .semibold)).tracking(0.8)
                            .foregroundStyle(s.value.uppercased() == "OUT" ? GaryColors.loss : GaryColors.sweating)
                        if open.contains(s.id) {
                            Text(s.detail)
                                .font(.system(size: 12.5))
                                .foregroundStyle(.white.opacity(0.7))
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(.top, 2)
                        }
                    }
                    .padding(.vertical, 7)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    var body: some View {
        if !away.isEmpty || !home.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("AVAILABILITY")
                    .font(GaryFonts.display(13)).tracking(0.8)
                    .foregroundStyle(GaryColors.gold)
                HStack(alignment: .top, spacing: 16) {
                    column(awayLabel, away)
                    column(homeLabel, home)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ScoutMock.cardShape)
            .padding(.horizontal, 16)
        }
    }
}
