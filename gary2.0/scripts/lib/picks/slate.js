/** Exact saved-slate recovery: the game's identity, never its prices. */
const DAILY_SLATE_LEAGUE = {
  americanfootball_nfl: 'NFL',
  americanfootball_ncaaf: 'NCAAF',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  icehockey_nhl: 'NHL',
};

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// The saved slate identifies the game and nothing else (Oct 23 2026 source audit; founder: no fallback that gives
// different data when the original source fails). It copied the morning's moneyline, spread and total into a live game
// missing them, so a pick could price at a number the book no longer offered. A live game keeps only its own prices;
// the slate fills identity fields it lacks, and a missing price stays missing, so the market gate refuses the pick.
const IDENTITY = ['id', 'bdl_game_id', 'sport_key', 'home_team', 'away_team', 'commence_time', 'ncaaf_fbs_verified', 'ncaaf_fbs_verification_source'];
export function mergeExactGameWithSlate(liveGame, slateGame) {
  if (!liveGame) return slateGame;
  if (!slateGame) return liveGame;
  const identity = Object.fromEntries(IDENTITY.filter((k) => liveGame[k] == null && slateGame[k] != null).map((k) => [k, slateGame[k]]));
  return { ...liveGame, ...identity, line_snapshot: liveGame.line_snapshot ?? 'live' };
}

export function createSlateRecovery({ supabase }) {
  async function fetchDailySlateGame(sportKey, etDate, gameId) {
    const league = DAILY_SLATE_LEAGUE[sportKey];
    if (!league || !etDate || gameId == null) return null;

    const { data, error } = await supabase
      .from('daily_slate')
      .select('date,league,bdl_game_id,away_team,home_team,commence_time,spread,ml_away,ml_home,total,line_vendor')
      .eq('date', etDate)
      .eq('league', league)
      .eq('bdl_game_id', String(gameId))
      .limit(1);
    if (error) throw new Error(`daily_slate exact-game read failed: ${error.message}`);
    const row = data?.[0];
    if (!row) return null;

    // Identity only: the saved prices are the morning's, never the live ticket's (see mergeExactGameWithSlate).

    return {
      id: row.bdl_game_id,
      bdl_game_id: row.bdl_game_id,
      sport_key: sportKey,
      home_team: row.home_team,
      away_team: row.away_team,
      commence_time: row.commence_time,
      spread_home: null,
      spread_away: null,
      spread_home_odds: null,
      spread_away_odds: null,
      moneyline_home: null,
      moneyline_away: null,
      total: null,
      line_vendor: null,
      line_snapshot: 'none',
      // dailySlateService writes NCAAF rows only after the provider-grounded
      // FBS policy has accepted both teams. Carry that exact internal provenance
      // into this recovery object; no caller-supplied verified flag is trusted.
      ...(sportKey === 'americanfootball_ncaaf'
        ? { ncaaf_fbs_verified: true, ncaaf_fbs_verification_source: 'daily_slate' }
        : {}),
      bookmakers: [],
    };
  }
  return { fetchDailySlateGame };
}
