import SwiftUI

/// Identity is account-scoped on the server. Only the handle and avatar are
/// cached for header chrome; a full profile is never restored across accounts.
enum ProfileIdentityAPI {
    struct Identity: Decodable {
        let user_id: String?
        let display_name: String?
        let handle: String?
        let avatar: String?
        let bio: String?
        let leaderboard_visible: Bool?
        var name: String { handle ?? display_name ?? "" }
        var isPublic: Bool { leaderboard_visible == true }
    }

    struct Preferences: Decodable {
        let favorite_sports: [String]?
        let unit_value: Double?
    }

    struct Snapshot: Decodable {
        let ok: Bool?
        let profile: Identity?
        let preferences: Preferences?
    }

    struct Split: Decodable {
        let graded: Int?
        let wins: Int
        let losses: Int
        var record: String { "\(wins)–\(losses)" }
    }

    struct Streak: Decodable { let current: Int?; let best: Int? }
    struct PublicCard: Decodable {
        let profile: Identity?
        let graded: Int
        let wins: Int
        let losses: Int
        let tail: Split
        let fade: Split
        let streak: Streak?
    }

    struct BoardRow: Decodable, Identifiable {
        let rank: Int
        let user_id: String
        let display_name: String
        let handle: String?
        let avatar: String?
        let wins: Int
        let losses: Int
        let pushes: Int
        let units: Double
        let win_pct: Double
        let streak_len: Int
        let streak_kind: String
        let best_streak: Int
        let decided: Int
        var id: String { user_id }
        var name: String { handle ?? display_name }
        var record: String { "\(wins)–\(losses)" }
        var streakLabel: String { streak_len > 0 ? "\(streak_kind)\(streak_len)" : "—" }
    }

    struct Board: Decodable {
        let rows: [BoardRow]
        let me: BoardRow?
        let qualified_count: Int
        let min_decided: Int
        let my_decided: Int
        let window: String
        let sort: String
        let league: String
        let has_more: Bool
    }

