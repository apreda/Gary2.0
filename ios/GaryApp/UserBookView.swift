import SwiftUI

// ─────────────────────────────────────────────────────────────────────────────
// YOUR BOOK — Tail/Fade + personal ledger (Jul 26 2026).
//
// One system, three entry points: a TAIL, a FADE, and a manually logged
// outside bet are the same `user_bets` row with a different kind. Tail/fade
// go through server RPCs that resolve odds + lock time and refuse post-lock
// writes — the record is unfakeable, which is the whole point. Two ledgers,
// never mixed: WITH GARY (system-graded tails/fades — the flagship number)
// and YOUR PLAYS (self-logged, self-graded, labeled).
// ─────────────────────────────────────────────────────────────────────────────

extension AppFlags {
    /// Master switch for the whole Your Book surface (tail/fade row, Billfold
    /// section, quick-log). One-line kill, same pattern as the 2.19 flags.
    /// STORE-SAFE BRIDGE: wager tracking is betting content — the entire
    /// surface rides the bridge and returns automatically when `storeSafe`
    /// flips off (the pre-bridge value was a plain `true`).
    static var userBookEnabled: Bool { !storeSafe }

    /// Pre-launch sample players on the classic board (founder, Aug 20).
    /// FLIP TO FALSE AT LAUNCH (Sep 5) — the launch board is real records
    /// only; the labeled stand-ins exist so the board reads like a board
    /// while the real ledger is empty.
    static let bookPreviewCast = true
}

struct UserBet: Codable, Identifiable {
    let id: String
    let kind: String            // tail | fade | manual
    let pick_type: String?      // game | prop
    let game_date: String
    let league: String?
    let pick_text: String
    let matchup: String?
    let player_name: String?
    let prop_type: String?
    let description: String?
    let odds_american: Int?
    let odds_estimated: Bool?
    let stake_units: Double
    let gary_confidence: Double?
    let streak_pick: Bool?
    let status: String          // pending | won | lost | push | void
    let units_net: Double?
    let lock_at: String?
    let placed_at: String?
    let graded_by: String?

    var isVerified: Bool { kind == "tail" || kind == "fade" }
    var isPending: Bool { status == "pending" }
}

// ── Money display (founder, Jul 26: "don't do units, do money"; Aug 20:
// "use money pretty much everywhere over units") ────────────────────────────
// Stakes/results STORE as units (the server math is unit-based and unfakeable);
// the DISPLAY is always dollars — at the user's own unit size once they set
// one, at the house's hypothetical $100/bet until then (the same convention
// Gary's Billfold uses, under the same HYPOTHETICAL framing). Units never
// show on this surface again.
enum BookMoney {
    /// The house display convention while no personal unit size is set.
    static let defaultUnitDollars: Double = 100

    static var unitDollars: Double {
        let v = UserDefaults.standard.double(forKey: "userUnitDollars")
        return v > 0 ? v : defaultUnitDollars
    }
    /// Whether the user has told us their own unit size (drives the one-time
    /// inline ask — display no longer depends on it).
    static var isSet: Bool { UserDefaults.standard.double(forKey: "userUnitDollars") > 0 }

    private static func dollars(_ value: Double) -> String {
        let v = (value * 100).rounded() / 100
        return v == v.rounded() ? String(format: "$%.0f", v) : String(format: "$%.2f", v)
    }

    /// A stake: "$100".
    static func stake(_ units: Double) -> String {
        dollars(units * unitDollars)
    }

    /// A net result: "+$63" / "-$25".
    static func net(_ units: Double) -> String {
        let d = units * unitDollars
        return (d >= 0 ? "+" : "-") + dollars(abs(d))
    }

    /// Ledger totals: "+$140".
    static func netTotal(_ units: Double) -> String {
        let d = units * unitDollars
        return (d >= 0 ? "+" : "-") + dollars(abs(d))
    }
}

/// Inline unit-size ask — appears the first time a signed-in user lands on
/// their book without one set. Save drops them right back where they were.
struct UnitSizeSheet: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("userUnitDollars") private var userUnitDollars = 0.0
    @State private var amountText = ""
    private let quick: [Double] = [10, 25, 50, 100]

    var body: some View {
        ZStack {
            Color(hex: "#1C1A1A").ignoresSafeArea()
            unitForm
        }
        .presentationDetents([.height(300)])
    }

    private var unitForm: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("WHAT'S A UNIT WORTH TO YOU?")
                .font(GaryFonts.mono(12, bold: true)).tracking(1.2)
                .foregroundStyle(GaryColors.gold)
            Text("Your typical bet, in dollars. Until you set one, your book prices every bet at a hypothetical $100 — change it anytime in Settings.")
                .font(GaryFonts.text(13))
                .foregroundStyle(.white.opacity(0.65))
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 16) {
                ForEach(quick, id: \.self) { amt in
                    let isOn = amountText == String(format: "%.0f", amt)
                    Button {
                        amountText = String(format: "%.0f", amt)
                    } label: {
                        VStack(spacing: 3) {
                            Text("$\(Int(amt))")
                                .font(GaryFonts.mono(12, bold: true))
                                .foregroundStyle(isOn ? GaryColors.gold : .white.opacity(0.6))
                            Rectangle().fill(isOn ? GaryColors.gold : .clear).frame(height: 1.5)
                        }
                        .fixedSize()
                    }
                    .buttonStyle(.plain)
                }
            }
            HStack(spacing: 10) {
                Text("$")
                    .font(GaryFonts.mono(14, bold: true))
                    .foregroundStyle(.white.opacity(0.6))
                TextField("25", text: $amountText)
                    .keyboardType(.decimalPad)
                    .font(GaryFonts.mono(15, bold: true))
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.06)))
            Button {
                if let v = Double(amountText), v > 0 {
                    userUnitDollars = v
                }
                dismiss()
            } label: {
                Text(Double(amountText).map { $0 > 0 } == true ? "Save" : "Keep $100 for now")
                    .font(GaryFonts.mono(12, bold: true)).tracking(0.5)
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .background(RoundedRectangle(cornerRadius: 8).fill(GaryColors.gold))
            }
            .buttonStyle(.plain)
        }
        .padding(20)
    }
}

/// Once per app session — an inline ask, never a nag.
@MainActor private var unitPromptShownThisSession = false

enum UserBookError: LocalizedError {
    case notSignedIn
    case server(String)
    var errorDescription: String? {
        switch self {
        case .notSignedIn: return "Sign in to keep a book."
        case .server(let m): return m
        }
    }
}

enum UserBookAPI {
    private static var rest: URL { Secrets.supabaseURL.appendingPathComponent("/rest/v1") }

    @MainActor private static func authedRequest(_ url: URL, method: String = "GET", body: Data? = nil) throws -> URLRequest {
        guard let token = AuthManager.shared.bearerToken else { throw UserBookError.notSignedIn }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        return req
    }

    private static func run(_ req: URLRequest) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: req)
        let statusCode = (response as? HTTPURLResponse)?.statusCode
        guard let statusCode, (200...299).contains(statusCode) else {
            // Keep the diagnostic in developer logs, never in user-facing copy.
            // Gateways sometimes return raw JSON such as
            // {"detail":"Bad Request"}; that is not useful product language.
            let diagnostic = (try? JSONDecoder().decode(PostgrestError.self, from: data))?.message
                ?? String(data: data, encoding: .utf8)
                ?? "HTTP \(statusCode.map(String.init) ?? "unknown")"
            print("[YourBook] request failed: \(diagnostic)")
            throw UserBookError.server(friendlyMessage(for: diagnostic))
        }
        return data
    }

    private struct PostgrestError: Decodable {
        let message: String?
        let detail: String?
        let error_description: String?

        private enum CodingKeys: String, CodingKey { case message, detail, error_description }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            message = try c.decodeIfPresent(String.self, forKey: .message)
                ?? c.decodeIfPresent(String.self, forKey: .detail)
                ?? c.decodeIfPresent(String.self, forKey: .error_description)
            detail = try c.decodeIfPresent(String.self, forKey: .detail)
            error_description = try c.decodeIfPresent(String.self, forKey: .error_description)
        }
    }

    private static func friendlyMessage(for diagnostic: String) -> String {
        let lower = diagnostic.lowercased()
        if lower.contains("locked") || lower.contains("already started") {
            return "This game has already started, so that choice is locked."
        }
        if lower.contains("pick not found") || lower.contains("no rows") {
            return "That pick is no longer available. Refresh and try again."
        }
        if lower.contains("lock time") {
            return "This pick isn't open for tracking yet. Try again shortly."
        }
        if lower.contains("not signed in") || lower.contains("jwt") || lower.contains("unauthorized") {
            return "Sign in to save this to your book."
        }
        if lower.contains("handle") {
            if lower.contains("taken") { return "That handle is already taken." }
            if lower.contains("reserved") { return "That handle is reserved. Try another." }
            return "Use 3–18 letters, numbers, or underscores."
        }
        return "We couldn't save that right now. Please try again."
    }

    @MainActor static func placeBet(gameDate: String, pickId: String?, pickText: String, kind: String, stake: Double, streak: Bool = false) async throws -> UserBet {
        let url = rest.appendingPathComponent("rpc/place_user_bet")
        var payload: [String: Any] = ["p_game_date": gameDate, "p_pick_text": pickText,
                                      "p_kind": kind, "p_stake": stake, "p_streak": streak]
        payload["p_pick_id"] = pickId ?? NSNull()
        let body = try JSONSerialization.data(withJSONObject: payload)
        let data = try await run(try authedRequest(url, method: "POST", body: body))
        return try JSONDecoder().decode(UserBet.self, from: data)
    }

    @MainActor static func placePropBet(gameDate: String, player: String, propType: String, kind: String, stake: Double) async throws -> UserBet {
        let url = rest.appendingPathComponent("rpc/place_user_prop_bet")
        let body = try JSONSerialization.data(withJSONObject: [
            "p_game_date": gameDate, "p_player": player, "p_prop_type": propType,
            "p_kind": kind, "p_stake": stake] as [String: Any])
        let data = try await run(try authedRequest(url, method: "POST", body: body))
        return try JSONDecoder().decode(UserBet.self, from: data)
    }

    @MainActor static func fetchMyBets() async -> [UserBet] {
        guard var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false) else { return [] }
        comps.queryItems = [URLQueryItem(name: "select", value: "*"),
                            URLQueryItem(name: "order", value: "placed_at.desc"),
                            URLQueryItem(name: "limit", value: "400")]
        guard let url = comps.url, let req = try? authedRequest(url) else { return [] }
        guard let data = try? await run(req) else { return [] }
        return (try? JSONDecoder().decode([UserBet].self, from: data)) ?? []
    }

    struct UserStreak: Codable {
        let current: Int
        let best: Int
        let last_counted_date: String?
        let last_result: String?
    }

    /// The signed-in user's streak row (owner-only RLS). Nil until the first
    /// streak play settles.
    @MainActor static func fetchMyStreak() async -> UserStreak? {
        guard var comps = URLComponents(url: rest.appendingPathComponent("user_streaks"), resolvingAgainstBaseURL: false) else { return nil }
        comps.queryItems = [URLQueryItem(name: "select", value: "current,best,last_counted_date,last_result")]
        guard let url = comps.url, let req = try? authedRequest(url) else { return nil }
        guard let data = try? await run(req) else { return nil }
        return (try? JSONDecoder().decode([UserStreak].self, from: data))?.first
    }

    // (The v1 units leaderboard — BoardRow / fetchLeaderboard /
    // fetchGaryLeaderboardRow — came out Aug 20: ONE board now, the classic
    // streak-first ClassicLeaderboardView on the Billfold's BOARD scope.)

    /// The signed-in user's claimed handle, if any (owner-only select).
    @MainActor static func fetchMyHandle() async -> String? {
        guard var comps = URLComponents(url: rest.appendingPathComponent("public_profiles"), resolvingAgainstBaseURL: false) else { return nil }
        comps.queryItems = [URLQueryItem(name: "select", value: "display_name")]
        guard let url = comps.url, let req = try? authedRequest(url) else { return nil }
        guard let data = try? await run(req) else { return nil }
        struct Row: Decodable { let display_name: String }
        return (try? JSONDecoder().decode([Row].self, from: data))?.first?.display_name
    }

    @MainActor static func claimHandle(_ name: String) async throws -> String {
        let url = rest.appendingPathComponent("rpc/claim_handle")
        let body = try JSONSerialization.data(withJSONObject: ["p_name": name])
        let data = try await run(try authedRequest(url, method: "POST", body: body))
        struct Row: Decodable { let display_name: String }
        return (try JSONDecoder().decode(Row.self, from: data)).display_name
    }

    struct ManualBetDraft {
        var league: String = "MLB"
        var description: String = ""
        var odds: Int? = nil
        var stake: Double = 1.0
        /// The founder's "star the bet that counts" designation (Aug 20):
        /// marks this as the play of the day. Display-only on manual rows —
        /// the server-written streak still counts verified plays only.
        var streakPick: Bool = false
    }

    @MainActor static func logManual(_ draft: ManualBetDraft) async throws -> UserBet {
        guard var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false) else { throw UserBookError.server("We couldn't open the bet form. Please try again.") }
        comps.queryItems = [URLQueryItem(name: "select", value: "*")]
        guard let uid = AuthManager.shared.currentUser?.id
            ?? UserDefaults.standard.string(forKey: "gary_user_id"), !uid.isEmpty else {
            throw UserBookError.notSignedIn
        }
        var payload: [String: Any] = [
            "user_id": uid, "kind": "manual",
            "game_date": SupabaseAPI.todayEST(),
            "league": draft.league,
            "pick_text": draft.description,
            "description": draft.description,
            "stake_units": draft.stake,
            "streak_pick": draft.streakPick,
        ]
        if let o = draft.odds { payload["odds_american"] = o }
        let body = try JSONSerialization.data(withJSONObject: payload)
        var req = try authedRequest(comps.url!, method: "POST", body: body)
        req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        let data = try await run(req)
        let rows = try JSONDecoder().decode([UserBet].self, from: data)
        guard let row = rows.first else { throw UserBookError.server("We couldn't save that bet. Please try again.") }
        return row
    }

    @MainActor static func gradeManual(id: String, status: String, unitsNet: Double) async -> Bool {
        guard var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false) else { return false }
        comps.queryItems = [URLQueryItem(name: "id", value: "eq.\(id)")]
        let payload: [String: Any] = ["status": status, "units_net": unitsNet,
                                      "graded_at": ISO8601DateFormatter().string(from: Date()),
                                      "graded_by": "user"]
        guard let body = try? JSONSerialization.data(withJSONObject: payload),
              let url = comps.url,
              let req = try? authedRequest(url, method: "PATCH", body: body) else { return false }
        return (try? await run(req)) != nil
    }

    @MainActor static func deleteBet(id: String) async -> Bool {
        guard var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false) else { return false }
        comps.queryItems = [URLQueryItem(name: "id", value: "eq.\(id)")]
        guard let url = comps.url, let req = try? authedRequest(url, method: "DELETE") else { return false }
        return (try? await run(req)) != nil
    }

    /// Star an EXISTING bet as the day's streak play (founder, Aug 20: "enter
    /// or star the bet they want to go towards their streak"). One play a day:
    /// every other claim the user holds for that date is released first, then
    /// the starred row takes it. Owner-only RLS scopes both writes to the
    /// signed-in user. Pass star=false to just release the claim.
    @MainActor static func setStreakPick(id: String, gameDate: String, star: Bool) async -> Bool {
        func patch(_ query: [URLQueryItem], _ payload: [String: Any]) async -> Bool {
            guard var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false) else { return false }
            comps.queryItems = query
            guard let body = try? JSONSerialization.data(withJSONObject: payload),
                  let url = comps.url,
                  let req = try? authedRequest(url, method: "PATCH", body: body) else { return false }
            return (try? await run(req)) != nil
        }
        if star {
            _ = await patch([URLQueryItem(name: "game_date", value: "eq.\(gameDate)"),
                             URLQueryItem(name: "streak_pick", value: "eq.true")],
                            ["streak_pick": false])
        }
        return await patch([URLQueryItem(name: "id", value: "eq.\(id)")], ["streak_pick": star])
    }

    /// Public riders/faders counts per pick for a date (aggregate only — the
    /// RPC exposes no user data). Anon-capable so counts show pre-sign-in.
    static func fetchTailCounts(gameDate: String) async -> [String: (tails: Int, fades: Int)] {
        guard let url = URL(string: "\(Secrets.supabaseURL.absoluteString)/rest/v1/rpc/pick_tail_counts") else { return [:] }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(Secrets.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["p_game_date": gameDate])
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200 else { return [:] }
        struct Row: Decodable { let pick_text: String; let tails: Int; let fades: Int }
        let rows = (try? JSONDecoder().decode([Row].self, from: data)) ?? []
        return Dictionary(uniqueKeysWithValues: rows.map { ($0.pick_text, (tails: $0.tails, fades: $0.fades)) })
    }

    /// Manual settle math mirrors the server's: win pays at the row's odds
    /// (assumed -110 when none was entered), loss is -stake, push is zero.
    static func manualUnits(status: String, stake: Double, odds: Int?) -> Double {
        let price = Double(odds ?? -110)
        switch status {
        case "won": return ((stake * (price > 0 ? price / 100 : 100 / abs(price))) * 100).rounded() / 100
        case "lost": return -stake
        default: return 0
        }
    }
}

