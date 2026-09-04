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

    /// Public standings contain only actual, verified player records.
    static let bookPreviewCast = false
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
    var is_favorite: Bool? = nil
    var notes: String? = nil
    var bookmaker: String? = nil
    var source_game_id: String? = nil
    var source_pick_id: String? = nil
    var source_line: Double? = nil
    var source_side: String? = nil

    var isVerified: Bool { kind == "tail" || kind == "fade" }
    var isPending: Bool { status == "pending" }
    var canChangeStreak: Bool {
        guard isVerified, isPending, let lock_at else { return false }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let precise = f.date(from: lock_at)
        f.formatOptions = [.withInternetDateTime]
        return (precise ?? f.date(from: lock_at)).map { $0 > Date() } ?? false
    }
}

extension Notification.Name {
    static let userBookChanged = Notification.Name("UserBookChanged")
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
    @State private var saving = false
    @State private var errorText: String?
    private let quick: [Double] = [10, 25, 50, 100]

    var body: some View {
        ZStack {
            Color(hex: "#1C1A1A").ignoresSafeArea()
            unitForm
        }
        .presentationDetents([.medium])
        .onAppear { if BookMoney.isSet { amountText = String(format: "%.2f", BookMoney.unitDollars) } }
    }

    private var unitForm: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("WHAT'S A UNIT WORTH TO YOU?")
                .font(GaryFonts.mono(12, bold: true)).tracking(1.2)
                .foregroundStyle(GaryColors.gold)
            Text("Your book records bets in units and converts them using this amount. Changing it updates dollar displays across your history. Until you set one, we use a hypothetical $100 per unit.")
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
                guard let value = Double(amountText), value.isFinite, value > 0, value <= 100000 else {
                    if amountText.isEmpty { dismiss() } else { errorText = "Enter an amount between $0.01 and $100,000." }
                    return
                }
                saving = true; errorText = nil
                Task {
                    defer { saving = false }
                    do {
                        let current = try await ProfileIdentityAPI.mine()
                        let saved = try await ProfileIdentityAPI.save(handle: current.profile?.name ?? "",
                            avatar: current.profile?.avatar ?? "initials", bio: current.profile?.bio ?? "",
                            visible: current.profile?.isPublic ?? false, sports: current.preferences?.favorite_sports ?? [], unitValue: value)
                        ProfileIdentityAPI.cache(saved)
                        userUnitDollars = value
                        NotificationCenter.default.post(name: .userBookChanged, object: nil)
                        dismiss()
                    } catch { errorText = error.localizedDescription }
                }
            } label: {
                Text(Double(amountText).map { $0 > 0 } == true ? "Save" : "Keep $100 for now")
                    .font(GaryFonts.mono(12, bold: true)).tracking(0.5)
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .background(RoundedRectangle(cornerRadius: 8).fill(GaryColors.gold))
            }
            .buttonStyle(.plain).disabled(saving)
            if let errorText { Text(errorText).font(GaryFonts.text(12)).foregroundStyle(GaryColors.loss) }
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

    @MainActor private static func run(_ req: URLRequest) async throws -> Data {
        let owner = AuthManager.shared.currentUser?.id
        guard owner != nil else { throw UserBookError.notSignedIn }
        try Task.checkCancellation()
        var (data, response) = try await URLSession.shared.data(for: req)
        var statusCode = (response as? HTTPURLResponse)?.statusCode
        guard owner == AuthManager.shared.currentUser?.id else { throw CancellationError() }

        // 401 → RENEW ONCE, then retry (Aug 21 2026): a book view whose task
        // fires while the launch-time session refresh is still in flight sent
        // the stale token, took a 401, and the page rendered it as "no
        // entries" — telling the user their record had vanished. A refused
        // renewal signs them out honestly; a transient one falls through to
        // the throw below, which the callers now surface as unavailable.
        if statusCode == 401, let fresh = await AuthManager.shared.renewSessionIfPossible() {
            guard owner == AuthManager.shared.currentUser?.id else { throw CancellationError() }
            var retry = req
            retry.setValue("Bearer \(fresh)", forHTTPHeaderField: "Authorization")
            (data, response) = try await URLSession.shared.data(for: retry)
            statusCode = (response as? HTTPURLResponse)?.statusCode
        }
        guard owner == AuthManager.shared.currentUser?.id else { throw CancellationError() }
        try Task.checkCancellation()

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
        let saved = try JSONDecoder().decode(UserBet.self, from: data)
        NotificationCenter.default.post(name: .userBookChanged, object: nil)
        return saved
    }

    @MainActor static func placePropBet(gameDate: String, player: String, propType: String, kind: String, stake: Double, streak: Bool = false, gameID: String? = nil, line: Double? = nil, side: String? = nil) async throws -> UserBet {
        guard let gameID, let line, let side, ["over", "under"].contains(side.lowercased()) else {
            throw UserBookError.server("This prop is missing its exact game or line. Refresh the board and try again.")
        }
        let url = rest.appendingPathComponent("rpc/place_user_prop_bet_v2")
        let body = try JSONSerialization.data(withJSONObject: [
            "p_game_date": gameDate, "p_player": player, "p_prop_type": propType,
            "p_kind": kind, "p_stake": stake, "p_streak": streak,
            "p_game_id": gameID, "p_line": line, "p_side": side.lowercased()] as [String: Any])
        let data = try await run(try authedRequest(url, method: "POST", body: body))
        let saved = try JSONDecoder().decode(UserBet.self, from: data)
        NotificationCenter.default.post(name: .userBookChanged, object: nil)
        return saved
    }

    /// The signed-in user's bets, or NIL when the book could not be read
    /// (Aug 21 2026). An unreadable book is never the same thing as an empty
    /// one: the old `[]`-on-any-error contract let an expired session render
    /// as "No entries yet" over a real record. Callers that only decorate
    /// (`?? []`) stay lenient; the pages that SHOW the record surface the
    /// honest unavailable state instead.
    @MainActor static func fetchMyBets() async -> [UserBet]? {
        let owner = AuthManager.shared.currentUser?.id
        guard owner != nil else { return nil }
        var rows: [UserBet] = []
        var offset = 0
        do {
            while true {
                try Task.checkCancellation()
                guard var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false) else { return nil }
                comps.queryItems = [URLQueryItem(name: "select", value: "*"),
                    URLQueryItem(name: "order", value: "placed_at.desc,id.desc"),
                    URLQueryItem(name: "limit", value: "500"),
                    URLQueryItem(name: "offset", value: String(offset))]
                guard let url = comps.url else { return nil }
                let data = try await run(try authedRequest(url))
                let page = try JSONDecoder().decode([UserBet].self, from: data)
                guard owner == AuthManager.shared.currentUser?.id else { return nil }
                rows.append(contentsOf: page)
                if page.count < 500 { break }
                offset += page.count
            }
            var seen = Set<String>()
            return rows.filter { seen.insert($0.id).inserted }
        } catch { return nil }
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
        var gameDate: String = SupabaseAPI.todayEST()
        var notes: String = ""
        var bookmaker: String = ""
        var favorite: Bool = false
    }

    @MainActor static func logManual(_ draft: ManualBetDraft) async throws -> UserBet {
        guard let odds = draft.odds, (odds <= -100 && odds >= -100000) || (odds >= 100 && odds <= 100000) else {
            throw UserBookError.server("Enter American odds such as -110 or +150.")
        }
        guard draft.stake.isFinite, draft.stake >= 0.01, draft.stake <= 10 else {
            throw UserBookError.server("Enter a stake between \(BookMoney.stake(0.01)) and \(BookMoney.stake(10)).")
        }
        guard !draft.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              draft.description.count <= 300 else {
            throw UserBookError.server("Describe your bet in 1–300 characters.")
        }
        guard var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false) else { throw UserBookError.server("We couldn't open the bet form. Please try again.") }
        comps.queryItems = [URLQueryItem(name: "select", value: "*")]
        guard let uid = AuthManager.shared.currentUser?.id
            ?? UserDefaults.standard.string(forKey: "gary_user_id"), !uid.isEmpty else {
            throw UserBookError.notSignedIn
        }
        var payload: [String: Any] = [
            "user_id": uid, "kind": "manual",
            "game_date": draft.gameDate,
            "league": draft.league,
            "pick_text": draft.description,
            "description": draft.description,
            "stake_units": draft.stake,
            "streak_pick": false, "is_favorite": draft.favorite,
            "notes": draft.notes, "bookmaker": draft.bookmaker,
        ]
        if let o = draft.odds { payload["odds_american"] = o }
        let body = try JSONSerialization.data(withJSONObject: payload)
        var req = try authedRequest(comps.url!, method: "POST", body: body)
        req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        let data = try await run(req)
        let rows = try JSONDecoder().decode([UserBet].self, from: data)
        guard let row = rows.first else { throw UserBookError.server("We couldn't save that bet. Please try again.") }
        NotificationCenter.default.post(name: .userBookChanged, object: nil)
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
              var req = try? authedRequest(url, method: "PATCH", body: body) else { return false }
        req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        guard let data = try? await run(req), let rows = try? JSONDecoder().decode([UserBet].self, from: data), !rows.isEmpty else { return false }
        NotificationCenter.default.post(name: .userBookChanged, object: nil)
        return true
    }

    @MainActor static func deleteBet(id: String) async -> Bool {
        guard var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false) else { return false }
        comps.queryItems = [URLQueryItem(name: "id", value: "eq.\(id)")]
        guard let url = comps.url, var req = try? authedRequest(url, method: "DELETE") else { return false }
        req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        guard let data = try? await run(req), let rows = try? JSONDecoder().decode([UserBet].self, from: data), !rows.isEmpty else { return false }
        NotificationCenter.default.post(name: .userBookChanged, object: nil)
        return true
    }

    /// The database switches the day's designation atomically, before lock.
    @MainActor static func setStreakPick(id: String, gameDate: String, star: Bool) async -> Bool {
        do {
            let body = try JSONSerialization.data(withJSONObject: ["p_bet_id": id, "p_star": star])
            _ = try await run(try authedRequest(rest.appendingPathComponent("rpc/set_streak_pick"), method: "POST", body: body))
            NotificationCenter.default.post(name: .userBookChanged, object: nil)
            return true
        } catch { return false }
    }

    @MainActor static func updateDetails(id: String, favorite: Bool, notes: String, bookmaker: String) async throws -> UserBet {
        var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "id", value: "eq.\(id)")]
        let body = try JSONSerialization.data(withJSONObject: ["is_favorite": favorite, "notes": notes, "bookmaker": bookmaker])
        var req = try authedRequest(comps.url!, method: "PATCH", body: body)
        req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        let data = try await run(req)
        guard let row = try JSONDecoder().decode([UserBet].self, from: data).first else {
            throw UserBookError.server("That bet couldn't be updated. Refresh your book and try again.")
        }
        NotificationCenter.default.post(name: .userBookChanged, object: nil)
        return row
    }

    @MainActor static func editManual(id: String, description: String, odds: Int, stake: Double, gameDate: String) async throws -> UserBet {
        guard odds <= -100 && odds >= -100000 || odds >= 100 && odds <= 100000,
              stake.isFinite, stake >= 0.01, stake <= 10,
              !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              description.count <= 300 else {
            throw UserBookError.server("Enter a bet description, American odds (for example -110), and a stake between \(BookMoney.stake(0.01)) and \(BookMoney.stake(10)).")
        }
        var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "id", value: "eq.\(id)"), URLQueryItem(name: "kind", value: "eq.manual")]
        let body = try JSONSerialization.data(withJSONObject: ["pick_text": description, "description": description, "odds_american": odds, "stake_units": stake, "game_date": gameDate])
        var req = try authedRequest(comps.url!, method: "PATCH", body: body)
        req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        let data = try await run(req)
        guard let row = try JSONDecoder().decode([UserBet].self, from: data).first else {
            throw UserBookError.server("That bet couldn't be updated. Refresh and try again.")
        }
        NotificationCenter.default.post(name: .userBookChanged, object: nil)
        return row
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

