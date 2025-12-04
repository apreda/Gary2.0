import SwiftUI

// MARK: - Access View (Onboarding/Landing)

struct AccessView: View {
    @State private var showDisclaimer = true
    @AppStorage("hasEntered") private var hasEntered: Bool = false
    @AppStorage("selectedTab") private var selectedTab: Int = 0
    
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [.black, .black.opacity(0.92)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
            
            VStack(spacing: 28) {
                Spacer(minLength: 40)
                
                // Logo
                GaryLogo(size: 320)
                
                // Intro & Tech Chips
                VStack(spacing: 10) {
                    Pill(text: "NEW  Introducing Gary AI: Intelligent Sports Bets", compact: true)
                    
                    LazyVGrid(
                        columns: [
                            GridItem(.flexible(), spacing: 8),
                            GridItem(.flexible(), spacing: 8),
                            GridItem(.flexible(), spacing: 8)
                        ],
                        spacing: 8
                    ) {
                        TechChip(icon: "chart.line.uptrend.xyaxis", text: "Odds API")
                        TechChip(icon: "globe", text: "Sports DB")
                        TechChip(icon: "bolt.horizontal", text: "Turbo 3.5 Mini")
                        TechChip(icon: "brain.head.profile", text: "Perplexity")
                        TechChip(icon: "chart.bar.xaxis", text: "StatCast API")
                    }
                    .padding(.horizontal, 16)
                }
                
                // Action Buttons
                VStack(spacing: 12) {
                    Button {
                        hasEntered = true
                        selectedTab = 0
                    } label: {
                        Text("Access Picks")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(GoldButtonStyle())
                    
                    Button {
                        hasEntered = true
                        selectedTab = 1
                    } label: {
                        Text("See Free Pick of the Day")
                            .font(.footnote.bold())
                            .foregroundColor(GaryColors.gold)
                    }
                }
                .padding(.horizontal, 24)
                
                Spacer()
            }
        }
        .sheet(isPresented: $showDisclaimer) {
            DisclaimerSheet(isPresented: $showDisclaimer)
        }
    }
}

// MARK: - Tech Chip

private struct TechChip: View {
    let icon: String
    let text: String
    
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .foregroundColor(GaryColors.gold)
            Text(text)
                .foregroundColor(.white)
                .font(.footnote.bold())
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.06))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(GaryColors.gold.opacity(0.6), lineWidth: 1)
        )
        .cornerRadius(14)
    }
}

// MARK: - Disclaimer Sheet

struct DisclaimerSheet: View {
    @Binding var isPresented: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Important Disclaimer")
                .font(.headline)
                .foregroundColor(GaryColors.gold)
            
            ScrollView {
                Text(disclaimerText)
                    .foregroundColor(.white)
                    .font(.subheadline)
            }
            
            HStack {
                Spacer()
                Button("I Understand") {
                    isPresented = false
                }
                .buttonStyle(GoldButtonStyle())
            }
        }
        .padding()
        .background(Color.black)
        .presentationDetents([.medium])
    }
    
    private var disclaimerText: String {
        """
        Gary AI provides informational sports betting analysis only. No wagers are placed within this app. Odds and picks are not a guarantee of results. Users must comply with all applicable laws and must be of legal age in their jurisdiction. This app does not facilitate real-money gambling, deposits, or withdrawals. If you or someone you know has a gambling problem, call the National Problem Gambling Helpline at 1-800-522-4700. By tapping 'I Understand', you acknowledge these terms.
        """
    }
}

#Preview {
    AccessView()
}
