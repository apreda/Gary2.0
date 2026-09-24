import SwiftUI
import Charts
import PhotosUI

// ── Tail/Fade row (pick card back) ──────────────────────────────────────────
// Sits under the conviction bar — the "I've read the case" moment. One tap
// arms a stake stepper; confirm logs it through the lock-checked RPC. After
// lock the row freezes into a receipt chip; after grading it shows the result.
struct TailFadeRow: View {
    let pick: GaryPick
    @ObservedObject private var auth = AuthManager.shared
    @State private var mine: UserBet? = nil
    @State private var arming: String? = nil      // "tail" | "fade" while picking stake
    @State private var choosing = false            // LOG BET tapped, side not yet chosen
    @State private var stake: Double = 1.0
    @State private var busy = false
    @State private var errorText: String? = nil
    @State private var showAuth = false
    @State private var receiptRequest = UUID()

    private var locked: Bool {
        BookTicketTime.isLocked(pick.commence_time)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // "YOUR CALL" kicker removed (founder, Aug 4: the words come off
            // so everything moves up — the buttons speak for themselves).
            // The "3 riding · 1 fading" count came off too (founder, Sep 24
            // 2026), so the receipt sits right under the take.
            if let bet = mine {
                placedChip(bet)
            } else if locked {
                EmptyView()   // never advertise a bet you can no longer place
            } else if let side = arming {
                stakePicker(side)
            } else if choosing {
                armButtons
            } else {
                logBetButton
            }
            if let e = errorText {
                Text(e)
                    .font(GaryFonts.mono(9.5))
                    .foregroundStyle(GaryColors.loss.opacity(0.9))
                    .lineLimit(2)
            }
        }
        .task(id: "\(pick.id):\(auth.currentUser?.id ?? "guest")") {
            mine = nil; arming = nil; choosing = false; errorText = nil; busy = false
            await loadReceipt()
        }
        .onReceive(NotificationCenter.default.publisher(for: .userBookChanged)) { _ in Task { await loadReceipt() } }
        .sheet(isPresented: $showAuth, onDismiss: { Task { await loadReceipt() } }) { AuthView() }
    }

    private func loadReceipt() async {
        let request = UUID(); receiptRequest = request
        guard let owner = auth.currentUser?.id, auth.isAuthenticated else { mine = nil; return }
        let all = await UserBookAPI.fetchMyBets()
        guard owner == auth.currentUser?.id, request == receiptRequest, !Task.isCancelled else { return }
        if let all {
            mine = all.first { bet in
                guard bet.pick_type == "game", bet.game_date == pickDateEST() else { return false }
                if let source = bet.source_pick_id { return source == pick.pick_id }
                if let source = bet.source_game_id { return source == pick.game_id.map(String.init) && bet.pick_text == (pick.pick ?? "") }
                guard bet.pick_text == (pick.pick ?? "") else { return false }
                if let lock = userBookInstant(bet.lock_at), let start = userBookInstant(pick.commence_time) { return lock == start }
                return true
            }
        }
    }

    /// ONE button (founder, Sep 21 2026): "Instead of the Bet with Gary or
    /// Fade the Bear buttons, we're going to simplify that and do a Log Bet
    /// button. Once someone clicks Log Bet, they'll be able to select if
    /// they're going to fade that or bet that." The star for the streak
    /// lives on the card's front.
    private var logBetButton: some View {
        tailFadeButton("LOG BET") {
            errorText = nil
            guard AuthManager.shared.bearerToken != nil else { showAuth = true; return }
            withAnimation(.easeInOut(duration: 0.18)) { choosing = true }
        }
    }
    private var armButtons: some View {
        // Full-width split — the card back's ACTION, not a footnote.
        // NEUTRAL TWINS (founder, Aug 4): the solid-gold TAIL read as
        // already-pressed next to the outlined FADE, and the gold was harsh.
        // Both wear the same quiet outline; color arrives only after a call
        // is made (stake picker tint + the placed chip). The "goes on the
        // record at lock" caption came off with it.
        HStack(spacing: 8) {
            // "BET WITH GARY" / "FADE THE BEAR" (founder, Aug 6) — the app's
            // own name on the tail side, the bear on the fade.
            tailFadeButton("BET WITH GARY") { arm("tail") }
            tailFadeButton("FADE THE BEAR") { arm("fade") }
        }
    }

    private func tailFadeButton(_ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(GaryFonts.mono(11, bold: true)).tracking(1.4)
                .foregroundStyle(.white.opacity(0.85))
                // The longer words scale before they ever wrap or clip.
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity)
                // Slimmer than the take they sit under (founder, Aug 6) — the
                // stamps are the ballot line, not the headline.
                .padding(.vertical, 9)
                .background(
                    // Floating-soft (founder, Aug 6 night: "softer… floating
                    // tech feel, not rigidness") — the letterpress border
                    // retired for a frosted chip: soft fill, breath of an
                    // edge, round shoulders. Idle twins stay equals.
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color.white.opacity(0.07))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .stroke(Color.white.opacity(0.10), lineWidth: 1)
                        )
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    private func stakePicker(_ side: String) -> some View {
        // TWO ROWS (founder, Aug 19: the armed state "has a bug" — the old
        // one-line HStack packed ~500pt of controls into a ~330pt card back,
        // so everything compressed/clipped; the native gray Stepper also
        // read foreign on the house card). Row 1: side + house −/+ stake.
        // Row 2: streak toggle, then Back / Lock it in.
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Text(side == "tail" ? "BET WITH GARY" : "FADE THE BEAR")
                    .font(GaryFonts.mono(10.5, bold: true)).tracking(1.2)
                    .foregroundStyle(side == "tail" ? GaryColors.gold : Color(hex: "#8B93A7"))
                    .lineLimit(1).minimumScaleFactor(0.7)
                Spacer(minLength: 6)
                stakeStep("minus") { stake = max(0.5, stake - 0.5) }
                Text(BookMoney.stake(stake))
                    .font(GaryFonts.mono(13, bold: true))
                    .foregroundStyle(.white.opacity(0.9))
                    .frame(minWidth: 46)
                stakeStep("plus") { stake = min(5, stake + 0.5) }
            }
            HStack(spacing: 10) {
                // The streak star lives on the card's FRONT (founder, Sep 21
                // 2026); this row is side + stake + the lock.
                Spacer(minLength: 6)
                Button { arming = nil; choosing = true } label: {
                    Text("Back")
                        .font(GaryFonts.mono(10))
                        .foregroundStyle(.white.opacity(0.5))
                        .padding(.vertical, 7).padding(.horizontal, 4)
                }
                .buttonStyle(.plain)
                Button { place(side) } label: {
                    Text("Lock it in")
                        .font(GaryFonts.mono(11, bold: true))
                        .foregroundStyle(.black)
                        .padding(.horizontal, 14).padding(.vertical, 7)
                        .background(RoundedRectangle(cornerRadius: 6).fill(GaryColors.gold))
                }
                .buttonStyle(.plain)
                .disabled(busy)
            }
        }
    }

    /// House stepper chip — the native gray Stepper read foreign on the card.
    private func stakeStep(_ symbol: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.white.opacity(0.85))
                .frame(width: 30, height: 30)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(Color.white.opacity(0.07))
                        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(Color.white.opacity(0.10), lineWidth: 1))
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func placedChip(_ bet: UserBet) -> some View {
        HStack(spacing: 8) {
            BetReceiptChip(bet: bet)
            if bet.streak_pick == true {
                Text("STREAK")
                    .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
                    .foregroundStyle(Color(hex: "#E5844B"))
            }
            if bet.status == "pending", !locked {
                Button { remove(bet) } label: {
                    Text("Undo")
                        .font(GaryFonts.mono(10))
                        .foregroundStyle(.white.opacity(0.5))
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
    }

    private func arm(_ side: String) {
        errorText = nil
        guard AuthManager.shared.bearerToken != nil else { showAuth = true; return }
        arming = side
    }

    private func place(_ side: String) {
        guard let dateStr = pickDateEST() else { return }
        busy = true
        Task {
            defer { busy = false }
            do {
                mine = try await UserBookAPI.placeBet(
                    gameDate: dateStr, pickId: pick.pick_id,
                    pickText: pick.pick ?? "", kind: side, stake: stake, streak: false)
                arming = nil
            } catch {
                errorText = error.localizedDescription
            }
        }
    }

    private func remove(_ bet: UserBet) {
        busy = true
        Task {
            defer { busy = false }
            if await UserBookAPI.deleteBet(id: bet.id) { mine = nil }
        }
    }

    /// The pick's ET calendar date — derived from its own commence_time so a
    /// late-night card can never post against the wrong daily_picks row.
    private func pickDateEST() -> String? {
        guard let d = userBookInstant(pick.commence_time) else {
            return SupabaseAPI.todayEST()
        }
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = TimeZone(identifier: "America/New_York")
        return fmt.string(from: d)
    }
}

// ── The bet receipt (founder, Sep 24 2026) ──────────────────────────────────
// One box for the logged bet on both card backs: "YOU FADED · $400" before
// the game settles, then the stake turns into the result, "-$400" in red or
// "+$360" in green, inside the same box. The words stay white so they read
// on the dark card; only the money carries the win or loss color.
struct BetReceiptChip: View {
    let bet: UserBet

    var body: some View {
        let won = bet.status == "won"
        let wash = bet.status == "push" || bet.status == "void"
        let settled = bet.status != "pending"
        let amount = !settled ? BookMoney.stake(bet.stake_units)
            : wash ? bet.status.uppercased()
            : BookMoney.net(bet.units_net ?? 0) + ((bet.odds_estimated ?? false) && won ? " est" : "")
        let amountColor: Color = !settled ? GaryColors.warmWhite
            : wash ? .white.opacity(0.55)
            : won ? GaryColors.win : GaryColors.loss
        HStack(spacing: 0) {
            Text(bet.kind == "tail" ? "YOU TAILED · " : "YOU FADED · ")
                .foregroundStyle(GaryColors.warmWhite)
            Text(amount)
                .foregroundStyle(amountColor)
        }
        .font(GaryFonts.mono(11, bold: true)).tracking(1)
        .lineLimit(1).minimumScaleFactor(0.8)
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .fill(Color.white.opacity(0.08))
                .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .stroke(Color.white.opacity(0.10), lineWidth: 1))
        )
        .accessibilityElement(children: .combine)
    }
}