private func userBookInstant(_ value: String?) -> Date? {
    guard let value else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: value) { return date }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: value)
}

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
        guard let d = userBookInstant(pick.commence_time) else { return true }
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

// ── YOUR BOOK (the Billfold's YOU page) ─────────────────────────────────────
// Two ledgers, never mixed: WITH GARY = system-graded tails/fades (the
// flagship, unfakeable number); YOUR PLAYS = self-logged bets, labeled.
// Founder, Aug 20: "the You part should be very very close to the Gary
// billfold page" — same card grammar (soft-fill cards on the page ground,
// 14pt radius, 18pt section rhythm), same wallet-header voice, the pieces
// only a user has (streak, filters, split book, slips) as its own sections.
struct UserBookSection: View {
    @ObservedObject private var auth = AuthManager.shared
    @Environment(\.scenePhase) private var scenePhase
    @State private var visibleDays = 30
    @State private var favoritesOnly = false
    @State private var query = ""
    @State private var exportURL: URL?
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
    /// The book couldn't be read (network/session), as opposed to being empty.
    @State private var loadFailed = false

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
            } else if loadFailed {
                unavailableCard
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
                HStack(spacing: 12) {
                    TextField("Search your bets", text: $query)
                        .font(GaryFonts.text(13)).textInputAutocapitalization(.never)
                    Button { favoritesOnly.toggle() } label: {
                        Image(systemName: favoritesOnly ? "heart.fill" : "heart")
                            .foregroundStyle(favoritesOnly ? GaryColors.gold : .white.opacity(0.6))
                            .frame(width: 44, height: 44)
                    }.accessibilityLabel(favoritesOnly ? "Show all bets" : "Show favorites")
                    ShareLink(item: BookExport.csv(scopedBets), preview: SharePreview("My Gary bet history")) {
                        Image(systemName: "square.and.arrow.up").frame(width: 44, height: 44)
                    }.accessibilityLabel("Export filtered bet history as CSV")
                }
                .padding(.horizontal, 12).background(bookCard())
                pendingBlock
                settledByDay
                if scopedBets.isEmpty {
                    Text("No bets match these filters.")
                        .font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.6))
                }
            }
        }
        .padding(.horizontal, 16)
        .task(id: auth.currentUser?.id) {
            bets = []; streak = nil; todayPicks = []; liveScores = []
            loading = true; loadFailed = false
            await refreshBook()
        }
        .onReceive(NotificationCenter.default.publisher(for: .userBookChanged)) { _ in
            Task { await refreshBook() }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active { Task { await refreshBook() } }
        }
        .refreshable { await refreshBook() }
        .onGaryTour { verb, _ in
            // QA harness: open the add-a-bet directory without a tap.
            if verb == "logbet" { showQuickLog = true }
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

    /// Honest state when the book can't be read — never "no entries" over a
    /// record that exists (founder law: an unavailable surface says so).
    private var unavailableCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("YOUR BOOK")
                .font(GaryFonts.mono(11, bold: true)).tracking(1.4)
                .foregroundStyle(GaryColors.gold)
            Text("Couldn't reach your book just now. Your record is safe — pull to refresh, or sign in again if this keeps up.")
                .font(GaryFonts.text(13))
                .foregroundStyle(.white.opacity(0.6))
                .fixedSize(horizontal: false, vertical: true)
            Button {
                Task {
                    loading = true
                    let rows = await UserBookAPI.fetchMyBets()
                    if let rows { bets = rows; loadFailed = false } else { loadFailed = true }
                    loading = false
                }
            } label: {
                Text("TRY AGAIN")
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
        case "7d", "30d":
            var cal = Calendar(identifier: .gregorian); cal.timeZone = f.timeZone
            let count = timeframe == "7d" ? 6 : 29
            return d >= (cal.date(byAdding: .day, value: -count, to: today) ?? today) && d <= today
        case "season": return b.game_date >= "2026-03-01"
        default: return true
        }
    }

    private var scopedBets: [UserBet] {
        bets.filter { b in
            inTimeframe(b) && matchesBookFilters(b)
        }
    }
    private var scopedWithGary: [UserBet] { scopedBets.filter { $0.isVerified } }
    private var scopedYourPlays: [UserBet] { scopedBets.filter { $0.kind == "manual" } }
    private var scopedSettled: [UserBet] { scopedBets.filter { !$0.isPending } }
    /// Open slips ignore the timeframe — a pending bet is always "now".
    private var openSlips: [UserBet] {
        bets.filter { $0.isPending && matchesBookFilters($0) }
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
        ForEach(openSlips) { bet in
            VStack(alignment: .leading, spacing: 2) {
                UserBetSlipRow(bet: bet) { updated in
                    if let i = bets.firstIndex(where: { $0.id == updated.id }) { bets[i] = updated }
                } onDelete: { bets.removeAll { $0.id == bet.id } }
                if bet.isVerified { pendingTrailing(bet).padding(.bottom, 6) }
            }
            if bet.id != openSlips.last?.id {
                Rectangle().fill(.white.opacity(0.05)).frame(height: 0.5)
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
                ForEach(dayGroups.prefix(visibleDays), id: \.date) { group in
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
            if dayGroups.count > visibleDays {
                Button("Show more history") { visibleDays += 30 }
                    .font(GaryFonts.text(13, .semibold)).foregroundStyle(GaryColors.gold)
                    .frame(maxWidth: .infinity).padding(12)
            }
        }
    }

    private func matchesBookFilters(_ bet: UserBet) -> Bool {
        let text = [bet.pick_text, bet.league ?? "", bet.notes ?? "", bet.bookmaker ?? ""].joined(separator: " ")
        return (kindFilter == "all" || bet.kind == kindFilter)
            && (!favoritesOnly || bet.is_favorite == true)
            && (query.isEmpty || text.localizedCaseInsensitiveContains(query))
    }

    private func refreshBook() async {
        guard let owner = auth.currentUser?.id else { loading = false; return }
        async let fetchedBets = UserBookAPI.fetchMyBets()
        async let fetchedStreak = UserBookAPI.fetchMyStreak()
        async let fetchedProfile = try? ProfileIdentityAPI.mine()
        async let fetchedPicks = try? SupabaseAPI.fetchDailyPicks(date: SupabaseAPI.todayEST())
        async let fetchedScores = SupabaseAPI.fetchLiveScores(date: SupabaseAPI.todayEST())
        let (rows, run, profile, picks, scores) = await (fetchedBets, fetchedStreak, fetchedProfile, fetchedPicks, fetchedScores)
        guard owner == auth.currentUser?.id, !Task.isCancelled else { return }
        loadFailed = rows == nil
        if let profile { ProfileIdentityAPI.cache(profile) }
        if let rows { bets = rows }
        streak = run
        if let picks { todayPicks = picks }
        if let scores { liveScores = scores }
        loading = false
        if rows != nil, !BookMoney.isSet, !unitPromptShownThisSession {
            unitPromptShownThisSession = true; showUnitSheet = true
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
        guard let d = userBookInstant(prop.commence_time) else { return true }
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
        let formatter = DateFormatter(); formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "America/New_York")
        let day = userBookInstant(prop.commence_time).map { formatter.string(from: $0) } ?? SupabaseAPI.todayEST()
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

struct UserBetSlipRow: View {
    let bet: UserBet
    var onUpdate: (UserBet) -> Void
    var onDelete: () -> Void
    @State private var showDetail = false

    var body: some View {
        Button { showDetail = true } label: {
            HStack(alignment: .top, spacing: 10) {
                VStack(spacing: 6) {
                    Text(bet.kind == "manual" ? "YOURS" : bet.kind.uppercased())
                        .font(GaryFonts.mono(8, bold: true)).foregroundStyle(bet.isVerified ? GaryColors.gold : .white.opacity(0.55))
                    if bet.streak_pick == true { Image(systemName: "star.fill").foregroundStyle(Color(hex: "#E5844B")) }
                    if bet.is_favorite == true { Image(systemName: "heart.fill").foregroundStyle(GaryColors.gold) }
                }.font(.system(size: 11)).frame(width: 46)
                VStack(alignment: .leading, spacing: 5) {
                    Text(bet.pick_text).font(GaryFonts.text(13, .semibold))
                        .foregroundStyle(.white.opacity(0.9)).fixedSize(horizontal: false, vertical: true)
                    Text("\(bet.game_date) · \(BookMoney.stake(bet.stake_units))\(bet.odds_american.map { " · \($0 > 0 ? "+" : "")\($0)" } ?? "")")
                        .font(GaryFonts.mono(9)).foregroundStyle(.white.opacity(0.5))
                    if bet.kind == "manual" && bet.isPending {
                        Text("Tap to record your result").font(GaryFonts.text(11)).foregroundStyle(GaryColors.gold)
                    }
                }
                Spacer(minLength: 4)
                VStack(alignment: .trailing, spacing: 5) {
                    Text(bet.isPending ? "OPEN" : bet.status == "won" || bet.status == "lost" ? BookMoney.net(bet.units_net ?? 0) : bet.status.uppercased())
                        .font(GaryFonts.mono(10, bold: true))
                        .foregroundStyle(bet.status == "won" ? GaryColors.win : bet.status == "lost" ? GaryColors.loss : .white.opacity(0.55))
                    Image(systemName: "chevron.right").font(.system(size: 9)).foregroundStyle(.white.opacity(0.35))
                }
            }.padding(.vertical, 12).contentShape(Rectangle())
        }.buttonStyle(.plain)
        .sheet(isPresented: $showDetail) {
            UserBetDetailSheet(bet: bet, onUpdate: onUpdate, onDelete: onDelete)
        }
        .onGaryTour { verb, arg in
            if verb == "betdetail", arg == bet.id { showDetail = true }
        }
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
        /// Already on their book — the row shows the receipt instead of an
        /// arm button, so the directory can never double-book a play.
        var booked: String? = nil
        var gameID: String? = nil
        var line: Double? = nil
        var propSide: String? = nil
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
    @State private var oddsText = "-110"
    @State private var manualDate = Date()
    @State private var stakeText = ""
    private let leagues = ["MLB", "NFL", "NCAAF", "NBA", "OTHER"]
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
        .task { stakeText = String(format: "%.2f", BookMoney.unitDollars); await loadBoard() }
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
                    // One line always — the old 38pt column wrapped "GAME"
                    // into "GAM E" (wrapping is clipping; seen live Aug 21).
                    Text(entry.isProp ? "PROP" : "GAME")
                        .font(GaryFonts.mono(8, bold: true)).tracking(0.7)
                        .foregroundStyle(.white.opacity(0.45))
                        .lineLimit(1).fixedSize()
                        .frame(width: 44, alignment: .leading)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.title)
                            .font(GaryFonts.text(13.5, .semibold))
                            .foregroundStyle(.white.opacity(0.9))
                            // Scale, never truncate — no ellipsis, ever.
                            .lineLimit(1).minimumScaleFactor(0.5)
                        Text(entry.subtitle)
                            .font(GaryFonts.mono(9))
                            .foregroundStyle(.white.opacity(0.4))
                            .lineLimit(1).minimumScaleFactor(0.8)
                    }
                    Spacer(minLength: 8)
                    if let booked = entry.booked {
                        Text(booked)
                            .font(GaryFonts.mono(8.5, bold: true)).tracking(0.7)
                            .foregroundStyle(GaryColors.gold.opacity(0.75))
                            .lineLimit(1).fixedSize()
                    } else if entry.locked {
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
            .disabled(entry.locked || entry.booked != nil)

            if armedId == entry.id, !entry.locked, entry.booked == nil {
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
                        TextField("Stake ($)", text: $stakeText)
                            .keyboardType(.decimalPad).font(GaryFonts.mono(12.5))
                            .padding(10).background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.06)))
                    }
                    DatePicker("Bet date (Eastern)", selection: $manualDate, displayedComponents: .date)
                        .environment(\.timeZone, TimeZone(identifier: "America/New_York")!)
                        .font(GaryFonts.text(13)).tint(GaryColors.gold)
                    TextField("Sportsbook (optional)", text: $draft.bookmaker)
                        .font(GaryFonts.text(13)).padding(10)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.06)))
                    TextField("Private notes (optional)", text: $draft.notes, axis: .vertical)
                        .font(GaryFonts.text(13)).padding(10)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.06)))
                    HStack {
                        Button { draft.favorite.toggle() } label: {
                            HStack(spacing: 5) {
                                Image(systemName: draft.favorite ? "heart.fill" : "heart")
                                    .font(.system(size: 11, weight: .semibold))
                                Text("FAVORITE")
                                    .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                            }
                            .foregroundStyle(draft.favorite ? ember : .white.opacity(0.5))
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
                locked: isLocked(p.commence_time), gameID: p.game_id.map(String.init)))
        }
        for p in props {
            guard let player = p.player, let propText = p.prop, !propText.isEmpty else { continue }
            let betWord = (p.bet ?? "over").uppercased()
            var subBits = [(p.league ?? p.sport ?? "").uppercased()]
            if let m = p.matchup { subBits.append(m) }
            if let c = etClock(p.commence_time) { subBits.append(c) }
            rows.append(DirectoryEntry(
                id: "prop-\(player)-\(propText)-\(p.game_id.map(String.init) ?? "")",
                // The app's own prop grammar ("pitcher_earned_runs 2.5" reads
                // "Pitcher Earned Runs 2.5") — raw tokens ran long enough to
                // truncate, and an ellipsis is never acceptable.
                title: "\(player) \(betWord) \(Formatters.propDisplay(propText, league: p.effectiveLeague))",
                subtitle: subBits.filter { !$0.isEmpty }.joined(separator: " · "),
                isProp: true,
                gameDate: etDate(p.commence_time),
                pickText: propText,
                player: player,
                propToken: String(propText.split(separator: " ").first ?? "").lowercased(),
                pickId: nil,
                locked: isLocked(p.commence_time), gameID: p.game_id.map(String.init),
                line: Double(p.line ?? "") ?? Double(p.prop?.split(separator: " ").last.map(String.init) ?? ""), propSide: p.bet))
        }
        // What's already on their book — a bet you hold shows its receipt
        // instead of an arm button, so the directory can't double-book it.
        let mine = AuthManager.shared.bearerToken == nil ? [] : (await UserBookAPI.fetchMyBets() ?? [])
        rows = rows.map { entry in
            var e = entry
            let matches = mine.filter { bet in
                guard bet.isVerified, bet.game_date == e.gameDate else { return false }
                if let source = bet.source_game_id, let game = e.gameID, source != game { return false }
                if e.isProp {
                    guard bet.pick_type == "prop", bet.player_name?.lowercased() == e.player?.lowercased(),
                          bet.prop_type?.lowercased() == e.propToken?.lowercased() else { return false }
                    if let line = bet.source_line, line != e.line { return false }
                    if let side = bet.source_side, side.lowercased() != e.propSide?.lowercased() { return false }
                    return true
                }
                return bet.pick_type != "prop" && bet.pick_text.lowercased() == e.pickText.lowercased()
            }
            let held = matches.first { $0.source_game_id == e.gameID && $0.source_game_id != nil }
                ?? (matches.count == 1 ? matches.first : nil)
            if let held {
                let word = held.kind == "fade" ? "FADED" : held.kind == "tail" ? "RIDING" : "YOURS"
                e.booked = "\(word) · \(BookMoney.stake(held.stake_units))"
            }
            return e
        }

        // Open bets first, each lane in board order; anything already booked
        // sinks below the plays they can still take.
        let rank = { (e: DirectoryEntry) -> Int in e.locked ? 2 : (e.booked != nil ? 1 : 0) }
        let sorted = rows.sorted { a, b in
            rank(a) == rank(b)
                ? (a.isProp == b.isProp ? a.title < b.title : !a.isProp)
                : rank(a) < rank(b)
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
                        kind: side, stake: stake, streak: streakOn, gameID: entry.gameID, line: entry.line, side: entry.propSide)
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
        guard let dollars = Double(stakeText), dollars.isFinite, dollars > 0 else {
            errorText = "Enter your stake in dollars."; return
        }
        draft.stake = dollars / BookMoney.unitDollars
        draft.odds = Int(oddsText.trimmingCharacters(in: .whitespacesAndNewlines))
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "America/New_York")
        draft.gameDate = formatter.string(from: manualDate)
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

