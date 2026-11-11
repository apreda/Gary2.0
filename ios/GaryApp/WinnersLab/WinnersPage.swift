import SwiftUI

// WINNERS, the page (founder GO, Nov 10 2026, "version A"): three views under one
// title. Tonight is one play a card, turned sideways. A new play lands sealed and
// opens with the reveal; once open it stays open. Nothing is captioned that the
// card already shows (founder, same day: "if it's visually being shown, we don't
// need to write it").

/// One of the day's plays as the page draws it.
struct WPlay: Identifiable {
    enum Stage { case sealed, upcoming, live, final }
    let ticket: LabBoardTicket
    let stage: Stage
    /// "won" / "lost" / "push" once graded.
    var result: String? = nil
    var live: LiveScore? = nil
    /// The clock a live game shows ("Q1 2:41").
    var liveDetail: String? = nil
    var isFree = false
    /// The largest stake on the day's card.
    var biggest = false
    var id: String { String(ticket.candidateID) }
}

extension WPlay {
    struct Words { let who: String; let number: String; let what: String? }
    struct Cover { let mine: Int; let theirs: Int; let need: Double; let moneyline: Bool }

    var league: String { ticket.league.uppercased() }
    var stake: Double { (ticket.stakeUnits ?? 0) * LabFormat.unitDollars }
    var toWin: Double { stake * LabFormat.payout(ticket.price) }
    var net: Double? {
        switch result {
        case "won": return toWin
        case "lost": return -stake
        case "push": return 0
        default: return nil
        }
    }
    var sides: (away: String, home: String)? {
        let parts = ticket.matchup.components(separatedBy: " @ ").map { $0.trimmingCharacters(in: .whitespaces) }
        return parts.count == 2 && !parts[0].isEmpty && !parts[1].isEmpty ? (parts[0], parts[1]) : nil
    }
    /// "Heat at Jazz".
    var matchupLine: String {
        LabFormat.shortMatchup(ticket.matchup, league: league).replacingOccurrences(of: " @ ", with: " at ")
    }
    /// The side a game pick names, and whether it is the home club.
    var pickedSide: (name: String, home: Bool)? {
        guard ticket.game != nil, let s = sides else { return nil }
        let body = LabFormat.ticketBody(ticket.pickText)
        if LabFormat.pickNames(body, team: s.home) { return (s.home, true) }
        if LabFormat.pickNames(body, team: s.away) { return (s.away, false) }
        return nil
    }
    /// A prop's club as a full name when the matchup names it.
    private var propTeam: String? {
        guard let team = ticket.prop?.team?.trimmingCharacters(in: .whitespaces), !team.isEmpty else { return nil }
        guard let s = sides else { return team }
        for side in [s.away, s.home] {
            if side.localizedCaseInsensitiveContains(team) || team.localizedCaseInsensitiveContains(side) { return side }
            if let code = WTeam.code(side, league: league), code.caseInsensitiveCompare(team) == .orderedSame { return side }
        }
        return team
    }

    /// Who, the number, what: "Giannis Antetokounmpo / Over 12.5 / rebounds", "Boston Celtics / −1.5".
    var words: Words {
        if let prop = ticket.prop {
            if let inning = LabFormat.firstInningWords(player: prop.player, prop: prop.prop, bet: prop.bet) {
                return Words(who: matchupLine, number: inning.lowercased().hasPrefix("no") ? "No run" : "A run", what: "in the 1st inning")
            }
            let line = (prop.line ?? "").trimmingCharacters(in: .whitespaces)
            let number = line.isEmpty ? (LabFormat.trailingNumber(prop.prop) ?? "") : line
            let bet = (prop.bet ?? "").lowercased().contains("under") ? "Under" : "Over"
            let market = LabFormat.marketWords(prop.prop).replacingOccurrences(of: " tds", with: " TDs").replacingOccurrences(of: " td", with: " TD")
            return Words(who: prop.player ?? prop.team ?? "", number: "\(bet) \(number)", what: market)
        }
        let body = LabFormat.ticketBody(ticket.pickText)
        let split = LabFormat.splitDirection(body, league: league)
        if let direction = split.direction {
            let parts = split.body.split(separator: " ", maxSplits: 1).map(String.init)
            return Words(who: matchupLine, number: "\(direction == .over ? "Over" : "Under") \(parts.first ?? "")", what: parts.count > 1 ? parts[1] : nil)
        }
        var tokens = body.split(separator: " ").map(String.init)
        let tail = tokens.popLast() ?? ""
        let team = tokens.joined(separator: " ")
        if tail.uppercased() == "ML" { return Words(who: team, number: "To win", what: nil) }
        if Double(tail) != nil { return Words(who: team, number: W.minus(tail), what: nil) }
        return Words(who: "", number: W.minus(body), what: nil)
    }