// ── THE STREAK STAR (founder, Sep 21 2026) ──────────────────────────────────
// On the front of every pick card, right side, "somewhere kind of chill". A
// tap asks "Are you sure you want to log this as your bet to count against
// your streak?" and which side — Bet with Gary or Fade the Bear — then the
// bet logs to the account with the star. Every starred bet counts; if a
// single one loses, the streak restarts. A starred bet shows a filled star;
// tapping it again removes the star (the bet stays in the book).
struct StreakStarButton: View {
    enum Ticket {
        case game(GaryPick)
        case prop(PropPick)
    }
    let ticket: Ticket
    /// The Book's streak orange.
    var tint: Color = Color(hex: "#E5844B")
    var idleTint: Color = .white.opacity(0.45)
    var size: CGFloat = 13

    @ObservedObject private var auth = AuthManager.shared
    @State private var mine: UserBet? = nil
    @State private var confirmSide = false
    @State private var confirmExisting = false
    @State private var confirmUnstar = false
    @State private var showAuth = false
    @State private var busy = false
    @State private var request = UUID()

    private var commence: String? {
        switch ticket {
        case .game(let p): return p.commence_time
        case .prop(let p): return p.commence_time
        }
    }
    private var ticketID: String {
        switch ticket {
        case .game(let p): return "game:\(p.id)"
        case .prop(let p): return "prop:\(p.id)"
        }
    }
    private var locked: Bool { BookTicketTime.isLocked(commence) }
    private var starred: Bool { mine?.streak_pick == true }

