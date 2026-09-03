import { describe, expect, it } from 'vitest';
import { readIosViewsSource } from '../helpers/iosViewsSource.js';
import { readFileSync } from 'node:fs';

const models = readFileSync(new URL('../../../ios/GaryApp/Models.swift', import.meta.url), 'utf8');
const views = readIosViewsSource();
const supabaseApi = readFileSync(new URL('../../../ios/GaryApp/SupabaseAPI.swift', import.meta.url), 'utf8');
const footballIntel = readFileSync(new URL('../../../ios/GaryApp/FootballGameIntelView.swift', import.meta.url), 'utf8');
const footballHub = readFileSync(new URL('../../../ios/GaryApp/FootballProofContract.swift', import.meta.url), 'utf8');
const hubView = readFileSync(new URL('../../../ios/GaryApp/HubView.swift', import.meta.url), 'utf8');
const designSystem = readFileSync(new URL('../../../ios/GaryApp/DesignSystem.swift', import.meta.url), 'utf8');
const contentView = readFileSync(new URL('../../../ios/GaryApp/ContentView.swift', import.meta.url), 'utf8');

/// Text of ONE declaration, from its opening line to the next top-level one.
/// Slicing to end-of-file instead silently widens every `not.toContain` in a
/// body assertion to "anything later in the file" — which is how THE MISMATCH
/// section broke the fantasy-row pin without touching it.
function sliceStruct(source, declaration) {
  const start = source.indexOf(declaration);
  if (start < 0) throw new Error(`declaration not found: ${declaration}`);
  const rest = source.slice(start + declaration.length);
  const next = rest.search(/\n(?:\/\/ MARK: -|private struct |private enum |struct |enum |extension )/);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('iOS football pick decoding', () => {
  it('keeps market fields when the app uses the manual dictionary parser', () => {
    expect(models).toContain('spread: number("spread")');
    expect(models).toContain('moneylineHome: number("moneylineHome", "moneyline_home")');
    expect(models).toContain('moneylineAway: number("moneylineAway", "moneyline_away")');
  });
});

describe('iOS slate-only football page identity', () => {
  it('carries the exact slate league into the page and incoming card', () => {
    expect(views).toContain('pageLeagueHint: league(for: g)');
    expect(views).toContain('if let league = pageLeagueHint, !league.isEmpty');
    expect(views).toContain('TeasedPickCard(league: pageLeague.isEmpty ? nil : pageLeague');
    expect(views).toContain('} else if isFootball {');
    expect(views).toContain('FootballGameIntelView(');
  });

  it('uses exact provider identities for NCAAF strip abbreviations and never invents mascot prefixes', () => {
    expect(views).toContain('liveCache.status(forGameId: gameId, league: league)');
    expect(views).toContain('$0.bdl_game_id == gameId && ($0.league ?? "").uppercased() == league');
    expect(views).toContain('?? (lg == "NCAAF"');
    expect(views).toContain('? g.matchup.uppercased()');
  });

  it('shows provider date-only college games as TIME TBD throughout the Picks rail', () => {
    expect(models).toContain('kickoff_status == "date_only" ? "TIME TBD" : nil');
    expect(views).toContain('let time = s.kickoffTimeLabel');
    expect(views).not.toContain('Estimated 3:00 PM ET');
  });

  it('uses stored provider abbreviations on NCAAF pick and share cards', () => {
    expect(models).toContain('var homeTeamAbbreviation: String? = nil');
    expect(models).toContain('var awayTeamAbbreviation: String? = nil');
    expect(views).toContain('homeIsPicked ? pick.homeTeamAbbreviation : pick.awayTeamAbbreviation');
    expect(views).toContain('homePicked ? pick.homeTeamAbbreviation : pick.awayTeamAbbreviation');
    expect(views).toContain('case "NCAAF": return Formatters.shortTeamName(name, league: league).uppercased()');
  });

  it('keeps every football fantasy signal out of Picks edges', () => {
    expect(views).toMatch(/fantasyOnlyKinds:[\s\S]*?\.fantasyUsage, \.fantasyRedZone, \.fantasyMatchup, \.fantasyTrend/);
    expect(views).toContain('.filter { !fantasyKinds.contains($0.kind) }');
  });
});

describe('Billfold touchdown routing', () => {
  it('recognizes backend anytime_touchdown while reserving NFL TDs for NFL rows', () => {
    expect(models).toContain('propLower.contains("touchdown")');
    expect(models).toContain('var isNFLTDResult: Bool');
    expect(models).toContain('effectiveLeague == "NFL" && isTDResult');
    expect(views).toContain('filteredByTime.filter { $0.isNFLTDResult }');
    expect(views).toContain('filteredByTime.filter { !$0.isNFLTDResult && !$0.isHRResult }');
    expect(views).toContain('propRows.filter { !$0.isNFLTDResult }');
    expect(views).not.toContain('filteredByTime.filter { $0.isTDResult }');
  });
});

describe('Live Props touchdown routing', () => {
  it('keeps the NFL TDs chip NFL-only while retaining college TD props in NCAAF and ALL', () => {
    expect(models).toContain('var isNFLTDPick: Bool');
    expect(models).toContain('effectiveLeague == "NFL" && isTDPick');
    expect(views).toContain('let todayCore = allProps.filter { !$0.isNFLTDPick }');
    expect(views).toContain('return merged.filter { $0.isNFLTDPick }.sorted');
    expect(views).toContain('combined.contains(where: { $0.isNFLTDPick })');
    expect(views).not.toContain('return merged.filter { $0.isTDPick }.sorted');
  });
});

describe('THE SWEAT terminal states', () => {
  it('decodes numeric or string football season types without dropping proof rows', () => {
    expect(models).toContain('let season_type: InsightMetaValue?');
    expect(models).not.toContain('let season_type: String?');
  });

  it('renders pushes as terminal without counting them as misses', () => {
    expect(footballIntel).toContain('let finalStates: Set<String> = ["held", "missed", "push"]');
    expect(footballIntel).toContain('let pushes = normalizedStates.filter { $0 == "push" }.count');
    expect(footballIntel).toContain('if pushes > 0 { parts.append("\\(pushes) PUSH") }');
    expect(footballHub).toContain('self == .held || self == .missed || self == .push');
    expect(footballHub).toContain('case "push": return .push');
    expect(footballHub).not.toContain('final_push');
  });

  it('lets a terminal THE_NUMBER ticket suppress stale nonterminal factors for its exact game', () => {
    const sweatScope = footballHub.slice(
      footballHub.indexOf('static func finalScopedSweat'),
      footballHub.indexOf('static func isRenderableMarketRange'),
    );
    const gameSweat = footballIntel.slice(
      footballIntel.indexOf('private var sweatSignals'),
      footballIntel.indexOf('var body: some View'),
    );

    expect(sweatScope).toContain('== "THE_NUMBER"');
    expect(sweatScope).toContain('sweatState(signal)?.isFinal == true');
    expect(sweatScope).toContain('return signals.filter { sweatState($0)?.isFinal == true }');
    expect(gameSweat).toContain('belongsToExactGame($0)');
    expect(gameSweat).toContain('FootballProofContract.finalScopedSweat(renderable)');
  });

  it('uses the canonical backend factor code instead of prose for proof identity', () => {
    expect(footballIntel).toContain('signal.sweat?.factor_code?');
    expect(footballIntel).not.toContain('if !headline.isEmpty { return headline.uppercased() }');
  });
});

describe('Football Field density', () => {
  it('shows the whole availability report — one side at a time, never capped (never-trim law)', () => {
    expect(footballIntel).toContain('static func availability(from pick: GaryPick?, awayLabel: String,\n                             homeLabel: String) -> [Availability]');
    expect(footballIntel).not.toContain('output.count < cap');
    expect(footballIntel).toContain('confirmed: availability,');
    expect(footballIntel).not.toContain('SKILL PERSONNEL');
  });
  it('attributes injury-wire rows by the lanes\' own abbreviations and never hides an unrecognized row', () => {
    expect(footballIntel).toContain('laneAbbreviation(home: home),');
    expect(footballIntel).toContain('return names(mine, team) || !names(theirs, team)');
  });
  it('MORE INTEL excludes shown ROWS, not whole kinds, for the capped sections', () => {
    expect(footballIntel).toContain('var shownIds = Set(railLaneRows.map(\\.id))');
    expect(footballIntel).toContain('!shownIds.contains(s.id)');
    expect(footballIntel).not.toContain('let said: Set<SignalKind> = [.quarterback, .paceScript');
  });
});

describe('Football Fantasy density', () => {
  it("renders football fantasy through MLB's own card, never a bespoke football page", () => {
    // Founder, Sep 3 2026: "MLB is the template, the ONLY differences should be
    // that NFL is NFL content". The football fantasy page, its row and its
    // evidence helper are gone; every league routes through FantasyCornerPage.
    expect(footballIntel).not.toContain('struct FootballFantasyPage');
    expect(footballIntel).not.toContain('struct FootballFantasyRow');
    expect(footballIntel).not.toContain('enum FootballFantasyEvidence');
    expect(hubView).toContain('FantasyCornerPage(');
    for (const lane of [
      'usage: items(.fantasyUsage)',
      'scoring: items(.fantasyRedZone) + items(.fantasyMatchup)',
      'trending: items(.fantasyTrend)',
    ]) {
      expect(hubView).toContain(lane);
    }
  });

  it('keeps roster-verified prior-season provenance visible on the shared fantasy card', () => {
    // The label moved from the deleted football row's headline to the MLB
    // card's stat strip when the two pages merged. What the user sees — the
    // season plus the word BASELINE on a prior-season row — is unchanged, and
    // it now reads the structured meta instead of parsing the headline.
    const strip = sliceStruct(hubView, 'fileprivate struct FantasyCard: View {');
    expect(strip).toContain('if m.evidence_scope == "prior_season_baseline", let y = m.season?.display { bits.append("\\(y) baseline") }');
  });

  it('opens grounded football evidence instead of the MLB-only player-card placeholder', () => {
    // Aug 20: the guard grew from fantasy-only to EVERY football row —
    // quarterback/availability rows carry player_id and fell through to the
    // MLB-only PlayerInsightSheet (a permanent "building" screen for NFL ids).
    // Aug 27: the pipeline builds football packs, so the guard gates on
    // verified pack existence — the pack sheet opens only when today's
    // intelCards hold the tapped id, the edge overlay stays the fallback.
    // The invariant is unchanged: no football tap can land on a placeholder.
    expect(hubView).toMatch(/if sel == \.nfl \|\| sel == \.ncaaf \{\s*\n\s*if let pid = s\.playerId, intelCards\.contains\(where: \{ \$0\.player_id == pid \}\) \{\s*\n\s*breakdownSignal = s\s*\n\s*\} else \{\s*\n\s*selectedSignal = s\s*\n\s*\}\s*\n\s*\}\s*\n\s*else if s\.playerId != nil \{ breakdownSignal = s \}/);
    expect(hubView).not.toContain('(sel == .nfl || sel == .ncaaf), Self.fantasyKinds.contains(s.kind)');
  });
});

describe('Football Hub runs MLB\'s page', () => {
  // Founder, Aug 21 2026: the Hub for NFL and NCAAF "needs to look 100% the
  // same as MLB just with NFL info". There is no football Hub page any more —
  // HubView's own MLB page renders every league.
  it('has no football-specific Hub page left to diverge', () => {
    expect(footballHub).not.toContain('struct FootballHubPage');
    expect(footballHub).not.toContain('FootballHubLead');
    expect(footballHub).not.toContain('FootballHubBestOf');
    expect(footballHub).not.toContain('FootballHubSignalRow');
    expect(footballHub).not.toContain('FootballHubBeatSection');
    expect(footballHub).not.toContain('boardRank');
    expect(hubView).not.toContain('FootballHubPage(');
    // The proof contract is the one thing that stays — it is integrity, not layout.
    expect(footballHub).toContain('enum FootballProofContract');
  });

  it('routes every league through the same loaded page', () => {
    const state = sliceStruct(hubView, 'private var hubEditorialStateContent: AnyView {');
    expect(state).toContain('return AnyView(hubLoadedContent)');
    expect(state).not.toMatch(/sel == \.nfl \|\| sel == \.ncaaf/);
  });

  it('applies the fail-closed proof gate once, at the page-wide row funnel', () => {
    const signals = sliceStruct(hubView, 'private var leagueSignals: [Signal] {');
    expect(signals).toContain('FootballProofContract.isRenderableAfterGary(signal)');
    expect(signals).toContain('FootballProofContract.isRenderableSweat(signal, includeWatch: false)');
    expect(signals).toContain('FootballProofContract.isRenderableMarketRange(');
    // NCAAF-only market ranges, and only against a confirmed slate row.
    expect(signals).toContain('guard sel == .ncaaf');
  });

  it('names every football lane in exactly one beat so none falls through unnamed', () => {
    const beats = sliceStruct(hubView, 'private var beats: [Beat] {');
    for (const league of ['sel == .nfl', 'sel == .ncaaf']) {
      const branch = beats.slice(beats.indexOf(league), beats.indexOf(league) + 900);
      for (const kind of ['.mismatch', '.trenches', '.passRush', '.quarterback', '.injury',
        '.coverage', '.paceScript', '.redZone', '.turnoverEdge', '.explosivePlay',
        '.coaching', '.situational', '.streak', '.teamRecord', '.afterGary']) {
        expect(branch).toContain(kind);
      }
    }
    // THE MISMATCH leads football's long tail the way the Regression Board
    // leads MLB's.
    expect(beats.indexOf('"The Mismatch"')).toBeLessThan(beats.indexOf('"The Trenches"'));
  });

  it('keeps modules out of the story feed and gives the dark day its own card', () => {
    const moduleKinds = hubView.match(/moduleKinds: Set<SignalKind> = \[([^\]]+)\]/)?.[1] ?? '';
    for (const kind of ['.theSweat', '.afterGary', '.nextSlate']) expect(moduleKinds).toContain(kind);
    expect(hubView).toContain('FootballNextSlatePreview(signal: next, accent: GaryColors.gold)');
    expect(hubView).toContain('slateRows.isEmpty && leagueSignals.contains { $0.kind == .nextSlate }');
    // The card stands in for the morning notice rather than stacking with it.
    expect(hubView).toContain('} else if !showsNextSlateCard {');
  });

  it('labels football lanes through the shared renamer, not a bespoke map', () => {
    expect(hubView).toContain('signalChipLabel(kind: s.kind, league: s.league)');
    expect(hubView).not.toContain('footballHubKindLabel');
  });

  it('never prints a date-only college placeholder as a kickoff time', () => {
    const strip = sliceStruct(hubView, 'fileprivate struct HubSlateStrip: View {');
    expect(strip).toContain('r.kickoffTimeLabel');
  });
});

