import Foundation

/// Optional first-party product measurement. Essential account, billing and
/// notification requests do not depend on this device-local preference.
enum PrivacyPreferences {
    static let analyticsKey = "gary_analytics_allowed"
    // Existing consent describes plans/checkout only. Reading requires its own
    // explicit grant; upgrading the app never broadens an earlier choice.
    static let readingAnalyticsKey = "gary_reading_analytics_allowed_v1"
    private static let planEvents: Set<String> = ["paywall_viewed", "plan_selected", "checkout_started", "checkout_blocked_signin"]
    private static let readingEvents: Set<String> = ["session_started", "meaningful_pick_view"]

    static func isEventAllowed(_ event: String, defaults: UserDefaults = .standard) -> Bool {
        if readingEvents.contains(event) { return defaults.bool(forKey: readingAnalyticsKey) }
        return planEvents.contains(event) && defaults.bool(forKey: analyticsKey)
    }

    static func eventPayload(_ event: String, props: [String: Any], accountID: String?,
                             defaults: UserDefaults = .standard) -> [String: Any]? {
        guard isEventAllowed(event, defaults: defaults) else { return nil }
        if readingEvents.contains(event) {
            guard let session = props["session_id"] as? String, UUID(uuidString: session) != nil,
                  props["measurement_version"] as? String == "reasoning_v2" else { return nil }
            var clean = ["session_id": session, "measurement_version": "reasoning_v2"]
            if event == "meaningful_pick_view" {
                guard props["content_type"] as? String == "pick", let surface = props["surface"] as? String,
                      ["game_card", "prop_card"].contains(surface) else { return nil }
                clean["content_type"] = "pick"; clean["surface"] = surface
            }
            // Reading sessions do not carry an account or installation ID,
            // including when the user happens to be signed in.
            return ["p_event": event, "p_identity": NSNull(), "p_platform": "ios", "p_props": clean]
        }
        let allowed: [String: Set<String>] = [
            "paywall_viewed": ["surface", "trigger", "sport_focus"],
            "plan_selected": ["plan", "sport", "billing"],
            "checkout_started": ["plan", "sport", "surface"],
            "checkout_blocked_signin": ["sport", "surface"],
        ]
        guard let keys = allowed[event] else { return nil }
        var clean: [String: String] = [:]
        for key in keys {
            if let value = props[key] as? String, value.count <= 80 { clean[key] = value }
        }
        // Signed-out events have no persistent identifier. Never reuse the
        // functional push-installation identifier for optional measurement.
        let identity: Any = accountID.flatMap { $0.isEmpty ? nil : $0 } as Any? ?? NSNull()
        return ["p_event": event, "p_identity": identity, "p_platform": "ios", "p_props": clean]
    }
}

/// The external-purchase exception used by this release is U.S.-specific.
/// Unknown storefronts fail closed; locale, device language and IP are not
/// substitutes for the Apple account's storefront.
enum ExternalCheckoutPolicy {
    static func permitsPurchase(countryCode: String?) -> Bool { countryCode == "USA" }
    static let unavailableMessage = "Winners purchases aren't available from this App Store region. Sign in to use access already included in your account."
}

/// How many new installs reach each first step, and whether they come back
/// (founder, Nov 6 2026: "people to actually start using the app"). Counts with
/// no identifier of any kind: a step, the day the app was first opened and the
/// app version, once per install, from new installs only. Nothing here can tell
/// one person's steps from another's. Described in the privacy policy.
enum AppCounts {
    enum Step: String {
        case firstOpen = "first_open"
        case entered = "entered"
        case readPick = "read_pick"
        case openedWinners = "opened_winners"
        case nextDay = "returned_next_day"
        case thisWeek = "returned_week"
        case thisMonth = "returned_month"
    }

    private static let installKey = "counts.installDate"
    private static let dayFormat: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// A store install: not the simulator or a Debug build, and not TestFlight.
    private static var counts: Bool {
        #if DEBUG
        return false
        #else
        return Bundle.main.appStoreReceiptURL?.lastPathComponent != "sandboxReceipt"
        #endif
    }

    /// The app came to the front. An install that had already entered the app
    /// when this arrived is not new, and stays out of the counts.
    static func appActive(alreadyEntered: Bool) {
        let store = UserDefaults.standard
        guard let installed = store.object(forKey: installKey) as? Date else {
            guard !alreadyEntered else { return }
            store.set(Date(), forKey: installKey)
            once(.firstOpen)
            return
        }
        let calendar = Calendar.current
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: installed),
                                           to: calendar.startOfDay(for: Date())).day ?? 0
        switch days {
        case 1: once(.nextDay)
        case 2...7: once(.thisWeek)
        case 8...30: once(.thisMonth)
        default: break
        }
    }

    /// Counts a step the first time this new install reaches it.
    static func once(_ step: Step) {
        let store = UserDefaults.standard
        guard let installed = store.object(forKey: installKey) as? Date else { return }
        let sent = "counts.sent.\(step.rawValue)"
        guard !store.bool(forKey: sent) else { return }
        store.set(true, forKey: sent)
        guard counts, let url = URL(string: "\(Secrets.supabaseURL)/rest/v1/rpc/count_app_step") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(Secrets.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        req.httpBody = try? JSONSerialization.data(withJSONObject: [
            "p_step": step.rawValue, "p_install_day": dayFormat.string(from: installed), "p_version": version,
        ])
        Task.detached { _ = try? await URLSession.shared.data(for: req) }
    }
}
