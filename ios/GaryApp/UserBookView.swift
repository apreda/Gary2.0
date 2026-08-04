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
    static let userBookEnabled = true
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

// ── Money display (founder, Jul 26: "don't do units, do money") ─────────────
// Stakes/results STORE as units (the server math is unit-based and unfakeable);
// the DISPLAY is dollars once the user tells us what a unit is worth to them.
// Until they do, units show — and the YOU page asks them right there, inline,
// never a trip to Settings.
enum BookMoney {
    static var unitDollars: Double {
        UserDefaults.standard.double(forKey: "userUnitDollars")
    }
    static var isSet: Bool { unitDollars > 0 }

    private static func dollars(_ value: Double) -> String {
        let v = (value * 100).rounded() / 100
        return v == v.rounded() ? String(format: "$%.0f", v) : String(format: "$%.2f", v)
    }

    /// A stake: "$25" once the unit is set, else "1.0u".
    static func stake(_ units: Double) -> String {
        isSet ? dollars(units * unitDollars) : String(format: "%.1fu", units)
    }

    /// A net result: "+$63" / "-$25", else "+0.63u" / "-1.00u".
    static func net(_ units: Double) -> String {
        if isSet {
            let d = units * unitDollars
            return (d >= 0 ? "+" : "-") + dollars(abs(d))
        }
        return String(format: "%+.2fu", units)
    }

