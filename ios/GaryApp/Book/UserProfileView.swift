import SwiftUI
import Charts
import PhotosUI

// (UserBookLeaderboard — the profile's duplicate units board — deleted
// Aug 20: ONE leaderboard, the classic streak-first board on the
// Billfold's BOARD scope. The profile links to it instead.)

struct ProfileHeaderChip: View {
    @ObservedObject private var auth = AuthManager.shared
    var body: some View {
        Button { NotificationCenter.default.post(name: Notification.Name("ShowProfile"), object: nil) } label: {
            // The account icon every app puts in this corner (founder, Sep 23
            // 2026: "use what is standard in the industry").
            Image(systemName: "person.crop.circle")
                .font(.system(size: 25, weight: .regular))
                .foregroundStyle(GaryColors.warmWhite.opacity(0.9))
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
        .safeAreaInset(edge: .top, spacing: 0) {
            HStack {
                Spacer()
                Button("Done") { dismiss() }
                    .font(GaryFonts.text(15, .semibold))
                    .foregroundStyle(GaryColors.gold)
                    .frame(minWidth: 64, minHeight: 44)
                    .accessibilityLabel("Close profile")
            }
            .padding(.horizontal, 16)
            .background(Color(hex: "#0F0D0C"))
        }
        .task(id: accountKey) { await load(); if auth.isAuthenticated { await access.refresh() } }
        .onGaryTour { verb, _ in if verb == "profileedit", snapshot != nil { showEditor = true } }
        .onChange(of: scenePhase) { phase in if phase == .active { Task { await load(); await access.refresh() } } }
        .sheet(isPresented: $showEditor) { ProfileEditorSheet(snapshot: snapshot) { updated in snapshot = updated; identityFailed = false } }
        .sheet(isPresented: $showQuickLog, onDismiss: { Task { await load() } }) { QuickLogSheet { _ in } }
        .sheet(isPresented: $showAuth, onDismiss: { Task { await load() } }) { AuthView() }
        .sheet(isPresented: $showSettings) { SettingsSheetView().environmentObject(auth) }
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
                Label("YOUR STREAK", systemImage: "flame.fill").font(GaryFonts.mono(11, bold: true)).tracking(1).foregroundStyle(GaryColors.gold)
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
        }.padding(18).background(panel)
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

