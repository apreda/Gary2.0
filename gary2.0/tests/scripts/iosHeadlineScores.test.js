import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const read = name => readFileSync(new URL(`../../../ios/GaryApp/${name}.swift`, import.meta.url), 'utf8');
const models = read('Models'), front = read('HomeFrontPage'), home = read('HomeView');
function block(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(marker);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(marker);
}
const hasSwift = spawnSync('swiftc', ['--version']).status === 0;
describe('headline final scores', () => {
  it.skipIf(!hasSwift)('executes shipping score mapping, box decoding and football/baseball card rows', () => {
    const swift = `import Foundation
struct GameResult {
  var game_date: String? = "2026-09-07"
  var effectiveLeague: String? = "NCAAF"
  var matchup: String? = "SMU Mustangs @ Florida State Seminoles"
  var pick_text: String? = "SMU Mustangs -2.5 -115"
  var teamScores: (a: Int, h: Int)? = (27, 24)
  var displayFinalScore: String? { "SMU 27 · FSU 24" }
}
${block(models, 'struct BoxLine:')}
${block(models, 'enum HomeRecapScores')}
struct HomeMarqueeHero {
 struct Story { var matchup = "SMU Mustangs @ Florida State Seminoles"; var score: String?;
 var league = "NCAAF"; var awayTD: Int? = 3; var homeTD: Int? = 3; var awayHR: Int?; var homeHR: Int? }
}
struct HeadlineFlipCard {
 let story: HomeMarqueeHero.Story
 ${block(front, 'static func sides(')}
 ${block(front, 'private var boxStatLine:').replace('private ', '')}
}
let result = GameResult()
let key = HomeRecapScores.key(date: result.game_date, league: result.effectiveLeague, matchup: result.matchup, pick: result.pick_text)
let scores = HomeRecapScores.index([result])
assert(scores[key] == "27-24")
// The original presentation string could not be rendered as numeric box rows.
assert(HeadlineFlipCard.sides(.init(score: result.displayFinalScore)) == nil)
let story = HomeMarqueeHero.Story(score: scores[key])
assert(HeadlineFlipCard.sides(story)!.away.runs == 27)
assert(HeadlineFlipCard.sides(story)!.home.runs == 24)
assert(HeadlineFlipCard(story: story).boxStatLine!.label == "TDs")
assert(HeadlineFlipCard(story: story).boxStatLine!.total == 6)
var otherDay = result; otherDay.game_date = "2026-09-06"; otherDay.teamScores = (10, 7)
assert(HomeRecapScores.index([otherDay, result])[key] == "27-24")
var otherTicket = result; otherTicket.pick_text = "SMU +1"; otherTicket.teamScores = (7, 3)
assert(HomeRecapScores.index([otherTicket, result])[key] == "27-24")
var conflict = result; conflict.teamScores = (7, 3)
assert(HomeRecapScores.index([conflict, result])[key] == nil)
var unavailable = result; unavailable.teamScores = nil
assert(HomeRecapScores.index([unavailable]).isEmpty)
let box = try! JSONDecoder().decode(BoxLine.self, from: #"{"away":{"runs":0,"hr":0},"home":{"runs":1,"hr":1}}"#.data(using: .utf8)!)
assert(box.finalScore == "0-1")
let baseball = HomeMarqueeHero.Story(matchup: "Braves @ Phillies", score: box.finalScore, league: "MLB", awayTD: nil, homeTD: nil, awayHR: box.away?.hr, homeHR: box.home?.hr)
assert(HeadlineFlipCard.sides(baseball)!.away.runs == 0)
assert(HeadlineFlipCard(story: baseball).boxStatLine!.label == "HRs")
assert(HeadlineFlipCard(story: baseball).boxStatLine!.total == 1)
let missing = try! JSONDecoder().decode(BoxLine.self, from: #"{"away":{"runs":0},"home":{}}"#.data(using: .utf8)!)
assert(missing.finalScore == nil)
assert(HeadlineFlipCard.sides(.init(score: "27-bad-24")) == nil)
print("PASS: football/baseball scores, total labels, zero, missing, date/ticket/conflict isolation")
`;
    const dir = mkdtempSync(join(tmpdir(), 'gary-headline-score-'));
    try {
      writeFileSync(join(dir, 'main.swift'), swift);
      execFileSync('swiftc', [join(dir, 'main.swift'), '-o', join(dir, 'test')], { timeout: 60_000 });
      expect(execFileSync(join(dir, 'test'), { encoding: 'utf8' })).toContain('PASS: football/baseball scores');
    } finally { rmSync(dir, { force: true, recursive: true }); }
  }, 90_000);
  it('uses the same numeric score mapping in full and rolling Home loads and prefers the recap box', () => {
    expect(home).toContain('scoreByMatchup = HomeRecapScores.index(recentGameResults)');
    expect(home).toContain('scoreByMatchup = HomeRecapScores.index(recentGames)');
    expect(home).toContain('score: r.box?.finalScore ?? scoreByMatchup[HomeRecapScores.key(');
    expect(front).toContain('Text("FINAL")');
  });
});
