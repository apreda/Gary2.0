import SwiftUI
import UIKit

@MainActor
final class GaryPushNavigation: ObservableObject {
    static let shared = GaryPushNavigation()
    let router = GaryPushRouter(slateDate: { SupabaseAPI.todayEST(now: $0) })
    @Published private(set) var revision = UUID()
    @Published var notice: Notice?
    @Published private(set) var queuedNotice: Notice?
    private(set) var modalBlockers: Set<String> = []
    private var waitingForBook: GaryPushIntent?
    private(set) var actionID = UUID()

    struct Notice: Identifiable {
        enum Kind { case account(UUID?), archive(URL), missingGame(GaryPushGame) }
        let id = UUID()
        let kind: Kind
    }

    private init() {
        router.onPendingChange = { [weak self] in self?.revision = UUID() }
    }

    func receive(_ payload: [AnyHashable: Any], requestID: String) {
        guard router.receive(payload, requestID: requestID) else { return }
        waitingForBook = nil
        notice = nil; queuedNotice = nil
        if PicksFocusState.shared.focusDate != nil { PicksFocusState.shared.clearGameFocus() }
        actionID = UUID()
    }

    func setModalBlocked(_ blocked: Bool, owner: String) {
        let changed = blocked ? modalBlockers.insert(owner).inserted : modalBlockers.remove(owner) != nil
        if changed { revision = UUID() }
    }

    func requireBookAccount(_ expected: UUID?) {
        waitingForBook = .yourBook(accountID: expected)
        queuedNotice = Notice(kind: .account(expected))
        revision = UUID()
    }

    func resumeBookIfMatching(_ accountID: UUID?) {
        guard router.pending == nil, let intent = waitingForBook, let accountID,
              intent.resolve(nativeSlateDate: SupabaseAPI.todayEST(), currentAccountID: accountID) == .yourBook else { return }
        waitingForBook = nil
        // This local continuation is still a typed account destination.
        if let notice, case .account = notice.kind { self.notice = nil }
        if let queuedNotice, case .account = queuedNotice.kind { self.queuedNotice = nil }
        _ = router.receive(["destination": "book", "book_scope": "you", "account_id": accountID.uuidString],
                           requestID: UUID().uuidString)
    }

    func cancelNotice() { waitingForBook = nil; notice = nil }

    func finishAuthenticationAttempt(_ accountID: UUID?, actionID: UUID) {
        // Dismissing an older sign-in sheet cannot cancel a newer alert.
        guard self.actionID == actionID else { return }
        guard accountID != nil else { waitingForBook = nil; return }
        resumeBookIfMatching(accountID)
        if case let .yourBook(expected)? = waitingForBook {
            requireBookAccount(expected)
        }
    }

    func missingGame(_ game: GaryPushGame) {
        queuedNotice = Notice(kind: .missingGame(game))
        revision = UUID()
    }

    func openFailed(_ url: URL, actionID: UUID) {
        guard self.actionID == actionID else { return }
        queuedNotice = Notice(kind: .archive(url))
        revision = UUID()
    }

    func presentQueuedNotice() {
        notice = queuedNotice
        queuedNotice = nil
    }

    /// SwiftUI sheets, navigation transitions, and provider auth sessions may
    /// not be represented by the root's own sheet bindings.
    static var systemPresentationBlocksNavigation: Bool {
        guard let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
            .filter({ $0.activationState == .foregroundActive })
            .flatMap(\.windows).first(where: \.isKeyWindow), let root = window.rootViewController else { return true }
        func blocked(_ controller: UIViewController) -> Bool {
            if controller.presentedViewController != nil || controller.isBeingPresented || controller.isBeingDismissed { return true }
            return controller.children.contains(where: blocked)
        }
        return blocked(root)
    }
}

struct GaryPushNavigationModifier: ViewModifier {
    @Binding var selectedTab: Int
    @Binding var hasSeenIntro: Bool
    @Binding var showingIntro: Bool
    let shellReady: Bool
    let rootModalPresented: Bool
    let openProfile: () -> Void
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    @ObservedObject private var auth = AuthManager.shared
    @ObservedObject private var navigation = GaryPushNavigation.shared
    @ObservedObject private var leagueOverlay = LeagueOverlayState.shared
    @State private var showingAuth = false
    @State private var authAttemptID: UUID?
    @State private var afterNotice: AfterNotice?

    private struct AfterNotice: Identifiable {
        enum Action { case signIn, profile, archive(URL), retryGame(GaryPushGame) }
        let id = UUID()
        let originID: UUID
        let action: Action
    }

    private var accountID: UUID? { auth.currentUser.flatMap { UUID(uuidString: $0.id) } }
    private var pumpKey: String {
        "\(navigation.revision)|\(shellReady)|\(rootModalPresented)|\(scenePhase)|\(auth.isLoading)|\(auth.currentUser?.id ?? "")|\(showingIntro)|\(hasSeenIntro)|\(showingAuth)|\(leagueOverlay.isOpen)|\(navigation.notice?.id.uuidString ?? "")|\(afterNotice?.id.uuidString ?? "")"
    }