// ── Tail/Fade row (pick card back) ──────────────────────────────────────────
// Sits under the conviction bar — the "I've read the case" moment. One tap
// arms a stake stepper; confirm logs it through the lock-checked RPC. After
// lock the row freezes into a receipt chip; after grading it shows the result.
struct TailFadeRow: View {
    let pick: GaryPick
    @State private var mine: UserBet? = nil
    @State private var arming: String? = nil      // "tail" | "fade" while picking stake
    @State private var stake: Double = 1.0
    @State private var busy = false
    @State private var errorText: String? = nil
    @State private var showAuth = false
    @State private var loaded = false
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
        guard let ct = pick.commence_time, let d = ISO8601DateFormatter().date(from: ct) else { return false }
        return Date() >= d
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
        .task(id: pick.id) {
            if riders == nil, let date = pickDateEST() {
                let counts = await UserBookAPI.fetchTailCounts(gameDate: date)
                if let c = counts[pick.pick ?? ""] { riders = c }
            }
            guard !loaded, AuthManager.shared.bearerToken != nil else { return }
            let all = await UserBookAPI.fetchMyBets()
            // Cancellation guard: never latch an empty result over a live row.
            if !all.isEmpty {
                mine = all.first { $0.pick_text == (pick.pick ?? "") && $0.pick_type == "game" }
            }
            loaded = true
        }
        .sheet(isPresented: $showAuth) { AuthView() }
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
        guard let ct = pick.commence_time, let d = ISO8601DateFormatter().date(from: ct) else {
            return SupabaseAPI.todayEST()
        }
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = TimeZone(identifier: "America/New_York")
        return fmt.string(from: d)
    }
}

// ── YOUR BOOK (the Billfold's YOU page) ─────────────────────────────────────
// Two ledgers, never mixed: WITH GARY = system-graded tails/fades (the
// flagship, unfakeable number); YOUR PLAYS = self-logged bets, labeled.
// Founder, Aug 20: "the You part should be very very close to the Gary
// billfold page" — same card grammar (soft-fill cards on the page ground,
// 14pt radius, 18pt section rhythm), same wallet-header voice, the pieces
// only a user has (streak, filters, split book, slips) as its own sections.
struct UserBookSection: View {
    @State private var bets: [UserBet] = []
    @State private var loading = true
    @State private var showQuickLog = false
    @State private var showAuthSheet = false
    @State private var showUnitSheet = false
    @AppStorage("userUnitDollars") private var userUnitDollars = 0.0
    @State private var shareImage: UserBookShareImage? = nil
    @State private var streak: UserBookAPI.UserStreak? = nil
    // Tracker controls (YOU page): window + source filters, live-slip context.
    @State private var timeframe = "all"          // 7d | 30d | season | all
    @State private var kindFilter = "all"         // all | tail | fade | manual
    @State private var liveScores: [LiveScore] = []
    @State private var todayPicks: [GaryPick] = []

    private var withGary: [UserBet] { bets.filter { $0.isVerified } }
    private var yourPlays: [UserBet] { bets.filter { $0.kind == "manual" } }

    private func record(_ rows: [UserBet]) -> (w: Int, l: Int, p: Int, units: Double) {
        var w = 0, l = 0, p = 0; var u = 0.0
        for b in rows {
            switch b.status {
            case "won": w += 1
            case "lost": l += 1
            case "push": p += 1
            default: break
            }
            u += b.units_net ?? 0
        }
        return (w, l, p, u)
    }

