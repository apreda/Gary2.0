import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const read = name => readFileSync(new URL(`../../../ios/GaryApp/${name}.swift`, import.meta.url), 'utf8');
const home = read('HomeView'), front = read('HomeFrontPage'), shared = read('ViewsShared');
const hasSwift = spawnSync('swift', ['--version'], { encoding: 'utf8' }).status === 0;
const marquee = front.slice(front.indexOf('struct HomeMarqueeTracker: View'));

function declaration(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`Missing Swift declaration: ${signature}`);
  let i = source.indexOf('{', start) + 1, depth = 1;
  while (depth && i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    i++;
  }
  if (depth) throw new Error(`Unclosed Swift declaration: ${signature}`);
  return source.slice(start, i);
}

function swiftFixture(name, script) {
  const directory = mkdtempSync(join(tmpdir(), `gary-home-${name}-`));
  try {
    const path = join(directory, 'fixture.swift');
    writeFileSync(path, script);
    return execFileSync('swift', [path], { encoding: 'utf8', timeout: 60_000 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const clock = `
var parseCalls = 0
let formatter = ISO8601DateFormatter()
func parseISO8601(_ value: String) -> Date? { parseCalls += 1; return formatter.date(from: value) }
`;

describe('Home rendering snapshots', () => {
  it.skipIf(!hasSwift)('keeps sport records and slate-driven tab ordering separate across days', () => {
    const models = read('Models');
    const script = `import Foundation
enum Sport { case mlb, nfl, ncaaf }
enum Formatters {
    static func splitPickAndOdds(_ text: String?) -> (String, String) {
        fatalError("These accounting fixtures supply the stored odds column")
    }
}
${declaration(models, 'struct StringOrNumber:')}
${declaration(models, 'struct GameResult:')}
${declaration(models, 'extension Array where Element == GameResult')}
struct Home {
${declaration(home, 'private enum HomeBoardLeague:').replace('private enum', 'enum')}
${declaration(home, 'private struct HomeBoardRecord').replace('private struct', 'struct')}
${declaration(home, 'private static func homeBoardRecord(').replace('private static', 'static')}
${declaration(home, 'private static func resultOdds(')}
${declaration(home, 'private static func unitsDelta(')}
}
typealias League = Home.HomeBoardLeague
precondition(League.ordered(available: [.ncaaf, .mlb]) == [.ncaaf, .mlb, .nfl])
precondition(League.ordered(available: [.nfl, .mlb]) == [.nfl, .mlb, .ncaaf])
precondition(League.ordered(available: [.mlb]) == [.mlb, .nfl, .ncaaf])
precondition(League.ordered(available: [.nfl, .mlb, .ncaaf, .you]) == [.nfl, .ncaaf, .mlb, .you])
precondition(League.ordered(available: []).count == 3)
func game(_ sport: String, _ result: String, _ odds: Int,
          day: String = "2026-09-19", preseason: Bool = false) -> GameResult {
    let json = "{\\"league\\":\\"\\(sport)\\",\\"result\\":\\"\\(result)\\",\\"odds\\":\\(odds),\\"game_date\\":\\"\\(day)\\",\\"season_type\\":\\(preseason ? 1 : 2)}"
    return try! JSONDecoder().decode(GameResult.self, from: Data(json.utf8))
}
let games = [game("MLB", "won", 150), game("MLB", "lost", -120), game("MLB", "push", -110),
             game("NCAAF", "lost", -110), game("americanfootball_ncaaf", "won", -200),
             game("NFL", "won", 900, preseason: true), game("MLB", "pending", 700),
             game("MLB", "won", 800, day: "2026-09-18"),
             game("NFL", "lost", -110, day: "2026-09-20")]
let mlb = Home.homeBoardRecord(games: games, league: "MLB", slateDate: "2026-09-19")
precondition(mlb.w == 1 && mlb.l == 1 && mlb.p == 1 && mlb.net == 0.5 && mlb.bestOdds == 150)
let college = Home.homeBoardRecord(games: games, league: "NCAAF", slateDate: "2026-09-19")
precondition(college.w == 1 && college.l == 1 && college.p == 0 && college.net == -0.5 && college.bestOdds == -200)
let nfl = Home.homeBoardRecord(games: games, league: "NFL", slateDate: "2026-09-19")
precondition(nfl.w == 0 && nfl.l == 0 && nfl.p == 0 && nfl.net == nil && nfl.bestOdds == nil)
let sunday = Home.homeBoardRecord(games: games, league: "NFL", slateDate: "2026-09-20")
precondition(sunday.w == 0 && sunday.l == 1 && sunday.net == -1 && sunday.bestOdds == nil)
let reset = Home.homeBoardRecord(games: games, league: "MLB", slateDate: "2026-09-20")
precondition(reset.w == 0 && reset.l == 0 && reset.net == nil && reset.bestOdds == nil)
print("Sport records and daily ordering passed")
`;
    expect(swiftFixture('sport-records', script)).toContain('Sport records and daily ordering passed');
  }, 70_000);

  it.skipIf(!hasSwift)('grades large college spreads and exact total pushes against the displayed score', () => {
    const script = `import Foundation
struct GaryPick { let pick: String?; var awayTeam: String? = "Buffalo Bulls"; var homeTeam: String? = "Penn State Nittany Lions" }
struct LiveScore { let away_score: Int?; let home_score: Int?; var isFinal = false; var away_abbr: String? = "BUF"; var home_abbr: String? = "PSU" }
${declaration(front, 'enum HomeLiveVerdict {')}
func verdict(_ ticket: String, _ away: Int, _ home: Int, final: Bool = false) -> HomeLiveVerdict {
    HomeLiveVerdict.evaluate(pick: GaryPick(pick: ticket), live: LiveScore(away_score: away, home_score: home, isFinal: final))
}
precondition(verdict("Buffalo +39.5 (-110)", 0, 35) == .covering)
precondition(verdict("Penn State -51.5 (-115)", 0, 35) == .trailing)
precondition(verdict("Penn State −51.5 (-115)", 0, 52) == .covering)
precondition(verdict("Buffalo +58.5 -110", 0, 59) == .trailing)
precondition(verdict("Penn State ML -187", 0, 35) == .covering)
precondition(verdict("Buffalo +35 (-110)", 0, 35, final: true) == .neutral)
precondition(verdict("Over 35 (-110)", 0, 35, final: true) == .neutral)
precondition(verdict("Under 35 (-110)", 0, 35, final: true) == .neutral)
precondition(verdict("Under 35 (-110)", 0, 35) == .neutral)
precondition(verdict("Under 35 (-110)", 0, 36) == .trailing)
print("Live ticket statuses passed")
`;
    expect(swiftFixture('large-spreads', script)).toContain('Live ticket statuses passed');
  }, 70_000);

  it('passes one computed snapshot into the board and ribbon without retaining it across renders', () => {
    const sections = declaration(home, '@ViewBuilder private var todaySections');
    expect(sections.match(/self\.sheetRows/g)).toHaveLength(1);
    expect(sections.match(/self\.marqueeEntries/g)).toHaveLength(1);
    expect(sections).toContain('homeSheet(sheetRows)');
    expect(sections).toContain('if sheetRows.isEmpty');
    const sheet = declaration(home, '@ViewBuilder private func homeSheet(');
    expect(sheet).not.toContain('.sorted');
    const builder = declaration(home, 'private var sheetRows:');
    expect(builder.match(/bigOneModel/g)).toHaveLength(1);
    expect(builder.indexOf('bigOneModel')).toBeLessThan(builder.indexOf('for (i, g)'));
    const body = declaration(marquee, 'var body: some View');
    expect(body.match(/self\.hero/g)).toHaveLength(1);
    expect(body.match(/rail\(excluding:/g)).toHaveLength(1);
    expect(body).toContain('ribbonView(rail)');
    const ribbon = declaration(marquee, 'private func ribbonView(');
    expect(ribbon).not.toContain('self.hero');
    expect(ribbon).not.toContain('rail(excluding:');
  });

  it.skipIf(!hasSwift)('executes the shipping marquee selector for ties, promotions, interruptions, live/final transitions and bounded work', () => {
    const body = declaration(marquee, 'var body: some View');
    const bindings = body.slice(body.indexOf('let hero = self.hero'), body.indexOf('VStack(spacing: 0)'));
    const script = `import Foundation
${clock}
// Platform drawing types are stubbed; Entry and both selection methods below
// are the actual shipping Swift declarations.
struct Color { }
struct LiveScore { var isLive = false; var isFinal = false; var interruptionLabel: String? = nil }
enum HomeLiveVerdict { case covering, trailing, neutral }
struct Tracker {
${declaration(marquee, 'struct Entry: Identifiable')}
    let entries: [Entry]
    var promotedId: String? = nil
${declaration(marquee, 'private var hero: Entry?')}
${declaration(marquee, 'private func upNext(')}
${declaration(marquee, 'private func rail(excluding ')}
    func snapshot() -> (hero: Entry?, rail: [Entry]) {
${bindings}
        return (hero, rail)
    }
}
let early = "2099-09-07T17:00:00Z", late = "2099-09-07T20:00:00Z", past = "2000-09-07T17:00:00Z"
func entry(_ id: String, time: String? = early, rank: Int = 1,
           live: Bool = false, final: Bool = false, interrupted: String? = nil,
           rail: Bool = true, league: String = "MLB") -> Tracker.Entry {
    Tracker.Entry(id: id, rank: rank, league: league, matchupFull: "Away @ Home", title: id,
                  context: nil, commence: time, pickLine: nil, pendingLine: nil,
                  live: live || final ? LiveScore(isLive: live, isFinal: final) : nil,
                  verdict: nil, result: final ? ("FINAL", Color()) : nil,
                  slateInterruptionLabel: interrupted, railWorthy: rail)
}
func ids(_ rows: [Tracker.Entry]) -> [String] { rows.map(\\.id) }
let empty = Tracker(entries: []).snapshot()
precondition(empty.hero == nil && empty.rail.isEmpty)
let tied = [entry("first", rank: 2), entry("second", rank: 2), entry("later", time: late, rank: 0)]
precondition(Tracker(entries: tied).snapshot().hero?.id == "first")
precondition(ids(Tracker(entries: tied).snapshot().rail) == ["second", "later"])
precondition(Tracker(entries: tied, promotedId: "later").snapshot().hero?.id == "later")
precondition(Tracker(entries: tied, promotedId: "missing").snapshot().hero?.id == "first")
let ranked = [entry("later-best-rank", time: late, rank: 0), entry("earlier", rank: 9), entry("earlier-best-rank", rank: 1)]
precondition(Tracker(entries: ranked).snapshot().hero?.id == "earlier-best-rank")

// Preserve the current delayed-game eligibility; a performance change must
// not invent a different cancellation/delay policy while sorting the ribbon.
let mixed = [entry("final", time: past, final: true), entry("next"),
             entry("started", time: past), entry("live", time: past, live: true),
             entry("delayed", time: past, interrupted: "RAIN DELAY"), entry("hidden", time: late, rail: false)]
let selected = Tracker(entries: mixed).snapshot()
precondition(selected.hero?.id == "delayed")
precondition(ids(selected.rail) == ["live", "started", "next", "final"])
precondition(Tracker(entries: mixed, promotedId: "live").snapshot().hero?.id == "delayed")
precondition(Tracker(entries: mixed, promotedId: "final").snapshot().hero?.id == "delayed")
precondition(Tracker(entries: mixed, promotedId: "started").snapshot().hero?.id == "delayed")
precondition(Tracker(entries: mixed, promotedId: "hidden").snapshot().hero?.id == "hidden")
let sameProvider = [entry("MLB|17"), entry("NCAAF|17", league: "NCAAF"), entry("MLB|18", time: late)]
precondition(ids(Tracker(entries: sameProvider).snapshot().rail) == ["NCAAF|17", "MLB|18"])
let absentDates = [entry("nil", time: nil), entry("invalid", time: "invalid"), entry("valid")]
precondition(Tracker(entries: absentDates).snapshot().hero?.id == "valid")
precondition(Tracker(entries: [entry("nil", time: nil)]).snapshot().hero?.id == "nil")
let finished = Tracker(entries: [entry("done", time: past, final: true)]).snapshot()
precondition(finished.hero == nil && ids(finished.rail) == ["done"])
precondition(Tracker(entries: [entry("live", time: past, live: true)]).snapshot().hero == nil)

// The same immutable input array is not cached between evaluations: replacing
// a promoted game's status immediately lets the next game become the hero.
precondition(Tracker(entries: [entry("a"), entry("b", time: late)], promotedId: "a").snapshot().hero?.id == "a")
precondition(Tracker(entries: [entry("a", time: past, live: true), entry("b", time: late)], promotedId: "a").snapshot().hero?.id == "b")

for size in [12, 18, 45, 150] {
    let rows = (0..<size).map { entry("game-\\($0)", time: $0 == 0 ? early : late, rail: $0 < 6) }
    parseCalls = 0
    let snapshot = Tracker(entries: rows).snapshot()
    precondition(snapshot.hero?.id == "game-0" && snapshot.rail.count == 5)
    // Actual Swift timestamp-parser invocations, including ribbon sorting.
    // Five ribbon rows give fixed sorting work; growing the slate adds only
    // the one hero eligibility scan, rather than a scan per ribbon item.
    precondition(parseCalls <= size + 40, "Repeated selection work: \\(parseCalls), rows=\\(size)")
    print("rows=\\(size) timestampParses=\\(parseCalls)")
}
print("Shipping marquee selection passed")
`;
    expect(swiftFixture('marquee', script)).toContain('Shipping marquee selection passed');
  }, 70_000);

  it.skipIf(!hasSwift)('executes featured-pick selection and the exact league/game/date identity contract', () => {
    const script = `import Foundation
${clock}
struct GaryPick {
    var game_id: Int? = nil, league: String? = nil, awayTeam: String? = nil, homeTeam: String? = nil
    var commence_time: String? = nil, shortGameSignificance: String? = nil, gameSignificance: String? = nil
}
struct DailySlateRow { var league: String?; var bdl_game_id: Int?; var away_team: String?; var home_team: String? }
struct Home {
    var todayPicks: [GaryPick]
${declaration(home, 'private var bigOneModel:').replace('private var bigOneModel:', 'var bigOneModel:')}
${declaration(home, 'private static func homeBoardPick(_ pick: GaryPick, league:').replace('private static', 'static')}
${declaration(home, 'private static func homeBoardPick(_ pick: GaryPick, matches').replace('private static', 'static')}
${declaration(home, 'private static func homeMarqueeGameKey(').replace('private static', 'static')}
}
func pick(_ id: Int, league: String = "MLB", time: String? = "2099-09-07T17:00:00Z", significance: String? = "featured") -> GaryPick {
    GaryPick(game_id: id, league: league, awayTeam: "Away", homeTeam: "Home", commence_time: time, shortGameSignificance: significance)
}
precondition(Home(todayPicks: []).bigOneModel == nil)
precondition(Home(todayPicks: [pick(1, significance: nil), pick(2, significance: "")]).bigOneModel == nil)
precondition(Home(todayPicks: [pick(1), pick(2)]).bigOneModel?.game_id == 1)
precondition(Home(todayPicks: [pick(1, time: "2099-09-07T20:00:00Z"), pick(2)]).bigOneModel?.game_id == 2)
precondition(Home(todayPicks: [pick(1), pick(2, time: nil)]).bigOneModel?.game_id == 2)
var fallback = pick(7, significance: nil); fallback.gameSignificance = "legacy featured"
precondition(Home(todayPicks: [fallback]).bigOneModel?.game_id == 7)
fallback.shortGameSignificance = ""
precondition(Home(todayPicks: [fallback]).bigOneModel == nil)

let game = DailySlateRow(league: "MLB", bdl_game_id: 17, away_team: "Away", home_team: "Home")
precondition(Home.homeBoardPick(pick(17), matches: game))
precondition(!Home.homeBoardPick(pick(18), matches: game), "Do not borrow a doubleheader sibling")
precondition(!Home.homeBoardPick(pick(17, league: "NCAAF"), matches: game))
var legacy = pick(17); legacy.game_id = nil
precondition(Home.homeBoardPick(legacy, matches: game))
legacy.homeTeam = "Other"
precondition(!Home.homeBoardPick(legacy, matches: game))
let first = Home.homeMarqueeGameKey(league: "MLB", gameID: 17, matchup: "Away @ Home", commence: nil)
let otherLeague = Home.homeMarqueeGameKey(league: "NCAAF", gameID: 17, matchup: "Away @ Home", commence: nil)
precondition(first != otherLeague)
let morning = Home.homeMarqueeGameKey(league: "MLB", gameID: nil, matchup: "Away @ Home", commence: "2026-09-07T17:00:00Z")
let evening = Home.homeMarqueeGameKey(league: "MLB", gameID: nil, matchup: "Away @ Home", commence: "2026-09-07T23:00:00Z")
precondition(morning != evening)
precondition(Home.homeMarqueeGameKey(league: "MLB", gameID: nil, matchup: "Away @ Home", commence: nil) == nil)
print("Shipping featured-pick and exact identity contracts passed")
`;
    expect(swiftFixture('identity', script)).toContain('Shipping featured-pick and exact identity contracts passed');
  }, 70_000);

  it.skipIf(!hasSwift || process.platform !== 'darwin')('suppresses duplicate Combine publications through the actual scroll handler', () => {
    const handler = declaration(home, '.onPreferenceChange(HomeScrollOffsetKey.self)');
    const body = handler.slice(handler.indexOf('{ minY in') + '{ minY in'.length, -1);
    const script = `import Foundation
import Combine
${declaration(shared, 'final class GroundParallax: ObservableObject')}
let groundParallax = GroundParallax()
func scroll(_ minY: CGFloat) {
${body}
}
var emitted: [CGFloat] = []
let subscription = groundParallax.$offsetY.dropFirst().sink { emitted.append($0) }
scroll(0); scroll(25); scroll(200)
precondition(emitted.isEmpty)
scroll(-10); scroll(-10); scroll(-479); scroll(-480)
precondition(emitted.count == 3 && zip(emitted, [-1.0, -47.9, -48]).allSatisfy { abs($0 - $1) < 0.0000001 })
for offset in stride(from: -481, through: -2000, by: -1) { scroll(CGFloat(offset)) }
precondition(emitted.count == 3 && groundParallax.offsetY == -48)
scroll(-300); scroll(0); scroll(60)
precondition(emitted.count == 5 && zip(emitted, [-1.0, -47.9, -48, -30, 0]).allSatisfy { abs($0 - $1) < 0.0000001 })
withExtendedLifetime(subscription) { }
print("Scroll samples=1530 publications=5: actual Combine guard passed")
`;
    expect(swiftFixture('parallax', script)).toContain('actual Combine guard passed');
  }, 70_000);
});