    /// The play in one line, for a results row: "Coward over 6.5 rebounds", "Cavaliers −8.5".
    var line: String {
        let w = words
        if let prop = ticket.prop, let player = prop.player, !player.isEmpty, w.what != "in the 1st inning" {
            return "\(PlayerName.split(player).last) \(w.number.lowercased()) \(w.what ?? "")".trimmingCharacters(in: .whitespaces)
        }
        if let side = pickedSide {
            return "\(LabFormat.nickname(side.name)) \(w.number == "To win" ? "to win" : w.number)"
        }
        return [w.number, w.what].compactMap { $0 }.joined(separator: " ")
    }

    /// The name on the play's segment: a surname, a club, or the start time while it is sealed.
    var shortName: String {
        if stage == .sealed {
            let clock = LabFormat.timeET(ticket.commence)
            return clock.isEmpty ? "New pick" : clock
        }
        if let prop = ticket.prop {
            if let player = prop.player, !player.isEmpty {
                // A long surname gives way to the first name ("Giannis"), so every segment sets at one size.
                let name = PlayerName.split(player)
                if name.last.count > 9, let first = name.first, !first.isEmpty, first.count < name.last.count { return first }
                return name.last
            }
            return prop.team ?? "Prop"
        }
        if let side = pickedSide { return LabFormat.nickname(side.name) }
        return words.number
    }

    var glow: Color {
        if ticket.prop != nil, let c = WTeam.color(propTeam, league: league) { return c }
        if let side = pickedSide, let c = WTeam.color(side.name, league: league) { return c }
        if let s = sides, let c = WTeam.color(s.away, league: league) { return c }
        return W.gold
    }
    var badges: [(code: String, color: Color)] {
        func badge(_ team: String?) -> (code: String, color: Color)? {
            guard let team, let code = WTeam.code(team, league: league) else { return nil }
            return (code, WTeam.color(team, league: league) ?? W.bone.opacity(0.3))
        }
        if ticket.prop != nil { return [badge(propTeam)].compactMap { $0 } }
        guard let s = sides else { return [] }
        return [badge(s.away), badge(s.home)].compactMap { $0 }
    }

    /// Gary's numbers for this play, the ones his scorebook circles.
    var numbers: [LabFormat.Reason] {
        Array((ticket.reasons ?? []).filter { !($0.stat ?? "").trimmingCharacters(in: .whitespaces).isEmpty }.prefix(2))
    }
    /// His reasons in the order the reveal uses.
    var reasons: [LabFormat.Reason] {
        if let stored = ticket.reasons, !stored.isEmpty { return Array(stored.prefix(4)) }
        if let brief = ticket.brief, !brief.reasons.isEmpty { return brief.reasons.prefix(4).map { LabFormat.Reason(claim: $0, why: "") } }
        return LabFormat.reasons(from: ticket.game?.rationale ?? ticket.prop?.analysis, count: 3)
    }

    /// "Tips in 25 min" inside the hour, the clock before that.
    func startText(now: Date) -> String? {
        guard let start = LabFormat.parseISO(ticket.commence) else { return nil }
        let minutes = start.timeIntervalSince(now) / 60
        if minutes > 0, minutes < 60, let countdown = LabFormat.countdown(to: ticket.commence, now: now) {
            let verb: String
            switch league {
            case "NBA", "NCAAB": verb = "Tips"
            case "NFL", "NCAAF": verb = "Kicks off"
            case "MLB": verb = "First pitch"
            default: verb = "Starts"
            }
            return "\(verb) \(countdown)"
        }
        let clock = LabFormat.timeET(ticket.commence)
        return clock.isEmpty ? nil : clock
    }

