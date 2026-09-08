import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const read = file => readFileSync(new URL(`../../../ios/GaryApp/${file}.swift`, import.meta.url), 'utf8');
const models = read('Models'), picks = read('PicksTab'), home = read('HomeView'), stores = read('SharedStores');
const hasSwift = spawnSync('swiftc', ['--version'], { encoding: 'utf8' }).status === 0;
function block(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`Missing shipping declaration: ${signature}`);
  let depth = 0;
  for (let index = source.indexOf('{', start); index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed shipping declaration: ${signature}`);
}

describe('source-aware native historical scores', () => {
  it.skipIf(!hasSwift)('executes real DTOs, cache reads, game/prop footers and Home headlines without assigning legacy score order', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-historical-scores-'));
    try {
      const swift = `import Foundation
${read('NCAAFTeams')}
${picks.slice(picks.indexOf('let mlbTeamKeywords:'), picks.indexOf('/// Reverse keyword index'))}
${block(models, 'struct StringOrNumber: Decodable')}
${models.slice(models.indexOf('struct GameResult: Decodable'), models.indexOf('struct PropResult: Decodable'))}
${block(models, 'struct LiveEvent: Codable')}
${block(models, 'struct LiveScore: Codable')}
${['func teamAbbrevFromName(', 'func finalScoreLine(', 'extension GameResult {', 'func liveLineRich('].map(s => block(picks, s)).join('\n')}
${block(stores, 'func gradedMatchupKey(')}
struct Cache {
    var gradedFinals: [String: String] = [:]
    ${block(stores, 'func gradedScore(forMatchup')}
}
// Rendering/network collaborators only; the DTOs, formatting, fallback order,
// cache lookup and recap decisions below are extracted from shipping source.
struct Pick { var awayTeam: String? = "Green Bay Packers"; var homeTeam: String? = "Chicago Bears"; var league: String? = "NFL" }
struct Prop { var matchup: String? = "Green Bay Packers @ Chicago Bears"; var effectiveLeague: String? = "NFL" }
struct GameCard {
    var pick = Pick(); var displayResult: String? = "won"; var finalScore: String?
    var liveFinal: LiveScore?; var liveStatus: LiveScore?; var liveCache = Cache(); var interruptionOverride: String?
    ${block(read('PickCards'), 'private var liveFooterText:').replace('private var', 'var')}
}
struct PropCard {
    var prop = Prop(); var resolvedResult: String? = "won"; var finalScore: String?
    var identifiedGameStatus: LiveScore?; var liveStatus: LiveScore?; var liveCache = Cache(); var interruptionOverride: String?
    var liveValue: String?; var formattedLineText: String?
    ${block(read('PropRows'), 'private var liveFooterText:').replace('private var', 'var')}
}
struct Color { static let white = Color(); func opacity(_ value: Double) -> Color { self } }
enum GaryColors { static let gold = Color(); static let win = Color() }
struct PropPick {}
typealias StripGame = (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])
enum PickDay { case today, yesterday }
struct ScoreStore {
    var score: String?
    func finalScore(forMatchup matchup: String) -> String? { score }
}
struct Strip {
    var pickDay = PickDay.yesterday; var store = ScoreStore(); var live: LiveScore?
    func liveScore(for game: StripGame) -> LiveScore? { live }
    func gameLeague(_ game: StripGame) -> String { "NFL" }
    func interruptionLabel(for game: StripGame) -> String? { nil }
    ${block(picks, 'private func liveFinalLine(').replace('private func', 'func')}
}
enum Formatters {
    static func shortTeamName(_ name: String?, league: String?) -> String { name ?? "" }
    static func splitPickAndOdds(_ text: String?) -> (String, String) { (text ?? "", "") }
}
enum Recap {
    ${['private static func scoreParts(', 'private static func gameHeadline(', 'private static func gameCashTitle(', 'private static func gameSubLine(', 'private static func teamAbbrev('].map(s => block(home, s).replace('private static', 'static')).join('\n')}
}
func nfl(_ json: String) throws -> GameResult { try JSONDecoder().decode(NFLResult.self, from: Data(json.utf8)).toGameResult() }
func live(_ json: String) throws -> LiveScore { try JSONDecoder().decode(LiveScore.self, from: Data(json.utf8)) }
func bothCards(_ score: String?, cache: Cache = Cache(), live: LiveScore? = nil) -> (String?, String?) {
    (GameCard(finalScore: score, liveFinal: live, liveCache: cache).liveFooterText,
     PropCard(finalScore: score, identifiedGameStatus: live, liveCache: cache).liveFooterText)
}
func checkCards(_ expected: String, _ score: String?, cache: Cache = Cache(), live: LiveScore? = nil) {
    let (game, prop) = bothCards(score, cache: cache, live: live)
    precondition(game == expected, "Game footer: \\(game ?? "nil") != \\(expected)")
    precondition(prop == expected, "Prop footer: \\(prop ?? "nil") != \\(expected)")
}
// Real sparse playoff shapes: raw scores are winner-first for these two games.
// No fixture manufactures numeric fields for the archived rows.
let packers = try nfl(#"{"game_date":"2026-01-10","matchup":"Green Bay Packers @ Chicago Bears","pick_text":"Chicago Bears ML +110","result":"won","final_score":"31-27","season_type":2}"#)
let chargers = try nfl(#"{"game_date":"2026-01-11","matchup":"Los Angeles Chargers @ New England Patriots","pick_text":"New England Patriots -3.5 -115","result":"won","final_score":"16-3","season_type":2}"#)
for row in [packers, chargers] {
    precondition(row.teamScores == nil)
    precondition(row.displayFinalScore == row.final_score)
    precondition(row.result == "won" && row.season_type == 2)
    precondition(Recap.scoreParts(row) == nil)
    precondition(!Recap.gameHeadline(row, cashed: true).contains(" over "))
    precondition(Recap.gameCashTitle(row) == row.matchup)
    precondition(Recap.gameSubLine(row).hasSuffix("Final " + row.final_score!))
    checkCards("FINAL · " + row.final_score!, row.displayFinalScore)
    let cache = Cache(gradedFinals: [gradedMatchupKey("Green Bay Packers @ Chicago Bears")!: row.final_score!])
    checkCards("FINAL · " + row.final_score!, nil, cache: cache)
}
// When explicit fields exist, they override contradictory bare text and keep
// correct team labels, without rewriting that original text or its grade.
let numeric = try nfl(#"{"matchup":"Green Bay Packers @ Chicago Bears","away_team":"Green Bay Packers","home_team":"Chicago Bears","away_score":27,"home_score":31,"final_score":"31-27","result":"won","season_type":3}"#)
precondition(numeric.away_score == 27 && numeric.home_score == 31)
precondition(numeric.final_score == "31-27" && numeric.result == "won" && numeric.season_type == 3)
precondition(numeric.displayFinalScore == "GB 27 · CHI 31")
precondition(Recap.gameHeadline(numeric, cashed: true) == "Chicago Bears over the Green Bay Packers, 31–27")
precondition(Recap.gameCashTitle(numeric) == "GB 27 – 31 CHI")
checkCards("FINAL · GB 27 · CHI 31", numeric.displayFinalScore)
checkCards("FINAL · GB 27 · CHI 31", nil, cache: Cache(gradedFinals: [gradedMatchupKey(numeric.matchup)!: numeric.displayFinalScore!]))
// Generic DTO decoding and numeric-only rows follow the same contract.
let generic = try JSONDecoder().decode(GameResult.self, from: Data(#"{"league":"NFL","matchup":"Los Angeles Chargers @ New England Patriots","away_score":3,"home_score":16}"#.utf8))
precondition(generic.displayFinalScore == "LAC 3 · NE 16" && generic.final_score == nil)
// game_results has no numeric columns. Its reviewed away-home writer contract
// must be attached at the table reader, preserving MLB labels and headlines.
// League alone or a payload claiming provenance is insufficient.
let mlbUnknown = try JSONDecoder().decode(GameResult.self, from: Data(#"{"league":"MLB","matchup":"Colorado Rockies @ Chicago Cubs","pick_text":"Cubs ML","final_score":"6-8","result":"won","scoreSource":"gameResultsAwayHome"}"#.utf8))
precondition(mlbUnknown.teamScores == nil && mlbUnknown.displayFinalScore == "6-8")
let mlbStored = mlbUnknown.withGameResultsScoreOrder()
precondition(mlbStored.displayFinalScore == "COL 6 · CHC 8")
precondition(mlbStored.final_score == "6-8" && mlbStored.result == "won")
precondition(Recap.gameHeadline(mlbStored, cashed: true) == "Chicago Cubs over the Colorado Rockies, 8–6")
precondition(Recap.gameCashTitle(mlbStored) == "COL 6 – 8 CHC")
checkCards("FINAL · COL 6 · CHC 8", mlbStored.displayFinalScore)
checkCards("FINAL · COL 6 · CHC 8", nil, cache: Cache(gradedFinals: [gradedMatchupKey("Green Bay Packers @ Chicago Bears")!: mlbStored.displayFinalScore!]))
precondition(packers.withGameResultsScoreOrder().teamScores == nil, "Even an incorrect caller must not give legacy NFL a text-order contract")
for raw in ["CHI 8 · COL 6", "6-8-9", "-6-8", "unknown", "6.5-8"] {
    let data = try JSONSerialization.data(withJSONObject: ["league": "MLB", "matchup": "Colorado Rockies @ Chicago Cubs", "final_score": raw])
    let row = try JSONDecoder().decode(GameResult.self, from: data).withGameResultsScoreOrder()
    precondition(row.teamScores == nil && row.displayFinalScore == raw)
}
let namedOnly = try nfl(#"{"away_team":"Los Angeles Chargers","home_team":"New England Patriots","away_score":3,"home_score":16}"#)
precondition(namedOnly.displayFinalScore == "LAC 3 · NE 16")
for fields in [#""home_score":31"#, #""away_score":27"#, #""away_score":-1,"home_score":31"#] {
    let row = try nfl("{\\"matchup\\":\\"Green Bay Packers @ Chicago Bears\\",\\"final_score\\":\\"31-27\\"," + fields + "}")
    precondition(row.teamScores == nil && row.displayFinalScore == "31-27")
}
let unknown = try nfl(#"{"away_score":3,"home_score":16,"final_score":"16-3"}"#)
precondition(unknown.teamScores == nil && unknown.displayFinalScore == "16-3")
let empty = try nfl("{}")
precondition(empty.displayFinalScore == nil && empty.teamScores == nil)
let namesWithoutScores = try nfl(#"{"away_team":"Green Bay Packers","home_team":"Chicago Bears","final_score":"31-27"}"#)
precondition(namesWithoutScores.teamScores == nil && namesWithoutScores.displayFinalScore == "31-27")
let tie = try nfl(#"{"matchup":"Green Bay Packers @ Chicago Bears","away_score":0,"home_score":0,"pick_text":"Tie","final_score":"0-0"}"#)
precondition(tie.displayFinalScore == "GB 0 · CHI 0")
precondition(!Recap.gameHeadline(tie, cashed: false).contains(" over "))
// Current numeric live fields outrank ambiguous cache strings; provider labels
// and known matchup labels both stay correct, including zero scores.
let noAbbreviations = try live(#"{"league":"NFL","status":"final","away_score":27,"home_score":31}"#)
checkCards("FINAL · GB 27 · CHI 31", "31-27", live: noAbbreviations)
let provider = try live(#"{"league":"NFL","status":"final","away_abbr":"GB","home_abbr":"CHI","away_score":27,"home_score":31}"#)
checkCards("FINAL · GB 27 · CHI 31", "31-27", live: provider)
let zero = try live(#"{"league":"NFL","status":"final","away_score":0,"home_score":0}"#)
checkCards("FINAL · GB 0 · CHI 0", nil, live: zero)
// Picks strip must preserve a cached presentation string as-is and label only
// current numeric live columns. The doubleheader cache exclusion is retained.
let stripGame: StripGame = ("Green Bay Packers @ Chicago Bears", "", nil, false, [])
precondition(Strip(store: ScoreStore(score: "31-27")).liveFinalLine(for: stripGame)?.text == "FINAL · 31-27")
precondition(Strip(store: ScoreStore(score: numeric.displayFinalScore)).liveFinalLine(for: stripGame)?.text == "FINAL · GB 27 · CHI 31")
precondition(Strip(pickDay: .today, live: noAbbreviations).liveFinalLine(for: stripGame)?.text == "FINAL · GB 27 · CHI 31")
precondition(Strip(pickDay: .today, live: zero).liveFinalLine(for: stripGame)?.text == "FINAL · GB 0 · CHI 0")
var twin = stripGame; twin.dh = true
precondition(Strip(store: ScoreStore(score: "31-27")).liveFinalLine(for: twin) == nil)
precondition(Strip().liveFinalLine(for: stripGame) == nil)
for text in ["31–27", "CHI 31 · GB 27", "OT 31-27", "not available"] { checkCards("FINAL · " + text, text) }
checkCards("FINAL", nil)
precondition(finalScoreLine(matchup: "unknown", awayScore: 3, homeScore: 16, league: "NFL") == "3–16")
print("PASS: sparse historical scores, explicit numerical identities, both card footers, cache fallback and Home recap")
`;
      const path = join(directory, 'Fixture.swift'), binary = join(directory, 'fixture');
      writeFileSync(path, swift);
      execFileSync('swiftc', ['-swift-version', '5', '-O', path, '-o', binary], { encoding: 'utf8', timeout: 60_000, stdio: 'pipe' });
      expect(execFileSync(binary, [], { encoding: 'utf8', timeout: 10_000 })).toContain('PASS: sparse historical scores');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 75_000);

  it('keeps result handoffs on the source-aware adapter and prevents raw-string score relabeling', () => {
    for (const name of ['BillfoldView', 'HomeView', 'SharedStores', 'WinnersView']) {
      expect(read(name), name).not.toMatch(/\.final_score\b/);
      expect(read(name), name).toContain('.displayFinalScore');
    }
    for (const name of ['PicksTab', 'PickCards', 'PropRows']) {
      expect(read(name), name).not.toMatch(/finalScoreLine\([^\n]*\braw:/);
    }
  });
});
