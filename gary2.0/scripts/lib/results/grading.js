/** Pure settlement measurements and Eastern game-date interpretation. */
import { gradeGameMarket } from '../../../supabase/functions/_shared/gameSettlement.js';
import { pickSide } from '../../../src/services/teamMatch.js';
import { findNflSettlementPlayer, nflActualFromStatRow } from '../resultsGradingReliability.js';
import { findExactNcaafStatRow, ncaafActualFromStatRow } from '../../../src/services/ncaafPropStats.js';
import { findMlbSettlementPlayer, mlbPropActual } from '../../../supabase/functions/_shared/mlbPropSettlement.js';

function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

export function normalizeToETDate(matchedGame) {
  // BDL surfaces game timing under several field names depending on sport:
  //   NBA  → `datetime` or `status` (ISO datetime)
  //   NHL  → `start_time_utc`
  //   MLB  → `date` is often a full ISO datetime string ("2026-05-29T00:05:00.000Z")
  //   Some endpoints  → `commence_time`
  // Try every plausible field, convert through ET. Only fall back to
  // matchedGame.date as a literal string if it's already a YYYY-MM-DD form.
  const candidates = [
    matchedGame.datetime,
    matchedGame.start_time_utc,
    matchedGame.commence_time,
    matchedGame.date,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
      // Already a plain date — trust it
      return candidate;
    }
    const date = new Date(candidate);
    if (!isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    }
  }
  return null;
}

export function gradeGame(pickText, homeTeam, awayTeam, hScore, vScore) {
  return gradeGameMarket(pickText, pickSide(pickText, homeTeam, awayTeam), hScore, vScore);
}

export function getStatValue(sport, data, name, type, playerId = null, meta = {}) {
  const target = normalizeName(name), t = type.toLowerCase();
  if (!data || data.length === 0) return null;

  // Normalize with accent stripping for fuzzy matching (e.g., "Pérez" → "perez")
  const targetFuzzy = target.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const targetLast = target.split(' ').pop();

  function nameMatches(firstName, lastName) {
    const full = normalizeName(`${firstName} ${lastName}`);
    if (full === target) return true;
    // Fuzzy: strip accents
    const fuzzy = full.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (fuzzy === targetFuzzy) return true;
    // Last name + first initial (handles "V. Guerrero Jr." vs "Vladimir
    // Guerrero Jr."). Jul 30: the code matched on SURNAME ALONE — two
    // same-surname players in one game's stat pull graded the prop on
    // whichever appeared first (the attribution-swap class). The initial
    // is now required whenever both sides carry one.
    const last = normalizeName(lastName);
    if (last === targetLast && last.length > 3) {
      const fi = normalizeName(firstName).charAt(0);
      const ti = target.charAt(0);
      return !fi || !ti || fi === ti;
    }
    return false;
  }

  // Helper: find player across nested game structures (NBA/MLB style) or flat arrays (NHL/NFL style)
  function findPlayerInGames(games) {
    for (const g of games) {
      const players = [...(g.home_team?.players || []), ...(g.visitor_team?.players || []), ...(g.away_team?.players || [])];
      const p = players.find(ps => nameMatches(ps.player?.first_name || '', ps.player?.last_name || ''));
      if (p) return p;
    }
    return null;
  }
  function findPlayerFlat(arr) {
    return arr.find(s => nameMatches(s.player?.first_name || '', s.player?.last_name || '')) || null;
  }

  if (sport === 'NBA') {
    const p = findPlayerInGames(data);
    if (p) {
      if (t.includes('point') && !t.includes('rebound') && !t.includes('assist')) return p.pts ?? p.points ?? 0;
      if (t.includes('rebound') && !t.includes('point') && !t.includes('assist')) return p.reb ?? p.rebounds ?? 0;
      if (t.includes('assist') && !t.includes('point') && !t.includes('rebound')) return p.ast ?? p.assists ?? 0;
      if (t.includes('three') || t.includes('3pt') || t.includes('threes')) return p.fg3m ?? 0;
      if (t.includes('steal')) return p.stl ?? p.steals ?? 0;
      if (t.includes('block')) return p.blk ?? p.blocks ?? 0;
      if (t.includes('turnover')) return p.turnover ?? p.tov ?? 0;
      // Combo props — must check AFTER individual props
      if (t.includes('points_rebounds_assists') || t.includes('pra') || (t.includes('point') && t.includes('rebound') && t.includes('assist'))) return (p.pts || 0) + (p.reb || 0) + (p.ast || 0);
      if (t.includes('points_rebounds') || (t.includes('point') && t.includes('rebound'))) return (p.pts || 0) + (p.reb || 0);
      if (t.includes('points_assists') || (t.includes('point') && t.includes('assist'))) return (p.pts || 0) + (p.ast || 0);
      if (t.includes('rebounds_assists') || (t.includes('rebound') && t.includes('assist'))) return (p.reb || 0) + (p.ast || 0);
      console.warn(`    [Stat] NBA: Found ${name} but no match for prop type "${type}"`);
    }
  } else if (sport === 'NHL') {
    // Try nested game format first, then flat
    const p = findPlayerInGames(data) || findPlayerFlat(data);
    if (p) {
      if (t.includes('goal') && !t.includes('shot')) return p.goals ?? 0;
      if (t.includes('assist')) return p.assists ?? 0;
      if (t.includes('point')) return (p.goals || 0) + (p.assists || 0);
      if (t.includes('shot') || t.includes('sog')) return p.shots_on_goal ?? p.shots ?? 0;
      if (t.includes('save')) return p.saves ?? 0;
      if (t.includes('block')) return p.blocked_shots ?? p.blocks ?? 0;
      console.warn(`    [Stat] NHL: Found ${name} but no match for prop type "${type}"`);
    }
  } else if (sport === 'NFL') {
    const lookup = findNflSettlementPlayer(data, { playerId, name });
    // Ambiguous identities are unavailable, never proof that a player was
    // absent. A stored id cannot silently fall back to a different namesake.
    meta.playerFound = lookup.status !== 'missing';
    if (lookup.row) {
      meta.playerId = lookup.row.player?.id ?? lookup.row.player_id;
      return nflActualFromStatRow(lookup.row, type, data);
    }
  } else if (sport === 'NCAAF') {
    // Generation stamps the exact BDL roster id. Require it here too: a
    // college game can contain duplicate/similar names, so name-only matching
    // is not authoritative enough to settle money.
    const p = findExactNcaafStatRow(data, playerId);
    if (p) { meta.playerFound = true; return ncaafActualFromStatRow(p, type); }
  } else if (sport === 'MLB') {
    const lookup = findMlbSettlementPlayer(data, { playerId, name });
    return lookup.row ? mlbPropActual(type, lookup.row) : null;
  }
  return null;
}

export function emptySettlementStats() {
  return {
    w: 0,
    l: 0,
    p: 0,
    hrW: 0,
    hrL: 0,
    hrP: 0,
    candidates: 0,
    finalEligible: 0,
    persisted: 0,
    readBack: 0,
    pendingNonFinal: 0,
    invalidIdentity: 0,
    unmatched: 0,
    unresolvedFinal: 0,
    errors: [],
    persistedResultIds: [],
  };
}
