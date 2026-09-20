import SwiftUI
import Charts
import PhotosUI

struct UserBookShareImage: Identifiable {
    let id = UUID()
    let image: UIImage
}

struct BookSelectedDay: Identifiable {
    let date: String
    var id: String { date }
}

/// Plain UIActivityViewController wrapper for the Your Book share card
/// (mirrors the pick-card share sheet pattern).
struct UserBookShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

