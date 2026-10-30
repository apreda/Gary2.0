import SwiftUI

/// One post in tonight's slideshow (get_x_wire).
struct XWirePost: Decodable, Identifiable, Equatable {
    struct Media: Decodable, Equatable {
        let type: String
        let url: String
        let width: Int?
        let height: Int?
    }
    let id: String
    let username: String
    let name: String?
    let avatar_url: String?
    let verified_type: String?
    let text: String
    let media: Media?
    let league: String?
    let matchup: String?
    let big_game: Bool?
    let posted_at: String?
}

/// TONIGHT ON X (founder, Oct 29 2026): under the board, where the Wire's injury and moment lines were ("people
/// get that kind of information elsewhere"), real people's takes on tonight's games: betting voices and the
/// talking heads, never a company or a news bulletin. The app draws each post in X's own layout on Gary's dark
/// card (X's embeds were "massive size wise", wore X's blue and lagged in and out), every card one height so the
/// show never jumps. A slow slideshow: seven seconds a post, the bars filling as it plays; a swipe moves it by
/// hand and a finger on it holds it. A tap opens the post in X. No posts yet, no section.
struct HomeXWire: View {
    @Environment(\.readingPageActive) private var activePage
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var posts: [XWirePost] = []
    @State private var index = 0
    @State private var progress: CGFloat = 0
    @State private var holding = false
    @State private var pageWidth: CGFloat = 0
    /// Each card's height at the page's width; the show takes the one on screen.
    @State private var heights: [String: CGFloat] = [:]
    /// Which way the last move went, so the next card comes in from that side.
    @State private var forward = true
    /// A finger pulling the card sideways, before it lets go.
    @State private var dragX: CGFloat = 0

    private static let dwell: Double = 7

