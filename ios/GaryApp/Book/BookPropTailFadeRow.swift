import SwiftUI
import Charts
import PhotosUI

// ── Prop slip tail/fade (Aug 3 2026) ────────────────────────────────────────
// The prop back never had the action block — place_user_prop_bet shipped
// Jul 26 with no UI on the card. Same grammar as TailFadeRow with the prop
// RPC underneath; no streak claim (game picks own the streak) and no riders
// counts yet (the counts RPC is game-pick keyed).
struct PropTailFadeRow: View {
    let prop: PropPick
    @ObservedObject private var auth = AuthManager.shared
    @State private var mine: UserBet? = nil
    @State private var arming: String? = nil
    @State private var stake: Double = 1.0
    @State private var busy = false
    @State private var errorText: String? = nil
    @State private var showAuth = false
    @State private var receiptRequest = UUID()
    @State private var streakOn = false

    /// The board's prop token ("total_bases 1.5" → "total_bases") — the same
    /// key the grader settles user prop bets on.
    private var propToken: String {
        String((prop.prop ?? "").split(separator: " ").first ?? "").lowercased()
    }
    private var locked: Bool {
        BookTicketTime.isLocked(prop.commence_time)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // "YOUR CALL" kicker removed (founder, Aug 4, both card backs) —
            // the buttons speak for themselves and the block moves up.
            if let bet = mine {
                placedChip(bet)
            } else if !BookPropEligibility.canVerify(prop) {
                Text("Long-shot picks can be logged privately in Your Book. They don't enter verified rankings or streaks.")
                    .font(GaryFonts.text(11)).foregroundStyle(.white.opacity(0.55))
                    .fixedSize(horizontal: false, vertical: true)
            } else if locked {
                EmptyView()
            } else if let side = arming {
                stakePicker(side)
            } else {
                HStack(spacing: 8) {
                    // Same words AND same buttons as the game card back
                    // (founder, Aug 19: "exactly the same colors, look, and
                    // everything" — the silver solid/outline pair retired).
                    bigButton("BET WITH GARY") { arm("tail") }
                    bigButton("FADE THE BEAR") { arm("fade") }
                }
            }
            if let e = errorText {
                Text(e)
                    .font(GaryFonts.mono(9.5))
                    .foregroundStyle(GaryColors.loss.opacity(0.9))
                    .lineLimit(2)
            }
        }
        .task(id: "\(prop.id):\(auth.currentUser?.id ?? "guest")") {
            mine = nil; arming = nil; errorText = nil; streakOn = false; busy = false
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
        guard let day = BookTicketTime.gameDate(prop.commence_time) else { mine = nil; return }
        if let all {
            let line = Double(prop.line ?? "") ?? Double(prop.prop?.split(separator: " ").last.map(String.init) ?? "")
            mine = all.first { bet in
                guard bet.pick_type == "prop", bet.game_date == day,
                      (bet.player_name ?? "").caseInsensitiveCompare(prop.player ?? "") == .orderedSame,
                      (bet.prop_type ?? "").caseInsensitiveCompare(propToken) == .orderedSame else { return false }
                if let source = bet.source_game_id, source != prop.game_id.map(String.init) { return false }
                if let source = bet.source_line, source != line { return false }
                if let source = bet.source_side, source.caseInsensitiveCompare(prop.bet ?? "") != .orderedSame { return false }
                if bet.source_game_id == nil, let lock = userBookInstant(bet.lock_at), let start = userBookInstant(prop.commence_time), lock != start { return false }
                return true
            }
        }
    }

    /// EXACT twin of the game card's tailFadeButton (founder, Aug 19: prop
    /// bet/fade buttons match the game buttons in colors, look, everything).
    private func bigButton(_ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(GaryFonts.mono(11, bold: true)).tracking(1.4)
                .foregroundStyle(.white.opacity(0.85))
                // The longer words scale before they ever wrap or clip.
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .background(
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
        // TWO ROWS — exact twin of the game card's armed state (founder,
        // Aug 19), silver lock button = the props lane's one tint difference.
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Text(side == "tail" ? "BET WITH GARY" : "FADE THE BEAR")
                    .font(GaryFonts.mono(10.5, bold: true)).tracking(1.2)
                    .foregroundStyle(side == "tail" ? GaryColors.silverLight : Color(hex: "#8B93A7"))
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
                // Props ride the streak too (founder, Aug 20: star the bet
                // that counts) — the RPC has no streak param, so the star
                // lands as its own claim right after booking.
                Button { streakOn.toggle() } label: {
                    HStack(spacing: 4) {
                        Image(systemName: streakOn ? "star.fill" : "star")
                            .font(.system(size: 10, weight: .semibold))
                        Text("STREAK")
                            .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                    }
                    .foregroundStyle(streakOn ? Color(hex: "#E5844B") : .white.opacity(0.5))
                    .fixedSize()
                }
                .buttonStyle(.plain)
                Spacer(minLength: 6)
                Button { arming = nil } label: {
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
                        .background(RoundedRectangle(cornerRadius: 6).fill(GaryColors.silverLight))
                }
                .buttonStyle(.plain)
                .disabled(busy)
            }
        }
    }

    /// House stepper chip — same as the game card's.
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
            let label = bet.kind == "tail" ? "YOU TAILED" : "YOU FADED"
            let tint: Color = bet.kind == "tail" ? GaryColors.silverLight : Color(hex: "#8B93A7")
            Text("\(label) · \(BookMoney.stake(bet.stake_units))")
                .font(GaryFonts.mono(11, bold: true)).tracking(1)
                .foregroundStyle(tint)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(tint.opacity(0.12)))
            if bet.status != "pending" {
                let won = bet.status == "won"
                let wash = bet.status == "push" || bet.status == "void"
                Text(wash ? bet.status.uppercased() : BookMoney.net(bet.units_net ?? 0))
                    .font(GaryFonts.mono(10, bold: true))
                    .foregroundStyle(wash ? .white.opacity(0.5) : (won ? GaryColors.win : GaryColors.loss))
            } else if !locked {
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
        guard let player = prop.player, !player.isEmpty, !propToken.isEmpty else { return }
        guard BookPropEligibility.canVerify(prop) else {
            errorText = "Log this pick privately in Your Book. It isn't eligible for verified rankings."
            return
        }
        guard !locked, let dateStr = BookTicketTime.gameDate(prop.commence_time) else {
            errorText = "This pick is locked or its start time is unavailable."
            return
        }
        busy = true
        Task {
            defer { busy = false }
            do {
                let bet = try await UserBookAPI.placePropBet(
                    gameDate: dateStr, player: player, propType: propToken, kind: side, stake: stake,
                    streak: streakOn, gameID: prop.game_id.map(String.init),
                    line: Double(prop.line ?? "") ?? Double(prop.prop?.split(separator: " ").last.map(String.init) ?? ""),
                    side: prop.bet)
                mine = bet
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
}

