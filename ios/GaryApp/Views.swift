import SwiftUI
import WebKit

struct HomeView: View {
    @State private var freePick: GaryPick?
    @State private var loading = true
    private let techChips = ["Odds API", "Sports DB", "Turbo 3.5 Mini", "Perplexity", "StatCast API"]
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(hex: "#0F0F10"), Color(hex: "#141516")], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            ScrollView {
                VStack(spacing: 22) {
                    // HERO removed per request
                    EmptyView()

                    // TODAY'S FREE PICK — wide card with right rail
                    if let p = freePick {
                        Text("Today's Free Pick")
                            .padding(.top, 24)
                            .font(.title2.bold())
                            .foregroundColor(Color(hex: "#F5F3EE"))
                        PickCardMobile(pick: p)
                            .padding(.horizontal)
                    }

                    // Intro pill + tech icons moved to Access Page per request
                    EmptyView()
                    // FEATURE TILES
                    VStack(spacing: 14) {
                        HomeTile(title: "Today's Picks", subtitle: "See Gary's best edges", icon: "list.bullet.rectangle")
                        HomeTile(title: "Prop Picks", subtitle: "Top 10 prop edges", icon: "sportscourt")
                        HomeTile(title: "Billfold", subtitle: "Track performance", icon: "wallet.pass")
                    }
                    .padding(.horizontal)

                    // BENEFITS SNAPSHOT — sleeker grid
                    let benefitColumns = [GridItem(.adaptive(minimum: 160), spacing: 14)]
                    LazyVGrid(columns: benefitColumns, alignment: .center, spacing: 14) {
                        BenefitCard(title: "Statistical Brain", text: "Leverages sportsbooks' odds and player metrics to spot mispriced lines.", icon: "waveform.path.ecg")
                        BenefitCard(title: "Three-Layered Core", text: "Sports Odds & Stats, Real-Time Storylines, Deep Reasoning Engine.", icon: "square.stack.3d.up")
                        BenefitCard(title: "Narrative Tracker", text: "Detects storylines, fatigue, travel and lineup changes; weights them back into the model.", icon: "text.bubble")
                        BenefitCard(title: "Street Smart", text: "Old-school handicapping instincts blended with modern data.", icon: "map")
                        BenefitCard(title: "Fan Brain", text: "Reads sentiment and sharp flows to separate hype from true value.", icon: "person.3.fill")
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 28)
                }
            }
        }
        .onAppear {
            Task {
                loading = true
                let date = SupabaseAPI.todayEST()
                if let arr = try? await SupabaseAPI.fetchDailyPicks(date: date) {
                    freePick = arr.first
                } else {
                    freePick = nil
                }
                loading = false
            }
        }
    }
}

struct HomeTile: View {
    let title: String
    let subtitle: String
    let icon: String
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundColor(Color(hex: "#D8B878"))
                .font(.system(size: 24))
                .frame(width: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).foregroundColor(Color(hex: "#F5F3EE")).font(.headline)
                Text(subtitle).foregroundColor(Color.white.opacity(0.6)).font(.subheadline)
            }
            Spacer()
        }
        .padding()
        .background(Color.white.opacity(0.04))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: "#D8B878").opacity(0.8), lineWidth: 1.2))
        .cornerRadius(12)
    }
}

// Pill chip like website
struct Pill: View {
    let text: String
    var compact: Bool = false
    var body: some View {
        Text(text)
            .font(compact ? Font.caption.bold() : Font.subheadline)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .fontWeight(.bold)
            .foregroundColor(Color(hex: "#1A1B1D"))
            .padding(.horizontal, compact ? 10 : 14)
            .padding(.vertical, compact ? 6 : 10)
            .frame(height: compact ? 28 : 38)
            .background(Color(hex: "#D8B878"))
            .cornerRadius(compact ? 14 : 20)
    }
}

struct BenefitCard: View {
    let title: String
    let text: String
    var icon: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                if let icon = icon {
                    ZStack {
                        Circle().fill(Color(hex: "#B8953F").opacity(0.2))
                        Image(systemName: icon)
                            .foregroundColor(Color(hex: "#B8953F"))
                            .font(.system(size: 16, weight: .semibold))
                    }
                    .frame(width: 34, height: 34)
                }
                Text(title)
                    .foregroundColor(Color(hex: "#D8B878"))
                    .font(.headline.bold())
            }
            Text(text)
                .foregroundColor(Color(hex: "#F5F3EE"))
                .font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 120, alignment: .leading)
        .background(Color.white.opacity(0.04))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: "#D8B878").opacity(0.7), lineWidth: 1.0))
        .cornerRadius(12)
    }
}

// Rounded corner helper for right rail background clip
struct RoundedCorner: Shape {
    var radius: CGFloat = .infinity
    var corners: UIRectCorner = .allCorners

    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(roundedRect: rect, byRoundingCorners: corners, cornerRadii: CGSize(width: radius, height: radius))
        return Path(path.cgPath)
    }
}

struct GaryPicksView: View {
    @State private var picks: [GaryPick] = []
    @State private var loading = true