    var body: some View {
        // A stack that is always there, so the loader below runs before there is anything to show.
        VStack(spacing: 0) {
            Color.clear.frame(height: 0)
                .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { pageWidth = $0 }
            if !posts.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    header(count: posts.count)
                    // One card at a time: the next slides in as the last slides out, and the frame eases to the
                    // new card's height in the same motion, so a tall post and a short one never snap (founder,
                    // Oct 29 2026: "when the tweets are different sizes there is a harsh like transition").
                    ZStack(alignment: .top) {
                        if posts.indices.contains(index) {
                            XPostCard(post: posts[index])
                                .id(posts[index].id)
                                .transition(cardTransition)
                        }
                    }
                    .frame(height: max(posts.indices.contains(index) ? heights[posts[index].id] ?? 160 : 160, 120), alignment: .top)
                    .offset(x: dragX)
                    .clipped()
                    .contentShape(Rectangle())
                    // A finger on the show holds it; pulled sideways and let go, it moves a card that way.
                    .simultaneousGesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { v in
                                if !holding { holding = true }
                                let dx = v.translation.width
                                if abs(dx) > 8, abs(dx) > abs(v.translation.height) { dragX = dx * 0.5 }
                            }
                            .onEnded { v in
                                holding = false
                                let dx = v.translation.width
                                withAnimation(Self.slide) { dragX = 0 }
                                if posts.count > 1, abs(dx) > 50, abs(dx) > abs(v.translation.height) { step(dx < 0 ? 1 : -1) }
                            }
                    )
                    // Every card measured at the page's width, off screen.
                    .background(alignment: .top) {
                        ZStack(alignment: .top) {
                            ForEach(posts) { post in
                                XPostCard(post: post, measuring: true)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { heights[post.id] = $0 }
                            }
                        }
                        .frame(width: max(pageWidth - 2 * GaryLayout.gutter, 1))
                        .hidden()
                    }
                }
                .pageGutter()
                .task(id: AdvanceKey(index: index, count: posts.count, holding: holding,
                                     live: activePage && scenePhase == .active)) {
                    await advance(count: posts.count)
                }
            }
        }
        .task(id: activePage && scenePhase == .active) {
            guard activePage, scenePhase == .active else { return }
            while !Task.isCancelled {
                if let fresh = await SupabaseAPI.fetchXWire(date: SupabaseAPI.todayEST()), fresh != posts {
                    // The post on screen stays on screen through a refresh; the new ones join around it.
                    let showing = posts.indices.contains(index) ? posts[index].id : nil
                    posts = fresh
                    index = showing.flatMap { id in fresh.firstIndex { $0.id == id } } ?? 0
                }
                do { try await Task.sleep(for: .seconds(300)) } catch { break }
            }
        }
    }

    private struct AdvanceKey: Equatable { let index: Int; let count: Int; let holding: Bool; let live: Bool }

    /// The bar fills over the dwell, then the next post slides in. A hand on the show holds it; a swipe starts
    /// the next dwell from zero.
    @MainActor private func advance(count: Int) async {
        progress = 0
        guard count > 1, !holding, activePage, scenePhase == .active else { return }
        withAnimation(.linear(duration: Self.dwell)) { progress = 1 }
        do { try await Task.sleep(for: .seconds(Self.dwell)) } catch { return }
        step(1)
    }

    /// The slow ease every move shares, the height's and the slide's.
    private static let slide = Animation.easeInOut(duration: 0.75)

    private var cardTransition: AnyTransition {
        if reduceMotion { return .opacity }
        return .asymmetric(insertion: .move(edge: forward ? .trailing : .leading).combined(with: .opacity),
                           removal: .move(edge: forward ? .leading : .trailing).combined(with: .opacity))
    }

    private func step(_ by: Int) {
        guard posts.count > 1 else { return }
        forward = by > 0
        withAnimation(Self.slide) { index = (index + by + posts.count) % posts.count }
    }

    private func header(count: Int) -> some View {
        HStack(spacing: 8) {
            XMark().fill(GaryColors.warmWhite).frame(width: 15, height: 15)
            Text("TONIGHT ON X")
                .font(GaryFonts.kicker(11, .heavy)).tracking(1.6)
                .foregroundStyle(GaryColors.warmWhite)
            Spacer()
            if count > 1 {
                HStack(spacing: 4) {
                    ForEach(0..<count, id: \.self) { i in
                        GeometryReader { g in
                            Capsule().fill(Color.white.opacity(0.18))
                                .overlay(alignment: .leading) {
                                    Capsule().fill(GaryColors.warmWhite)
                                        .frame(width: g.size.width * (i < index ? 1 : i == index ? progress : 0))
                                }
                        }
                        .frame(width: 18, height: 3)
                    }
                }
                .accessibilityHidden(true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Tonight on X")
    }
}

/// A post in X's own layout on Gary's card: picture, name and check, handle and age, the X mark, the words with
/// mentions and links in X's blue, one photo or video still at a set height, and the game it is about.
struct XPostCard: View {
    let post: XWirePost
    /// The invisible copy that sizes the show: no images to load, same shapes.
    var measuring = false
    @Environment(\.openURL) private var openURL

    private static let xBlue = Color(hex: "#1D9BF0")
    private static let xGray = Color(hex: "#8B98A5")

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 10) {
                picture(post.avatar_url).frame(width: 42, height: 42).clipShape(Circle())
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 4) {
                        Text(post.name ?? post.username)
                            .font(.system(size: 15, weight: .bold)).foregroundStyle(GaryColors.warmWhite)
                            .fitsOneLine()
                        if let check = checkColor {
                            Image(systemName: "checkmark.seal.fill").font(.system(size: 14)).foregroundStyle(check)
                        }
                    }
                    Text("@\(post.username) · \(age)")
                        .font(.system(size: 14)).foregroundStyle(Self.xGray)
                        .fitsOneLine()
                }
                Spacer(minLength: 6)
                XMark().fill(GaryColors.warmWhite).frame(width: 17, height: 17)
            }
            Text(styled)
                .font(.system(size: 15.5))
                .foregroundStyle(GaryColors.warmWhite)
                .fixedSize(horizontal: false, vertical: true)
            if let media = post.media {
                picture(media.url)
                    .frame(maxWidth: .infinity)
                    .frame(height: 168)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color.white.opacity(0.1)))
                    .overlay {
                        if media.type != "photo" {
                            Image(systemName: "play.fill").font(.system(size: 20, weight: .bold)).foregroundStyle(.white)
                                .frame(width: 52, height: 52).background(Circle().fill(Self.xBlue))
                        }
                    }
            }
            Spacer(minLength: 0)
            if let game = gameLine {
                Text(game)
                    .font(GaryFonts.kicker(10, .heavy)).tracking(1.4)
                    .foregroundStyle(GaryColors.gold.opacity(0.85))
                    .fitsOneLine()
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(LabInk.plate))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color.white.opacity(0.1), lineWidth: 1))
        .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .onTapGesture {
            if let url = URL(string: "https://x.com/\(post.username)/status/\(post.id)") { openURL(url) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Opens the post in X")
    }

    @ViewBuilder private func picture(_ url: String?) -> some View {
        if measuring || url == nil {
            Color.white.opacity(0.06)
        } else {
            AsyncImage(url: URL(string: url!)) { phase in
                if let image = phase.image { image.resizable().scaledToFill() } else { Color.white.opacity(0.06) }
            }
        }
    }

    /// X's check colors: blue for a person, gold for an organization, gray for government.
    private var checkColor: Color? {
        switch post.verified_type {
        case "blue": return Self.xBlue
        case "business": return Color(hex: "#E2B719")
        case "government": return Self.xGray
        default: return nil
        }
    }

    /// "12m", "2h", the way X stamps a post's age.
    private var age: String {
        guard let date = post.posted_at.flatMap(parseISO8601) else { return "" }
        let s = max(0, Date().timeIntervalSince(date))
        if s < 3600 { return "\(max(1, Int(s / 60)))m" }
        if s < 86_400 { return "\(Int(s / 3600))h" }
        return "\(Int(s / 86_400))d"
    }

    /// The words as written, a shortened link shown as its site ("actionnetwork.com"), never with X's "…".
    private var words: String {
        post.text.replacingOccurrences(of: #"\b([\w-]+(\.[\w-]+)*\.[a-z]{2,})/\S*…"#, with: "$1", options: .regularExpression)
            .replacingOccurrences(of: "…", with: "")
    }

    /// The words, with @mentions, #tags and links in X's blue.
    private var styled: AttributedString {
        let text = words
        var out = AttributedString(text)
        let ns = text as NSString
        guard let re = try? NSRegularExpression(pattern: #"(@\w{1,15}|#\w+|\b[\w.-]+\.(com|net|org|io|ai|co|tv|us)(/\S*)?)"#) else { return out }
        for m in re.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            guard let r = Range(m.range, in: text), let ar = Range(r, in: out) else { continue }
            out[ar].foregroundColor = Self.xBlue
        }
        return out
    }

    /// "PANTHERS @ PACKERS" under the post.
    private var gameLine: String? {
        guard let m = post.matchup else { return nil }
        let sides = m.components(separatedBy: " @ ")
        guard sides.count == 2 else { return m.uppercased() }
        return "\(Formatters.shortTeamName(sides[0], league: post.league)) @ \(Formatters.shortTeamName(sides[1], league: post.league))".uppercased()
    }
}

/// X's mark, drawn so the section names where the posts come from.
private struct XMark: Shape {
    func path(in r: CGRect) -> Path {
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: r.minX + x / 24 * r.width, y: r.minY + y / 24 * r.height) }
        var path = Path()
        path.move(to: p(18.9, 2)); path.addLine(to: p(22, 2)); path.addLine(to: p(15.2, 9.8)); path.addLine(to: p(23, 22))
        path.addLine(to: p(16.7, 22)); path.addLine(to: p(11.8, 15.6)); path.addLine(to: p(6.2, 22)); path.addLine(to: p(3, 22))
        path.addLine(to: p(10.3, 13.6)); path.addLine(to: p(1, 2)); path.addLine(to: p(7.4, 2)); path.addLine(to: p(11.8, 7.9))
        path.closeSubpath()
        path.move(to: p(17.8, 20)); path.addLine(to: p(19.5, 20)); path.addLine(to: p(6.3, 3.9)); path.addLine(to: p(4.5, 3.9))
        path.closeSubpath()
        return path
    }
}