describe('Football Picks overview', () => {
  // Founder, Aug 20 eve: the football Today page is "the same as MLB literally
  // — the categories and then how it works". The bespoke board is gone; NFL and
  // NCAAF render MLB's own tabbed EdgesSection, gated only by the proof contract.
  it('runs MLB\'s own tabbed edges section, never a bespoke football board', () => {
    expect(views).toMatch(/scopeLeague == "NFL" \|\| scopeLeague == "NCAAF"/);
    expect(views).toContain('edges: FootballTodayFeed.rows(edges), tabbed: true)');
    expect(views).not.toContain('FootballPicksBoard(');
    expect(footballIntel).not.toContain('struct FootballPicksBoard');
    expect(footballIntel).not.toContain('"Slate Read"');
  });

  it('keeps structured proof surfaces and market rows off the football Today feed', () => {
    const feed = sliceStruct(footballIntel, 'enum FootballTodayFeed');
    // THE SWEAT / AFTER GARY are structured factor + receipt rows with their
    // own Hub and game-page renderers — through MLB's prose row they read as
    // gibberish. MARKET RANGE has no authoritative slate row to prove kickoff
    // against here, and the season series belongs to its own game page.
    expect(feed).toMatch(/case \.theSweat, \.afterGary, \.marketRange(?:, \.\w+)*: return false/);
    // The league's practice grid is a game-page module with its own renderer.
    expect(feed).toContain('.practiceReport');
    expect(feed).toContain('case .h2h: return false');
  });

  it('turns an NCAAF dark day into a grounded next-slate preview', () => {
    expect(views).toContain('case "next_slate", "next slate": return .nextSlate');
    expect(views).toContain('nextSlate: kd == .nextSlate ? meta : nil');
    expect(views).toContain('FootballNextSlatePreview(signal: nextSlateSignal');
    expect(footballIntel).toContain('struct FootballNextSlatePreview: View');
    // The dark-day branch moved to the Picks page when the football quiet
    // state was deleted (Sep 3): NCAAF only, and only on an empty board.
    expect(views).toContain('guard sport == "NCAAF" else { return nil }');
    expect(views).toContain('} else if let nextSlateSignal {');
    expect(footballIntel).toContain('return "KICKOFF TIMES TBD"');
    expect(footballIntel).not.toContain('3:00 PM');
  });

  it('uses next-slate only as the no-current-slate Hub state', () => {
    // Moved to HubView with the football page's removal (Aug 21): the card
    // shows only when there is no slate, and never as a story.
    expect(hubView).toContain('slateRows.isEmpty && leagueSignals.contains { $0.kind == .nextSlate }');
    expect(hubView).toContain('if showsNextSlateCard, let next = leagueSignals.first(where: { $0.kind == .nextSlate })');
    const moduleKinds = hubView.match(/moduleKinds: Set<SignalKind> = \[([^\]]+)\]/)?.[1] ?? '';
    for (const kind of ['.theSweat', '.afterGary', '.nextSlate']) expect(moduleKinds).toContain(kind);
  });

  it('merges stale date-only and confirmed rows by exact provider game id', () => {
    expect(views).toContain('func providerIdentity(league: String?, gameId: Int?)');
    expect(views).toContain('providerKey.flatMap { providerIndex[$0] }');
    expect(views).toContain('providerIdentity(league: lg, gameId: s.bdl_game_id)');
    expect(views).toContain('return candidateIds.count == 1 ? candidateIds.first : nil');
  });

  it('observes the shared live cache so the matchup rail updates with its cards', () => {
    expect(views).toContain('@ObservedObject private var liveCache = LiveScoreCache.shared');
    expect(views).toContain('return liveCache.status(forGameId: id, league: gameLeague(g))');
    expect(views).toContain('let live = liveCache.scores.contains');
  });

  it('preserves each healthy pick desk and labels source failures as unavailable', () => {
    expect(views).toContain('@Published var gamePickSourceFailures: Set<String> = []');
    expect(views).toContain('@Published var propPickSourceFailed = false');
    expect(views).toContain('let sourceFailures = Set(todaySnapshot.failures.map(\\.failureKey))');
    expect(views).toContain('let mergedToday = mergeGamePickSnapshot(');
    expect(views).toContain('Text("BOARD DATA UNAVAILABLE · PULL TO RETRY")');
    expect(supabaseApi).toContain('throw SourceReadFailure(');
    expect(supabaseApi).toContain('sourceErrors.allSatisfy(isTransientExternalFailure)');
  });

  it('keeps Winners shelves isolated when one sport source fails', () => {
    expect(views).toContain('func fetchIsolatedGamePickSources(');
    expect(views).toContain('async let dailyTask = SupabaseAPI.fetchDailyPicks(date: date)');
    expect(views).toContain('async let nflTask = SupabaseAPI.fetchWeeklyNFLPicks(for: date)');
    expect(views).toContain('snapshot.transientExternalFailures.contains(.daily) && league != "NFL"');
    expect(views).toContain('snapshot.transientExternalFailures.contains(.nfl) && league == "NFL"');
    // (.ncaabFuture retention pin removed Sep 1 2026 — the NCAAB tournament lane left the app.)
    expect(views).toContain('retaining: previousGameShelves.filter { !$0.settled }.flatMap(\\.picks)');
    expect(views).toContain('retaining: previousGameShelves.filter(\\.settled).flatMap(\\.picks)');
    expect(views).toContain('? previousPropShelves.filter { !$0.settled }.flatMap(\\.props)');
    expect(views).toContain('? previousPropShelves.filter(\\.settled).flatMap(\\.props)');
    expect(views).toContain('boardDataFailed = !todaySnapshot.failures.isEmpty');
    expect(views).not.toContain('async let todayGameF = SupabaseAPI.fetchAllPicks(date: today)');
  });

  it('keeps Home and Yesterday pick desks isolated on cold and rolling loads', () => {
    const home = views.slice(
      views.indexOf('struct HomeView: View'),
      views.indexOf('struct HomeAllStarTakeover: View'),
    );
    const slateStore = views.slice(
      views.indexOf('final class PropsSlateStore: ObservableObject'),
      views.indexOf('struct MiniBarChart: View'),
    );

    expect(home).toContain('let previousTodayPicks = todayPicks');
    expect(home).toContain('let previousYesterdayPicks = [yesterdayTopPick].compactMap { $0 }');
    expect(home).toContain('let pickSnapshot = await picksFetch');
    expect(home).toContain('retaining: previousTodayPicks');
    expect(home).toContain('let previousPicks = todayPicks');
    expect(home).toContain('retaining: previousPicks');
    expect(home).toContain('todayPicks = freshPicks');
    expect(home).not.toContain('SupabaseAPI.fetchAllPicks');

    expect(slateStore).toContain('async let yesterdayFetch = fetchIsolatedGamePickSources(');
    expect(slateStore).toContain('let yesterdaySnapshot = await yesterdayFetch');
    expect(slateStore).toContain('retaining: yesterdayGamePicksAll');
    expect(slateStore).toContain('yesterdayGamePicks = yPicks');
    expect(slateStore).toContain('yesterdayGamePicksAll = yPicksAll');
    expect(slateStore).not.toContain('SupabaseAPI.fetchExactDatePicks');
  });
});