    var body: some View {
        ZStack {
            Color.black.opacity(0.96).ignoresSafeArea()
            if loading {
                ProgressView().tint(Color(hex: "#B8953F"))
            } else if picks.isEmpty {
                Text("No picks yet.")
                    .foregroundColor(.gray)
            } else {
                ScrollView {
                    VStack(spacing: 12) {
                        Text("Gary's Picks")
                            .font(.largeTitle.bold())
                            .foregroundColor(Color(hex: "#B8953F"))
                        Text("AI-Powered Sports Analysis")
                            .foregroundColor(.gray)
                            .padding(.bottom, 8)
                        ForEach(picks) { p in
                            PickCardMobile(pick: p)
                                .frame(maxWidth: 360)
                                .padding(.vertical, 8)
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .onAppear {
            Task {
                loading = true
                let date = SupabaseAPI.todayEST()
                if let arr = try? await SupabaseAPI.fetchDailyPicks(date: date) {
                    let cleaned = arr.filter { ($0.pick ?? "").isEmpty == false && ($0.rationale ?? "").isEmpty == false }
                    picks = cleaned
                }
                loading = false
            }
        }
    }
}

struct GaryPropsView: View {
    @State private var props: [PropPick] = []
    @State private var loading = true

    var body: some View {
        ZStack {
            Color.black.opacity(0.96).ignoresSafeArea()
            if loading {
                ProgressView().tint(Color(hex: "#B8953F"))
            } else if props.isEmpty {
                Text("No prop picks yet.")
                    .foregroundColor(.gray)
            } else {
                ScrollView {
                    VStack(spacing: 12) {
                        Text("GARY PROPS").font(.largeTitle.bold()).foregroundColor(Color(hex: "#B8953F"))
                        Text("AI-Powered Prop Betting").foregroundColor(.gray)
                        LazyVStack(spacing: 12) {
                            ForEach(props) { p in
                                PropCardMobile(prop: p)
                                    .padding(.horizontal)
                            }
                        }
                        .padding(.vertical, 8)
                    }
                }
            }
        }
        .onAppear {
            Task {
                loading = true
                let date = SupabaseAPI.todayEST()
                if let arr = try? await SupabaseAPI.fetchPropPicks(date: date) {
                    props = arr
                }
                loading = false
            }
        }
    }
}

struct BillfoldView: View {
    // Auth state (same as BetCard)
    @State private var email: String = ""
    @State private var password: String = ""
    @State private var remember: Bool = false
    @State private var error: String?
    @State private var loadingSignin = false
    @State private var signedIn: Bool = {
        if let _ = try? JSONSerialization.jsonObject(with: UserDefaults.standard.data(forKey: "supabase.session") ?? Data()) { return true }
        return false
    }()

    // Billfold data
    @State private var selectedTab: Int = 0 // 0 games, 1 props
    @State private var timeframe: String = "all" // 7d,30d,90d,ytd,all
    @State private var gameResults: [GameResult] = []
    @State private var propResults: [PropResult] = []
    @State private var loadingData = true
    @State private var errorData: String?

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(hex: "#101112"), Color(hex: "#151617")], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
            ScrollView {
                VStack(spacing: 16) {
                    segmented
                    metrics
                    recentSection
                }
                .padding(.horizontal, 16)
                .padding(.top, 20)
            }
            .onAppear { Task { await loadBillfold() } }
        }
        .ignoresSafeArea(edges: .bottom)
    }

    // MARK: - Signed-in Billfold content
    private var segmented: some View {
        VStack(spacing: 10) {
            HStack(spacing: 0) {
                Button(action: { selectedTab = 0; Task { await loadBillfold() } }) {
                    Text("Game Picks").font(.subheadline.bold()).padding(.vertical, 8).frame(maxWidth: .infinity)
                }
                .background(selectedTab == 0 ? Color(hex: "#D8B878") : Color.white.opacity(0.06))
                .foregroundColor(selectedTab == 0 ? Color(hex: "#1A1B1D") : .white)
                .cornerRadius(8)
                Button(action: { selectedTab = 1; Task { await loadBillfold() } }) {
                    Text("Prop Picks").font(.subheadline.bold()).padding(.vertical, 8).frame(maxWidth: .infinity)
                }
                .background(selectedTab == 1 ? Color(hex: "#D8B878") : Color.white.opacity(0.06))
                .foregroundColor(selectedTab == 1 ? Color(hex: "#1A1B1D") : .white)
                .cornerRadius(8)
            }
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(hex: "#D8B878").opacity(0.5)))

            // time filters
            HStack(spacing: 8) {
                ForEach(["7d","30d","90d","ytd","all"], id: \.self) { tf in
                    Button(action: { timeframe = tf; Task { await loadBillfold() } }) {
                        Text(tf.uppercased())
                            .font(.caption.bold())
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(timeframe == tf ? Color.white.opacity(0.12) : Color.white.opacity(0.06))
                            .cornerRadius(8)
                    }.foregroundColor(.white)
                }
                Spacer()
                // quick refresh
                Button { Task { await loadBillfold() } } label: {
                    Image(systemName: "arrow.clockwise").foregroundColor(Color(hex: "#D8B878"))
                }
            }
        }
    }

    private var metrics: some View {
        let (wins, losses, pushes) = aggregateRecord()
        let total = max(1, wins + losses + pushes)
        let winRate = Double(wins) / Double(total)
        return VStack(spacing: 12) {
            HStack(spacing: 12) {
                kpi(title: "RECORD", value: "\(wins)-\(losses)\(pushes>0 ? "-\(pushes)" : "")")
                kpi(title: "WIN RATE", value: String(format: "%.1f%%", winRate*100))
            }
            // tiny UI nudge to trigger Vercel redeploy
            Text("")
        }
    }