    /// A side bet from Gary's end, live or finished: his club's score, the other's, and what he needs to win by.
    var cover: Cover? {
        guard let side = pickedSide else { return nil }
        let a: Int, h: Int
        if let away = ticket.outcome?.away_score, let home = ticket.outcome?.home_score { a = away; h = home }
        else if let away = live?.away_score, let home = live?.home_score { a = away; h = home }
        else { return nil }
        let tail = LabFormat.ticketBody(ticket.pickText).split(separator: " ").last.map(String.init) ?? ""
        let moneyline = tail.uppercased() == "ML"
        guard moneyline || Double(tail) != nil else { return nil }
        return Cover(mine: side.home ? h : a, theirs: side.home ? a : h, need: moneyline ? 0 : -(Double(tail) ?? 0), moneyline: moneyline)
    }

    /// A graded prop from Gary's end: what the player finished with, and how far that is from the number.
    var propFinish: (actual: Double, status: String)? {
        guard stage == .final, let prop = ticket.prop, let actual = ticket.outcome?.actual_value?.value,
              LabFormat.firstInningWords(player: prop.player, prop: prop.prop, bet: prop.bet) == nil,
              let line = Double((prop.line ?? "").trimmingCharacters(in: .whitespaces)) ?? LabFormat.trailingNumber(prop.prop).flatMap({ Double($0) })
        else { return nil }
        let diff = actual - line
        if diff == 0 { return (actual, "push") }
        let under = (prop.bet ?? "").lowercased().contains("under")
        let amount = LabFormat.trim(abs(diff))
        return (actual, diff > 0 ? "over by \(amount)" : under ? "under by \(amount)" : "short by \(amount)")
    }

    /// How it finished: "Hornets 124, Cavaliers 112", "Finished with 6".
    var finalDetail: String? {
        guard let outcome = ticket.outcome else { return nil }
        if ticket.isProp {
            guard let value = outcome.actual_value?.value else { return nil }
            return "Finished with \(LabFormat.trim(value))"
        }
        guard let h = outcome.home_score, let a = outcome.away_score, let s = sides else { return outcome.final_score }
        let home = LabFormat.nickname(s.home), away = LabFormat.nickname(s.away)
        return h >= a ? "\(home) \(h), \(away) \(a)" : "\(away) \(a), \(home) \(h)"
    }
}

/// A play the fan cannot open yet: the server counts it and says nothing else.
struct WLocked: Identifiable {
    let league: String
    let index: Int
    var id: String { "locked-\(league)-\(index)" }
}

// MARK: - Tonight

struct WinnersTonight: View {
    let plays: [WPlay]
    let locked: [WLocked]
    /// Leagues on today's card, when there is more than one.
    let sports: [String]
    @Binding var sport: String
    @Binding var selection: String
    let nextGame: ComingWindow?
    let loading: Bool
    /// Set when today's card could not be read at all.
    var failed = false
    let now: Date
    /// What the dock covers at the foot of the page.
    var dock: CGFloat = 62
    /// Lays the page out as a short phone does, whatever the phone.
    var forceScroll = false
    var onRetry: () -> Void = {}
    let onOpen: (LabBoardTicket) -> Void
    let onWhy: (WPlay) -> Void
    let onUnlock: (String) -> Void

    private struct Item: Identifiable {
        enum Kind { case play(WPlay), locked(WLocked), empty }
        let id: String
        let kind: Kind
    }
    private var items: [Item] {
        let open = plays.map { Item(id: $0.id, kind: .play($0)) } + locked.map { Item(id: $0.id, kind: .locked($0)) }
        return open.isEmpty ? [Item(id: "empty", kind: .empty)] : open
    }
    private var segments: [WSegments.Item] {
        // A sealed play is known by its money, and by its league while the page shows more than one.
        let manyLeagues = sports.count > 1 && !sports.contains(sport)
        return plays.map { play in
            WSegments.Item(id: play.id,
                           title: play.stage == .sealed ? (manyLeagues ? "\(play.league) " : "") + W.dollars(play.stake) : play.shortName,
                           dot: play.stage == .live || play.live?.isLive == true ? W.win : play.stage == .sealed ? W.gold : nil)
        } + locked.map { WSegments.Item(id: $0.id, title: $0.league, lock: true) }
    }

