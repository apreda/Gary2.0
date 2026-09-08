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
    expect(scout).toContain('PlayerIntelSection(matchup: group.matchup, league: pageLeague, gameId: bdlGameId.map(String.init), gameDate: slateDate)');
    expect(source('FootballGameIntelView.swift')).toContain('PlayerIntelSection(matchup: matchup, league: normalizedLeague, gameId: exactGameID, gameDate: gameDate)');
    expect(scout).toContain('Self.cardsForGame(all, league: scope.league, gameId: String(scope.gameID), matchup: matchup)');
    expect(scout).toContain('.task(id: playerScope) { await loadPlayers() }');
  });

  it.skipIf(!hasSwift)('executes the real page and story selectors against colliding ids, doubleheaders and cross-sport abbreviations', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-player-scope-'));
    try {
      const keywordTables = ['mlb', 'nba', 'nhl', 'nfl', 'wc'].map(league => {
        const start = picks.indexOf(`let ${league}TeamKeywords:`);
        return picks.slice(start, picks.indexOf('\n]', start) + 2);
      }).join('\n');
      const script = `${source('NCAAFTeams.swift')}\n${source('HubCardIdentity.swift')}\n${source('HubStoryIdentity.swift')}
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
precondition(Cards.cardsForGame(all, league: "MLB", gameId: "123", matchup: matchup).map { $0.id } == [mlb.id])
precondition(Cards.cardsForGame(all, league: "NFL", gameId: "123", matchup: matchup).map { $0.id } == [nfl.id])
precondition(Cards.cardsForGame(all, league: "NCAAF", gameId: "123", matchup: matchup).map { $0.id } == [college.id])
precondition(Cards.cardsForGame(all, league: "NFL", gameId: "missing", matchup: matchup).isEmpty)
precondition(Cards.cardsForGame([row("MLB", nil, "no-pack", nil)], league: "MLB", gameId: nil, matchup: matchup).isEmpty)
precondition(Set([mlb.id, nfl.id, college.id]).count == 3)
let secondGame = row("MLB", "124", "shared-player", "ATL @ SF")
let doubleheader = [mlb, secondGame]
precondition(mlb.id != secondGame.id, "The same player has a separate card identity in each doubleheader game")
precondition(Cards.cardsForGame(doubleheader, league: "MLB", gameId: "124", matchup: matchup).map { $0.id } == [secondGame.id])
func storyCard(_ cards: [PlayerInsightCardRow], league: String = "MLB", player: String? = "shared-player", name: String? = "shared-player", game: String? = "123") -> Int? {
 HubStoryIdentity.playerCardIndex(
  league: league, slateDate: "2026-09-07", playerID: player, playerName: name,
  gameID: game, loadedDate: "2026-09-07", currentDate: "2026-09-07",
  candidates: cards.map { .init(league: $0.league, playerID: $0.player_id, gameID: $0.game_id,
                               name: $0.player_name, hasPayload: $0.payload != nil) })
}
precondition(storyCard(all) == 0 && storyCard(all, league: "NFL") == 1 && storyCard(all, league: "NCAAF") == 2)
precondition(storyCard(doubleheader, game: "124") == 1)
precondition(storyCard(doubleheader, game: nil) == nil, "Missing game identity cannot choose arbitrarily between a player's two games")
precondition(storyCard(doubleheader, game: "00123") == nil)
precondition(storyCard([mlb], game: "124") == nil, "An exact-game miss cannot fall back to the matching matchup name")
precondition(storyCard([mlb], player: "different-id") == nil, "An authoritative player-ID miss cannot become a name match")
precondition(storyCard([unknown]) == nil, "Unknown card league cannot inherit the selected sport")
let emptyPack = PlayerInsightCardRow(league: "MLB", player_id: "shared-player", player_name: "shared-player", team_abbr: nil, game_id: "123", payload: nil)
precondition(storyCard([emptyPack]) == nil)
precondition(storyCard([mlb, emptyPack]) == nil, "An empty duplicate still makes the player/game identity ambiguous")
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
