import Foundation

/// Serializes device registration against the latest permission/account state.
/// The coordinator never logs tokens, account identifiers, or request bodies.
@MainActor
final class PushRegistrationCoordinator {
    struct Credentials: Equatable {
        let owner: String?
        let bearer: String?
    }
    struct Receipt: Decodable { let ok: Bool; let applied: Bool; let revision: Int64 }
    enum SyncError: Error { case storageUnavailable, invalidResponse, rejected(Int) }
    private struct Update: Equatable {
        let token: String
        let active: Bool
        let credentials: Credentials
        let revision: Int64
    }

    private let origin: URL
    private let apiKey: String
    private let read: (String) -> String?
    private let write: (String, String) -> Bool
    private let credentials: () -> Credentials
    private let renew: () async -> Void
    private let send: (URLRequest) async throws -> (Data, HTTPURLResponse)
    private let sleep: (UInt64) async -> Void
    private var authorized: Bool?
    private var deviceToken: String?
    private var pendingToken: String?
    private var desired: Update?
    private var lastSuccess: Update?
    private var worker: Task<Void, Never>?
    private(set) var needsRetry = false

    private static let installationKey = "gary_push_registration_installation"
    private static let revisionKey = "gary_push_registration_revision"
    private static let tokenKey = "gary_push_registration_token"
    private static let maximumRevision: Int64 = 9_007_199_254_740_991

    init(origin: URL, apiKey: String,
         read: @escaping (String) -> String?, write: @escaping (String, String) -> Bool,
         credentials: @escaping () -> Credentials, renew: @escaping () async -> Void,
         send: @escaping (URLRequest) async throws -> (Data, HTTPURLResponse),
         sleep: @escaping (UInt64) async -> Void = { try? await Task.sleep(nanoseconds: $0) }) {
        self.origin = origin; self.apiKey = apiKey; self.read = read; self.write = write
        self.credentials = credentials; self.renew = renew; self.send = send; self.sleep = sleep
        deviceToken = read(Self.tokenKey)
    }

    func receivedToken(_ token: String) {
        guard (32...4096).contains(token.count) else { return }
        pendingToken = token
        requestSync()
    }

    func setAuthorized(_ allowed: Bool) {
        authorized = allowed
        requestSync()
    }

    /// Call on sign-in/out, token renewal, and foreground authorization checks.
    /// The permissions/token gates prevent creating any installation before
    /// push has ever been enabled. A remembered token can be deactivated later.
    func requestSync(force: Bool = false) {
        // A background launch before first unlock may not yet read Keychain.
        // Retry that read on foreground even when Firebase remains disabled.
        if deviceToken == nil { deviceToken = read(Self.tokenKey) }
        if let token = pendingToken {
            guard write(Self.tokenKey, token) else {
                // Retain a newly issued token for the next foreground/auth
                // event. A storage outage must not resume an older token.
                desired = nil; needsRetry = true; return
            }
            deviceToken = token
            pendingToken = nil
        }
        guard let active = authorized, let token = deviceToken else { return }
        let account = active ? credentials() : Credentials(owner: nil, bearer: nil)
        if !force, !needsRetry, let prior = desired,
           prior.token == token, prior.active == active, prior.credentials == account {
            return
        }
        guard installationID() != nil, let revision = nextRevision() else {
            desired = nil; needsRetry = true; return
        }
        desired = Update(token: token, active: active, credentials: account, revision: revision)
        needsRetry = false
        if worker == nil {
            worker = Task { await drain() }
        }
    }

    private func installationID() -> UUID? {
        if let saved = read(Self.installationKey), let id = UUID(uuidString: saved) { return id }
        let id = UUID()
        return write(Self.installationKey, id.uuidString) ? id : nil
    }

    private func nextRevision(after floor: Int64 = 0) -> Int64? {
        let previous = max(Int64(read(Self.revisionKey) ?? "") ?? 0, floor)
        guard previous < Self.maximumRevision else { return nil }
        let next = previous + 1
        return write(Self.revisionKey, String(next)) ? next : nil
    }

    private func makeRequest(_ update: Update) throws -> URLRequest {
        guard let id = installationID() else { throw SyncError.storageUnavailable }
        var request = URLRequest(url: origin.appendingPathComponent("rest/v1/rpc/sync_push_registration"))
        request.httpMethod = "POST"; request.timeoutInterval = 20
        request.setValue(apiKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(update.credentials.bearer ?? apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "p_device_token": update.token, "p_platform": "ios",
            "p_installation_id": id.uuidString, "p_revision": update.revision,
            "p_active": update.active,
        ])
        return request
    }

    private func drain() async {
        defer { worker = nil }
        var failures = 0
        var failedRevision: Int64?
        var reconciliations = 0
        var renewals = 0
        while let update = desired, update != lastSuccess, !Task.isCancelled {
            if failedRevision != update.revision { failures = 0; failedRevision = update.revision }
            do {
                let (data, response) = try await send(makeRequest(update))
                // An account change queued while this request was in flight
                // already has a newer durable revision. Never renew its old JWT.
                guard desired == update else { continue }
                if response.statusCode == 401, update.credentials.bearer != nil, renewals == 0 {
                    renewals += 1
                    failures += 1
                    await renew()
                    guard desired == update else { continue }
                    if credentials() != update.credentials { requestSync(force: true); continue }
                }
                guard (200...299).contains(response.statusCode) else { throw SyncError.rejected(response.statusCode) }
                let receipt = try JSONDecoder().decode(Receipt.self, from: data)
                guard receipt.ok, receipt.revision >= update.revision,
                      receipt.revision <= Self.maximumRevision else { throw SyncError.invalidResponse }
                if !receipt.applied {
                    // A restored local counter or lost receipt can be behind
                    // the server. Advance beyond the server without treating an
                    // older account's stored state as this request's success.
                    reconciliations += 1
                    guard reconciliations <= 3 else { needsRetry = true; return }
                    guard let revision = nextRevision(after: receipt.revision) else { throw SyncError.storageUnavailable }
                    desired = Update(token: update.token, active: update.active,
                                     credentials: update.credentials, revision: revision)
                    continue
                }
                guard receipt.revision == update.revision else { throw SyncError.invalidResponse }
                lastSuccess = update; needsRetry = false
            } catch {
                guard desired == update else { continue }
                if case SyncError.rejected(let status) = error,
                   status != 408, status != 425, status != 429,
                   !(500...599).contains(status) {
                    needsRetry = true; return
                }
                failures += 1
                if failures >= 3 { needsRetry = true; return }
                await sleep(UInt64(failures) * 1_000_000_000)
            }
        }
    }

    /// Fixture/helper boundary; application code need not wait on registration.
    func waitUntilIdle() async { await worker?.value }
}
