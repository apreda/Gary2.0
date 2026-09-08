import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const source = file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
const scout = source('ScoutTrio.swift'), picks = source('PicksTab.swift');
const mlb = source('MLBGameIntelView.swift'), models = source('Models.swift');
const hasSwift = spawnSync('swift', ['--version'], { encoding: 'utf8' }).status === 0;
function declaration(text, start, indent = '') {
  const begin = text.indexOf(start);
  if (begin < 0) throw new Error(`Missing shipping declaration ${start}`);
  const end = text.indexOf(`\n${indent}}`, begin);
  if (end < 0) throw new Error(`Missing declaration end ${start}`);
  return text.slice(begin, end + indent.length + 2);
}
const method = (text, name) => declaration(text, name, '    ').replace(/\bprivate /g, '');

describe('historical native game context', () => {
  it('wires accepted date/exact game through both sports and the lineup player route', () => {
    expect(picks).toContain('slateDate: GamePageDataScope.slateDate(loadedDate: store.loadedDate, yesterday: pickDay == .yesterday)');
    expect(scout).toContain('.task(id: gameDataScope) { await loadScout() }');
    expect(scout).toContain('board: scopedScoutBoard, wire: scopedScoutWire');
    expect(scout).toContain('league: pageLeague, gameId: bdlGameId.map(String.init), gameDate: slateDate');
    expect(source('FootballGameIntelView.swift')).toContain('gameId: exactGameID, gameDate: gameDate');
    expect(source('FootballGameIntelView.swift')).toContain('guard let today = gameDate else { return [] }');
    expect(scout).toContain('playerIntelDate: slateDate, matchup: group.matchup');
    expect(mlb).toContain('gameDate: playerIntelDate, gameID: gameID)');
    expect(mlb).toContain('pack: scope != nil && loadedScope == scope ? pack : nil');
    expect(mlb).toContain('.task(id: scope) { await loadPack() }');
    expect(method(picks, '    private var currentConnections:')).toContain('pickDay == .today');
    expect(method(picks, '    private func edges(for')).toContain('pickDay == .today');
  });

  it.skipIf(!hasSwift)('executes shipping selectors, caches and async loaders for historical games and delayed navigation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gary-historical-context-'));
    try {
      const boardModels = models.slice(models.indexOf('struct TomorrowBoard:'), models.indexOf('struct TomorrowWeather:'))
        + declaration(models, 'struct TomorrowWeather:');
      const fixture = readFileSync(new URL('../../../ios/Tests/HistoricalGameContextTests.swift', import.meta.url), 'utf8');
      const script = `import Foundation
import CoreFoundation
${declaration(models, 'struct ExactGameIdentity:')}
${boardModels}
${declaration(models, 'struct PlayerInsightCardRow:')}
enum HubCardIdentity {
${method(source('HubCardIdentity.swift'), '    static func sameLeague(')}
}
${declaration(scout, 'struct GamePageDataScope:')}
${declaration(scout, 'struct GamePageLoadState')}
${declaration(scout, 'struct ScoutTrioData')}
${declaration(mlb, 'struct CarouselCardScope:')}
@MainActor
${declaration(picks, 'enum TodayBoardCache')}
@MainActor
${declaration(picks, 'enum ScoutWireCache')}
@MainActor final class ScoutHarness {
 var gameDataScope: GamePageDataScope?
 var scoutLoad = GamePageLoadState()
 var loadedScoutScope: GamePageDataScope?
 var scoutBoard: TomorrowBoard?
 var scoutWire: [SupabaseAPI.WireItem] = []
 ${method(scout, '    private var scopedScoutBoard:')}
 ${method(scout, '    private var scopedScoutWire:')}
 ${method(scout, '    private func loadScout()')}
}
@MainActor final class PlayerHarness {
 var playerScope: GamePageDataScope?
 var playerLoad = GamePageLoadState()
 var loadedPlayerScope: GamePageDataScope?
 var rows: [PlayerInsightCardRow] = []
 var selected: PlayerInsightCardRow?
 let matchup = "New York Mets @ Miami Marlins"
 static let maxRows = 8
 ${method(scout, '    private var visibleRows:')}
 ${method(scout, '    static func cardsForGame(')}
 ${method(scout, '    private func loadPlayers()')}
}
@MainActor final class CarouselHarness {
 var scope: CarouselCardScope?
 var loadedScope: CarouselCardScope?
 var requestID = UUID()
 var pack: PlayerInsightPack?
 var loading = false
 ${method(mlb, '    private func loadPack()')}
}
@MainActor final class PicksCarouselView {
 var store = PickStore()
 var pickDay = PicksDay.today
 var sport = "MLB"
 func propSportKey(_ p: PropPick) -> String { p.league == "MLB HR" ? "MLB" : p.league }
 ${method(picks, '    static func matchupKey(')}
 nonisolated ${method(picks, '    static func timeBucket(').trim()}
 ${method(picks, '    static func gameIdentityKey(')}
 ${method(picks, '    private func bdlGameId(for')}
}
${fixture}`;
      const path = join(dir, 'Fixture.swift');
      writeFileSync(path, script);
      const binary = join(dir, 'fixture');
      execFileSync('swiftc', ['-O', '-swift-version', '5', '-parse-as-library', path, '-o', binary], { encoding: 'utf8', timeout: 60_000 });
      expect(execFileSync(binary, [], { encoding: 'utf8', timeout: 15_000 })).toContain('PASS historical game context');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 80_000);
});
