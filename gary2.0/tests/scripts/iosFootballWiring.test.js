import { readNativeModels, readNativePicks } from '../helpers/nativeSources.js';
import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const models = readNativeModels();
const supabaseApi = readFileSync(new URL('../../../ios/GaryApp/SupabaseAPI.swift', import.meta.url), 'utf8');
const contentView = readFileSync(new URL('../../../ios/GaryApp/ContentView.swift', import.meta.url), 'utf8');
const picksTab = readNativePicks();
const scoutTrio = readFileSync(new URL('../../../ios/GaryApp/ScoutTrio.swift', import.meta.url), 'utf8');
const hasSwift = spawnSync('swift', ['--version'], { encoding: 'utf8' }).status === 0;

function swiftBlock(source, declaration) {
  const start = source.indexOf(declaration);
  if (start < 0) throw new Error(`declaration not found: ${declaration}`);
  let depth = 0;
  for (let index = source.indexOf('{', start); index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unclosed declaration: ${declaration}`);
}




describe('Football Fantasy density', () => {

  it('keeps dated prior-season provenance visible in the current shared Fantasy full case', () => {
    const fantasy = readFileSync(new URL('../../../ios/GaryApp/FantasyBriefingView.swift', import.meta.url), 'utf8');
    const sheet = swiftBlock(fantasy, 'private struct FantasyDecisionSheet:');
    const evidence = swiftBlock(sheet, 'private var evidence:');
    if (!hasSwift) return;
    // Decode the real evidence type: season, sample scope and caveat are
    // preserved source copy, which both the compact and full desks display.
    const model = readFileSync(new URL('../../../ios/GaryApp/FantasyBriefing.swift', import.meta.url), 'utf8');
    const directory = mkdtempSync(join(tmpdir(), 'gary-fantasy-provenance-'));
    try {
      const path = join(directory, 'Fixture.swift');
      writeFileSync(path, `${model}
let payload = #"{"id":"prior_regular_baseline","label":"2025 regular-season baseline","source":"BALLDONTLIE dated final player game stats","observed_at":"2026-09-08T12:00:00Z","summary":"2025 regular-season baseline: 8 observed games. This is not current role or current form."}"#
let evidence = try JSONDecoder().decode(FantasyDecision.Evidence.self, from: Data(payload.utf8))
precondition(evidence.label == "2025 regular-season baseline")
precondition(evidence.summary?.contains("8 observed games") == true)
precondition(evidence.summary?.contains("not current role or current form") == true)
precondition(evidence.observed_at == "2026-09-08T12:00:00Z")
let decisionJSON = #"{"id":"one","player_id":"1","player_name":"Fixture Pitcher","action":"WATCH","horizon":"week","headline":"Watch the workload","why_now":"Actual ERA and workload remain worth checking.","fit":"Managers checking a bench spot.","risk":"The role remains uncertain.","watch_for":"The next announced starter.","formats":["categories"],"categories":["strikeouts"],"opportunities":[],"evidence":[{"id":"one","label":"Observed record","source":"Fixture","summary":"Actual ERA 3.26, xBA .250."}],"limitations":[]}"#
let valid = try JSONDecoder().decode(FantasyDecision.self, from: Data(decisionJSON.utf8))
precondition(valid.isValid(league: "MLB"))
for term in ["xERA", "expected ERA", "expected earned run average"] {
    let invalidJSON = decisionJSON.replacingOccurrences(of: "Actual ERA and workload", with: term)
    let invalid = try JSONDecoder().decode(FantasyDecision.self, from: Data(invalidJSON.utf8))
    precondition(!invalid.isValid(league: "MLB"))
}
print("Fantasy provenance preserved")
`);
      const result = spawnSync('swift', [path], { encoding: 'utf8', timeout: 30_000 });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('Fantasy provenance preserved');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 35_000);

});

describe('Home MLB/NFL board parity', () => {





  it.skipIf(!hasSwift)('executes typed game focus without substituting a missing doubleheader sibling', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-picks-focus-'));
    try {
      const keywords = ['mlb', 'nba', 'nhl', 'nfl', 'wc'].map(league => {
        const start = picksTab.indexOf(`let ${league}TeamKeywords:`);
        return picksTab.slice(start, picksTab.indexOf('\n]', start) + 2);
      }).join('\n');
      const functions = [
        'static func matchupKey(', 'static func timeBucket(', 'static func gameIdentityKey(',
        'private func propSportKey(', 'private func bdlGameId(', 'private var gameIDSignature:',
        'private func resolveBdlGameId(', 'private func consumeFocus()',
      ].map(declaration => swiftBlock(picksTab, declaration)).join('\n');
      // Execute the shipping navigation, ID resolution and name matcher. Only
      // SwiftUI animation/state and the network-backed model/store are stubbed.
      const script = `import Foundation
import CoreFoundation
${swiftBlock(models, 'struct ExactGameIdentity:')}
${swiftBlock(scoutTrio, 'struct GamePageDataScope:')}
struct TomorrowBoard { let date: String; let board: [TomorrowBoardRow] }
struct TomorrowBoardRow { let league: String?; let bdl_game_id: Int? }
typealias PicksCarouselView = Router
${keywords}
${swiftBlock(picksTab, 'func abbrGameMatches(')}
func parseISO8601(_ value: String) -> Date? { ISO8601DateFormatter().date(from: value) }
struct Animation { static func easeInOut(duration: Double) -> Animation { Animation() } }
func withAnimation(_ animation: Animation, _ action: () -> Void) { action() }
struct PropPick { var game_id: Int?; var effectiveLeague: String? = "MLB"; var commence_time: String? = nil }
struct SlateRow {
 var league: String? = "MLB"; var bdl_game_id: Int?
 var away_team: String? = "New York Mets"; var home_team: String? = "Atlanta Braves"
 var commence_time: String? = "2026-09-07T17:00:00Z"
}
struct PickRow {
 var league: String? = "MLB"; var game_id: Int?
 var awayTeam: String? = "New York Mets"; var homeTeam: String? = "Atlanta Braves"
 var commence_time: String? = "2026-09-07T17:00:00Z"
}
struct Store {
 var contentRevision: UInt64 = 0
 var loadedDate: String? = "2026-09-07"
 var loading = false; var slate: [SlateRow] = []
 var gamePicks: [PickRow] = []; var yesterdayGamePicksAll: [PickRow] = []
}
final class FocusState {
 var focusGame: String?; var focusLeague: String?; var focusGameID: Int?
 var focusDate: String?; var focusRefresh = false; var focusRequestID = UUID()
 ${swiftBlock(contentView, 'func focus(game:')}
 ${swiftBlock(contentView, 'func clearGameFocus()')}
}
enum PickDay { case today, yesterday }
typealias Game = (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])
final class Router {
 struct History { var revision = 0 }; struct Week { var id = "" }
 var history = History(); var historyWeek: Week?
 var selectedDate: String? { GamePageDataScope.slateDate(loadedDate: store.loadedDate, yesterday: pickDay == .yesterday) }
 var selectedPicks: [PickRow] { pickDay == .today ? store.gamePicks : store.yesterdayGamePicksAll }
 var selectedSlate: [SlateRow] { pickDay == .today ? store.slate : [] }
 var gameIDMemo: (signature: String, ids: [String: Int?])?
 var focusState = FocusState(); var store = Store(); var pickDay = PickDay.today
 var sport = "MLB"; var sportAutoSelected = true; var sports = ["MLB", "NFL", "NCAAF"]
 var games: [Game] = []; var page = 0
 func preparePushFocusIfNeeded() -> Bool { true }
 func reportMissingPushFocus() {}
 ${functions}
 func consume() { consumeFocus() }
}
func check(_ condition: Bool, _ reason: String) {
 if !condition { print("Focus regression failed: " + reason); exit(1) }
}
let first = SlateRow(bdl_game_id: 101)
let second = SlateRow(bdl_game_id: 102, commence_time: "2026-09-07T23:00:00Z")
func game(_ row: SlateRow, propID: Int? = nil) -> Game {
 (matchup: "New York Mets @ Atlanta Braves", time: "7 PM", commence: row.commence_time.flatMap(parseISO8601), dh: true,
  props: propID.map { [PropPick(game_id: $0)] } ?? [])
}
func request(_ router: Router, id: Int? = 102, league: String? = "MLB") {
 router.focusState.focus(game: "NYM @ ATL", league: league, gameID: id)
}
let loading = Router()
loading.store.slate = [first]; loading.games = [game(first)]; loading.store.loading = true
request(loading); loading.consume()
check(loading.focusState.focusGameID == 102 && loading.page == 0, "typed request must wait while loading instead of opening game one")
loading.store.slate.append(second); loading.games.append(game(second)); loading.store.loading = false
loading.consume()
check(loading.page == 2 && loading.focusState.focusGame == nil, "pending request must open the arriving exact second game")

let absent = Router()
absent.store.slate = [first]; absent.games = [game(first)]; absent.page = 1
request(absent); absent.consume()
check(absent.page == 0 && absent.focusState.focusGame == nil, "settled missing ID must clear to the overview")
let empty = Router()
empty.store.loading = true; request(empty); empty.consume()
check(empty.focusState.focusGameID == 102, "empty loading desk must preserve typed request")
empty.store.loading = false; empty.consume()
check(empty.focusState.focusGame == nil && empty.page == 0, "settled empty desk must complete safely")
let unavailable = Router()
unavailable.sports = ["NFL"]; unavailable.store.loading = true; request(unavailable); unavailable.consume()
check(unavailable.focusState.focusGameID == 102, "unavailable loading league must preserve typed request")
unavailable.store.loading = false; unavailable.consume()
check(unavailable.focusState.focusGame == nil && unavailable.page == 0, "settled unavailable league must complete safely")

let staleMemo = Router()
staleMemo.store.slate = [SlateRow(bdl_game_id: 102)]
staleMemo.games = [game(first, propID: 101)]
request(staleMemo); staleMemo.consume()
check(staleMemo.page == 0 && staleMemo.focusState.focusGame == nil, "matching names and kickoff cannot override conflicting known ID")

let switchDesk = Router()
switchDesk.pickDay = .yesterday; switchDesk.sport = "NCAAF"
switchDesk.store.slate = [first, second]; request(switchDesk)
switchDesk.consume()
check(switchDesk.pickDay == .today && switchDesk.focusState.focusGameID == 102, "day transition must preserve target")
switchDesk.consume()
check(switchDesk.sport == "MLB" && switchDesk.focusState.focusGameID == 102, "league transition must preserve target")
switchDesk.games = [game(first), game(second)]; switchDesk.consume()
check(switchDesk.page == 2 && switchDesk.focusState.focusGame == nil, "rebuilt correct desk must resolve exact game")

let otherLeague = Router()
otherLeague.store.slate = [SlateRow(league: "NFL", bdl_game_id: 102), first]
otherLeague.games = [game(first)]; request(otherLeague); otherLeague.consume()
check(otherLeague.page == 0 && otherLeague.sport == "MLB", "another league's same numeric ID must not resolve")
let missingLeague = Router()
missingLeague.sport = "NFL"; missingLeague.store.slate = [first]
request(missingLeague, league: nil); missingLeague.consume()
check(missingLeague.sport == "NFL" && missingLeague.focusState.focusGame == nil, "explicit missing ID must not infer another league from fuzzy names")

let picksOnly = Router()
picksOnly.store.gamePicks = [PickRow(game_id: 102)]
picksOnly.games = [game(first)]; request(picksOnly); picksOnly.consume()
check(picksOnly.page == 1 && picksOnly.focusState.focusGame == nil, "pick-only exact ID remains routable")
let legacy = Router()
legacy.store.slate = [first]; legacy.games = [game(first)]
request(legacy, id: nil, league: nil); legacy.consume()
check(legacy.page == 1 && legacy.focusState.focusGame == nil, "legacy name-only focus retains abbreviation fallback")
print("Typed Picks focus regressions passed")
`;
      const path = join(directory, 'focus.swift');
      writeFileSync(path, script);
      const result = spawnSync('swift', [path], { encoding: 'utf8', timeout: 30_000 });
      expect(result.status, result.stderr + result.stdout).toBe(0);
      expect(result.stdout).toContain('Typed Picks focus regressions passed');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 40_000);





});


// Exercise the actual new decoder/freshness boundary outside the app shell.
it.skipIf(!hasSwift)('does not turn missing, stale or future component health into verified empty availability', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gary-component-health-'));
  try {
    const declaration = swiftBlock(supabaseApi, 'struct FootballComponentHealth: Decodable');
    const source = `import Foundation
    enum SupabaseAPI { ${declaration} }
    let formatter = ISO8601DateFormatter()
    func row(_ status: String, _ age: TimeInterval) -> SupabaseAPI.FootballComponentHealth {
      SupabaseAPI.FootballComponentHealth(team_id: "1", component: "availability", status: status, reason: "fixture", observed_at: formatter.string(from: Date().addingTimeInterval(-age)))
    }
    precondition(row("ok", 60).currentVerified)
    precondition(!row("fail", 60).currentVerified)
    precondition(!row("ok", 9 * 3600).currentVerified)
    precondition(!row("ok", -3600).currentVerified)
    print("verified")`;
    const file = join(directory, 'Check.swift'); writeFileSync(file, source);
    const result = spawnSync('swift', [file], {encoding:'utf8',timeout:30000});
    expect(result.status, result.stderr).toBe(0); expect(result.stdout.trim()).toBe('verified');
  } finally { rmSync(directory, {recursive:true,force:true}); }
});
