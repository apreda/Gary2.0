import SwiftUI
import FirebaseCore
import GoogleSignIn
import FirebaseMessaging
import UserNotifications

// MARK: - App Delegate for Push Notifications

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {
    
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Set notification center delegate
        UNUserNotificationCenter.current().delegate = self

        // Firebase Installations raises an Objective-C exception (not a Swift
        // Error) when a redacted/malformed API key is bundled. That exception
        // used to abort the app before its first frame. Validate the plist first:
        // a bad local/Xcode Cloud secret may disable push, but it can never make
        // Gary unlaunchable again.
        if configureFirebaseIfValid() {
            Messaging.messaging().delegate = self
            requestNotificationPermissions(application)
        }
        
        return true
    }

    private func configureFirebaseIfValid() -> Bool {
        guard let url = Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist"),
              let data = try? Data(contentsOf: url),
              let plist = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
              let apiKey = plist["API_KEY"] as? String,
              apiKey.count == 39,
              apiKey.hasPrefix("AIza"),
              let bundleID = plist["BUNDLE_ID"] as? String,
              bundleID == Bundle.main.bundleIdentifier,
              let appID = plist["GOOGLE_APP_ID"] as? String,
              appID.hasPrefix("1:"),
              let projectID = plist["PROJECT_ID"] as? String,
              !projectID.isEmpty else {
            print("[Firebase] Invalid or redacted GoogleService-Info.plist; push messaging disabled for this build")
            return false
        }
        FirebaseApp.configure()
        return FirebaseApp.app() != nil
    }
    
    private func requestNotificationPermissions(_ application: UIApplication) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            if granted {
                DispatchQueue.main.async {
                    application.registerForRemoteNotifications()
                }
            }
        }
    }
    
    // MARK: - Remote Notification Registration
    
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // Pass device token to Firebase
        Messaging.messaging().apnsToken = deviceToken
    }
    
    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[Push] Failed to register for remote notifications: \(error.localizedDescription)")
    }
    
    // MARK: - MessagingDelegate
    
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else { return }
        
        // Send token to backend
        Task {
            await sendTokenToBackend(token)
        }
    }
    
    private func sendTokenToBackend(_ token: String) async {
        // Register the device token via the register_push_token RPC (SECURITY
        // DEFINER, server-side upsert). Replaces the old direct PostgREST upsert
        // into push_tokens so the table needs NO anon policies — the anon key can
        // register a token but can't read/enumerate or deactivate tokens.
        guard let url = URL(string: "\(Secrets.supabaseURL)/rest/v1/rpc/register_push_token") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(Secrets.supabaseAnonKey)", forHTTPHeaderField: "Authorization")

        var body: [String: Any] = [
            "p_device_token": token,
            "p_platform": "ios"
        ]
        // Identity (auth user, else install UUID) rides along so pick-drop pushes
        // can tier payers (full pick) vs free users (tease). Server COALESCEs, so
        // a later signed-in re-register upgrades the token's identity.
        body["p_identity"] = SupabaseAPI.identityId

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            _ = try await URLSession.shared.data(for: request)
        } catch {
            print("[Push] Failed to register FCM token with backend: \(error.localizedDescription)")
        }
    }
    
    // MARK: - UNUserNotificationCenterDelegate
    
    // Handle notification when app is in foreground
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        // Show banner and play sound even when app is in foreground
        completionHandler([.banner, .badge, .sound])
    }
    
    // Handle notification tap
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        // Handle deep linking or navigation based on notification data
        // Future: Add custom logic here to navigate to specific screens
        completionHandler()
    }
}

// MARK: - App Entry Point

@main
struct GaryApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var authManager = AuthManager.shared
    @AppStorage("hasEntered") private var hasEntered: Bool = false

    var body: some Scene {
        WindowGroup {
            // DESIGN BRANCH ONLY (design/home-depth-studies): boot straight
            // into the five depth-background studies. Never merges to main.
            DepthStudiesView()
        }
    }
}

private struct _RetiredRoot: View {
    @ObservedObject var authManager = AuthManager.shared
    @AppStorage("hasEntered") private var hasEntered: Bool = false
    var body: some View {
            Group {
                if hasEntered {
                    ContentView()
                        .environmentObject(authManager)
                } else {
                    AccessView()
                        .environmentObject(authManager)
                }
            }
            .preferredColorScheme(.dark)
            // Native Google sign-in's redirect (the reversed-client-id
            // scheme) routes back through the SDK; every other URL is
            // untouched (handle() returns false and nothing else consumes
            // URLs here — the Supabase web flow completes inside its own
            // ASWebAuthenticationSession).
            .onOpenURL { url in
                _ = GIDSignIn.sharedInstance.handle(url)
            }
            .task {
                #if DEBUG
                dumpShareCardRendersIfRequested()
                #endif
            }
    }
}
