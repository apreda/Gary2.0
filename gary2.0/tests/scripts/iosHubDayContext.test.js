import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
const root = new URL('../../../ios/GaryApp/', import.meta.url).pathname;
const source = (file) => readFileSync(root + file, 'utf8');
const hasSwift = spawnSync('swiftc', ['--version'], { encoding: 'utf8' }).status === 0;
describe('Hub slate-day context', () => {
it.skipIf(!hasSwift)('preserves tomorrow and off-slate context in optimized Swift', () => {
const models = source('Models.swift'), hub = source('HubView.swift'), card = source('MLBGameIntelView.swift');
const related = hub.slice(hub.indexOf('    private func relatedTeamSignals('), hub.indexOf('    /// Only a unique team')).replace('private func', 'func');
const context = card.slice(card.indexOf('    private var contextLine:'), card.indexOf('    private var header:', card.indexOf('    private var contextLine:'))).replace('private var', 'var');
const dir = mkdtempSync(join(tmpdir(), 'gary-hub-day-'));
const script = `${source('NCAAFTeams.swift')}\n${source('HubCardIdentity.swift')}
${models.slice(models.indexOf('struct PlayerInsightPack:'), models.indexOf('// MARK: - Daily Slate'))}
enum League { case mlb; var label: String { "MLB" } }
struct Regression { var day: String? }
struct Signal { var id: Int; var teamId: String?; var headline: String; var reg: Regression? = nil; var league: League = .mlb }
struct HubFixture {
 var leagueSignals: [Signal]
 static func teamCardName(for s: Signal) -> String { s.headline }
${related}
}
let today = Signal(id: 1, teamId: "8", headline: "Cleveland Guardians")
let otherToday = Signal(id: 2, teamId: "8", headline: "Cleveland Guardians")
let tomorrow = Signal(id: 30495, teamId: "8", headline: "Cleveland Guardians", reg: Regression(day: "tomorrow"))
let team = HubFixture(leagueSignals: [today, otherToday, tomorrow])
precondition(team.relatedTeamSignals(for: today).map(\\.id) == [2])
let seed = Signal(id: 0, teamId: nil, headline: "Cleveland Guardians")
precondition(team.relatedTeamSignals(for: seed).map(\\.id) == [1, 2])
struct CardFixture { var pack: PlayerInsightPack?; var game: String
${context}
}
let decoder = JSONDecoder()
let offSlate = try decoder.decode(PlayerInsightPack.self, from: Data(#"{"name":"Foster Griffin","context":"NOT ON TONIGHT'S SLATE"}"#.utf8))
precondition(CardFixture(pack: offSlate, game: "CLE @ BAL").contextLine == "NOT ON TONIGHT'S SLATE")
let scheduled = try decoder.decode(PlayerInsightPack.self, from: Data(#"{"name":"Tanner Bibee","game":"CLE @ BAL"}"#.utf8))
precondition(CardFixture(pack: scheduled, game: "CLE @ BAL").contextLine == "CLE @ BAL")
let blank = try decoder.decode(PlayerInsightPack.self, from: Data(#"{"context":"  "}"#.utf8))
precondition(CardFixture(pack: blank, game: "CLE @ BAL").contextLine == "CLE @ BAL")
precondition(CardFixture(pack: nil, game: "").contextLine == "")
print("Hub day context passed")
`;
try {
  writeFileSync(dir + '/Fixture.swift', script);
  execFileSync('swiftc', ['-O', '-swift-version', '5', dir + '/Fixture.swift', '-o', dir + '/fixture'], { timeout: 50000, stdio: 'inherit' });
  assert.match(execFileSync(dir + '/fixture', { encoding: 'utf8' }), /Hub day context passed/);
  assert.ok(card.includes('Text(contextLine.uppercased())'));
  console.log('Hub day context passed: optimized production filter and model with live row identities; prior packs, missing packs and context precedence.');
} finally { rmSync(dir, { recursive: true, force: true }); }

}, 60000);
});
