import SwiftUI

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE EXPERIENCE — user flow Phase 2 (owned build, Aug 10 2026).
//
// The relationship no tracker can copy: your record exists IN RELATION to
// Gary's. Three surfaces, one file:
//   VsGaryCard      — you vs Gary on the same picks, the month's headline
//   PatternsCard    — self-knowledge: tail/fade splits, after-a-loss truth
//   LeaderboardView — the honest board: units/net-wins, rolling window,
//                     minimum-graded floor; opens as an invitation, never
//                     an empty ladder
// Plus IdentityEditorSheet (handle · avatar · bio) writing update_my_profile.
//
// Design language: the Quant Terminal — dark #0F0D0C ground, cardBg panels,
// gold accents, GaryFonts throughout. Outline cards render whole. No
// ellipsis truncation anywhere, ever.
// ═══════════════════════════════════════════════════════════════════════════

// MARK: - API

enum ProfileFlowAPI {
    struct LeaderRow: Decodable, Identifiable {
        let rank: Int
        let user_id: String
        let display_name: String
        let handle: String?
        let avatar: String?
        let graded: Int
        let wins: Int
        let losses: Int
        let units: Double?
        var id: String { user_id }
    }

    struct Split: Decodable {
        let graded: Int
        let wins: Int
        let losses: Int
    }

    struct GarySame: Decodable { let wins: Int; let losses: Int }
    struct StreakBox: Decodable { let current: Int?; let best: Int? }
    struct LoggedBox: Decodable { let graded: Int; let wins: Int; let losses: Int; let units: Double }
    struct ProfileBox: Decodable { let display_name: String?; let handle: String?; let avatar: String?; let bio: String? }

    struct Card: Decodable {
        let profile: ProfileBox?
        let graded: Int
        let wins: Int
        let losses: Int
        let tail: Split
        let fade: Split
        let gary_on_same_picks: GarySame
        let after_loss: Split
        let streak: StreakBox?
        let logged: LoggedBox
    }

    private static func rpc(_ name: String, _ body: [String: Any]) async throws -> Data {
        let url = Secrets.supabaseURL.appendingPathComponent("rest/v1/rpc/\(name)")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        let token = AuthManager.shared.bearerToken ?? Secrets.supabaseAnonKey
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200...299).contains(status) else { throw URLError(.badServerResponse) }
        return data
    }

    static func leaderboard(lane: String, days: Int = 30, minGraded: Int = 5) async -> [LeaderRow] {
        guard let data = try? await rpc("leaderboard", ["p_lane": lane, "p_days": days, "p_min_graded": minGraded]) else { return [] }
        return (try? JSONDecoder().decode([LeaderRow].self, from: data)) ?? []
    }

    static func card(userId: String, days: Int = 30) async -> Card? {
        guard let data = try? await rpc("profile_card", ["p_user": userId, "p_days": days]) else { return nil }
        return try? JSONDecoder().decode(Card.self, from: data)
    }

    static func updateProfile(handle: String?, avatar: String?, bio: String?) async -> Bool {
        var body: [String: Any] = [:]
        if let handle, !handle.isEmpty { body["p_handle"] = handle }
        if let avatar, !avatar.isEmpty { body["p_avatar"] = avatar }
        if let bio, !bio.isEmpty { body["p_bio"] = bio }
        guard let data = try? await rpc("update_my_profile", body),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        return (obj["ok"] as? Bool) ?? false
    }
}

// MARK: - The section dropped into ProfileView (one-line insertion)

