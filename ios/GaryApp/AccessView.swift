import SwiftUI

struct AccessView: View {
    @State private var showDisclaimer = true
    @AppStorage("selectedTab") private var selectedTab: Int = 0
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color.black, Color.black.opacity(0.92)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            VStack(spacing: 28) {
                Spacer(minLength: 40)
                // Logo
                AsyncImage(url: URL(string: "https://www.betwithgary.ai/coin2.png")) { phase in
                    switch phase {
                    case .empty: ProgressView().tint(Color(hex: "#B8953F"))
                    case .success(let img): img.resizable().scaledToFit().frame(width: 320, height: 320)
                    case .failure: Image(systemName: "seal.fill").resizable().scaledToFit().frame(width: 280, height: 280).foregroundColor(Color(hex: "#B8953F"))
                    @unknown default: EmptyView()
                    }
                }
                // Intro pill + tech chips
                VStack(spacing: 10) {
                    Pill(text: "NEW  Introducing Gary AI: Intelligent Sports Bets", compact: true)
                    let columns: [GridItem] = [
                        GridItem(.flexible(), spacing: 8),
                        GridItem(.flexible(), spacing: 8),
                        GridItem(.flexible(), spacing: 8)
                    ]
                    LazyVGrid(columns: columns, alignment: .center, spacing: 8) {
                        Chip(icon: "chart.line.uptrend.xyaxis", text: "Odds API")
                        Chip(icon: "globe", text: "Sports DB")
                        Chip(icon: "bolt.horizontal", text: "Turbo 3.5 Mini")
                        Chip(icon: "brain.head.profile", text: "Perplexity")
                        Chip(icon: "chart.bar.xaxis", text: "StatCast API")
                    }
                    .padding(.horizontal, 16)
                }
                // Buttons
                VStack(spacing: 12) {
                    Button {
                        // Enter app
                        selectedTab = 0
                    } label: { Text("Access Picks").frame(maxWidth: .infinity) }
                    .buttonStyle(GoldButtonStyle())
                    Button {
                        // Jump to free pick
                        selectedTab = 1
                    } label: {
                        Text("See Free Pick of the Day")
                            .font(.footnote.bold())
                            .foregroundColor(Color(hex: "#B8953F"))
                    }
                }.padding(.horizontal, 24)
                Spacer()
            }
        }
        .sheet(isPresented: $showDisclaimer) {
            DisclaimerView(show: $showDisclaimer)
        }
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


