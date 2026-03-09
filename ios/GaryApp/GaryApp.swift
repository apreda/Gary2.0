import SwiftUI
import FirebaseCore
import FirebaseMessaging
import UserNotifications

// MARK: - App Delegate for Push Notifications

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {
    
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Configure Firebase
        FirebaseApp.configure()
        
        // Set messaging delegate
        Messaging.messaging().delegate = self
        
        // Set notification center delegate
        UNUserNotificationCenter.current().delegate = self
        
        // Request notification permissions
        requestNotificationPermissions(application)
        
        return true
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
        // Store token in Supabase for sending push notifications
        guard let url = URL(string: "\(Secrets.supabaseURL)/rest/v1/push_tokens?on_conflict=device_token") else { return }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(Secrets.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        request.setValue("return=minimal,resolution=merge-duplicates", forHTTPHeaderField: "Prefer")
        
        let body: [String: Any] = [
            "device_token": token,
            "platform": "ios",
            "active": true
        ]
        
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
    
    var body: some Scene {
        WindowGroup {
            ContentView()
            .preferredColorScheme(.dark)
        }
    }
}
