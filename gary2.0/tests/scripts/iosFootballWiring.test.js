import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const models = readFileSync(new URL('../../../ios/GaryApp/Models.swift', import.meta.url), 'utf8');
const views = readFileSync(new URL('../../../ios/GaryApp/Views.swift', import.meta.url), 'utf8');
const supabaseApi = readFileSync(new URL('../../../ios/GaryApp/SupabaseAPI.swift', import.meta.url), 'utf8');
const footballIntel = readFileSync(new URL('../../../ios/GaryApp/FootballGameIntelView.swift', import.meta.url), 'utf8');
const footballHub = readFileSync(new URL('../../../ios/GaryApp/FootballHubPage.swift', import.meta.url), 'utf8');
const hubView = readFileSync(new URL('../../../ios/GaryApp/HubView.swift', import.meta.url), 'utf8');

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
    expect(views).toContain('liveCache.status(forGameId: gameId)');
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
    expect(footballIntel).toContain('"held", "missed", "failed", "push"');
    expect(footballIntel).toContain('"final_held", "final_missed", "final_flipped", "final_push"');
    expect(footballIntel).toContain('$0 == "push" || $0 == "final_push"');
    expect(footballIntel).toContain('if pushes > 0 { parts.append("\\(pushes) PUSH") }');
    expect(footballIntel).toContain('case "push", "final_push": return "PUSH"');
  });

  it('shows the concise product headline before the backend identity token', () => {
    expect(footballIntel).toContain('if !headline.isEmpty { return headline.uppercased() }');
    expect(footballIntel.indexOf('if !headline.isEmpty')).toBeLessThan(
      footballIntel.indexOf('signal.sweat?.factor_code'),
    );
  });
});

describe('Football Field density', () => {
  it('balances the two teams and caps the visible personnel board', () => {
    expect(footballIntel).toContain('while output.count < 4');
    expect(footballIntel).toContain('index < away.count ? away[index] : nil');
    expect(footballIntel).toContain('index < home.count ? home[index] : nil');
    expect(footballIntel).toContain('if output.count == 4 { break }');
    expect(footballIntel).not.toContain('SKILL PERSONNEL');
  });
});

describe('Football Fantasy density', () => {
  it('lets the selected league and lane title speak for themselves', () => {
    expect(footballIntel).not.toContain('Text(isNFL ? "NFL FANTASY" : "COLLEGE PLAYER BOARD")');
    const rowBody = footballIntel.slice(
      footballIntel.indexOf('private struct FootballFantasyRow'),
    );
    expect(rowBody).not.toContain('Text(signal.kind.chip)');
    expect(rowBody).not.toContain('Text(signal.headline)');
    expect(rowBody).not.toContain('Text(signal.detail)');
    expect(rowBody).toContain('Text(FootballFantasyEvidence.playerTitle(for: signal))');
    expect(rowBody).toContain('Text(position.uppercased())');
  });

  it('keeps roster-verified prior-season provenance visible in dense NFL and NCAAF rows', () => {
    expect(footballIntel).toContain('before.lowercased().hasSuffix("baseline")');
    expect(footballIntel).toContain('after.range(of: " logged ", options: [.caseInsensitive])');
    expect(footballIntel).toContain('headline.range(of: #"\\b(?:19|20)\\d{2}\\b"#, options: [.regularExpression])');
    expect(footballIntel).toContain('return "\\(headline[year]) BASELINE"');
    expect(footballIntel).toContain('return "PRIOR BASELINE"');
    expect(footballIntel).toContain('if let baseline = FootballFantasyEvidence.baselineLabel(for: signal)');
    expect(footballIntel).toContain('Text(baseline)');
  });

  it('opens grounded football evidence instead of the MLB-only player-card placeholder', () => {
    expect(hubView).toContain('(sel == .nfl || sel == .ncaaf), Self.fantasyKinds.contains(s.kind)');
    expect(hubView).toMatch(/Self\.fantasyKinds\.contains\(s\.kind\)[\s\S]*?selectedSignal = s[\s\S]*?else if s\.playerId != nil \{ breakdownSignal = s \}/);
  });
});