    /// The Gary-page card surface, verbatim (BillfoldView.paperCard).
    private func bookCard(radius: CGFloat = 14) -> some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(Color.white.opacity(0.055))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(Color.white.opacity(0.10), lineWidth: 1)
            )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if AuthManager.shared.bearerToken == nil {
                signedOutCard
            } else if loading {
                ProgressView().tint(.white.opacity(0.4))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 60)
            } else if withGary.isEmpty && yourPlays.isEmpty {
                emptyBookCard
            } else {
                // The book, in the Gary page's own order: the wallet header
                // (record + money + win%), the ride, then the pieces only a
                // user has — streak, filters, the split book, tiles, slips,
                // the day ledger.
                walletHeader
                if profitPoints.count >= 2 { profitChart }
                streakCrown
                VStack(alignment: .leading, spacing: 14) {
                    trackerFilters
                    splitBookHeader
                    statTiles
                }
                .padding(14)
                .background(bookCard())
                pendingBlock
                settledByDay
            }
        }
        .padding(.horizontal, 16)
        .task {
            guard AuthManager.shared.bearerToken != nil else { loading = false; return }
            let rows = await UserBookAPI.fetchMyBets()
            // Day-cache law: a cancelled fetch returns [] — never latch it
            // over data we already have.
            if !rows.isEmpty || bets.isEmpty { bets = rows }
            if let s = await UserBookAPI.fetchMyStreak() { streak = s }
            // Live context for open slips: today's picks carry the game_id
            // bridge into live_scores (slip pick_text == pick.pick is the
            // system-wide identity). Cancellation-safe: never latch empties.
            let today = SupabaseAPI.todayEST()
            if let picks = try? await SupabaseAPI.fetchDailyPicks(date: today), !picks.isEmpty {
                todayPicks = picks
            }
            let scores = await SupabaseAPI.fetchLiveScores(date: today)
            if let scores, !scores.isEmpty { liveScores = scores }
            loading = false
            // First landing on YOUR page without a unit size: ask right here,
            // inline — never send anyone to Settings (founder, Jul 26).
            if !BookMoney.isSet, !unitPromptShownThisSession {
                unitPromptShownThisSession = true
                showUnitSheet = true
            }
        }
        .sheet(isPresented: $showUnitSheet) { UnitSizeSheet() }
        .sheet(isPresented: $showQuickLog) {
            QuickLogSheet { newBet in bets.insert(newBet, at: 0) }
        }
        .sheet(isPresented: $showAuthSheet) { AuthView() }
        .sheet(item: $shareImage) { item in
            UserBookShareSheet(items: [item.image])
        }
    }

    // ── The wallet header — the Gary page's own top block, for YOUR numbers:
    // verified record big, the money beside it, win% + the run + the share
    // and log actions on the kicker row.
    private var walletHeader: some View {
        let g = record(withGary.filter { !$0.isPending })
        let decided = g.w + g.l
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("YOUR BOOK · GRADED BY THE MACHINE")
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(1.3)
                    .foregroundStyle(GaryColors.gold)
                Spacer()
                if withGary.contains(where: { !$0.isPending }) {
                    Button {
                        let line = (streak?.current ?? 0) >= 2
                            ? "Day \(streak!.current) of the streak"
                            : currentStreakText(withGary)
                        if let img = renderRideShareImage(record: g, streakText: line) {
                            shareImage = UserBookShareImage(image: img)
                        }
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.62))
                            .frame(width: 24, height: 24)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Share your record")
                }
                Button { showQuickLog = true } label: {
                    Text("+ LOG A BET")
                        .font(GaryFonts.mono(9.5, bold: true)).tracking(0.8)
                        .foregroundStyle(.black)
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(Capsule().fill(GaryColors.gold))
                }
                .buttonStyle(.plain)
            }
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text("\(g.w)\u{2013}\(g.l)\(g.p > 0 ? "\u{2013}\(g.p)" : "")")
                    .font(GaryFonts.text(40, .heavy))
                    .foregroundStyle(GaryColors.warmWhite)
                    .lineLimit(1).minimumScaleFactor(0.6)
                Text(BookMoney.netTotal(g.units))
                    .font(GaryFonts.mono(18, bold: true))
                    .foregroundStyle(g.units >= 0 ? GaryColors.win : GaryColors.loss)
                Spacer(minLength: 0)
            }
            HStack(spacing: 8) {
                if decided > 0 {
                    Text(String(format: "%.1f%% WIN", Double(g.w) / Double(decided) * 100))
                }
                if let run = runLabel(withGary) {
                    Text("·").foregroundStyle(.white.opacity(0.3))
                    Text(run).foregroundStyle(run.hasPrefix("W") ? GaryColors.gold : GaryColors.loss)
                }
                Text("·").foregroundStyle(.white.opacity(0.3))
                Text("LOCKED AT FIRST PITCH")
                Spacer()
            }
            .font(GaryFonts.mono(9.5, bold: true)).tracking(0.7)
            .foregroundStyle(.white.opacity(0.5))
        }
        .padding(16)
        .background(bookCard())
    }

    private var signedOutCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("YOUR BOOK")
                .font(GaryFonts.mono(11, bold: true)).tracking(1.4)
                .foregroundStyle(GaryColors.gold)
            Text("Sign in and every pick you tail or fade goes on your own record — graded by the same system that grades Gary.")
                .font(GaryFonts.text(13))
                .foregroundStyle(.white.opacity(0.6))
                .fixedSize(horizontal: false, vertical: true)
            Button { showAuthSheet = true } label: {
                Text("Sign in")
                    .font(GaryFonts.mono(11, bold: true)).tracking(1)
                    .foregroundStyle(.black)
                    .padding(.horizontal, 16).padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 7).fill(GaryColors.gold))
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(bookCard())
    }

    private var emptyBookCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("YOUR BOOK")
                .font(GaryFonts.mono(11, bold: true)).tracking(1.4)
                .foregroundStyle(GaryColors.gold)
            Text("No entries yet. Tail or fade any pick from its card — your side locks at first pitch and grades itself.")
                .font(GaryFonts.text(13))
                .foregroundStyle(.white.opacity(0.6))
                .fixedSize(horizontal: false, vertical: true)
            Button { showQuickLog = true } label: {
                Text("+ LOG A BET")
                    .font(GaryFonts.mono(10, bold: true)).tracking(0.8)
                    .foregroundStyle(.black)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(Capsule().fill(GaryColors.gold))
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(bookCard())
    }

    /// THE STREAK crown — the one-play-a-day game, wearing the board's own
    /// streak grammar (founder, Aug 20: the streak reads like mock 03 — the
    /// run IS the headline). Server-written numbers only.
    private var streakCrown: some View {
        let todayPlay = bets.first { $0.streak_pick == true && $0.isPending }
        let ember = Color(hex: "#E5844B")
        let current = streak?.current ?? 0
        return HStack(alignment: .center, spacing: 14) {
            // The run, board-style: "W4" alive, "0" waiting — the numeral
            // carries the card exactly as STRK carries the podium.
            VStack(spacing: 1) {
                Text(current > 0 ? "W\(current)" : "0")
                    .font(GaryFonts.mono(30, bold: true))
                    .foregroundStyle(current > 0 ? ember : .white.opacity(0.4))
                Text("BEST \(streak?.best ?? 0)")
                    .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
                    .foregroundStyle(.white.opacity(0.45))
            }
            .frame(width: 78)
            Rectangle().fill(Color.white.opacity(0.08)).frame(width: 1)
                .padding(.vertical, 2)
            VStack(alignment: .leading, spacing: 3) {
                Text("THE STREAK")
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(1.1)
                    .foregroundStyle(ember)
                Text(streakStateLine(todayPlay: todayPlay))
                    .font(GaryFonts.text(12.5))
                    .foregroundStyle(.white.opacity(0.6))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(ember.opacity(0.06))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(ember.opacity(current > 0 ? 0.35 : 0.15), lineWidth: 1))
        )
    }

    private func streakStateLine(todayPlay: UserBet?) -> String {
        if let p = todayPlay {
            return "Tonight's streak play is set: \(p.pick_text)"
        }
        if (streak?.current ?? 0) > 0 {
            return "One play a day keeps it alive. Pick tonight's from any card."
        }
        return "One play a day. Win and it grows, lose and it resets. Mark any tail or fade as your streak play."
    }

    private func currentStreakText(_ rows: [UserBet]) -> String? {
        let graded = rows.filter { !$0.isPending && $0.status != "void" && $0.status != "push" }
            .sorted { ($0.placed_at ?? "") > ($1.placed_at ?? "") }
        guard let first = graded.first, first.status == "won" else { return nil }
        var count = 0
        for b in graded { if b.status == "won" { count += 1 } else { break } }
        guard count >= 2 else { return nil }
        return "Riding a \(count)-bet heater"
    }

    /// "W5" / "L2" — the newest-back run through a lane's settled rows,
    /// pushes skipped. Nil until the lane has a decided bet.
    private func runLabel(_ rows: [UserBet]) -> String? {
        let decided = rows
            .filter { $0.status == "won" || $0.status == "lost" }
            .sorted { a, b in
                a.game_date == b.game_date
                    ? (a.placed_at ?? "") > (b.placed_at ?? "")
                    : a.game_date > b.game_date
            }
        guard let first = decided.first else { return nil }
        let kind = first.status
        let len = decided.prefix(while: { $0.status == kind }).count
        return "\(kind == "won" ? "W" : "L")\(len)"
    }

    /// THE SPLIT BOOK (founder pick Aug 20, mock 15): the verified WITH GARY
    /// half wears the gold stroke; the self-graded YOUR PLAYS half stays
    /// neutral and labeled. The two ledgers never mix — this panel is the
    /// page saying so.
    private var splitBookHeader: some View {
        let g = record(scopedWithGary.filter { !$0.isPending })
        let m = record(scopedYourPlays.filter { !$0.isPending })
        let gDecided = g.w + g.l
        let mDecided = m.w + m.l
        func half(_ title: String, _ r: (w: Int, l: Int, p: Int, units: Double),
                  decided: Int, run: String?, stroked: Bool) -> some View {
            VStack(alignment: .leading, spacing: 3) {
                // Mock 15: both labels stay quiet — the gold STROKE alone
                // marks the verified half.
                Text(title)
                    .font(GaryFonts.mono(8, bold: true)).tracking(0.9)
                    .foregroundStyle(.white.opacity(0.4))
                Text("\(r.w)-\(r.l)\(r.p > 0 ? "-\(r.p)" : "")")
                    .font(GaryFonts.text(24, .heavy))
                    .foregroundStyle(.white.opacity(0.92))
                HStack(spacing: 5) {
                    if decided > 0 {
                        Text(String(format: "%.1f%%", Double(r.w) / Double(decided) * 100))
                    }
                    if let run {
                        if decided > 0 { Text("·").foregroundStyle(.white.opacity(0.3)) }
                        Text(run).foregroundStyle(run.hasPrefix("W") ? GaryColors.gold : GaryColors.loss)
                    }
                    if decided > 0 || run != nil { Text("·").foregroundStyle(.white.opacity(0.3)) }
                    Text(BookMoney.netTotal(r.units))
                        .foregroundStyle(r.units >= 0 ? GaryColors.win : GaryColors.loss)
                }
                .font(GaryFonts.mono(10, bold: true))
                .foregroundStyle(.white.opacity(0.55))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.white.opacity(0.04))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(stroked ? GaryColors.gold.opacity(0.4) : Color.white.opacity(0.1), lineWidth: 1))
            )
        }
        return HStack(spacing: 8) {
            half("WITH GARY · VERIFIED", g, decided: gDecided,
                 run: runLabel(scopedWithGary), stroked: true)
            half("YOUR PLAYS · SELF-GRADED", m, decided: mDecided,
                 run: runLabel(scopedYourPlays), stroked: false)
        }
    }

    // (ledgerHeader/slipsList — the old compact inline module — came out
    // Aug 20 with the facelift: the section renders only as the full page.)

    // ── Tracker: scope filters ──────────────────────────────────────────────

    private func inTimeframe(_ b: UserBet) -> Bool {
        guard timeframe != "all" else { return true }
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "America/New_York")
        guard let d = f.date(from: b.game_date), let today = f.date(from: SupabaseAPI.todayEST()) else { return true }
        switch timeframe {
        case "7d": return d >= today.addingTimeInterval(-7 * 86400)
        case "30d": return d >= today.addingTimeInterval(-30 * 86400)
        case "season": return b.game_date >= "2026-03-01"
        default: return true
        }
    }

    private var scopedBets: [UserBet] {
        bets.filter { b in
            inTimeframe(b) && (kindFilter == "all" || b.kind == kindFilter)
        }
    }
    private var scopedWithGary: [UserBet] { scopedBets.filter { $0.isVerified } }
    private var scopedYourPlays: [UserBet] { scopedBets.filter { $0.kind == "manual" } }
    private var scopedSettled: [UserBet] { scopedBets.filter { !$0.isPending } }
    /// Open slips ignore the timeframe — a pending bet is always "now".
    private var openSlips: [UserBet] {
        bets.filter { $0.isPending && (kindFilter == "all" || $0.kind == kindFilter) }
            .sorted { ($0.lock_at ?? "9999") < ($1.lock_at ?? "9999") }
    }

    /// One line, the board's own control grammar (founder, Aug 20: "the
    /// filters need some TLC"): source lenses as underline tabs, the window
    /// as the quiet dropdown ClassicLeaderboardView already speaks.
    private var trackerFilters: some View {
        HStack(alignment: .bottom, spacing: 14) {
            filterChip("ALL", key: "all")
            filterChip("TAILS", key: "tail")
            filterChip("FADES", key: "fade")
            filterChip("YOURS", key: "manual")
            Spacer()
            Menu {
                Button("Last 7 days") { timeframe = "7d" }
                Button("Last 30 days") { timeframe = "30d" }
                Button("Season") { timeframe = "season" }
                Button("All time") { timeframe = "all" }
            } label: {
                HStack(spacing: 4) {
                    Text(timeframe == "season" ? "SEASON" : timeframe == "all" ? "ALL TIME" : timeframe.uppercased())
                        .font(GaryFonts.mono(10)).tracking(0.8)
                    Image(systemName: "chevron.down").font(.system(size: 8, weight: .semibold))
                }
                .foregroundStyle(.white.opacity(0.55))
            }
        }
    }

    private func filterChip(_ label: String, key: String) -> some View {
        // Underline-tab grammar — never a pill (founder law, Jul 26).
        let isOn = kindFilter == key
        return Button { kindFilter = key } label: {
            VStack(spacing: 3) {
                Text(label)
                    .font(GaryFonts.mono(10, bold: true)).tracking(1)
                    .foregroundStyle(isOn ? GaryColors.gold : .white.opacity(0.5))
                Rectangle().fill(isOn ? GaryColors.gold : .clear).frame(height: 1.5)
            }
            .fixedSize()
        }
        .buttonStyle(.plain)
    }

    // ── Tracker: stat tiles ─────────────────────────────────────────────────

    private var statTiles: some View {
        let settled = scopedSettled.filter { $0.status != "void" }
        let decisive = settled.filter { $0.status == "won" || $0.status == "lost" }
        let wins = decisive.filter { $0.status == "won" }.count
        let winPct = decisive.isEmpty ? nil : Double(wins) / Double(decisive.count) * 100
        let staked = decisive.reduce(0.0) { $0 + $1.stake_units }
        let net = settled.reduce(0.0) { $0 + ($1.units_net ?? 0) }
        let roi = staked > 0 ? net / staked * 100 : nil
        // American odds never average by arithmetic mean — a +100 and a -108
        // "averaged" to -4 (seen live Aug 20). Average in implied-probability
        // space, then convert back to a real American price.
        let oddsVals = decisive.compactMap { $0.odds_american }.map(Double.init)
        let avgOdds: Int? = {
            guard !oddsVals.isEmpty else { return nil }
            let probs = oddsVals.map { o in o > 0 ? 100 / (o + 100) : -o / (-o + 100) }
            let p = probs.reduce(0, +) / Double(probs.count)
            guard p > 0, p < 1 else { return nil }
            let american = p >= 0.5 ? -(p / (1 - p)) * 100 : ((1 - p) / p) * 100
            return Int(american.rounded())
        }()
        let bestDay = dayGroups.map { $0.net }.max()

        return HStack(spacing: 8) {
            statTile("WIN%", winPct.map { String(format: "%.0f%%", $0) } ?? "--")
            statTile("ROI", roi.map { String(format: "%+.0f%%", $0) } ?? "--",
                     tint: (roi ?? 0) >= 0 ? GaryColors.win : GaryColors.loss)
            statTile("AVG ODDS", avgOdds.map { "\($0 > 0 ? "+" : "")\($0)" } ?? "--")
            statTile("BEST DAY", bestDay.map { BookMoney.netTotal($0) } ?? "--",
                     tint: GaryColors.gold)
        }
    }

    private func statTile(_ label: String, _ value: String, tint: Color = .white.opacity(0.88)) -> some View {
        VStack(spacing: 3) {
            Text(value)
                .font(GaryFonts.mono(13, bold: true))
                .foregroundStyle(tint)
                .lineLimit(1).minimumScaleFactor(0.7)
            Text(label)
                .font(GaryFonts.mono(8, bold: true)).tracking(0.7)
                .foregroundStyle(.white.opacity(0.4))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 9)
        .background(RoundedRectangle(cornerRadius: 9).fill(Color.white.opacity(0.04)))
    }

    // ── Tracker: profit line ────────────────────────────────────────────────

    /// Cumulative settled units in play order (game_date, then placement).
    private var profitPoints: [Double] {
        let settled = scopedSettled
            .filter { $0.status != "void" }
            .sorted { a, b in
                a.game_date == b.game_date
                    ? (a.placed_at ?? "") < (b.placed_at ?? "")
                    : a.game_date < b.game_date
            }
        var running = 0.0
        return settled.map { running += ($0.units_net ?? 0); return running }
    }

    /// THE RIDE — the user's equity curve, drawn to the Gary chart's own
    /// standard (founder, Aug 20: the YOU page reads like the Gary page):
    /// taller stage, the high-water and low-water marks priced in money,
    /// gradient under the line, the current position as a lit endpoint.
    private var profitChart: some View {
        let pts = profitPoints
        let lo = min(0, pts.min() ?? 0), hi = max(0, pts.max() ?? 0)
        let span = max(hi - lo, 0.001)
        let final = pts.last ?? 0
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text("THE RIDE")
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(1.1)
                    .foregroundStyle(.white.opacity(0.5))
                Text("\(pts.count) settled")
                    .font(GaryFonts.mono(9))
                    .foregroundStyle(.white.opacity(0.35))
                Spacer()
                Text(BookMoney.netTotal(final))
                    .font(GaryFonts.mono(15, bold: true))
                    .foregroundStyle(final >= 0 ? GaryColors.win : GaryColors.loss)
            }
            GeometryReader { geo in
                let w = geo.size.width, h = geo.size.height
                let x = { (i: Int) in pts.count > 1 ? w * CGFloat(i) / CGFloat(pts.count - 1) : 0 }
                let y = { (v: Double) in h - h * CGFloat((v - lo) / span) }
                ZStack(alignment: .topLeading) {
                    // zero baseline
                    Path { p in
                        p.move(to: CGPoint(x: 0, y: y(0)))
                        p.addLine(to: CGPoint(x: w, y: y(0)))
                    }
                    .stroke(Color.white.opacity(0.12), style: StrokeStyle(lineWidth: 0.5, dash: [3, 4]))
                    // area under the line
                    Path { p in
                        p.move(to: CGPoint(x: 0, y: y(0)))
                        for (i, v) in pts.enumerated() { p.addLine(to: CGPoint(x: x(i), y: y(v))) }
                        p.addLine(to: CGPoint(x: w, y: y(0)))
                        p.closeSubpath()
                    }
                    .fill(LinearGradient(colors: [GaryColors.gold.opacity(0.18), GaryColors.gold.opacity(0.02)],
                                         startPoint: .top, endPoint: .bottom))
                    // the line
                    Path { p in
                        for (i, v) in pts.enumerated() {
                            let pt = CGPoint(x: x(i), y: y(v))
                            i == 0 ? p.move(to: pt) : p.addLine(to: pt)
                        }
                    }
                    .stroke(GaryColors.gold, style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
                    // the current position, lit
                    if let last = pts.last {
                        Circle()
                            .fill(GaryColors.gold)
                            .frame(width: 5, height: 5)
                            .position(x: x(pts.count - 1), y: y(last))
                            .shadow(color: GaryColors.gold.opacity(0.8), radius: 3)
                    }
                    // high/low water marks, priced
                    if hi > 0 {
                        Text(BookMoney.netTotal(hi))
                            .font(GaryFonts.mono(8))
                            .foregroundStyle(.white.opacity(0.35))
                            .offset(x: 2, y: max(y(hi) - 11, 0))
                    }
                    if lo < 0 {
                        Text(BookMoney.netTotal(lo))
                            .font(GaryFonts.mono(8))
                            .foregroundStyle(.white.opacity(0.35))
                            .offset(x: 2, y: min(y(lo) + 3, h - 10))
                    }
                }
            }
            .frame(height: 108)
        }
        .padding(14)
        .background(bookCard())
    }

    // ── Tracker: open slips with live context ───────────────────────────────

    /// slip -> tonight's live score, bridged through today's pick identity
    /// (slip.pick_text == pick.pick, pick.game_id == live_scores.game_id).
    private func liveScore(for bet: UserBet) -> LiveScore? {
        guard bet.game_date == SupabaseAPI.todayEST(), bet.pick_type == "game" else { return nil }
        guard let gid = todayPicks.first(where: { ($0.pick ?? "") == bet.pick_text })?.game_id else { return nil }
        return liveScores.first { $0.game_id == String(gid) }
    }

    private func startTime(for bet: UserBet) -> String? {
        guard let lock = bet.lock_at else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let d = iso.date(from: lock) ?? ISO8601DateFormatter().date(from: lock)
        guard let date = d else { return nil }
        let f = DateFormatter()
        f.dateFormat = "h:mm a"
        f.timeZone = TimeZone(identifier: "America/New_York")
        return f.string(from: date)
    }

    @ViewBuilder private var pendingBlock: some View {
        if !openSlips.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                Text("OPEN SLIPS")
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                    .foregroundStyle(.white.opacity(0.5))
                    .padding(.bottom, 4)
                openSlipRows
            }
            .padding(14)
            .background(bookCard())
        }
    }

    private var openSlipRows: some View {
        Group {
                ForEach(openSlips) { bet in
                    HStack(spacing: 10) {
                        Text(bet.kind == "fade" ? "FADE" : bet.kind == "tail" ? "TAIL" : "YOURS")
                            .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
                            .foregroundStyle(bet.kind == "fade" ? Color(hex: "#8B93A7") : GaryColors.gold)
                            .frame(width: 38, alignment: .leading)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(bet.pick_text)
                                    .font(GaryFonts.text(13))
                                    .foregroundStyle(.white.opacity(0.88))
                                    .lineLimit(1).minimumScaleFactor(0.75)
                                if bet.streak_pick == true {
                                    Text("STREAK")
                                        .font(GaryFonts.mono(8, bold: true)).tracking(0.6)
                                        .foregroundStyle(Color(hex: "#E5844B"))
                                }
                            }
                            Text("\(BookMoney.stake(bet.stake_units))\(bet.odds_american.map { " · \($0 > 0 ? "+" : "")\($0)" } ?? "")")
                                .font(GaryFonts.mono(9))
                                .foregroundStyle(.white.opacity(0.4))
                        }
                        Spacer(minLength: 8)
                        pendingTrailing(bet)
                    }
                    .padding(.vertical, 8)
                    if bet.id != openSlips.last?.id {
                        Rectangle().fill(.white.opacity(0.05)).frame(height: 0.5)
                    }
                }
        }
    }

    @ViewBuilder private func pendingTrailing(_ bet: UserBet) -> some View {
        if let live = liveScore(for: bet) {
            if live.isLive {
                HStack(spacing: 5) {
                    Circle().fill(GaryColors.loss).frame(width: 5, height: 5)
                    Text("\(live.away_score ?? 0)-\(live.home_score ?? 0)\(live.detail.map { " · \($0)" } ?? "")")
                        .font(GaryFonts.mono(10, bold: true))
                        .foregroundStyle(.white.opacity(0.8))
                }
            } else if live.isFinal {
                Text("FINAL · SETTLING")
                    .font(GaryFonts.mono(8.5, bold: true)).tracking(0.6)
                    .foregroundStyle(.white.opacity(0.45))
            } else if let t = startTime(for: bet) {
                Text(t)
                    .font(GaryFonts.mono(10, bold: true))
                    .foregroundStyle(.white.opacity(0.5))
            }
        } else if let t = startTime(for: bet) {
            Text(t)
                .font(GaryFonts.mono(10, bold: true))
                .foregroundStyle(.white.opacity(0.5))
        } else {
            Text("OPEN")
                .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
                .foregroundStyle(.white.opacity(0.35))
        }
    }

    // ── Tracker: the day ledger ─────────────────────────────────────────────

    private var dayGroups: [(date: String, net: Double, rows: [UserBet])] {
        let settled = scopedSettled
        let grouped = Dictionary(grouping: settled, by: { $0.game_date })
        return grouped.keys.sorted(by: >).map { d in
            let rows = (grouped[d] ?? []).sorted { ($0.placed_at ?? "") > ($1.placed_at ?? "") }
            let net = rows.reduce(0.0) { $0 + ($1.units_net ?? 0) }
            return (d, net, rows)
        }
    }

    private func dayLabel(_ dateStr: String) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "America/New_York")
        guard let d = f.date(from: dateStr) else { return dateStr }
        let out = DateFormatter()
        out.dateFormat = "EEE M/d"
        out.timeZone = TimeZone(identifier: "America/New_York")
        return out.string(from: d).uppercased()
    }

    @ViewBuilder private var settledByDay: some View {
        if !dayGroups.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                Text("THE LEDGER")
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                    .foregroundStyle(.white.opacity(0.5))
                    .padding(.bottom, 2)
                ForEach(dayGroups.prefix(30), id: \.date) { group in
                    HStack {
                        Text(dayLabel(group.date))
                            .font(GaryFonts.mono(9.5, bold: true)).tracking(0.8)
                            .foregroundStyle(.white.opacity(0.55))
                        Spacer()
                        Text(BookMoney.netTotal(group.net))
                            .font(GaryFonts.mono(10, bold: true))
                            .foregroundStyle(group.net > 0 ? GaryColors.win
                                             : group.net < 0 ? GaryColors.loss : .white.opacity(0.45))
                    }
                    .padding(.top, 10).padding(.bottom, 2)
                    ForEach(group.rows) { bet in
                        UserBetSlipRow(bet: bet) { updated in
                            if let i = bets.firstIndex(where: { $0.id == updated.id }) { bets[i] = updated }
                        } onDelete: {
                            bets.removeAll { $0.id == bet.id }
                        }
                        if bet.id != group.rows.last?.id {
                            Rectangle().fill(.white.opacity(0.04)).frame(height: 0.5)
                        }
                    }
                }
            }
            .padding(14)
            .background(bookCard())
        }
    }
}