    @MainActor static func request<T: Decodable>(_ name: String, body: [String: Any] = [:], authenticated: Bool = true) async throws -> T {
        if authenticated, AuthManager.shared.bearerToken == nil { throw UserBookError.notSignedIn }
        let owner = AuthManager.shared.currentUser?.id
        var request = URLRequest(url: Secrets.supabaseRESTOriginURL.appendingPathComponent("rest/v1/rpc/\(name)"))
        request.httpMethod = "POST"
        request.timeoutInterval = 25
        request.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(AuthManager.shared.bearerToken ?? Secrets.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        var (data, response) = try await URLSession.shared.data(for: request)
        if (response as? HTTPURLResponse)?.statusCode == 401,
           let renewed = await AuthManager.shared.renewSessionIfPossible() {
            guard owner == AuthManager.shared.currentUser?.id else { throw CancellationError() }
            request.setValue("Bearer \(renewed)", forHTTPHeaderField: "Authorization")
            (data, response) = try await URLSession.shared.data(for: request)
        }
        guard owner == AuthManager.shared.currentUser?.id else { throw CancellationError() }
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        guard let status = (response as? HTTPURLResponse)?.statusCode, (200...299).contains(status), object?["ok"] as? Bool != false else {
            let diagnostic = ((object?["error"] ?? object?["message"]) as? String ?? "").lowercased()
            if diagnostic.contains("taken") { throw UserBookError.server("That handle is already taken. Try another.") }
            if diagnostic.contains("reserved") { throw UserBookError.server("That handle is reserved. Try another.") }
            if diagnostic.contains("handle") { throw UserBookError.server("Use 3–18 letters, numbers, or underscores for your handle.") }
            if diagnostic.contains("private") || diagnostic.contains("not found") { throw UserBookError.server("This player is keeping their profile private.") }
            throw UserBookError.server("We couldn't load or save your profile right now. Please try again.")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    @MainActor static func mine() async throws -> Snapshot { try await request("get_my_profile") }

    @MainActor static func save(handle: String, avatar: String, bio: String, visible: Bool, sports: [String], unitValue: Double?) async throws -> Snapshot {
        var payload: [String: Any] = ["p_avatar": avatar, "p_bio": bio,
            "p_leaderboard_visible": visible, "p_favorite_sports": sports]
        if !handle.isEmpty { payload["p_handle"] = handle }
        payload["p_unit_value"] = unitValue ?? 0
        return try await request("save_my_profile", body: payload)
    }

    @MainActor static func board(window: String, sort: String, league: String, offset: Int = 0) async throws -> Board {
        try await request("your_book_leaderboard_v3", body: ["p_window": window, "p_sort": sort, "p_league": league, "p_limit": 50, "p_offset": offset], authenticated: false)
    }

    @MainActor static func card(userID: String) async throws -> PublicCard {
        try await request("profile_card", body: ["p_user": userID, "p_days": 30], authenticated: false)
    }

    @MainActor static func cache(_ snapshot: Snapshot) {
        UserDefaults.standard.set(snapshot.profile?.name ?? "", forKey: "myHandle")
        UserDefaults.standard.set(snapshot.profile?.avatar ?? "initials", forKey: "myProfileAvatar")
        if let unit = snapshot.preferences?.unit_value, unit > 0 {
            UserDefaults.standard.set(unit, forKey: "userUnitDollars")
        } else {
            UserDefaults.standard.removeObject(forKey: "userUnitDollars")
        }
        if let sports = snapshot.preferences?.favorite_sports {
            UserDefaults.standard.set(sports.count == 1 ? sports[0] : "all", forKey: "bookBoardLeague")
        }
        NotificationCenter.default.post(name: Notification.Name("GaryProfileUpdated"), object: nil)
    }
}

struct ProfileAvatar: View {
    let name: String
    var symbol: String? = nil
    var size: CGFloat = 48
    static let choices = ["initials", "flame.fill", "baseball.fill", "basketball.fill", "football.fill", "bolt.fill", "target", "crown.fill"]

    var body: some View {
        ZStack {
            Circle().fill(GaryColors.gold.opacity(0.09))
            Circle().stroke(GaryColors.gold.opacity(0.25), lineWidth: 1)
            if let symbol, Self.choices.contains(symbol), symbol != "initials" {
                Image(systemName: symbol).font(.system(size: size * 0.38, weight: .semibold))
            } else if let first = name.first {
                Text(String(first).uppercased()).font(GaryFonts.mono(size * 0.42, bold: true))
            } else {
                Image(systemName: "person.fill").font(.system(size: size * 0.38, weight: .medium))
            }
        }
        .foregroundStyle(GaryColors.gold)
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct ProfileMetric: View {
    let label: String
    let value: String
    var detail: String? = nil
    var tint: Color = GaryColors.warmWhite

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(GaryFonts.mono(9, bold: true)).tracking(0.8).foregroundStyle(.white.opacity(0.45))
            Text(value).font(GaryFonts.mono(24, bold: true)).foregroundStyle(tint).lineLimit(1).minimumScaleFactor(0.65)
            if let detail { Text(detail).font(GaryFonts.text(11)).foregroundStyle(.white.opacity(0.5)).fixedSize(horizontal: false, vertical: true) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct ProfileNotice: View {
    let title: String
    let message: String
    var icon = "wifi.exclamationmark"
    var retry: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Label(title, systemImage: icon).font(GaryFonts.text(15, .semibold)).foregroundStyle(GaryColors.gold)
            Text(message).font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.65)).fixedSize(horizontal: false, vertical: true)
            if let retry { Button("Try again", action: retry).font(GaryFonts.text(13, .semibold)).foregroundStyle(GaryColors.gold).padding(.vertical, 5) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16).background(RoundedRectangle(cornerRadius: 14).fill(GaryColors.cardBg))
    }
}

struct ProfileEditorSheet: View {
    let snapshot: ProfileIdentityAPI.Snapshot?
    let onSaved: (ProfileIdentityAPI.Snapshot) -> Void
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var auth = AuthManager.shared
    @State private var handle = ""
    @State private var avatar = "initials"
    @State private var bio = ""
    @State private var visible = false
    @State private var sports: Set<String> = []
    @State private var unitText = ""
    @State private var saving = false
    @State private var error: String?
    @State private var ownerID: String?

    private var cleanHandle: String { handle.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var handleValid: Bool { cleanHandle.range(of: "^[A-Za-z0-9_]{3,18}$", options: .regularExpression) != nil }
    private var unitValid: Bool { unitText.isEmpty || (Double(unitText).map { $0.isFinite && $0 > 0 && $0 <= 100_000 } == true) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    HStack { Spacer(); ProfileAvatar(name: cleanHandle, symbol: avatar, size: 76); Spacer() }
                    editorSection("MAKE IT YOURS") {
                        TextField("Your handle", text: $handle)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .font(GaryFonts.text(18, .semibold)).padding(13).background(fieldBackground)
                            .accessibilityLabel("Public handle")
                        Text("3–18 letters, numbers, or underscores. Your email never appears on the board.")
                            .font(GaryFonts.text(12)).foregroundStyle(.white.opacity(0.5))
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 12) {
                            ForEach(ProfileAvatar.choices, id: \.self) { symbol in
                                Button { avatar = symbol } label: {
                                    ProfileAvatar(name: cleanHandle, symbol: symbol, size: 48)
                                        .padding(4).overlay(Circle().stroke(avatar == symbol ? GaryColors.gold : .clear, lineWidth: 2))
                                }.buttonStyle(.plain).accessibilityLabel(symbol == "initials" ? "Initial avatar" : symbol.replacingOccurrences(of: ".fill", with: "") + " avatar")
                                    .accessibilityAddTraits(avatar == symbol ? .isSelected : [])
                            }
                        }
                        TextField("A little about your game", text: $bio, axis: .vertical)
                            .lineLimit(3...5).font(GaryFonts.text(14)).padding(13).background(fieldBackground)
                            .onChange(of: bio) { value in if value.count > 160 { bio = String(value.prefix(160)) } }
                        Text("\(bio.count)/160").font(GaryFonts.mono(10)).foregroundStyle(.white.opacity(0.4)).frame(maxWidth: .infinity, alignment: .trailing)
                    }
                    editorSection("YOUR PUBLIC RECORD") {
                        Toggle(isOn: $visible) {
                            Text("Appear on the leaderboard").font(GaryFonts.text(15, .semibold))
                        }.tint(GaryColors.gold)
                        Text("When on, your handle, avatar, bio and verified record are public. Your bet amounts, notes, favorites and self-tracked bets stay private. You can leave the board anytime.")
                            .font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.6)).fixedSize(horizontal: false, vertical: true)
                    }
                    editorSection("YOUR SPORTS") {
                        HStack(spacing: 8) {
                            ForEach(["MLB", "NFL", "NBA", "NCAAF"], id: \.self) { sport in
                                Button { if sports.contains(sport) { sports.remove(sport) } else { sports.insert(sport) } } label: {
                                    Text(sport).font(GaryFonts.mono(11, bold: true)).frame(maxWidth: .infinity).padding(.vertical, 12)
                                        .foregroundStyle(sports.contains(sport) ? .black : .white.opacity(0.6))
                                        .background(RoundedRectangle(cornerRadius: 9).fill(sports.contains(sport) ? GaryColors.gold : Color.white.opacity(0.05)))
                                }.buttonStyle(.plain).accessibilityAddTraits(sports.contains(sport) ? .isSelected : [])
                            }
                        }
                        Text("Saved with your account. The board opens on your favorite sport when you have just one.").font(GaryFonts.text(12)).foregroundStyle(.white.opacity(0.5))
                    }
                    editorSection("YOUR BOOK DISPLAY") {
                        HStack {
                            Text("Typical bet · $").font(GaryFonts.text(14))
                            TextField("100", text: $unitText).keyboardType(.decimalPad).font(GaryFonts.mono(16)).padding(12).background(fieldBackground)
                        }
                        Text("Converts your saved stakes to dollars. Until you set it, the display uses a hypothetical $100 per unit. It does not change your leaderboard rank.").font(GaryFonts.text(12)).foregroundStyle(.white.opacity(0.5))
                    }
                    if let error { Text(error).font(GaryFonts.text(13)).foregroundStyle(GaryColors.loss).fixedSize(horizontal: false, vertical: true) }
                    Button(action: save) {
                        HStack { if saving { ProgressView().tint(.black) }; Text(saving ? "Saving profile" : "Save profile") }
                            .font(GaryFonts.text(15, .semibold)).foregroundStyle(.black).frame(maxWidth: .infinity).padding(.vertical, 15)
                            .background(Capsule().fill(GaryColors.gold))
                    }.buttonStyle(.plain).disabled(saving || !handleValid || !unitValid || auth.currentUser?.id != ownerID)
                    if !handleValid { Text("Choose a valid handle to save your profile. It stays private unless you turn on the leaderboard.").font(GaryFonts.text(12)).foregroundStyle(.white.opacity(0.6)) }
                    if !unitValid { Text("Enter a dollar amount greater than zero, up to $100,000.").font(GaryFonts.text(12)).foregroundStyle(.white.opacity(0.6)) }
                }.foregroundStyle(GaryColors.warmWhite).padding(20).padding(.bottom, 20)
            }
            .background(Color(hex: "#0F0D0C"))
            .navigationTitle("Edit profile").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.foregroundStyle(GaryColors.gold) } }
        }
        .preferredColorScheme(.dark)
        .interactiveDismissDisabled(saving)
        .onAppear {
            ownerID = auth.currentUser?.id
            handle = snapshot?.profile?.name ?? ""
            avatar = snapshot?.profile?.avatar ?? "initials"
            bio = snapshot?.profile?.bio ?? ""
            visible = snapshot?.profile?.isPublic ?? false
            sports = Set(snapshot?.preferences?.favorite_sports ?? [])
            if let amount = snapshot?.preferences?.unit_value { unitText = String(format: "%g", amount) }
        }
        .onChange(of: auth.currentUser?.id) { _ in dismiss() }
    }

    private var fieldBackground: some View { RoundedRectangle(cornerRadius: 10).fill(Color.white.opacity(0.06)) }
    private func editorSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(GaryFonts.mono(10, bold: true)).tracking(1).foregroundStyle(GaryColors.gold)
            content()
        }
    }
    private func save() {
        guard !saving, handleValid, unitValid, ownerID == auth.currentUser?.id else { return }
        saving = true; error = nil
        Task {
            defer { saving = false }
            do {
                let updated = try await ProfileIdentityAPI.save(handle: cleanHandle, avatar: avatar, bio: bio.trimmingCharacters(in: .whitespacesAndNewlines), visible: visible, sports: sports.sorted(), unitValue: Double(unitText))
                guard ownerID == auth.currentUser?.id else { return }
                ProfileIdentityAPI.cache(updated); onSaved(updated); dismiss()
            } catch is CancellationError {} catch { self.error = error.localizedDescription }
        }
    }
}

