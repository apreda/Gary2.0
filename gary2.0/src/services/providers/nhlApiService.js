/**
 * NHL data from the league's own public feeds (founder, Oct 3 2026: NHL game
 * picks at no data cost). No key and no paid plan: BDL's NHL endpoints need a
 * paid tier this account does not carry.
 *
 *   api-web.nhle.com/v1        schedule, scores, standings, rosters, club stats,
 *                              box scores, player game logs, partner odds
 *   api.nhle.com/stats/rest    season team and goalie tables
 *   site.api.espn.com          injuries (the league feed has none)
 *
 * The NHL game id is this lane's provider game id everywhere a BDL id rides
 * for the other sports. Preseason (gameType 1) never reaches a caller.
 */

const WEB = 'https://api-web.nhle.com/v1';
const STATS = 'https://api.nhle.com/stats/rest/en';
const ESPN_INJURIES = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries';

export const NHL_SPORT_KEY = 'icehockey_nhl';
export const NHL_REGULAR_SEASON = 2;
export const NHL_PLAYOFFS = 3;
const COUNTED_GAME_TYPES = new Set([NHL_REGULAR_SEASON, NHL_PLAYOFFS]);

const TTL_LIVE = 60_000;          // scores, odds
const TTL_DAY = 10 * 60_000;      // schedule, standings, injuries, club tables
const TTL_SEASON = 60 * 60_000;   // last season's finished tables
const cache = new Map();
const pending = new Map();

async function getJson(url, { ttl = TTL_DAY, fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  if (pending.has(url)) return pending.get(url);
  const request = (async () => {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetchImpl(url, {
          headers: { 'User-Agent': 'Gary/2.0 (NHL game desk)', Accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
          redirect: 'follow',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        cache.set(url, { at: Date.now(), data });
        return data;
      } catch (error) {
        lastError = error;
        if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 600));
      }
    }
    throw new Error(`NHL feed unavailable (${url.replace(/^https:\/\//, '').split('?')[0]}): ${lastError?.message || lastError}`);
  })();
  pending.set(url, request);
  try { return await request; } finally { pending.delete(url); }
}

export function clearNhlCache() { cache.clear(); }