struct UserBookShareImage: Identifiable {
    let id = UUID()
    let image: UIImage
}

/// Plain UIActivityViewController wrapper for the Your Book share card
/// (mirrors the pick-card share sheet pattern).
struct UserBookShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

// ── Prop slip tail/fade (Aug 3 2026) ────────────────────────────────────────
// The prop back never had the action block — place_user_prop_bet shipped
// Jul 26 with no UI on the card. Same grammar as TailFadeRow with the prop
// RPC underneath; no streak claim (game picks own the streak) and no riders
// counts yet (the counts RPC is game-pick keyed).
struct PropTailFadeRow: View {
    let prop: PropPick
    @State private var mine: UserBet? = nil
    @State private var arming: String? = nil
    @State private var stake: Double = 1.0
    @State private var busy = false
    @State private var errorText: String? = nil
    @State private var showAuth = false
    @State private var loaded = false
    @State private var streakOn = false

    /// The board's prop token ("total_bases 1.5" → "total_bases") — the same
    /// key the grader settles user prop bets on.
    private var propToken: String {
        String((prop.prop ?? "").split(separator: " ").first ?? "").lowercased()
    }
    private var locked: Bool {
        guard let ct = prop.commence_time, let d = ISO8601DateFormatter().date(from: ct) else { return false }
        return Date() >= d
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // "YOUR CALL" kicker removed (founder, Aug 4, both card backs) —
            // the buttons speak for themselves and the block moves up.
            if let bet = mine {
                placedChip(bet)
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
        .task(id: prop.id) {
            guard !loaded, AuthManager.shared.bearerToken != nil else { return }
            let all = await UserBookAPI.fetchMyBets()
            if !all.isEmpty {
                mine = all.first {
                    $0.pick_type == "prop"
                        && ($0.player_name ?? "").lowercased() == (prop.player ?? "").lowercased()
                        && ($0.prop_type ?? "").lowercased() == propToken
                }
            }
            loaded = true
        }
        .sheet(isPresented: $showAuth) { AuthView() }
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
        let dateStr: String = {
            guard let ct = prop.commence_time, let d = ISO8601DateFormatter().date(from: ct) else {
                return SupabaseAPI.todayEST()
            }
            let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
            f.timeZone = TimeZone(identifier: "America/New_York")
            return f.string(from: d)
        }()
        busy = true
        Task {
            defer { busy = false }
            do {
                var bet = try await UserBookAPI.placePropBet(
                    gameDate: dateStr, player: player, propType: propToken, kind: side, stake: stake)
                if streakOn, await UserBookAPI.setStreakPick(id: bet.id, gameDate: bet.game_date, star: true) {
                    bet = UserBet(id: bet.id, kind: bet.kind, pick_type: bet.pick_type,
                        game_date: bet.game_date, league: bet.league, pick_text: bet.pick_text,
                        matchup: bet.matchup, player_name: bet.player_name, prop_type: bet.prop_type,
                        description: bet.description, odds_american: bet.odds_american,
                        odds_estimated: bet.odds_estimated, stake_units: bet.stake_units,
                        gary_confidence: bet.gary_confidence, streak_pick: true,
                        status: bet.status, units_net: bet.units_net, lock_at: bet.lock_at,
                        placed_at: bet.placed_at, graded_by: bet.graded_by)
                }
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

private struct UserBetSlipRow: View {
    let bet: UserBet
    var onUpdate: (UserBet) -> Void
    var onDelete: () -> Void
    @State private var busy = false

    private var kindLabel: String {
        switch bet.kind {
        case "tail": return "TAIL"
        case "fade": return "FADE"
        default: return "YOURS"
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            // Founder pick Aug 20 (mock 12/15): the source rides as a stroked
            // chip — TAIL/FADE gold (verified lane), YOURS neutral — and the
            // play-of-the-day star sits beside the pick it marks.
            Text(kindLabel)
                .font(GaryFonts.mono(8, bold: true)).tracking(0.7)
                .foregroundStyle(bet.kind == "manual" ? .white.opacity(0.5) : GaryColors.gold)
                // One line always — the chip's column width squeezed "FADE"
                // into "FAD E" (seen live Aug 20; wrapping is clipping).
                .lineLimit(1).fixedSize()
                .padding(.horizontal, 6).padding(.vertical, 3)
                .background(
                    Capsule().stroke(
                        bet.kind == "manual" ? Color.white.opacity(0.18) : GaryColors.gold.opacity(0.45),
                        lineWidth: 1)
                )
                .frame(width: 50, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 5) {
                    Text(bet.pick_text)
                        .font(GaryFonts.text(13))
                        .foregroundStyle(.white.opacity(0.85))
                        .lineLimit(2).minimumScaleFactor(0.8)
                        .fixedSize(horizontal: false, vertical: true)
                    // The star IS the streak designation (founder, Aug 20:
                    // "enter or star the bet they want to go towards their
                    // streak"). Pending rows toggle it — one play a day, the
                    // server-side claim moves with the tap. Settled rows keep
                    // it as the record of which play carried the day.
                    if bet.isPending {
                        Button {
                            let turningOn = bet.streak_pick != true
                            busy = true
                            Task {
                                defer { busy = false }
                                if await UserBookAPI.setStreakPick(id: bet.id, gameDate: bet.game_date, star: turningOn) {
                                    onUpdate(UserBet(id: bet.id, kind: bet.kind, pick_type: bet.pick_type,
                                        game_date: bet.game_date, league: bet.league, pick_text: bet.pick_text,
                                        matchup: bet.matchup, player_name: bet.player_name, prop_type: bet.prop_type,
                                        description: bet.description, odds_american: bet.odds_american,
                                        odds_estimated: bet.odds_estimated, stake_units: bet.stake_units,
                                        gary_confidence: bet.gary_confidence, streak_pick: turningOn,
                                        status: bet.status, units_net: bet.units_net, lock_at: bet.lock_at,
                                        placed_at: bet.placed_at, graded_by: bet.graded_by))
                                }
                            }
                        } label: {
                            Image(systemName: bet.streak_pick == true ? "star.fill" : "star")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(bet.streak_pick == true ? Color(hex: "#E5844B") : .white.opacity(0.35))
                                .frame(width: 20, height: 20)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(busy)
                        .accessibilityLabel(bet.streak_pick == true ? "Streak play — tap to unstar" : "Star as your streak play")
                    } else if bet.streak_pick == true {
                        Image(systemName: "star.fill")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(Color(hex: "#E5844B"))
                            .accessibilityLabel("Play of the day")
                    }
                }
                // Conviction-vs-Gary read: your stake beside Gary's own tier.
                Text("\(bet.game_date) · You \(BookMoney.stake(bet.stake_units))\(bet.odds_american.map { " · \($0 > 0 ? "+" : "")\($0)" } ?? "")\(bet.gary_confidence.map { " · Gary \(convictionTier($0))" } ?? "")")
                    .font(GaryFonts.mono(9))
                    .foregroundStyle(.white.opacity(0.4))
            }
            Spacer(minLength: 8)
            trailing
        }
        .padding(.vertical, 9)
    }

    @ViewBuilder private var trailing: some View {
        if bet.isPending && bet.kind == "manual" {
            HStack(spacing: 6) {
                gradeChip("W", "won", GaryColors.win)
                gradeChip("L", "lost", GaryColors.loss)
                gradeChip("P", "push", .white.opacity(0.5))
            }
        } else if bet.isPending {
            Text("PENDING")
                .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
                .foregroundStyle(.white.opacity(0.35))
        } else {
            let won = bet.status == "won"
            let wash = bet.status == "push" || bet.status == "void"
            Text(wash ? bet.status.uppercased() : BookMoney.net(bet.units_net ?? 0))
                .font(GaryFonts.mono(11, bold: true))
                .foregroundStyle(wash ? .white.opacity(0.45) : (won ? GaryColors.win : GaryColors.loss))
        }
    }

    private func gradeChip(_ label: String, _ status: String, _ tint: Color) -> some View {
        Button {
            busy = true
            let units = UserBookAPI.manualUnits(status: status, stake: bet.stake_units, odds: bet.odds_american)
            Task {
                defer { busy = false }
                if await UserBookAPI.gradeManual(id: bet.id, status: status, unitsNet: units) {
                    onUpdate(UserBet(id: bet.id, kind: bet.kind, pick_type: bet.pick_type,
                        game_date: bet.game_date, league: bet.league, pick_text: bet.pick_text,
                        matchup: bet.matchup, player_name: bet.player_name, prop_type: bet.prop_type,
                        description: bet.description, odds_american: bet.odds_american,
                        odds_estimated: bet.odds_estimated, stake_units: bet.stake_units,
                        gary_confidence: bet.gary_confidence, streak_pick: bet.streak_pick,
                        status: status, units_net: units, lock_at: bet.lock_at,
                        placed_at: bet.placed_at, graded_by: "user"))
                }
            }
        } label: {
            Text(label)
                .font(GaryFonts.mono(10, bold: true))
                .foregroundStyle(tint)
                .frame(width: 26, height: 26)
                .background(Circle().stroke(tint.opacity(0.5), lineWidth: 1))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }
}

// ── Add-a-bet sheet — the DIRECTORY (founder, Aug 20: "a directory search
// look up of all the bets they could have be their streak, then its a simple
// click rather than like a full log of the bet") ────────────────────────────
// Tonight's whole board — every game pick and prop Gary published — behind
// one search field. Tap a bet, pick your side, it books through the same
// lock-checked RPCs as the card buttons (VERIFIED lane, streak-eligible).
// The old free-text form survives underneath as "an outside bet" for plays
// that aren't on Gary's board (self-graded, YOUR PLAYS lane).
struct QuickLogSheet: View {
    var onLogged: (UserBet) -> Void
    @Environment(\.dismiss) private var dismiss

    private struct DirectoryEntry: Identifiable {
        let id: String
        let title: String        // "CARDINALS ML -108" / "Aaron Judge total_bases 1.5"
        let subtitle: String     // "MLB · STL @ CHC · 7:45 PM"
        let isProp: Bool
        let gameDate: String
        let pickText: String     // game lane identity (pick.pick)
        let player: String?      // prop lane identity
        let propToken: String?
        let pickId: String?
        let locked: Bool
    }

    @State private var entries: [DirectoryEntry] = []
    @State private var loadingBoard = true
    @State private var search = ""
    @State private var armedId: String? = nil
    @State private var side = "tail"
    @State private var stake: Double = 1.0
    @State private var streakOn = false
    @State private var busy = false
    @State private var errorText: String? = nil
    @State private var showOutside = false
    @State private var draft = UserBookAPI.ManualBetDraft()
    @State private var oddsText = ""
    private let leagues = ["MLB", "NFL", "NCAAF", "NBA", "NHL", "OTHER"]
    private let ember = Color(hex: "#E5844B")

    private var filtered: [DirectoryEntry] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return entries }
        return entries.filter {
            $0.title.lowercased().contains(q) || $0.subtitle.lowercased().contains(q)
        }
    }

    var body: some View {
        ZStack {
            Color(hex: "#141212").ignoresSafeArea()
            VStack(alignment: .leading, spacing: 0) {
                header
                searchField
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        if loadingBoard {
                            ProgressView().tint(.white.opacity(0.4))
                                .frame(maxWidth: .infinity).padding(.vertical, 40)
                        } else if filtered.isEmpty {
                            Text(entries.isEmpty
                                 ? "Tonight's board hasn't posted yet. You can still log an outside bet below."
                                 : "Nothing on tonight's board matches that.")
                                .font(GaryFonts.text(12.5))
                                .foregroundStyle(.white.opacity(0.5))
                                .padding(.vertical, 24)
                                .frame(maxWidth: .infinity)
                        } else {
                            ForEach(filtered) { entry in
                                directoryRow(entry)
                                if entry.id != filtered.last?.id {
                                    Rectangle().fill(.white.opacity(0.05)).frame(height: 0.5)
                                }
                            }
                        }
                        outsideBetBlock
                    }
                    .padding(.bottom, 30)
                }
            }
            .padding(.horizontal, 18)
        }
        .task { await loadBoard() }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("ADD A BET")
                    .font(GaryFonts.mono(12, bold: true)).tracking(1.4)
                    .foregroundStyle(GaryColors.gold)
                Text("Tonight's board — tap a bet, pick a side. Star it and it rides your streak.")
                    .font(GaryFonts.text(12))
                    .foregroundStyle(.white.opacity(0.55))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.55))
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(Color.white.opacity(0.06)))
            }
            .buttonStyle(.plain)
        }
        .padding(.top, 18).padding(.bottom, 12)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white.opacity(0.4))
            TextField("Search a team, player, or market", text: $search)
                .font(GaryFonts.text(14))
                .foregroundStyle(.white)
                .autocorrectionDisabled()
            if !search.isEmpty {
                Button { search = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 13))
                        .foregroundStyle(.white.opacity(0.35))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.white.opacity(0.06))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(Color.white.opacity(0.10), lineWidth: 1))
        )
        .padding(.bottom, 6)
    }

    @ViewBuilder private func directoryRow(_ entry: DirectoryEntry) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                errorText = nil
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    armedId = armedId == entry.id ? nil : entry.id
                    side = "tail"; streakOn = false
                }
            } label: {
                HStack(spacing: 10) {
                    Text(entry.isProp ? "PROP" : "GAME")
                        .font(GaryFonts.mono(8, bold: true)).tracking(0.7)
                        .foregroundStyle(.white.opacity(0.45))
                        .frame(width: 38, alignment: .leading)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.title)
                            .font(GaryFonts.text(13.5, .semibold))
                            .foregroundStyle(.white.opacity(0.9))
                            .lineLimit(1).minimumScaleFactor(0.75)
                        Text(entry.subtitle)
                            .font(GaryFonts.mono(9))
                            .foregroundStyle(.white.opacity(0.4))
                            .lineLimit(1).minimumScaleFactor(0.8)
                    }
                    Spacer(minLength: 8)
                    if entry.locked {
                        Text("LOCKED")
                            .font(GaryFonts.mono(8.5, bold: true)).tracking(0.7)
                            .foregroundStyle(.white.opacity(0.35))
                    } else {
                        Image(systemName: armedId == entry.id ? "chevron.up" : "plus")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(GaryColors.gold.opacity(0.8))
                    }
                }
                .padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(entry.locked)

            if armedId == entry.id, !entry.locked {
                armedControls(entry)
                    .padding(.bottom, 10)
            }
        }
    }

    private func armedControls(_ entry: DirectoryEntry) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                sideChip("RIDE IT", key: "tail", tint: GaryColors.gold)
                sideChip("FADE IT", key: "fade", tint: Color(hex: "#8B93A7"))
                Spacer(minLength: 6)
                stepChip("minus") { stake = max(0.5, stake - 0.5) }
                Text(BookMoney.stake(stake))
                    .font(GaryFonts.mono(12.5, bold: true))
                    .foregroundStyle(.white.opacity(0.9))
                    .frame(minWidth: 44)
                stepChip("plus") { stake = min(5, stake + 0.5) }
            }
            HStack(spacing: 10) {
                Button { streakOn.toggle() } label: {
                    HStack(spacing: 5) {
                        Image(systemName: streakOn ? "star.fill" : "star")
                            .font(.system(size: 11, weight: .semibold))
                        Text("STREAK PLAY")
                            .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                    }
                    .foregroundStyle(streakOn ? ember : .white.opacity(0.5))
                }
                .buttonStyle(.plain)
                Spacer()
                Button { place(entry) } label: {
                    Text(busy ? "Booking" : "Lock it in")
                        .font(GaryFonts.mono(11, bold: true))
                        .foregroundStyle(.black)
                        .padding(.horizontal, 14).padding(.vertical, 7)
                        .background(RoundedRectangle(cornerRadius: 6).fill(GaryColors.gold))
                }
                .buttonStyle(.plain)
                .disabled(busy)
            }
            if let e = errorText {
                Text(e)
                    .font(GaryFonts.mono(9.5))
                    .foregroundStyle(GaryColors.loss.opacity(0.9))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.white.opacity(0.045)))
    }

    private func sideChip(_ label: String, key: String, tint: Color) -> some View {
        Button { side = key } label: {
            Text(label)
                .font(GaryFonts.mono(10, bold: true)).tracking(0.8)
                .foregroundStyle(side == key ? tint : .white.opacity(0.5))
                .padding(.horizontal, 10).padding(.vertical, 7)
                .background(
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(side == key ? tint.opacity(0.12) : Color.white.opacity(0.05))
                        .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous)
                            .stroke(side == key ? tint.opacity(0.5) : Color.white.opacity(0.10), lineWidth: 1))
                )
        }
        .buttonStyle(.plain)
    }

    private func stepChip(_ symbol: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.white.opacity(0.85))
                .frame(width: 26, height: 26)
                .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(Color.white.opacity(0.07)))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // ── The outside-bet fallback (self-graded, YOUR PLAYS lane) ─────────────
    @ViewBuilder private var outsideBetBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showOutside.toggle() } } label: {
                HStack(spacing: 6) {
                    Text("OR LOG AN OUTSIDE BET")
                        .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                        .foregroundStyle(.white.opacity(0.55))
                    Image(systemName: showOutside ? "chevron.up" : "chevron.down")
                        .font(.system(size: 8, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.4))
                    Spacer()
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, 18)

            if showOutside {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 12) {
                        ForEach(leagues, id: \.self) { lg in
                            let isOn = draft.league == lg
                            Button { draft.league = lg } label: {
                                VStack(spacing: 3) {
                                    Text(lg)
                                        .font(GaryFonts.mono(9, bold: true)).tracking(0.6)
                                        .foregroundStyle(isOn ? GaryColors.gold : .white.opacity(0.5))
                                    Rectangle().fill(isOn ? GaryColors.gold : .clear).frame(height: 1.5)
                                }
                                .fixedSize()
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    TextField("What did you bet? (Yankees ML, Over 8.5, a parlay)", text: $draft.description, axis: .vertical)
                        .font(GaryFonts.text(13.5))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 11).padding(.vertical, 9)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.06)))
                    HStack(spacing: 10) {
                        TextField("Odds (-120, +145)", text: $oddsText)
                            .keyboardType(.numbersAndPunctuation)
                            .font(GaryFonts.mono(12.5))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 11).padding(.vertical, 9)
                            .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.06)))
                            .frame(width: 140)
                        stepChip("minus") { draft.stake = max(0.5, draft.stake - 0.5) }
                        Text(BookMoney.stake(draft.stake))
                            .font(GaryFonts.mono(12.5, bold: true))
                            .foregroundStyle(.white.opacity(0.9))
                            .frame(minWidth: 44)
                        stepChip("plus") { draft.stake = min(10, draft.stake + 0.5) }
                        Spacer()
                    }
                    HStack {
                        Button { draft.streakPick.toggle() } label: {
                            HStack(spacing: 5) {
                                Image(systemName: draft.streakPick ? "star.fill" : "star")
                                    .font(.system(size: 11, weight: .semibold))
                                Text("MY PLAY OF THE DAY")
                                    .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                            }
                            .foregroundStyle(draft.streakPick ? ember : .white.opacity(0.5))
                        }
                        .buttonStyle(.plain)
                        Spacer()
                        Button { saveManual() } label: {
                            Text(busy ? "Saving" : "Add to Your Plays")
                                .font(GaryFonts.mono(11, bold: true))
                                .foregroundStyle(.black)
                                .padding(.horizontal, 14).padding(.vertical, 7)
                                .background(RoundedRectangle(cornerRadius: 6).fill(GaryColors.gold))
                        }
                        .buttonStyle(.plain)
                        .disabled(busy || draft.description.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                    Text("Self-tracked entries stay in YOUR PLAYS — separate from your verified record with Gary.")
                        .font(GaryFonts.mono(8.5)).tracking(0.3)
                        .foregroundStyle(.white.opacity(0.35))
                        .fixedSize(horizontal: false, vertical: true)
                    if showOutside, let e = errorText {
                        Text(e)
                            .font(GaryFonts.mono(9.5))
                            .foregroundStyle(GaryColors.loss.opacity(0.9))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    // ── Data + booking ──────────────────────────────────────────────────────

    private func loadBoard() async {
        let today = SupabaseAPI.todayEST()
        async let gameLoad = try? SupabaseAPI.fetchDailyPicks(date: today)
        async let propLoad = try? SupabaseAPI.fetchPropPicks(date: today)
        let games = (await gameLoad) ?? []
        let props = (await propLoad) ?? []

        func etDate(_ iso: String?) -> String {
            guard let iso, let d = ISO8601DateFormatter().date(from: iso) else { return today }
            let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
            f.timeZone = TimeZone(identifier: "America/New_York")
            return f.string(from: d)
        }
        func etClock(_ iso: String?) -> String? {
            guard let iso, let d = ISO8601DateFormatter().date(from: iso) else { return nil }
            let f = DateFormatter(); f.dateFormat = "h:mm a"
            f.timeZone = TimeZone(identifier: "America/New_York")
            return f.string(from: d)
        }
        func isLocked(_ iso: String?) -> Bool {
            guard let iso, let d = ISO8601DateFormatter().date(from: iso) else { return false }
            return Date() >= d
        }

        var rows: [DirectoryEntry] = []
        for p in games {
            guard let text = p.pick, !text.isEmpty else { continue }
            var subBits = [(p.league ?? "").uppercased()]
            if let away = p.awayTeam, let home = p.homeTeam, !away.isEmpty, !home.isEmpty {
                subBits.append("\(away) @ \(home)")
            }
            if let c = etClock(p.commence_time) { subBits.append(c) }
            rows.append(DirectoryEntry(
                id: "game-\(p.game_id.map(String.init) ?? text)",
                title: text,
                subtitle: subBits.filter { !$0.isEmpty }.joined(separator: " · "),
                isProp: false,
                gameDate: etDate(p.commence_time),
                pickText: text,
                player: nil, propToken: nil,
                pickId: p.pick_id,
                locked: isLocked(p.commence_time)))
        }
        for p in props {
            guard let player = p.player, let propText = p.prop, !propText.isEmpty else { continue }
            let betWord = (p.bet ?? "over").uppercased()
            var subBits = [(p.league ?? p.sport ?? "").uppercased()]
            if let m = p.matchup { subBits.append(m) }
            if let c = etClock(p.commence_time) { subBits.append(c) }
            rows.append(DirectoryEntry(
                id: "prop-\(player)-\(propText)-\(p.game_id.map(String.init) ?? "")",
                title: "\(player) \(betWord) \(propText)",
                subtitle: subBits.filter { !$0.isEmpty }.joined(separator: " · "),
                isProp: true,
                gameDate: etDate(p.commence_time),
                pickText: propText,
                player: player,
                propToken: String(propText.split(separator: " ").first ?? "").lowercased(),
                pickId: nil,
                locked: isLocked(p.commence_time)))
        }
        // Open bets first, each lane in board order.
        let sorted = rows.sorted { a, b in
            a.locked == b.locked ? (a.isProp == b.isProp ? a.title < b.title : !a.isProp) : !a.locked
        }
        if !sorted.isEmpty || entries.isEmpty { entries = sorted }
        loadingBoard = false
    }

    private func place(_ entry: DirectoryEntry) {
        busy = true
        errorText = nil
        Task {
            defer { busy = false }
            do {
                var bet: UserBet
                if entry.isProp, let player = entry.player, let token = entry.propToken {
                    bet = try await UserBookAPI.placePropBet(
                        gameDate: entry.gameDate, player: player, propType: token,
                        kind: side, stake: stake)
                    // Props book through an RPC without a streak param — the
                    // star lands as its own claim right after.
                    if streakOn, await UserBookAPI.setStreakPick(id: bet.id, gameDate: bet.game_date, star: true) {
                        bet = UserBet(id: bet.id, kind: bet.kind, pick_type: bet.pick_type,
                            game_date: bet.game_date, league: bet.league, pick_text: bet.pick_text,
                            matchup: bet.matchup, player_name: bet.player_name, prop_type: bet.prop_type,
                            description: bet.description, odds_american: bet.odds_american,
                            odds_estimated: bet.odds_estimated, stake_units: bet.stake_units,
                            gary_confidence: bet.gary_confidence, streak_pick: true,
                            status: bet.status, units_net: bet.units_net, lock_at: bet.lock_at,
                            placed_at: bet.placed_at, graded_by: bet.graded_by)
                    }
                } else {
                    bet = try await UserBookAPI.placeBet(
                        gameDate: entry.gameDate, pickId: entry.pickId,
                        pickText: entry.pickText, kind: side, stake: stake, streak: streakOn)
                }
                onLogged(bet)
                dismiss()
            } catch { errorText = error.localizedDescription }
        }
    }

    private func saveManual() {
        draft.odds = Int(oddsText.replacingOccurrences(of: "+", with: ""))
        busy = true
        errorText = nil
        Task {
            defer { busy = false }
            do {
                let bet = try await UserBookAPI.logManual(draft)
                onLogged(bet)
                dismiss()
            } catch { errorText = error.localizedDescription }
        }
    }
}

// ── MY RIDE WITH GARY share card ────────────────────────────────────────────
// WITH GARY ledger only — every number on this card is system-graded and
// lock-verified. YOUR PLAYS never appears here; the share card IS the receipt.
struct RideShareCardView: View {
    let record: (w: Int, l: Int, p: Int, units: Double)
    let streakText: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("MY RIDE WITH GARY")
                .font(GaryFonts.mono(13, bold: true)).tracking(2)
                .foregroundStyle(GaryColors.gold)
            HStack(alignment: .firstTextBaseline, spacing: 14) {
                Text("\(record.w)-\(record.l)\(record.p > 0 ? "-\(record.p)" : "")")
                    .font(GaryFonts.text(56, .heavy))
                    .foregroundStyle(.white)
                Text(BookMoney.netTotal(record.units))
                    .font(GaryFonts.mono(24, bold: true))
                    .foregroundStyle(record.units >= 0 ? GaryColors.win : GaryColors.loss)
            }
            if let s = streakText {
                Text(s)
                    .font(GaryFonts.mono(13, bold: true)).tracking(1)
                    .foregroundStyle(.white.opacity(0.7))
            }
            Spacer(minLength: 0)
            HStack {
                Text("Locked before first pitch. Graded by machine.")
                    .font(GaryFonts.mono(10)).tracking(0.5)
                    .foregroundStyle(.white.opacity(0.45))
                Spacer()
                Text(AppFlags.storeSafe ? "GARY AI" : "betwithgary.ai")
                    .font(GaryFonts.mono(11, bold: true)).tracking(1)
                    .foregroundStyle(GaryColors.gold.opacity(0.9))
            }
        }
        .padding(28)
        .frame(width: 420, height: 420, alignment: .topLeading)
        .background(Color(hex: "#141212"))
    }
}