/// A handle is an explicit invitation to the public board. The full profile
/// editor also lets an existing player leave the board without losing history.
struct HandleClaimSheet: View {
    var onClaimed: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var auth = AuthManager.shared
    @State private var name = ""
    @State private var busy = false
    @State private var errorText: String?
    private var cleanName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var valid: Bool { cleanName.range(of: "^[A-Za-z0-9_]{3,18}$", options: .regularExpression) != nil }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                ProfileAvatar(name: cleanName, size: 60)
                Text("Put your name on it.").font(GaryFonts.display(30)).foregroundStyle(GaryColors.warmWhite)
                Text("Your handle, avatar and verified record will be public. Your amounts, notes and self-tracked bets stay private. Leave the board anytime in Edit profile.")
                    .font(GaryFonts.text(14)).foregroundStyle(.white.opacity(0.65)).fixedSize(horizontal: false, vertical: true)
                TextField("Your handle", text: $name)
                    .textInputAutocapitalization(.never).autocorrectionDisabled().submitLabel(.done)
                    .font(GaryFonts.mono(17, bold: true)).foregroundStyle(.white)
                    .padding(14).background(RoundedRectangle(cornerRadius: 10).fill(Color.white.opacity(0.06)))
                    .onSubmit { if valid && !busy { save() } }
                Text("3–18 letters, numbers, or underscores").font(GaryFonts.text(12)).foregroundStyle(.white.opacity(0.45))
                if let errorText { Text(errorText).font(GaryFonts.text(13)).foregroundStyle(GaryColors.loss) }
                Button(action: save) {
                    Text(busy ? "Claiming handle" : "Join the board")
                        .font(GaryFonts.text(15, .semibold)).foregroundStyle(.black).frame(maxWidth: .infinity).padding(.vertical, 15)
                        .background(Capsule().fill(GaryColors.gold))
                }.buttonStyle(.plain).disabled(busy || !valid || !auth.isAuthenticated)
                Spacer(minLength: 0)
            }.padding(22).background(Color(hex: "#0F0D0C")).navigationTitle("Your handle").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.foregroundStyle(GaryColors.gold) } }
        }.preferredColorScheme(.dark).interactiveDismissDisabled(busy)
            .onChange(of: auth.currentUser?.id) { _ in dismiss() }
    }

    private func save() {
        guard valid, !busy else { return }
        let owner = auth.currentUser?.id
        busy = true; errorText = nil
        Task {
            defer { busy = false }
            do {
                let claimed = try await UserBookAPI.claimHandle(cleanName)
                guard owner == auth.currentUser?.id else { return }
                UserDefaults.standard.set(claimed, forKey: "myHandle")
                NotificationCenter.default.post(name: Notification.Name("GaryProfileUpdated"), object: nil)
                onClaimed(claimed); dismiss()
            } catch { errorText = error.localizedDescription }
        }
    }
}

