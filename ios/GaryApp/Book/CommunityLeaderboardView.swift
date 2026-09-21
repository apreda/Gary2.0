import SwiftUI

// MARK: - THE LEADERBOARD (founder, Sep 21 2026)
// "It'll be a leaderboard with wins and losses, and then a separate tab for
// streak... simple, easy for people to use and understand, and it should be
// a fun thing." One server snapshot ranks everyone; it leads with the board
// whether or not the viewer is signed in. No friends lens, no windows, no
// sport filters. Verified picks only; self-tracked bets never enter it.
struct ClassicLeaderboardView: View {
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject private var auth = AuthManager.shared
    @AppStorage("leaderboardTab") private var tab = "record"
    @State private var board: ProfileIdentityAPI.Board?
    @State private var rows: [ProfileIdentityAPI.BoardRow] = []
    @State private var loading = true
    @State private var loadingMore = false
    @State private var nextOffset = 0
    @State private var error: String?
    @State private var updatedAt: Date?
    @State private var showAuth = false
    @State private var showRules = false
    @State private var selectedPlayer: ProfileIdentityAPI.BoardRow?
    @State private var loadedQuery = ""
    @State private var requestID = UUID()

    private var isStreak: Bool { tab == "streak" }
    /// RECORD ranks by wins (the W–L board); STREAK by the current run.
    private var sort: String { isStreak ? "streak" : "wins" }
    private var queryKey: String { "\(auth.currentUser?.id ?? "guest"):\(auth.isAuthenticated):\(sort)" }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            // No masthead (founder, Sep 21 2026: "we don't need this part at
            // all, that way the actual board can start right under the line").
            tabs
            if let error {
                ProfileNotice(title: "Standings couldn't refresh", message: error, retry: { Task { await load() } })
            }
            if loading && rows.isEmpty {
                ProgressView("Loading the board").tint(GaryColors.gold).foregroundStyle(.white.opacity(0.6)).frame(maxWidth: .infinity).padding(.vertical, 40)
            } else if board != nil {
                if rows.isEmpty { emptyState }
                else {
                    // One table from #1 down — the podium came off (founder,
                    // Sep 21 2026: "simplify or even just remove this part").
                    standings
                    if board?.has_more == true {
                        Button { Task { await loadMore() } } label: {
                            HStack { if loadingMore { ProgressView().tint(GaryColors.gold) }; Text(loadingMore ? "Loading more players" : "Load more players") }
                                .font(GaryFonts.text(14, .semibold)).foregroundStyle(GaryColors.gold).frame(maxWidth: .infinity).padding(14).background(RoundedRectangle(cornerRadius: 12).fill(GaryColors.cardBg))
                        }.buttonStyle(.plain).disabled(loadingMore)
                    }
                }
                myPosition
                if let updatedAt {
                    HStack {
                        Text("Updated \(updatedAt, style: .time)").font(GaryFonts.text(11)).foregroundStyle(.white.opacity(0.35))
                        Spacer()
                        Button { Task { await load() } } label: { Label("Refresh", systemImage: "arrow.clockwise").font(GaryFonts.text(12)).foregroundStyle(.white.opacity(0.55)) }.buttonStyle(.plain).disabled(loading)
                    }
                }
            }
            Text("Verified picks only. Star a pick on its card to put it on your streak.")
                .font(GaryFonts.text(11)).foregroundStyle(.white.opacity(0.4)).fixedSize(horizontal: false, vertical: true)
        }
        .pageGutter()
        .task(id: queryKey) { await load() }
        .onGaryTour { verb, _ in if verb == "boardrules" { showRules = true } }
        .onChange(of: scenePhase) { phase in if phase == .active { Task { await load() } } }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("GaryProfileUpdated"))) { _ in Task { await load() } }
        .onReceive(NotificationCenter.default.publisher(for: .userBookChanged)) { _ in Task { await load() } }
        .sheet(isPresented: $showAuth, onDismiss: { Task { await load() } }) { AuthView() }
        .sheet(item: $selectedPlayer, onDismiss: { Task { await load() } }) { PublicPlayerProfileSheet(player: $0) }
        .sheet(isPresented: $showRules) { rulesSheet }
    }

    private var tabs: some View {
        HStack(spacing: 22) {
            BillfoldFilterTab(title: "RECORD", isSelected: !isStreak) { tab = "record" }
            BillfoldFilterTab(title: "STREAK", isSelected: isStreak) { tab = "streak" }
            Spacer()
            if let n = board?.qualified_count, n > 0 {
                Text("\(n) RANKED").font(GaryFonts.mono(9, bold: true)).tracking(0.6).foregroundStyle(.white.opacity(0.45))
            }
            Button { showRules = true } label: {
                Image(systemName: "info.circle").font(.system(size: 15)).foregroundStyle(.white.opacity(0.45)).frame(width: 32, height: 32)
            }
            .buttonStyle(.plain).accessibilityLabel("Leaderboard rules")
        }
    }

    @ViewBuilder private var myPosition: some View {
        if let board {
            if !auth.isAuthenticated {
                Button { showAuth = true } label: {
                    HStack(spacing: 10) {
                        Text("Sign in to get on the board").font(GaryFonts.text(14, .semibold)).foregroundStyle(GaryColors.gold)
                        Spacer()
                        Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(GaryColors.gold.opacity(0.7))
                    }.padding(16).background(cardBackground)
                }.buttonStyle(.plain)
            } else if let me = board.me {
                Button { selectedPlayer = me } label: {
                    HStack(spacing: 12) {
                        Text("#\(me.rank)").font(GaryFonts.mono(26, bold: true)).foregroundStyle(GaryColors.gold)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("YOUR POSITION").font(GaryFonts.mono(9, bold: true)).tracking(0.8).foregroundStyle(GaryColors.gold)
                            Text("\(me.record) · \(String(format: "%.1f", me.win_pct))%")
                                .font(GaryFonts.text(12)).foregroundStyle(.white.opacity(0.65)).fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                        Text(me.streakLabel).font(GaryFonts.mono(18, bold: true)).foregroundStyle(streakColor(me))
                    }.padding(16).background(RoundedRectangle(cornerRadius: 14).fill(GaryColors.gold.opacity(0.065)).overlay(RoundedRectangle(cornerRadius: 14).stroke(GaryColors.gold.opacity(0.25))))
                }.buttonStyle(.plain)
            } else if board.my_decided < board.min_decided {
                HStack {
                    Text("YOUR PLACE").font(GaryFonts.mono(10, bold: true)).foregroundStyle(GaryColors.gold)
                    Spacer()
                    Text("\(min(board.my_decided, board.min_decided))/\(board.min_decided) picks settled").font(GaryFonts.mono(12, bold: true)).foregroundStyle(GaryColors.warmWhite)
                }.padding(16).background(cardBackground)
            }
        }
    }

    private var standings: some View {
        return VStack(spacing: 0) {
            HStack {
                Text("PLAYER").frame(maxWidth: .infinity, alignment: .leading)
                Text("RECORD").frame(width: 75, alignment: .trailing)
                Text("STREAK").fixedSize().frame(width: 60, alignment: .trailing)
            }.font(GaryFonts.mono(9, bold: true)).foregroundStyle(.white.opacity(0.4)).padding(14)
            ForEach(rows) { row in
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
            Text(row.streakLabel).font(GaryFonts.mono(15, bold: true)).foregroundStyle(streakColor(row)).frame(width: 60, alignment: .trailing)
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
            Text("Five settled verified picks and a public handle earn a place.")
                .font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.55)).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
        }.frame(maxWidth: .infinity).padding(24).background(cardBackground)
    }
    private var cardBackground: some View { RoundedRectangle(cornerRadius: 15).fill(GaryColors.cardBg).overlay(RoundedRectangle(cornerRadius: 15).stroke(Color.white.opacity(0.07))) }
    private var rulesSheet: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    rulesItem("Earn your place", "Claim a handle, make your record public and settle five verified wins or losses. Pending bets, pushes and voids don't count toward the five.")
                    rulesItem("The streak", "Tap the star on any pick card to log it as a streak bet — with Gary or fading him. Every starred bet counts. Wins extend the run; one loss on any of them restarts it. Pushes and voids leave it alone.")
                    rulesItem("Same rules for everyone", "Rankings use picks graded by the system. Self-tracked bets stay private and never touch the board. Ties share a place.")
                }.padding(22)
            }.background(Color(hex: "#0F0D0C")).navigationTitle("How the leaderboard works").navigationBarTitleDisplayMode(.inline)
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
            board = nil; rows = []; nextOffset = 0; updatedAt = nil; selectedPlayer = nil
            loadedQuery = key
        }
        let request = UUID(); requestID = request
        loading = true; loadingMore = false; error = nil
        do {
            let result = try await ProfileIdentityAPI.board(window: "season", sort: sort, league: "all", scope: "all")
            guard key == queryKey, requestID == request, !Task.isCancelled else { return }
            board = result; rows = result.rows; nextOffset = result.rows.count; updatedAt = Date()
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
            let result = try await ProfileIdentityAPI.board(window: "season", sort: sort, league: "all", offset: offset, scope: "all")
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
