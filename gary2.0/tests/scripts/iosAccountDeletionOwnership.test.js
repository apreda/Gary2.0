import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const auth = readFileSync(new URL('../../../ios/GaryApp/AuthManager.swift', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../../../ios/GaryApp/SettingsView.swift', import.meta.url), 'utf8');
const view = readFileSync(new URL('../../../ios/GaryApp/AuthView.swift', import.meta.url), 'utf8');
const hasSwift = spawnSync('swiftc', ['--version'], { encoding: 'utf8' }).status === 0;
function declaration(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing shipping declaration: ${marker}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed shipping declaration: ${marker}`);
}
const methods = [
  'private func authURL(', 'func signIn(email:', 'func handleOAuthCallback(',
  'func accountDeletionIntent(', 'func isCurrentDeletionIntent(', 'func canPresentDeletionResult(',
  'private func accountDeletionRequest(', 'func deleteAccount(intent:', 'private func fetchCurrentUser(',
  'private func fetchUser(', 'private func refreshSession(', 'private func handleAuthResponse(',
  'private func remember(', 'private func clearSession(',
].map(marker => declaration(auth, marker).replaceAll('private func ', 'func ')
  .replaceAll('URLSession.shared', 'transport')).join('\n');
const models = auth.slice(auth.indexOf('struct AccountDeletionIntent:'));
const settingsMethods = ['private func accountChanged(', 'private func deleteConfirmedAccount(']
  .map(marker => declaration(settings, marker).replace('private func ', 'func ')).join('\n');
const emailMethods = ['private func cancelEmailSubmission(', 'private func handleSubmit(']
  .map(marker => declaration(view, marker).replace('private func ', 'func ')).join('\n');

// The original shipping deletion method's critical behavior: confirmation had
// no account argument and read the current token when dispatched. Keep this
// negative control independent of the new guard implementation.
const originalDispatch = `
func originalDeleteAccount() async throws {
 guard !accessToken.isEmpty,
       let url = URL(string: "\\(baseURL)/functions/v1/delete-account") else { throw AuthError.unauthorized }
 let owner = currentUser?.id
 var request = URLRequest(url: url)
 request.httpMethod = "POST"
 request.setValue(apiKey, forHTTPHeaderField: "apikey")
 request.setValue("Bearer \\(accessToken)", forHTTPHeaderField: "Authorization")
 request.setValue("application/json", forHTTPHeaderField: "Content-Type")
 let (data, response) = try await transport.data(for: request)
 let result = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
 guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode), result?["ok"] as? Bool == true else {
   if result?["signed_out"] as? Bool == true, currentUser?.id == owner { clearSession() }
   throw AuthError.serverError("Account deletion did not finish.")
 }
 if currentUser?.id == owner { clearSession() }
}
`;

function fixture() {
  return `import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
${models}
enum PrivacyPreferences { static let analyticsKey = "fixture.analytics"; static let readingAnalyticsKey = "fixture.reading" }
enum KeychainStore { static func delete(_ key: String) {} }
@MainActor final class PushRegistrationCoordinator {
 static let shared = PushRegistrationCoordinator()
 func requestSync() {}
}
// Storage and transport are inert fixture adapters. No device credentials,
// real defaults, provider traffic, or account writes can leave this process.
final class UserDefaults {
 static let standard = UserDefaults()
 var removed: [String] = []
 func removeObject(forKey key: String) { removed.append(key) }
}
struct CheckFailure: Error { let message: String }
func check(_ condition: Bool, _ message: String) throws { if !condition { throw CheckFailure(message: message) } }
@MainActor final class Transport {
 var requests: [URLRequest] = []
 var pending: [Int: CheckedContinuation<(Data, URLResponse), Error>] = [:]
 func data(for request: URLRequest) async throws -> (Data, URLResponse) {
  let index = requests.count; requests.append(request)
  // Deliberately ignores Task cancellation, proving shipping adoption guards
  // work even when a response has already arrived or cannot be canceled.
  return try await withCheckedThrowingContinuation { pending[index] = $0 }
 }
 func waitFor(_ count: Int) async throws {
  for _ in 0..<10000 { if requests.count >= count { return }; await Task.yield() }
  throw CheckFailure(message: "transport request did not arrive")
 }
 func reply(_ index: Int, _ body: String, status: Int = 200) {
  let response = HTTPURLResponse(url: requests[index].url!, statusCode: status, httpVersion: nil, headerFields: nil)!
  pending.removeValue(forKey: index)!.resume(returning: (Data(body.utf8), response))
 }
}
@MainActor final class AuthManager {
 var isAuthenticated = false
 var currentUser: GaryUser?
 var accountGeneration = UUID()
 var errorMessage: String?
 var infoMessage: String?
 var accessToken = ""
 var refreshToken = ""
 var userId = ""
 var userEmail = ""
 let baseURL = "https://fixture.invalid"
 let apiKey = "fixture-public"
 let transport = Transport()
 func clearProfileCache() {}
 ${methods}
 ${originalDispatch}
 func install(_ owner: String) async throws {
  try await handleAuthResponse(AuthResponse(access_token: "token-" + owner, refresh_token: "refresh-" + owner,
   token_type: nil, expires_in: nil, user: GaryUser(id: owner, email: nil, phone: nil, created_at: nil, user_metadata: nil)),
   expectedGeneration: accountGeneration)
 }
}
@MainActor final class SettingsHarness {
 let authManager: AuthManager
 var showDeleteConfirm = false
 var deleteConfirmation: AccountDeletionIntent?
 var deleteOperationID: UUID?
 var deleting = false
 var deleteError: String?
 var deleteErrorGeneration: UUID?
 var showDeletionComplete = false
 var needsAppleRevocation = false
 var deletionResult: AccountDeletionResult?
 init(_ auth: AuthManager) { authManager = auth }
 ${settingsMethods}
}
@MainActor final class EmailHarness {
 let authManager: AuthManager
 var emailSubmission: Task<Void, Never>?
 var isSubmitting = false
 var isSignUp = false
 var email = "fixture@example.invalid"
 var password = "fixture-only"
 init(_ auth: AuthManager) { authManager = auth }
 ${emailMethods}
}
extension AuthManager {
 func signUp(email: String, password: String) async throws { throw CheckFailure(message: "signup outside fixture") }
}
@main struct OwnershipChecks {
 @MainActor static func main() async {
  do {
   let negative = CommandLine.arguments.contains("original-negative-control")
   let stale = AuthManager(); try await stale.install("A")
   let intent = try stale.accountDeletionIntent()
   try await stale.install("B")
   if negative {
    let old = Task { try await stale.originalDeleteAccount() }
    try await stale.transport.waitFor(1)
    stale.transport.reply(0, #"{"ok":true}"#)
    try await old.value
    try check(stale.transport.requests.isEmpty, "ORIGINAL_WRONG_ACCOUNT_DISPATCH")
   }
   do { _ = try await stale.deleteAccount(intent: intent); throw CheckFailure(message: "B accepted A intent") }
   catch is CancellationError {}
   try await stale.install("A")
   do { _ = try await stale.deleteAccount(intent: intent); throw CheckFailure(message: "ABA accepted old intent") }
   catch is CancellationError {}
   try check(stale.transport.requests.isEmpty, "stale intent dispatched")
   let ui = SettingsHarness(stale); ui.deleteConfirmation = intent; ui.showDeleteConfirm = true
   ui.accountChanged(to: stale.accountGeneration)
   try check(!ui.showDeleteConfirm && ui.deleteConfirmation == nil, "stale alert survived")

   // Ordinary refresh preserves the intent; the eventual request uses the
   // refreshed owner's token and a successful own-clear notice stays valid.
   let refreshed = AuthManager(); try await refreshed.install("A")
   let freshIntent = try refreshed.accountDeletionIntent(); let generation = refreshed.accountGeneration
   let refresh = Task { try await refreshed.refreshSession() }
   try await refreshed.transport.waitFor(1)
   refreshed.transport.reply(0, #"{"access_token":"token-A-new","refresh_token":"refresh-A-new"}"#)
   try await refresh.value
   try check(refreshed.accountGeneration == generation && refreshed.isCurrentDeletionIntent(freshIntent), "refresh invalidated owner")
   let freshUI = SettingsHarness(refreshed); freshUI.deleteConfirmation = freshIntent
   let deletion = Task { await freshUI.deleteConfirmedAccount(freshIntent) }
   try await refreshed.transport.waitFor(2)
   try check(refreshed.transport.requests[1].value(forHTTPHeaderField: "Authorization") == "Bearer token-A-new", "token not pinned")
   refreshed.transport.reply(1, #"{"ok":true,"apple_revocation_required":true}"#)
   await deletion.value
   freshUI.accountChanged(to: refreshed.accountGeneration)
   try check(!refreshed.isAuthenticated && freshUI.showDeletionComplete && freshUI.needsAppleRevocation, "own clear hid completion")
   let completed = freshUI.deletionResult!
   try await refreshed.install("B"); refreshed.clearSession()
   try check(!refreshed.canPresentDeletionResult(completed), "old completion accepted replacement signout")
   freshUI.accountChanged(to: refreshed.accountGeneration)
   try check(!freshUI.showDeletionComplete, "stale completion visible")

   // Old success and signed-out failure cannot clear B or a new A session,
   // reset consent, or populate a replacement account's alert/error state.
   for returnToA in [false, true] {
    for success in [false, true] {
     let a = AuthManager(); try await a.install("A")
     let i = try a.accountDeletionIntent(); let s = SettingsHarness(a); s.deleteConfirmation = i
     let pending = Task { await s.deleteConfirmedAccount(i) }
     try await a.transport.waitFor(1)
     try await a.install("B"); if returnToA { try await a.install("A") }
     s.accountChanged(to: a.accountGeneration)
     let privacyRemovals = UserDefaults.standard.removed.count
     a.transport.reply(0, success ? #"{"ok":true}"# : #"{"ok":false,"signed_out":true,"error":"Retry deletion"}"#, status: success ? 200 : 503)
     await pending.value
     try check(a.isAuthenticated && a.currentUser?.id == (returnToA ? "A" : "B"), "late result cleared replacement")
     try check(!s.showDeletionComplete && s.deleteError == nil && !s.deleting, "late result leaked UI")
     try check(UserDefaults.standard.removed.count == privacyRemovals, "late result cleared consent")
    }
   }
   let failed = AuthManager(); try await failed.install("A")
   let failedIntent = try failed.accountDeletionIntent(); let failedUI = SettingsHarness(failed)
   let failure = Task { await failedUI.deleteConfirmedAccount(failedIntent) }
   try await failed.transport.waitFor(1)
   failed.transport.reply(0, #"{"ok":false,"signed_out":true,"error":"Retry deletion"}"#, status: 503)
   await failure.value; failedUI.accountChanged(to: failed.accountGeneration)
   try check(!failed.isAuthenticated && failedUI.deleteError == "Retry deletion", "current signed-out failure lost guidance")

   // Actual shipping dismissal cancellation plus actual email adoption, with
   // a transport that still delivers success after cancellation.
   let emailAuth = AuthManager(); let emailUI = EmailHarness(emailAuth)
   let emailTask = Task { await emailUI.handleSubmit() }; emailUI.emailSubmission = emailTask
   try await emailAuth.transport.waitFor(1); emailUI.cancelEmailSubmission()
   emailAuth.transport.reply(0, #"{"access_token":"token-B","refresh_token":"refresh-B","user":{"id":"B"}}"#)
   await emailTask.value
   try check(!emailAuth.isAuthenticated && emailAuth.accessToken.isEmpty, "dismissed email replaced session")
   let pendingEmail = AuthManager()
   let signIn = Task { try await pendingEmail.signIn(email: "fixture@example.invalid", password: "fixture") }
   try await pendingEmail.transport.waitFor(1); try await pendingEmail.install("A")
   pendingEmail.transport.reply(0, #"{"access_token":"token-B","user":{"id":"B"}}"#)
   do { try await signIn.value; throw CheckFailure(message: "late email adopted B") } catch is CancellationError {}
   try check(pendingEmail.currentUser?.id == "A", "late email replaced A")

   // The existing web OAuth callback validates its candidate token first.
   // It cannot expose token B beside user A, nor adopt after C signs in.
   let oauth = AuthManager(); try await oauth.install("A")
   let oauthIntent = try oauth.accountDeletionIntent()
   let callback = Task { try await oauth.handleOAuthCallback(url: URL(string: "com.gary.app://auth-callback#access_token=token-B&refresh_token=refresh-B")!) }
   try await oauth.transport.waitFor(1)
   try check(oauth.accessToken == "token-A" && oauth.currentUser?.id == "A" && oauth.isCurrentDeletionIntent(oauthIntent), "OAuth published mixed session")
   try check(oauth.transport.requests[0].value(forHTTPHeaderField: "Authorization") == "Bearer token-B", "OAuth validated wrong token")
   try await oauth.install("C"); oauth.transport.reply(0, #"{"id":"B"}"#)
   do { try await callback.value; throw CheckFailure(message: "stale OAuth adopted B") } catch is CancellationError {}
   try check(oauth.currentUser?.id == "C" && oauth.accessToken == "token-C", "OAuth replaced C")
   print("NATIVE_DELETION_OWNERSHIP_OK")
  } catch let error as CheckFailure {
   print(error.message); exit(1)
  } catch { print("Unexpected fixture error: \\(error)"); exit(1) }
 }
}
`;
}

describe('native account deletion ownership', () => {
  it.skipIf(!hasSwift)('executes shipping transport, ownership, adoption, and completion logic; original dispatch fails', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-delete-owner-'));
    try {
      const file = join(directory, 'Ownership.swift');
      const binary = join(directory, 'ownership');
      writeFileSync(file, fixture());
      execFileSync('swiftc', ['-O', '-swift-version', '5', '-parse-as-library', file, '-o', binary], { encoding: 'utf8', timeout: 45000 });
      expect(execFileSync(binary, [], { encoding: 'utf8', timeout: 15000 })).toContain('NATIVE_DELETION_OWNERSHIP_OK');
      const original = spawnSync(binary, ['original-negative-control'], { encoding: 'utf8', timeout: 15000 });
      expect(original.status).toBe(1);
      expect(original.stdout).toContain('ORIGINAL_WRONG_ACCOUNT_DISPATCH');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 80000);

  it('wires the shipping alert to its captured intent and cancels email work on dismissal', () => {
    expect(settings).toContain('deleteConfirmation = try authManager.accountDeletionIntent()');
    expect(settings).toContain('presenting: deleteConfirmation) { intent in');
    expect(settings).toContain('Task { await deleteConfirmedAccount(intent) }');
    expect(settings).toContain('.onChange(of: authManager.accountGeneration) { generation in');
    expect(view).toContain('emailSubmission = Task { await handleSubmit() }');
    expect(view).toContain('.onDisappear {\n            cancelEmailSubmission()');
  });
});