struct ProfileFlowSection: View {
    let userId: String?
    @State private var card: ProfileFlowAPI.Card?
    @State private var loaded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let card {
                VsGaryCard(card: card)
                PatternsCard(card: card)
            } else if loaded {
                unlockPitch
            }
            NavigationLink { LeaderboardView() } label: { leaderboardEntry }
                .buttonStyle(.plain)
        }
        .task {
            guard let userId, card == nil else { loaded = true; return }
            card = await ProfileFlowAPI.card(userId: userId)
            loaded = true
        }
    }

    private var unlockPitch: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("YOUR NUMBERS")
                .font(GaryFonts.kicker())
                .foregroundColor(GaryColors.silverDim)
            Text("Ride or fade tonight's picks and your record against Gary starts here.")
                .font(GaryFonts.text(14))
                .foregroundColor(GaryColors.silver)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14).fill(GaryColors.cardBg))
    }

    private var leaderboardEntry: some View {
        HStack(spacing: 12) {
            Text("🏆").font(.system(size: 22))
            VStack(alignment: .leading, spacing: 2) {
                Text("THE LEADERBOARD")
                    .font(GaryFonts.kicker())
                    .foregroundColor(GaryColors.gold)
                Text("Tailers, faders, and loggers — ranked for real")
                    .font(GaryFonts.text(13))
                    .foregroundColor(GaryColors.silver)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(GaryColors.silverDim)
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 14).fill(GaryColors.cardBg))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(GaryColors.glassBorder, lineWidth: 1))
    }
}

// MARK: - You vs Gary

struct VsGaryCard: View {
    let card: ProfileFlowAPI.Card

    private var youNet: Int { card.wins - card.losses }
    private var garyNet: Int { card.gary_on_same_picks.wins - card.gary_on_same_picks.losses }

    private var headline: String {
        guard card.graded > 0 else { return "Make your first calls and the scoreboard starts." }
        if youNet > garyNet { return "You're ahead of Gary on your picks this month." }
        if youNet < garyNet { return "Gary's ahead on your picks this month." }
        return "Dead even with Gary this month."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("YOU vs GARY — LAST 30 DAYS")
                .font(GaryFonts.kicker())
                .foregroundColor(GaryColors.silverDim)
            HStack(spacing: 0) {
                recordColumn(title: "YOU", wins: card.wins, losses: card.losses, tint: GaryColors.gold)
                Rectangle().fill(GaryColors.glassBorder).frame(width: 1, height: 44)
                recordColumn(title: "GARY", subtitle: "on your picks",
                             wins: card.gary_on_same_picks.wins,
                             losses: card.gary_on_same_picks.losses,
                             tint: GaryColors.silverLight)
            }
            Text(headline)
                .font(GaryFonts.text(13.5, .medium))
                .foregroundColor(GaryColors.silver)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14).fill(GaryColors.cardBg))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(GaryColors.glassBorder, lineWidth: 1))
    }

    private func recordColumn(title: String, subtitle: String? = nil, wins: Int, losses: Int, tint: Color) -> some View {
        VStack(spacing: 3) {
            Text(title).font(GaryFonts.kicker()).foregroundColor(GaryColors.silverDim)
            Text("\(wins)-\(losses)")
                .font(GaryFonts.data(26, .bold))
                .foregroundColor(tint)
            if let subtitle {
                Text(subtitle).font(GaryFonts.text(10.5)).foregroundColor(GaryColors.silverDim)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Your patterns

struct PatternsCard: View {
    let card: ProfileFlowAPI.Card

    private var hasEnough: Bool { card.graded >= 5 }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("YOUR PATTERNS")
                .font(GaryFonts.kicker())
                .foregroundColor(GaryColors.silverDim)
            if hasEnough {
                patternRow(label: "Riding Gary", split: card.tail)
                patternRow(label: "Fading Gary", split: card.fade)
                if card.after_loss.graded > 0 {
                    patternRow(label: "Right after a loss", split: card.after_loss)
                }
                if card.logged.graded > 0 {
                    HStack {
                        Text("Your own bets").font(GaryFonts.text(13.5)).foregroundColor(GaryColors.silver)
                        Spacer(minLength: 0)
                        Text("\(card.logged.wins)-\(card.logged.losses) · \(card.logged.units >= 0 ? "+" : "")\(String(format: "%.1f", card.logged.units))u")
                            .font(GaryFonts.data(14, .semibold))
                            .foregroundColor(card.logged.units >= 0 ? GaryColors.gold : GaryColors.silverDim)
                    }
                }
                if let streak = card.streak, let best = streak.best, best > 1 {
                    HStack {
                        Text("Best streak").font(GaryFonts.text(13.5)).foregroundColor(GaryColors.silver)
                        Spacer(minLength: 0)
                        Text("\(best) straight")
                            .font(GaryFonts.data(14, .semibold))
                            .foregroundColor(GaryColors.gold)
                    }
                }
            } else {
                Text("Five graded picks unlock your patterns — the splits every bettor should know about themselves.")
                    .font(GaryFonts.text(13.5))
                    .foregroundColor(GaryColors.silver)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14).fill(GaryColors.cardBg))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(GaryColors.glassBorder, lineWidth: 1))
    }

    private func patternRow(label: String, split: ProfileFlowAPI.Split) -> some View {
        HStack {
            Text(label).font(GaryFonts.text(13.5)).foregroundColor(GaryColors.silver)
            Spacer(minLength: 0)
            if split.graded > 0 {
                Text("\(split.wins)-\(split.losses)")
                    .font(GaryFonts.data(14, .semibold))
                    .foregroundColor(split.wins >= split.losses ? GaryColors.gold : GaryColors.silverDim)
            } else {
                Text("no calls yet")
                    .font(GaryFonts.text(12.5))
                    .foregroundColor(GaryColors.silverDim)
            }
        }
    }
}

