import SwiftUI
import WebKit

/// One post in tonight's slideshow (get_x_wire).
struct XWirePost: Decodable, Identifiable, Equatable {
    let id: String
    let username: String
    let name: String?
    let league: String?
    let matchup: String?
    let big_game: Bool?
}

/// TONIGHT ON X (founder, Oct 29 2026): under the board, where the Wire's injury and moment lines were ("people
/// get that kind of information elsewhere"), real people's takes on tonight's games: betting voices and the
/// talking heads, never a company or a news bulletin. Each post is X's own embed, so it reads as X pulled into
/// the app. A slow slideshow: seven seconds a post, the bars filling as it plays; a swipe moves it by hand and
/// holding it still pauses it. No posts yet, no section.
struct HomeXWire: View {
    @Environment(\.readingPageActive) private var activePage
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var posts: [XWirePost] = []
    /// Embeds X could not draw (deleted, protected, offline) drop out of the show.
    @State private var failed: Set<String> = []
    @State private var heights: [String: CGFloat] = [:]
    @State private var index = 0
    @State private var progress: CGFloat = 0
    @State private var holding = false

    private static let dwell: Double = 7
    private var shown: [XWirePost] { posts.filter { !failed.contains($0.id) } }

    var body: some View {
        let shown = self.shown
        // A stack that is always there, so the loader below runs before there is anything to show.
        VStack(spacing: 0) {
            Color.clear.frame(height: 0)
            if !shown.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    header(count: shown.count)
                    GeometryReader { geo in
                        TabView(selection: $index) {
                            ForEach(Array(shown.enumerated()), id: \.element.id) { i, post in
                                VStack(alignment: .leading, spacing: 8) {
                                    XEmbedView(postID: post.id, width: geo.size.width,
                                               onHeight: { h in heights[post.id] = h },
                                               onFail: { failed.insert(post.id) })
                                        .frame(height: heights[post.id] ?? 260, alignment: .top)
                                    if let game = gameLine(post) {
                                        Text(game)
                                            .font(GaryFonts.kicker(10, .heavy)).tracking(1.4)
                                            .foregroundStyle(GaryColors.gold.opacity(0.85))
                                            .fitsOneLine()
                                    }
                                }
                                .frame(maxHeight: .infinity, alignment: .top)
                                .tag(i)
                            }
                        }
                        .tabViewStyle(.page(indexDisplayMode: .never))
                    }
                    // The show is as tall as the post on screen, easing as the next one slides in.
                    .frame(height: (shown.indices.contains(index) ? heights[shown[index].id] : nil).map { $0 + 26 } ?? 286)
                    .animation(reduceMotion ? nil : .easeInOut(duration: 0.5), value: index)
                    .animation(.easeOut(duration: 0.25), value: heights)
                    .simultaneousGesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { _ in if !holding { holding = true } }
                            .onEnded { _ in holding = false }
                    )
                }
                .pageGutter()
                .task(id: AdvanceKey(index: index, count: shown.count, holding: holding,
                                     live: activePage && scenePhase == .active)) {
                    await advance(count: shown.count)
                }
            }
        }
        .task(id: activePage && scenePhase == .active) {
            guard activePage, scenePhase == .active else { return }
            while !Task.isCancelled {
                if let fresh = await SupabaseAPI.fetchXWire(date: SupabaseAPI.todayEST()), fresh != posts {
                    posts = fresh
                    if index >= max(shown.count, 1) { index = 0 }
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
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.8)) { index = (index + 1) % count }
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

    /// "PANTHERS @ PACKERS" under the post.
    private func gameLine(_ p: XWirePost) -> String? {
        guard let m = p.matchup else { return nil }
        let sides = m.components(separatedBy: " @ ")
        guard sides.count == 2 else { return m.uppercased() }
        return "\(Formatters.shortTeamName(sides[0], league: p.league)) @ \(Formatters.shortTeamName(sides[1], league: p.league))".uppercased()
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

/// One post as X draws it: X's own widget (dark, no tracking), in a web view that never scrolls on its own, so
/// the slideshow owns the swipe. Its height comes back from the page; a link inside opens in X or Safari.
struct XEmbedView: UIViewRepresentable {
    let postID: String
    let width: CGFloat
    let onHeight: (CGFloat) -> Void
    let onFail: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onHeight: onHeight, onFail: onFail) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.allowsInlineMediaPlayback = true
        config.userContentController.add(context.coordinator, name: "embed")
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.backgroundColor = .clear
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        web.loadHTMLString(Self.page(postID: postID, width: width), baseURL: URL(string: "https://betwithgary.ai"))
        context.coordinator.startTimeout()
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {}

    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        web.configuration.userContentController.removeScriptMessageHandler(forName: "embed")
    }

    private static func page(postID: String, width: CGFloat) -> String {
        let id = postID.filter(\.isNumber)
        let w = Int(min(max(width, 250), 550))
        return """
        <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
        <style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}#t>div,#t iframe{margin:0!important}</style>
        </head><body><div id="t"></div>
        <script>
        window.twttr=(function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0],t=window.twttr||{};if(d.getElementById(id))return t;js=d.createElement(s);js.id=id;js.src="https://platform.twitter.com/widgets.js";fjs.parentNode.insertBefore(js,fjs);t._e=[];t.ready=function(f){t._e.push(f);};return t;}(document,"script","twitter-wjs"));
        function report(){var h=document.getElementById('t').getBoundingClientRect().height;if(h>40)webkit.messageHandlers.embed.postMessage({h:h});}
        twttr.ready(function(t){t.widgets.createTweet("\(id)",document.getElementById('t'),{theme:'dark',dnt:true,conversation:'none',width:\(w)}).then(function(el){
          if(!el){webkit.messageHandlers.embed.postMessage({fail:true});return;}
          report();new ResizeObserver(report).observe(document.getElementById('t'));
        });});
        </script></body></html>
        """
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        let onHeight: (CGFloat) -> Void
        let onFail: () -> Void
        private var drawn = false
        init(onHeight: @escaping (CGFloat) -> Void, onFail: @escaping () -> Void) {
            self.onHeight = onHeight; self.onFail = onFail
        }

        /// X's widget gets twelve seconds to draw the post; after that it is dropped from the show.
        func startTimeout() {
            DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
                guard let self, !self.drawn else { return }
                self.onFail()
            }
        }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any] else { return }
            if body["fail"] != nil { onFail(); return }
            if let h = body["h"] as? Double, h > 40 {
                drawn = true
                onHeight(ceil(h))
            }
        }

        // The page itself loads from our string; the widget's own frames load from X. A tap that leaves the post
        // (the author, the post, a link in it) goes to X or Safari, never inside this little view.
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if action.navigationType == .linkActivated, let url = action.request.url {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = action.request.url { UIApplication.shared.open(url) }
            return nil
        }
    }
}
