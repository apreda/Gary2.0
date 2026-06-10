import SwiftUI

// MARK: - Settings View
// Speaks the same Quant Terminal language as the page headers: mono gold
// wordmark + dashed stitch, mono section eyebrows, flat matte cards
// (DESIGNER_BRIEFING four horsemen: no glow shadows, no gradient borders).

struct SettingsView: View {
    @EnvironmentObject var authManager: AuthManager
    @State private var animateIn = false
    @State private var showSignOutConfirm = false
    @State private var showSignIn = false
    /// Billfold/Home results format — units by default (no profit-claim
    /// framing); on = the hypothetical $100/bet dollar view.
    @AppStorage("showDollarResults") private var showDollarResults = false

    var body: some View {
        ZStack {
            LiquidGlassBackground()

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 24) {
                    header
                        .opacity(animateIn ? 1 : 0)
                        .offset(y: animateIn ? 0 : 20)

                    appInfoCard
                        .opacity(animateIn ? 1 : 0)
                        .offset(y: animateIn ? 0 : 20)
                        .animation(.easeOut(duration: 0.5).delay(0.1), value: animateIn)

                    section("ABOUT") { aboutRows }
                        .opacity(animateIn ? 1 : 0)
                        .offset(y: animateIn ? 0 : 20)
                        .animation(.easeOut(duration: 0.5).delay(0.15), value: animateIn)

                    section("DISPLAY") { displayRows }
                        .opacity(animateIn ? 1 : 0)
                        .offset(y: animateIn ? 0 : 20)
                        .animation(.easeOut(duration: 0.5).delay(0.18), value: animateIn)

                    section("ACCOUNT") { accountRows }
                        .opacity(animateIn ? 1 : 0)
                        .offset(y: animateIn ? 0 : 20)
                        .animation(.easeOut(duration: 0.5).delay(0.2), value: animateIn)

                    section("LEGAL") { legalRows }
                        .opacity(animateIn ? 1 : 0)
                        .offset(y: animateIn ? 0 : 20)
                        .animation(.easeOut(duration: 0.5).delay(0.25), value: animateIn)
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
        .alert("Sign Out", isPresented: $showSignOutConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Sign Out", role: .destructive) {
                authManager.signOut()
            }
        } message: {
            Text("Are you sure you want to sign out?")
        }
        .sheet(isPresented: $showSignIn) {
            AuthView()
        }
    }

