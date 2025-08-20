import SwiftUI

struct SettingsView: View {
    @Environment(\.openURL) private var openURL
    @State private var deleting = false
    @State private var deleted = false
    @State private var error: String?

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color.black.opacity(0.98), Color.black.opacity(0.94)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Settings").font(.largeTitle.bold()).foregroundColor(Color(hex: "#B8953F"))

                    GroupBox(label: Text("Legal").foregroundColor(.white)) {
                        VStack(alignment: .leading, spacing: 10) {
                            Link("Privacy Policy", destination: URL(string: "https://www.betwithgary.ai/privacy")!)
                                .foregroundColor(.white.opacity(0.9))
                            Link("Terms of Service", destination: URL(string: "https://www.betwithgary.ai/terms")!)
                                .foregroundColor(.white.opacity(0.9))
                            Link("Responsible Gambling", destination: URL(string: "https://www.ncpgambling.org/help-treatment/" )!)
                                .foregroundColor(.white.opacity(0.9))
                            Link("Contact Support", destination: URL(string: "https://www.betwithgary.ai/contact")!)
                                .foregroundColor(.white.opacity(0.9))
                        }
                        .padding(.top, 6)
                    }
                    .groupBoxStyle(.automatic)

                    GroupBox(label: Text("Account").foregroundColor(.white)) {
                        VStack(alignment: .leading, spacing: 12) {
                            if let error { Text(error).foregroundColor(.red).font(.caption) }
                            if deleted { Text("Your account has been deleted.").foregroundColor(.green).font(.caption) }
                            Button(role: .destructive) { Task { await deleteAccount() } } label: {
                                HStack { Image(systemName: "trash"); Text("Delete Account") }
                            }.disabled(deleting)
                            Text("Deleting your account permanently removes your profile and signs you out. This cannot be undone.")
                                .foregroundColor(.white.opacity(0.6)).font(.caption)
                        }
                        .padding(.top, 6)
                    }
                }
                .padding()
            }
        }
    }

    private func deleteAccount() async {
        error = nil; deleted = false; deleting = true; defer { deleting = false }
        guard let data = UserDefaults.standard.data(forKey: "supabase.session"),
              let session = try? JSONDecoder().decode(SupabaseAuthSession.self, from: data) else {
            error = "Please sign in first."; return
        }
        do {
            var req = URLRequest(url: URL(string: "https://www.betwithgary.ai/api/delete-account")!)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("Bearer \(session.access_token)", forHTTPHeaderField: "Authorization")
            let (_, res) = try await URLSession.shared.data(for: req)
            guard let http = res as? HTTPURLResponse, http.statusCode == 200 else { error = "Failed to delete"; return }
            SupabaseAuth.clearSession()
            deleted = true
        } catch { self.error = error.localizedDescription }
    }
}


