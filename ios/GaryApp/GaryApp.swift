import SwiftUI
import FirebaseCore
import GoogleSignIn
import FirebaseMessaging
import UserNotifications

// MARK: - App Delegate for Push Notifications

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {
    @MainActor private var notificationSettingsGeneration = UUID()
    
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Set notification center delegate
        UNUserNotificationCenter.current().delegate = self

        // Firebase Installations raises an Objective-C exception (not a Swift
        // Error) when a redacted/malformed API key is bundled. That exception
        // used to abort the app before its first frame. Validate the plist first:
        // a bad local/Xcode Cloud secret may disable push, but it can never make
        // Gary unlaunchable again.
        // Push is optional: avoid initializing its SDK (and installation
        // diagnostics) before the user grants notification permission.
        requestNotificationPermissions(application)
        
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
        FirebaseApp.app()?.isDataCollectionDefaultEnabled = false
        return FirebaseApp.app() != nil
    }
    
    private func requestNotificationPermissions(_ application: UIApplication) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { [weak self] _, _ in
            Task { @MainActor in
                // Read the current OS result, including denial. A delayed
                // permission callback cannot replay an older authorization.
                self?.refreshNotificationAuthorization(application)
            }
        }
    }

    @MainActor
    func refreshNotificationAuthorization(_ application: UIApplication) {
        let generation = UUID()
        notificationSettingsGeneration = generation
        Task { @MainActor [weak self] in
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            guard let self, self.notificationSettingsGeneration == generation else { return }
            let allowed: Bool
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral: allowed = true
            default: allowed = false
            }
            // A remembered token can be deactivated even when Firebase has
            // not been initialized during this launch.
            PushRegistrationCoordinator.shared.setAuthorized(allowed)
            guard allowed else {
                if FirebaseApp.app() != nil { Messaging.messaging().isAutoInitEnabled = false }
                return
            }
            guard FirebaseApp.app() != nil || self.configureFirebaseIfValid() else { return }
            Messaging.messaging().delegate = self
            Messaging.messaging().isAutoInitEnabled = true
            application.registerForRemoteNotifications()
        }
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Compatibility for an app-delegate lifecycle. The SwiftUI scene
        // below also forwards activation; duplicate reads safely coalesce.
        Task { @MainActor in refreshNotificationAuthorization(application) }
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
        Task { @MainActor in
            PushRegistrationCoordinator.shared.receivedToken(token)
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
        guard response.actionIdentifier == UNNotificationDefaultActionIdentifier else {
            completionHandler()
            return
        }
        let request = response.notification.request
        Task { @MainActor in
            GaryPushNavigation.shared.receive(request.content.userInfo, requestID: request.identifier)
            completionHandler()
        }
    }
}

// MARK: - App Entry Point

@main
struct GaryApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var authManager = AuthManager.shared
    @AppStorage("hasEntered") private var hasEntered: Bool = false

    var body: some Scene {
        WindowGroup {
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
            .onChange(of: scenePhase) { phase in
                if phase == .active {
                    appDelegate.refreshNotificationAuthorization(UIApplication.shared)
                }
            }
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
}
