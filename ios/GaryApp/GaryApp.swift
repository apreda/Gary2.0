import SwiftUI

// MARK: - App Entry Point

@main
struct GaryApp: App {
    // TODO: Re-enable hasEntered check for production
    // @AppStorage("hasEntered") private var hasEntered: Bool = false
    
    var body: some Scene {
        WindowGroup {
            Group {
                // Temporarily always show AccessView for testing
                // if hasEntered {
                //     ContentView()
                // } else {
                    AccessView()
                // }
            }
            .preferredColorScheme(.dark)
        }
    }
}
