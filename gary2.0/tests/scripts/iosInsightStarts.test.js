import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const models = readFileSync(new URL('../../../ios/GaryApp/Models.swift', import.meta.url), 'utf8');
const hasSwift = spawnSync('swiftc', ['--version'], { encoding: 'utf8' }).status === 0;

function block(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing shipping declaration: ${marker}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed shipping declaration: ${marker}`);
}

describe('native insight start metadata', () => {
  it.skipIf(!hasSwift)('retains scalar record samples and schedule turns through the actual optimized Connection graph', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-insight-starts-'));
    try {
      const source = `import Foundation
${readFileSync(new URL('../../../ios/GaryApp/HubJudgment.swift', import.meta.url), 'utf8')}
${block(models, 'struct ExactGameIdentity:')}
${block(readFileSync(new URL('../../../ios/GaryApp/FantasyBriefing.swift', import.meta.url), 'utf8'), 'enum GaryMlbMetricPolicy {')}
${models.slice(models.indexOf('struct Connection:'), models.indexOf('// MARK: - Live Scores'))}
func decode(_ starts: Any?, kind: String = "starter_team_record") throws -> Connection {
 var meta: [String: Any] = ["kind": kind]
 if let starts { meta["starts"] = starts }
 let row: [String: Any] = ["date": "2026-09-07", "league": "MLB", "category": kind,
  "headline": "A verified fixture", "meta": meta]
 return try JSONDecoder().decode(Connection.self, from: JSONSerialization.data(withJSONObject: row))
}
func encodedStarts(_ row: Connection) throws -> Any? {
 let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(row)) as! [String: Any]
 return (object["meta"] as! [String: Any])["starts"]
}
for count in [0, 1, 5, 162] {
 let row = try decode(count)
 guard case .count(let decoded) = row.meta?.starts else { fatalError("Sample lost") }
 precondition(decoded == count && row.meta?.starts?.schedule == nil)
 let encoded = try encodedStarts(row)
 precondition(encoded as? Int == count)
 let cached = try JSONDecoder().decode(Connection.self, from: JSONEncoder().encode(row))
 guard case .count(let restored) = cached.meta?.starts else { fatalError("Cached sample lost") }
 precondition(restored == count)
}
let schedule: [[String: Any]] = [
 ["date": "2026-09-08", "opp": "CLE", "home": false],
 ["date": "2026-09-13", "opp": "SEA", "home": true]
]
for turns in [schedule, [], [["opp": "NYY"]]] {
 let row = try decode(turns, kind: "two_start")
 precondition(row.meta?.starts?.schedule?.count == turns.count)
 let encoded = try encodedStarts(row) as! [[String: Any]]
 precondition(NSArray(array: encoded).isEqual(to: turns))
 let cached = try JSONDecoder().decode(Connection.self, from: JSONEncoder().encode(row))
 precondition(cached.meta?.starts?.schedule?.count == turns.count)
 if turns.count == 2 {
  precondition(cached.meta?.starts?.schedule?[0].home == false)
  precondition(cached.meta?.starts?.schedule?[1].opp == "SEA")
 }
}
for empty: Any? in [nil, NSNull()] {
 let row = try decode(empty)
 precondition(row.meta?.starts == nil)
 let encoded = try encodedStarts(row)
 precondition(encoded == nil)
}
for malformed: Any in [-1, 1.5, true, "5", ["count": 5], [5], [["home": "yes"]]] {
 do { _ = try decode(malformed); fatalError("Invalid metadata accepted: \\(malformed)") }
 catch is DecodingError { }
}
print("Insight starts passed: scalar, schedule, optional, invalid and cache roundtrip")
`;
      const file = join(directory, 'Fixture.swift');
      const binary = join(directory, 'fixture');
      writeFileSync(file, source);
      execFileSync('swiftc', ['-O', '-swift-version', '5', file, '-o', binary], { encoding: 'utf8', timeout: 30_000 });
      expect(execFileSync(binary, [], { encoding: 'utf8', timeout: 10_000 })).toContain('Insight starts passed:');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 45_000);
});
