import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const read = file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
const models = read('Models.swift');
const shared = read('HubShared.swift');
const modules = read('HubModules.swift');
const hub = read('HubView.swift');
const hasSwift = spawnSync('swiftc', ['--version'], { encoding: 'utf8' }).status === 0;

function block(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing shipping declaration: ${marker}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed shipping declaration: ${marker}`);
}

const groupClosure = block(block(hub, '    @MainActor private func loadCurrent('), '                group.addTask {');

describe('optimized native Hub league routing', () => {
  it.skipIf(!hasSwift)('keeps every concurrent response attached to its requested league across suspension, emptiness and failure', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-hub-optimized-routing-'));
    try {
      // Use the shipping closure, enum/mapper and complete Connection graph.
      // A release-only failure previously collapsed every optional enum key to
      // MLB when the tuple contained an inline awaited fetch. Debug passed.
      const source = `import Foundation
${read('HubJudgment.swift')}
${block(models, 'struct ExactGameIdentity:')}
${block(read('FantasyBriefing.swift'), 'enum GaryMlbMetricPolicy {')}
${models.slice(models.indexOf('struct Connection:'), models.indexOf('// MARK: - Live Scores'))}
${block(shared, 'enum HubLeagueSel {')}
${block(modules, 'extension HubLeagueSel {')}
enum FixtureError: Error { case unavailable }
@MainActor enum SupabaseAPI {
 static var iteration = 0
 static var mode = "healthy"
 static let counts = ["MLB": 2, "NFL": 8, "NCAAF": 3, "NBA": 0]
 static func fetchInsightConnections(date: String, league: String) async throws -> [Connection] {
  let order = ["MLB", "NFL", "NCAAF", "NBA"].firstIndex(of: league)!
  // A real suspension and rotating completion order exercise the optimized
  // async return path; an immediate mock can hide the defect.
  try await Task.sleep(nanoseconds: UInt64((order + iteration) % 4 + 1) * 100_000)
  if mode == "failed" && league == "NFL" { throw FixtureError.unavailable }
  if mode == "cancelled" && league == "NCAAF" { throw CancellationError() }
  let rows: [[String: Any]] = (0..<(counts[league] ?? 0)).map { index in
   ["date": mode == "wrong-date" && league == "NFL" ? "2026-09-06" : date,
    "league": mode == "wrong-league" && league == "NFL" ? "MLB" : league,
    "category": "next_slate", "headline": "\\(league) fixture \\(index)",
    "game_id": "\\(league)-\\(index)", "meta": ["kind": "next_slate"]]
  }
  return try JSONDecoder().decode([Connection].self, from: JSONSerialization.data(withJSONObject: rows))
 }
 nonisolated static func isCancellation(_ error: Error) -> Bool { error is CancellationError }
}
@main struct Fixture {
 @MainActor static func main() async {
  let date = "2026-09-07"
  for mode in ["healthy", "failed", "cancelled", "wrong-date", "wrong-league"] {
   SupabaseAPI.mode = mode
   for iteration in 0..<40 {
    SupabaseAPI.iteration = iteration
    var responses: [HubLeagueSel: (rows: [Connection], failed: Bool, cancelled: Bool)] = [:]
    await withTaskGroup(of: (HubLeagueSel?, [Connection], Bool, Bool).self) { group in
     for lg in ["MLB", "NFL", "NCAAF", "NBA"] {
${groupClosure}
     }
     for await result in group {
      guard let league = result.0 else { fatalError("Known league lost its response key") }
      precondition(responses[league] == nil, "Two requested leagues collapsed to the same response key")
      responses[league] = (result.1, result.2, result.3)
     }
    }
    precondition(responses.count == 4, "Every requested league must produce its own outcome")
    for league in [HubLeagueSel.mlb, .nfl, .ncaaf, .nba] {
     let outcome = responses[league]!
     let shouldCancel = mode == "cancelled" && league == .ncaaf
     let shouldFail = shouldCancel || (league == .nfl && ["failed", "wrong-date", "wrong-league"].contains(mode))
     precondition(outcome.failed == shouldFail && outcome.cancelled == shouldCancel)
     precondition(outcome.rows.count == (shouldFail ? 0 : SupabaseAPI.counts[league.label]!))
     for row in outcome.rows {
      precondition(row.date == date && row.league == league.label,
                   "A response must retain its requested date and league")
     }
    }
   }
  }
  print("Optimized Hub routing passed: 200 groups / 800 scoped outcomes")
 }
}
`;
      const file = join(directory, 'Fixture.swift');
      const binary = join(directory, 'fixture');
      writeFileSync(file, source);
      execFileSync('swiftc', ['-O', '-swift-version', '5', '-parse-as-library', file, '-o', binary], {
        encoding: 'utf8', timeout: 30_000,
      });
      expect(execFileSync(binary, [], { encoding: 'utf8', timeout: 10_000 }))
        .toContain('Optimized Hub routing passed: 200 groups / 800 scoped outcomes');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 45_000);
});