    var body: some View {
        if AppFlags.userBookEnabled, !locked || starred {
            Button { tap() } label: {
                Image(systemName: starred ? "star.fill" : "star")
                    .font(.system(size: size, weight: .semibold))
                    .foregroundStyle(starred ? tint : idleTint)
                    .frame(width: 26, height: 22)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(busy || (locked && !starred))
            .accessibilityLabel(starred ? "Starred for your streak" : "Star this pick for your streak")
            .accessibilityHint(starred ? "Removes the star" : "Logs the bet and counts it toward your streak")
            .confirmationDialog("Count this pick toward your streak?", isPresented: $confirmSide, titleVisibility: .visible) {
                Button("Bet with Gary") { star(side: "tail") }
                Button("Fade the Bear") { star(side: "fade") }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Pick a side and it logs to your book as a streak bet. Every starred bet counts, and one loss restarts the streak.")
            }
            .confirmationDialog("Count this bet toward your streak?", isPresented: $confirmExisting, titleVisibility: .visible) {
                Button("Star it") { setStar(true) }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("You already logged this one. Starring it makes it count: one loss on any starred bet restarts the streak.")
            }
            .confirmationDialog("Remove the star?", isPresented: $confirmUnstar, titleVisibility: .visible) {
                Button("Remove star", role: .destructive) { setStar(false) }
                Button("Keep it", role: .cancel) {}
            } message: {
                Text("The bet stays in your book; it just stops counting toward your streak.")
            }
            .sheet(isPresented: $showAuth, onDismiss: { Task { await load() } }) { AuthView() }
            .task(id: "\(ticketID):\(auth.currentUser?.id ?? "guest")") { await load() }
            .onReceive(NotificationCenter.default.publisher(for: .userBookChanged)) { _ in Task { await load() } }
        }
    }

    private func tap() {
        guard AuthManager.shared.bearerToken != nil else { showAuth = true; return }
        guard !locked else { return }
        if mine == nil { confirmSide = true }
        else if starred { confirmUnstar = true }
        else { confirmExisting = true }
    }

    private func star(side: String) {
        guard let day = BookTicketTime.gameDate(commence), !locked else { return }
        busy = true
        Task {
            defer { busy = false }
            do {
                switch ticket {
                case .game(let pick):
                    mine = try await UserBookAPI.placeBet(gameDate: day, pickId: pick.pick_id,
                                                          pickText: pick.pick ?? "", kind: side, stake: 1.0, streak: true)
                case .prop(let prop):
                    guard let player = prop.player, !player.isEmpty, BookPropEligibility.canVerify(prop) else { return }
                    let token = String((prop.prop ?? "").split(separator: " ").first ?? "").lowercased()
                    let line = Double(prop.line ?? "") ?? Double(prop.prop?.split(separator: " ").last.map(String.init) ?? "")
                    mine = try await UserBookAPI.placePropBet(gameDate: day, player: player, propType: token, kind: side,
                                                              stake: 1.0, streak: true, gameID: prop.game_id.map(String.init),
                                                              line: line, side: prop.bet)
                }
            } catch {
                // The card-back row reports booking errors in words; the
                // star stays quiet and simply doesn't fill.
            }
        }
    }

    private func setStar(_ on: Bool) {
        guard let bet = mine, let day = BookTicketTime.gameDate(commence) else { return }
        busy = true
        Task {
            defer { busy = false }
            if await UserBookAPI.setStreakPick(id: bet.id, gameDate: day, star: on) { await load() }
        }
    }

    /// The same receipt match the card-back rows use, so the star and the
    /// row always agree about which bet is this ticket's.
    private func load() async {
        let req = UUID(); request = req
        guard let owner = auth.currentUser?.id, auth.isAuthenticated else { mine = nil; return }
        let all = await UserBookAPI.fetchMyBets()
        guard owner == auth.currentUser?.id, req == request, !Task.isCancelled else { return }
        guard let all, let day = BookTicketTime.gameDate(commence) else { mine = nil; return }
        switch ticket {
        case .game(let pick):
            mine = all.first { bet in
                guard bet.pick_type == "game", bet.game_date == day else { return false }
                if let source = bet.source_pick_id { return source == pick.pick_id }
                if let source = bet.source_game_id { return source == pick.game_id.map(String.init) && bet.pick_text == (pick.pick ?? "") }
                guard bet.pick_text == (pick.pick ?? "") else { return false }
                if let lock = userBookInstant(bet.lock_at), let start = userBookInstant(pick.commence_time) { return lock == start }
                return true
            }
        case .prop(let prop):
            let token = String((prop.prop ?? "").split(separator: " ").first ?? "").lowercased()
            let line = Double(prop.line ?? "") ?? Double(prop.prop?.split(separator: " ").last.map(String.init) ?? "")
            mine = all.first { bet in
                guard bet.pick_type == "prop", bet.game_date == day,
                      (bet.player_name ?? "").caseInsensitiveCompare(prop.player ?? "") == .orderedSame,
                      (bet.prop_type ?? "").caseInsensitiveCompare(token) == .orderedSame else { return false }
                if let source = bet.source_game_id, source != prop.game_id.map(String.init) { return false }
                if let source = bet.source_line, source != line { return false }
                if let source = bet.source_side, source.caseInsensitiveCompare(prop.bet ?? "") != .orderedSame { return false }
                if bet.source_game_id == nil, let lock = userBookInstant(bet.lock_at), let start = userBookInstant(prop.commence_time), lock != start { return false }
                return true
            }
        }
    }
}