describe('Home MLB/NFL board parity', () => {
  it('uses one canonical tabbed panel in house-gold chrome (no sport-accent, founder Aug 18)', () => {
    const homeSheet = views.slice(
      views.indexOf('@ViewBuilder private var homeSheet'),
      views.indexOf('// MARK: Tonight extras'),
    );
    const rowBody = views.slice(
      views.indexOf('struct HomeSheetRowView: View'),
      views.indexOf('/// THE WINNERS STUB'),
    );

    expect(homeSheet).toContain('ForEach(HomeBoardLeague.allCases');
    // Aug 20 (founder): the YOU tab rides the same ONE BOARD — a ternary
    // routes the user's slate through the exact same panel, and the league
    // tabs still render from the league filter, never a second panel.
    expect(homeSheet).toContain('homeSheetPanel(selected == .you ? youRows : rows.filter { $0.league == selected.rawValue }');
    // The YOU tab exists only when the user has bets down today, and the
    // user's rows carry THEIR side's verdict (fade inverts Gary's standing).
    expect(homeSheet).toContain('if !youRows.isEmpty { set.insert(.you) }');
    expect(views).toContain('private func youLiveStatus(_ bet: UserBet, verdicts: [HomeLiveVerdict])');
    // Aug 19: the gold whisper gave way to the lit rim — the board wears the
    // exact headline-card float, and THE RECORD rides inside the board card.
    expect(homeSheet).not.toContain('.stroke(GaryColors.gold.opacity(0.16), lineWidth: 1)');
    expect(homeSheet).toContain('scorecard');
    expect(homeSheet).not.toContain('sport.accentColor');
    expect(homeSheet.match(/homeSheetPanel\(/g)).toHaveLength(2); // declaration + one render
    expect(homeSheet).not.toContain('ForEach(leagues');
    expect(rowBody).not.toContain('row.league ==');
    expect(views).toContain('if verb == "homeboard", let league = HomeBoardLeague(rawValue: arg.uppercased())');
  });

  it('Home stands on THE FLOOR with solid panels (founder GO, Aug 19)', () => {
    // The official ground: full-page STATIC grid (no clock — renders once),
    // horizon under the masthead. Pairs with opaque card fills scoped to
    // Home via the solidPanels environment; every other page keeps the wash.
    expect(views).toContain('struct HomeFloorGround: View');
    expect(views).toContain('HomeFloorGround(parallax: groundParallax)');
    expect(views).toContain('.environment(\\.solidPanels, true)');
    // Floating cards + living world (founder, Aug 19 round six): shadow
    // puddles on the grid, lit near edges, and the floor drifting at a tenth
    // of the scroll through an isolated model — never HomeView state.
    expect(views).toContain('class GroundParallax: ObservableObject');
    expect(views).toContain('groundParallax.offsetY = max(-48, min(0, minY) * 0.10)');
    expect(views).toContain('.onPreferenceChange(HomeScrollOffsetKey.self)');
    expect(designSystem).toContain('.shadow(color: .black.opacity(0.55), radius: 18, y: 10)');
    expect(views).not.toContain('struct ObsidianGround');
    expect(views).not.toContain('TimelineView(.animation(minimumInterval: 1.0 / 12.0');
    expect(designSystem).toContain('static let panelFillOpaque');
    expect(designSystem).toContain('var solidPanels: Bool');
    expect(designSystem).toContain('struct GaryPanelSurface: ViewModifier');
    expect(designSystem).toContain('@Environment(\\.solidPanels) private var solidPanels');
  });

  it('joins picks and results by exact provider game id before legacy names', () => {
    expect(models).toContain('let game_id: String?');
    expect(views).toContain('if let gameID, let pickID = pick.game_id');
    expect(views).toContain('return gameID == pickID');
    expect(views).toContain('$0.game_id == String(gameID)');
    expect(views).toContain('if gameID != nil, row.game_id != nil { return false }');
    expect(models).toContain('let bdl_game_id: Int?           // exact provider identity for Home joins');
    expect(views).toContain('gameID: big.bdl_game_id');
  });

  it('scopes live rows and Home navigation by league plus exact provider id', () => {
    expect(views).toMatch(/\$0\.game_id == String\(gameID\)[\s\S]*?\$0\.league \?\? ""\)\.uppercased\(\) == league/);
    expect(views).toContain('PicksFocusState.shared.focus(game: r.matchupFull');
    expect(views).toContain('gameID: r.gameID');
    expect(contentView).toContain('@Published var focusLeague: String? = nil');
    expect(contentView).toContain('@Published var focusGameID: Int? = nil');
    expect(views).toContain('$0.bdl_game_id == gameID');
    expect(views).toContain('games.firstIndex { Self.gameIdentityKey($0.matchup, $0.commence) == target }');
  });

  it('switches an NCAAF Picks desk to Home\'s MLB target before reading scoped games', () => {
    const consumeFocus = views.slice(
      views.indexOf('private func consumeFocus()'),
      views.indexOf('@ViewBuilder private var content', views.indexOf('private func consumeFocus()')),
    );
    const leagueSwitch = consumeFocus.indexOf('sport = targetLeague');
    const scopedGamesRead = consumeFocus.indexOf('guard !games.isEmpty else { return }');

    expect(consumeFocus).toContain('let targetLeague = focusLeague');
    expect(consumeFocus).toContain('sports.contains(targetLeague)');
    expect(leagueSwitch).toBeGreaterThan(-1);
    expect(leagueSwitch).toBeLessThan(scopedGamesRead);
    expect(consumeFocus).not.toContain('DispatchQueue.main.async');
    expect(consumeFocus).toContain('store.gamePicks.first');
    expect(consumeFocus).toContain('$0.game_id == gameID');
    expect(consumeFocus).toContain('games.firstIndex { bdlGameId(for: $0) == gameID }');
    // 350-char window: consumeFocus() must live INSIDE each onChange block (the
    // Aug 25 conference-nav edit legitimately grew the sport block past 220).
    expect(views).toMatch(/\.onChange\(of: sport\)[\s\S]{0,350}?consumeFocus\(\)/);
    expect(views).toMatch(/\.onChange\(of: dataSignature\)[\s\S]{0,350}?consumeFocus\(\)/);
  });

  it('exposes the Picks league masthead and exactly one dock tab as accessible controls', () => {
    const sharedHeader = views.slice(
      views.indexOf('struct GaryPageHeader'),
      views.indexOf('extension GaryPageHeader'),
    );
    const picksMasthead = views.slice(
      views.indexOf('private var masthead: some View'),
      views.indexOf('private func slateGameCount', views.indexOf('private var masthead: some View')),
    );
    const sideTab = contentView.slice(
      contentView.indexOf('private func sideTab'),
      contentView.indexOf('private var centerHub'),
    );
    const centerHub = contentView.slice(
      contentView.indexOf('private var centerHub'),
      contentView.indexOf('private func tabAction'),
    );

    expect(sharedHeader).toContain('Button(action: titleAction)');
    expect(picksMasthead).toContain('titleAction: { if !sports.isEmpty { presentLeagueWords() } }');
    expect(picksMasthead).toContain('titleAccessibilityLabel: "Switch league, \\(sport) selected"');
    expect(picksMasthead).not.toContain('.onTapGesture');
    expect(sideTab).toContain('.accessibilityElement(children: .ignore)');
    expect(sideTab).toContain('.accessibilityRemoveTraits(.isSelected)');
    expect(sideTab).toContain('.accessibilityAddTraits(active ? .isSelected : [])');
    expect(centerHub).toContain('.accessibilityRemoveTraits(.isSelected)');
    expect(centerHub).toContain('.accessibilityAddTraits(active ? .isSelected : [])');
  });

  it('treats malformed pick payloads as schema failures instead of empty boards', () => {
    expect(models).toContain('Expected a pick array or a stringified pick array');
    expect(supabaseApi).toContain('let normalized = try normalizeStoredGamePickPayload(data)');
    expect(supabaseApi).toContain('return try JSONDecoder().decode([GaryPick].self, from: normalized)');
    expect(supabaseApi).toContain('Invalid stringified pick payload');
    expect(models).not.toContain('self = .string("[]")');
    expect(models).toContain('var hasValidStoredPayload: Bool');
    expect(supabaseApi).toContain('try validateStoredGamePicks(decoded');
    expect(supabaseApi).toContain('decodePropPickDictionaries(');
    expect(supabaseApi).toContain('element \\(index) must be an object');
    expect(supabaseApi).toContain('is present but picks is null or missing');
    expect(supabaseApi).toContain('allPicks.append(pick)');
    expect(supabaseApi).not.toContain('compactMap { PropPick.from');
  });

  it('shows truthful date-only kickoff copy and reads the canonical board source directly', () => {
    expect(views).toContain('var statusText = g.kickoffTimeLabel');
    expect(supabaseApi).toContain('return await fetchTomorrowBoard(date: date)');
    const todayBoardLoader = supabaseApi.slice(
      supabaseApi.indexOf('static func fetchTodayBoard'),
      supabaseApi.indexOf('/// The night\'s betting recaps'),
    );
    expect(todayBoardLoader).not.toContain('table: "today_board"');
    expect(todayBoardLoader).not.toContain('FALLBACK');
  });

  it('uses last-good slate data only for external transient failures', () => {
    expect(supabaseApi).toContain('let isTransient = code == 429 || (500...599).contains(code)');
    expect(supabaseApi).toContain('let isTransient = isTransientExternalFailure(error)');
    expect(supabaseApi).toContain('rows: isTransient ? cachedDailySlate(date: date) : []');
    expect(views).toContain('if slateResult.succeeded {');
    expect(views).toContain('} else if slateResult.transientExternalFailure {');
    expect(views).toContain('slate = []');
  });

  it('uses one accessible cobalt token for NFL identity surfaces', () => {
    // Founder, Aug 20 (second ruling): per-sport CUE colors stay — cobalt
    // through the one token, applied with restraint (never whole modules).
    expect(designSystem).toContain('static let nflAccent = Color(hex: "#2C7EDB")');
    expect(views).toContain('case .nflTDs: return GaryColors.nflAccent');
    expect(supabaseApi).toContain('case "NFL": return GaryColors.nflAccent');
    expect(views).toContain('case .nfl, .nflTDs: return (Color(hex: "#1F65B3"), Color(hex: "#103D73"))');
  });
});

