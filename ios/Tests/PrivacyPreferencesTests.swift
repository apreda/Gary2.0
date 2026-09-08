import Foundation

@main
struct PrivacyPreferencesTests {
    static func main() throws {
        let suite = "gary-privacy-tests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let event = "plan_selected"
        let props: [String: Any] = ["plan": "all_access", "billing": "monthly", "email": "private@example.invalid", "note": "private bet", "sport": 42]
        precondition(PrivacyPreferences.eventPayload(event, props: props, accountID: "owner", defaults: defaults) == nil)
        defaults.set(true, forKey: PrivacyPreferences.analyticsKey)
        let signedIn = PrivacyPreferences.eventPayload(event, props: props, accountID: "owner", defaults: defaults)!
        precondition(signedIn["p_identity"] as? String == "owner")
        precondition(signedIn["p_props"] as? [String: String] == ["plan": "all_access", "billing": "monthly"])
        let signedOut = PrivacyPreferences.eventPayload(event, props: props, accountID: nil, defaults: defaults)!
        precondition(signedOut["p_identity"] is NSNull)
        precondition(PrivacyPreferences.eventPayload(event, props: props, accountID: "", defaults: defaults)!["p_identity"] is NSNull)
        precondition(PrivacyPreferences.eventPayload("private_bet", props: props, accountID: "owner", defaults: defaults) == nil)
        let oversized = PrivacyPreferences.eventPayload(event, props: ["plan": String(repeating: "x", count: 81)], accountID: nil, defaults: defaults)!
        precondition((oversized["p_props"] as? [String: String])?.isEmpty == true)
        _ = try JSONSerialization.data(withJSONObject: signedOut)
        defaults.set(false, forKey: PrivacyPreferences.analyticsKey)
        precondition(PrivacyPreferences.eventPayload(event, props: props, accountID: "owner", defaults: defaults) == nil)
        let reading: [String: Any] = ["session_id": "10000000-0000-4000-8000-000000000001", "measurement_version": "reasoning_v2", "content_type": "pick", "surface": "game_card", "content_key": "private pick", "account_id": "owner", "reasoning": "private reasoning", "stake": 25]
        // Old checkout consent never grants the newly described reading scope.
        defaults.set(true, forKey: PrivacyPreferences.analyticsKey)
        precondition(PrivacyPreferences.eventPayload("meaningful_pick_view", props: reading, accountID: "owner", defaults: defaults) == nil)
        defaults.set(false, forKey: PrivacyPreferences.analyticsKey)
        defaults.set(true, forKey: PrivacyPreferences.readingAnalyticsKey)
        precondition(PrivacyPreferences.eventPayload("plan_selected", props: props, accountID: "owner", defaults: defaults) == nil)
        let readingPayload = PrivacyPreferences.eventPayload("meaningful_pick_view", props: reading, accountID: "owner", defaults: defaults)!
        precondition(readingPayload["p_identity"] is NSNull)
        precondition(readingPayload["p_props"] as? [String: String] == ["session_id": "10000000-0000-4000-8000-000000000001", "measurement_version": "reasoning_v2", "content_type": "pick", "surface": "game_card"])
        let sessionPayload = PrivacyPreferences.eventPayload("session_started", props: reading, accountID: "owner", defaults: defaults)!
        precondition(sessionPayload["p_identity"] is NSNull)
        precondition((sessionPayload["p_props"] as? [String: String])?.count == 2)
        precondition(PrivacyPreferences.eventPayload("meaningful_pick_view", props: ["session_id": "bad", "measurement_version": "reasoning_v2", "surface": "game_card", "content_type": "pick"], accountID: nil, defaults: defaults) == nil)
        precondition(PrivacyPreferences.eventPayload("meaningful_pick_view", props: ["session_id": "10000000-0000-4000-8000-000000000001", "measurement_version": "reasoning_v2", "surface": "private-notes", "content_type": "pick"], accountID: nil, defaults: defaults) == nil)
        defaults.set(false, forKey: PrivacyPreferences.readingAnalyticsKey)
        precondition(!PrivacyPreferences.isEventAllowed("session_started", defaults: defaults))
        precondition(!PrivacyPreferences.isEventAllowed("meaningful_pick_view", defaults: defaults))
        precondition(PrivacyPreferences.eventPayload("meaningful_pick_view", props: reading, accountID: nil, defaults: defaults) == nil)
        precondition(ExternalCheckoutPolicy.permitsPurchase(countryCode: "USA"))
        for country in [nil, "", "US", "CAN", "GBR", "FRA"] as [String?] {
            precondition(!ExternalCheckoutPolicy.permitsPurchase(countryCode: country))
        }
        print("Privacy preferences: default off, opt-in, opt-out, unknown events, property minimization, anonymous identity and JSON encoding passed")
        print("External checkout: U.S. storefront allowed; unknown/non-U.S. storefronts fail closed")
    }
}