    private func kpi(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).foregroundColor(.gray).font(.caption.bold())
            Text(value).foregroundColor(Color(hex: "#D8B878")).font(.title.bold())
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.04))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: "#D8B878").opacity(0.6), lineWidth: 1))
        .cornerRadius(12)
    }

    private var recentSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("RECENT PICKS").foregroundColor(Color(hex: "#D8B878")).font(.headline)
            if loadingData { ProgressView().tint(Color(hex: "#D8B878")) }
            if let errorData { Text(errorData).foregroundColor(.red) }
            VStack(spacing: 10) {
                if selectedTab == 0 {
                    ForEach(Array(gameResults.enumerated()), id: \.offset) { _, row in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(formatDate(row.game_date)).foregroundColor(.gray).font(.caption)
                                Spacer()
                                Text(formatOdds(row.odds)).foregroundColor(Color(hex: "#D8B878")).font(.subheadline.bold())
                            }
                            Text(titleForGame(row))
                                .foregroundColor(.white)
                                .font(.subheadline)
                            HStack { Spacer(); badge(row.result ?? "") }
                        }
                        .padding(12)
                        .background(Color.white.opacity(0.04))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.06)))
                        .cornerRadius(10)
                    }
                } else {
                    ForEach(Array(propResults.enumerated()), id: \.offset) { _, row in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(formatDate(row.game_date)).foregroundColor(.gray).font(.caption)
                                Spacer()
                                Text(formatOdds(row.odds)).foregroundColor(Color(hex: "#D8B878")).font(.subheadline.bold())
                            }
                            Text(titleForProp(row))
                                .foregroundColor(.white)
                                .font(.subheadline)
                            HStack { Spacer(); badge(row.result ?? "") }
                        }
                        .padding(12)
                        .background(Color.white.opacity(0.04))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.06)))
                        .cornerRadius(10)
                    }
                }
            }
        }
    }

    private func badge(_ t: String) -> some View { Text(t.uppercased()).font(.caption.bold()).padding(.horizontal, 8).padding(.vertical, 4).background(colorFor(t).opacity(0.2)).foregroundColor(colorFor(t)).cornerRadius(8) }
    private func colorFor(_ r: String) -> Color { r == "won" ? .green : (r == "push" ? .yellow : .red) }

    private func titleForGame(_ g: GameResult) -> String {
        if let txt = g.pick_text, !txt.isEmpty { return txt }
        return g.matchup ?? ""
    }
    private func titleForProp(_ p: PropResult) -> String {
        if let txt = p.pick_text, !txt.isEmpty { return formatPropDisplay(txt) }
        let base = [p.player_name, p.prop_type?.replacingOccurrences(of: "_", with: " ").capitalized, p.bet?.uppercased(), p.line_value].compactMap { $0 }.joined(separator: " ")
        return base
    }

    private func aggregateRecord() -> (Int, Int, Int) {
        var w = 0, l = 0, d = 0
        if selectedTab == 0 {
            for g in gameResults {
                let r = g.result ?? ""
                if r == "won" { w += 1 } else if r == "lost" { l += 1 } else if r == "push" { d += 1 }
            }
        } else {
            for p in propResults {
                let r = p.result ?? ""
                if r == "won" { w += 1 } else if r == "lost" { l += 1 } else if r == "push" { d += 1 }
            }
        }
        return (w, l, d)
    }

    private func formatDate(_ iso: String?) -> String {
        guard let iso = iso, let day = iso.split(separator: "T").first else { return "" }
        let parts = day.split(separator: "-")
        if parts.count == 3, let m = Int(parts[1]), let d = Int(parts[2]) {
            let names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
            return "\(names[max(1,min(12,m))-1]) \(d)"
        }
        return String(day)
    }

    private func formatOdds(_ s: String?) -> String {
        formatAmericanOdds(s)
    }

    private func sinceForTimeframe() -> String? {
        let tz = TimeZone(identifier: "America/New_York")!
        var cal = Calendar(identifier: .gregorian); cal.timeZone = tz
        let now = Date()
        switch timeframe {
        case "7d": return cal.date(byAdding: .day, value: -7, to: now).map { toISODate($0) }
        case "30d": return cal.date(byAdding: .day, value: -30, to: now).map { toISODate($0) }
        case "90d": return cal.date(byAdding: .day, value: -90, to: now).map { toISODate($0) }
        case "ytd": return Calendar.current.date(from: DateComponents(year: Calendar.current.component(.year, from: now), month: 1, day: 1)).map { toISODate($0) }
        default: return nil
        }
    }

    private func toISODate(_ d: Date) -> String {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]
        return f.string(from: d)
    }

    private func loadBillfold() async {
        loadingData = true; errorData = nil
        do {
            let since = sinceForTimeframe()
            async let g: [GameResult] = try SupabaseAPI.fetchGameResults(since: since)
            async let p: [PropResult] = try SupabaseAPI.fetchPropResults(since: since)
            let (gg, pp) = try await (g, p)
            gameResults = gg
            propResults = pp
        } catch {
            errorData = "Failed to load data"
        }
        loadingData = false
    }

    // MARK: - Auth section (same styling as BetCard)
    private var billfoldHeader: some View {
        VStack(spacing: 10) {
            AsyncImage(url: URL(string: "https://www.betwithgary.ai/coin2.png")) { phase in
                switch phase {
                case .empty: ProgressView().tint(Color(hex: "#B8953F"))
                case .success(let img): img.resizable().scaledToFit().frame(width: 120, height: 120)
                case .failure: Image(systemName: "seal.fill").resizable().scaledToFit().frame(width: 110, height: 110).foregroundColor(Color(hex: "#B8953F"))
                @unknown default: EmptyView()
                }
            }
            Text("BILLFOLD").font(.title2.weight(.heavy)).foregroundColor(.white)
            Divider().overlay(Color.white.opacity(0.15))
        }
    }

    private var billfoldFields: some View {
        VStack(alignment: .leading, spacing: 14) {
            Group {
                Text("Email address").foregroundColor(.gray)
                TextField("you@example.com", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    .disableAutocorrection(true)
                    .foregroundColor(.black)
                    .padding(12)
                    .background(Color.white)
                    .cornerRadius(8)
            }
            Group {
                Text("Password").foregroundColor(.gray)
                SecureField("••••••••", text: $password)
                    .textContentType(.password)
                    .foregroundColor(.black)
                    .padding(12)
                    .background(Color.white)
                    .cornerRadius(8)
            }
            HStack(alignment: .center) {
                Toggle(isOn: $remember) { Text("Remember me").foregroundColor(.gray) }.labelsHidden()
                Text("Remember me").foregroundColor(.gray).font(.footnote)
                Spacer()
                Button("Forgot password?") { Task { try? await AuthAPI.requestPasswordReset(email: email) } }
                    .foregroundColor(Color(hex: "#B8953F")).font(.footnote.bold())
            }
            if let e = error { Text(e).foregroundColor(.red).font(.footnote) }
        }
    }

    private var billfoldActions: some View {
        VStack(spacing: 12) {
            Button {
                Task {
                    loadingSignin = true; defer { loadingSignin = false }
                    do { let s = try await AuthAPI.signIn(email: email, password: password); AuthAPI.save(session: s, remember: remember); signedIn = true } catch { self.error = (error as? LocalizedError)?.errorDescription ?? "Sign in failed" }
                }
            } label: { Text(loadingSignin ? "SIGNING IN…" : "SIGN IN").frame(maxWidth: .infinity) }
            .buttonStyle(GoldButtonStyle())

            HStack { Text("Don't have an account?").foregroundColor(.gray); Spacer() }
            Button("Sign up here") { Task { try? await AuthAPI.signUp(email: email, password: password) } }
                .foregroundColor(Color(hex: "#B8953F")).font(.body.bold())
        }
    }

    private var billfoldFooter: some View {
        VStack(spacing: 6) {
            Divider().overlay(Color.white.opacity(0.15))
            Text("By signing in, you agree to Gary's Terms of Service and Privacy Policy")
                .foregroundColor(.gray)
                .font(.footnote)
                .multilineTextAlignment(.center)
        }
        .padding(.bottom, 16)
    }
}

