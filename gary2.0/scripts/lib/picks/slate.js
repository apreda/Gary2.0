/** Exact saved-slate recovery; live quoted fields retain precedence. */
const DAILY_SLATE_LEAGUE = {
  americanfootball_nfl: 'NFL',
  americanfootball_ncaaf: 'NCAAF',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
};

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function mergeExactGameWithSlate(liveGame, slateGame) {
  if (!liveGame) return slateGame;
  if (!slateGame) return liveGame;
  if (liveGame.market_source === 'the_odds_api') {
    return { ...slateGame, ...liveGame, line_snapshot: 'live' };
  }
  const liveHasMl = finiteNumber(liveGame.moneyline_home) !== null && finiteNumber(liveGame.moneyline_away) !== null;
  const liveHasPricedSpread = finiteNumber(liveGame.spread_home) !== null &&
    (finiteNumber(liveGame.spread_home_odds) !== null || finiteNumber(liveGame.spread_away_odds) !== null);
  const liveHasBook = Array.isArray(liveGame.bookmakers) && liveGame.bookmakers.some(book => Array.isArray(book?.markets) && book.markets.length > 0);
  return {
    ...slateGame,
    ...liveGame,
    moneyline_home: liveHasMl ? liveGame.moneyline_home : slateGame.moneyline_home,
    moneyline_away: liveHasMl ? liveGame.moneyline_away : slateGame.moneyline_away,
    spread_home: liveHasPricedSpread ? liveGame.spread_home : slateGame.spread_home,
    spread_away: liveHasPricedSpread ? liveGame.spread_away : slateGame.spread_away,
    spread_home_odds: liveHasPricedSpread ? liveGame.spread_home_odds : null,
    spread_away_odds: liveHasPricedSpread ? liveGame.spread_away_odds : null,
    total: finiteNumber(liveGame.total) !== null ? liveGame.total : slateGame.total,
    line_vendor: liveHasMl || liveHasPricedSpread ? (liveGame.line_vendor ?? slateGame.line_vendor) : slateGame.line_vendor,
    line_snapshot: liveHasMl || liveHasPricedSpread ? (liveGame.line_snapshot ?? 'live') : 'opening',
    bookmakers: liveHasBook ? liveGame.bookmakers : slateGame.bookmakers,
  };
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

    const spreadHome = finiteNumber(row.spread);
    const mlHome = finiteNumber(row.ml_home);
    const mlAway = finiteNumber(row.ml_away);
    const total = finiteNumber(row.total);
    const vendor = row.line_vendor || 'opening-snapshot';
    const markets = [];
    if (mlHome !== null && mlAway !== null) {
      markets.push({
        key: 'h2h',
        outcomes: [
          { name: row.home_team, price: mlHome },
          { name: row.away_team, price: mlAway },
        ],
      });
    }

    return {
      id: row.bdl_game_id,
      bdl_game_id: row.bdl_game_id,
      sport_key: sportKey,
      home_team: row.home_team,
      away_team: row.away_team,
      commence_time: row.commence_time,
      spread_home: spreadHome,
      spread_away: spreadHome === null ? null : -spreadHome,
      spread_home_odds: null,
      spread_away_odds: null,
      moneyline_home: mlHome,
      moneyline_away: mlAway,
      total,
      line_vendor: vendor,
      line_snapshot: 'opening',
      // dailySlateService writes NCAAF rows only after the provider-grounded
      // FBS policy has accepted both teams. Carry that exact internal provenance
      // into this recovery object; no caller-supplied verified flag is trusted.
      ...(sportKey === 'americanfootball_ncaaf'
        ? { ncaaf_fbs_verified: true, ncaaf_fbs_verification_source: 'daily_slate' }
        : {}),
      bookmakers: markets.length ? [{ key: vendor, title: vendor, markets }] : [],
    };
  }
  return { fetchDailySlateGame };
}