struct ProfileHeaderChip: View {
    @ObservedObject private var auth = AuthManager.shared
    @AppStorage("myHandle") private var myHandle = ""
    @AppStorage("myProfileAvatar") private var avatar = "initials"
    var body: some View {
        Button { NotificationCenter.default.post(name: Notification.Name("ShowProfile"), object: nil) } label: {
            ProfileAvatar(name: auth.isAuthenticated ? myHandle : "", symbol: auth.isAuthenticated ? avatar : "initials", size: 28)
                .frame(width: 44, height: 44).contentShape(Rectangle())
        }.buttonStyle(.plain).accessibilityLabel(auth.isAuthenticated ? "Your profile" : "Sign in and your profile")
    }
}

struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject private var auth = AuthManager.shared
    @ObservedObject private var access = WinnersAccessStore.shared
    @AppStorage("myHandle") private var myHandle = ""
    @AppStorage("selectedTab") private var selectedTab = 0
    @AppStorage("billfoldScope") private var billfoldScope = "gary"
    @AppStorage("userUnitDollars") private var unitDollars = 0.0
    @State private var snapshot: ProfileIdentityAPI.Snapshot?
    @State private var card: ProfileIdentityAPI.PublicCard?
    @State private var bets: [UserBet] = []
    @State private var loading = true
    @State private var bookLoaded = false
    @State private var loadFailed = false
    @State private var identityFailed = false
    @State private var showEditor = false
    @State private var showQuickLog = false
    @State private var showAuth = false
    @State private var showSettings = false
    @State private var portalURL: URL?
    @State private var portalError: String?
    @State private var openingPortal = false
    @State private var loadedOwner: String?
    @State private var requestID = UUID()

    private var verified: [UserBet] { bets.filter { $0.isVerified } }
    private var settled: [UserBet] { verified.filter { $0.graded_by == "system" && ["won", "lost"].contains($0.status) } }
    private var openSlips: [UserBet] { bets.filter { $0.isPending } }
    private var profileName: String { snapshot?.profile?.name ?? myHandle }
    private var accountKey: String { "\(auth.currentUser?.id ?? "guest"):\(auth.isAuthenticated):\(auth.isLoading)" }

    var body: some View {
        ZStack {
            Color(hex: "#0F0D0C").ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 20) {
                    identityRow
                    if auth.isLoading && !auth.isAuthenticated {
                        ProgressView("Restoring your account").tint(GaryColors.gold).foregroundStyle(.white.opacity(0.6)).frame(maxWidth: .infinity).padding(30)
                    } else if !auth.isAuthenticated {
                        signedOutPitch
                        boardDoor
                    } else {
                        if loading && !bookLoaded {
                            ProgressView("Opening your book").tint(GaryColors.gold).foregroundStyle(.white.opacity(0.6)).frame(maxWidth: .infinity).padding(30)
                        } else {
                            if loadFailed {
                                ProfileNotice(title: "Your book is unavailable", message: bookLoaded ? "Showing the last record we loaded. Pull to refresh for the latest results." : "We couldn't load your record. Your history is saved; try again when you're connected.", retry: { Task { await load() } })
                            }
                            if identityFailed {
                                ProfileNotice(title: "Profile didn't load", message: "Your saved identity and privacy settings couldn't be read. Refresh to edit them.", icon: "person.crop.circle", retry: { Task { await load() } })
                            }
                            if bookLoaded {
                                streakCard
                                recordPanel
                                if !settled.isEmpty { patternsPanel }
                                milestones
                                actionRow
                                if !openSlips.isEmpty { openSlipsBlock }
                            }
                            boardDoor
                        }
                        membershipCard
                        accountFooter
                    }
                }.padding(18).padding(.bottom, 35)
            }.refreshable { await load(); await access.refresh() }
        }
        .task(id: accountKey) { await load(); if auth.isAuthenticated { await access.refresh() } }
        .onGaryTour { verb, _ in if verb == "profileedit", snapshot != nil { showEditor = true } }
        .onChange(of: scenePhase) { phase in if phase == .active { Task { await load(); await access.refresh() } } }
        .sheet(isPresented: $showEditor) { ProfileEditorSheet(snapshot: snapshot) { updated in snapshot = updated; identityFailed = false } }
        .sheet(isPresented: $showQuickLog, onDismiss: { Task { await load() } }) { QuickLogSheet { _ in } }
        .sheet(isPresented: $showAuth, onDismiss: { Task { await load() } }) { AuthView() }
        .sheet(isPresented: $showSettings) { SettingsView().environmentObject(auth) }
        .sheet(isPresented: Binding(get: { portalURL != nil }, set: { if !$0 { portalURL = nil } }), onDismiss: { Task { await access.refresh() } }) { if let portalURL { SafariView(url: portalURL) } }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("GaryProfileUpdated"))) { _ in Task { await load() } }
        .onReceive(NotificationCenter.default.publisher(for: .userBookChanged)) { _ in Task { await load() } }
    }

    private var identityRow: some View {
        HStack(alignment: .top, spacing: 13) {
            ProfileAvatar(name: auth.isAuthenticated ? profileName : "", symbol: auth.isAuthenticated ? snapshot?.profile?.avatar : nil, size: 56)
            VStack(alignment: .leading, spacing: 5) {
                Text(auth.isAuthenticated ? (profileName.isEmpty ? "Your profile" : "@\(profileName)") : "Your next chapter")
                    .font(GaryFonts.display(27)).foregroundStyle(GaryColors.warmWhite).fixedSize(horizontal: false, vertical: true)
                if auth.isAuthenticated {
                    if let snapshot {
                        Label(snapshot.profile?.isPublic == true ? "PUBLIC RECORD" : "PRIVATE PROFILE", systemImage: snapshot.profile?.isPublic == true ? "checkmark.shield" : "lock.fill")
                            .font(GaryFonts.mono(9, bold: true)).tracking(0.8).foregroundStyle(GaryColors.gold.opacity(0.85))
                    }
                    if let bio = snapshot?.profile?.bio, !bio.isEmpty { Text(bio).font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.6)).fixedSize(horizontal: false, vertical: true) }
                    Button("Edit profile") { showEditor = true }.font(GaryFonts.text(12, .semibold)).foregroundStyle(GaryColors.gold).padding(.vertical, 5).disabled(snapshot == nil)
                } else { Text("Your picks. Your progress. Your people.").font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.5)) }
            }.frame(maxWidth: .infinity, alignment: .leading)
            Button { showSettings = true } label: {
                Image(systemName: "gearshape").font(.system(size: 18)).foregroundStyle(.white.opacity(0.6)).frame(width: 40, height: 44)
            }.buttonStyle(.plain).accessibilityLabel("Settings and account controls")
        }
    }

    private var signedOutPitch: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Build a record worth knowing.").font(GaryFonts.display(30)).foregroundStyle(GaryColors.warmWhite)
            feature("checkmark.shield", "A record you can trust", "Ride or fade Gary before the game. Results settle automatically.")
            feature("star", "One pick. Your streak.", "Star your strongest call, then follow your winning run.")
            feature("list.bullet.rectangle", "Your whole book", "Track your own bets privately beside your verified picks.")
            Button { showAuth = true } label: { primaryLabel("Create account or sign in") }.buttonStyle(.plain)
            Text("Your profile, tracking and leaderboard are free. You choose whether your record is public.")
                .font(GaryFonts.text(12)).foregroundStyle(.white.opacity(0.5)).fixedSize(horizontal: false, vertical: true)
        }.padding(18).background(panel)
    }
    private func feature(_ icon: String, _ title: String, _ description: String) -> some View {
        HStack(alignment: .top, spacing: 11) {
            Image(systemName: icon).font(.system(size: 18)).foregroundStyle(GaryColors.gold).frame(width: 24)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(GaryFonts.text(15, .semibold)).foregroundStyle(.white.opacity(0.9))
                Text(description).font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.55)).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var streakCard: some View {
        let pending = verified.first { $0.streak_pick == true && $0.isPending }
        let current = card?.streak?.current
        let best = card?.streak?.best
        return VStack(alignment: .leading, spacing: 14) {
            HStack {
                Label("YOUR STREAK", systemImage: "flame.fill").font(GaryFonts.mono(11, bold: true)).tracking(1).foregroundStyle(Color(hex: "#ECA06D"))
                Spacer()
                Text("BEST \(best.map(String.init) ?? "—")").font(GaryFonts.mono(10, bold: true)).foregroundStyle(.white.opacity(0.5))
            }
            HStack(alignment: .firstTextBaseline, spacing: 9) {
                Text(current.map(String.init) ?? (card != nil ? "0" : "—")).font(GaryFonts.mono(48, bold: true)).foregroundStyle(GaryColors.warmWhite)
                Text(current == 1 ? "win in a row" : "wins in a row").font(GaryFonts.text(15)).foregroundStyle(.white.opacity(0.65))
            }
            if let pending {
                Label("Streak pick set", systemImage: "star.fill").font(GaryFonts.text(13, .semibold)).foregroundStyle(GaryColors.gold)
                Text(pending.pick_text).font(GaryFonts.text(14)).foregroundStyle(.white.opacity(0.75)).fixedSize(horizontal: false, vertical: true)
            } else {
                Text("Star one verified pick per game day before it locks. Wins build your run; a loss resets it. Pushes, voids and days off hold your place.")
                    .font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.6)).fixedSize(horizontal: false, vertical: true)
            }
            Text("Self-tracked favorites stay in your book and don't count toward this streak.").font(GaryFonts.text(11)).foregroundStyle(.white.opacity(0.4)).fixedSize(horizontal: false, vertical: true)
        }.padding(18).background(RoundedRectangle(cornerRadius: 17).fill(Color(hex: "#E5844B").opacity(0.07))).overlay(RoundedRectangle(cornerRadius: 17).stroke(Color(hex: "#E5844B").opacity(0.22)))
    }

    private func record(_ rows: [UserBet]) -> (wins: Int, losses: Int, pushes: Int, net: Double) {
        let graded = rows.filter { ["won", "lost", "push"].contains($0.status) }
        return (graded.filter { $0.status == "won" }.count, graded.filter { $0.status == "lost" }.count, graded.filter { $0.status == "push" }.count, graded.reduce(0) { $0 + ($1.units_net ?? 0) })
    }
    private var recordPanel: some View {
        let verifiedRecord = record(verified.filter { $0.graded_by == "system" })
        let manual = record(bets.filter { !$0.isVerified })
        let decided = verifiedRecord.wins + verifiedRecord.losses
        return VStack(alignment: .leading, spacing: 17) {
            HStack { Text("YOUR VERIFIED RECORD").font(GaryFonts.mono(10, bold: true)).foregroundStyle(GaryColors.gold); Spacer(); Text("ALL TIME").font(GaryFonts.mono(9)).foregroundStyle(.white.opacity(0.4)) }
            HStack {
                ProfileMetric(label: "WINS–LOSSES", value: "\(verifiedRecord.wins)–\(verifiedRecord.losses)", detail: "\(verifiedRecord.pushes) pushes")
                ProfileMetric(label: "WIN RATE", value: decided > 0 ? String(format: "%.1f%%", Double(verifiedRecord.wins) / Double(decided) * 100) : "—", detail: "\(decided) decided picks")
            }
            HStack {
                ProfileMetric(label: "NET RESULT", value: BookMoney.netTotal(verifiedRecord.net), detail: unitDollars > 0 ? "At your saved bet size" : "Hypothetical $100 per unit", tint: verifiedRecord.net >= 0 ? GaryColors.win : GaryColors.loss)
                ProfileMetric(label: "OPEN BETS", value: "\(openSlips.count)", detail: "All of your pending bets")
            }
            if bets.contains(where: { !$0.isVerified }) {
                Divider().overlay(Color.white.opacity(0.08))
                HStack {
                    VStack(alignment: .leading, spacing: 3) { Text("Your own bets").font(GaryFonts.text(13, .semibold)); Text("Private · self-tracked").font(GaryFonts.text(11)).foregroundStyle(.white.opacity(0.4)) }
                    Spacer()
                    Text("\(manual.wins)–\(manual.losses)").font(GaryFonts.mono(15, bold: true))
                    Text(BookMoney.netTotal(manual.net)).font(GaryFonts.mono(12)).foregroundStyle(manual.net >= 0 ? GaryColors.win : GaryColors.loss)
                }.foregroundStyle(.white.opacity(0.8))
            }
        }.padding(18).background(panel)
    }

    private var patternsPanel: some View {
        let rides = record(settled.filter { $0.kind == "tail" })
        let fades = record(settled.filter { $0.kind == "fade" })
        return VStack(alignment: .leading, spacing: 14) {
            Text("HOW YOU PLAY").font(GaryFonts.mono(10, bold: true)).foregroundStyle(GaryColors.gold)
            HStack {
                ProfileMetric(label: "RIDING GARY", value: "\(rides.wins)–\(rides.losses)")
                ProfileMetric(label: "FADING GARY", value: "\(fades.wins)–\(fades.losses)")
            }
            if let card, card.graded > 0 {
                Text("Last 30 days: \(card.wins) wins and \(card.losses) losses on \(card.graded) decided picks.")
                    .font(GaryFonts.text(12)).foregroundStyle(.white.opacity(0.55)).fixedSize(horizontal: false, vertical: true)
            }
            Text("A record describes what happened. A hot streak doesn't predict the next result.").font(GaryFonts.text(11)).foregroundStyle(.white.opacity(0.4)).fixedSize(horizontal: false, vertical: true)
        }.padding(18).background(panel)
    }

    private var milestones: some View {
        let best = card?.streak?.best ?? 0
        let milestones: [(String, String, Bool)] = [("checkmark.shield", "First result", !settled.isEmpty), ("trophy", "5 verified", settled.count >= 5), ("flame", "3 straight", best >= 3), ("star.circle", "10 straight", best >= 10)]
        return VStack(alignment: .leading, spacing: 13) {
            Text("MILESTONES").font(GaryFonts.mono(10, bold: true)).foregroundStyle(GaryColors.gold)
            HStack(alignment: .top, spacing: 8) {
                ForEach(milestones, id: \.0) { item in
                    VStack(spacing: 8) {
                        Image(systemName: item.0).font(.system(size: 22)).frame(height: 30)
                        Text(item.1).font(GaryFonts.text(11, .semibold)).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                        Text(card == nil && ["flame", "star.circle"].contains(item.0) ? "Unavailable" : item.2 ? "Earned" : "To unlock").font(GaryFonts.text(10)).foregroundStyle(.white.opacity(0.4))
                    }.frame(maxWidth: .infinity).foregroundStyle(item.2 ? GaryColors.gold : .white.opacity(0.25))
                        .accessibilityElement(children: .combine)
                }
            }
        }.padding(18).background(panel)
    }

    private var actionRow: some View {
        HStack(spacing: 10) {
            Button { showQuickLog = true } label: { primaryLabel("+ Log a bet") }.buttonStyle(.plain)
            Button { openBook("you") } label: {
                Text("Full book →").font(GaryFonts.text(14, .semibold)).foregroundStyle(GaryColors.warmWhite).frame(maxWidth: .infinity).padding(.vertical, 14).background(Capsule().fill(Color.white.opacity(0.07)))
            }.buttonStyle(.plain)
        }
    }
    private var boardDoor: some View {
        Button { openBook("board") } label: {
            HStack(spacing: 12) {
                Image(systemName: "trophy").font(.system(size: 23)).foregroundStyle(GaryColors.gold)
                VStack(alignment: .leading, spacing: 4) {
                    Text("The leaderboard").font(GaryFonts.text(16, .semibold)).foregroundStyle(GaryColors.warmWhite)
                    Text("Real records. Hot streaks. Your place.").font(GaryFonts.text(12)).foregroundStyle(.white.opacity(0.5))
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(.white.opacity(0.45))
            }.padding(17).background(panel)
        }.buttonStyle(.plain)
    }
    private var openSlipsBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("OPEN BETS").font(GaryFonts.mono(10, bold: true)).foregroundStyle(GaryColors.gold)
                Spacer()
                Button("See all \(openSlips.count)") { openBook("you") }.font(GaryFonts.text(12)).foregroundStyle(GaryColors.gold)
            }
            ForEach(openSlips.prefix(3)) { bet in
                UserBetSlipRow(bet: bet, onUpdate: { updated in if let index = bets.firstIndex(where: { $0.id == updated.id }) { bets[index] = updated } }, onDelete: { bets.removeAll { $0.id == bet.id } })
            }
        }
    }
    private var membershipCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("YOUR WINNERS ACCESS").font(GaryFonts.mono(10, bold: true)).foregroundStyle(GaryColors.gold)
                Spacer()
                if access.loading { ProgressView().tint(GaryColors.gold) }
            }
            if let entitlement = access.snapshot {
                Text(entitlement.title).font(GaryFonts.text(18, .semibold)).foregroundStyle(GaryColors.warmWhite)
                Text(entitlement.detail).font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.6)).fixedSize(horizontal: false, vertical: true)
                Button { dismiss(); selectedTab = 1 } label: { primaryLabel("Open Winners") }.buttonStyle(.plain)
                if entitlement.can_manage {
                    Button(openingPortal ? "Opening billing" : "Manage membership") {
                        let owner = auth.currentUser?.id
                        openingPortal = true; portalError = nil
                        Task {
                            defer { openingPortal = false }
                            do {
                                let url = try await access.manageSubscription()
                                guard auth.currentUser?.id == owner else { return }
                                portalURL = url
                            } catch {
                                guard auth.currentUser?.id == owner else { return }
                                portalError = error.localizedDescription
                            }
                        }
                    }.font(GaryFonts.text(13, .semibold)).foregroundStyle(GaryColors.gold).disabled(openingPortal)
                }
            } else {
                Text(access.errorMessage ?? "Checking your membership").font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.6))
            }
            Button("Refresh purchases and access") { Task { await access.refresh() } }.font(GaryFonts.text(12)).foregroundStyle(.white.opacity(0.5)).disabled(access.loading)
            if let portalError { Text(portalError).font(GaryFonts.text(12)).foregroundStyle(GaryColors.loss) }
            Text("Your profile and personal book stay available on every plan.").font(GaryFonts.text(11)).foregroundStyle(.white.opacity(0.4))
        }.padding(18).background(panel)
    }
    private var accountFooter: some View {
        VStack(spacing: 12) {
            if let email = auth.currentUser?.email { Text(email).font(GaryFonts.text(12)).foregroundStyle(.white.opacity(0.4)) }
            Button("Sign out") { auth.signOut(); resetAccount() }.font(GaryFonts.text(13, .semibold)).foregroundStyle(.white.opacity(0.6)).padding(.vertical, 8)
        }.frame(maxWidth: .infinity)
    }
    private var panel: some View { RoundedRectangle(cornerRadius: 15).fill(GaryColors.cardBg).overlay(RoundedRectangle(cornerRadius: 15).stroke(Color.white.opacity(0.07))) }
    private func primaryLabel(_ text: String) -> some View { Text(text).font(GaryFonts.text(14, .semibold)).foregroundStyle(.black).frame(maxWidth: .infinity).padding(.vertical, 14).background(Capsule().fill(GaryColors.gold)) }
    private func openBook(_ scope: String) { billfoldScope = scope; selectedTab = 4; dismiss() }
    private func resetAccount() {
        requestID = UUID(); snapshot = nil; card = nil; bets = []; bookLoaded = false; loadFailed = false; identityFailed = false; portalURL = nil; portalError = nil
        showEditor = false; showQuickLog = false; loadedOwner = nil
    }
    private func load() async {
        guard auth.isAuthenticated, let owner = auth.currentUser?.id else { resetAccount(); loading = false; return }
        if loadedOwner != owner { resetAccount(); loadedOwner = owner }
        let request = UUID(); requestID = request; loading = true
        async let profileLoad = try? ProfileIdentityAPI.mine()
        async let bookLoad = UserBookAPI.fetchMyBets()
        async let cardLoad = try? ProfileIdentityAPI.card(userID: owner)
        let (identity, allBets, loadedCard) = await (profileLoad, bookLoad, cardLoad)
        guard requestID == request, owner == auth.currentUser?.id, auth.isAuthenticated, !Task.isCancelled else { return }
        identityFailed = identity == nil
        if let identity {
            snapshot = identity
            UserDefaults.standard.set(identity.profile?.name ?? "", forKey: "myHandle")
            UserDefaults.standard.set(identity.profile?.avatar ?? "initials", forKey: "myProfileAvatar")
            unitDollars = identity.preferences?.unit_value ?? 0
        }
        loadFailed = allBets == nil
        if let allBets { bets = allBets; bookLoaded = true }
        card = loadedCard
        loading = false
    }
}