struct BetCardView: View {
    @State private var email: String = ""
    @State private var password: String = ""
    @State private var remember: Bool = false
    @State private var error: String?
    @State private var loading = false
    @State private var signedIn: Bool = {
        if let _ = try? JSONSerialization.jsonObject(with: UserDefaults.standard.data(forKey: "supabase.session") ?? Data()) { return true }
        return false
    }()

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(hex: "#101112"), Color(hex: "#151617")], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
            if signedIn {
                WebContainer(url: URL(string: "https://www.betwithgary.ai/betcard")!)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView { VStack(spacing: 18) { authHeader; fields; actions; footer } .padding(.horizontal, 24).padding(.top, 40) }
            }
        }
        .ignoresSafeArea(edges: .bottom)
    }

    private var authHeader: some View {
        VStack(spacing: 10) {
            AsyncImage(url: URL(string: "https://www.betwithgary.ai/coin2.png")) { phase in
                switch phase {
                case .empty:
                    ProgressView().tint(Color(hex: "#B8953F"))
                case .success(let img):
                    img.resizable().scaledToFit().frame(width: 140, height: 140)
                case .failure:
                    Image(systemName: "seal.fill").resizable().scaledToFit().frame(width: 120, height: 120).foregroundColor(Color(hex: "#B8953F"))
                @unknown default:
                    EmptyView()
                }
            }
            Divider().overlay(Color.white.opacity(0.2)).padding(.top, 6)
        }
    }

    private var fields: some View {
        VStack(alignment: .leading, spacing: 14) {
            Group {
                Text("Email address").foregroundColor(.white.opacity(0.75))
                TextField("you@example.com", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    .disableAutocorrection(true)
                    .foregroundColor(.black)
                    .padding(12)
                    .background(Color.white)
                    .cornerRadius(8)
            }
            Group {
                Text("Password").foregroundColor(.white.opacity(0.75))
                SecureField("••••••••", text: $password)
                    .textContentType(.password)
                    .foregroundColor(.black)
                    .padding(12)
                    .background(Color.white)
                    .cornerRadius(8)
            }
            HStack(alignment: .center) {
                Toggle(isOn: $remember) { Text("Remember me").foregroundColor(.gray) }
                    .labelsHidden()
                Text("Remember me").foregroundColor(.white.opacity(0.75)).font(.footnote)
                Spacer()
                Button("Forgot password?") {
                    Task { try? await AuthAPI.requestPasswordReset(email: email) }
                }.foregroundColor(Color(hex: "#D8B878")).font(.footnote.bold())
            }
            if let e = error { Text(e).foregroundColor(.red).font(.footnote) }
        }
    }

    private var actions: some View {
        VStack(spacing: 12) {
            Button {
                Task {
                    loading = true
                    defer { loading = false }
                    do {
                        let s = try await AuthAPI.signIn(email: email, password: password)
                        AuthAPI.save(session: s, remember: remember)
                        signedIn = true
                    } catch {
                        self.error = (error as? LocalizedError)?.errorDescription ?? "Sign in failed"
                    }
                }
            } label: {
                Text(loading ? "SIGNING IN…" : "SIGN IN").frame(maxWidth: .infinity)
            }
            .buttonStyle(GoldButtonStyle())

            HStack { Text("Don't have an account?").foregroundColor(.gray); Spacer() }
            Button("Sign up here") {
                Task {
                    do { try await AuthAPI.signUp(email: email, password: password); } catch {}
                }
            }.foregroundColor(Color(hex: "#D8B878")).font(.body.bold())
        }
    }

    private var footer: some View {
        VStack(spacing: 6) {
            Divider().overlay(Color.white.opacity(0.15))
            Text("By signing in, you agree to Gary's Terms of Service and Privacy Policy")
                .foregroundColor(.white.opacity(0.6))
                .font(.footnote)
                .multilineTextAlignment(.center)
        }
        .padding(.bottom, 16)
    }
}

