import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const source = file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
const scout = source('ScoutTrio.swift');
const picks = source('PicksTab.swift');
const models = source('Models.swift');
const hasSwift = spawnSync('swift', ['--version'], { encoding: 'utf8' }).status === 0;

function block(text, start) {
  const begin = text.indexOf(start);
  if (begin < 0) throw new Error(`Missing Swift declaration: ${start}`);
  let depth = 0;
  const open = text.indexOf('{', begin);
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}' && --depth === 0) return text.slice(begin, i + 1);
  }
  throw new Error(`Unclosed Swift declaration: ${start}`);
}

describe('native game-page player card scope', () => {
  it('passes each page league into the card selection and task identity', () => {
    expect(scout).toContain('PlayerIntelSection(matchup: group.matchup, league: "MLB")');
    expect(source('FootballGameIntelView.swift')).toContain('PlayerIntelSection(matchup: matchup, league: normalizedLeague, gameId: exactGameID)');
    expect(scout).toContain('Self.cardsForGame(all, league: league, gameId: gameId, matchup: matchup)');
    expect(scout).toContain('.task(id: [league, matchup, gameId ?? ""].joined(separator: "|"))');
  });

  it.skipIf(!hasSwift)('executes the real selector against colliding provider ids and cross-sport abbreviation pairs', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-player-scope-'));
    try {
      const keywordTables = ['mlb', 'nba', 'nhl', 'nfl', 'wc'].map(league => {
        const start = picks.indexOf(`let ${league}TeamKeywords:`);
        return picks.slice(start, picks.indexOf('\n]', start) + 2);
      }).join('\n');
      const script = `${source('NCAAFTeams.swift')}\n${source('HubCardIdentity.swift')}
struct PlayerInsightPack: Decodable { let game: String? }
${block(models, 'struct PlayerInsightCardRow:')}
${keywordTables}
${block(picks, 'func abbrGameMatches(')}
enum Cards {
${block(scout, '    static func cardsForGame(')}
}
func row(_ league: String?, _ gameId: String?, _ player: String, _ game: String?) -> PlayerInsightCardRow {
    PlayerInsightCardRow(league: league, player_id: player, player_name: player, team_abbr: nil, game_id: gameId, payload: PlayerInsightPack(game: game))
}
let matchup = "Atlanta Braves @ San Francisco Giants"
let mlb = row("MLB", "123", "shared-player", "ATL @ SF")
let nfl = row("NFL", "123", "shared-player", "ATL @ NYG")
let college = row("NCAAF", "123", "shared-player", "ATL @ SF")
let unknown = row(nil, "123", "missing-league", "ATL @ SF")
let wrongGame = row("NFL", "456", "different-game", "ATL @ NYG")
let all = [mlb, nfl, college, unknown, wrongGame]
// The existing shared keyword matcher can match NFL Atlanta/Giants to an
// MLB Braves/Giants matchup. The selector must reject it by league first.
precondition(abbrGameMatches("ATL @ NYG", matchup: matchup))
precondition(Cards.cardsForGame(all, league: "MLB", gameId: nil, matchup: matchup).map { $0.id } == [mlb.id])
precondition(Cards.cardsForGame(all, league: "NFL", gameId: "123", matchup: matchup).map { $0.id } == [nfl.id])
precondition(Cards.cardsForGame(all, league: "NCAAF", gameId: "123", matchup: matchup).map { $0.id } == [college.id])
precondition(Cards.cardsForGame(all, league: "NFL", gameId: "missing", matchup: matchup).isEmpty)
precondition(Cards.cardsForGame([row("MLB", nil, "no-pack", nil)], league: "MLB", gameId: nil, matchup: matchup).isEmpty)
precondition(Set([mlb.id, nfl.id, college.id]).count == 3)
print("League-scoped player card regressions passed")
`;
      const path = join(directory, 'scope.swift');
      writeFileSync(path, script);
      expect(execFileSync('swift', [path], { encoding: 'utf8', timeout: 30_000 })).toContain('League-scoped player card regressions passed');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 40_000);
});
