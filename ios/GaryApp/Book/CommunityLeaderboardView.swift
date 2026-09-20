import SwiftUI
import Charts
import PhotosUI

// MARK: - Verified community leaderboard
// Ranking, qualification, filtering, pagination and the caller's position
// come from one server snapshot. Self-tracked bets never enter this board.
struct ClassicLeaderboardView: View {
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject private var auth = AuthManager.shared
    @AppStorage("bookBoardSort") private var sort = "streak"
    @AppStorage("bookBoardWindow") private var window = "30d"
    @AppStorage("bookBoardLeague") private var league = "all"
    @AppStorage("bookBoardScope") private var scope = "all"
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
    @State private var showBlockedPlayers = false
    @State private var showRules = false
    @State private var showEditor = false
    @State private var selectedPlayer: ProfileIdentityAPI.BoardRow?
    @State private var loadedQuery = ""
    @State private var favoriteAccountOwner: String?
    @State private var requestID = UUID()

    private var selectedSort: String { ["streak", "wins", "record"].contains(sort) ? sort : "streak" }
    private var selectedWindow: String { ["season", "30d", "7d"].contains(window) ? window : "30d" }
    private var selectedLeague: String { ["all", "MLB", "NFL", "NBA", "NCAAF"].contains(league) ? league : "all" }
    /// FRIENDS needs an account; a signed-out viewer always sees everyone.
    private var selectedScope: String { scope == "friends" && auth.isAuthenticated ? "friends" : "all" }
    private var queryKey: String { "\(auth.currentUser?.id ?? "guest"):\(auth.isAuthenticated):\(selectedWindow):\(selectedSort):\(selectedLeague):\(selectedScope)" }
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
        .onGaryTour { verb, arg in
            if verb == "boardrules" { showRules = true }
            if verb == "boardscope" { scope = arg == "friends" ? "friends" : "all" }
        }
        .onChange(of: scenePhase) { phase in if phase == .active { Task { await load() } } }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("GaryProfileUpdated"))) { _ in Task { await load() } }
        .onReceive(NotificationCenter.default.publisher(for: .userBookChanged)) { _ in Task { await load() } }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("GaryFollowsChanged"))) { _ in Task { await load() } }
        .sheet(isPresented: $showClaim, onDismiss: { Task { await load() } }) { HandleClaimSheet { myHandle = $0 } }
        .sheet(isPresented: $showAuth, onDismiss: { Task { await load() } }) { AuthView() }
        .sheet(isPresented: $showEditor) { ProfileEditorSheet(snapshot: profile) { updated in profile = updated; Task { await load() } } }
        .sheet(item: $selectedPlayer, onDismiss: { Task { await load() } }) { PublicPlayerProfileSheet(player: $0) }
        .sheet(isPresented: $showBlockedPlayers, onDismiss: { Task { await load() } }) { BlockedPlayersSheet() }
        .sheet(isPresented: $showRules) { rulesSheet }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("THE PLAYERS' BOARD", systemImage: "checkmark.shield").font(GaryFonts.mono(10, bold: true)).tracking(0.8).foregroundStyle(GaryColors.gold)
                Spacer()
                if auth.isAuthenticated {
                    Button { showBlockedPlayers = true } label: { Image(systemName: "hand.raised").frame(width: 44, height: 44).foregroundStyle(GaryColors.gold) }
                        .buttonStyle(.plain).accessibilityLabel("Manage blocked players")
                }
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
            HStack(spacing: 18) {
                BillfoldFilterTab(title: "EVERYONE", isSelected: selectedScope == "all") { scope = "all" }
                BillfoldFilterTab(title: "FRIENDS", isSelected: selectedScope == "friends") {
                    if auth.isAuthenticated { scope = "friends" } else { showAuth = true }
                }
                Spacer()
                if selectedScope == "friends", let n = board?.following_count {
                    Text("\(n) FOLLOWED")
                        .font(GaryFonts.mono(9, bold: true)).tracking(0.6)
                        .foregroundStyle(.white.opacity(0.45))
                }
            }
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
                    .accessibilityHidden(true)
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
            } else if board.profile_hidden == true {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Your public profile is hidden by our safety controls. Your private Book remains available.").font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.7))
                    Link("Contact support to appeal", destination: ProfileSafetyAPI.helpURL).font(GaryFonts.text(13)).tint(GaryColors.gold)
                }.padding(16).background(cardBackground)
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
                Text(isMe ? "YOU · BEST W\(row.best_streak)" : row.following == true ? "FOLLOWING · BEST W\(row.best_streak)" : "BEST W\(row.best_streak)").font(GaryFonts.mono(8, bold: true)).foregroundStyle(row.following == true && !isMe ? GaryColors.gold.opacity(0.7) : .white.opacity(0.4))
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
            Text(selectedScope == "friends" ? "Your friends board is empty." : (board?.hidden_count ?? 0) > 0 ? "No players to show in this view." : "The next name could be yours.").font(GaryFonts.display(26)).foregroundStyle(GaryColors.warmWhite).multilineTextAlignment(.center)
            Text(selectedScope == "friends"
                 ? ((board?.following_count ?? 0) == 0
                    ? "Open any player from the board and tap Follow. Everyone you follow ranks here against you, with the same five-pick minimum."
                    : "None of the players you follow has five decided verified picks for \(selectedLeague == "all" ? "all sports" : selectedLeague) · \(windowName.lowercased()) yet.")
                 : (board?.hidden_count ?? 0) > 0 ? "Your blocked players are hidden. Their results still count in the overall rankings." : "No players have qualified for \(selectedLeague == "all" ? "all sports" : selectedLeague) · \(windowName.lowercased()) yet. Five decided verified picks and a public handle earn a place.")
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
                    rulesItem("Friends board", "Follow players from their profile and the FRIENDS lens ranks them against you with the same rules. Who you follow is private and changes nothing for anyone else.")
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
            let result = try await ProfileIdentityAPI.board(window: selectedWindow, sort: selectedSort, league: selectedLeague, scope: selectedScope)
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
            let result = try await ProfileIdentityAPI.board(window: selectedWindow, sort: selectedSort, league: selectedLeague, offset: offset, scope: selectedScope)
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
