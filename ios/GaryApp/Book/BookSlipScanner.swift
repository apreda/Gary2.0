import SwiftUI
import Charts
import PhotosUI

/// The slip scanner (Sep 9 2026): a screenshot goes to the `book-slip-scan`
/// edge function and comes back as form values. Nothing is saved until the
/// user taps Add — the reader fills the form, the user owns the entry.
enum SlipScanAPI {
    struct ScannedBet: Decodable, Identifiable {
        let description: String
        let league: String
        let market: String?
        let odds_american: Int?
        let stake_dollars: Double?
        let game_date: String?
        let result: String?
        let legs: [String]
        var id: String { "\(description)|\(game_date ?? "")|\(odds_american ?? 0)|\(stake_dollars ?? 0)" }
        var oddsText: String { odds_american.map { ($0 > 0 ? "+" : "") + String($0) } ?? "odds not shown" }
        var stakeText: String { stake_dollars.map { String(format: "$%.2f", $0) } ?? "stake not shown" }
    }
    struct Result: Decodable {
        let ok: Bool
        let bets: [ScannedBet]
        let sportsbook: String?
        let notes: String?
        let used: Int?
        let limit: Int?
    }
    private struct Failure: Decodable { let error: String? }

    @MainActor static func scan(jpeg: Data) async throws -> Result {
        guard let token = AuthManager.shared.bearerToken else { throw UserBookError.notSignedIn }
        var req = URLRequest(url: Secrets.supabaseURL.appendingPathComponent("/functions/v1/book-slip-scan"))
        req.httpMethod = "POST"
        req.timeoutInterval = 75
        req.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["image_base64": jpeg.base64EncodedString(), "media_type": "image/jpeg"])
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200...299).contains(status) else {
            let message = (try? JSONDecoder().decode(Failure.self, from: data))?.error
            throw UserBookError.server(message ?? "The slip reader is unavailable right now. Enter the bet by hand or try again shortly.")
        }
        return try JSONDecoder().decode(Result.self, from: data)
    }

    /// A phone screenshot is a few megabytes; the reader needs far less.
    static func prepare(_ image: UIImage, maxSide: CGFloat = 1600) -> Data? {
        let longest = max(image.size.width, image.size.height)
        let scale = longest > maxSide ? maxSide / longest : 1
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let rendered = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return rendered.jpegData(compressionQuality: 0.82)
    }
}

