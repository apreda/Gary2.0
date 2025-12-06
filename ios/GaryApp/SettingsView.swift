import SwiftUI

// MARK: - Settings View

struct SettingsView: View {
    @State private var deleting = false
    @State private var deleted = false
    @State private var error: String?
    @State private var animateIn = false
    
    var body: some View {
        ZStack {
            LiquidGlassBackground(accentColor: Color(hex: "#6366F1"))
            
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 24) {
                    // Header
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Settings")
                            .font(.system(size: 32, weight: .black, design: .rounded))
                            .foregroundStyle(GaryColors.goldGradient)
                        
                        Text("Manage your preferences")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 20)
                    .opacity(animateIn ? 1 : 0)
                    .offset(y: animateIn ? 0 : 20)
                    
                    // App Info Card
                    appInfoCard
                        .opacity(animateIn ? 1 : 0)
                        .offset(y: animateIn ? 0 : 20)
                        .animation(.easeOut(duration: 0.5).delay(0.1), value: animateIn)
                    
                    // Legal Section
                    legalSection
                        .opacity(animateIn ? 1 : 0)
                        .offset(y: animateIn ? 0 : 20)
                        .animation(.easeOut(duration: 0.5).delay(0.2), value: animateIn)
                    
                    // Account Section
                    accountSection
                        .opacity(animateIn ? 1 : 0)
                        .offset(y: animateIn ? 0 : 20)
                        .animation(.easeOut(duration: 0.5).delay(0.3), value: animateIn)
                    
                    Spacer(minLength: 120)
                }
                .padding(.horizontal, 20)
            }
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.6)) {
                animateIn = true
            }
        }
    }
    
    // MARK: - App Info Card
    
    private var appInfoCard: some View {
        HStack(spacing: 16) {
            GaryLogo(size: 70)
            
            VStack(alignment: .leading, spacing: 6) {
                Text("Gary A.I.")
                    .font(.title2.bold())
                    .foregroundStyle(GaryColors.goldGradient)
                
                Text("Version 1.0")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                    Text("Premium Active")
                        .font(.caption.bold())
                        .foregroundStyle(.green)
                }
            }
            
            Spacer()
        }
        .padding(20)
        .liquidGlass(cornerRadius: 20)
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
                    iconColor: .blue,
                    url: "https://www.betwithgary.ai/privacy"
                )
                
                SettingsLink(
                    title: "Terms of Service",
                    icon: "doc.plaintext.fill",
                    iconColor: .purple,
                    url: "https://www.betwithgary.ai/terms"
                )
                
                SettingsLink(
                    title: "Responsible Gambling",
                    icon: "heart.fill",
                    iconColor: .red,
                    url: "https://www.ncpgambling.org/help-treatment/"
                )
                
                SettingsLink(
                    title: "Contact Support",
                    icon: "envelope.fill",
                    iconColor: .green,
                    url: "https://www.betwithgary.ai/contact"
                )
            }
            .liquidGlass(cornerRadius: 16)
        }
    }
    
    // MARK: - Account Section
    
    private var accountSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "person.fill")
                    .foregroundStyle(GaryColors.gold)
                Text("ACCOUNT")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
            }
            
            VStack(alignment: .leading, spacing: 16) {
                if let error = error {
                    HStack(spacing: 8) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.red.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                
                if deleted {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Text("Your account has been deleted.")
                            .font(.caption)
                            .foregroundStyle(.green)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.green.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                
                Button {
                    Task { await deleteAccount() }
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "trash.fill")
                            .font(.system(size: 16))
                            .foregroundStyle(.red)
                            .frame(width: 36, height: 36)
                            .background(.red.opacity(0.15))
                            .clipShape(Circle())
                        
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Delete Account")
                                .font(.subheadline.bold())
                                .foregroundStyle(.red)
                            Text("Permanently remove your data")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        
                        Spacer()
                        
                        if deleting {
                            ProgressView()
                                .tint(.red)
                        } else {
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .padding(16)
                }
                .disabled(deleting)
                
                Text("Deleting your account permanently removes your profile. This cannot be undone.")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 8)
            }
            .liquidGlass(cornerRadius: 16)
        }
    }
    
    // MARK: - Actions
    
    private func deleteAccount() async {
        error = nil
        deleted = false
        deleting = true
        defer { deleting = false }
        
        guard let session = SupabaseAuth.currentSession() else {
            error = "Please sign in first."
            return
        }
        
        do {
            var request = URLRequest(url: URL(string: "https://www.betwithgary.ai/api/delete-account")!)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(session.access_token)", forHTTPHeaderField: "Authorization")
            
            let (_, response) = try await URLSession.shared.data(for: request)
            
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                error = "Failed to delete account"
                return
            }
            
            SupabaseAuth.clearSession()
            deleted = true
        } catch {
            self.error = error.localizedDescription
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
        Link(destination: URL(string: url)!) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(iconColor)
                    .frame(width: 32, height: 32)
                    .background(iconColor.opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                
                Text(title)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                
                Spacer()
                
                Image(systemName: "arrow.up.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
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
