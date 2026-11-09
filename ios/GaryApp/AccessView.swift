import SwiftUI

// MARK: - Access View (first launch)

/// The first screen a new fan sees. Rebuilt Nov 9 2026: Gary himself and what
/// each page is, in the app's own words, in place of the wordmark and six
/// feature chips. One action. It opens the disclaimer, and agreeing to that
/// is what enters the app, on Home (the old "ACCESS PICKS" dropped a new fan
/// on a Picks page that reads PICKS INCOMING for most of the day).
struct AccessView: View {
    @ObservedObject private var authManager = AuthManager.shared
    @State private var showDisclaimer = false
    @State private var showSignIn = false
    @AppStorage("hasEntered") private var hasEntered: Bool = false
    @AppStorage("selectedTab") private var selectedTab: Int = 0
    @State private var animateIn = false

    /// The four pages, as the app names them.
    private let pages: [(name: String, line: String)] = [
        ("PICKS", "Gary's side of every game, with his reasons."),
        ("WINNERS", "The bets he makes from his $10,000 bankroll."),
        ("DARTS", "Touchdown scorers, stat lines and the parlay of the day."),
        ("BILLFOLD", "Every win and every loss, kept on the record."),
    ]

    var body: some View {
        ZStack {
            LiquidGlassBackground()

            VStack(spacing: 0) {
                // Gary gives way first on a short phone; the words never do.
                Image("GaryIdleBase")
                    .resizable()
                    .scaledToFit()
                    .frame(minHeight: 110, maxHeight: 290)
                    .layoutPriority(-1)
                    .padding(.top, 8)
                    .accessibilityHidden(true)
                    .opacity(animateIn ? 1 : 0)
                    .scaleEffect(animateIn ? 1 : 0.94)
                    .animation(.easeOut(duration: 0.5).delay(0.1), value: animateIn)

                VStack(alignment: .leading, spacing: 0) {
                    Text("GARY A.I.")
                        .font(GaryFonts.mono(11, bold: true)).tracking(1.6)
                        .foregroundStyle(GaryColors.gold.opacity(0.9))
                        .padding(.bottom, 6)

                    // Fixed, so a tight screen takes its height from Gary, never from the headline.
                    Text("A PICK ON")
                        .font(GaryFonts.display(44))
                        .foregroundStyle(.white)
                        .fixedSize()
                    Text("EVERY GAME.")
                        .font(GaryFonts.display(44))
                        .foregroundStyle(GaryColors.gold)
                        .fixedSize()
                        .padding(.top, -6)
                        .padding(.bottom, 12)

                    ForEach(pages, id: \.name) { page in
                        Rectangle().fill(Color.white.opacity(0.09)).frame(height: 1)
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(page.name)
                                .font(GaryFonts.mono(10.5, bold: true)).tracking(1)
                                .foregroundStyle(GaryColors.gold)
                                .frame(width: 78, alignment: .leading)
                            Text(page.line)
                                .font(GaryFonts.text(14.5))
                                .foregroundStyle(.white.opacity(0.82))
                                .fixedSize(horizontal: false, vertical: true)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.vertical, 10)
                        .accessibilityElement(children: .combine)
                    }
                    Rectangle().fill(Color.white.opacity(0.09)).frame(height: 1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 24)
                .padding(.top, 6)
                .opacity(animateIn ? 1 : 0)
                .offset(y: animateIn ? 0 : 18)
                .animation(.easeOut(duration: 0.5).delay(0.25), value: animateIn)

                // The one flexible gap: the action sits in the thumb zone.
                Spacer(minLength: 14)

                VStack(spacing: 6) {
                    Button { showDisclaimer = true } label: {
                        AccessActionLabel(text: "SEE TODAY'S BOARD")
                    }
                    .buttonStyle(.plain)

                    // SIGNED-IN STATE (App Store 2.1a, Aug 19): a successful
                    // sign-in used to land back here with this row unchanged,
                    // reading as "nothing happened". The row confirms the account.
                    if authManager.isAuthenticated {
                        HStack(spacing: 6) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(GaryColors.gold)
                            Text("Signed in\(signedInName.isEmpty ? "" : " as \(signedInName)")")
                                .foregroundStyle(.white.opacity(0.75))
                        }
                        .font(GaryFonts.text(13.5, .semibold))
                        .padding(.vertical, 10)
                    } else {
                        Button { showSignIn = true } label: {
                            HStack(spacing: 5) {
                                Text("Already have an account?")
                                    .foregroundStyle(.white.opacity(0.55))
                                Text("Sign In")
                                    .foregroundStyle(GaryColors.gold)
                            }
                            .font(GaryFonts.text(13.5, .semibold))
                            .padding(.vertical, 10)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 10)
                .opacity(animateIn ? 1 : 0)
                .animation(.easeOut(duration: 0.5).delay(0.4), value: animateIn)
            }
        }
        .onAppear { animateIn = true }
        .sheet(isPresented: $showDisclaimer) {
            DisclaimerSheet(isPresented: $showDisclaimer) {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    selectedTab = 0
                    hasEntered = true
                }
            }
        }
        .sheet(isPresented: $showSignIn) {
            AuthView()
        }
    }

    /// Display identity for the signed-in row: claimed handle first, then a
    /// readable email prefix (private-relay addresses read as noise in full).
    private var signedInName: String {
        if let h = UserDefaults.standard.string(forKey: "myHandle"), !h.isEmpty { return h }
        let email = authManager.currentUser?.email ?? ""
        return email.components(separatedBy: "@").first ?? ""
    }
}

/// The app's quiet action: gold words on the ink plate inside a gold hairline,
/// the look of GOT IT on How Gary Works. No filled oval (design.md).
private struct AccessActionLabel: View {
    let text: String
    var chevron: Bool = true

    var body: some View {
        HStack(spacing: 8) {
            Text(text)
                .font(GaryFonts.display(16)).tracking(1.6)
            if chevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .bold))
            }
        }
        .foregroundStyle(GaryColors.gold)
        .frame(maxWidth: .infinity, minHeight: 52)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(LabInk.plate))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
            .strokeBorder(GaryColors.gold.opacity(0.45), lineWidth: 1))
        .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

// MARK: - Disclaimer Sheet

/// Shown when a new fan asks for the board. Agreeing is what enters the app;
/// swiping it away goes back to the first screen.
struct DisclaimerSheet: View {
    @Binding var isPresented: Bool
    var onAccept: () -> Void = {}

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
                .padding(.top, 8)

                ScrollView(showsIndicators: false) {
                    Text(disclaimerText)
                        .font(GaryFonts.text(14.5))
                        .foregroundStyle(.white.opacity(0.72))
                        .lineSpacing(4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button {
                    isPresented = false
                    onAccept()
                } label: {
                    AccessActionLabel(text: "I UNDERSTAND", chevron: false)
                }
                .buttonStyle(.plain)
            }
            .padding(24)
        }
        // Tall enough that the whole notice reads without scrolling on a
        // current phone; a small one scrolls the words, never the button.
        .presentationDetents([.fraction(0.78), .large])
        .presentationDragIndicator(.visible)
    }

    private var disclaimerText: String {
        return """
        Gary AI provides informational sports betting analysis only. No wagers are placed within this app.

        Odds and picks are not a guarantee of results. Users must comply with all applicable laws and must be of legal age in their jurisdiction.

        Gary does not accept wagering deposits or hold a betting balance.

        If you or someone you know has a gambling problem, call the National Problem Gambling Helpline at 1-800-522-4700.

        By tapping 'I Understand', you acknowledge these terms.
        """
    }
}
