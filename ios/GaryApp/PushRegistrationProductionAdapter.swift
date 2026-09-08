// Production dependencies stay outside the independently executable coordinator.
import Foundation
import Security

/// Registration capabilities belong to this device. Auth's separate Keychain
/// storage remains unchanged; these values cannot migrate to another phone.
private enum PushRegistrationKeychain {
    private static let service = "ai.betwithgary.app.push-registration"

    private static func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: key,
         kSecAttrSynchronizable as String: false]
    }

    static func get(_ key: String) -> String? {
        var request = query(key)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func set(_ key: String, _ value: String) -> Bool {
        guard !value.isEmpty, let data = value.data(using: .utf8) else { return false }
        var request = query(key)
        let values: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        var status = SecItemUpdate(request as CFDictionary, values as CFDictionary)
        if status == errSecItemNotFound {
            request.merge(values) { _, new in new }
            status = SecItemAdd(request as CFDictionary, nil)
        }
        return status == errSecSuccess && get(key) == value
    }
}

extension PushRegistrationCoordinator {
    static let shared = PushRegistrationCoordinator(
        origin: Secrets.supabaseURL,
        apiKey: Secrets.supabaseAnonKey,
        read: { PushRegistrationKeychain.get($0) },
        write: { PushRegistrationKeychain.set($0, $1) },
        credentials: {
            let auth = AuthManager.shared
            return Credentials(owner: auth.currentUser?.id, bearer: auth.bearerToken)
        },
        renew: { _ = await AuthManager.shared.renewSessionIfPossible() },
        send: { request in
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
            return (data, response)
        }
    )
}