describe('Football Picks overview', () => {
  it('uses a scan-first football board instead of the baseball edge carousel', () => {
    expect(views).toContain('FootballPicksBoard(league: scopeLeague, signals: edges)');
    expect(views).toMatch(/scopeLeague == "NFL" \|\| scopeLeague == "NCAAF"/);
    expect(footballIntel).toContain('struct FootballPicksBoard: View');
    expect(footballIntel).toContain('title: isCollege ? "Saturday Board" : "Slate Read"');
    expect(footballIntel).toContain('let gameKey = signal.gameId ?? normalized(signal.game)');
  });

  it('turns an NCAAF dark day into a grounded next-slate preview', () => {
    expect(views).toContain('case "next_slate", "next slate": return .nextSlate');
    expect(views).toContain('nextSlate: kd == .nextSlate ? meta : nil');
    expect(views).toContain('FootballNextSlatePreview(signal: nextSlateSignal');
    expect(footballIntel).toContain('struct FootballNextSlatePreview: View');
    expect(footballIntel).toContain('isNFL ? nil : signals.first { $0.kind == .nextSlate }');
    expect(footballIntel).toContain('visibleSignals.isEmpty, let nextSlate');
    expect(footballIntel).toContain('return "KICKOFF TIMES TBD"');
    expect(footballIntel).not.toContain('3:00 PM');
  });

  it('uses next-slate only as the no-current-slate Hub state', () => {
    expect(footballHub).toContain('if slateRows.isEmpty, let nextSlate');
    expect(footballHub).toContain('if !hasIntel && !(slateRows.isEmpty && nextSlate != nil)');
  });

  it('merges stale date-only and confirmed rows by exact provider game id', () => {
    expect(views).toContain('func providerIdentity(league: String?, gameId: Int?)');
    expect(views).toContain('providerKey.flatMap { providerIndex[$0] }');
    expect(views).toContain('providerIdentity(league: lg, gameId: s.bdl_game_id)');
    expect(views).toContain('return candidateIds.count == 1 ? candidateIds.first : nil');
  });

  it('observes the shared live cache so the matchup rail updates with its cards', () => {
    expect(views).toContain('@ObservedObject private var liveCache = LiveScoreCache.shared');
    expect(views).toContain('let ls = liveCache.status(forGameId: id)');
    expect(views).toContain('let live = liveCache.scores.contains');
  });

  it('preserves each healthy pick desk and labels source failures as unavailable', () => {
    expect(views).toContain('@Published var gamePickSourceFailures: Set<String> = []');
    expect(views).toContain('@Published var propPickSourceFailed = false');
    expect(views).toContain('let sourceFailures = Set(todaySnapshot.failures.map(\\.failureKey))');
    expect(views).toContain('let mergedToday = mergeGamePickSnapshot(');
    expect(views).toContain('Text("BOARD DATA UNAVAILABLE · PULL TO RETRY")');
    expect(supabaseApi).toContain('"One or more pick sources failed"');
    expect(supabaseApi).toContain('guard failures == 0 else');
  });

  it('keeps Winners shelves isolated when one sport source fails', () => {
    expect(views).toContain('private func fetchIsolatedGamePickSources(');
    expect(views).toContain('async let dailyTask = SupabaseAPI.fetchDailyPicks(date: date)');
    expect(views).toContain('async let nflTask = SupabaseAPI.fetchWeeklyNFLPicks(for: date)');
    expect(views).toContain('snapshot.failures.contains(.daily) && league != "NFL"');
    expect(views).toContain('snapshot.failures.contains(.nfl) && league == "NFL"');
    expect(views).toContain('snapshot.failures.contains(.ncaabFuture) && league == "NCAAB"');
    expect(views).toContain('retaining: previousGameShelves.filter { !$0.settled }.flatMap(\\.picks)');
    expect(views).toContain('retaining: previousGameShelves.filter(\\.settled).flatMap(\\.picks)');
    expect(views).toContain('todayProps = previousPropShelves.filter { !$0.settled }.flatMap(\\.props)');
    expect(views).toContain('yProps = previousPropShelves.filter(\\.settled).flatMap(\\.props)');
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

describe('Gary\'s Number receipt identity', () => {
  it('keeps the selected side visible and labels only pre-kick market phases', () => {
    expect(footballHub).toContain('private var selection: String?');
    expect(models).toContain('let pick_label: String?');
    expect(footballHub).toContain('signal.afterGary?.pick_label?');
    expect(footballHub).toContain('if movement != nil, let selection');
    expect(footballHub).toContain('Text(selection)');
    expect(footballHub).toContain('"LAST PREGAME"');
    expect(footballIntel).toContain('"LAST PREGAME"');
    expect(footballHub).not.toContain('"LAST SEEN"');
  });
});

describe('Billfold canonical NFL metadata', () => {
  it('loads the narrow daily and weekly projections concurrently', () => {
    expect(supabaseApi).toContain('buildURL(table: "weekly_nfl_picks"');
    expect(supabaseApi).toContain('p\\(index)_commence:picks->\\(index)->>commence_time');
    expect(supabaseApi).toContain('async let dailyPayload = fetchBillfoldMetadataPayload');
    expect(supabaseApi).toContain('async let nflPayload = fetchBillfoldMetadataPayload');
  });

  it('uses each NFL game date and excludes legacy daily NFL copies', () => {
    expect(supabaseApi).toContain('let nflSince = getNFLWeekStart(for: dateFilter) ?? dateFilter');
    expect(supabaseApi).toContain('.flatMap { easternCalendarDate(ofISO8601: $0) }');
    expect(supabaseApi).toContain('(row["p\\(index)_league"] as? String)?.uppercased() == "NFL"');
    expect(supabaseApi).toContain('billfoldPickMetadataV2_');
  });
});