/** Sportsbooks print these clubs without the league's accents. */
const ascii = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const text = value => ascii(typeof value === 'string' ? value : value?.default ?? '').trim();
export const nhlTeamKey = name => ascii(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** "20262027" for the season a date belongs to (the season turns over in September). */
export function nhlSeasonId(date = new Date()) {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' })
    .format(date).split('-').map(Number);
  const start = month >= 9 ? year : year - 1;
  return `${start}${start + 1}`;
}
export const previousNhlSeasonId = seasonId => `${Number(String(seasonId).slice(0, 4)) - 1}${Number(String(seasonId).slice(0, 4))}`;
export const nhlSeasonLabel = seasonId => `${String(seasonId).slice(0, 4)}-${String(seasonId).slice(6, 8)}`;

const teamFromFeed = team => {
  const place = text(team?.placeName);
  const common = text(team?.commonName) || text(team?.name);
  return {
    id: team?.id ?? null,
    abbrev: team?.abbrev || null,
    name: [place, common].filter(Boolean).join(' ') || common || team?.abbrev || '',
    commonName: common,
    score: Number.isFinite(Number(team?.score)) ? Number(team.score) : null,
    sog: Number.isFinite(Number(team?.sog)) ? Number(team.sog) : null,
    logo: team?.logo || null,
  };
};

const normalizeGame = game => ({
  id: game.id,
  season: game.season,
  gameType: game.gameType,
  gameDate: game.gameDate || null,
  startTimeUTC: game.startTimeUTC,
  // FUT/PRE = not started, LIVE/CRIT = in play, OFF/FINAL = over.
  gameState: game.gameState,
  scheduleState: game.gameScheduleState || 'OK',
  venue: text(game.venue) || null,
  neutralSite: Boolean(game.neutralSite),
  home: teamFromFeed(game.homeTeam),
  away: teamFromFeed(game.awayTeam),
  period: game.periodDescriptor?.number ?? game.period ?? null,
  periodType: game.periodDescriptor?.periodType || null,
  clock: game.clock?.timeRemaining || null,
  inIntermission: Boolean(game.clock?.inIntermission),
  lastPeriodType: game.gameOutcome?.lastPeriodType || null,
});

export const nhlGameIsFinal = game => ['OFF', 'FINAL'].includes(game?.gameState);
export const nhlGameIsLive = game => ['LIVE', 'CRIT'].includes(game?.gameState);
export const nhlGameCounts = game => COUNTED_GAME_TYPES.has(Number(game?.gameType));

/** The league's team table, from the standings feed (current names, abbreviations, logos). */
export async function nhlTeams(options) {
  const rows = await nhlStandings(options);
  return rows.map(row => ({ abbrev: row.abbrev, name: row.team, commonName: row.commonName, logo: row.logo }));
}

/** Resolve a club from its full name, nickname or abbreviation. Exact identities only. */
export async function resolveNhlTeam(name, options) {
  const key = nhlTeamKey(name);
  if (!key) return null;
  const teams = await nhlTeams(options);
  return teams.find(team => nhlTeamKey(team.name) === key)
    || teams.find(team => nhlTeamKey(team.abbrev) === key)
    || teams.find(team => nhlTeamKey(team.commonName) === key)
    || null;
}

/** One league date's games that count (the feed's date is the game's local calendar day). */
export async function nhlScheduleForDate(date, options) {
  const data = await getJson(`${WEB}/schedule/${date}`, { ttl: TTL_DAY, ...options });
  const day = (data.gameWeek || []).find(entry => entry.date === date);
  return (day?.games || []).filter(nhlGameCounts).map(game => ({ ...normalizeGame(game), gameDate: date }));
}

/** Scores and states for one league date. */
export async function nhlScoreboard(date, options) {
  const data = await getJson(`${WEB}/score/${date}`, { ttl: TTL_LIVE, ...options });
  return (data.games || []).filter(nhlGameCounts).map(normalizeGame);
}

const american = value => {
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) >= 100 ? Math.round(number) : null;
};

/**
 * The league's partner board: DraftKings' two-way moneyline (overtime and
 * shootout included), puck line and total for the current odds date.
 * Returns Map(gameId -> { book, moneyline_home, ... , updatedAt }).
 */
export async function nhlPartnerOdds(options) {
  const data = await getJson(`${WEB}/partner-game/US/now`, { ttl: TTL_LIVE, ...options });
  const book = String(data.bettingPartner?.name || '').toLowerCase().replace(/[^a-z]/g, '') || 'draftkings';
  const board = new Map();
  for (const game of data.games || []) {
    const row = { book, updatedAt: data.lastUpdatedUTC || null, oddsDate: data.currentOddsDate || null };
    for (const [side, team] of [['home', game.homeTeam], ['away', game.awayTeam]]) {
      for (const quote of team?.odds || []) {
        const price = american(quote.value);
        if (price === null) continue;
        const qualifier = String(quote.qualifier || '');
        if (quote.description === 'MONEY_LINE_2_WAY') row[`moneyline_${side}`] = price;
        if (quote.description === 'PUCK_LINE' && /^[+-]\d+(\.\d+)?$/.test(qualifier)) {
          row[`spread_${side}`] = Number(qualifier);
          row[`spread_${side}_odds`] = price;
        }
        if (quote.description === 'OVER_UNDER' && /^[OU]\d+(\.\d+)?$/.test(qualifier)) {
          row.total = Number(qualifier.slice(1));
          row[qualifier.startsWith('O') ? 'total_over_odds' : 'total_under_odds'] = price;
        }
      }
    }
    board.set(game.gameId, row);
  }
  return board;
}