// MARK: - Verified community leaderboard
// Ranking, qualification, filtering, pagination and the caller's position
// come from one server snapshot. Self-tracked bets never enter this board.
struct ClassicLeaderboardView: View {
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject private var auth = AuthManager.shared
    @AppStorage("bookBoardSort") private var sort = "streak"
    @AppStorage("bookBoardWindow") private var window = "30d"
    @AppStorage("bookBoardLeague") private var league = "all"
    @AppStorage("myHandle") private var myHandle = ""
    @State private var board: ProfileIdentityAPI.Board?
    @State private var rows: [ProfileIdentityAPI.BoardRow] = []
    @State private var profile: ProfileIdentityAPI.Snapshot?
    @State private var loading = true
    @State private var loadingMore = false
    @State private var nextOffset = 0
    @State private var error: String?
    @State private var updatedAt: Date?
    @State private var showClaim = false
    @State private var showAuth = false
    @State private var showRules = false
    @State private var showEditor = false
    @State private var selectedPlayer: ProfileIdentityAPI.BoardRow?
    @State private var loadedQuery = ""
    @State private var favoriteAccountOwner: String?
    @State private var requestID = UUID()

    private var selectedSort: String { ["streak", "wins", "record"].contains(sort) ? sort : "streak" }
    private var selectedWindow: String { ["season", "30d", "7d"].contains(window) ? window : "30d" }
    private var selectedLeague: String { ["all", "MLB", "NFL", "NBA", "NCAAF"].contains(league) ? league : "all" }
    private var queryKey: String { "\(auth.currentUser?.id ?? "guest"):\(auth.isAuthenticated):\(selectedWindow):\(selectedSort):\(selectedLeague)" }
    private var windowName: String { selectedWindow == "season" ? "This year" : selectedWindow == "7d" ? "Last 7 days" : "Last 30 days" }
    private var heading: String { selectedSort == "wins" ? "The win leaders." : selectedSort == "record" ? "Make every call count." : "Who's on a heater?" }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            header
            controls
            if let error {
                ProfileNotice(title: "Standings couldn't refresh", message: error, retry: { Task { await load() } })
            }
            if loading && rows.isEmpty {
                ProgressView("Loading verified records").tint(GaryColors.gold).foregroundStyle(.white.opacity(0.6)).frame(maxWidth: .infinity).padding(.vertical, 40)
            } else if board != nil {
                myPosition
                if rows.isEmpty { emptyState }
                else {
                    if rows.count >= 3 { podium }
                    if rows.count > 3 || rows.count < 3 { standings }
                    if board?.has_more == true {
                        Button { Task { await loadMore() } } label: {
                            HStack { if loadingMore { ProgressView().tint(GaryColors.gold) }; Text(loadingMore ? "Loading more players" : "Load more players") }
                                .font(GaryFonts.text(14, .semibold)).foregroundStyle(GaryColors.gold).frame(maxWidth: .infinity).padding(14).background(RoundedRectangle(cornerRadius: 12).fill(GaryColors.cardBg))
                        }.buttonStyle(.plain).disabled(loadingMore)
                    }
                }
                if let updatedAt {
                    HStack {
                        Text("Updated \(updatedAt, style: .time)").font(GaryFonts.text(11)).foregroundStyle(.white.opacity(0.35))
                        Spacer()
                        Button { Task { await load() } } label: { Label("Refresh", systemImage: "arrow.clockwise").font(GaryFonts.text(12)).foregroundStyle(.white.opacity(0.55)) }.buttonStyle(.plain).disabled(loading)
                    }
                }
            }
            Text("Verified picks only. Your stakes and self-tracked bets stay private.")
                .font(GaryFonts.text(11)).foregroundStyle(.white.opacity(0.4)).fixedSize(horizontal: false, vertical: true)
        }
        .pageGutter()
        .task(id: queryKey) { await load() }
        .onGaryTour { verb, _ in if verb == "boardrules" { showRules = true } }
        .onChange(of: scenePhase) { phase in if phase == .active { Task { await load() } } }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("GaryProfileUpdated"))) { _ in Task { await load() } }
        .onReceive(NotificationCenter.default.publisher(for: .userBookChanged)) { _ in Task { await load() } }
        .sheet(isPresented: $showClaim, onDismiss: { Task { await load() } }) { HandleClaimSheet { myHandle = $0 } }
        .sheet(isPresented: $showAuth, onDismiss: { Task { await load() } }) { AuthView() }
        .sheet(isPresented: $showEditor) { ProfileEditorSheet(snapshot: profile) { updated in profile = updated; Task { await load() } } }
        .sheet(item: $selectedPlayer) { PublicPlayerProfileSheet(player: $0) }
        .sheet(isPresented: $showRules) { rulesSheet }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("THE PLAYERS' BOARD", systemImage: "checkmark.shield").font(GaryFonts.mono(10, bold: true)).tracking(0.8).foregroundStyle(GaryColors.gold)
                Spacer()
                Button { showRules = true } label: { Image(systemName: "info.circle").font(.system(size: 17)).foregroundStyle(.white.opacity(0.5)).frame(width: 40, height: 36) }
                    .buttonStyle(.plain).accessibilityLabel("Leaderboard rules")
            }
            Text(heading).font(GaryFonts.display(31)).foregroundStyle(GaryColors.warmWhite)
            Text(selectedSort == "streak" ? "One starred pick at a time. Follow the runs and find your next personal best." : "Five decided picks gets you in. Every result comes from the same verified book.")
                .font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.55)).fixedSize(horizontal: false, vertical: true)
        }
    }

    private var controls: some View {
        VStack(spacing: 14) {
            HStack(spacing: 5) {
                sortButton("Hot streaks", value: "streak", icon: "flame")
                sortButton("Most wins", value: "wins", icon: "checkmark")
                sortButton("Win rate", value: "record", icon: "chart.bar")
            }.padding(4).background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.04)))
            HStack {
                Menu {
                    Button("All sports") { league = "all" }
                    ForEach(["MLB", "NFL", "NBA", "NCAAF"], id: \.self) { sport in Button(sport) { league = sport } }
                } label: {
                    Label(selectedLeague == "all" ? "All sports" : selectedLeague, systemImage: "line.3.horizontal.decrease")
                        .font(GaryFonts.text(13, .semibold)).foregroundStyle(GaryColors.warmWhite).padding(.vertical, 7)
                }
                Spacer()
                Menu {
                    Button("Last 7 days") { window = "7d" }
                    Button("Last 30 days") { window = "30d" }
                    Button("This calendar year") { window = "season" }
                } label: {
                    HStack(spacing: 5) { Text(windowName); Image(systemName: "chevron.down").font(.system(size: 9, weight: .semibold)) }
                        .font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.6)).padding(.vertical, 7)
                }
            }
        }
    }
    private func sortButton(_ title: String, value: String, icon: String) -> some View {
        Button { sort = value } label: {
            VStack(spacing: 5) {
                Image(systemName: icon).font(.system(size: 13, weight: .semibold))
                Text(title).font(GaryFonts.text(12, .semibold)).lineLimit(1).minimumScaleFactor(0.8)
            }.foregroundStyle(selectedSort == value ? GaryColors.gold : .white.opacity(0.45))
                .frame(maxWidth: .infinity).padding(.vertical, 11)
                .background(RoundedRectangle(cornerRadius: 9).fill(selectedSort == value ? GaryColors.gold.opacity(0.08) : .clear))
        }.buttonStyle(.plain).accessibilityAddTraits(selectedSort == value ? .isSelected : [])
    }

    @ViewBuilder private var myPosition: some View {
        if let board {
            if !auth.isAuthenticated {
                invitation(title: "Your name belongs here.", text: "A free account keeps your record and lets you join when you're ready.", button: "Sign in to get started", action: { showAuth = true })
            } else if let me = board.me {
                Button { selectedPlayer = me } label: {
                    HStack(spacing: 12) {
                        Text("#\(me.rank)").font(GaryFonts.mono(26, bold: true)).foregroundStyle(GaryColors.gold)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("YOUR POSITION").font(GaryFonts.mono(9, bold: true)).tracking(0.8).foregroundStyle(GaryColors.gold)
                            Text("\(me.record) · \(String(format: "%.1f", me.win_pct))% · \(board.qualified_count) ranked players")
                                .font(GaryFonts.text(12)).foregroundStyle(.white.opacity(0.65)).fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                        Text(me.streakLabel).font(GaryFonts.mono(18, bold: true)).foregroundStyle(streakColor(me))
                    }.padding(16).background(RoundedRectangle(cornerRadius: 14).fill(GaryColors.gold.opacity(0.065)).overlay(RoundedRectangle(cornerRadius: 14).stroke(GaryColors.gold.opacity(0.25))))
                }.buttonStyle(.plain)
            } else if profile == nil {
                ProfileNotice(title: "Your progress couldn't load", message: "Public standings are available. Refresh to check your profile and place on the board.", icon: "person.crop.circle", retry: { Task { await load() } })
            } else if profile?.profile?.isPublic != true {
                invitation(title: "Your record is private.", text: "You've settled \(board.my_decided) verified picks in this view. Choose a handle and make your record public to join.", button: profile?.profile?.name.isEmpty == false ? "Edit visibility" : "Join the board", action: {
                    if profile?.profile?.name.isEmpty == false { showEditor = true } else { showClaim = true }
                })
            } else {
                VStack(alignment: .leading, spacing: 11) {
                    HStack { Text("BUILDING YOUR PLACE").font(GaryFonts.mono(10, bold: true)).foregroundStyle(GaryColors.gold); Spacer(); Text("\(min(board.my_decided, board.min_decided))/\(board.min_decided)").font(GaryFonts.mono(13, bold: true)).foregroundStyle(GaryColors.warmWhite) }
                    ProgressView(value: Double(min(board.my_decided, board.min_decided)), total: Double(max(1, board.min_decided))).tint(GaryColors.gold)
                    Text("\(max(0, board.min_decided - board.my_decided)) more decided verified picks in this view to qualify. Pending bets and pushes don't count toward the minimum.")
                        .font(GaryFonts.text(12)).foregroundStyle(.white.opacity(0.6)).fixedSize(horizontal: false, vertical: true)
                }.padding(16).background(cardBackground)
            }
        }
    }
    private func invitation(title: String, text: String, button: String, action: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(GaryFonts.text(16, .semibold)).foregroundStyle(GaryColors.warmWhite)
            Text(text).font(GaryFonts.text(12)).foregroundStyle(.white.opacity(0.55)).fixedSize(horizontal: false, vertical: true)
            Button(button, action: action).font(GaryFonts.text(13, .semibold)).foregroundStyle(GaryColors.gold).padding(.vertical, 5)
        }.padding(16).background(cardBackground)
    }

    private var podium: some View {
        let top = Array(rows.prefix(3))
        return HStack(alignment: .bottom, spacing: 8) {
            podiumTile(top[1], featured: false)
            podiumTile(top[0], featured: true)
            podiumTile(top[2], featured: false)
        }.padding(.top, 2)
    }
    private func podiumTile(_ row: ProfileIdentityAPI.BoardRow, featured: Bool) -> some View {
        Button { selectedPlayer = row } label: {
            VStack(spacing: 9) {
                Text("#\(row.rank)").font(GaryFonts.mono(featured ? 23 : 19, bold: true)).foregroundStyle(GaryColors.gold)
                ProfileAvatar(name: row.name, symbol: row.avatar, size: featured ? 48 : 40)
                Text(row.name).font(GaryFonts.text(12, .semibold)).foregroundStyle(GaryColors.warmWhite).lineLimit(2).minimumScaleFactor(0.8).multilineTextAlignment(.center)
                Text(row.record).font(GaryFonts.mono(12)).foregroundStyle(.white.opacity(0.65)).lineLimit(1).minimumScaleFactor(0.8)
                Text(score(row)).font(GaryFonts.mono(featured ? 23 : 18, bold: true)).foregroundStyle(selectedSort == "streak" ? streakColor(row) : GaryColors.gold).lineLimit(1).minimumScaleFactor(0.7)
                Text(selectedSort == "streak" ? "CURRENT RUN" : selectedSort == "wins" ? "WINS" : "WIN RATE").font(GaryFonts.mono(7.5, bold: true)).foregroundStyle(.white.opacity(0.4)).lineLimit(1).minimumScaleFactor(0.7)
            }.frame(maxWidth: .infinity).padding(.horizontal, 7).padding(.vertical, featured ? 20 : 14)
                .background(RoundedRectangle(cornerRadius: 15).fill(GaryColors.cardBg).overlay(RoundedRectangle(cornerRadius: 15).stroke(featured ? GaryColors.gold.opacity(0.35) : Color.white.opacity(0.08))))
        }.buttonStyle(.plain).accessibilityLabel("Rank \(row.rank), \(row.name), \(row.wins) wins, \(row.losses) losses, \(row.streakLabel) streak. View profile.")
    }
    private func score(_ row: ProfileIdentityAPI.BoardRow) -> String {
        switch selectedSort { case "wins": return String(row.wins); case "record": return String(format: "%.1f%%", row.win_pct); default: return row.streakLabel }
    }

    private var standings: some View {
        let field = rows.count >= 3 ? Array(rows.dropFirst(3)) : rows
        return VStack(spacing: 0) {
            HStack {
                Text("PLAYER").frame(maxWidth: .infinity, alignment: .leading)
                Text("RECORD").frame(width: 75, alignment: .trailing)
                Text("STREAK").frame(width: 47, alignment: .trailing)
            }.font(GaryFonts.mono(9, bold: true)).foregroundStyle(.white.opacity(0.4)).padding(14)
            ForEach(field) { row in
                Divider().overlay(Color.white.opacity(0.05))
                Button { selectedPlayer = row } label: { playerRow(row) }.buttonStyle(.plain)
            }
        }.background(cardBackground)
    }
    private func playerRow(_ row: ProfileIdentityAPI.BoardRow) -> some View {
        let isMe = auth.isAuthenticated && row.user_id == auth.currentUser?.id
        return HStack(spacing: 9) {
            Text("\(row.rank)").font(GaryFonts.mono(12, bold: true)).foregroundStyle(isMe ? GaryColors.gold : .white.opacity(0.45)).frame(minWidth: 18, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                Text(row.name).font(GaryFonts.text(14, .semibold)).foregroundStyle(isMe ? GaryColors.gold : GaryColors.warmWhite).lineLimit(2).minimumScaleFactor(0.8)
                Text(isMe ? "YOU · BEST W\(row.best_streak)" : "BEST W\(row.best_streak)").font(GaryFonts.mono(8, bold: true)).foregroundStyle(.white.opacity(0.4))
            }.frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 4) {
                Text(row.record).font(GaryFonts.mono(13, bold: true)).foregroundStyle(.white.opacity(0.85))
                Text(String(format: "%.1f%%", row.win_pct)).font(GaryFonts.mono(10)).foregroundStyle(.white.opacity(0.5))
            }.frame(width: 75, alignment: .trailing)
            Text(row.streakLabel).font(GaryFonts.mono(15, bold: true)).foregroundStyle(streakColor(row)).frame(width: 47, alignment: .trailing)
        }.padding(14).background(isMe ? GaryColors.gold.opacity(0.04) : .clear)
            .accessibilityElement(children: .combine)
            .accessibilityHint("View public profile")
    }
    private func streakColor(_ row: ProfileIdentityAPI.BoardRow) -> Color {
        row.streak_len == 0 ? .white.opacity(0.4) : row.streak_kind == "W" ? GaryColors.gold : .white.opacity(0.55)
    }
    private var emptyState: some View {
        VStack(spacing: 13) {
            Image(systemName: "trophy").font(.system(size: 34)).foregroundStyle(GaryColors.gold)
            Text("The next name could be yours.").font(GaryFonts.display(26)).foregroundStyle(GaryColors.warmWhite).multilineTextAlignment(.center)
            Text("No players have qualified for \(selectedLeague == "all" ? "all sports" : selectedLeague) · \(windowName.lowercased()) yet. Five decided verified picks and a public handle earn a place.")
                .font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.55)).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            if selectedLeague != "all" || selectedWindow != "season" {
                Button("Explore the full board") { league = "all"; window = "season" }.font(GaryFonts.text(13, .semibold)).foregroundStyle(GaryColors.gold).padding(.vertical, 6)
            }
        }.frame(maxWidth: .infinity).padding(24).background(cardBackground)
    }
    private var cardBackground: some View { RoundedRectangle(cornerRadius: 15).fill(GaryColors.cardBg).overlay(RoundedRectangle(cornerRadius: 15).stroke(Color.white.opacity(0.07))) }
    private var rulesSheet: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    rulesItem("Earn your place", "Claim a handle, make your record public and settle five verified wins or losses in the selected sport and time window. Pending bets, pushes and voids don't meet that minimum.")
                    rulesItem("Pick your streak", "Star one verified ride or fade per game day before it locks. Only those designated picks build the streak. Wins extend it; a loss ends it. Pushes, voids and days without a pick leave it unchanged.")
                    rulesItem("Read the numbers", "W–L and win rate use the selected time window. Win rate excludes pushes and voids. Streaks and personal bests use all settled starred picks in the selected sport, so changing a date filter doesn't reset a run.")
                    rulesItem("Same rules for everyone", "Rankings use verified picks graded by the system. Self-tracked bets and their favorites stay private and never change the public standings. Membership doesn't improve your rank.")
                    rulesItem("Ties are shared", "Total wins and the number of decided picks break ties. Players with identical ranking numbers share their place. The board is calculated across every eligible player. Your position stays visible even when you're beyond the loaded page.")
                    rulesItem("You control your visibility", "Edit your profile to leave the leaderboard at any time. Your book is still yours, and making your record private doesn't erase it.")
                }.padding(22)
            }.background(Color(hex: "#0F0D0C")).navigationTitle("How the board works").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { showRules = false }.foregroundStyle(GaryColors.gold) } }
        }.preferredColorScheme(.dark)
    }
    private func rulesItem(_ title: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(GaryFonts.text(17, .semibold)).foregroundStyle(GaryColors.gold)
            Text(text).font(GaryFonts.text(14)).foregroundStyle(.white.opacity(0.65)).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func load() async {
        let key = queryKey
        if loadedQuery != key {
            board = nil; rows = []; nextOffset = 0; profile = nil; updatedAt = nil; selectedPlayer = nil; showEditor = false
            loadedQuery = key
        }
        let request = UUID(); requestID = request
        loading = true; loadingMore = false; error = nil
        do {
            async let profileRead = auth.isAuthenticated ? try? ProfileIdentityAPI.mine() : nil
            let result = try await ProfileIdentityAPI.board(window: selectedWindow, sort: selectedSort, league: selectedLeague)
            let identity = await profileRead
            guard key == queryKey, requestID == request, !Task.isCancelled else { return }
            board = result; rows = result.rows; nextOffset = result.rows.count; profile = identity; updatedAt = Date()
            if let identity {
                myHandle = identity.profile?.name ?? ""
                if let owner = auth.currentUser?.id, favoriteAccountOwner != owner {
                    favoriteAccountOwner = owner
                    if let sports = identity.preferences?.favorite_sports, sports.count == 1 { league = sports[0] }
                }
            }
        } catch is CancellationError { return }
        catch {
            guard key == queryKey, requestID == request, !Task.isCancelled else { return }
            self.error = rows.isEmpty ? "We couldn't connect to the leaderboard. Try again in a moment." : "Showing the last standings we loaded. Refresh to see the latest rankings."
        }
        loading = false
    }
    private func loadMore() async {
        guard !loadingMore, board?.has_more == true else { return }
        let key = queryKey; let request = requestID; let offset = nextOffset
        loadingMore = true; error = nil
        do {
            let result = try await ProfileIdentityAPI.board(window: selectedWindow, sort: selectedSort, league: selectedLeague, offset: offset)
            guard key == queryKey, requestID == request, !Task.isCancelled else { return }
            var existing = Set(rows.map(\.id))
            rows += result.rows.filter { existing.insert($0.id).inserted }
            board = result
            nextOffset = offset + result.rows.count
        } catch {
            guard key == queryKey, requestID == request else { return }
            self.error = "More players couldn't load. Your current standings are still here; try again."
        }
        loadingMore = false
    }
}