// Minimal Supabase Auth client (password grant) scoped to this file to avoid project re-gen
private enum AuthAPI {
    struct Session: Codable { let access_token: String; let token_type: String; let expires_in: Int; let refresh_token: String }
    enum Err: Error, LocalizedError { case invalid, server(String), unknown; var errorDescription: String? { switch self { case .invalid: return "Invalid email or password."; case .server(let m): return m; case .unknown: return "Unexpected error" } } }
    private static var base: URL { Secrets.supabaseURL.appendingPathComponent("/auth/v1") }
    private static var headers: [String:String] { ["apikey": Secrets.supabaseAnonKey, "Content-Type": "application/json"] }
    private static let k = "supabase.session"
    static func save(session: Session, remember: Bool) { if let d = try? JSONEncoder().encode(session) { UserDefaults.standard.set(d, forKey: k); if remember { UserDefaults.standard.synchronize() } } }
    static func signIn(email: String, password: String) async throws -> Session {
        var c = URLComponents(url: base.appendingPathComponent("/token"), resolvingAgainstBaseURL: false)!; c.queryItems = [.init(name: "grant_type", value: "password")]
        var r = URLRequest(url: c.url!); headers.forEach{ r.setValue($1, forHTTPHeaderField: $0) }; r.httpMethod = "POST"; r.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "password": password])
        let (data, res) = try await URLSession.shared.data(for: r); guard let h = res as? HTTPURLResponse else { throw Err.unknown }
        if h.statusCode == 200 { return try JSONDecoder().decode(Session.self, from: data) }
        if h.statusCode == 400 || h.statusCode == 401 { throw Err.invalid }
        throw Err.server(String(data: data, encoding: .utf8) ?? "")
    }
    static func signUp(email: String, password: String) async throws {
        var r = URLRequest(url: base.appendingPathComponent("/signup")); headers.forEach{ r.setValue($1, forHTTPHeaderField: $0) }; r.httpMethod = "POST"; r.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "password": password]);
        let (_, res) = try await URLSession.shared.data(for: r); guard let h = res as? HTTPURLResponse, (200...299).contains(h.statusCode) else { throw Err.unknown }
    }
    static func requestPasswordReset(email: String) async throws {
        var r = URLRequest(url: base.appendingPathComponent("/recover")); headers.forEach{ r.setValue($1, forHTTPHeaderField: $0) }; r.httpMethod = "POST"; r.httpBody = try JSONSerialization.data(withJSONObject: ["email": email]);
        let (_, res) = try await URLSession.shared.data(for: r); guard let h = res as? HTTPURLResponse, (200...299).contains(h.statusCode) else { throw Err.unknown }
    }
}

struct WebContainer: UIViewRepresentable {
    let url: URL
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = .black
        view.scrollView.backgroundColor = .black
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.scrollView.bounces = false
        view.pageZoom = 1.12
        return view
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {
        if uiView.url != url {
            uiView.load(URLRequest(url: url))
        }
        if uiView.pageZoom < 1.1 {
            uiView.pageZoom = 1.12
        }
    }
}

// MARK: - Cards

struct PickCardWeb: View {
    let pick: GaryPick
    @State private var flipped = false
    var body: some View {
        ZStack {
            // Front
            if !flipped {
                HStack(spacing: 0) {
                    // Left pane
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("LEAGUE").foregroundColor(.gray).font(.caption.bold())
                                Text(pick.league ?? "").foregroundColor(.white).font(.headline.bold())
                            }
                            Spacer()
                            VStack(alignment: .leading, spacing: 2) {
                                Text("ODDS").foregroundColor(.gray).font(.caption.bold())
                                Text(oddsFromPick(pick.pick)).foregroundColor(Color(hex: "#B8953F")).font(.headline.bold())
                            }
                            Spacer()
                            VStack(alignment: .leading, spacing: 2) {
                                Text("MATCHUP").foregroundColor(.gray).font(.caption.bold())
                                Text("\(pick.awayTeam ?? "") @ \(pick.homeTeam ?? "")").foregroundColor(.white).font(.headline.bold()).lineLimit(1)
                            }
                        }
                        Divider().overlay(Color.gray.opacity(0.3))
                        Text("GARY'S PICK").foregroundColor(.gray).font(.footnote.bold())
                        Text(pick.pick ?? "").foregroundColor(Color(hex: "#B8953F")).font(.title2.bold())
                        if let r = pick.rationale, !r.isEmpty {
                            Text(r).foregroundColor(.white).font(.subheadline).lineLimit(3)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)

                    // Divider (gold)
                    Rectangle().fill(Color(hex: "#B8953F")).frame(width: 2)

                    // Right rail
                    VStack(alignment: .center, spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("GAME TIME").foregroundColor(.gray).font(.caption.bold())
                            Text(labelEST(pick.time)).foregroundColor(.white).font(.headline.bold())
                        }
                        Spacer(minLength: 8)
                        AsyncImage(url: URL(string: "https://www.betwithgary.ai/coin2.png")) { phase in
                            switch phase {
                            case .empty:
                                ProgressView().tint(Color(hex: "#B8953F"))
                            case .success(let img):
                                img.resizable().scaledToFit().frame(width: 64, height: 64)
                            case .failure:
                                Image(systemName: "seal.fill").resizable().scaledToFit().frame(width: 64, height: 64).foregroundColor(Color(hex: "#B8953F"))
                            @unknown default:
                                EmptyView()
                            }
                        }
                        Spacer(minLength: 8)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("CONFIDENCE").foregroundColor(.gray).font(.caption.bold())
                            Text("\(pick.confidence.map { Int(round($0*100)) } ?? 0)%").foregroundColor(Color(hex: "#B8953F")).font(.title3.bold())
                        }
                        Button { withAnimation { flipped = true } } label: {
                            Text("VIEW ANALYSIS").font(.footnote.bold()).foregroundColor(.black)
                                .padding(.horizontal, 14).padding(.vertical, 10)
                                .background(Color(hex: "#B8953F"))
                                .cornerRadius(8)
                                .shadow(color: Color.black.opacity(0.35), radius: 6, x: 0, y: 2)
                        }
                    }
                    .padding()
                    .frame(width: 120)
                    .background(Color(hex: "#2A2A2A"))
                    .clipShape(RoundedCorner(radius: 16, corners: [.topRight, .bottomRight]))
                }
                .background(Color.black.opacity(0.9))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(hex: "#B8953F"), lineWidth: 1.5))
                .cornerRadius(16)
            } else {
                // Back
                VStack(alignment: .leading, spacing: 8) {
                    Text("Gary's Analysis").foregroundColor(Color(hex: "#B8953F")).font(.headline)
                    ScrollView {
                        Text(pick.rationale ?? "").foregroundColor(.white).font(.subheadline).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    HStack {
                        Text("Confidence: \(pick.confidence.map { Int(round($0*100)) } ?? 0)%").foregroundColor(.gray).font(.footnote)
                        Spacer()
                        Text((pick.time ?? "") + (pick.time == nil ? "" : " EST")).foregroundColor(.gray).font(.footnote)
                    }
                }
                .padding()
                .background(Color.black.opacity(0.9))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(hex: "#B8953F"), lineWidth: 1.5))
                .cornerRadius(16)
                .onTapGesture { withAnimation { flipped = false } }
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { withAnimation(.easeInOut(duration: 0.35)) { flipped.toggle() } }
    }
}

