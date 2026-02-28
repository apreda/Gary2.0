/**
 * Compute recommended sportsbook vendor for a pick using normalized bookmakers data.
 * bookmakers shape:
 * [
 *   { key: 'fanduel', title: 'Fanduel', markets: [
 *       { key: 'h2h', outcomes: [{ name: 'Home Team', price: -120 }, { name: 'Away Team', price: +100 }] },
 *       { key: 'spreads', outcomes: [{ name: 'Home Team', price: -110, point: -3.5 }, ...] }
 *   ] }
 * ]
 */
export function computeRecommendedSportsbook({ pickType, pickStr, homeTeam, awayTeam, bookmakers }) {
  try {
    if (!Array.isArray(bookmakers) || bookmakers.length === 0) return null;
    const type = String(pickType || '').toLowerCase();
    const pick = String(pickStr || '');
    const home = String(homeTeam || '').toLowerCase();
    const away = String(awayTeam || '').toLowerCase();
    const lower = pick.toLowerCase();
    const side =
      lower.includes(home) ? 'home' :
      lower.includes(away) ? 'away' :
      /\b(draw|tie|x)\b/i.test(pick) ? 'draw' :
      null;
    if (!side) return null;

    // Helper: find market by key across bookmakers
    const gatherMarket = (key) => {
      const entries = [];
      for (const b of bookmakers) {
        const m = (b?.markets || []).find(mk => mk?.key === key);
        if (!m || !Array.isArray(m.outcomes)) continue;
        const out = m.outcomes.find(o => {
          const n = String(o?.name || '').toLowerCase();
          if (side === 'home') return n.includes(home);
          if (side === 'away') return n.includes(away);
          if (side === 'draw') return n === 'draw' || n === 'tie' || n === 'x';
          return false;
        });
        if (out && typeof out.price === 'number') {
          entries.push({
            vendor: b.title || b.key || 'unknown',
            odds: out.price,
            line: typeof out.point !== 'undefined' ? out.point : null
          });
        }
      }
      return entries;
    };

    if (type === 'moneyline') {
      const ml = gatherMarket('h2h');
      if (!ml.length) return null;
      // For American odds, maximize the numeric value (greater is always better for the bettor)
      const best = ml.reduce((a, c) => (a == null || c.odds > a.odds ? c : a), null);
      return best ? { vendor: best.vendor, odds: best.odds } : null;
    }

    if (type === 'spread') {
      // Parse target line from pick string (first numeric with +/-)
      const match = pick.match(/([+-]?\d+(\.\d+)?)/);
      const target = match ? parseFloat(match[1]) : null;
      const sp = gatherMarket('spreads');
      if (!sp.length) return null;
      const exact = sp.filter(e => target == null ? true : Math.abs((e.line ?? NaN) - target) < 0.01);
      const candidates = exact.length ? exact : sp;
      const best = candidates.reduce((a, c) => (a == null || c.odds > a.odds ? c : a), null);
      return best ? { vendor: best.vendor, odds: best.odds, line: best.line } : null;
    }

    return null;
  } catch (e) {
    console.warn('computeRecommendedSportsbook error:', e?.message || e);
    return null;
  }
}


