import SwiftUI

// MARK: - App Entry Point

@main
struct GaryApp: App {
    @AppStorage("hasEntered") private var hasEntered: Bool = false
    
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