const standingsRow = row => ({
  abbrev: text(row.teamAbbrev),
  team: text(row.teamName),
  commonName: text(row.teamCommonName),
  logo: row.teamLogo || null,
  conference: row.conferenceName || null,
  division: row.divisionName || null,
  divisionRank: row.divisionSequence ?? null,
  conferenceRank: row.conferenceSequence ?? null,
  leagueRank: row.leagueSequence ?? null,
  wildcardRank: row.wildcardSequence ?? null,
  gamesPlayed: row.gamesPlayed ?? 0,
  wins: row.wins ?? 0,
  losses: row.losses ?? 0,
  otLosses: row.otLosses ?? 0,
  points: row.points ?? 0,
  pointPct: row.pointPctg ?? null,
  regulationWins: row.regulationWins ?? 0,
  goalsFor: row.goalFor ?? 0,
  goalsAgainst: row.goalAgainst ?? 0,
  goalDiff: row.goalDifferential ?? 0,
  home: { wins: row.homeWins ?? 0, losses: row.homeLosses ?? 0, otLosses: row.homeOtLosses ?? 0 },
  road: { wins: row.roadWins ?? 0, losses: row.roadLosses ?? 0, otLosses: row.roadOtLosses ?? 0 },
  last10: { wins: row.l10Wins ?? 0, losses: row.l10Losses ?? 0, otLosses: row.l10OtLosses ?? 0, games: row.l10GamesPlayed ?? 0 },
  streak: row.streakCode ? `${row.streakCode}${row.streakCount ?? ''}` : null,
  shootoutWins: row.shootoutWins ?? 0,
  shootoutLosses: row.shootoutLosses ?? 0,
});

export async function nhlStandings(options) {
  const data = await getJson(`${WEB}/standings/now`, { ttl: TTL_DAY, ...options });
  return (data.standings || []).map(standingsRow);
}

const seasonQuery = (seasonId, gameType) => `limit=-1&cayenneExp=seasonId=${seasonId}%20and%20gameTypeId=${gameType}`;
const seasonTtl = seasonId => (String(seasonId) === nhlSeasonId() ? TTL_DAY : TTL_SEASON);

/** Season team table keyed by nhlTeamKey(full name): scoring, shots, special teams, faceoffs. */
export async function nhlTeamSummaries(seasonId = nhlSeasonId(), gameType = NHL_REGULAR_SEASON, options) {
  const data = await getJson(`${STATS}/team/summary?${seasonQuery(seasonId, gameType)}`, { ttl: seasonTtl(seasonId), ...options });
  return new Map((data.data || []).map(row => [nhlTeamKey(row.teamFullName), row]));
}

/** Season 5-on-5 shot-attempt share, shooting % and save % keyed by nhlTeamKey(full name). */
export async function nhlTeamPercentages(seasonId = nhlSeasonId(), gameType = NHL_REGULAR_SEASON, options) {
  const data = await getJson(`${STATS}/team/percentages?${seasonQuery(seasonId, gameType)}`, { ttl: seasonTtl(seasonId), ...options });
  return new Map((data.data || []).map(row => [nhlTeamKey(row.teamFullName), row]));
}

/** Season goalie table keyed by player id. */
export async function nhlGoalieSeasons(seasonId = nhlSeasonId(), gameType = NHL_REGULAR_SEASON, options) {
  const data = await getJson(`${STATS}/goalie/summary?${seasonQuery(seasonId, gameType)}`, { ttl: seasonTtl(seasonId), ...options });
  return new Map((data.data || []).map(row => [Number(row.playerId), { ...row, goalieFullName: ascii(row.goalieFullName) }]));
}

/** Season skater table keyed by player id (every club a player skated for that season). */
export async function nhlSkaterSeasons(seasonId = nhlSeasonId(), gameType = NHL_REGULAR_SEASON, options) {
  const data = await getJson(`${STATS}/skater/summary?${seasonQuery(seasonId, gameType)}`, { ttl: seasonTtl(seasonId), timeoutMs: 25_000, ...options });
  return new Map((data.data || []).map(row => [Number(row.playerId), { ...row, skaterFullName: ascii(row.skaterFullName) }]));
}

