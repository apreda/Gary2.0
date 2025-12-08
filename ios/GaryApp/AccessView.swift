import SwiftUI

// MARK: - Access View (Onboarding/Landing)

struct AccessView: View {
    @State private var showDisclaimer = true
    @AppStorage("hasEntered") private var hasEntered: Bool = false
    @AppStorage("selectedTab") private var selectedTab: Int = 0
    @State private var animateIn = false
    
    var body: some View {
        ZStack {
            LiquidGlassBackground()
            
            VStack(spacing: 24) {
                Spacer(minLength: 40)
                
                // Logo - no glow, matches home page
                VStack(spacing: 0) {
                    Image("GaryLiquid")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 180, height: 180)
                    
                    Text("GARY A.I.")
                        .font(.system(size: 32, weight: .heavy))
                        .tracking(-0.5)
                        .foregroundStyle(GaryColors.goldGradient)
                    
                    Text("Intelligent Sports Analysis")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .opacity(animateIn ? 1 : 0)
                .scaleEffect(animateIn ? 1 : 0.8)
                .animation(.easeOut(duration: 0.6).delay(0.2), value: animateIn)
                
                // Tech Chips
                VStack(spacing: 12) {
                    // NEW Badge
                    HStack(spacing: 8) {
                        Text("NEW")
                            .font(.caption2.bold())
                            .foregroundStyle(.black)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(GaryColors.gold)
                            .clipShape(Capsule())
                        
                        Text("Introducing Gary AI")
                            .font(.subheadline.bold())
                            .foregroundStyle(GaryColors.lightGold)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .fill(Color(hex: "#0D0D0F"))
                            .overlay(
                                RoundedRectangle(cornerRadius: 20, style: .continuous)
                                    .stroke(GaryColors.gold.opacity(0.3), lineWidth: 0.5)
                            )
                    )
                    
                    LazyVGrid(
                        columns: [
                            GridItem(.flexible(), spacing: 10),
                            GridItem(.flexible(), spacing: 10)
                        ],
                        spacing: 10
                    ) {
                        TechChip(icon: "brain.head.profile", text: "GPT-4o")
                        TechChip(icon: "arrow.triangle.2.circlepath", text: "Agentic AI")
                        TechChip(icon: "chart.line.uptrend.xyaxis", text: "Odds API")
                        TechChip(icon: "magnifyingglass", text: "Perplexity")
                        TechChip(icon: "doc.text.magnifyingglass", text: "Scout Reports")
                        TechChip(icon: "chart.bar.xaxis", text: "Stat APIs")
                    }
                    .padding(.horizontal, 24)
                }
                .opacity(animateIn ? 1 : 0)
                .offset(y: animateIn ? 0 : 30)
                .animation(.easeOut(duration: 0.6).delay(0.4), value: animateIn)
                
                Spacer()
                
                // Action Buttons
                VStack(spacing: 14) {
                    Button {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                        hasEntered = true
                        selectedTab = 0
                        }
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "star.fill")
                        Text("Access Picks")
                                .font(.headline.bold())
                        }
                        .foregroundStyle(.black)
                            .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(GaryColors.goldGradient)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .shadow(color: GaryColors.gold.opacity(0.4), radius: 12, y: 6)
                    }
                    
                    Button {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                        hasEntered = true
                        selectedTab = 1
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "gift.fill")
                                .font(.caption)
                        Text("See Free Pick of the Day")
                                .font(.subheadline.bold())
                        }
                        .foregroundStyle(GaryColors.gold)
                        .padding(.vertical, 12)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 40)
                .opacity(animateIn ? 1 : 0)
                .offset(y: animateIn ? 0 : 40)
                .animation(.easeOut(duration: 0.6).delay(0.6), value: animateIn)
            }
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.8)) {
                animateIn = true
            }
        }
        .sheet(isPresented: $showDisclaimer) {
            DisclaimerSheet(isPresented: $showDisclaimer)
        }
    }
}

// MARK: - Tech Chip

struct TechChip: View {
    let icon: String
    let text: String
    
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(GaryColors.gold)
            Text(text)
                .font(.caption.bold())
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(hex: "#0D0D0F"))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(GaryColors.gold.opacity(0.2), lineWidth: 0.5)
                )
        )
    }
}

// MARK: - Disclaimer Sheet

struct DisclaimerSheet: View {
    @Binding var isPresented: Bool
    
    var body: some View {
        ZStack {
            LiquidGlassBackground(accentColor: GaryColors.gold)
            
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(GaryColors.gold)
                        .font(.title2)
                    Text("Important Disclaimer")
                        .font(.system(size: 22, weight: .heavy))
                        .tracking(-0.5)
                        .foregroundStyle(GaryColors.goldGradient)
                }
            
                ScrollView(showsIndicators: false) {
                    Text(disclaimerText)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineSpacing(4)
                        .padding()
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(Color(hex: "#0D0D0F"))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .stroke(GaryColors.gold.opacity(0.15), lineWidth: 0.5)
                                )
                        )
                }
            
                Button {
                    isPresented = false
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "checkmark.circle.fill")
                        Text("I Understand")
                            .font(.headline.bold())
                    }
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(GaryColors.goldGradient)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .shadow(color: GaryColors.gold.opacity(0.4), radius: 12, y: 6)
                }
            }
            .padding(24)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
    
    private var disclaimerText: String {
        """
        Gary AI provides informational sports betting analysis only. No wagers are placed within this app.
        
        Odds and picks are not a guarantee of results. Users must comply with all applicable laws and must be of legal age in their jurisdiction.
        
        This app does not facilitate real-money gambling, deposits, or withdrawals.
        
        If you or someone you know has a gambling problem, call the National Problem Gambling Helpline at 1-800-522-4700.
        
        By tapping 'I Understand', you acknowledge these terms.
        """
    }
}

#Preview {
    AccessView()
        .preferredColorScheme(.dark)
}
