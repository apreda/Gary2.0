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
            HStack(spacing: 8) {
                ForEach(quick, id: \.self) { amt in
                    Button {
                        amountText = String(format: "%.0f", amt)
                    } label: {
                        Text("$\(Int(amt))")
                            .font(GaryFonts.mono(12, bold: true))
                            .foregroundStyle(amountText == String(format: "%.0f", amt) ? .black : .white.opacity(0.75))
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(Capsule().fill(amountText == String(format: "%.0f", amt) ? GaryColors.gold : Color.white.opacity(0.08)))
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
        VStack(alignment: .leading, spacing: 6) {
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
                    .foregroundStyle(Color(hex: "#EF4444").opacity(0.9))
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
        HStack(spacing: 8) {
            tailFadeButton("TAIL", tint: GaryColors.gold) { arm("tail") }
            tailFadeButton("FADE", tint: Color(hex: "#8B93A7")) { arm("fade") }
            Spacer()
            Text(ridersLine ?? "On the record at lock")
                .font(GaryFonts.mono(9))
                .foregroundStyle(.white.opacity(0.38))
        }
    }

    private func tailFadeButton(_ label: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(GaryFonts.mono(11, bold: true)).tracking(1.2)
                .foregroundStyle(tint)
                .padding(.horizontal, 14).padding(.vertical, 7)
                .background(RoundedRectangle(cornerRadius: 6).stroke(tint.opacity(0.55), lineWidth: 1))
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
                Text("STREAK")
                    .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                    .foregroundStyle(streakOn ? .black : .white.opacity(0.55))
                    .padding(.horizontal, 8).padding(.vertical, 5)
                    .background(Capsule().fill(streakOn ? Color(hex: "#E5844B") : Color.white.opacity(0.08)))
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
                .font(GaryFonts.mono(10, bold: true)).tracking(1)
                .foregroundStyle(tint)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(RoundedRectangle(cornerRadius: 6).fill(tint.opacity(0.12)))
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
            .foregroundStyle(wash ? .white.opacity(0.5) : (won ? Color(hex: "#22C55E") : Color(hex: "#EF4444")))
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
            } else {
                if expanded { streakCrown }
                ledgerHeader
                slipsList
            }
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
        let g = record(withGary.filter { !$0.isPending })
        let m = record(yourPlays.filter { !$0.isPending })
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
                    .foregroundStyle(g.units >= 0 ? Color(hex: "#22C55E") : Color(hex: "#EF4444"))
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
                        .foregroundStyle(m.units >= 0 ? Color(hex: "#22C55E").opacity(0.8) : Color(hex: "#EF4444").opacity(0.8))
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
                gradeChip("W", "won", Color(hex: "#22C55E"))
                gradeChip("L", "lost", Color(hex: "#EF4444"))
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
                .foregroundStyle(wash ? .white.opacity(0.45) : (won ? Color(hex: "#22C55E") : Color(hex: "#EF4444")))
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
                    .foregroundStyle(record.units >= 0 ? Color(hex: "#22C55E") : Color(hex: "#EF4444"))
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