const playerName = player => [text(player.firstName), text(player.lastName)].filter(Boolean).join(' ') || text(player.name);

/** A club's skaters and goalies for the current season, or for a named finished season. */
export async function nhlClubStats(abbrev, seasonId = null, options) {
  const path = seasonId ? `${seasonId}/${NHL_REGULAR_SEASON}` : 'now';
  const data = await getJson(`${WEB}/club-stats/${abbrev}/${path}`, { ttl: seasonId ? seasonTtl(seasonId) : TTL_DAY, ...options });
  return {
    season: data.season || null,
    gameType: data.gameType || null,
    skaters: (data.skaters || []).map(player => ({ ...player, name: playerName(player) })),
    goalies: (data.goalies || []).map(player => ({ ...player, name: playerName(player) })),
  };
}

/** A club's current roster by position group. */
export async function nhlRoster(abbrev, options) {
  const data = await getJson(`${WEB}/roster/${abbrev}/current`, { ttl: TTL_DAY, ...options });
  const group = list => (list || []).map(player => ({ id: player.id, name: playerName(player),
    position: player.positionCode, number: player.sweaterNumber ?? null, shoots: player.shootsCatches || null }));
  return { forwards: group(data.forwards), defensemen: group(data.defensemen), goalies: group(data.goalies) };
}

/** A club's season schedule (games that count), oldest first, with scores for finished games. */
export async function nhlClubSchedule(abbrev, seasonId = null, options) {
  const data = await getJson(`${WEB}/club-schedule-season/${abbrev}/${seasonId || 'now'}`, { ttl: seasonId ? seasonTtl(seasonId) : TTL_DAY, ...options });
  return (data.games || []).filter(nhlGameCounts).map(game => ({
    ...normalizeGame(game),
    gameDate: game.gameDate,
    winningGoalie: game.winningGoalie
      ? `${text(game.winningGoalie.firstInitial)} ${text(game.winningGoalie.lastName)}`.trim() : null,
  })).sort((a, b) => String(a.startTimeUTC).localeCompare(String(b.startTimeUTC)));
}

/** One game's box score: team lines and each skater's and goalie's game. */
export async function nhlBoxscore(gameId, options) {
  const data = await getJson(`${WEB}/gamecenter/${gameId}/boxscore`, { ttl: TTL_DAY, ...options });
  const side = (team, stats) => ({
    ...teamFromFeed(team),
    goalies: (stats?.goalies || []).map(goalie => ({
      id: goalie.playerId, name: text(goalie.name), starter: Boolean(goalie.starter), decision: goalie.decision || null,
      shotsAgainst: goalie.shotsAgainst ?? null, saves: goalie.saves ?? null, goalsAgainst: goalie.goalsAgainst ?? null,
      savePct: goalie.savePctg ?? null, toi: goalie.toi || null,
    })),
    skaters: [...(stats?.forwards || []), ...(stats?.defense || [])].map(skater => ({
      id: skater.playerId, name: text(skater.name), position: skater.position, goals: skater.goals ?? 0,
      assists: skater.assists ?? 0, points: skater.points ?? 0, shots: skater.sog ?? 0, toi: skater.toi || null,
    })),
  });
  return {
    ...normalizeGame(data),
    home: side(data.homeTeam, data.playerByGameStats?.homeTeam),
    away: side(data.awayTeam, data.playerByGameStats?.awayTeam),
  };
}

/** A player's game log for a season (a goalie's rows carry starts, decisions and shots faced). */
export async function nhlPlayerGameLog(playerId, seasonId = nhlSeasonId(), gameType = NHL_REGULAR_SEASON, options) {
  const data = await getJson(`${WEB}/player/${playerId}/game-log/${seasonId}/${gameType}`, { ttl: seasonTtl(seasonId), ...options });
  return data.gameLog || [];
}

/**
 * ESPN's injury list keyed by nhlTeamKey(team). Each row keeps the reported
 * status, the body part when given, and the date ESPN last updated it.
 */