// Mobile card matching the provided screenshot (minus Bet/Fade)
struct PickCardMobile: View {
    let pick: GaryPick
    @State private var showAnalysis = false
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header row
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "square.grid.2x2.fill").foregroundColor(Color(hex: "#B8953F"))
                    Text((pick.league ?? "").uppercased()).foregroundColor(.white).font(.subheadline.bold())
                }
                Spacer()
                HStack(spacing: 6) {
                    Image(systemName: "clock").foregroundColor(Color(hex: "#B8953F"))
                    Text(labelEST(pick.time)).foregroundColor(Color(hex: "#B8953F")).font(.subheadline.bold())
                }
            }
            // Teams row
            HStack {
                Text(pick.awayTeam ?? "").foregroundColor(.white).font(.title3.bold())
                Spacer()
                Text("@").foregroundColor(.gray)
                Spacer()
                Text(pick.homeTeam ?? "").foregroundColor(.white).font(.title3.bold())
            }
            Divider().overlay(Color.white.opacity(0.12))
            // Gary's pick
            HStack(spacing: 6) {
                Image(systemName: "bolt.fill").foregroundColor(Color(hex: "#B8953F"))
                Text("GARY'S PICK").foregroundColor(.gray).font(.footnote.bold())
            }
            Text(pick.pick ?? "")
                .foregroundColor(Color(hex: "#B8953F"))
                .font(.title2.bold())
            // Confidence
            HStack(spacing: 6) {
                Image(systemName: "chart.line.uptrend.xyaxis").foregroundColor(.gray)
                Text("Confidence: \(pick.confidence.map { Int(round($0*100)) } ?? 0)%")
                    .foregroundColor(.gray)
                    .font(.subheadline)
            }
            // Tap for Analysis
            Button { showAnalysis.toggle() } label: {
                HStack(spacing: 6) {
                    Image(systemName: "paperclip")
                    Text("Tap for Analysis")
                }
                .font(.footnote.bold())
                .foregroundColor(Color(hex: "#B8953F").opacity(0.7))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(Color.white.opacity(0.06))
                .cornerRadius(12)
            }
            .sheet(isPresented: $showAnalysis) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Gary's Analysis").font(.headline).foregroundColor(Color(hex: "#B8953F"))
                    ScrollView { Text(pick.rationale ?? "").foregroundColor(.white) }
                }
                .padding()
                .background(Color.black)
                .presentationDetents([.medium, .large])
            }
        }
        .padding(16)
        .background(Color(red: 28/255, green: 28/255, blue: 28/255))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(hex: "#B8953F").opacity(0.9), lineWidth: 1.5))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.35), radius: 10, x: 0, y: 4)
    }
}

struct PropRowWeb: View {
    let prop: PropPick
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header: Player / Team / Odds (gold)
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text((prop.player ?? prop.team) ?? "").foregroundColor(.white).font(.headline.bold())
                    if let team = prop.team { Text(team).foregroundColor(.gray).font(.subheadline) }
                }
                Spacer()
                Text(formatAmericanOdds(prop.odds)).foregroundColor(Color(hex: "#B8953F")).font(.title3.bold())
            }
            Divider().overlay(Color.white.opacity(0.12))
            // Gary's pick
            HStack(spacing: 6) {
                Image(systemName: "bolt.fill").foregroundColor(Color(hex: "#B8953F"))
                Text("GARY'S PICK").foregroundColor(.gray).font(.caption.bold())
            }
            Text(formatPropDisplay(prop.prop))
                .foregroundColor(.white)
                .font(.headline)
            // Bottom row: Bet + EV
            HStack {
                if let bet = prop.bet {
                    Text(bet.uppercased())
                        .foregroundColor(bet.lowercased() == "over" ? .green : .red)
                        .font(.subheadline.bold())
                }
                Spacer()
                if let ev = computeEV(confidence: prop.confidence, american: prop.odds) {
                    // Scale down by 10x per request so 282.5% -> 28.25%
                    Text("EV: \(String(format: "%.2f%%", (ev*100)/10.0))")
                        .foregroundColor(.gray)
                        .font(.footnote)
                }
            }
        }
        .padding(16)
        .background(Color(red: 28/255, green: 28/255, blue: 28/255))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(hex: "#B8953F").opacity(0.9), lineWidth: 1.5))
        .cornerRadius(16)
    }
}

