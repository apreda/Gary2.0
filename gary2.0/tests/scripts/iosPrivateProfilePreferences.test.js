import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const source = readFileSync(new URL('../../../ios/GaryApp/ProfileExperience.swift', import.meta.url), 'utf8');
const hasSwift = spawnSync('swiftc', ['--version']).status === 0;
function declaration(marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing production declaration: ${marker}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed production declaration: ${marker}`);
}

describe('native private profile preferences', () => {
  it.skipIf(!hasSwift)('executes actual save eligibility and API payload without claiming a public identity', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-private-preferences-'));
    try {
      const file = join(directory, 'PrivatePreferences.swift');
      writeFileSync(file, `import Foundation
${declaration('enum ProfileEditRules')}
enum ProfileIdentityAPI {
 ${declaration('struct Identity: Decodable')}
 ${declaration('struct Preferences: Decodable')}
 ${declaration('struct Snapshot: Decodable')}
 @MainActor static var response = Data()
 @MainActor static var payload: [String: Any] = [:]
 @MainActor static var calls = 0
 @MainActor static func request<T: Decodable>(_ name: String, body: [String: Any]) async throws -> T {
  precondition(name == "save_my_profile")
  payload = body; calls += 1
  return try JSONDecoder().decode(T.self, from: response)
 }
 ${declaration('@MainActor static func save(handle:')}
}
@main struct PrivatePreferences {
 static func issue(_ name: String, visible: Bool = false, existing: Bool = false, avatar: String = "initials", bio: String = "") -> String? {
  ProfileEditRules.handleIssue(name, visible: visible, hasProfile: existing, avatar: avatar, bio: bio)
 }
 @MainActor static func main() async throws {
  // Both nil and persisted zero mean unset, while invalid persisted values
  // stay visible and invalid instead of silently becoming the default.
  for value in [nil, 0, -0.0] as [Double?] {
   let text = ProfileEditRules.unitEditorText(value)
   precondition(text.isEmpty && ProfileEditRules.unitInputValid(text))
  }
  for value in [0.01, 25, 25.125, 100_000] as [Double] {
   let text = ProfileEditRules.unitEditorText(value)
   precondition(Double(text) == value && ProfileEditRules.unitInputValid(text))
  }
  for value in [-1, Double.nan, Double.infinity, -Double.infinity, 100_000.01, 100_001] {
   let text = ProfileEditRules.unitEditorText(value)
   precondition(!text.isEmpty && !ProfileEditRules.unitInputValid(text))
  }
  for text in ["0", "-1", "NaN", "inf", "100001", "invalid"] {
   precondition(!ProfileEditRules.unitInputValid(text))
  }
  // A new private account can save private settings without a manufactured name.
  precondition(issue("") == nil && issue("  ") == nil)
  precondition(issue("", bio: " \\n ") == nil)
  precondition(issue("", visible: true)?.contains("leaderboard") == true)
  precondition(issue("", avatar: "flame.fill")?.contains("avatar or bio") == true)
  precondition(issue("", bio: "Cubs fan")?.contains("avatar or bio") == true)
  // Nonempty names retain strict validation even while the profile is private.
  for name in ["ab", "two words", "bad!", String(repeating: "a", count: 19)] {
   precondition(issue(name) != nil && issue(name, existing: true) != nil)
  }
  for name in ["abc", "Cubs_2026", String(repeating: "a", count: 18)] {
   precondition(issue(name, visible: true, avatar: "flame.fill", bio: "Cubs fan") == nil)
  }
  // Omitting a replacement name preserves an existing identity and its editable fields.
  precondition(issue("", existing: true, avatar: "football.fill", bio: "Updated bio") == nil)
  precondition(issue("", visible: true, existing: true) == nil)
  ProfileIdentityAPI.response = Data(#"{"ok":true,"profile":null,"preferences":{"favorite_sports":["MLB"],"unit_value":25}}"#.utf8)
  let privatePrefs = try await ProfileIdentityAPI.save(handle: "", avatar: "initials", bio: "", visible: false, sports: ["MLB"], unitValue: 25)
  precondition(privatePrefs.profile == nil && privatePrefs.preferences?.unit_value == 25)
  precondition(ProfileIdentityAPI.payload["p_handle"] == nil)
  precondition(ProfileIdentityAPI.payload["p_leaderboard_visible"] as? Bool == false)
  precondition(ProfileIdentityAPI.payload["p_favorite_sports"] as? [String] == ["MLB"])
  precondition(ProfileIdentityAPI.payload["p_unit_value"] as? Double == 25)
  precondition(ProfileIdentityAPI.payload.count == 5)
  ProfileIdentityAPI.response = Data(#"{"ok":true,"profile":{"handle":"ExistingFan","avatar":"football.fill","bio":"Updated bio","leaderboard_visible":false},"preferences":{"favorite_sports":["NFL"],"unit_value":null}}"#.utf8)
  let existing = try await ProfileIdentityAPI.save(handle: "", avatar: "football.fill", bio: "Updated bio", visible: false, sports: ["NFL"], unitValue: nil)
  precondition(existing.profile?.name == "ExistingFan" && existing.profile?.isPublic == false)
  precondition(existing.profile?.avatar == "football.fill" && existing.profile?.bio == "Updated bio")
  precondition(ProfileIdentityAPI.payload["p_handle"] == nil)
  precondition(ProfileIdentityAPI.payload["p_avatar"] as? String == "football.fill")
  precondition(ProfileIdentityAPI.payload["p_bio"] as? String == "Updated bio")
  precondition(ProfileIdentityAPI.payload["p_unit_value"] as? Double == 0)
  ProfileIdentityAPI.response = Data(#"{"ok":true,"profile":{"display_name":"ExistingFan","handle":null,"leaderboard_visible":true},"preferences":{"favorite_sports":["NFL"],"unit_value":25}}"#.utf8)
  let keptPublic = try await ProfileIdentityAPI.save(handle: "", avatar: "initials", bio: "", visible: true, sports: ["NFL"], unitValue: 25)
  precondition(keptPublic.profile?.name == "ExistingFan" && keptPublic.profile?.isPublic == true)
  precondition(ProfileIdentityAPI.payload["p_handle"] == nil)
  precondition(ProfileIdentityAPI.payload["p_leaderboard_visible"] as? Bool == true)
  _ = try await ProfileIdentityAPI.save(handle: "NewFan", avatar: "initials", bio: "", visible: true, sports: [], unitValue: 50)
  precondition(ProfileIdentityAPI.payload["p_handle"] as? String == "NewFan")
  precondition(ProfileIdentityAPI.payload["p_leaderboard_visible"] as? Bool == true)
  precondition(ProfileIdentityAPI.calls == 4)
  print("PRIVATE_PROFILE_PREFERENCES_OK")
 }
}
`);
      const binary = join(directory, 'preferences');
      execFileSync('swiftc', ['-O', '-parse-as-library', file, '-o', binary], { encoding: 'utf8', timeout: 30000 });
      expect(execFileSync(binary, [], { encoding: 'utf8', timeout: 5000 })).toContain('PRIVATE_PROFILE_PREFERENCES_OK');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 40000);

  it('uses the same shipping eligibility for disabled UI and saving, preserving account and unit guards', () => {
    expect(source).toContain('unitText = ProfileEditRules.unitEditorText(snapshot?.preferences?.unit_value)');
    expect(source).toContain('private var unitValid: Bool { ProfileEditRules.unitInputValid(unitText) }');
    expect(source).toContain('disabled(saving || handleIssue != nil || !unitValid || auth.currentUser?.id != ownerID)');
    expect(declaration('private func save()')).toContain('guard !saving, handleIssue == nil, unitValid, ownerID == auth.currentUser?.id');
    expect(declaration('private func save()')).toContain('guard ownerID == auth.currentUser?.id else { return }');
  });
});
