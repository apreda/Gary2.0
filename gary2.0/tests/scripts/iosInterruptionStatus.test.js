import { describe, expect, it } from 'vitest';
import { readIosViewsSource } from '../helpers/iosViewsSource.js';
import { readFileSync } from 'node:fs';

const models = readFileSync(new URL('../../../ios/GaryApp/Models.swift', import.meta.url), 'utf8');
const api = readFileSync(new URL('../../../ios/GaryApp/SupabaseAPI.swift', import.meta.url), 'utf8');
const views = readIosViewsSource();

const home = views.slice(views.indexOf('struct HomeView: View'), views.indexOf('struct HomeSheetRowView: View'));
const cache = views.slice(views.indexOf('final class LiveScoreCache'), views.indexOf('// MARK: - Shared Props Slate Store'));
const picks = views.slice(views.indexOf('struct PicksCarouselView: View'), views.indexOf('struct PicksTodayPage: View'));
const teaser = views.slice(views.indexOf('struct TeasedPickCard: View'), views.indexOf('enum TodayBoardCache'));
const gamePage = views.slice(views.indexOf('struct PicksGamePage: View'), views.indexOf('struct LiveScoreStrip: View'));
const liveStrip = views.slice(views.indexOf('struct LiveScoreStrip: View'), views.indexOf('struct BaseDiamond: View'));

describe('iOS interruption transport contract', () => {
  it('decodes provider interruption status/detail from both live scores and the daily slate', () => {
    expect(models).toContain('case "delayed", "postponed", "suspended", "cancelled": true');
    expect(models).toContain('var game_status: String? = nil');
    expect(models).toContain('var status_detail: String? = nil');
    expect(models).toContain('var interruptionLabel: String?');
    expect(api).toContain('kickoff_status,game_status,status_detail,bdl_game_id');
  });

  it('indexes and reads status by league plus provider game id', () => {
    expect(cache).toContain('private var byLeagueGameId: [String: LiveScore] = [:]');
    expect(cache).toContain('func status(forGameId gameId: Int?, league: String?) -> LiveScore?');
    expect(cache).toContain(String.raw`return "id:\((score.league ?? "").uppercased()):\(id)"`);
    expect(picks).toContain('return liveCache.status(forGameId: id, league: gameLeague(g))');
    expect(picks).toContain('return legacy?.isInterrupted == true ? nil : legacy');
  });
});

describe('iOS Home interruption state', () => {
  it('renders provider status before result and elapsed-start heuristics', () => {
    const interruptionBranch = home.indexOf('} else if let interruptionLabel {');
    const resultBranch = home.indexOf('} else if (ls?.isFinal ?? false) || !storedRows.isEmpty {');
    expect(interruptionBranch).toBeGreaterThan(-1);
    expect(interruptionBranch).toBeLessThan(resultBranch);
    expect(home).toContain('enum Zone { case settled, live, interrupted, upcoming }');
    expect(home).toContain('zone = .interrupted');
    expect(home).toContain('clockText = interruptionLabel');
    expect(home).toContain('let canResume = interruptionStatus == "delayed" || interruptionStatus == "suspended"');
    expect(home).toContain('statusText = calls.isEmpty ? "NO PICK" : (canResume ? "ON HOLD" : "OFF BOARD")');
    expect(home).toContain('pendingLine = nil');
    expect(home).toContain('if zone == .upcoming, interruptionLabel == nil,');
  });
});

describe('iOS Picks interruption state', () => {
  it('threads an exact slate fallback through the rail, no-pick card, and posted cards', () => {
    expect(picks).toContain('$0.bdl_game_id == gameId && ($0.league ?? "").uppercased() == league');
    expect(picks).toContain('interruptionLabel: interruptionLabel(for: g)');
    expect(gamePage.match(/interruptionLabel: interruptionLabel\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(gamePage).toContain('liveInSlot: true, interruptionLabel: interruptionLabel)');
    expect(teaser).toContain('guard providerStatus == nil else { return false }');
    expect(teaser).toContain('Text(providerStatus ?? (gameStarted ? "THIS GAME" : "INCOMING"))');
    expect(teaser).toContain('Gary\'s call stays off the live board.');
  });

  it('shows interruptions on pick and prop card footers without a final label', () => {
    expect(views.match(/if let interruption = (live|ls)\.interruptionLabel \{ return interruption \}/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(views.match(/private var interruptionOverride: String\?/g)?.length ?? 0).toBe(2);
    expect(views.match(/guard let (live|ls) = liveStatus else \{ return interruptionOverride \}/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(liveStrip.indexOf('else if let interruption = score.interruptionLabel')).toBeLessThan(liveStrip.indexOf('else if score.isFinal'));
    expect(liveStrip).toContain('Text("SCHEDULED")');
  });
});

describe('iOS Home marquee doubleheader identity', () => {
  it('joins markets and filler membership by provider id, with time-bucket-only legacy matching', () => {
    expect(home).toContain('private static func homeMarqueeGameKey(league: String?, gameID: Int?,');
    expect(home).toContain('if let gameID { return "\\(scopedLeague)|id:\\(gameID)" }');
    expect(home).toContain('guard let commence, let start = parseISO8601(commence) else { return nil }');
    expect(home).toContain('if let gameID = big.bdl_game_id {\n                    return br.bdl_game_id == gameID');
    expect(home).toContain('Int(bigStart.timeIntervalSince1970 / 1800) == Int(boardStart.timeIntervalSince1970 / 1800)');
    expect(home).toContain('let bigKeys: Set<String> = Set(bigs.compactMap');
    expect(home).toContain('let boardKey = Self.homeMarqueeGameKey');
  });

  it('scopes filler calls, live state, grades, and slate interruption to the exact game', () => {
    expect(home).toContain('return p.game_id == gameID');
    expect(home).toContain('let fillerLive = sheetLive(matchup, league: br.league ?? "", gameID: br.bdl_game_id');
    expect(home).toContain('gameID: br.bdl_game_id)');
    expect(home).toContain('? br.interruptionLabel : nil');
    expect(home).toContain('slateInterruptionLabel: slateInterruption');
  });
});
