import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const source = name => readFileSync(new URL(`../../../ios/GaryApp/${name}.swift`, import.meta.url), 'utf8');
const models = source('Models');
function declaration(text, signature) {
  const start = text.indexOf(signature);
  if (start < 0) throw new Error(`Missing ${signature}`);
  let i = text.indexOf('{', start) + 1, depth = 1;
  while (depth && i < text.length) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') depth--;
    i++;
  }
  return text.slice(start, i);
}
const hasSwift = spawnSync('swift', ['--version']).status === 0;

describe('dated college rankings in native team labels', () => {
  it.skipIf(!hasSwift)('executes the shipping formatter and snapshot resolver across leagues, dates and conflicting game IDs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gary-college-ranks-'));
    try {
      // Only storage declarations are reduced; formatting and resolution are
      // extracted unchanged from shipping Swift, including model properties.
      const swift = `import Foundation
struct GaryPick {
 var league: String? = "NCAAF", game_id: Int? = 101
 var awayTeam: String? = "Michigan Wolverines", homeTeam: String? = "Ohio State Buckeyes"
 var awayRanking: Int? = 7, homeRanking: Int? = 2
}
struct DailySlateRow {
 var league: String? = "NCAAF", bdl_game_id: Int? = 101
 var away_team: String? = "Michigan Wolverines", home_team: String? = "Ohio State Buckeyes"
 var away_ranking: Int? = 9, home_ranking: Int? = 1
}
${declaration(models, 'struct CollegeTeamRankings:')}
${declaration(models, 'extension DailySlateRow')}
${declaration(models, 'extension GaryPick')}
let pick = GaryPick(), slate = DailySlateRow()
func resolve(_ picks: [GaryPick] = [], _ rows: [DailySlateRow] = [], game: Int? = 101, league: String = "NCAAF") -> CollegeTeamRankings {
 CollegeTeamRankings.resolve(league: league, gameID: game,
   away: "Michigan Wolverines", home: "Ohio State Buckeyes", picks: picks, slate: rows)
}
let beforePick = resolve([], [slate])
precondition(beforePick.matchup(away: "MICH", home: "OSU") == "#9 MICH @ #1 OSU")
let published = resolve([pick], [slate])
precondition(published.matchup(away: "MICH", home: "OSU") == "#7 MICH @ #2 OSU")
precondition(published.score(away: "MICH", home: "OSU", awayScore: 0, homeScore: 14) == "#7 MICH 0 · #2 OSU 14")
// Saving/publication wins over a newer poll, including an unranked side.
var unranked = pick; unranked.awayRanking = nil; unranked.homeRanking = nil
precondition(resolve([unranked], [slate]) == .unranked)
var oneRank = pick; oneRank.homeRanking = nil
precondition(resolve([oneRank]).matchup(away: "MICH", home: "OSU") == "#7 MICH @ OSU")
// Same team names with another provider id must never borrow that game's poll.
var otherGame = pick; otherGame.game_id = 999
var otherSlate = slate; otherSlate.bdl_game_id = 999
precondition(resolve([otherGame], [otherSlate]) == .unranked)
var otherLeague = pick; otherLeague.league = "NCAAB"
precondition(resolve([otherLeague]) == .unranked)
precondition(resolve([otherLeague], league: "NCAAB").away == 7)
precondition(resolve([pick], [slate], league: "NFL") == .unranked)
// Historical caller supplies that day's snapshot; today's poll is irrelevant.
var historical = pick; historical.awayRanking = 12
precondition(resolve([historical]).away == 12)
precondition(resolve([], []).matchup(away: "MICH", home: "OSU") == "MICH @ OSU")
var legacy = pick; legacy.game_id = nil
precondition(resolve([legacy]).away == 7)
precondition(resolve([legacy, pick]).away == 7)
legacy.awayRanking = 20
precondition(resolve([legacy, pick]).away == 7, "Exact provider identity beats a legacy name match")
legacy.awayTeam = "Michigan State Spartans"
precondition(resolve([legacy]) == .unranked)
legacy.awayTeam = pick.homeTeam; legacy.homeTeam = pick.awayTeam
precondition(resolve([legacy]) == .unranked)
for invalid in [-1, 0, 26, 99] {
 precondition(CollegeTeamRankings(league: "NCAAF", away: invalid, home: invalid) == .unranked)
}
for league in ["MLB", "NFL", "NBA", "NHL", ""] {
 precondition(CollegeTeamRankings(league: league, away: 1, home: 25).matchup(away: "AWAY", home: "HOME") == "AWAY @ HOME")
}
precondition(CollegeTeamRankings(league: "ncaab", away: 25, home: 1).label("Duke", homeSide: true) == "#1 Duke")
precondition(pick.awayTeam == "Michigan Wolverines", "Display ranks never rewrite identity")
print("PASS: college ranks, published snapshots, league and game isolation, unranked and invalid data")
`;
      writeFileSync(join(dir, 'main.swift'), swift);
      expect(execFileSync('swift', [join(dir, 'main.swift')], { encoding: 'utf8', timeout: 60_000 })).toContain('PASS: college ranks');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 70_000);

  it('uses the visible day snapshot for Picks and leaves routing on undecorated identities', () => {
    const picks = source('PicksTab');
    const memo = declaration(picks, 'private func rebuildMemo()');
    expect(memo).toContain('pickDay == .today ? store.gamePicks : store.yesterdayGamePicksAll');
    expect(memo).toContain('slate: pickDay == .today ? store.slate : []');
    const strip = declaration(picks, 'private func stripBlock(');
    expect(strip).toContain('collegeRankingsMemo[Self.gameIdentityKey(g.matchup, g.commence)]');
    expect(strip).not.toContain('CollegeTeamRankings.resolve');
    expect(strip).toContain('page = index');
    expect(source('HomeFrontPage')).toContain('onOpenGame(e.matchupFull)');
    expect(source('ShareCards')).toContain('let rankings = pick.collegeRankings');
  });
});
