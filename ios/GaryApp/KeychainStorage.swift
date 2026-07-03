import Foundation
import Security

// MARK: - Keychain-backed storage for auth secrets
//
// Auth tokens used to live in UserDefaults (@AppStorage), which is plaintext
// in device backups and trivially readable on a jailbroken phone. The two
// token values (access/refresh) now live in the Keychain with
// kSecAttrAccessibleAfterFirstUnlock. gary_user_id / gary_user_email stay in
// UserDefaults ON PURPOSE: SupabaseAPI.identityId reads gary_user_id straight
// from UserDefaults for entitlement identity — moving it would silently break
// checkout/entitlement keying.
//
// Migration: on first read, if the Keychain has no value but UserDefaults
// does, the value moves over and the UserDefaults copy is deleted — existing
// signed-in sessions survive the 2.18 update with no re-login.

enum KeychainStore {
    private static let service = "ai.betwithgary.app.auth"

    private static func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: key]
    }

    static func get(_ key: String) -> String? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data,
              let s = String(data: data, encoding: .utf8) else { return nil }
        return s
    }

    static func set(_ key: String, _ value: String) {
        guard !value.isEmpty else { delete(key); return }
        guard let data = value.data(using: .utf8) else { return }
        var q = query(key)
        let update: [String: Any] = [kSecValueData as String: data]
        let status = SecItemUpdate(q as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            q[kSecValueData as String] = data
            q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(q as CFDictionary, nil)
        }
    }

    static func delete(_ key: String) {
        SecItemDelete(query(key) as CFDictionary)
    }
}

/// Drop-in replacement for `@AppStorage` on auth secrets: same `String`
/// get/set surface, Keychain persistence, one-time silent migration from the
/// old UserDefaults key so existing sessions carry over.
@propertyWrapper
struct KeychainStorage {
    let key: String

    init(_ key: String) { self.key = key }

    var wrappedValue: String {
        get {
            if let v = KeychainStore.get(key) { return v }
            // One-time migration from the pre-2.18 UserDefaults location.
            if let legacy = UserDefaults.standard.string(forKey: key), !legacy.isEmpty {
                KeychainStore.set(key, legacy)
                UserDefaults.standard.removeObject(forKey: key)
                return legacy
            }
            return ""
        }
        set { KeychainStore.set(key, newValue) }
    }
}