    /// Ledger totals, one decimal in unit mode: "+$140" / "+1.4u".
    static func netTotal(_ units: Double) -> String {
        if isSet {
            let d = units * unitDollars
            return (d >= 0 ? "+" : "-") + dollars(abs(d))
        }
        return String(format: "%+.1fu", units)
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
            Text("Your typical bet, in dollars. Your book shows real money from then on — change it anytime in Settings.")
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
                Text(Double(amountText).map { $0 > 0 } == true ? "Save" : "Keep units for now")
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
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            // PostgREST error bodies carry {"message": "..."} — surface the
            // real reason ("game is locked") instead of a generic failure.
            let msg = (try? JSONDecoder().decode(PostgrestError.self, from: data))?.message
                ?? String(data: data, encoding: .utf8) ?? "Request failed"
            throw UserBookError.server(msg)
        }
        return data
    }

    private struct PostgrestError: Decodable { let message: String? }

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

    struct BoardRow: Codable, Identifiable {
        let display_name: String
        let wins: Int
        let losses: Int
        let pushes: Int
        let units: Double
        let best_streak: Int
        var id: String { display_name }
    }

    /// Public standings (aggregate-only RPC; anon-readable by design).
    static func fetchLeaderboard(window: String) async -> [BoardRow] {
        guard let url = URL(string: "\(Secrets.supabaseURL.absoluteString)/rest/v1/rpc/your_book_leaderboard") else { return [] }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(Secrets.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["p_window": window])
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200 else { return [] }
        return (try? JSONDecoder().decode([BoardRow].self, from: data)) ?? []
    }

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
    }

    @MainActor static func logManual(_ draft: ManualBetDraft) async throws -> UserBet {
        guard var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false) else { throw UserBookError.server("bad url") }
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
        ]
        if let o = draft.odds { payload["odds_american"] = o }
        let body = try JSONSerialization.data(withJSONObject: payload)
        var req = try authedRequest(comps.url!, method: "POST", body: body)
        req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        let data = try await run(req)
        let rows = try JSONDecoder().decode([UserBet].self, from: data)
        guard let row = rows.first else { throw UserBookError.server("insert returned nothing") }
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
            // The action block's own masthead (Aug 3 — founder: tail/fade is a
            // BIGGER part of the card back): kicker + live social proof. Hidden
            // once the game locks with no bet — never advertise an action the
            // user can no longer take.
            if mine != nil || !locked {
                HStack(spacing: 8) {
                    Text("YOUR CALL")
                        .font(GaryFonts.accent(11)).tracking(0.8)
                        .foregroundStyle(GaryColors.gold)
                    Spacer()
                    if let r = ridersLine {
                        Text(r.uppercased())
                            .font(GaryFonts.mono(9.5)).tracking(0.5)
                            .foregroundStyle(.white.opacity(0.55))
                    }
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
            tailFadeButton("TAIL GARY") { arm("tail") }
            tailFadeButton("FADE") { arm("fade") }
        }
    }

    private func tailFadeButton(_ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(GaryFonts.mono(12, bold: true)).tracking(1.4)
                .foregroundStyle(.white.opacity(0.85))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 11)
                .background(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(Color.clear)
                        .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .stroke(Color.white.opacity(0.22), lineWidth: 1))
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    private func stakePicker(_ side: String) -> some View {
        HStack(spacing: 10) {
            Text(side.uppercased())
                .font(GaryFonts.mono(11, bold: true)).tracking(1.2)
                .foregroundStyle(side == "tail" ? GaryColors.gold : Color(hex: "#8B93A7"))
            Stepper(value: $stake, in: 0.5...5, step: 0.5) {
                Text(BookMoney.stake(stake))
                    .font(GaryFonts.mono(12, bold: true))
                    .foregroundStyle(.white.opacity(0.85))
            }
            .fixedSize()
            // One play a day rides the streak — claiming it here releases any
            // other claim the user holds for the date (server-enforced).
            Button { streakOn.toggle() } label: {
                VStack(spacing: 3) {
                    Text("STREAK")
                        .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                        .foregroundStyle(streakOn ? Color(hex: "#E5844B") : .white.opacity(0.5))
                    Rectangle().fill(streakOn ? Color(hex: "#E5844B") : .clear).frame(height: 1.5)
                }
                .fixedSize()
            }
            .buttonStyle(.plain)
            Button { place(side) } label: {
                Text("Lock it in")
                    .font(GaryFonts.mono(11, bold: true))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(RoundedRectangle(cornerRadius: 6).fill(GaryColors.gold))
            }
            .buttonStyle(.plain)
            .disabled(busy)
            Button { arming = nil } label: {
                Text("Back")
                    .font(GaryFonts.mono(10))
                    .foregroundStyle(.white.opacity(0.5))
            }
            .buttonStyle(.plain)
        }
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

// ── YOUR BOOK (Billfold section) ────────────────────────────────────────────
// Two ledgers, never mixed: WITH GARY = system-graded tails/fades (the
// flagship, unfakeable number); YOUR PLAYS = self-logged bets, labeled.
struct UserBookSection: View {
    /// Compact = inline module; expanded = the Billfold YOU page (more slips,
    /// sign-in button instead of a pitch line).
    var expanded: Bool = false
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

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("YOUR BOOK")
                    .font(GaryFonts.mono(11, bold: true)).tracking(1.4)
                    .foregroundStyle(GaryColors.gold)
                Spacer()
                if withGary.contains(where: { !$0.isPending }) {
                    Button {
                        let g = record(withGary.filter { !$0.isPending })
                        // Server streak leads the card when it's alive; the
                        // ledger heater line is the fallback flavor.
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
                Button {
                    showQuickLog = true
                } label: {
                    Text("+ Log a bet")
                        .font(GaryFonts.mono(10, bold: true))
                        .foregroundStyle(.white.opacity(0.7))
                }
                .buttonStyle(.plain)
            }

            if AuthManager.shared.bearerToken == nil {
                Text("Sign in and every pick you tail or fade goes on your own record — graded by the same system that grades Gary.")
                    .font(GaryFonts.text(13))
                    .foregroundStyle(.white.opacity(0.6))
                    .fixedSize(horizontal: false, vertical: true)
                if expanded {
                    Button {
                        showAuthSheet = true
                    } label: {
                        Text("Sign in")
                            .font(GaryFonts.mono(11, bold: true)).tracking(1)
                            .foregroundStyle(.black)
                            .padding(.horizontal, 16).padding(.vertical, 8)
                            .background(RoundedRectangle(cornerRadius: 7).fill(GaryColors.gold))
                    }
                    .buttonStyle(.plain)
                }
            } else if loading {
                ProgressView().tint(.white.opacity(0.4)).frame(maxWidth: .infinity)
            } else if withGary.isEmpty && yourPlays.isEmpty {
                Text("No entries yet. Tail or fade any pick from its card — your side locks at first pitch and grades itself.")
                    .font(GaryFonts.text(13))
                    .foregroundStyle(.white.opacity(0.6))
                    .fixedSize(horizontal: false, vertical: true)
            } else if expanded {
                // The full tracker: crown, filters, records, tiles, the profit
                // line, open slips with live context, then the day ledger.
                streakCrown
                trackerFilters
                ledgerHeader
                statTiles
                if profitPoints.count >= 2 { profitChart }
                pendingBlock
                settledByDay
            } else {
                ledgerHeader
                slipsList
            }
            if expanded { UserBookLeaderboard() }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color.white.opacity(0.035)))
        .padding(.horizontal, 16)
        .task {
            guard AuthManager.shared.bearerToken != nil else { loading = false; return }
            let rows = await UserBookAPI.fetchMyBets()
            // Day-cache law: a cancelled fetch returns [] — never latch it
            // over data we already have.
            if !rows.isEmpty || bets.isEmpty { bets = rows }
            if expanded, let s = await UserBookAPI.fetchMyStreak() { streak = s }
            if expanded {
                // Live context for open slips: today's picks carry the game_id
                // bridge into live_scores (slip pick_text == pick.pick is the
                // system-wide identity). Cancellation-safe: never latch empties.
                let today = SupabaseAPI.todayEST()
                if let picks = try? await SupabaseAPI.fetchDailyPicks(date: today), !picks.isEmpty {
                    todayPicks = picks
                }
                let scores = await SupabaseAPI.fetchLiveScores(date: today)
                if !scores.isEmpty { liveScores = scores }
            }
            loading = false
            // First landing on YOUR page without a unit size: ask right here,
            // inline — never send anyone to Settings (founder, Jul 26).
            if expanded, !BookMoney.isSet, !unitPromptShownThisSession {
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

    /// THE STREAK crown — the one-play-a-day game. Server-written numbers only.
    private var streakCrown: some View {
        let todayPlay = bets.first { $0.streak_pick == true && $0.isPending }
        return HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("THE STREAK")
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                    .foregroundStyle(Color(hex: "#E5844B"))
                Text(streakStateLine(todayPlay: todayPlay))
                    .font(GaryFonts.text(13))
                    .foregroundStyle(.white.opacity(0.6))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 0) {
                Text("\(streak?.current ?? 0)")
                    .font(GaryFonts.text(30, .heavy))
                    .foregroundStyle((streak?.current ?? 0) > 0 ? Color(hex: "#E5844B") : .white.opacity(0.45))
                Text("BEST \(streak?.best ?? 0)")
                    .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
                    .foregroundStyle(.white.opacity(0.4))
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color(hex: "#E5844B").opacity(0.07)))
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

    private var ledgerHeader: some View {
        let g = record(scopedWithGary.filter { !$0.isPending })
        let m = record(scopedYourPlays.filter { !$0.isPending })
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("WITH GARY")
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                    .foregroundStyle(.white.opacity(0.5))
                Text("\(g.w)-\(g.l)\(g.p > 0 ? "-\(g.p)" : "")")
                    .font(GaryFonts.text(22, .heavy))
                    .foregroundStyle(.white.opacity(0.92))
                Text(BookMoney.netTotal(g.units))
                    .font(GaryFonts.mono(13, bold: true))
                    .foregroundStyle(g.units >= 0 ? GaryColors.win : GaryColors.loss)
                Spacer()
            }
            if !yourPlays.isEmpty {
                HStack(spacing: 10) {
                    Text("YOUR PLAYS")
                        .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                        .foregroundStyle(.white.opacity(0.4))
                    Text("\(m.w)-\(m.l)\(m.p > 0 ? "-\(m.p)" : "")")
                        .font(GaryFonts.mono(12, bold: true))
                        .foregroundStyle(.white.opacity(0.65))
                    Text(BookMoney.netTotal(m.units))
                        .font(GaryFonts.mono(11, bold: true))
                        .foregroundStyle(m.units >= 0 ? GaryColors.win.opacity(0.8) : GaryColors.loss.opacity(0.8))
                    Text("self-tracked")
                        .font(GaryFonts.mono(8.5)).tracking(0.5)
                        .foregroundStyle(.white.opacity(0.35))
                    Spacer()
                }
            }
        }
    }

    private var slipsList: some View {
        let visible = Array(bets.prefix(expanded ? 50 : 12))
        return VStack(spacing: 0) {
            ForEach(visible) { bet in
                UserBetSlipRow(bet: bet) { updated in
                    if let i = bets.firstIndex(where: { $0.id == updated.id }) { bets[i] = updated }
                } onDelete: {
                    bets.removeAll { $0.id == bet.id }
                }
                if bet.id != visible.last?.id {
                    Rectangle().fill(.white.opacity(0.05)).frame(height: 0.5)
                }
            }
        }
    }

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
    private var scopedWithGary: [UserBet] { expanded ? scopedBets.filter { $0.isVerified } : withGary }
    private var scopedYourPlays: [UserBet] { expanded ? scopedBets.filter { $0.kind == "manual" } : yourPlays }
    private var scopedSettled: [UserBet] { scopedBets.filter { !$0.isPending } }
    /// Open slips ignore the timeframe — a pending bet is always "now".
    private var openSlips: [UserBet] {
        bets.filter { $0.isPending && (kindFilter == "all" || $0.kind == kindFilter) }
            .sorted { ($0.lock_at ?? "9999") < ($1.lock_at ?? "9999") }
    }

    private var trackerFilters: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                filterChip("7D", key: "7d", group: 0)
                filterChip("30D", key: "30d", group: 0)
                filterChip("SEASON", key: "season", group: 0)
                filterChip("ALL", key: "all", group: 0)
                Spacer()
            }
            HStack(spacing: 6) {
                filterChip("EVERYTHING", key: "all", group: 1)
                filterChip("TAILS", key: "tail", group: 1)
                filterChip("FADES", key: "fade", group: 1)
                filterChip("YOUR PLAYS", key: "manual", group: 1)
                Spacer()
            }
        }
    }

    private func filterChip(_ label: String, key: String, group: Int) -> some View {
        // Underline-tab grammar — never a pill (founder law, Jul 26).
        let isOn = group == 0 ? timeframe == key : kindFilter == key
        return Button {
            if group == 0 { timeframe = key } else { kindFilter = key }
        } label: {
            VStack(spacing: 3) {
                Text(label)
                    .font(GaryFonts.mono(9, bold: true)).tracking(0.6)
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
        let oddsVals = decisive.compactMap { $0.odds_american }
        let avgOdds = oddsVals.isEmpty ? nil : oddsVals.reduce(0, +) / oddsVals.count
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

    private var profitChart: some View {
        let pts = profitPoints
        let lo = min(0, pts.min() ?? 0), hi = max(0, pts.max() ?? 0)
        let span = max(hi - lo, 0.001)
        let final = pts.last ?? 0
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("THE RIDE")
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                    .foregroundStyle(.white.opacity(0.5))
                Spacer()
                Text(BookMoney.netTotal(final))
                    .font(GaryFonts.mono(13, bold: true))
                    .foregroundStyle(final >= 0 ? GaryColors.win : GaryColors.loss)
            }
            GeometryReader { geo in
                let w = geo.size.width, h = geo.size.height
                let x = { (i: Int) in pts.count > 1 ? w * CGFloat(i) / CGFloat(pts.count - 1) : 0 }
                let y = { (v: Double) in h - h * CGFloat((v - lo) / span) }
                ZStack {
                    // zero baseline
                    Path { p in
                        p.move(to: CGPoint(x: 0, y: y(0)))
                        p.addLine(to: CGPoint(x: w, y: y(0)))
                    }
                    .stroke(Color.white.opacity(0.12), style: StrokeStyle(lineWidth: 0.5, dash: [3, 4]))
                    // area
                    Path { p in
                        p.move(to: CGPoint(x: 0, y: y(0)))
                        for (i, v) in pts.enumerated() { p.addLine(to: CGPoint(x: x(i), y: y(v))) }
                        p.addLine(to: CGPoint(x: w, y: y(0)))
                        p.closeSubpath()
                    }
                    .fill(GaryColors.gold.opacity(0.10))
                    // line
                    Path { p in
                        for (i, v) in pts.enumerated() {
                            let pt = CGPoint(x: x(i), y: y(v))
                            i == 0 ? p.move(to: pt) : p.addLine(to: pt)
                        }
                    }
                    .stroke(GaryColors.gold, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                }
            }
            .frame(height: 72)
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.white.opacity(0.03)))
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
            if mine != nil || !locked {
                HStack(spacing: 8) {
                    BroadcastBar(tint: GaryColors.silver, height: 10)
                    Text("YOUR CALL")
                        .font(GaryFonts.accent(11)).tracking(0.8)
                        .foregroundStyle(GaryColors.silver)
                    Spacer()
                }
            }
            if let bet = mine {
                placedChip(bet)
            } else if locked {
                EmptyView()
            } else if let side = arming {
                stakePicker(side)
            } else {
                HStack(spacing: 8) {
                    bigButton("TAIL GARY", tint: GaryColors.silverLight, solid: true) { arm("tail") }
                    bigButton("FADE", tint: Color(hex: "#8B93A7"), solid: false) { arm("fade") }
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

    private func bigButton(_ label: String, tint: Color, solid: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(GaryFonts.mono(12, bold: true)).tracking(1.4)
                .foregroundStyle(solid ? GaryColors.ink : tint)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 11)
                .background(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(solid ? GaryColors.silverLight : Color.clear)
                        .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .stroke(tint.opacity(solid ? 0 : 0.55), lineWidth: 1))
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    private func stakePicker(_ side: String) -> some View {
        HStack(spacing: 10) {
            Text(side.uppercased())
                .font(GaryFonts.mono(11, bold: true)).tracking(1.2)
                .foregroundStyle(side == "tail" ? GaryColors.silverLight : Color(hex: "#8B93A7"))
            Stepper(value: $stake, in: 0.5...5, step: 0.5) {
                Text(BookMoney.stake(stake))
                    .font(GaryFonts.mono(12, bold: true))
                    .foregroundStyle(.white.opacity(0.85))
            }
            .fixedSize()
            Button { place(side) } label: {
                Text("Lock it in")
                    .font(GaryFonts.mono(11, bold: true))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(RoundedRectangle(cornerRadius: 6).fill(GaryColors.silverLight))
            }
            .buttonStyle(.plain)
            .disabled(busy)
            Button { arming = nil } label: {
                Text("Back")
                    .font(GaryFonts.mono(10))
                    .foregroundStyle(.white.opacity(0.5))
            }
            .buttonStyle(.plain)
        }
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
                mine = try await UserBookAPI.placePropBet(
                    gameDate: dateStr, player: player, propType: propToken, kind: side, stake: stake)
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
            Text(kindLabel)
                .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
                .foregroundStyle(bet.kind == "fade" ? Color(hex: "#8B93A7") : GaryColors.gold)
                .frame(width: 38, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(bet.pick_text)
                    .font(GaryFonts.text(13))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(2).minimumScaleFactor(0.8)
                    .fixedSize(horizontal: false, vertical: true)
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

// ── Quick-log sheet (manual outside bets) ───────────────────────────────────
struct QuickLogSheet: View {
    var onLogged: (UserBet) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var draft = UserBookAPI.ManualBetDraft()
    @State private var oddsText = ""
    @State private var busy = false
    @State private var errorText: String? = nil
    private let leagues = ["MLB", "NFL", "NBA", "NHL", "OTHER"]

    var body: some View {
        NavigationStack {
            Form {
                Section("The bet") {
                    Picker("League", selection: $draft.league) {
                        ForEach(leagues, id: \.self) { Text($0) }
                    }
                    TextField("What did you bet? (Yankees ML, Over 8.5, a parlay)", text: $draft.description, axis: .vertical)
                    TextField("Odds (American, like -120 or +145)", text: $oddsText)
                        .keyboardType(.numbersAndPunctuation)
                    Stepper(value: $draft.stake, in: 0.5...10, step: 0.5) {
                        Text("Stake: \(BookMoney.stake(draft.stake))")
                    }
                }
                if let e = errorText { Section { Text(e).foregroundStyle(.red) } }
                Section {
                    Button(busy ? "Saving" : "Add to Your Plays") { save() }
                        .disabled(busy || draft.description.trimmingCharacters(in: .whitespaces).isEmpty)
                } footer: {
                    Text("Self-tracked entries stay in YOUR PLAYS — separate from your verified record with Gary.")
                }
            }
            .navigationTitle("Log a bet")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
    }

    private func save() {
        draft.odds = Int(oddsText.replacingOccurrences(of: "+", with: ""))
        busy = true
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
                Text("betwithgary.ai")
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

// ── LEADERBOARD (YOU page) ──────────────────────────────────────────────────
// Standings nobody can fake: verified tail/fade ledgers only, opt-in by
// handle, five decided plays to appear. Units are the board's shared
// currency (a viewer's own dollar setting never re-prices someone else).
struct UserBookLeaderboard: View {
    @State private var window = "30d"
    @State private var rows: [UserBookAPI.BoardRow] = []
    @State private var myHandle: String? = nil
    @State private var checkedHandle = false
    @State private var showClaim = false
    private let windows = [("7d", "7D"), ("30d", "30D"), ("season", "SEASON")]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Text("LEADERBOARD")
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                    .foregroundStyle(.white.opacity(0.5))
                Spacer()
                ForEach(windows, id: \.0) { w in
                    Button {
                        window = w.0
                        Task { await load(force: true) }
                    } label: {
                        VStack(spacing: 3) {
                            Text(w.1)
                                .font(GaryFonts.mono(9, bold: true)).tracking(0.6)
                                .foregroundStyle(window == w.0 ? GaryColors.gold : .white.opacity(0.5))
                            Rectangle().fill(window == w.0 ? GaryColors.gold : .clear).frame(height: 1.5)
                        }
                        .fixedSize()
                    }
                    .buttonStyle(.plain)
                }
            }

            if rows.isEmpty {
                Text("Standings appear once verified books cross five graded plays. Yours can be first.")
                    .font(GaryFonts.text(12.5))
                    .foregroundStyle(.white.opacity(0.5))
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(rows.prefix(10).enumerated()), id: \.element.id) { i, r in
                        HStack(spacing: 10) {
                            Text("\(i + 1)")
                                .font(GaryFonts.mono(10, bold: true))
                                .foregroundStyle(i == 0 ? GaryColors.gold : .white.opacity(0.45))
                                .frame(width: 18, alignment: .leading)
                            Text(r.display_name)
                                .font(GaryFonts.text(13, .semibold))
                                .foregroundStyle(r.display_name == myHandle ? GaryColors.gold : .white.opacity(0.88))
                                .lineLimit(1)
                            if r.best_streak >= 3 {
                                Text("BEST \(r.best_streak)")
                                    .font(GaryFonts.mono(8, bold: true)).tracking(0.6)
                                    .foregroundStyle(Color(hex: "#E5844B").opacity(0.85))
                            }
                            Spacer()
                            Text("\(r.wins)-\(r.losses)")
                                .font(GaryFonts.mono(11, bold: true))
                                .foregroundStyle(.white.opacity(0.6))
                            Text(String(format: "%+.1fu", r.units))
                                .font(GaryFonts.mono(11, bold: true))
                                .foregroundStyle(r.units >= 0 ? GaryColors.win : GaryColors.loss)
                                .frame(width: 52, alignment: .trailing)
                        }
                        .padding(.vertical, 6)
                        if i < min(rows.count, 10) - 1 {
                            Rectangle().fill(.white.opacity(0.04)).frame(height: 0.5)
                        }
                    }
                }
            }

            if checkedHandle, myHandle == nil, AuthManager.shared.bearerToken != nil {
                Button {
                    showClaim = true
                } label: {
                    Text("Claim a handle to enter the standings")
                        .font(GaryFonts.mono(10, bold: true)).tracking(0.5)
                        .foregroundStyle(GaryColors.gold)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 6)
        .task { await load(force: false) }
        .sheet(isPresented: $showClaim) {
            HandleClaimSheet { claimed in myHandle = claimed }
        }
    }

    private func load(force: Bool) async {
        let fresh = await UserBookAPI.fetchLeaderboard(window: window)
        // Cancellation guard: never latch an empty result over live rows
        // unless this is an explicit window switch.
        if force || !fresh.isEmpty || rows.isEmpty { rows = fresh }
        if !checkedHandle, AuthManager.shared.bearerToken != nil {
            myHandle = await UserBookAPI.fetchMyHandle()
            checkedHandle = true
        } else if AuthManager.shared.bearerToken == nil {
            checkedHandle = true
        }
    }
}

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
                onClaimed(claimed)
                dismiss()
            } catch {
                errorText = error.localizedDescription
            }
        }
    }
}