    var body: some View {
        GeometryReader { geo in
            // A card needs about 410 pt to set every line at its own size. A tall phone holds the
            // page on one screen; a short one scrolls it.
            let above: CGFloat = 91 + (sports.count > 1 ? 42 : 0) + (items.count > 1 ? 62 : 0)
            let fits = !forceScroll && geo.size.height - dock - above >= 410
            if fits {
                page(cardHeight: nil, inScroll: false).padding(.bottom, dock)
            } else {
                ScrollView(showsIndicators: false) { page(cardHeight: forceScroll ? 620 : 452, inScroll: true).padding(.bottom, dock + 24) }
            }
        }
        .onAppear(perform: settle)
        .onChange(of: items.map(\.id)) { _ in settle() }
    }

    /// Keeps the selection on a card that exists.
    private func settle() {
        guard !items.contains(where: { $0.id == selection }) else { return }
        // The first play still to come leads; a finished card leads only when nothing is left.
        let next = plays.first { $0.stage != .final }?.id ?? items.first?.id ?? ""
        if selection != next { selection = next }
    }

    private func page(cardHeight: CGFloat?, inScroll: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            money.padding(.horizontal, 20).padding(.top, 10)
            if sports.count > 1 { sportRow.padding(.horizontal, 20).padding(.top, 10) }
            if items.count > 1 {
                WSegments(items: segments, selection: $selection).padding(.horizontal, 20).padding(.top, 14)
            }
            WPager(items: items, selection: $selection, inScroll: inScroll) { item in
                switch item.kind {
                case .play(let play):
                    WPlayCard(play: play, now: now, onOpen: { onOpen(play.ticket) }, onWhy: { onWhy(play) })
                case .locked(let lock):
                    WLockedCard(league: lock.league) { onUnlock(lock.league) }
                case .empty:
                    WEmptyCard(nextGame: nextGame, loading: loading, failed: failed, onRetry: onRetry)
                }
            }
            .frame(height: cardHeight)
            .frame(maxHeight: cardHeight == nil ? .infinity : nil)
            .padding(.top, 14)
        }
    }

    /// Two numbers: what Gary has bet today and what it wins, or how the day is going once plays settle.
    private var money: some View {
        let counted = plays
        let staked = counted.reduce(0) { $0 + $1.stake }
        let settled = counted.compactMap(\.net)
        let open = counted.filter { $0.net == nil }
        let net = settled.reduce(0, +)
        let count = counted.count
        let playsWord = count == 1 ? "1 play" : "\(count) plays"
        return HStack(alignment: .bottom) {
            if counted.isEmpty {
                figure("$0", caption: "bet so far today", color: W.dim, gold: false)
            } else if open.isEmpty {
                figure(W.dollars(net, signed: true), caption: "final on \(playsWord)", color: net > 0.49 ? W.win : net < -0.49 ? W.loss : W.bone, gold: false)
            } else {
                figure(W.dollars(staked), caption: "bet on \(playsWord)", color: W.gold, gold: true)
            }
            Spacer(minLength: 12)
            if !counted.isEmpty {
                if open.isEmpty {
                    figure(W.dollars(staked), caption: "bet", color: W.bone, gold: false, trailing: true)
                } else if settled.isEmpty {
                    figure(W.dollars(open.reduce(0) { $0 + $1.toWin }), caption: "to win", color: W.bone, gold: false, trailing: true)
                } else {
                    figure(W.dollars(net, signed: true), caption: "so far", color: net > 0.49 ? W.win : net < -0.49 ? W.loss : W.bone, gold: false, trailing: true)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
    private func figure(_ value: String, caption: String, color: Color, gold: Bool, trailing: Bool = false) -> some View {
        VStack(alignment: trailing ? .trailing : .leading, spacing: 6) {
            Group {
                if gold { Text(value).wGold() } else { Text(value).foregroundStyle(color) }
            }
            .font(W.wide(34)).tracking(-0.85).fitsOneLine().wTight(34)
            Text(caption).font(W.text(14)).foregroundStyle(W.dim).fitsOneLine()
        }
    }

    /// The day's leagues, when it has more than one.
    private var sportRow: some View {
        HStack(spacing: 20) {
            ForEach([""] + sports, id: \.self) { item in
                Button { withAnimation(.easeInOut(duration: 0.2)) { sport = item } } label: {
                    Text(item.isEmpty ? "All" : item).font(W.text(16, .semibold))
                        .foregroundStyle(item == sport ? W.bone : W.faint)
                        .frame(height: 44).contentShape(Rectangle()).padding(.vertical, -6)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(item == sport ? .isSelected : [])
            }
            Spacer(minLength: 0)
        }
    }
}

// MARK: - The play card

struct WPlayCard: View {
    let play: WPlay
    let now: Date
    let onOpen: () -> Void
    let onWhy: () -> Void

    var body: some View {
        Group {
            if play.stage == .sealed { sealed } else { open }
        }
        .wCard(glow: play.stage == .sealed ? W.gold : play.glow, strength: play.stage == .sealed ? 0.34 : 0.58)
        .contentShape(Rectangle())
    }

    // MARK: Open

    private var open: some View {
        VStack(alignment: .leading, spacing: 0) {
            head
            if play.stage == .live || play.stage == .final, let cover = play.cover {
                liveBody(cover)
            } else if let finish = play.propFinish {
                propFinalBody(finish)
            } else {
                pickBody
            }
            Spacer(minLength: 10)
            WTrio(cells: trio).padding(.bottom, 14)
            WGlassButton(title: play.stage == .final ? "Why Gary liked it" : "Why Gary likes it", action: onWhy)
        }
        .padding(.horizontal, 20).padding(.top, 16).padding(.bottom, 14)
        .accessibilityElement(children: .contain)
    }

    private var head: some View {
        HStack(spacing: 9) {
            let badges = play.badges
            if play.ticket.isProp || badges.count != 2 {
                ForEach(Array(badges.enumerated()), id: \.offset) { _, badge in WBadge(code: badge.code, color: badge.color) }
                Text(play.matchupLine).font(W.text(16, .semibold)).foregroundStyle(W.bone).fitsOneLine()
            } else {
                // The two clubs say the matchup; the line under them names Gary's side.
                WBadge(code: badges[0].code, color: badges[0].color)
                Text("at").font(W.text(16, .semibold)).foregroundStyle(W.dim)
                WBadge(code: badges[1].code, color: badges[1].color)
            }
            Spacer(minLength: 6)
            switch play.stage {
            case .live:
                // Over, the grade still to come: no live dot.
                if play.liveDetail == "Final" { WChip(text: "Final") }
                else { WChip(text: play.liveDetail ?? "Live", live: true, tint: W.win) }
            case .final:
                WChip(text: "Final")
            default:
                if let text = play.startText(now: now) { WChip(text: text, icon: "clock") }
            }
        }
    }

    /// Who, the number, what; then Gary's own numbers.
    private var pickBody: some View {
        let words = play.words
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(words.who).font(W.text(18, .semibold)).foregroundStyle(W.bone).fitsOneLine()
                Spacer(minLength: 8)
                if play.isFree { Text("Free pick").font(W.text(14, .semibold)).foregroundStyle(W.dim).fixedSize() }
            }
            .padding(.top, 14)
            // A short number takes the room a long one would.
            let big: CGFloat = words.number.count <= 4 ? 80 : 56
            Text(words.number).font(W.wide(big)).tracking(big == 80 ? -2 : -1.4)
                .foregroundStyle(W.bone).fitsOneLine().wTight(big).padding(.top, 4)
            if let what = words.what, !what.isEmpty {
                Text(what).font(W.wideBold(24)).tracking(-0.3).foregroundStyle(W.dim).fitsOneLine().padding(.top, 2)
            }
            if play.stage == .final {
                finished.padding(.top, 18)
                // His numbers stay on the card when it has the room for them.
                ViewThatFits(in: .vertical) {
                    VStack(alignment: .leading, spacing: 0) { Spacer(minLength: 14); proof }
                    Color.clear.frame(height: 0)
                }
            } else {
                Spacer(minLength: 10)
                proof
            }
        }
    }

    @ViewBuilder private var proof: some View {
        let numbers = play.numbers
        if numbers.count == 2 {
            HStack(alignment: .top, spacing: 0) {
                ForEach(Array(numbers.enumerated()), id: \.offset) { i, reason in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(W.minus(reason.stat ?? "")).font(W.wide(28)).tracking(-0.7).foregroundStyle(W.bone).fitsOneLine().wTight(28)
                        Text(reason.note ?? reason.claim).font(W.text(14)).foregroundStyle(W.dim)
                            .fitsLines(2).fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.leading, i == 0 ? 0 : 14).padding(.trailing, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(alignment: .leading) { if i > 0 { Rectangle().fill(W.hair).frame(width: 1) } }
                }
            }
        } else {
            let claims = play.reasons.map(\.claim).filter { !$0.isEmpty }.prefix(3)
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(claims.enumerated()), id: \.offset) { _, claim in
                    Text(claim).font(W.text(16)).foregroundStyle(W.bone.opacity(0.86))
                        .fitsLines(2).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    /// A graded prop: the play in a line, what the player finished with, how far from the number.
    private func propFinalBody(_ finish: (actual: Double, status: String)) -> some View {
        let tone = play.result == "won" ? W.win : play.result == "lost" ? W.loss : W.bone
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(play.line).font(W.text(18, .semibold)).foregroundStyle(W.bone)
                    .fitsLines(2).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                if play.isFree { Text("Free pick").font(W.text(14, .semibold)).foregroundStyle(W.dim).fixedSize() }
            }
            .padding(.top, 14)
            Text(LabFormat.trim(finish.actual)).font(W.wide(72)).tracking(-1.8).foregroundStyle(W.bone)
                .fitsOneLine().wTight(72).padding(.top, 4)
            Text(finish.status).font(W.wideBold(24)).tracking(-0.3).foregroundStyle(tone).fitsOneLine().padding(.top, 2)
            // His numbers stay on the card when it has the room for them.
            ViewThatFits(in: .vertical) {
                VStack(alignment: .leading, spacing: 0) { Spacer(minLength: 14); proof }
                Color.clear.frame(height: 0)
            }
        }
    }

    /// A graded play: the mark and how it finished.
    private var finished: some View {
        HStack(spacing: 12) {
            WMark(result: play.result)
            Text(play.finalDetail ?? (play.result == "push" ? "Push" : "")).font(W.text(16, .medium)).foregroundStyle(W.bone)
                .fitsLines(2).fixedSize(horizontal: false, vertical: true)
        }
    }

    /// A live side bet: the score from Gary's end, where it stands, and the margin against the number.
    private func liveBody(_ cover: WPlay.Cover) -> some View {
        let margin = Double(cover.mine - cover.theirs)
        let by = margin - cover.need
        let tone = by > 0 ? W.win : by < 0 ? W.loss : W.bone
        let amount = LabFormat.trim(abs(by))
        let over = play.stage == .final || play.liveDetail == "Final"
        let status = over
            ? (by == 0 ? (cover.moneyline ? "tied" : "push")
               : cover.moneyline ? "\(by > 0 ? "won" : "lost") by \(amount)" : "\(by > 0 ? "covered" : "missed") by \(amount)")
            : (by == 0 ? (cover.moneyline ? "tied" : "on the number")
               : cover.moneyline ? "\(by > 0 ? "winning" : "trailing") by \(amount)" : "\(by > 0 ? "covering" : "short") by \(amount)")
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(play.line).font(W.text(18, .semibold)).foregroundStyle(W.bone).fitsOneLine()
                Spacer(minLength: 8)
                if play.isFree { Text("Free pick").font(W.text(14, .semibold)).foregroundStyle(W.dim).fixedSize() }
            }
            .padding(.top, 14)
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text("\(cover.mine)").font(W.wide(72)).tracking(-1.8).foregroundStyle(W.bone)
                Text("to").font(W.wideBold(24)).foregroundStyle(W.dim)
                Text("\(cover.theirs)").font(W.wide(72)).tracking(-1.8).foregroundStyle(W.dim)
            }
            .fitsOneLine().wTight(72).padding(.top, 4)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(cover.mine) to \(cover.theirs)")
            Text(status).font(W.wideBold(24)).tracking(-0.3).foregroundStyle(tone).fitsOneLine().padding(.top, 2)
            Spacer(minLength: 14)
            WCoverMeter(margin: margin, need: cover.need, tone: tone,
                        mine: LabFormat.nickname(play.pickedSide?.name ?? ""),
                        theirs: LabFormat.nickname(play.pickedSide.map { side in (side.home ? play.sides?.away : play.sides?.home) ?? "" } ?? ""))
        }
    }

    private var trio: [WTrio.Cell] {
        var cells = [WTrio.Cell(label: "Gary's bet", value: W.dollars(play.stake), gold: play.net == nil),
                     WTrio.Cell(label: "Odds", value: W.price(play.ticket.price))]
        if let net = play.net {
            cells.append(WTrio.Cell(label: play.result == "won" ? "Won" : play.result == "lost" ? "Lost" : "Push",
                                    value: W.dollars(net, signed: true), tint: net > 0.49 ? W.win : net < -0.49 ? W.loss : W.bone))
        } else {
            cells.append(WTrio.Cell(label: "To win", value: W.dollars(play.toWin)))
        }
        return cells
    }

    // MARK: Sealed

    private var sealed: some View {
        VStack(spacing: 0) {
            HStack {
                Text("New pick").font(W.text(16, .semibold)).foregroundStyle(W.bone)
                Spacer(minLength: 8)
                if play.result != nil || play.live?.isFinal == true {
                    WChip(text: "Final")
                } else if play.live?.isLive == true {
                    WChip(text: play.liveDetail ?? "Live", live: true, tint: W.win)
                } else if let text = play.startText(now: now) {
                    WChip(text: text, icon: "clock")
                }
            }
            .padding(.horizontal, 20).frame(height: 66)
            .background(alignment: .top) { WTearStrip().frame(height: 74) }
            Spacer(minLength: 10)
            Image(GaryBrand.mark).resizable().scaledToFit().frame(width: 96, height: 96)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .shadow(color: .black.opacity(0.6), radius: 14, y: 10)
                .accessibilityHidden(true)
            Text(play.biggest ? "Gary's biggest bet tonight" : "Gary's bet").font(W.text(18, .semibold)).foregroundStyle(W.bone)
                .fitsOneLine().padding(.top, 20)
            Text(W.dollars(play.stake)).font(W.wide(80)).tracking(-2).wGold().fitsOneLine().wTight(80).padding(.top, 6)
            Text("on \(article(play.league)) \(play.league) \(play.ticket.isProp ? "player prop" : "game")")
                .font(W.text(16)).foregroundStyle(W.dim).fitsOneLine().padding(.top, 2)
            Spacer(minLength: 14)
            WGoldButton(title: "Open the pick", action: onOpen).padding(.horizontal, 20).padding(.bottom, 14)
        }
        .padding(.horizontal, 0)
        .accessibilityElement(children: .contain)
    }
    /// "an NBA", "an MLB": these leagues' names all start on a vowel sound.
    private func article(_ league: String) -> String { ["NBA", "NFL", "NHL", "MLB", "NCAAF", "NCAAB"].contains(league) ? "an" : "a" }
}