struct PublicPlayerProfileSheet: View {
    let player: ProfileIdentityAPI.BoardRow
    @Environment(\.dismiss) private var dismiss
    @State private var card: ProfileIdentityAPI.PublicCard?
    @State private var loading = true

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if loading { ProgressView().tint(GaryColors.gold).frame(maxWidth: .infinity).padding(40) }
                    else if let card, let identity = card.profile {
                        VStack(spacing: 10) {
                            ProfileAvatar(name: identity.name, symbol: identity.avatar, size: 76)
                            Text("@\(identity.name)").font(GaryFonts.display(30)).foregroundStyle(GaryColors.warmWhite)
                            if let bio = identity.bio, !bio.isEmpty { Text(bio).font(GaryFonts.text(14)).foregroundStyle(.white.opacity(0.65)).multilineTextAlignment(.center) }
                            Label("Verified player", systemImage: "checkmark.shield").font(GaryFonts.mono(10, bold: true)).foregroundStyle(GaryColors.gold)
                        }.frame(maxWidth: .infinity)
                        VStack(alignment: .leading, spacing: 18) {
                            Text("LAST 30 DAYS · ALL SPORTS").font(GaryFonts.mono(10, bold: true)).foregroundStyle(GaryColors.gold)
                            HStack {
                                ProfileMetric(label: "RECORD", value: "\(card.wins)–\(card.losses)")
                                ProfileMetric(label: "WIN RATE", value: card.wins + card.losses > 0 ? String(format: "%.1f%%", Double(card.wins) / Double(card.wins + card.losses) * 100) : "—")
                            }
                            Divider().overlay(Color.white.opacity(0.07))
                            HStack {
                                ProfileMetric(label: "RIDING GARY", value: card.tail.record)
                                ProfileMetric(label: "FADING GARY", value: card.fade.record)
                            }
                        }.padding(18).background(RoundedRectangle(cornerRadius: 16).fill(GaryColors.cardBg))
                        HStack {
                            ProfileMetric(label: "WIN STREAK", value: "\(card.streak?.current ?? 0)", detail: "Starred picks", tint: GaryColors.gold)
                            ProfileMetric(label: "PERSONAL BEST", value: "\(card.streak?.best ?? 0)", detail: "All time")
                        }.padding(18).background(RoundedRectangle(cornerRadius: 16).fill(GaryColors.cardBg))
                        Text("Only picks locked before the game and graded by Gary count here. Personal stakes, notes and self-tracked bets are private.")
                            .font(GaryFonts.text(12)).foregroundStyle(.white.opacity(0.5)).fixedSize(horizontal: false, vertical: true)
                    } else {
                        ProfileNotice(title: "Profile unavailable", message: "This profile may be private, or we couldn't connect. Your place on the board is unchanged.", icon: "person.crop.circle.badge.exclamationmark", retry: { Task { await load() } })
                    }
                }.padding(20)
            }.background(Color(hex: "#0F0D0C"))
                .navigationTitle("Player profile").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() }.foregroundStyle(GaryColors.gold) } }
        }.preferredColorScheme(.dark).task(id: player.id) { await load() }
    }

    private func load() async {
        loading = true
        do { card = try await ProfileIdentityAPI.card(userID: player.user_id) }
        catch { card = nil }
        loading = false
    }
}