@MainActor
func renderRideShareImage(record: (w: Int, l: Int, p: Int, units: Double), streakText: String?) -> UIImage? {
    let renderer = ImageRenderer(content: RideShareCardView(record: record, streakText: streakText))
    renderer.scale = 3
    return renderer.uiImage
}

// (UserBookLeaderboard — the profile's duplicate units board — deleted
// Aug 20: ONE leaderboard, the classic streak-first board on the
// Billfold's BOARD scope. The profile links to it instead.)

/// Inline handle claim — same philosophy as the unit-size ask: do it right
/// here, save, land back where you were.
struct HandleClaimSheet: View {
    var onClaimed: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var busy = false
    @State private var errorText: String? = nil

    var body: some View {
        ZStack {
            Color(hex: "#1C1A1A").ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                Text("CLAIM YOUR HANDLE")
                    .font(GaryFonts.mono(12, bold: true)).tracking(1.2)
                    .foregroundStyle(GaryColors.gold)
                Text("This is the name the standings show. 3-18 characters, letters, numbers, underscores. Your record stays private until you claim one.")
                    .font(GaryFonts.text(13))
                    .foregroundStyle(.white.opacity(0.65))
                    .fixedSize(horizontal: false, vertical: true)
                TextField("Handle", text: $name)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(GaryFonts.mono(15, bold: true))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12).padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.06)))
                if let e = errorText {
                    Text(e)
                        .font(GaryFonts.mono(10))
                        .foregroundStyle(GaryColors.loss.opacity(0.9))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Button {
                    save()
                } label: {
                    Text(busy ? "Claiming" : "Enter the standings")
                        .font(GaryFonts.mono(12, bold: true)).tracking(0.5)
                        .foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(RoundedRectangle(cornerRadius: 8).fill(GaryColors.gold))
                }
                .buttonStyle(.plain)
                .disabled(busy || name.trimmingCharacters(in: .whitespaces).count < 3)
            }
            .padding(20)
        }
        .presentationDetents([.height(300)])
    }

    private func save() {
        busy = true
        errorText = nil
        Task {
            defer { busy = false }
            do {
                let claimed = try await UserBookAPI.claimHandle(name.trimmingCharacters(in: .whitespaces))
                // Header avatar + profile read this cache — keep it warm from
                // every claim path.
                UserDefaults.standard.set(claimed, forKey: "myHandle")
                onClaimed(claimed)
                dismiss()
            } catch {
                errorText = error.localizedDescription
            }
        }
    }
}

