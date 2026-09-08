import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const source = readFileSync(new URL('../../../ios/GaryApp/ProfileExperience.swift', import.meta.url), 'utf8');
const hasSwift = spawnSync('swiftc', ['--version']).status === 0;
const start = source.indexOf('enum ProfileSafetyAPI {');
const end = source.indexOf('\nstruct PublicPlayerProfileSheet:', start);
if (start < 0 || end < 0) throw new Error('Native profile safety declaration is missing.');

describe('native profile safety receipt boundaries', () => {
  it.skipIf(!hasSwift)('executes the actual Swift API against success, malformed, rejected and unavailable responses', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-profile-safety-swift-'));
    try {
      const file = join(directory, 'SafetyTests.swift');
      writeFileSync(file, `import Foundation
// Only the transport is replaced. Production receipt validation and payload
// construction below are compiled and executed unchanged.
enum UserBookError: Error { case server(String) }
enum FixtureFailure: Error { case offline }
enum ProfileIdentityAPI {
 @MainActor static var response = Data()
 @MainActor static var offline = false
 @MainActor static var name = ""
 @MainActor static var payload: [String: Any] = [:]
 @MainActor static func request<T: Decodable>(_ name: String, body: [String: Any] = [:], authenticated: Bool = true) async throws -> T {
  precondition(authenticated)
  self.name = name; payload = body
  if offline { throw FixtureFailure.offline }
  return try JSONDecoder().decode(T.self, from: response)
 }
}
${source.slice(start, end)}
@main struct SafetyTests {
 @MainActor static func response(_ text: String) { ProfileIdentityAPI.response = Data(text.utf8) }
 @MainActor static func mustFail(_ action: () async throws -> Void) async {
  do { try await action(); preconditionFailure("An invalid receipt was accepted") } catch {}
 }
 @MainActor static func main() async throws {
  let target = "10000000-0000-4000-8000-000000000001"
  let receipt = "20000000-0000-4000-8000-000000000002"
  response(#"{"ok":true,"blocked":true}"#)
  try await ProfileSafetyAPI.block(target, blocked: true)
  precondition(ProfileIdentityAPI.name == "set_profile_block")
  precondition(ProfileIdentityAPI.payload["p_user"] as? String == target)
  precondition(ProfileIdentityAPI.payload["p_blocked"] as? Bool == true)
  precondition(ProfileIdentityAPI.payload.count == 2)
  await mustFail { try await ProfileSafetyAPI.block(target, blocked: false) }
  response(#"{"ok":false,"blocked":true}"#)
  await mustFail { try await ProfileSafetyAPI.block(target, blocked: true) }
  response(#"{"ok":true}"#)
  await mustFail { try await ProfileSafetyAPI.block(target, blocked: true) }
  response("{\\"ok\\":true,\\"report_id\\":\\"\\(receipt)\\"}")
  let received = try await ProfileSafetyAPI.report(target, reason: .harassment, details: "  Public context  ")
  precondition(received == receipt)
  precondition(ProfileIdentityAPI.payload["p_details"] as? String == "Public context")
  precondition(ProfileIdentityAPI.payload["p_reason"] as? String == "harassment")
  precondition(ProfileIdentityAPI.payload.count == 3)
  for malformed in [#"{"ok":true,"report_id":""}"#, #"{"ok":true,"report_id":"not-a-uuid"}"#, #"{"ok":false,"report_id":"20000000-0000-4000-8000-000000000002"}"#] {
   response(malformed)
   await mustFail { _ = try await ProfileSafetyAPI.report(target, reason: .spam, details: "") }
  }
  response(#"{"blocked":true,"is_owner":false,"my_profile_hidden":false}"#)
  let state = try await ProfileSafetyAPI.state(target)
  precondition(state.blocked && !state.is_owner && !state.my_profile_hidden)
  response(#"{"blocked":false,"is_owner":true}"#)
  await mustFail { _ = try await ProfileSafetyAPI.state(target) }
  response("[]")
  let empty = try await ProfileSafetyAPI.blockedPlayers()
  precondition(empty.isEmpty)
  ProfileIdentityAPI.offline = true
  await mustFail { _ = try await ProfileSafetyAPI.blockedPlayers() }
  await mustFail { try await ProfileSafetyAPI.block(target, blocked: false) }
  precondition(Set(ProfileSafetyAPI.Reason.allCases.map(\\.rawValue)) == Set(["harassment","hate","threats","sexual_content","spam","impersonation","other"]))
  print("NATIVE_PROFILE_SAFETY_OK")
 }
}
`);
      const binary = join(directory, 'safety-tests');
      execFileSync('swiftc', ['-parse-as-library', file, '-o', binary], { encoding: 'utf8', timeout: 30000 });
      expect(execFileSync(binary, [], { encoding: 'utf8', timeout: 5000 })).toContain('NATIVE_PROFILE_SAFETY_OK');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 40000);
});