// MARK: - The Leaderboard

struct LeaderboardView: View {
    @State private var lane = "tail"
    @State private var rows: [ProfileFlowAPI.LeaderRow] = []
    @State private var loading = true

    private let lanes: [(key: String, label: String)] = [
        ("tail", "TAILERS"), ("fade", "FADERS"), ("log", "LOGGERS"),
    ]

    var body: some View {
        ZStack {
            Color(hex: "#0F0D0C").ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    lanePicker
                    if loading {
                        ProgressView().tint(GaryColors.gold).frame(maxWidth: .infinity).padding(.top, 40)
                    } else if rows.isEmpty {
                        openBoard
                    } else {
                        VStack(spacing: 8) {
                            ForEach(rows) { row in LeaderRowView(row: row, lane: lane) }
                        }
                        floorNote
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
        }
        .navigationTitle("")
        .task(id: lane) {
            loading = true
            rows = await ProfileFlowAPI.leaderboard(lane: lane)
            loading = false
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("THE LEADERBOARD")
                .font(GaryFonts.display(24))
                .foregroundColor(GaryColors.cream)
            Text("Rolling 30 days. Ranked by what actually cashed.")
                .font(GaryFonts.text(13))
                .foregroundColor(GaryColors.silverDim)
        }
    }

    private var lanePicker: some View {
        HStack(spacing: 8) {
            ForEach(lanes, id: \.key) { l in
                Button {
                    lane = l.key
                } label: {
                    Text(l.label)
                        .font(GaryFonts.kicker(11, .bold))
                        .foregroundColor(lane == l.key ? GaryColors.ink : GaryColors.silver)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(
                            Capsule().fill(lane == l.key ? AnyShapeStyle(GaryColors.goldGradient) : AnyShapeStyle(GaryColors.elevatedBg))
                        )
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
    }

    private var openBoard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("THE BOARD IS OPEN")
                .font(GaryFonts.kicker())
                .foregroundColor(GaryColors.gold)
            Text(lane == "log"
                 ? "Log five bets and you're ranked by real units. First on the board owns it."
                 : "Five graded calls on Gary's picks puts you on the board. Nobody's claimed it yet.")
                .font(GaryFonts.text(14))
                .foregroundColor(GaryColors.silver)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14).fill(GaryColors.cardBg))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(GaryColors.glassBorder, lineWidth: 1))
        .padding(.top, 12)
    }

