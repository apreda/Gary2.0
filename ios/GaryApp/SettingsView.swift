import SwiftUI

// MARK: - Settings View

struct SettingsView: View {
    @State private var deleting = false
    @State private var deleted = false
    @State private var error: String?
    
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.black.opacity(0.98), Color.black.opacity(0.94)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
            
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Settings")
                        .font(.largeTitle.bold())
                        .foregroundColor(GaryColors.gold)
                    
                    legalSection
                    accountSection
                }
                .padding()
            }
        }
    }
    
    // MARK: - Sections
    
    private var legalSection: some View {
        GroupBox(label: Text("Legal").foregroundColor(.white)) {
            VStack(alignment: .leading, spacing: 10) {
                legalLink("Privacy Policy", url: "https://www.betwithgary.ai/privacy")
                legalLink("Terms of Service", url: "https://www.betwithgary.ai/terms")
                legalLink("Responsible Gambling", url: "https://www.ncpgambling.org/help-treatment/")
                legalLink("Contact Support", url: "https://www.betwithgary.ai/contact")
            }
            .padding(.top, 6)
        }
    }
    
    private func legalLink(_ title: String, url: String) -> some View {
        Link(title, destination: URL(string: url)!)
            .foregroundColor(.white.opacity(0.9))
    }
    
    private var accountSection: some View {
        GroupBox(label: Text("Account").foregroundColor(.white)) {
            VStack(alignment: .leading, spacing: 12) {
                if let error = error {
                    Text(error)
                        .foregroundColor(.red)
                        .font(.caption)
                }
                
                if deleted {
                    Text("Your account has been deleted.")
                        .foregroundColor(.green)
                        .font(.caption)
                }
                
                Button(role: .destructive) {
                    Task { await deleteAccount() }
                } label: {
                    HStack {
                        Image(systemName: "trash")
                        Text("Delete Account")
                    }
                }
                .disabled(deleting)
                
                Text("Deleting your account permanently removes your profile and signs you out. This cannot be undone.")
                    .foregroundColor(.white.opacity(0.6))
                    .font(.caption)
            }
            .padding(.top, 6)
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

#Preview {
    SettingsView()
}
