import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const source = file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
const hasSwift = spawnSync('swift', ['--version'], { encoding: 'utf8' }).status === 0;
function block(text, start) {
  const begin = text.indexOf(start);
  if (begin < 0) throw new Error(`Missing declaration: ${start}`);
  let depth = 0;
  for (let i = text.indexOf('{', begin); i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}' && --depth === 0) return text.slice(begin, i + 1);
  }
  throw new Error(`Unclosed declaration: ${start}`);
}

describe('native Hub team and ranking story routes', () => {
  it.skipIf(!hasSwift)('executes actual routing against stored headline forms, team metadata and exact ranked-matchup identity', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-hub-team-routing-'));
    try {
      const hub = source('HubView.swift');
      const picks = source('PicksTab.swift');
      const keywordStart = picks.indexOf('let mlbTeamKeywords:');
      const keywords = picks.slice(keywordStart, picks.indexOf('\n]', keywordStart) + 2);
      const script = `${source('NCAAFTeams.swift')}\n${source('HubCardIdentity.swift')}
${keywords}
enum HubLeagueSel { case mlb, ncaaf; var label: String { self == .mlb ? "MLB" : "NCAAF" } }
enum Kind { case bullpenFatigue, teamRecord, regression, streak, other }
struct Meta { var team: String?; var team_abbr: String?; var dominant_name: String?; var source: String? }
struct Signal {
 var league: HubLeagueSel = .mlb; var kind: Kind = .other; var headline: String
 var playerId: String?; var teamId: String?; var gameId: String?
 var h2h: Meta?; var fantasy: Meta?; var swap: Meta?; var lane: Meta?
}
struct Row { let league: String?; let bdl_game_id: Int? }
struct HubGameSel { let row: Row }
struct Card { let player_id: String?; let league: String? }
final class Router {
 var intelCards: [Card] = []; var slateRows: [Row] = []
 var breakdownSignal: Signal?; var selectedSignal: Signal?; var teamCardSignal: Signal?
 var namedCard: Card?; var gameSheet: HubGameSel?
 private func intelCard(for name: String?, league: HubLeagueSel? = nil) -> Card? { nil }
 ${block(hub, '    static func teamCardName(')}
 ${block(hub, '    static func signalPlayerName(')}
 ${block(hub, '    private func openSignal(')}
 func open(_ s: Signal) { openSignal(s) }
}
let h = HubCardIdentity.self
for (headline, team) in [
 ("San Francisco Giants are 12-25 in one-run games (.324 win%)", "San Francisco Giants"),
 ("Philadelphia Phillies are 24-12 in one-run games (.667 win%)", "Philadelphia Phillies"),
 ("Detroit Tigers are 13-25 in one-run games (.342 win%)", "Detroit Tigers")
] {
 let signal = Signal(kind: .regression, headline: headline, teamId: "team")
 precondition(Router.teamCardName(for: signal) == team)
 precondition(h.matchesTeam(Router.teamCardName(for: signal), name: team, abbr: nil, league: "MLB"))
 let player = Signal(kind: .regression, headline: headline, playerId: "player")
 precondition(Router.teamCardName(for: player) == headline)
}
let first = Signal(headline: "MIN strike first: 1st-inning runs in 7 of their last 10", teamId: "17", lane: Meta(team_abbr: "MIN"))
precondition(Router.teamCardName(for: first) == "MIN")
precondition(h.matchesTeam(Router.teamCardName(for: first), name: "Minnesota Twins", abbr: "MIN", league: "MLB"))
for code in ["NYY", "COL", "OAK", "BAL", "CHW", "SEA"] {
 let signal = Signal(kind: .streak, headline: code + " games have gone OVER 5 straight", teamId: "team")
 precondition(Router.teamCardName(for: signal) == code)
}
let unknown = Signal(kind: .streak, headline: "Unknown games have gone OVER 5 straight", teamId: "team")
precondition(Router.teamCardName(for: unknown) == unknown.headline)
let noTeam = Signal(kind: .streak, headline: "NYY games have gone OVER 5 straight")
precondition(Router.teamCardName(for: noTeam) == noTeam.headline)
let ranking = Signal(league: .ncaaf, headline: "Oregon State at No. 23 Houston", teamId: "38", gameId: "457178", lane: Meta(source: "balldontlie_ncaaf_rankings"))
let router = Router()
router.slateRows = [Row(league: "MLB", bdl_game_id: 457178), Row(league: "NCAAF", bdl_game_id: 457178)]
router.open(ranking)
precondition(router.gameSheet?.row.league == "NCAAF" && router.gameSheet?.row.bdl_game_id == 457178)
precondition(router.teamCardSignal == nil && router.selectedSignal == nil)
for rows in [[], [Row(league: "MLB", bdl_game_id: 457178)], [Row(league: "NCAAF", bdl_game_id: 457178), Row(league: "NCAAF", bdl_game_id: 457178)]] {
 let fallback = Router(); fallback.slateRows = rows; fallback.open(ranking)
 precondition(fallback.gameSheet == nil && fallback.teamCardSignal == nil && fallback.selectedSignal != nil)
}
print("Hub team and ranking routes passed")
`;
      const path = join(directory, 'team-routing.swift');
      writeFileSync(path, script);
      expect(execFileSync('swift', [path], { encoding: 'utf8', timeout: 30_000 })).toContain('Hub team and ranking routes passed');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 40_000);
});