    private var floorNote: some View {
        Text("Minimum five graded to rank — nobody tops this board on three lucky favorites.")
            .font(GaryFonts.text(11.5))
            .foregroundColor(GaryColors.silverDim)
            .padding(.top, 6)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct LeaderRowView: View {
    let row: ProfileFlowAPI.LeaderRow
    let lane: String

    private var rankTint: Color {
        switch row.rank {
        case 1: return GaryColors.gold
        case 2: return GaryColors.silverLight
        case 3: return Color(hex: "#B08D57")
        default: return GaryColors.silverDim
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            Text("\(row.rank)")
                .font(GaryFonts.data(15, .bold))
                .foregroundColor(rankTint)
                .frame(width: 26, alignment: .center)
            Text(row.avatar ?? "🎲").font(.system(size: 20))
            VStack(alignment: .leading, spacing: 1) {
                Text(row.display_name)
                    .font(GaryFonts.text(14.5, .semibold))
                    .foregroundColor(GaryColors.cream)
                    .fixedSize(horizontal: false, vertical: true)
                if let handle = row.handle {
                    Text("@\(handle)")
                        .font(GaryFonts.text(11.5))
                        .foregroundColor(GaryColors.silverDim)
                }
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 1) {
                if lane == "log", let units = row.units {
                    Text("\(units >= 0 ? "+" : "")\(String(format: "%.1f", units))u")
                        .font(GaryFonts.data(15, .bold))
                        .foregroundColor(units >= 0 ? GaryColors.gold : GaryColors.silverDim)
                } else {
                    Text("\(row.wins)-\(row.losses)")
                        .font(GaryFonts.data(15, .bold))
                        .foregroundColor(GaryColors.cream)
                }
                Text("\(row.graded) graded")
                    .font(GaryFonts.text(10.5))
                    .foregroundColor(GaryColors.silverDim)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .background(RoundedRectangle(cornerRadius: 12).fill(GaryColors.cardBg))
    }
}

// MARK: - Identity editor

struct IdentityEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State var handle: String = ""
    @State var avatar: String = "🎲"
    @State var bio: String = ""
    @State private var saving = false
    @State private var errorText: String? = nil
    var onSaved: () -> Void = {}

    private let avatars = ["🎲", "🔥", "🐻", "🦅", "⚡️", "🏆", "🧊", "🎯", "🐴", "💎", "🌪️", "🃏"]

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "#0F0D0C").ignoresSafeArea()
                VStack(alignment: .leading, spacing: 20) {
                    Text("YOUR IDENTITY")
                        .font(GaryFonts.kicker())
                        .foregroundColor(GaryColors.silverDim)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: 10) {
                        ForEach(avatars, id: \.self) { a in
                            Text(a)
                                .font(.system(size: 26))
                                .padding(8)
                                .background(Circle().fill(a == avatar ? GaryColors.elevatedBg : Color.clear))
                                .overlay(Circle().stroke(a == avatar ? GaryColors.gold : Color.clear, lineWidth: 1.5))
                                .onTapGesture { avatar = a }
                        }
                    }
                    TextField("handle", text: $handle)
                        .font(GaryFonts.text(15))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 10).fill(GaryColors.cardBg))
                        .foregroundColor(GaryColors.cream)
                    TextField("one line about your betting brain", text: $bio, axis: .vertical)
                        .font(GaryFonts.text(14))
                        .lineLimit(2, reservesSpace: true)
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 10).fill(GaryColors.cardBg))
                        .foregroundColor(GaryColors.cream)
                    if let errorText {
                        Text(errorText)
                            .font(GaryFonts.text(12.5))
                            .foregroundColor(Color(hex: "#C96A5A"))
                    }
                    Spacer(minLength: 0)
                    Button {
                        Task {
                            saving = true
                            let ok = await ProfileFlowAPI.updateProfile(handle: handle, avatar: avatar, bio: bio)
                            saving = false
                            if ok { onSaved(); dismiss() } else { errorText = "That handle is taken — try another." }
                        }
                    } label: {
                        Text(saving ? "SAVING" : "SAVE")
                            .font(GaryFonts.kicker(12, .bold))
                            .foregroundColor(GaryColors.ink)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Capsule().fill(GaryColors.goldGradient))
                    }
                    .buttonStyle(.plain)
                    .disabled(saving)
                }
                .padding(20)
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }.foregroundColor(GaryColors.silver)
                }
            }
        }
    }
}