// Mobile prop card aligned to Gary's Picks styling
struct PropCardMobile: View {
    let prop: PropPick
    @State private var showAnalysis = false
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header with player/team and odds
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text((prop.player ?? prop.team) ?? "").foregroundColor(.white).font(.headline.bold())
                    if let team = prop.team { Text(team).foregroundColor(.gray).font(.subheadline) }
                }
                Spacer()
                Text(formatAmericanOdds(prop.odds)).foregroundColor(Color(hex: "#B8953F")).font(.title3.bold())
            }
            Divider().overlay(Color.white.opacity(0.12))
            HStack(spacing: 6) {
                Image(systemName: "bolt.fill").foregroundColor(Color(hex: "#B8953F"))
                Text("GARY'S PICK").foregroundColor(.gray).font(.caption.bold())
            }
            Text(formatPropDisplay(prop.prop)).foregroundColor(.white).font(.headline)
            HStack {
                if let bet = prop.bet {
                    Text(bet.uppercased())
                        .foregroundColor(bet.lowercased() == "over" ? .green : .red)
                        .font(.subheadline.bold())
                }
                Spacer()
                if let ev = computeEV(confidence: prop.confidence, american: prop.odds) {
                    Text("EV: \(String(format: "%.2f%%", (ev*100)/10.0))")
                        .foregroundColor(.gray)
                        .font(.footnote)
                }
            }

            if let a = prop.analysis, !a.isEmpty {
                Button { showAnalysis.toggle() } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "paperclip")
                        Text("Tap for Analysis")
                    }
                    .font(.footnote.bold())
                    .foregroundColor(Color(hex: "#B8953F").opacity(0.7))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Color.white.opacity(0.06))
                    .cornerRadius(12)
                }
                .sheet(isPresented: $showAnalysis) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Gary's Analysis").font(.headline).foregroundColor(Color(hex: "#B8953F"))
                        ScrollView {
                            let bullets = a.components(separatedBy: "•").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
                            VStack(alignment: .leading, spacing: 8) {
                                ForEach(bullets, id: \.self) { line in
                                    HStack(alignment: .top, spacing: 8) {
                                        Text("•").foregroundColor(Color(hex: "#B8953F"))
                                        Text(line).foregroundColor(.white).frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                }
                            }
                        }
                    }
                    .padding()
                    .background(Color.black)
                    .presentationDetents([.medium, .large])
                }
            }
        }
        .padding(16)
        .background(Color(red: 28/255, green: 28/255, blue: 28/255))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(hex: "#B8953F").opacity(0.9), lineWidth: 1.5))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.3), radius: 6, x: 0, y: 2)
    }
}

// Website-like wide free pick card with right rail
struct FreePickCardWide: View {
    let pick: GaryPick
    var body: some View {
        HStack(spacing: 0) {
            // Left main content
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("LEAGUE").foregroundColor(.gray).font(.caption.bold())
                        Text(pick.league ?? "").foregroundColor(.white).font(.headline.bold())
                    }
                    Spacer()
                    VStack(alignment: .leading, spacing: 2) {
                        Text("ODDS").foregroundColor(.gray).font(.caption.bold())
                        Text(oddsFromPick(pick.pick)).foregroundColor(Color(hex: "#B8953F")).font(.headline.bold())
                    }
                    Spacer()
                    VStack(alignment: .leading, spacing: 2) {
                        Text("MATCHUP").foregroundColor(.gray).font(.caption.bold())
                        Text("\(pick.awayTeam ?? "") @ \(pick.homeTeam ?? "")").foregroundColor(.white).font(.headline.bold())
                            .lineLimit(1)
                    }
                }
                Divider().overlay(Color.gray.opacity(0.3))
                Text("GARY'S PICK").foregroundColor(.gray).font(.footnote.bold())
                Text(pick.pick ?? "")
                    .foregroundColor(Color(hex: "#B8953F"))
                    .font(.title2.bold())
                if let r = pick.rationale, !r.isEmpty {
                    Text(r)
                        .foregroundColor(.white)
                        .font(.subheadline)
                        .lineLimit(3)
                }
                Spacer(minLength: 0)
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)

            // Right rail
            VStack(alignment: .center, spacing: 10) {
                Rectangle().fill(Color(hex: "#B8953F")).frame(width: 1)
            }
            .frame(width: 1)

            VStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("GAME TIME").foregroundColor(.gray).font(.caption.bold())
                    Text(labelEST(pick.time))
                        .foregroundColor(.white)
                        .font(.headline.bold())
                }
                Spacer()
                AsyncImage(url: URL(string: "https://www.betwithgary.ai/coin2.png")) { phase in
                    switch phase {
                    case .empty:
                        ProgressView().tint(Color(hex: "#B8953F"))
                    case .success(let img):
                        img.resizable().scaledToFit().frame(width: 64, height: 64)
                    case .failure:
                        Image(systemName: "seal.fill").resizable().scaledToFit().frame(width: 64, height: 64).foregroundColor(Color(hex: "#B8953F"))
                    @unknown default:
                        EmptyView()
                    }
                }
                Spacer()
                VStack(alignment: .leading, spacing: 2) {
                    Text("CONFIDENCE").foregroundColor(.gray).font(.caption.bold())
                    Text("\(pick.confidence.map { Int(round($0*100)) } ?? 0)%")
                        .foregroundColor(Color(hex: "#B8953F"))
                        .font(.title3.bold())
                }
                Button {
                    // Scroll or flip to analysis in Picks page
                } label: {
                    Text("VIEW ANALYSIS")
                        .font(.footnote.bold())
                        .foregroundColor(.black)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color(hex: "#B8953F"))
                        .cornerRadius(8)
                }
            }
            .padding()
            .frame(width: 160)
        }
        .background(Color.black.opacity(0.9))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(hex: "#B8953F"), lineWidth: 1.5))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.5), radius: 20, x: 0, y: 10)
    }
}