/// The win or loss mark: filled green for a win, a red ring for a loss.
struct WMark: View {
    let result: String?
    var size: CGFloat = 26
    var body: some View {
        let won = result == "won", lost = result == "lost"
        Text(won ? "W" : lost ? "L" : "P")
            .font(W.text(12, .bold)).foregroundStyle(won ? W.stage : lost ? W.loss : W.dim)
            .frame(width: size, height: size)
            .background(Circle().fill(won ? W.win : .clear))
            .overlay(Circle().strokeBorder(won ? .clear : lost ? W.loss : W.dim, lineWidth: 1.5))
            .accessibilityLabel(won ? "Won" : lost ? "Lost" : "Push")
    }
}

/// The torn top of a sealed card: a darker strip with a zigzag lower edge.
struct WTearStrip: View {
    private struct Edge: Shape {
        func path(in rect: CGRect) -> Path {
            var p = Path()
            let teeth = max(Int(rect.width / 14), 8), step = rect.width / CGFloat(teeth)
            p.move(to: CGPoint(x: 0, y: rect.maxY - 8))
            for i in 1...teeth { p.addLine(to: CGPoint(x: CGFloat(i) * step, y: rect.maxY - (i.isMultiple(of: 2) ? 8 : 0))) }
            return p
        }
    }
    private struct Strip: Shape {
        func path(in rect: CGRect) -> Path {
            var p = Edge().path(in: rect)
            p.addLine(to: CGPoint(x: rect.maxX, y: 0)); p.addLine(to: CGPoint(x: 0, y: 0)); p.closeSubpath()
            return p
        }
    }
    var body: some View {
        ZStack {
            Strip().fill(Color.black.opacity(0.28))
            Edge().stroke(W.goldSoft.opacity(0.4), lineWidth: 1)
        }
        .clipShape(RoundedCorners(radius: 30, corners: [.topLeft, .topRight]))
        .accessibilityHidden(true)
    }
}

