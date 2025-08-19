import SwiftUI
import WebKit

struct HomeView: View {
    var body: some View {
        ZStack {
            Color.black.opacity(0.96).ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "bolt.fill").font(.system(size: 60)).foregroundColor(Color(hex: "#B8953F"))
                Text("Gary A.I.")
                    .font(.largeTitle.bold())
                    .foregroundColor(Color(hex: "#B8953F"))
                Text("Picks generated daily at 10AM EST")
                    .foregroundColor(.gray)
            }
        }
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
                List(picks) { p in
                    VStack(alignment: .leading, spacing: 6) {
                        Text((p.pick ?? "").replacingOccurrences(of: #"([-+]\d+)$"#, with: "", options: .regularExpression))
                            .font(.headline)
                            .foregroundColor(Color(hex: "#B8953F"))
                        if let league = p.league { Text(league).font(.subheadline).foregroundColor(.gray) }
                        if let time = p.time, !time.isEmpty { Text(time).font(.footnote).foregroundColor(.gray) }
                        if let rationale = p.rationale, !rationale.isEmpty { Text(rationale).font(.subheadline).foregroundColor(.white.opacity(0.9)) }
                    }
                    .listRowBackground(Color.black.opacity(0.9))
                }
                .scrollContentBackground(.hidden)
            }
        }
        .onAppear {
            Task {
                loading = true
                let date = SupabaseAPI.todayEST()
                if let arr = try? await SupabaseAPI.fetchDailyPicks(date: date) {
                    picks = arr.filter { ($0.pick ?? "").isEmpty == false && ($0.rationale ?? "").isEmpty == false }
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
                List(props) { p in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(p.prop ?? "Prop")
                            .font(.headline)
                            .foregroundColor(Color(hex: "#B8953F"))
                        HStack {
                            if let team = p.team { Text(team).foregroundColor(.white) }
                            if let odds = p.odds { Text(odds).foregroundColor(.gray) }
                        }.font(.subheadline)
                        if let analysis = p.analysis { Text(analysis).foregroundColor(.white.opacity(0.9)) }
                    }
                    .listRowBackground(Color.black.opacity(0.9))
                }
                .scrollContentBackground(.hidden)
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
    var body: some View {
        WebContainer(url: URL(string: "https://www.betwithgary.ai/billfold")!)
            .ignoresSafeArea(edges: .bottom)
    }
}

struct BetCardView: View {
    var body: some View {
        WebContainer(url: URL(string: "https://www.betwithgary.ai/betcard")!)
            .ignoresSafeArea(edges: .bottom)
    }
}

struct WebContainer: UIViewRepresentable {
    let url: URL
    func makeUIView(context: Context) -> WKWebView { WKWebView() }
    func updateUIView(_ uiView: WKWebView, context: Context) {
        uiView.load(URLRequest(url: url))
    }
}


