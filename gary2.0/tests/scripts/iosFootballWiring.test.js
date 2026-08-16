import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const models = readFileSync(new URL('../../../ios/GaryApp/Models.swift', import.meta.url), 'utf8');
const views = readFileSync(new URL('../../../ios/GaryApp/Views.swift', import.meta.url), 'utf8');
const supabaseApi = readFileSync(new URL('../../../ios/GaryApp/SupabaseAPI.swift', import.meta.url), 'utf8');
const footballIntel = readFileSync(new URL('../../../ios/GaryApp/FootballGameIntelView.swift', import.meta.url), 'utf8');

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
    expect(views).toContain('LiveScoreCache.shared.status(forGameId: gameId)');
    expect(views).toContain('$0.bdl_game_id == gameId && ($0.league ?? "").uppercased() == league');
    expect(views).toContain('?? (lg == "NCAAF"');
    expect(views).toContain('? g.matchup.uppercased()');
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
    expect(views).toContain('.filter { !Self.fantasyOnlyKinds.contains($0.kind) }');
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
    expect(footballIntel).toContain('"push", "final_held"');
    expect(footballIntel).toContain('let decided = signals.count - pushes');
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
    expect(footballIntel).toContain('let injuryLimit = 4');
    expect(footballIntel).toContain('index < away.count ? away[index] : nil');
    expect(footballIntel).toContain('index < home.count ? home[index] : nil');
    expect(footballIntel).toContain('return Array(output.prefix(6))');
  });
});

describe('Football Fantasy density', () => {
  it('lets the selected league and lane title speak for themselves', () => {
    expect(footballIntel).toContain('+ Text("FOOTBALL").foregroundColor(accent)');
    const rowBody = footballIntel.slice(
      footballIntel.indexOf('private struct FootballFantasyRow'),
    );
    expect(rowBody).not.toContain('Text(signal.kind.chip)');
    expect(rowBody).not.toContain('Text(signal.headline)');
    expect(rowBody).not.toContain('Text(signal.detail)');
    expect(rowBody).toContain('Text(playerTitle)');
    expect(rowBody).toContain('Text(position.uppercased())');
  });

  it('keeps roster-verified prior-season provenance visible in dense NFL and NCAAF rows', () => {
    expect(footballIntel).toContain('before.lowercased().hasSuffix("baseline")');
    expect(footballIntel).toContain('after.range(of: " logged ", options: [.caseInsensitive])');
    expect(footballIntel).toContain('headline.range(of: #"\\b(?:19|20)\\d{2}\\b"#, options: [.regularExpression])');
    expect(footballIntel).toContain('return "\\(headline[year]) BASELINE"');
    expect(footballIntel).toContain('return "PRIOR BASELINE"');
    expect(footballIntel).toContain('if let baselineLabel');
    expect(footballIntel).toContain('Text(baselineLabel)');
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