describe('Gary\'s Number receipt identity', () => {
  it('keeps the selected side visible and labels only pre-kick market phases', () => {
    // The structured receipt renders on the GAME PAGE; the Hub shows it through
    // MLB's own After Gary section and opens the full receipt on tap.
    expect(models).toContain('let pick_label: String?');
    expect(footballIntel).toContain('meta?.pick_label?');
    expect(footballIntel).toContain('"LAST PREGAME"');
    expect(footballIntel).not.toContain('"LAST SEEN"');
    expect(hubView).toContain('HubAfterGarySection(');
  });

  it('requires exact structured provenance and never parses receipt prose', () => {
    expect(footballHub).toContain('static func isRenderableAfterGary(');
    expect(footballHub).toContain('outerGameID == sealedGameID');
    expect(footballHub).toContain('text(meta.published_at_source)?.lowercased() == "pick"');
    expect(footballHub).toContain('publishedAt <= observedAt');
    expect(footballHub).toContain('observedAt < kickoff');
    expect(footballIntel).toContain('FootballProofContract.isRenderableAfterGary($0, exactGameID: exactGameID)');
    const receipt = footballHub.slice(
      footballHub.indexOf('private struct FootballHubReceiptRow'),
      footballHub.indexOf('private struct FootballHubMarketPoint'),
    );
    expect(receipt).not.toContain('components(separatedBy: "→")');
    expect(receipt).not.toContain('signal.value');
  });
});

describe('Billfold canonical NFL metadata', () => {
  // a1a1e5f5 (Aug 20 2026): history reads pick_history_summary — a server-side
  // materialized view that flattens daily_picks + canonical weekly_nfl_picks
  // with NFL dates already ET-derived from commence_time. The old two-source
  // concurrent jsonb projection (which these pins used to assert) died by
  // statement timeout under load and is deleted.
  it('reads the flattened pick_history_summary view, not per-phone jsonb projections', () => {
    expect(supabaseApi).toContain('buildURL(table: "pick_history_summary"');
    expect(supabaseApi).toContain('"game_date,pick,confidence,is_top_pick"');
    expect(supabaseApi).not.toContain('fetchBillfoldMetadataPayload');
    expect(supabaseApi).not.toContain('p\\(index)_commence:picks->\\(index)->>commence_time');
  });

  it('caches under the v3 summary key so stale projection caches never serve', () => {
    expect(supabaseApi).toContain('billfoldPickMetadataV3_');
    expect(supabaseApi).not.toContain('billfoldPickMetadataV2_');
    expect(supabaseApi).toContain('"game_date", value: "gte.\\(dateFilter)"');
  });
});
