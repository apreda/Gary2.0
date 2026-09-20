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
    @State private var stake: Double = 1.0
    @State private var busy = false
    @State private var errorText: String? = nil
    @State private var showAuth = false
    @State private var receiptRequest = UUID()
    @State private var riders: (tails: Int, fades: Int)? = nil
    @State private var streakOn = false

    /// "3 riding · 1 fading" — shown only once real bodies are on the pick.
    private var ridersLine: String? {
        guard let r = riders, r.tails + r.fades > 0 else { return nil }
        var parts: [String] = []
        if r.tails > 0 { parts.append("\(r.tails) riding") }
        if r.fades > 0 { parts.append("\(r.fades) fading") }
        return parts.joined(separator: " · ")
    }

    private var locked: Bool {
        BookTicketTime.isLocked(pick.commence_time)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // "YOUR CALL" kicker removed (founder, Aug 4: the words come off
            // so everything moves up — the buttons speak for themselves).
            // The riders social proof stays, right-aligned, only when real
            // bodies are on the pick. Hidden once the game locks with no bet.
            if let r = ridersLine, mine != nil || !locked {
                HStack {
                    Spacer()
                    Text(r.uppercased())
                        .font(GaryFonts.mono(9.5)).tracking(0.5)
                        .foregroundStyle(.white.opacity(0.55))
                }
            }
            if let bet = mine {
                placedChip(bet)
            } else if locked {
                EmptyView()   // never advertise a bet you can no longer place
            } else if let side = arming {
                stakePicker(side)
            } else {
                armButtons
            }
            if let e = errorText {
                Text(e)
                    .font(GaryFonts.mono(9.5))
                    .foregroundStyle(GaryColors.loss.opacity(0.9))
                    .lineLimit(2)
            }
        }
        .task(id: "\(pick.id):\(auth.currentUser?.id ?? "guest")") {
            mine = nil; arming = nil; errorText = nil; streakOn = false; busy = false
            if let date = pickDateEST() {
                let counts = await UserBookAPI.fetchTailCounts(gameDate: date)
                guard !Task.isCancelled else { return }
                riders = counts[pick.pick ?? ""]
            }
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
                // One play a day rides the streak — claiming it here releases
                // any other claim the user holds for the date (server-enforced).
                // The star IS the streak grammar app-wide (founder, Aug 20).
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
            let label = bet.kind == "tail" ? "YOU TAILED" : "YOU FADED"
            let tint: Color = bet.kind == "tail" ? GaryColors.gold : Color(hex: "#8B93A7")
            Text("\(label) · \(BookMoney.stake(bet.stake_units))")
                .font(GaryFonts.mono(11, bold: true)).tracking(1)
                .foregroundStyle(tint)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(tint.opacity(0.12)))
            if bet.streak_pick == true {
                Text("STREAK")
                    .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
                    .foregroundStyle(Color(hex: "#E5844B"))
            }
            if bet.status != "pending" {
                resultTag(bet)
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

    private func resultTag(_ bet: UserBet) -> some View {
        let won = bet.status == "won"
        let wash = bet.status == "push" || bet.status == "void"
        let units = bet.units_net ?? 0
        let text = wash ? bet.status.uppercased() : BookMoney.net(units)
        let est = (bet.odds_estimated ?? false) && won ? " est" : ""
        return Text(text + est)
            .font(GaryFonts.mono(10, bold: true))
            .foregroundStyle(wash ? .white.opacity(0.5) : (won ? GaryColors.win : GaryColors.loss))
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
                    pickText: pick.pick ?? "", kind: side, stake: stake, streak: streakOn)
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