/// A rectangle rounded on chosen corners.
struct RoundedCorners: Shape {
    var radius: CGFloat
    var corners: UIRectCorner
    func path(in rect: CGRect) -> Path {
        Path(UIBezierPath(roundedRect: rect, byRoundingCorners: corners, cornerRadii: CGSize(width: radius, height: radius)).cgPath)
    }
}

/// Where a live side bet stands: the lead on a track, the number it has to clear as a gold tick.
struct WCoverMeter: View {
    let margin: Double
    let need: Double
    let tone: Color
    let mine: String
    let theirs: String

    var body: some View {
        let span = max(12, abs(margin) + 4, abs(need) + 4)
        VStack(spacing: 8) {
            GeometryReader { geo in
                let mid = geo.size.width / 2
                let x: (Double) -> CGFloat = { mid + CGFloat($0 / span) * mid }
                let from = min(x(need), x(margin)), to = max(x(need), x(margin))
                ZStack(alignment: .leading) {
                    Capsule().fill(W.bone.opacity(0.12)).frame(height: 10)
                    Rectangle().fill(tone).frame(width: max(to - from, 0), height: 10).offset(x: from)
                    Rectangle().fill(W.bone.opacity(0.45)).frame(width: 2, height: 22).offset(x: mid - 1)
                    Rectangle().fill(W.gold).frame(width: 2, height: 30).offset(x: x(need) - 1)
                    Circle().fill(tone).frame(width: 20, height: 20)
                        .overlay(Circle().strokeBorder(tone.opacity(0.3), lineWidth: 4).frame(width: 28, height: 28))
                        .offset(x: x(margin) - 10)
                }
                .frame(height: 30)
            }
            .frame(height: 30)
            HStack {
                Text("\(theirs) ahead").font(W.text(14)).foregroundStyle(W.dim).fitsOneLine()
                Spacer(minLength: 8)
                Text("\(mine) ahead").font(W.text(14)).foregroundStyle(W.dim).fitsOneLine()
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(margin >= 0 ? "\(mine) lead by \(LabFormat.trim(margin))" : "\(theirs) lead by \(LabFormat.trim(-margin))")
    }
}

/// A play behind a pass: the league, and the way in.
struct WLockedCard: View {
    let league: String
    let onUnlock: () -> Void
    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 20)
            Image(systemName: "lock.fill").font(.system(size: 22, weight: .semibold)).foregroundStyle(W.gold)
                .frame(width: 56, height: 56).background(Circle().fill(W.gold.opacity(0.16)))
                .accessibilityHidden(true)
            Text("\(league) play for members").font(W.text(18, .semibold)).foregroundStyle(W.bone).fitsOneLine().padding(.top, 18)
            Spacer(minLength: 20)
            WGoldButton(title: "Unlock \(league) for \(GaryPricing.single) a month", action: onUnlock)
                .padding(.horizontal, 20).padding(.bottom, 16)
        }
        .frame(maxWidth: .infinity)
        .wCard(glow: W.gold, strength: 0.3)
    }
}

