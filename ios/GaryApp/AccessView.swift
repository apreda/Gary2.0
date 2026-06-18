import SwiftUI

// MARK: - Access View (Onboarding/Landing)

struct AccessView: View {
    @State private var showDisclaimer = true
    @State private var showSignIn = false
    @AppStorage("hasEntered") private var hasEntered: Bool = false
    @AppStorage("selectedTab") private var selectedTab: Int = 0
    @State private var animateIn = false
    
    var body: some View {
        ZStack {
            LiquidGlassBackground()
            
            VStack(spacing: 20) {
                Spacer(minLength: 20)
                
                // Sign-up hero — the full gold-bear portrait (user pick, Jun 18).
                VStack(spacing: 0) {
                    Image("GarySignupHero")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 260, height: 260)
                    
                    Text("GARY A.I.")
                        .font(GaryFonts.mono(30))
                        .foregroundStyle(GaryColors.gold)

                    Text("Intelligent Sports Analysis")
                        .font(GaryFonts.text(14.5))
                        .foregroundStyle(.white.opacity(0.55))
                }
                .opacity(animateIn ? 1 : 0)
                .scaleEffect(animateIn ? 1 : 0.8)
                .animation(.easeOut(duration: 0.6).delay(0.2), value: animateIn)
                
                // Tech Chips ("NEW · Introducing" badge retired — stale for a
                // shipped app)
                VStack(spacing: 12) {
                    LazyVGrid(
                        columns: [
                            GridItem(.flexible(), spacing: 10),
                            GridItem(.flexible(), spacing: 10)
                        ],
                        spacing: 10
                    ) {
                        TechChip(icon: "brain.head.profile", text: "Deep Research")
                        TechChip(icon: "arrow.triangle.2.circlepath", text: "Agentic AI")
                        TechChip(icon: "chart.line.uptrend.xyaxis", text: "Multi-Book Odds")
                        TechChip(icon: "globe", text: "Live Search")
                        TechChip(icon: "doc.text.magnifyingglass", text: "Scout Reports")
                        TechChip(icon: "chart.bar.xaxis", text: "Live Stats")
                    }
                    .padding(.horizontal, 24)
                }
                .opacity(animateIn ? 1 : 0)
                .offset(y: animateIn ? 0 : 30)
                .animation(.easeOut(duration: 0.6).delay(0.4), value: animateIn)
                
                // Action Buttons - tighter spacing
                VStack(spacing: 14) {
                    Button {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                        hasEntered = true
                        selectedTab = 0
                        }
                    } label: {
                        Text("ACCESS PICKS")
                            .font(GaryFonts.mono(14, bold: true)).tracking(1)
                            .foregroundStyle(.black.opacity(0.85))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(Capsule().fill(GaryColors.gold))
                    }
                    .buttonStyle(.plain)

                    Button {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                        hasEntered = true
                        selectedTab = 1
                        }
                    } label: {
                        Text("See Today's Picks")
                            .font(GaryFonts.text(14, .semibold))
                            .foregroundStyle(GaryColors.gold)
                            .padding(.vertical, 12)
                    }

                    Button {
                        showSignIn = true
                    } label: {
                        Text("Sign In")
                            .font(GaryFonts.text(12.5, .semibold))
                            .foregroundStyle(.white.opacity(0.5))
                            .padding(.vertical, 4)
                    }
                }
                .padding(.horizontal, 24)
                .opacity(animateIn ? 1 : 0)
                .offset(y: animateIn ? 0 : 40)
                .animation(.easeOut(duration: 0.6).delay(0.6), value: animateIn)
                
                Spacer(minLength: 40)
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
        .sheet(isPresented: $showSignIn) {
            AuthView()
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
                .font(GaryFonts.mono(11, bold: true))
                .foregroundStyle(.white.opacity(0.85))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(hex: "#0F0D0D"))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.white.opacity(0.1), lineWidth: 1)
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
                VStack(alignment: .leading, spacing: 8) {
                    Text("BEFORE YOU START")
                        .font(GaryFonts.mono(10, bold: true)).tracking(1)
                        .foregroundStyle(GaryColors.gold.opacity(0.9))
                    Text("Important Disclaimer")
                        .font(GaryFonts.display(28))
                        .foregroundStyle(.white)
                }

                ScrollView(showsIndicators: false) {
                    Text(disclaimerText)
                        .font(GaryFonts.text(14))
                        .foregroundStyle(.white.opacity(0.6))
                        .lineSpacing(4)
                        .padding()
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(Color(hex: "#0F0D0D"))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .stroke(Color.white.opacity(0.07), lineWidth: 1)
                                )
                        )
                }

                Button {
                    isPresented = false
                } label: {
                    Text("I UNDERSTAND")
                        .font(GaryFonts.mono(14, bold: true)).tracking(1)
                        .foregroundStyle(.black.opacity(0.85))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Capsule().fill(GaryColors.gold))
                }
                .buttonStyle(.plain)
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