private func oddsFromPick(_ pick: String?) -> String {
    guard let s = pick else { return "" }
    if let match = s.split(separator: " ").last { return String(match) }
    return ""
}

func labelEST(_ t: String?) -> String {
    guard let time = t, !time.isEmpty else { return "" }
    if time.uppercased().contains("EST") { return time }
    return time + " EST"
}

// Button styles & EV helper
struct GoldButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundColor(Color(hex: "#1A1B1D"))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(Color(hex:"#D8B878"))
            .cornerRadius(10)
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

struct FadeButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(Color.gray.opacity(0.35))
            .cornerRadius(10)
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

func computeEV(confidence: Double?, american: String?) -> Double? {
    guard let p = confidence, let aStr = american, let am = Int(aStr.replacingOccurrences(of: "+", with: "")) else { return nil }
    let b: Double = am > 0 ? Double(am)/100.0 : 100.0/Double(abs(am))
    // p is expected as percent (e.g., 72.5 -> 0.725) in our DB sometimes; normalize if > 1
    let prob = p > 1.0 ? (p / 100.0) : p
    return prob*b - (1-prob)
}

// MARK: - Formatting helpers
func formatPropDisplay(_ raw: String?) -> String {
    guard var s = raw, !s.isEmpty else { return "" }
    s = s.replacingOccurrences(of: "_", with: " ")
    let parts = s.split(separator: " ", omittingEmptySubsequences: true).map(String.init)
    if parts.isEmpty { return s.capitalized }
    var typeWords = parts
    var linePart: String? = nil
    if let last = parts.last, Double(last) != nil {
        linePart = last
        typeWords = Array(parts.dropLast())
    }
    let typeTitle = typeWords.joined(separator: " ").capitalized
    if let line = linePart { return "\(typeTitle) \(line)" }
    return typeTitle
}

func formatAmericanOdds(_ s: String?) -> String {
    guard let s = s, !s.isEmpty else { return "" }
    if s.hasPrefix("+") || s.hasPrefix("-") { return s }
    if let n = Int(s) {
        return n > 0 ? "+\(n)" : "\(n)"
    }
    return s
}


// MARK: - Access (Intro) Screen embedded here so it's always compiled
struct AccessView: View {
    @State private var showDisclaimer = true
    @AppStorage("hasEntered") private var hasEntered: Bool = false
    @AppStorage("selectedTab") private var selectedTab: Int = 0
    var body: some View {
        ZStack {
            LinearGradient(colors: [.black, .black.opacity(0.92)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            VStack(spacing: 16) {
                Spacer(minLength: 10)
                AsyncImage(url: URL(string: "https://www.betwithgary.ai/coin2.png")) { phase in
                    switch phase {
                    case .empty: ProgressView().tint(Color(hex: "#B8953F"))
                    case .success(let img): img.resizable().scaledToFit().frame(width: 320, height: 320)
                    case .failure: Image(systemName: "seal.fill").resizable().scaledToFit().frame(width: 280, height: 280).foregroundColor(Color(hex: "#B8953F"))
                    @unknown default: EmptyView()
                    }
                }
                HStack(spacing: 12) {
                    Chip(icon: "chart.line.uptrend.xyaxis", text: "Smart EV")
                    Chip(icon: "brain.head.profile", text: "AI Reasoning")
                    Chip(icon: "lock.shield", text: "No Spam")
                }
                .padding(.horizontal)
                VStack(spacing: 12) {
                    Button {
                        hasEntered = true
                        selectedTab = 0
                    } label: { Text("Access Picks").frame(maxWidth: .infinity) }
                    .buttonStyle(GoldButtonStyle())
                    Button {
                        hasEntered = true
                        selectedTab = 1
                    } label: {
                        Text("See Free Pick of the Day").font(.footnote.bold()).foregroundColor(Color(hex: "#B8953F"))
                    }
                }
                .padding(.horizontal, 24)
            }
        }
        .sheet(isPresented: $showDisclaimer) { DisclaimerView(show: $showDisclaimer) }
    }
}

private struct Chip: View {
    let icon: String
    let text: String
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon).foregroundColor(Color(hex: "#B8953F"))
            Text(text).foregroundColor(.white).font(.footnote.bold())
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(Color.white.opacity(0.06))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(hex: "#B8953F").opacity(0.6), lineWidth: 1))
        .cornerRadius(14)
    }
}

struct DisclaimerView: View {
    @Binding var show: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Important Disclaimer").font(.headline).foregroundColor(Color(hex: "#B8953F"))
            ScrollView {
                Text("Gary AI provides informational sports betting analysis only. No wagers are placed within this app. Odds and picks are not a guarantee of results. Users must comply with all applicable laws and must be of legal age in their jurisdiction. This app does not facilitate real-money gambling, deposits, or withdrawals. If you or someone you know has a gambling problem, call the National Problem Gambling Helpline at 1-800-522-4700. By tapping ‘I Understand’, you acknowledge these terms.")
                    .foregroundColor(.white)
                    .font(.subheadline)
            }
            HStack {
                Spacer()
                Button("I Understand") { show = false }
                    .buttonStyle(GoldButtonStyle())
            }
        }
        .padding()
        .background(Color.black)
        .presentationDetents([.medium])
    }
}

