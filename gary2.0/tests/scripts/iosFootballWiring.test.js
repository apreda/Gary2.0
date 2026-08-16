import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const models = readFileSync(new URL('../../../ios/GaryApp/Models.swift', import.meta.url), 'utf8');
const views = readFileSync(new URL('../../../ios/GaryApp/Views.swift', import.meta.url), 'utf8');
const supabaseApi = readFileSync(new URL('../../../ios/GaryApp/SupabaseAPI.swift', import.meta.url), 'utf8');
const footballIntel = readFileSync(new URL('../../../ios/GaryApp/FootballGameIntelView.swift', import.meta.url), 'utf8');
const footballHub = readFileSync(new URL('../../../ios/GaryApp/FootballHubPage.swift', import.meta.url), 'utf8');
const hubView = readFileSync(new URL('../../../ios/GaryApp/HubView.swift', import.meta.url), 'utf8');
const designSystem = readFileSync(new URL('../../../ios/GaryApp/DesignSystem.swift', import.meta.url), 'utf8');
const contentView = readFileSync(new URL('../../../ios/GaryApp/ContentView.swift', import.meta.url), 'utf8');

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
    expect(supabaseApi).toContain('throw SourceReadFailure(');
    expect(supabaseApi).toContain('sourceErrors.allSatisfy(isTransientExternalFailure)');
  });

  it('keeps Winners shelves isolated when one sport source fails', () => {
    expect(views).toContain('private func fetchIsolatedGamePickSources(');
    expect(views).toContain('async let dailyTask = SupabaseAPI.fetchDailyPicks(date: date)');
    expect(views).toContain('async let nflTask = SupabaseAPI.fetchWeeklyNFLPicks(for: date)');
    expect(views).toContain('snapshot.transientExternalFailures.contains(.daily) && league != "NFL"');
    expect(views).toContain('snapshot.transientExternalFailures.contains(.nfl) && league == "NFL"');
    expect(views).toContain('snapshot.transientExternalFailures.contains(.ncaabFuture) && league == "NCAAB"');
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
  it('uses one canonical tabbed panel and changes only the selected sport accent', () => {
    const homeSheet = views.slice(
      views.indexOf('@ViewBuilder private var homeSheet'),
      views.indexOf('// MARK: Tonight extras'),
    );
    const rowBody = views.slice(
      views.indexOf('struct HomeSheetRowView: View'),
      views.indexOf('/// THE WINNERS STUB'),
    );

    expect(homeSheet).toContain('ForEach(HomeBoardLeague.allCases');
    expect(homeSheet).toContain('homeSheetPanel(rows.filter { $0.league == selected.rawValue }');
    expect(homeSheet).toContain('.stroke(selected.sport.accentColor.opacity(0.85), lineWidth: 1)');
    expect(homeSheet.match(/homeSheetPanel\(/g)).toHaveLength(2); // declaration + one render
    expect(homeSheet).not.toContain('ForEach(leagues');
    expect(rowBody).not.toContain('row.league ==');
    expect(views).toContain('if verb == "homeboard", let league = HomeBoardLeague(rawValue: arg.uppercased())');
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
    expect(views).toMatch(/\.onChange\(of: sport\)[\s\S]{0,220}?consumeFocus\(\)/);
    expect(views).toMatch(/\.onChange\(of: dataSignature\)[\s\S]{0,220}?consumeFocus\(\)/);
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
    expect(designSystem).toContain('static let nflAccent = Color(hex: "#2C7EDB")');
    expect(views).toContain('case .nflTDs: return GaryColors.nflAccent');
    expect(supabaseApi).toContain('case "NFL": return GaryColors.nflAccent');
    expect(views).toContain('case .nfl, .nflTDs: return (Color(hex: "#1F65B3"), Color(hex: "#103D73"))');
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
