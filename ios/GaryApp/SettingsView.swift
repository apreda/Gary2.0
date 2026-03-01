import SwiftUI

// MARK: - Settings View

struct SettingsView: View {
    @State private var animateIn = false
    
    var body: some View {
        ZStack {
            // Background - matches homepage
            LiquidGlassBackground()

            // Content - respects safe area
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 24) {
                        // Header
                        Text("Settings")
                            .font(.system(size: 28, weight: .heavy))
                            .tracking(-0.5)
                            .foregroundStyle(GaryColors.gold)
                            .padding(.top, 8) // Extra padding after safe area
                            .opacity(animateIn ? 1 : 0)
                            .offset(y: animateIn ? 0 : 20)
                        
                        // App Info Card
                        appInfoCard
                            .opacity(animateIn ? 1 : 0)
                            .offset(y: animateIn ? 0 : 20)
                            .animation(.easeOut(duration: 0.5).delay(0.1), value: animateIn)
                        
                        // About Section (What's New / Changelog)
                        aboutSection
                            .opacity(animateIn ? 1 : 0)
                            .offset(y: animateIn ? 0 : 20)
                            .animation(.easeOut(duration: 0.5).delay(0.15), value: animateIn)
                        
                        // Legal Section
                        legalSection
                            .opacity(animateIn ? 1 : 0)
                            .offset(y: animateIn ? 0 : 20)
                            .animation(.easeOut(duration: 0.5).delay(0.2), value: animateIn)
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 100) // Space for floating tab bar
                }
            }
            .navigationBarHidden(true)
        .onAppear {
            withAnimation(.easeOut(duration: 0.6)) {
                animateIn = true
            }
        }
    }
    
    // MARK: - App Info Card
    
    private var appInfoCard: some View {
        HStack(spacing: 16) {
            Image("GaryIconBG")
                .resizable()
                .scaledToFit()
                .frame(width: 100, height: 100)
                .shadow(color: GaryColors.gold.opacity(0.3), radius: 10, y: 4)
            
            VStack(alignment: .leading, spacing: 6) {
                Text("Gary A.I.")
                    .font(.title2.bold())
                    .foregroundStyle(GaryColors.gold)
                
                Text("Version \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.9.91")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            
            Spacer()
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(hex: "#0D0D0F"))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(
                            LinearGradient(
                                colors: [GaryColors.gold.opacity(0.3), GaryColors.gold.opacity(0.1)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 0.5
                        )
                )
        )
    }
    
    // MARK: - About Section
    
    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "info.circle.fill")
                    .foregroundStyle(GaryColors.gold)
                Text("ABOUT")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
            }
            
            VStack(spacing: 2) {
                NavigationLink(destination: ChangelogView()) {
                    HStack(spacing: 14) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(GaryColors.gold)
                            .frame(width: 32, height: 32)
                            .background(Color(hex: "#1A1A1C"))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        
                        Text("What's New")
                            .font(.subheadline)
                            .foregroundStyle(.white)
                        
                        Spacer()
                        
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(GaryColors.gold.opacity(0.5))
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(hex: "#0D0D0F"))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(GaryColors.gold.opacity(0.15), lineWidth: 0.5)
                    )
            )
        }
    }
    
    // MARK: - Legal Section
    
    private var legalSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "doc.text.fill")
                    .foregroundStyle(GaryColors.gold)
                Text("LEGAL")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
            }
            
            VStack(spacing: 2) {
                SettingsLink(
                    title: "Privacy Policy",
                    icon: "lock.shield.fill",
                    iconColor: GaryColors.gold,
                    url: "https://www.betwithgary.ai/privacy"
                )
                
                SettingsLink(
                    title: "Terms of Service",
                    icon: "doc.plaintext.fill",
                    iconColor: GaryColors.gold,
                    url: "https://www.betwithgary.ai/terms"
                )
                
                SettingsLink(
                    title: "Responsible Gambling",
                    icon: "heart.fill",
                    iconColor: GaryColors.gold,
                    url: "https://www.ncpgambling.org/help-treatment/"
                )
                
                SettingsLink(
                    title: "Contact Support",
                    icon: "envelope.fill",
                    iconColor: GaryColors.gold,
                    url: "https://www.betwithgary.ai/contact"
                )
            }
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(hex: "#0D0D0F"))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(GaryColors.gold.opacity(0.15), lineWidth: 0.5)
                    )
            )
        }
    }
    
}

// MARK: - Settings Link Component

struct SettingsLink: View {
    let title: String
    let icon: String
    let iconColor: Color
    let url: String
    
    var body: some View {
        Link(destination: URL(string: url) ?? URL(string: "https://betwithgary.ai/")!) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(iconColor)
                    .frame(width: 32, height: 32)
                    .background(Color(hex: "#1A1A1C"))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                
                Text(title)
                    .font(.subheadline)
                    .foregroundStyle(.white)
                
                Spacer()
                
                Image(systemName: "arrow.up.right")
                    .font(.caption)
                    .foregroundStyle(GaryColors.gold.opacity(0.5))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
        }
    }
}

#Preview {
    SettingsView()
        .preferredColorScheme(.dark)
}