    // MARK: - Header (page-header pattern, sans the recursive settings button)

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("SETTINGS")
                .font(GaryFonts.mono(23, bold: false))
                .foregroundStyle(GaryColors.gold)
            SettingsStitch()
                .stroke(GaryColors.gold.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [4, 5]))
                .frame(height: 1)
        }
        .padding(.top, 8)
    }

    // MARK: - App Info Card

    private var appInfoCard: some View {
        HStack(spacing: 16) {
            Image("GaryIconBG")
                .resizable()
                .scaledToFit()
                .frame(width: 84, height: 84)

            VStack(alignment: .leading, spacing: 6) {
                Text("GARY A.I.")
                    .font(GaryFonts.mono(19))
                    .foregroundStyle(GaryColors.gold)

                Text("VERSION \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "2.1")")
                    .font(GaryFonts.mono(10))
                    .foregroundStyle(.white.opacity(0.45))
            }

            Spacer()
        }
        .padding(20)
        .background(cardBackground)
    }

    // MARK: - Section scaffold

    private func section<Rows: View>(_ title: String, @ViewBuilder rows: () -> Rows) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(GaryFonts.mono(11, bold: true))
                .foregroundStyle(.white.opacity(0.5))
            VStack(spacing: 2) { rows() }
                .background(cardBackground)
        }
    }

    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(Color(hex: "#0D0D0F"))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.white.opacity(0.07), lineWidth: 1)
            )
    }

    // MARK: - About

    private var aboutRows: some View {
        NavigationLink(destination: ChangelogView()) {
            SettingsRowLabel(title: "What's New", icon: "sparkles", trailingIcon: "chevron.right")
        }
    }

    // MARK: - Display

    private var displayRows: some View {
        HStack(spacing: 14) {
            SettingsRowIcon(icon: "dollarsign.circle.fill")
            VStack(alignment: .leading, spacing: 2) {
                Text("Results in dollars")
                    .font(GaryFonts.text(15))
                    .foregroundStyle(.white)
                Text("Hypothetical $100/bet view. Off shows units.")
                    .font(GaryFonts.text(12))
                    .foregroundStyle(.white.opacity(0.45))
            }
            Spacer()
            Toggle("", isOn: $showDollarResults)
                .labelsHidden()
                .tint(GaryColors.gold)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    // MARK: - Account

    @ViewBuilder
    private var accountRows: some View {
        if authManager.isAuthenticated {
            HStack(spacing: 14) {
                SettingsRowIcon(icon: "envelope.fill")

                VStack(alignment: .leading, spacing: 2) {
                    Text(authManager.currentUser?.displayName ?? "Gary User")
                        .font(GaryFonts.text(15))
                        .foregroundStyle(.white)
                    if let email = authManager.currentUser?.email {
                        Text(email)
                            .font(GaryFonts.text(12))
                            .foregroundStyle(.white.opacity(0.45))
                    }
                }

                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)

            Divider()
                .background(Color.white.opacity(0.07))
                .padding(.horizontal, 16)

            Button {
                showSignOutConfirm = true
            } label: {
                SettingsRowLabel(title: "Sign Out", icon: "rectangle.portrait.and.arrow.right", tint: .red)
            }
        } else {
            Button {
                showSignIn = true
            } label: {
                SettingsRowLabel(title: "Sign In", icon: "person.badge.key.fill", trailingIcon: "chevron.right")
            }
        }
    }

    // MARK: - Legal

    @ViewBuilder
    private var legalRows: some View {
        SettingsLink(
            title: "Privacy Policy",
            icon: "lock.shield.fill",
            url: "https://www.betwithgary.ai/privacy"
        )
        SettingsLink(
            title: "Terms of Service",
            icon: "doc.plaintext.fill",
            url: "https://www.betwithgary.ai/terms"
        )
        SettingsLink(
            title: "Responsible Gambling",
            icon: "heart.fill",
            url: "https://www.ncpgambling.org/help-treatment/"
        )
        SettingsLink(
            title: "Contact Support",
            icon: "envelope.fill",
            url: "https://www.betwithgary.ai/contact"
        )
    }
}

// MARK: - Row building blocks

/// Icon chip: neutral by default — gold stays reserved for the wordmark.
struct SettingsRowIcon: View {
    let icon: String
    var tint: Color = .white.opacity(0.6)

    var body: some View {
        Image(systemName: icon)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 32, height: 32)
            .background(Color(hex: "#1A1A1C"))
            .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

struct SettingsRowLabel: View {
    let title: String
    let icon: String
    var tint: Color = .white.opacity(0.6)
    var trailingIcon: String? = nil

    var body: some View {
        HStack(spacing: 14) {
            SettingsRowIcon(icon: icon, tint: tint)

            Text(title)
                .font(GaryFonts.text(15))
                .foregroundStyle(tint == .red ? .red : .white)

            Spacer()

            if let trailingIcon {
                Image(systemName: trailingIcon)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.3))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .contentShape(Rectangle())
    }
}

private struct SettingsStitch: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: 0, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.width, y: rect.midY))
        return p
    }
}

// MARK: - Settings Link Component

struct SettingsLink: View {
    static let fallbackURL = URL(string: "https://betwithgary.ai/")!

    let title: String
    let icon: String
    let url: String

    var body: some View {
        Link(destination: URL(string: url) ?? Self.fallbackURL) {
            SettingsRowLabel(title: title, icon: icon, trailingIcon: "arrow.up.right")
        }
    }
}

#Preview {
    SettingsView()
        .environmentObject(AuthManager.shared)
        .preferredColorScheme(.dark)
}