/// No plays yet today, or the card could not be read.
struct WEmptyCard: View {
    let nextGame: ComingWindow?
    let loading: Bool
    var failed = false
    var onRetry: () -> Void = {}
    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 20)
            Image(GaryBrand.mark).resizable().scaledToFit().frame(width: 96, height: 96)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .shadow(color: .black.opacity(0.6), radius: 14, y: 10)
                .opacity(loading ? 0.5 : 1)
                .accessibilityHidden(true)
            if failed && !loading {
                Text("Couldn't load tonight's plays").font(W.text(18, .semibold)).foregroundStyle(W.bone).fitsOneLine().padding(.top, 20)
                Spacer(minLength: 20)
                WGlassButton(title: "Try again", chevron: false, action: onRetry).padding(.horizontal, 20).padding(.bottom, 16)
            } else {
                if !loading {
                    Text("No plays yet today").font(W.text(18, .semibold)).foregroundStyle(W.bone).fitsOneLine().padding(.top, 20)
                    if let nextGame {
                        Text("\(nextGame.league) starts at \(nextGame.clock)").font(W.text(16)).foregroundStyle(W.dim).fitsOneLine().padding(.top, 4)
                    }
                }
                Spacer(minLength: 20)
            }
        }
        .frame(maxWidth: .infinity)
        .wCard(glow: W.gold, strength: 0.24)
    }
}
