import SwiftUI

// MARK: - App Entry Point

@main
struct GaryApp: App {
    @AppStorage("hasEntered") private var hasEntered: Bool = false
    
    init() {
        // Reset for testing - REMOVE FOR PRODUCTION
        UserDefaults.standard.set(false, forKey: "hasEntered")
    }
    
    var body: some Scene {
        WindowGroup {
            Group {
                if hasEntered {
                    ContentView()
                } else {
                    AccessView()
                }
            }
            .preferredColorScheme(.dark)
        }
    }
}
