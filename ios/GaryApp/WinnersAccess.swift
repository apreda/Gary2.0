import Foundation
import SwiftUI
import StoreKit

struct WinnersSubscription: Codable {
    let product_key: String
    let pass_type: String
    let status: String
    let expires_at: String?
    let cancel_at_period_end: Bool
}

struct WinnersAccessSnapshot: Codable {
    let preview: Bool
    let founding: Bool
    let sports: [String]
    let subscriptions: [WinnersSubscription]
    let can_manage: Bool

    var isFreeAccess: Bool { preview || founding }
    var title: String {
        if founding { return "Founding member" }
        if preview { return "Winners preview" }
        if sports.contains("ALL") { return "All-Access member" }
        if !sports.isEmpty { return "\(sports.sorted().joined(separator: " + ")) member" }
        return "Gary Free"
    }
    var detail: String {
        if founding { return "Your founding access includes Winners. Your book and leaderboard are always free." }
        if preview { return "Winners is included through September 30. Create an account to keep your founding access." }
        if !sports.isEmpty { return "Winners is unlocked for your plan. Your personal book and leaderboard are included." }
        return "Full picks, your profile, bet tracking and leaderboards are free. A Winners pass unlocks the selected boards." }
    func unlocks(_ league: String) -> Bool { isFreeAccess || sports.contains("ALL") || sports.contains(league.uppercased()) }
}

@MainActor final class WinnersAccessStore: ObservableObject {
    static let shared = WinnersAccessStore()
    @Published var snapshot: WinnersAccessSnapshot?
    @Published var loading = false
    @Published var errorMessage: String?
    private var owner: String?
    private var generation = UUID()

    func clear() {
        generation = UUID(); owner = nil; snapshot = nil; errorMessage = nil; loading = false
    }

    func refresh() async {
        let identity = AuthManager.shared.currentUser?.id
        if owner != identity { snapshot = nil; owner = identity }
        let token = UUID(); generation = token; loading = true; errorMessage = nil
        do {
            let data = try await Self.request("rest/v1/rpc/get_my_access", body: [:])
            let access = try JSONDecoder().decode(WinnersAccessSnapshot.self, from: data)
            guard token == generation, identity == AuthManager.shared.currentUser?.id else { return }
            snapshot = access; loading = false
        } catch {
            guard token == generation, identity == AuthManager.shared.currentUser?.id else { return }
            loading = false; errorMessage = "Couldn't refresh your access. Try again when you're connected."
        }
    }

    func manageSubscription() async throws -> URL {
        try await Self.openURL("functions/v1/billing-portal", body: [:])
    }

    static func checkout(leagues: [String] = [], plan: String? = nil) async throws -> URL {
        #if !DEBUG
        guard ExternalCheckoutPolicy.permitsPurchase(countryCode: await Storefront.current?.countryCode) else {
            throw UserBookError.server(ExternalCheckoutPolicy.unavailableMessage)
        }
        #endif
        guard AuthManager.shared.isAuthenticated else { throw UserBookError.notSignedIn }
        var payload: [String: Any] = ["leagues": leagues]
        if let plan { payload["plan"] = plan }
        #if DEBUG
        payload["mode"] = "test"
        #else
        payload["mode"] = "live"
        #endif
        return try await openURL("functions/v1/create-checkout", body: payload)
    }

    private static func openURL(_ path: String, body: [String: Any]) async throws -> URL {
        let data = try await request(path, body: body)
        struct Response: Decodable { let url: String }
        let result = try JSONDecoder().decode(Response.self, from: data)
        guard let url = URL(string: result.url), url.scheme == "https", let host = url.host,
              host == "checkout.stripe.com" || host == "billing.stripe.com" else {
            throw UserBookError.server("Billing couldn't be opened. Please try again.")
        }
        return url
    }

    static func request(_ path: String, body: [String: Any]) async throws -> Data {
        let identity = AuthManager.shared.currentUser?.id
        var req = URLRequest(url: Secrets.supabaseRESTOriginURL.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(AuthManager.shared.bearerToken ?? Secrets.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        try Task.checkCancellation()
        var (data, response) = try await URLSession.shared.data(for: req)
        guard identity == AuthManager.shared.currentUser?.id else { throw CancellationError() }
        if (response as? HTTPURLResponse)?.statusCode == 401,
           let token = await AuthManager.shared.renewSessionIfPossible() {
            guard identity == AuthManager.shared.currentUser?.id else { throw CancellationError() }
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            (data, response) = try await URLSession.shared.data(for: req)
        }
        guard identity == AuthManager.shared.currentUser?.id else { throw CancellationError() }
        try Task.checkCancellation()
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            struct Failure: Decodable { let error: String? }
            let error = (try? JSONDecoder().decode(Failure.self, from: data))?.error
            throw UserBookError.server(error ?? "Couldn't verify your access. Please try again.")
        }
        return data
    }
}
