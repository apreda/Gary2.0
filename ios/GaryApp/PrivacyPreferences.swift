import Foundation

/// Optional first-party product measurement. Essential account, billing and
/// notification requests do not depend on this device-local preference.
enum PrivacyPreferences {
    static let analyticsKey = "gary_analytics_allowed"

    static func eventPayload(_ event: String, props: [String: Any], accountID: String?,
                             defaults: UserDefaults = .standard) -> [String: Any]? {
        guard defaults.bool(forKey: analyticsKey) else { return nil }
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
