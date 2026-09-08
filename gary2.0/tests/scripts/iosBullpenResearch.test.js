import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const native = file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
const hasSwift = spawnSync('swiftc', ['--version'], { encoding: 'utf8' }).status === 0;
function block(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing native declaration: ${marker}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed native declaration: ${marker}`);
}

describe('native observed bullpen ledger', () => {
  it.skipIf(!hasSwift)('executes typed decoding, exact provenance and missing-versus-zero cases in optimized Swift', () => {
    const models = native('Models.swift');
    const declarations = models.slice(models.indexOf('enum InsightMetaValue:'), models.indexOf('// MARK: - Live Scores'));
    const fixture = `import Foundation
import CoreFoundation
${block(models, 'struct ExactGameIdentity:')}
${native('HubJudgment.swift')}
${declarations}
${block(native('FantasyBriefing.swift'), 'enum GaryMlbMetricPolicy {')}
${block(models, 'struct Connection:')}

let fullArm: [String: Any] = ["id": 123, "name": "Fixture Reliever", "ip": "2.1", "g": 2, "pitches": 37,
 "er": 0, "k": 3, "bb": 1, "last_used": "2026-09-06", "season_era": 3.45, "season_ip": "52.1", "season_as_of": "2026-09-06"]
let base: [String: Any] = ["kind": "bullpen_fatigue", "research_version": "bullpen-facts-v1", "games": 3,
 "source": "MLB StatsAPI final boxscores", "team_identity": ["id": 30, "name": "Fixture Team"],
 "window_dates": ["2026-09-04", "2026-09-05", "2026-09-06"], "source_as_of": "2026-09-06",
 "no_game_dates": ["2026-09-07"], "arms": [fullArm]]
func decode(_ row: [String: Any]) throws -> SwapMeta {
 try JSONDecoder().decode(SwapMeta.self, from: JSONSerialization.data(withJSONObject: row))
}
func ledger(_ row: [String: Any], league: String = "MLB", date: String? = "2026-09-08", team: String? = "30") -> BullpenResearchLedger? {
 BullpenResearchLedger(meta: try! decode(row), league: league, slateDate: date, teamID: team)
}
let valid = ledger(base)!
precondition(valid.arms.count == 1 && valid.asOf == "2026-09-06")
precondition(valid.arms[0].inningsLabel == "2.1" && valid.arms[0].pitchesLabel == "37")
precondition(valid.arms[0].seasonERALabel == "3.45" && valid.arms[0].seasonIPLabel == "52.1")
precondition(ledger(base, league: "NFL") == nil)
precondition(ledger(base, team: "31") == nil)
precondition(ledger(base, team: nil) == nil)
precondition(ledger(base, date: nil) == nil)
precondition(ledger(base, date: "2026-02-30") == nil)
precondition(ledger(base, date: "2026-09-06") == nil)
for key in ["research_version", "window_dates", "source_as_of", "arms", "team_identity", "source"] {
 var row = base; row.removeValue(forKey: key)
 precondition(ledger(row) == nil, "Missing provenance must not earn a ledger")
}
for replacement: [String: Any] in [
 ["research_version": "bullpen-facts-v2"], ["kind": "other"], ["games": 2],
 ["source_as_of": "2026-09-07"], ["window_dates": ["2026-09-06", "2026-09-05"]],
 ["window_dates": ["2026-09-05", "2026-09-05", "2026-09-06"]], ["arms": [fullArm, fullArm]]
] {
 var row = base; row.merge(replacement) { _, new in new }
 precondition(ledger(row) == nil)
}
var doubleheader = base; doubleheader["window_dates"] = ["2026-09-05", "2026-09-06"]
precondition(ledger(doubleheader) != nil, "Three games may span two dates")
var missing = fullArm
for key in ["ip", "pitches", "season_era", "season_ip", "season_as_of"] { missing.removeValue(forKey: key) }
var sparse = base; sparse["arms"] = [missing]
let unknown = ledger(sparse)!.arms[0]
precondition(unknown.inningsLabel == "—" && unknown.pitchesLabel == "—")
precondition(unknown.seasonERALabel == "—" && unknown.seasonIPLabel == "—")
var zeros = fullArm; zeros["ip"] = "0.0"; zeros["pitches"] = 0; zeros["season_era"] = 0
var zeroRow = base; zeroRow["arms"] = [zeros]
let zero = ledger(zeroRow)!.arms[0]
precondition(zero.inningsLabel == "0.0" && zero.pitchesLabel == "0" && zero.seasonERALabel == "0.00")
var invalidValues = fullArm; invalidValues["ip"] = "2.3"; invalidValues["pitches"] = -1; invalidValues["season_ip"] = "0.0"
var invalidRow = base; invalidRow["arms"] = [invalidValues]
let invalid = ledger(invalidRow)!.arms[0]
precondition(invalid.inningsLabel == "—" && invalid.pitchesLabel == "—" && invalid.seasonERALabel == "—")
for change in [["last_used": "2026-09-07"], ["season_as_of": "2026-09-09"], ["season_as_of": "2025-09-06"]] {
 var arm = fullArm; arm.merge(change) { _, new in new }
 var row = base; row["arms"] = [arm]
 precondition(ledger(row) == nil)
}
let old = try decode(["kind": "bullpen_fatigue", "evidence": "Original observation"])
precondition(old.arms == nil && old.research_version == nil && old.evidence == "Original observation")
var numeric = fullArm; numeric["ip"] = 2.1; numeric["season_ip"] = 52.1
var numericRow = base; numericRow["arms"] = [numeric]
precondition(ledger(numericRow)!.arms[0].inningsLabel == "2.1")
precondition(ledger(numericRow)!.arms[0].seasonIPLabel == "52.1")
for key in ["research_version", "window_dates", "source_as_of", "arms", "team_identity", "no_game_dates"] {
 var malformed = base; malformed[key] = ["unexpected": true]
 let feed: [[String: Any]] = [["headline": "Retained observation", "meta": malformed], ["headline": "Second observation"]]
 let decoded = try JSONDecoder().decode([Connection].self, from: JSONSerialization.data(withJSONObject: feed))
 precondition(decoded.count == 2 && decoded[0].headline == "Retained observation")
 if key != "no_game_dates" { precondition(ledger(malformed) == nil) }
}
var malformedArm = base; malformedArm["arms"] = [["id": "unexpected", "name": true]]
precondition(ledger(malformedArm) == nil)
print("Native bullpen ledger passed")
`;
    const directory = mkdtempSync(join(tmpdir(), 'gary-bullpen-ledger-'));
    try {
      const path = join(directory, 'Fixture.swift'), binary = join(directory, 'fixture');
      writeFileSync(path, fixture);
      execFileSync('swiftc', ['-O', '-swift-version', '5', path, '-o', binary], { encoding: 'utf8', timeout: 60_000 });
      expect(execFileSync(binary, [], { encoding: 'utf8', timeout: 10_000 })).toContain('Native bullpen ledger passed');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 80_000);
});