export async function nhlInjuries(options) {
  const data = await getJson(ESPN_INJURIES, { ttl: TTL_DAY, ...options });
  const board = new Map();
  for (const team of data.injuries || []) {
    board.set(nhlTeamKey(team.displayName), (team.injuries || []).map(row => ({
      player: row.athlete?.displayName || null,
      position: row.athlete?.position?.abbreviation || null,
      status: row.status || row.type?.description || null,
      detail: row.details?.type || null,
      returnDate: row.details?.returnDate || null,
      updatedAt: row.date || null,
      // ESPN fills this with a roster code ("ir", "ir-nr") when it has no note.
      comment: /\s/.test(row.shortComment || '') && row.shortComment.length > 20 ? ascii(row.shortComment) : null,
    })).filter(row => row.player));
  }
  return board;
}

/**
 * Games for one date in the pick engine's market shape: the league schedule
 * with the partner book's named two-sided markets attached.
 */
export async function nhlGamesWithOdds(date, options) {
  const games = await nhlScheduleForDate(date, options);
  if (!games.length) return [];
  let board = new Map();
  try { board = await nhlPartnerOdds(options); }
  catch (error) { console.warn(`[NHL] Partner odds unavailable: ${error.message}`); }
  return games.filter(game => !['PPD', 'CNCL'].includes(game.scheduleState)).map(game => {
    const quote = board.get(game.id);
    const markets = [];
    if (quote) {
      const pair = (a, b) => a !== undefined && b !== undefined;
      if (pair(quote.moneyline_home, quote.moneyline_away)) {
        markets.push({ key: 'h2h', last_update: quote.updatedAt, outcomes: [
          { name: game.home.name, price: quote.moneyline_home },
          { name: game.away.name, price: quote.moneyline_away }] });
      }
      if (pair(quote.spread_home, quote.spread_away) && pair(quote.spread_home_odds, quote.spread_away_odds)
        && Math.abs(quote.spread_home + quote.spread_away) < 0.001) {
        markets.push({ key: 'spreads', last_update: quote.updatedAt, outcomes: [
          { name: game.home.name, point: quote.spread_home, price: quote.spread_home_odds },
          { name: game.away.name, point: quote.spread_away, price: quote.spread_away_odds }] });
      }
      if (quote.total !== undefined && pair(quote.total_over_odds, quote.total_under_odds)) {
        markets.push({ key: 'totals', last_update: quote.updatedAt, outcomes: [
          { name: 'Over', point: quote.total, price: quote.total_over_odds },
          { name: 'Under', point: quote.total, price: quote.total_under_odds }] });
      }
    }
    return {
      id: game.id,
      bdl_game_id: game.id,
      sport_key: NHL_SPORT_KEY,
      home_team: game.home.name,
      away_team: game.away.name,
      home_abbrev: game.home.abbrev,
      away_abbrev: game.away.abbrev,
      commence_time: game.startTimeUTC,
      scheduled_date: date,
      status: game.gameState,
      venue: game.venue,
      isNeutralSite: game.neutralSite,
      postseason: game.gameType === NHL_PLAYOFFS,
      bookmakers: markets.length ? [{ key: quote.book, title: quote.book, last_update: quote.updatedAt, source: 'nhl_partner', markets }] : [],
    };
  });
}

export const nhlApiService = {
  teams: nhlTeams, resolveTeam: resolveNhlTeam, scheduleForDate: nhlScheduleForDate, scoreboard: nhlScoreboard,
  partnerOdds: nhlPartnerOdds, standings: nhlStandings, teamSummaries: nhlTeamSummaries,
  teamPercentages: nhlTeamPercentages, goalieSeasons: nhlGoalieSeasons, skaterSeasons: nhlSkaterSeasons, clubStats: nhlClubStats, roster: nhlRoster,
  clubSchedule: nhlClubSchedule, boxscore: nhlBoxscore, playerGameLog: nhlPlayerGameLog, injuries: nhlInjuries,
  gamesWithOdds: nhlGamesWithOdds, clearCache: clearNhlCache,
};