    func body(content: Content) -> some View {
        content
            .sheet(item: $navigation.notice, onDismiss: {
                if afterNotice == nil { navigation.cancelNotice() }
            }) { notice in
                noticeView(notice)
            }
            .sheet(isPresented: $showingAuth, onDismiss: {
                if let attempt = authAttemptID {
                    navigation.finishAuthenticationAttempt(accountID, actionID: attempt)
                }
                authAttemptID = nil
            }) {
                AuthView()
            }
            .onChange(of: auth.currentUser?.id) { _ in navigation.resumeBookIfMatching(accountID) }
            .task(id: pumpKey) { await consumeWhenReady() }
    }

    @MainActor private func consumeWhenReady() async {
        guard shellReady, scenePhase == .active, !auth.isLoading,
              !rootModalPresented, !showingIntro, !showingAuth,
              !leagueOverlay.isOpen, navigation.modalBlockers.isEmpty,
              navigation.notice == nil else { return }
        // Let the entry/intro sheet mount before consulting UIKit presentation.
        await Task.yield()
        while !Task.isCancelled, navigation.router.pending != nil || afterNotice != nil || navigation.queuedNotice != nil {
            if GaryPushNavigation.systemPresentationBlocksNavigation {
                try? await Task.sleep(nanoseconds: 250_000_000)
                continue
            }
            if let next = afterNotice {
                afterNotice = nil
                guard next.originID == navigation.actionID else { continue }
                switch next.action {
                case .signIn: authAttemptID = next.originID; showingAuth = true
                case .profile: openProfile()
                case let .archive(url): openArchive(url)
                case let .retryGame(game): focus(game, refresh: true)
                }
                return
            }
            if navigation.queuedNotice != nil { navigation.presentQueuedNotice(); return }
            if !hasSeenIntro, let intent = navigation.router.pending {
                switch intent {
                case .pick, .picksOverview:
                    selectedTab = 3; showingIntro = true; return
                case .yourBook: break
                }
            }
            guard let action = navigation.router.takeIfReady(shellReady: true, identityReady: true,
                    currentAccountID: accountID, now: Date()) else { return }
            switch action {
            case let .nativeGame(game): focus(game)
            case .picksOverview: PicksFocusState.shared.focus(game: ""); selectedTab = 3
            case let .webArchive(url): openArchive(url)
            case .yourBook:
                UserDefaults.standard.set("you", forKey: "billfoldScope")
                selectedTab = 4
            case let .bookAccountRequired(expected): navigation.requireBookAccount(expected)
            }
        }
    }

    @MainActor private func focus(_ game: GaryPushGame, refresh: Bool = false) {
        // Re-evaluate a retry that remained in a notice across the 6 AM rollover.
        guard game.date == SupabaseAPI.todayEST() else {
            if case let .webArchive(url) = GaryPushIntent.pick(league: game.league, gameID: game.gameID,
                    date: game.date, matchup: game.matchup).resolve(nativeSlateDate: SupabaseAPI.todayEST(), currentAccountID: accountID) {
                openArchive(url)
            }
            return
        }
        PicksFocusState.shared.focus(game: game.matchup, league: game.league, gameID: game.gameID,
                                     date: game.date, refresh: refresh)
        selectedTab = 3
    }

    @MainActor private func openArchive(_ url: URL) {
        let actionID = navigation.actionID
        openURL(url) { opened in
            if !opened { Task { @MainActor in navigation.openFailed(url, actionID: actionID) } }
        }
    }

    private func noticeView(_ notice: GaryPushNavigation.Notice) -> some View {
        let title: String
        let message: String
        let button: String
        let action: AfterNotice.Action
        switch notice.kind {
        case .account:
            title = "Open the right Book"
            message = accountID == nil
                ? "Sign in to the account that received this alert to open its Book."
                : "This alert belongs to another account. Open Profile to switch accounts, then return to open its Book."
            button = accountID == nil ? "Sign In" : "Open Profile"
            action = accountID == nil ? .signIn : .profile
        case let .archive(url):
            title = "The board didn't open"
            message = "Gary couldn't open this dated board in your browser. Please try again."
            button = "Try Again"; action = .archive(url)
        case let .missingGame(game):
            title = "This game isn't available yet"
            message = "We couldn't find the exact \(game.league) game from your alert on the \(game.date) board. Try loading it again."
            button = "Reload Game"; action = .retryGame(game)
        }
        return NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text(title).font(.title2.bold())
                    Text(message).font(.body).foregroundStyle(.secondary)
                    Button(button) {
                        afterNotice = AfterNotice(originID: navigation.actionID, action: action)
                        navigation.notice = nil
                    }.buttonStyle(.borderedProminent).tint(GaryColors.gold).foregroundStyle(.black)
                    Button("Not Now") { navigation.cancelNotice() }.buttonStyle(.plain)
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(24)
            }
            .background(GaryColors.darkBg)
            .toolbar { ToolbarItem(placement: .topBarTrailing) {
                Button("Close") { navigation.cancelNotice() }
            } }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .preferredColorScheme(.dark)
    }
}
