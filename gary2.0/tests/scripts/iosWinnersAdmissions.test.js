import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const api = readFileSync(new URL('../../../ios/GaryApp/SupabaseAPI.swift', import.meta.url), 'utf8');
const view = readFileSync(new URL('../../../ios/GaryApp/WinnersView.swift', import.meta.url), 'utf8');
const home = readFileSync(new URL('../../../ios/GaryApp/HomeView.swift', import.meta.url), 'utf8');
const access = readFileSync(new URL('../../../ios/GaryApp/WinnersAccess.swift', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../../../ios/GaryApp/ProfileExperience.swift', import.meta.url), 'utf8');

function body(source, start) {
  const first = source.indexOf(start);
  if (first < 0) throw new Error(`Missing Swift declaration: ${start}`);
  const open = source.indexOf('{', first);
  let depth = 1, end = open + 1;
  while (depth && end < source.length) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
    end++;
  }
  return source.slice(first, end);
}

describe('iOS immutable Winners admission contract', () => {
  it('uses admitted snapshots only after cutover, and a failed or empty source never curates another board', () => {
    const loader = body(view, 'private func loadAdmittedBoard');
    for (const oldSource of ['fetchDailyPicks', 'fetchWeeklyNFLPicks', 'fetchPropPicks', 'curateWinnersSlots', 'selectPremiumProps', 'yesterday']) {
      expect(loader).not.toContain(oldSource);
    }
    expect(loader).toContain('admittedBoardCache[date]');
    expect(loader).toContain('SupabaseAPI.isTransientExternalFailure(error)');
    expect(loader).toContain('boardLoadToken == token');
    expect(loader).toContain('(selectedDate ?? SupabaseAPI.todayEST()) == date');
    expect(loader).toContain('if !admissionFailed, let serverAccess = board.access');
    expect(loader).not.toContain('retainWinnersPublications');
    expect(body(view, 'private func loadHistorical')).toContain('if date >= SupabaseAPI.winnersAdmissionCutover');
    expect(body(view, 'private func shelfPadCount')).toContain('< SupabaseAPI.winnersAdmissionCutover');
    expect(view).not.toContain('PICKS DROP ~90 MIN');
    expect(view).toContain('ALL PICKS\\nLAST 10');
    expect(view).toContain('ALL PICKS · LAST 10');
    expect(home).toContain('let featuresUnderdog = calls.contains(where: Self.isPostedMoneylineUnderdog)');
    expect(home).toContain('railWorthy: featuresUnderdog');
    expect(home).toContain('context: featuresUnderdog ? "GARY\'S UNDERDOG PICK" : nil');
  });

  it.skipIf(process.platform !== 'darwin')('executes the real Swift decoder/cache merge against malformed, numeric and immutable ticket fixtures', () => {
    // Only the model seams are minimal stubs; the decoder, normalizer,
    // validation and cache merge below are extracted from production Swift.
    const declarations = [
      body(api, 'struct WinnersBoardSummary'),
      body(api, 'struct WinnersBoardSnapshot'),
      body(api, 'static func decodeWinnersBoard'),
      body(api, 'static func retainWinnersPublications'),
      body(api, 'private static func normalizeStoredGamePickPayload'),
      body(api, 'private static func validateStoredGamePicks'),
    ].join('\n');
    const accessAssignment = body(view, 'private func loadAdmittedBoard').match(/if !admissionFailed, let serverAccess = board\.access \{ access\.snapshot = serverAccess \}/)?.[0];
    expect(accessAssignment).toBeTruthy();
    const script = `import Foundation
import CoreFoundation
${body(access, 'struct WinnersSubscription')}
${body(access, 'struct WinnersAccessSnapshot')}
enum AppFlags { static func hidesWorldCupRow(_ league: String?) -> Bool { false } }
struct GaryPick: Decodable {
  var game_id: Int?; var pick: String?; var league: String?; var homeTeam: String?; var awayTeam: String?
  var spread: Double?; var moneylineHome: Double?; var moneylineAway: Double?
  var hasValidStoredPayload: Bool { game_id != nil && pick != nil && league != nil && homeTeam != nil && awayTeam != nil }
}
struct PropPick {
  var player: String?; var league: String?; var prop: String?; var bet: String?; var odds: String?; var line: String?
  var effectiveLeague: String? { league }
  var hasValidStoredPayload: Bool { player != nil && league != nil && prop != nil && bet != nil && odds != nil }
  static func from(dict: [String: Any]) -> PropPick? {
    PropPick(player: dict["player"] as? String, league: dict["league"] as? String, prop: dict["prop"] as? String,
      bet: dict["bet"] as? String, odds: (dict["odds"] as? String) ?? (dict["odds"] as? NSNumber)?.stringValue, line: dict["line"] as? String)
  }
}
enum SupabaseAPI { ${declarations} }
enum ProfileIdentityAPI {
  ${body(profile, 'struct BoardRow:')}
  ${body(profile, 'struct Board:')}
}
enum HomeView {
  ${body(home, 'private static func isPostedMoneylineUnderdog')}
  static func features(_ pick: GaryPick) -> Bool { isPostedMoneylineUnderdog(pick) }
}
let date = "2026-09-04"
let ticket: [String: Any] = ["game_id": "77", "pick": "Home ML +125", "league": "MLB", "homeTeam": "Home", "awayTeam": "Away", "moneylineHome": "125"]
func row(_ id: Any, _ kind: String, _ ticket: [String: Any], day: String = date) -> [String: Any] {
  ["candidate_id": id, "kind": kind, "league": "MLB", "game_date": day, "pick_snapshot": ticket]
}
func decode(_ rows: [[String: Any]]) throws -> SupabaseAPI.WinnersBoardSnapshot {
  try SupabaseAPI.decodeWinnersBoard(JSONSerialization.data(withJSONObject: rows), date: date)
}
let original = try decode([row("A", "game", ticket)])
precondition(original.games[0].game_id == 77 && original.games[0].moneylineHome == 125)
let numeric = try decode([row(42, "game", ticket)])
precondition(numeric.gamePublicationIDs == ["42"])
precondition(HomeView.features(original.games[0]))
for label in ["Home ML -140", "Home +1.5 +125", "Home -1.5 +105", "Over 8.5 +110"] {
  var alternate = ticket; alternate["pick"] = label
  let candidate = try decode([row("classification", "game", alternate)])
  precondition(!HomeView.features(candidate.games[0]))
}
var changed = ticket; changed["pick"] = "Home ML -140"
let refreshed = try decode([row("A", "game", changed), row("B", "game", ticket)])
let merged = SupabaseAPI.retainWinnersPublications(previous: original, incoming: refreshed)
precondition(merged.games.count == 2 && merged.games[0].pick == "Home ML +125")
let empty = try decode([])
precondition(SupabaseAPI.retainWinnersPublications(previous: merged, incoming: empty).games.count == 2)
precondition(empty.games.isEmpty)
let prop = try decode([row("P", "prop", ["player": "Player", "prop": "hits", "bet": "over", "odds": -110, "line": 1])])
precondition(prop.props[0].line == "1" && prop.props[0].odds == "-110")
for invalid in [[row("bad", "game", [:])], [row("wrong-date", "game", ticket, day: "2026-09-03")], [row("A", "game", ticket), row("A", "game", ticket)], [row(true, "game", ticket)], [row(1.5, "game", ticket)], [row(NSNull(), "game", ticket)]] {
  do { _ = try decode(invalid); fatalError("Malformed publication accepted") } catch {}
}
let lockedPayload: [String: Any] = ["league": "MLB", "kind": "game", "count": 2, "locked": true]
let locked = try JSONDecoder().decode(SupabaseAPI.WinnersBoardSummary.self, from: JSONSerialization.data(withJSONObject: lockedPayload))
precondition(locked.locked && locked.count == 2 && empty.games.isEmpty)
let freePayload: [String: Any] = ["preview": false, "founding": false, "sports": [], "subscriptions": [], "can_manage": false]
let free = try JSONDecoder().decode(WinnersAccessSnapshot.self, from: JSONSerialization.data(withJSONObject: freePayload))
precondition(!free.unlocks("MLB") && !free.isFreeAccess)
var paidPayload = freePayload; paidPayload["sports"] = ["MLB"]
let paid = try JSONDecoder().decode(WinnersAccessSnapshot.self, from: JSONSerialization.data(withJSONObject: paidPayload))
precondition(paid.unlocks("MLB") && !paid.unlocks("NFL"))
struct AccessState { var snapshot: WinnersAccessSnapshot }
func applyBoardAccess(_ board: SupabaseAPI.WinnersBoardSnapshot, to access: inout AccessState, admissionFailed: Bool) {
  ${accessAssignment}
}
var cachedBoard = original; cachedBoard.access = paid
var currentAccess = AccessState(snapshot: free)
applyBoardAccess(cachedBoard, to: &currentAccess, admissionFailed: true)
precondition(!currentAccess.snapshot.unlocks("MLB"), "Cached response restored a revoked grant")
applyBoardAccess(cachedBoard, to: &currentAccess, admissionFailed: false)
precondition(currentAccess.snapshot.unlocks("MLB"), "Fresh authorized board lost access")
let boardRow: [String: Any] = ["rank": 1, "user_id": "00000000-0000-0000-0000-000000000001", "display_name": "fixture", "handle": "fixture", "avatar": NSNull(), "wins": 4, "losses": 1, "pushes": 1, "units": 2.64, "win_pct": 80.0, "streak_len": 3, "streak_kind": "W", "best_streak": 3, "decided": 5]
var boardPayload: [String: Any] = ["rows": [boardRow], "me": boardRow, "qualified_count": 1, "min_decided": 5, "my_decided": 5, "window": "30d", "sort": "streak", "league": "all", "has_more": false, "window_start": "2026-08-06", "window_end": "2026-09-04"]
let standings = try JSONDecoder().decode(ProfileIdentityAPI.Board.self, from: JSONSerialization.data(withJSONObject: boardPayload))
precondition(standings.rows[0].rank == 1 && standings.me?.streakLabel == "W3" && standings.rows[0].units == 2.64)
boardPayload["rows"] = []; boardPayload["me"] = NSNull(); boardPayload["qualified_count"] = 0
let noStandings = try JSONDecoder().decode(ProfileIdentityAPI.Board.self, from: JSONSerialization.data(withJSONObject: boardPayload))
precondition(noStandings.rows.isEmpty && noStandings.me == nil)
print("WINNERS_SWIFT_CONTRACT_OK")
`;
    const folder = mkdtempSync(join(tmpdir(), 'gary-winners-swift-'));
    try {
      const file = join(folder, 'main.swift');
      writeFileSync(file, script);
      const result = execFileSync('xcrun', ['swift', file], { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] });
      expect(result).toContain('WINNERS_SWIFT_CONTRACT_OK');
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }, 65_000);
});