// MARK: - Profile (Aug 7 2026 — the front door to the user's whole book)
//
// The Jul 26 mega-build shipped the machinery (tail/fade ledger, manual
// logging, streaks, leaderboard, handle claim) but left it buried behind
// Billfold's YOU toggle with no identity anywhere in the chrome. This is
// the missing front door: every page header's corner opens it, and it
// assembles the existing pieces — nothing here re-implements the book.

/// The header-corner entry: an avatar chip when a handle is claimed, the
/// person glyph otherwise. Posts ShowProfile; ContentView presents globally.
struct ProfileHeaderChip: View {
    @AppStorage("myHandle") private var myHandle = ""
    var body: some View {
        Button {
            NotificationCenter.default.post(name: Notification.Name("ShowProfile"), object: nil)
        } label: {
            if let first = myHandle.first {
                ZStack {
                    Circle().fill(Color.white.opacity(0.08))
                    Circle().stroke(GaryColors.gold.opacity(0.45), lineWidth: 1)
                    Text(String(first).uppercased())
                        .font(GaryFonts.mono(12, bold: true))
                        .foregroundStyle(GaryColors.gold)
                }
                .frame(width: 26, height: 26)
            } else {
                Image(systemName: "person.crop.circle")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(.white.opacity(0.62))
                    .frame(width: 26, height: 26)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Your profile")
    }
}

struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("myHandle") private var myHandle = ""
    @AppStorage("selectedTab") private var selectedTab = 0
    @AppStorage("billfoldScope") private var billfoldScope = "gary"
    @State private var bets: [UserBet] = []
    @State private var streak: UserBookAPI.UserStreak? = nil
    @State private var loading = true
    @State private var showClaim = false
    @State private var showQuickLog = false
    @State private var showAuth = false
    @State private var signedIn = AuthManager.shared.bearerToken != nil

    private var withGary: [UserBet] { bets.filter { $0.isVerified } }
    private var yourPlays: [UserBet] { bets.filter { $0.kind == "manual" } }
    private var openSlips: [UserBet] { bets.filter { $0.isPending } }

    private func record(_ rows: [UserBet]) -> (w: Int, l: Int, p: Int, units: Double) {
        var w = 0, l = 0, p = 0; var u = 0.0
        for b in rows where !b.isPending {
            switch b.status {
            case "won": w += 1
            case "lost": l += 1
            case "push": p += 1
            default: break
            }
            u += b.units_net ?? 0
        }
        return (w, l, p, u)
    }

    var body: some View {
        ZStack {
            Color(hex: "#0F0D0C").ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    identityRow
                    if !signedIn {
                        signedOutPitch
                    } else if loading {
                        ProgressView().tint(GaryColors.gold).frame(maxWidth: .infinity).padding(.top, 30)
                    } else {
                        // The profile is the person: identity, their streak,
                        // their record, their open action — the standings
                        // live ONCE, on the Billfold's BOARD scope (founder,
                        // Aug 20: "we don't need two leaderboards").
                        streakCard
                        recordPanel
                        actionRow
                        boardDoor
                        if !openSlips.isEmpty { openSlipsBlock }
                        signOutRow
                    }
                }
                .padding(18)
                .padding(.bottom, 40)
            }
        }
        .task { await load() }
        .sheet(isPresented: $showClaim) {
            HandleClaimSheet { myHandle = $0 }
        }
        .sheet(isPresented: $showQuickLog) {
            QuickLogSheet { bets.insert($0, at: 0) }
        }
        .sheet(isPresented: $showAuth, onDismiss: {
            signedIn = AuthManager.shared.bearerToken != nil
            Task { await load() }
        }) { AuthView() }
    }

    // ── Identity: avatar + handle + the gear (settings lives IN the profile
    // now — the header corner belongs to the person, like everywhere else).
    private var identityRow: some View {
        HStack(spacing: 14) {
            Button { if signedIn { showClaim = true } } label: {
                ZStack {
                    Circle().fill(Color.white.opacity(0.07))
                    Circle().stroke(GaryColors.gold.opacity(0.5), lineWidth: 1.2)
                    if let first = myHandle.first {
                        Text(String(first).uppercased())
                            .font(GaryFonts.display(24))
                            .foregroundStyle(GaryColors.gold)
                    } else {
                        Image(systemName: "person.fill")
                            .font(.system(size: 20, weight: .medium))
                            .foregroundStyle(.white.opacity(0.45))
                    }
                }
                .frame(width: 54, height: 54)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 3) {
                if myHandle.isEmpty {
                    Button { if signedIn { showClaim = true } else { showAuth = true } } label: {
                        Text(signedIn ? "CLAIM YOUR HANDLE" : "YOUR BOOK")
                            .font(GaryFonts.mono(13, bold: true)).tracking(1.4)
                            .foregroundStyle(GaryColors.gold)
                    }
                    .buttonStyle(.plain)
                } else {
                    Button { showClaim = true } label: {
                        Text(myHandle)
                            .font(GaryFonts.display(24))
                            .foregroundStyle(GaryColors.warmWhite)
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                    .buttonStyle(.plain)
                }
                Text(signedIn ? "YOUR BOOK · GRADED BY THE MACHINE" : "SIGN IN TO START YOUR BOOK")
                    .font(GaryFonts.mono(8.5, bold: true)).tracking(1.2)
                    .foregroundStyle(.white.opacity(0.45))
            }
            Spacer(minLength: 8)

            Button {
                dismiss()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                    NotificationCenter.default.post(name: Notification.Name("ShowSettingsMenu"), object: nil)
                }
            } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.62))
                    .frame(width: 30, height: 30)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Settings")
        }
    }

    private var signedOutPitch: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Sign in and every pick you tail or fade goes on your own record — locked before first pitch, graded by the same system that grades Gary. Log your outside bets beside it and claim a handle for the standings.")
                .font(GaryFonts.text(14))
                .foregroundStyle(.white.opacity(0.7))
                .fixedSize(horizontal: false, vertical: true)
            Button { showAuth = true } label: {
                Text("Sign in")
                    .font(GaryFonts.mono(12, bold: true)).tracking(1)
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(GaryColors.gold))
            }
            .buttonStyle(.plain)
        }
        .padding(.top, 6)
    }

    // ── THE STREAK — the profile's crown, in the board's own streak grammar
    // (founder, Aug 20: the streak card reads like mock 03 in both places).
    private var streakCard: some View {
        let ember = Color(hex: "#E5844B")
        let current = streak?.current ?? 0
        let todayPlay = bets.first { $0.streak_pick == true && $0.isPending }
        return HStack(alignment: .center, spacing: 14) {
            VStack(spacing: 1) {
                Text(current > 0 ? "W\(current)" : "0")
                    .font(GaryFonts.mono(30, bold: true))
                    .foregroundStyle(current > 0 ? ember : .white.opacity(0.4))
                Text("BEST \(streak?.best ?? 0)")
                    .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
                    .foregroundStyle(.white.opacity(0.45))
            }
            .frame(width: 78)
            Rectangle().fill(Color.white.opacity(0.08)).frame(width: 1)
                .padding(.vertical, 2)
            VStack(alignment: .leading, spacing: 3) {
                Text("THE STREAK")
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(1.1)
                    .foregroundStyle(ember)
                Text(todayPlay.map { "Tonight's play is set: \($0.pick_text)" }
                     ?? (current > 0
                         ? "One play a day keeps it alive. Star tonight's from any card."
                         : "One play a day. Win and it grows, lose and it resets. Star any bet as your streak play."))
                    .font(GaryFonts.text(12.5))
                    .foregroundStyle(.white.opacity(0.6))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(ember.opacity(0.06))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(ember.opacity(current > 0 ? 0.35 : 0.15), lineWidth: 1))
        )
    }

    /// The one leaderboard's front door — the Billfold BOARD scope.
    private var boardDoor: some View {
        Button {
            dismiss()
            billfoldScope = "board"
            selectedTab = 4
        } label: {
            HStack(spacing: 8) {
                Text("THE BOARD")
                    .font(GaryFonts.mono(11, bold: true)).tracking(1.2)
                    .foregroundStyle(GaryColors.gold)
                Text("STANDINGS · STREAKS · GARY RIDES TOO")
                    .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
                    .foregroundStyle(.white.opacity(0.45))
                    .lineLimit(1).minimumScaleFactor(0.7)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.5))
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.white.opacity(0.03))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.white.opacity(0.07), lineWidth: 1))
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // ── The record: verified WITH GARY line first, self-tracked under it,
    // the streak beside — the numbers the Billfold YOU page shows, compressed.
    private var recordPanel: some View {
        let g = record(withGary)
        let m = record(yourPlays)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("WITH GARY")
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(1.2)
                    .foregroundStyle(GaryColors.gold)
                Spacer()
                Text("\(g.w)\u{2013}\(g.l)\(g.p > 0 ? "\u{2013}\(g.p)" : "")")
                    .font(GaryFonts.mono(16, bold: true))
                    .foregroundStyle(GaryColors.warmWhite)
                Text(BookMoney.netTotal(g.units))
                    .font(GaryFonts.mono(13, bold: true))
                    .foregroundStyle(g.units >= 0 ? GaryColors.win : GaryColors.loss)
            }
            if m.w + m.l + m.p > 0 {
                HStack(alignment: .firstTextBaseline) {
                    Text("YOUR PLAYS")
                        .font(GaryFonts.mono(9.5, bold: true)).tracking(1.2)
                        .foregroundStyle(.white.opacity(0.5))
                    Text("self-tracked")
                        .font(GaryFonts.mono(8.5)).foregroundStyle(.white.opacity(0.35))
                    Spacer()
                    Text("\(m.w)\u{2013}\(m.l)\(m.p > 0 ? "\u{2013}\(m.p)" : "")")
                        .font(GaryFonts.mono(14, bold: true))
                        .foregroundStyle(.white.opacity(0.8))
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.03))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.white.opacity(0.07), lineWidth: 1))
        )
    }

    private var actionRow: some View {
        HStack(spacing: 10) {
            Button { showQuickLog = true } label: {
                Text("+ LOG A BET")
                    .font(GaryFonts.mono(11, bold: true)).tracking(1.2)
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(GaryColors.gold))
            }
            .buttonStyle(.plain)
            Button {
                dismiss()
                billfoldScope = "you"
                selectedTab = 4
            } label: {
                Text("FULL BOOK \u{203A}")
                    .font(GaryFonts.mono(11, bold: true)).tracking(1.2)
                    .foregroundStyle(.white.opacity(0.85))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .fill(Color.white.opacity(0.07))
                            .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous)
                                .stroke(Color.white.opacity(0.10), lineWidth: 1))
                    )
            }
            .buttonStyle(.plain)
        }
    }

    private var openSlipsBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("OPEN SLIPS")
                .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                .foregroundStyle(.white.opacity(0.5))
            ForEach(openSlips.prefix(4)) { bet in
                UserBetSlipRow(bet: bet,
                               onUpdate: { updated in
                                   if let i = bets.firstIndex(where: { $0.id == updated.id }) { bets[i] = updated }
                               },
                               onDelete: {
                                   bets.removeAll { $0.id == bet.id }
                               })
            }
        }
    }

    private var signOutRow: some View {
        Button {
            AuthManager.shared.signOut()
            myHandle = ""
            signedIn = false
            bets = []
        } label: {
            Text("Sign out")
                .font(GaryFonts.mono(10, bold: true)).tracking(1)
                .foregroundStyle(.white.opacity(0.4))
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    private func load() async {
        signedIn = AuthManager.shared.bearerToken != nil
        guard signedIn else { loading = false; return }
        loading = bets.isEmpty
        // Handle first — the identity row and header chip hang off it.
        if let h = await UserBookAPI.fetchMyHandle() { myHandle = h }
        let all = await UserBookAPI.fetchMyBets()
        if !all.isEmpty { bets = all }
        streak = await UserBookAPI.fetchMyStreak()
        loading = false
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// THE BOOK (Aug 20 2026, founder build order; folded INTO the Billfold the
// same day — "a tab in the Billfold page, not its own page in the nav bar")
//
// The bettor's own surface, living as Billfold header scopes: YOU (the
// betslip: split book, open slips with live context, the settled ledger,
// quick-log — UserBookSection expanded) and BOARD (ClassicLeaderboardView:
// podium + classic table, name · record · win% · the streak they're riding).
// The board reads your_book_leaderboard_v2: streaks are computed from
// DESIGNATED plays (streak_pick — the "star the bet that counts" mechanic),
// falling back to a player's full verified run until they star one.
// Verified-ledger-only ranking carries over: self-graded manual bets show
// in YOUR tracker, never on the public board.
// ═════════════════════════════════════════════════════════════════════════════

extension UserBookAPI {
    struct BoardRowV2: Codable, Identifiable {
        let display_name: String
        let wins: Int
        let losses: Int
        let pushes: Int
        let units: Double
        let win_pct: Double
        let streak_len: Int
        let streak_kind: String   // "W" | "L" | ""
        let best_streak: Int
        var id: String { display_name }

        var decided: Int { wins + losses }
        var record: String { "\(wins)-\(losses)" }
        var streakLabel: String { streak_len > 0 && !streak_kind.isEmpty ? "\(streak_kind)\(streak_len)" : "—" }
        /// Signed streak for ranking: win runs positive, loss runs negative.
        var signedStreak: Int { streak_kind == "L" ? -streak_len : streak_len }
    }

    /// Classic standings (aggregate-only RPC; anon-readable) + the Gary
    /// comparator row. Unsorted — the board view owns sort order.
    static func fetchLeaderboardV2(window: String) async -> [BoardRowV2] {
        async let garyRow = fetchGaryBoardRowV2(window: window)
        guard let url = URL(string: "\(Secrets.supabaseURL.absoluteString)/rest/v1/rpc/your_book_leaderboard_v2") else { return [] }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(Secrets.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["p_window": window])
        var users: [BoardRowV2] = []
        if let (data, resp) = try? await URLSession.shared.data(for: req),
           (resp as? HTTPURLResponse)?.statusCode == 200 {
            users = (try? JSONDecoder().decode([BoardRowV2].self, from: data)) ?? []
        }
        guard let gary = await garyRow else { return users }
        return users.filter { $0.display_name.caseInsensitiveCompare(gary.display_name) != .orderedSame } + [gary]
    }

    /// Gary's comparator row for the classic board — same official-ledger
    /// math as fetchGaryLeaderboardRow (v1, still serving the profile board)
    /// plus the CURRENT run the classic board ranks by. Every official pick
    /// is a designated play for Gary — he stars everything he posts.
    private static func fetchGaryBoardRowV2(window: String) async -> BoardRowV2? {
        func officialUnits(result: String, odds: String?) -> Double {
            switch result {
            case "lost": return -1
            case "push": return 0
            case "won":
                let price = Double((odds ?? "-110").replacingOccurrences(of: "+", with: "")) ?? -110
                return price > 0 ? price / 100 : 100 / abs(price)
            default: return 0
            }
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/New_York") ?? calendar.timeZone
        let days = window.lowercased() == "7d" ? -7 : (window.lowercased() == "30d" ? -30 : nil)
        let since: String
        if let days, let date = calendar.date(byAdding: .day, value: days, to: Date()) {
            let f = DateFormatter(); f.calendar = calendar; f.timeZone = calendar.timeZone; f.dateFormat = "yyyy-MM-dd"
            since = f.string(from: date)
        } else {
            since = "2026-03-01"
        }

        async let gameLoad = try? SupabaseAPI.fetchAllGameResults(since: since)
        async let propLoad = try? SupabaseAPI.fetchPropResults(since: since)
        let games = await gameLoad ?? []
        let props = (await propLoad ?? []).filter { !$0.isHRResult }

        struct Settled { let date: String; let result: String; let units: Double }
        var settled: [Settled] = []
        for g in games {
            guard let result = g.result?.lowercased(), ["won", "lost", "push"].contains(result) else { continue }
            settled.append(Settled(date: g.game_date ?? "", result: result,
                                   units: officialUnits(result: result, odds: g.effectiveOdds)))
        }
        for p in props {
            guard let result = p.result?.lowercased(), ["won", "lost", "push"].contains(result) else { continue }
            settled.append(Settled(date: p.game_date ?? "", result: result,
                                   units: officialUnits(result: result, odds: p.odds?.value)))
        }
        guard !settled.isEmpty else { return nil }

        let wins = settled.filter { $0.result == "won" }.count
        let losses = settled.filter { $0.result == "lost" }.count
        let pushes = settled.filter { $0.result == "push" }.count
        var running = 0, best = 0
        for row in settled.sorted(by: { $0.date < $1.date }) {
            if row.result == "won" { running += 1; best = max(best, running) }
            else if row.result == "lost" { running = 0 }
        }
        // Current run: newest backward, pushes skipped, first flip ends it.
        var curLen = 0; var curKind = ""
        for row in settled.sorted(by: { $0.date > $1.date }) {
            if row.result == "push" { continue }
            let kind = row.result == "won" ? "W" : "L"
            if curKind.isEmpty { curKind = kind; curLen = 1 }
            else if curKind == kind { curLen += 1 }
            else { break }
        }
        let decided = wins + losses
        let pct = decided > 0 ? (Double(wins) / Double(decided) * 1000).rounded() / 10 : 0
        return BoardRowV2(display_name: "GARY A.I.", wins: wins, losses: losses,
                          pushes: pushes, units: settled.reduce(0) { $0 + $1.units },
                          win_pct: pct, streak_len: curLen, streak_kind: curKind,
                          best_streak: best)
    }
}

// ── The classic board ───────────────────────────────────────────────────────
// Names, records, and the streak they're riding. STREAKS is the default
// lens — the whole game is who can run one up. Gary rides the same board
// as an official comparator row, never a fake account.

struct ClassicLeaderboardView: View {
    @AppStorage("bookBoardSort") private var sort = "streak"      // streak | wins | losses | record
    @AppStorage("bookBoardWindow") private var window = "season"  // season | 30d | 7d
    @AppStorage("myHandle") private var myHandle = ""
    @State private var rows: [UserBookAPI.BoardRowV2] = []
    @State private var loading = true
    @State private var showClaim = false
    @State private var showAuth = false
    @State private var signedIn = false
    @State private var showsPreviewCast = false

    /// Pre-launch stand-ins (founder, Aug 20: "fake users until we actually
    /// launch so I can see an actual leaderboard"). They fill the board only
    /// while fewer than eight real players rank, are labeled under the table,
    /// and retire with one flag flip — never presented as real records after
    /// launch. Kill switch: AppFlags.bookPreviewCast.
    private static let previewCast: [UserBookAPI.BoardRowV2] = [
        .init(display_name: "BigSarge", wins: 24, losses: 11, pushes: 1, units: 9.6, win_pct: 68.6, streak_len: 7, streak_kind: "W", best_streak: 9),
        .init(display_name: "MToro22", wins: 31, losses: 22, pushes: 2, units: 6.2, win_pct: 58.5, streak_len: 5, streak_kind: "W", best_streak: 6),
        .init(display_name: "TheLedger", wins: 9, losses: 6, pushes: 0, units: 2.1, win_pct: 60.0, streak_len: 3, streak_kind: "W", best_streak: 3),
        .init(display_name: "NightcapNina", wins: 22, losses: 14, pushes: 1, units: 5.4, win_pct: 61.1, streak_len: 2, streak_kind: "W", best_streak: 5),
        .init(display_name: "DogHouseDan", wins: 18, losses: 21, pushes: 0, units: -2.3, win_pct: 46.2, streak_len: 1, streak_kind: "W", best_streak: 4),
        .init(display_name: "SweatEquity", wins: 15, losses: 12, pushes: 1, units: 1.8, win_pct: 55.6, streak_len: 1, streak_kind: "L", best_streak: 4),
        .init(display_name: "FadeTheBear", wins: 21, losses: 25, pushes: 2, units: -3.9, win_pct: 45.7, streak_len: 2, streak_kind: "L", best_streak: 3),
        .init(display_name: "ParlayPat", wins: 18, losses: 15, pushes: 0, units: 0.9, win_pct: 54.5, streak_len: 3, streak_kind: "L", best_streak: 5),
        .init(display_name: "ColdBrewKev", wins: 12, losses: 19, pushes: 1, units: -5.2, win_pct: 38.7, streak_len: 6, streak_kind: "L", best_streak: 2),
    ]

    private var sorted: [UserBookAPI.BoardRowV2] {
        switch sort {
        case "wins":
            return rows.sorted { $0.wins == $1.wins ? $0.win_pct > $1.win_pct : $0.wins > $1.wins }
        case "losses":
            return rows.sorted { $0.losses == $1.losses ? $0.win_pct < $1.win_pct : $0.losses > $1.losses }
        case "record":
            return rows.sorted { $0.win_pct == $1.win_pct ? $0.decided > $1.decided : $0.win_pct > $1.win_pct }
        default:
            return rows.sorted {
                $0.signedStreak == $1.signedStreak ? $0.wins > $1.wins : $0.signedStreak > $1.signedStreak
            }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            controls
            if loading && rows.isEmpty {
                ProgressView().tint(GaryColors.gold)
                    .frame(maxWidth: .infinity).padding(.vertical, 40)
            } else if rows.isEmpty {
                emptyState
            } else {
                // Founder pick Aug 20 (mock 03): the top three get the podium
                // stage; the table picks up at fourth.
                if sorted.count >= 3 { podium }
                boardCard
                if showsPreviewCast {
                    Text("SAMPLE PLAYERS HOLD THE BOARD UNTIL LAUNCH — REAL RECORDS REPLACE THEM AS RIDERS SETTLE")
                        .font(GaryFonts.mono(8, bold: true)).tracking(0.7)
                        .foregroundStyle(.white.opacity(0.3))
                        .frame(maxWidth: .infinity, alignment: .center)
                        .multilineTextAlignment(.center)
                }
            }
            joinLine
        }
        .pageGutter()
        .task { await load() }
        .onChange(of: window) { _ in Task { await load(force: true) } }
        .sheet(isPresented: $showClaim) { HandleClaimSheet { myHandle = $0 } }
        .sheet(isPresented: $showAuth) { AuthView() }
    }

    // MARK: - Controls (sort lenses + window)

    private var controls: some View {
        HStack(alignment: .bottom) {
            HStack(spacing: 14) {
                sortTab("STREAKS", key: "streak")
                sortTab("WINS", key: "wins")
                sortTab("LOSSES", key: "losses")
                sortTab("RECORD", key: "record")
            }
            Spacer()
            Menu {
                Button("Season") { window = "season" }
                Button("Last 30 days") { window = "30d" }
                Button("Last 7 days") { window = "7d" }
            } label: {
                HStack(spacing: 4) {
                    Text(window == "season" ? "SEASON" : window.uppercased())
                        .font(GaryFonts.mono(10)).tracking(0.8)
                    Image(systemName: "chevron.down").font(.system(size: 8, weight: .semibold))
                }
                .foregroundStyle(.white.opacity(0.55))
            }
        }
    }

    private func sortTab(_ label: String, key: String) -> some View {
        let isOn = sort == key
        return Button { sort = key } label: {
            VStack(spacing: 3) {
                Text(label)
                    .font(GaryFonts.mono(10, bold: true)).tracking(1)
                    .foregroundStyle(isOn ? GaryColors.gold : .white.opacity(0.5))
                Rectangle().fill(isOn ? GaryColors.gold : .clear).frame(height: 1.5)
            }
            .fixedSize()
        }
        .buttonStyle(.plain)
    }

    // MARK: - The podium (founder pick, mock 03 — built to the mock's exact
    // metrics: 1fr / 1.25fr / 1fr columns bottom-aligned, 12px side padding
    // vs 18px on first, place kicker 15 on every tile, streak numeral 22 on
    // first / 15 on the sides, 2-3-5 stack gaps).

    private func podiumTile(_ place: String, _ row: UserBookAPI.BoardRowV2, first: Bool) -> some View {
        let isGary = row.display_name == "GARY A.I."
        return VStack(spacing: 0) {
            Text(place)
                .font(GaryFonts.display(15)).tracking(0.8)
                .foregroundStyle(GaryColors.gold)
            Text(row.display_name)
                .font(GaryFonts.text(12, .bold))
                .foregroundStyle(isGary ? GaryColors.gold : .white.opacity(0.92))
                .lineLimit(1).minimumScaleFactor(0.7)
                .padding(.top, 2)
            Text("\(row.record) · \(String(format: "%.1f", row.win_pct))%")
                .font(GaryFonts.mono(10.5))
                .foregroundStyle(.white.opacity(0.6))
                .padding(.top, 3)
            Text(row.streakLabel)
                .font(GaryFonts.mono(first ? 22 : 15, bold: true))
                .foregroundStyle(streakColor(row))
                .padding(.top, 5)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, first ? 18 : 12)
        .padding(.horizontal, 6)
        .background(
            // The podium FLOATS (founder, Aug 20: "prop up the design of the
            // leaderboard significantly") — the same lit-rim + shadow-puddle
            // float the Home board wears, first place catching the most light
            // and a whisper of gold wash inside its stroke.
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(GaryColors.cardBg)
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(first ? GaryColors.gold.opacity(0.045) : Color.clear)
                )
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(LinearGradient(stops: [
                        .init(color: first ? GaryColors.gold.opacity(0.55) : GaryColors.warmWhite.opacity(0.18), location: 0),
                        .init(color: first ? GaryColors.gold.opacity(0.30) : GaryColors.warmWhite.opacity(0.07), location: 0.4),
                        .init(color: first ? GaryColors.gold.opacity(0.18) : GaryColors.warmWhite.opacity(0.03), location: 1),
                    ], startPoint: .top, endPoint: .bottom), lineWidth: 1))
                .shadow(color: .black.opacity(first ? 0.5 : 0.4), radius: first ? 14 : 10, y: first ? 8 : 6)
                .shadow(color: .black.opacity(0.55), radius: 3, y: 2)
        )
    }

    private var podium: some View {
        let top = Array(sorted.prefix(3))
        return GeometryReader { geo in
            let gap: CGFloat = 8
            let side = (geo.size.width - gap * 2) / 3.25
            HStack(alignment: .bottom, spacing: gap) {
                if top.count > 1 { podiumTile("2ND", top[1], first: false).frame(width: side) }
                podiumTile("1ST", top[0], first: true).frame(width: side * 1.25)
                if top.count > 2 { podiumTile("3RD", top[2], first: false).frame(width: side) }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        }
        .frame(height: 126)
    }

    // MARK: - The board card

    private var boardCard: some View {
        // Ranks 1-3 live on the podium; the table carries the field.
        let field = sorted.count >= 3 ? Array(sorted.enumerated().dropFirst(3)) : Array(sorted.enumerated())
        return VStack(spacing: 0) {
            columnHeader
            ForEach(field, id: \.element.id) { index, row in
                // Mock grammar: full-width hairline between rows, no inset.
                Rectangle().fill(Color.white.opacity(0.05)).frame(height: 0.5)
                boardRow(rank: index + 1, row: row)
            }
        }
        .background(
            // The table floats with the podium — lit rim, shadow puddle.
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(GaryColors.cardBg)
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(LinearGradient(stops: [
                        .init(color: GaryColors.warmWhite.opacity(0.16), location: 0),
                        .init(color: GaryColors.warmWhite.opacity(0.06), location: 0.35),
                        .init(color: GaryColors.warmWhite.opacity(0.025), location: 1),
                    ], startPoint: .top, endPoint: .bottom), lineWidth: 1))
                .shadow(color: .black.opacity(0.45), radius: 14, y: 8)
                .shadow(color: .black.opacity(0.55), radius: 3, y: 2)
        )
    }

    private var columnHeader: some View {
        HStack(spacing: 10) {
            Text("#").frame(width: 22, alignment: .leading)
            Text("PLAYER").frame(maxWidth: .infinity, alignment: .leading)
            Text("W-L").frame(width: 52, alignment: .trailing)
            Text("WIN%").frame(width: 44, alignment: .trailing)
            Text("STRK").frame(width: 36, alignment: .trailing)
        }
        .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
        .foregroundStyle(.white.opacity(0.35))
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func boardRow(rank: Int, row: UserBookAPI.BoardRowV2) -> some View {
        let isGary = row.display_name == "GARY A.I."
        let isMe = !myHandle.isEmpty && row.display_name.caseInsensitiveCompare(myHandle) == .orderedSame
        return HStack(spacing: 10) {
            Text("\(rank)")
                .font(GaryFonts.mono(12, bold: rank <= 3))
                .foregroundStyle(rank <= 3 ? GaryColors.gold : .white.opacity(0.45))
                .frame(width: 22, alignment: .leading)

            HStack(spacing: 6) {
                if isGary {
                    Image(GaryBrand.mark)
                        .resizable().scaledToFit()
                        .frame(width: 16, height: 16)
                        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                }
                Text(row.display_name)
                    .font(GaryFonts.text(14, .semibold))
                    .foregroundStyle(isGary ? GaryColors.gold : .white.opacity(0.92))
                    .lineLimit(1).minimumScaleFactor(0.75)
                if isMe {
                    Text("YOU")
                        .font(GaryFonts.mono(8, bold: true)).tracking(0.8)
                        .foregroundStyle(.black.opacity(0.85))
                        .padding(.horizontal, 5).padding(.vertical, 2)
                        .background(Capsule().fill(GaryColors.gold))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            // Scale-never-truncate on the number columns: Gary's 209-176 is
            // wider than any player record the width was drawn for.
            Text(row.record)
                .font(GaryFonts.mono(12))
                .foregroundStyle(.white.opacity(0.85))
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(width: 52, alignment: .trailing)

            Text(String(format: "%.1f", row.win_pct))
                .font(GaryFonts.mono(12))
                .foregroundStyle(.white.opacity(0.6))
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(width: 44, alignment: .trailing)

            Text(row.streakLabel)
                .font(GaryFonts.mono(12, bold: row.streak_len >= 3))
                .foregroundStyle(streakColor(row))
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(width: 36, alignment: .trailing)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .background(isMe ? GaryColors.gold.opacity(0.05) : .clear)
    }

    private func streakColor(_ row: UserBookAPI.BoardRowV2) -> Color {
        guard row.streak_len > 0 else { return .white.opacity(0.35) }
        return row.streak_kind == "W" ? GaryColors.gold : Color(hex: "#C96A55")
    }

    // MARK: - Empty + join states

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "trophy")
                .font(.system(size: 26, weight: .medium))
                .foregroundStyle(GaryColors.gold.opacity(0.7))
            Text("The board is waiting")
                .font(GaryFonts.text(15, .semibold))
                .foregroundStyle(.white.opacity(0.9))
            Text("Ride or fade five of Gary's picks and claim a handle — your record and your streak go up for everyone to chase.")
                .font(GaryFonts.text(13))
                .foregroundStyle(.white.opacity(0.55))
                .multilineTextAlignment(.center)
                .lineSpacing(3)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .padding(.horizontal, 18)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(GaryColors.cardBg)
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1))
        )
    }

    @ViewBuilder private var joinLine: some View {
        if !signedIn {
            Button { showAuth = true } label: {
                joinLabel("SIGN IN TO GET ON THE BOARD")
            }
            .buttonStyle(.plain)
        } else if myHandle.isEmpty {
            Button { showClaim = true } label: {
                joinLabel("CLAIM YOUR HANDLE")
            }
            .buttonStyle(.plain)
        }
    }

    private func joinLabel(_ text: String) -> some View {
        Text(text)
            .font(GaryFonts.mono(12, bold: true)).tracking(1)
            .foregroundStyle(.black.opacity(0.85))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Capsule().fill(GaryColors.gold))
    }

    private func load(force: Bool = false) async {
        signedIn = AuthManager.shared.bearerToken != nil
        if force { rows = [] }
        loading = rows.isEmpty
        var fresh = await UserBookAPI.fetchLeaderboardV2(window: window)
        // Pre-launch: sample players fill in beneath any real ones (and
        // Gary) until eight real records rank, then retire on their own.
        let realPlayers = fresh.filter { $0.display_name != "GARY A.I." }
        if AppFlags.bookPreviewCast, realPlayers.count < 8 {
            let taken = Set(fresh.map { $0.display_name.lowercased() })
            fresh += Self.previewCast.filter { !taken.contains($0.display_name.lowercased()) }
            showsPreviewCast = true
        } else {
            showsPreviewCast = false
        }
        // Day-cache law: never store an empty async result over live rows.
        if !fresh.isEmpty { rows = fresh }
        loading = false
    }
}
