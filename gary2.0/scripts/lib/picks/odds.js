/** Sportsbook quote formatting at the pick runner boundary. */
const EXCLUDED_VENDORS = new Set(['kalshi', 'polymarket']);

export function formatOddsForStorage(oddsArray, pick, homeTeam, awayTeam) {
  if (!Array.isArray(oddsArray) || oddsArray.length === 0) return null;
  // Filter out prediction markets (Kalshi, Polymarket) — not real sportsbooks
  oddsArray = oddsArray.filter(row => {
    const vendor = (row.displayName || row.vendor || '').toLowerCase();
    return !EXCLUDED_VENDORS.has(vendor);
  });
  // Determine which side the pick is on (home or away)
  const pickLower = (pick || '').toLowerCase();
  const homeLower = (homeTeam || '').toLowerCase();
  const awayLower = (awayTeam || '').toLowerCase();
  const homeLastWord = homeLower.split(' ').pop();
  const awayLastWord = awayLower.split(' ').pop();
  let isHomePick = homeLastWord && pickLower.includes(homeLastWord);
  // Disambiguate when both teams share a last word (e.g., "Georgia Bulldogs" vs "Mississippi State Bulldogs")
  if (isHomePick && awayLastWord && awayLastWord === homeLastWord) {
    const homeFullMatch = pickLower.includes(homeLower);
    const awayFullMatch = pickLower.includes(awayLower);
    if (awayFullMatch && !homeFullMatch) isHomePick = false;
  }
  return oddsArray.map(row => {
    // BDL returns spread as string ("8.5") — convert to number for consistent storage
    const rawSpread = isHomePick ? row.spread_home : row.spread_away;
    const spreadNum = rawSpread != null ? parseFloat(rawSpread) : NaN;
    // Draw picks: the pick-side "ml" is the draw price, not either team's.
    const isDrawPick = pickLower.startsWith('draw');
    return {
    book: row.displayName || row.vendor || 'Unknown',
    spread: Number.isFinite(spreadNum) ? spreadNum : null,
    spread_odds: isHomePick ? row.spread_home_odds : row.spread_away_odds,
    ml: isDrawPick ? (row.ml_draw ?? null) : (isHomePick ? row.ml_home : row.ml_away),
    // Keep full data for Supabase storage
    spread_home: row.spread_home,
    spread_away: row.spread_away,
    ml_home: row.ml_home,
    ml_away: row.ml_away,
    ...(row.ml_draw != null ? { ml_draw: row.ml_draw } : {}),
    total: row.total,
    total_over_odds: row.total_over_odds,
    total_under_odds: row.total_under_odds,
    ...(row.source ? { source: row.source, source_event_id: row.source_event_id, source_updated_at: row.source_updated_at } : {})
  };
  });
}

export function createPickOdds({ ballDontLieService, console = globalThis.console }) {
  async function fetchSportsbookOdds(sportKey, gameId, homeTeam, awayTeam) {
    if (!gameId) return null;
    try {
      const rows = await ballDontLieService.getOddsV2({ game_ids: [gameId] }, sportKey);
      if (!Array.isArray(rows) || rows.length === 0) return null;
      return rows.map(r => ({
        spread_home: r.spread_home_value ?? null,
        spread_home_odds: r.spread_home_odds ?? null,
        spread_away: r.spread_away_value ?? null,
        spread_away_odds: r.spread_away_odds ?? null,
        ml_home: r.moneyline_home_odds ?? null,
        ml_away: r.moneyline_away_odds ?? null,
        total: r.total_value ?? null,
        total_over_odds: r.total_over_odds ?? null,
        total_under_odds: r.total_under_odds ?? null,
        displayName: r.vendor || 'Unknown',
        vendor: r.vendor || 'Unknown'
      }));
    } catch (err) {
      console.warn(`[Sportsbook Odds] BDL fetch failed for game ${gameId}: ${err.message}`);
      return null;
    }
  }
  return { fetchSportsbookOdds };
}
