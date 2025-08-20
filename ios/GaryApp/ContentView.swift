import SwiftUI

struct ContentView: View {
    @AppStorage("selectedTab") private var selectedTab: Int = 0
    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView()
                .tabItem { Label("Home", systemImage: "house.fill") }
                .tag(0)
            GaryPicksView()
                .tabItem { Label("Gary's Picks", systemImage: "list.bullet.rectangle") }
                .tag(1)
            GaryPropsView()
                .tabItem { Label("Gary's Props", systemImage: "sportscourt") }
                .tag(2)
            BillfoldView()
                .tabItem { Label("Billfold", systemImage: "wallet.pass") }
                .tag(3)
            BetCardView()
                .tabItem { Label("BetCard", systemImage: "creditcard") }
                .tag(4)
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
                .tag(5)
        }
        .tint(Color(hex: "#B8953F"))
    }
}

extension Color {
    init(hex: String) {
        var hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: (a, r, g, b) = (255, (int >> 8) * 17,(int >> 4 & 0xF) * 17,(int & 0xF) * 17)
        case 6: (a, r, g, b) = (255, int >> 16,(int >> 8) & 0xFF, int & 0xFF)
        case 8: (a, r, g, b) = (int >> 24,(int >> 16) & 0xFF,(int >> 8) & 0xFF, int & 0xFF)
        default:(a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(.sRGB, red: Double(r)/255, green: Double(g)/255, blue: Double(b)/255, opacity: Double(a)/255)
    }
}


