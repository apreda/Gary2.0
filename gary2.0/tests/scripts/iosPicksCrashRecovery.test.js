import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const source = readFileSync(new URL('../../../ios/GaryApp/PicksTab.swift', import.meta.url), 'utf8');
const hasSwift = spawnSync('swift', ['--version'], { encoding: 'utf8' }).status === 0;

// Run the shipping merge, order and selection logic; stub only UI/model types.
describe('Picks launch and refresh recovery', () => {
  it.skipIf(!hasSwift)('merges mixed feed identities without trapping and keeps sports scoped', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-picks-crash-'));
    try {
      const mergeStart = source.indexOf('        var out:', source.indexOf('private func computeGamesUnsorted()'));
      const merge = source.slice(mergeStart, source.indexOf('        for g in store.groupByMatchup(dayProps)', mergeStart));
      const orderStart = source.indexOf('        let oldOrder =', source.indexOf('private func rebuildMemo()'));
      const order = source.slice(orderStart, source.indexOf('        let ordered =', orderStart));
      const selectionStart = source.indexOf('    private func snapSportToAvailableLeague()');
      const selection = source.slice(selectionStart, source.indexOf('    /// A prop\'s tab key', selectionStart))
        .replace('private func', 'mutating func');
      const script = `import Foundation
struct PropPick {}
struct Row { var matchup = "Cubs @ Marlins"; var date: Date?; var id: Int?; var league = "MLB" }
struct Harness {
  static func gameIdentityKey(_ matchup: String, _ date: Date?) -> String {
    matchup + "|" + (date.map { String(Int($0.timeIntervalSince1970 / 1800)) } ?? "unknown")
  }
  static func mergeRows(_ rows: [Row]) -> [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])] {
${merge}
    for row in rows { upsertGame(matchup: row.matchup, time: row.date == nil ? "" : "7 PM", commence: row.date, providerKey: providerIdentity(league: row.league, gameId: row.id), props: []) }
    return out
  }
  static func positions(_ gamesMemo: [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])]) -> [String: Int] {
${order}
    return oldOrder
  }
}
let firstPitch = Date(timeIntervalSince1970: 1788638400)
let secondPitch = firstPitch.addingTimeInterval(14400)
let known = Row(date: firstPitch, id: 5059884)
let legacy = Row(date: firstPitch, id: nil)
// Real September 5 feed: the HR prop uses MLB HR, game and other props use MLB.
let longShot = Row(date: firstPitch, id: known.id, league: "MLB HR")
precondition(Harness.mergeRows([longShot, known, legacy]).count == 1)
precondition(Harness.mergeRows([known, longShot, legacy]).count == 1)
// Launch failure: a provider-stamped game precedes the matching id-less row.
for rows in [[known, legacy], [legacy, known], [known, known, legacy]] {
  let games = Harness.mergeRows(rows)
  precondition(games.count == 1)
  precondition(Harness.positions(games).values.first == 0)
}
let hydrated = Harness.mergeRows([Row(date: nil, id: known.id), known, legacy])
precondition(hydrated.count == 1 && hydrated[0].commence == firstPitch)
// Doubleheaders and conflicting known identities must remain distinct.
precondition(Harness.mergeRows([known, Row(date: secondPitch, id: 5059885)]).count == 2)
precondition(Harness.mergeRows([known, Row(date: firstPitch, id: 5059886)]).count == 2)
precondition(Harness.mergeRows([known, Row(date: firstPitch, id: 5059886), legacy]).count == 3)
// A duplicate memo from an earlier publication must also be safe on refresh.
precondition(Harness.positions(hydrated + hydrated).values.first == 0)
precondition(Harness.positions([]).isEmpty)
struct Store {
  var gamePickSourceFailures: Set<String> = []
  var propPickSourceFailed = false
  var slateSourceFailed = false
  var loading = false
}
struct Selection {
  var sport = "MLB"
  var sportAutoSelected = true
  var sports = ["NCAAF", "MLB", "NFL"]
  var store = Store()
${selection}
}
var selection = Selection()
selection.store.loading = true
selection.snapSportToAvailableLeague()
precondition(selection.sport == "MLB")
selection.store.loading = false
selection.store.slateSourceFailed = true
selection.snapSportToAvailableLeague()
precondition(selection.sport == "MLB")
selection.store.slateSourceFailed = false
selection.snapSportToAvailableLeague()
precondition(selection.sport == "NCAAF")
selection.sport = "NFL"; selection.sportAutoSelected = false
selection.snapSportToAvailableLeague()
precondition(selection.sport == "NFL")
print("Picks recovery regressions passed")
`;
      const path = join(directory, 'recovery.swift');
      writeFileSync(path, script);
      expect(execFileSync('swift', [path], { encoding: 'utf8', timeout: 30_000 })).toContain('Picks recovery regressions passed');
      expect(source).toContain('@State private var sport = "MLB"');
      expect(source).not.toContain('picksAllTab');
      expect(source).not.toContain('sport == "ALL"');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 40_000);
});
