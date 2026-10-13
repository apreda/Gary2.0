/** The big games, board rows and the marquee keys (split from tomorrowService.js, Oct 13 2026). */
import { findParkData } from '../../gary/agentic/tools/statRouters/mlbFetchers.js';
import { isBigGame } from '../../winners/winnersRules.js';
import { PRIMETIME_HOUR_ET, nameKey, gameTimeBucket, rowMatchupKey, repeatedMatchupKeys, rowGameIdentity, etHour, abbrFor, isRivalry } from './basics.js';

/* ───────────────────────────── 4. BIG GAMES ─────────────────────────────── */

/**
 * Select up to five games with an actual marquee reason. College uses
 * ranked matchups; NFL uses its existing national-window rule. MLB uses
 * standings, rivalry and probable starters. Start time breaks ties among
 * qualified games; it never makes an ordinary matchup a big game.
 */
export function buildBigGames(board, { mlb }) {
  const repeatedMatchups = repeatedMatchupKeys(board);
  const scored = board.map((row) => {
    let weight = 0;
    let reason = null;       // single highest-weight factor -> internal ranking trace
    let bestReasonW = -1;
    let standing = null;     // plain-text divisional standing -> what iOS renders
    const ctxParts = [];
    // BOTH probable starters' last names for MLB cards => { away, home }.
    // null for non-MLB. "Undecided" per side when a probable is unposted.
    let pitchers = null;

    const setReason = (label, w) => {
      if (w > bestReasonW) { bestReasonW = w; reason = label; }
    };

    if (row.league === 'MLB' && mlb) {
      const awayAbbr = abbrFor(row.away_team, mlb.teamIndex);
      const homeAbbr = abbrFor(row.home_team, mlb.teamIndex);
      const awayId = mlb.idByName.get(nameKey(row.away_team));
      const homeId = mlb.idByName.get(nameKey(row.home_team));
      const aSt = awayId != null ? mlb.standings.get(awayId) : null;
      const hSt = homeId != null ? mlb.standings.get(homeId) : null;
      const aTeam = awayId != null ? mlb.teamIndex.byId.get(awayId) : null;
      const hTeam = homeId != null ? mlb.teamIndex.byId.get(homeId) : null;

      // STANDINGS — division leaders and meetings between top-two teams.
      const bothTop2 = aSt?.divisionRank && hSt?.divisionRank && aSt.divisionRank <= 2 && hSt.divisionRank <= 2;
      const sameDivision = aTeam?.divisionId != null && aTeam.divisionId === hTeam?.divisionId;
      if (aSt?.divisionRank === 1 || hSt?.divisionRank === 1) {
        setReason('FIRST PLACE', 30);
        weight += 30;
      }
      if (bothTop2 && sameDivision) {
        setReason('DIVISION', 28);
        weight += 26;
        const small = (aSt?.gamesBack != null && aSt.gamesBack <= 3) || (hSt?.gamesBack != null && hSt.gamesBack <= 3);
        if (small) { setReason('PENNANT RACE', 32); weight += 10; }
      }

      // DISPLAYED CONTEXT — the ACTUAL current divisional standing, plain text.
      // (Replaces the old reason-chip / division tag as what iOS shows.)
      standing = bigGameStanding({
        aSt, hSt, aTeam, hTeam, awayTeam: row.away_team, homeTeam: row.home_team,
      });

      // RIVALRY — curated divisional pairs.
      if (isRivalry(awayAbbr, homeAbbr)) { setReason('RIVALRY', 27); weight += 24; }

      // Doubleheader-safe map reads: entries are per-GAME (time-stamped) —
      // take the entry nearest this row's own start time, so game 2's card
      // never wears game 1's arms.
      const rowT = Date.parse(row.commence_time) || null;
      const rowBucket = gameTimeBucket(row.commence_time);
      const repeatedMatchup = repeatedMatchups.has(rowMatchupKey(row));
      const nearestEntry = (list) => {
        if (!Array.isArray(list) || list.length === 0) return null;
        // A single posted probable in game 2 is still the wrong probable for
        // game 1. Repeated matchups must resolve to this exact game's bucket;
        // an absent match stays honestly undecided.
        if (repeatedMatchup) {
          if (rowBucket == null) return null;
          return list.find((entry) => gameTimeBucket(entry?.t) === rowBucket) || null;
        }
        if (rowT == null || list.length === 1) return list[0];
        return list.slice().sort((a, b) =>
          Math.abs((a.t ?? rowT) - rowT) - Math.abs((b.t ?? rowT) - rowT))[0];
      };

      // ACE — a probable with a season ERA at/below the ace threshold (ranking only).
      const aces = nearestEntry(mlb.acesByGame.get(`${awayAbbr}|${homeAbbr}`));
      if (aces?.label) {
        setReason('ACE', 22);
        weight += aces.both ? 16 : 9;
        ctxParts.push(aces.label);
      }

      // BOTH probable starters (last names) for the card. "Undecided" per side
      // when no probable is posted; falls back to "Undecided"/"Undecided" if
      // the game didn't resolve in the schedule read at all.
      const gp = nearestEntry(mlb.pitchersByGame?.get(`${awayAbbr}|${homeAbbr}`));
      pitchers = {
        away: gp?.away || 'Undecided',
        home: gp?.home || 'Undecided',
      };
    }

    if (row.league === 'NCAAF') {
      const rank = (value) => {
        const n = Number(value);
        return Number.isInteger(n) && n >= 1 && n <= 25 ? n : null;
      };
      const awayRank = rank(row.away_ranking);
      const homeRank = rank(row.home_ranking);
      if (awayRank && homeRank) {
        weight += 80 - awayRank - homeRank;
        setReason('RANKED MATCHUP', weight);
      }
    } else if (row.league === 'NFL' && isBigGame({ league: 'NFL', game: row })) {
      weight += 40;
      setReason('NATIONAL WINDOW', 40);
    }

    // PRIMETIME — national window weight boost (never a chip alone).
    const h = etHour(row.commence_time);
    if (h != null && h >= PRIMETIME_HOUR_ET) weight += 8;

    return { row, weight, reason, standing, pitchers, ctx: ctxParts.filter(Boolean).join(' · ') || null };
  }).filter((game) => game.reason != null);

  scored.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    // tie-break by earliest start (the marquee opener leads)
    return new Date(a.row.commence_time || 0) - new Date(b.row.commence_time || 0);
  });

  // BIG GAMES SIZE + MIX — up to 5 (founder is fine with 4–5, not a hard 3), and
  // always mix in at least one MLB game so other leagues don't crowd the
  // domestic games out entirely.
  const MAX_BIG = 5;
  const picked = scored.slice(0, MAX_BIG);
  if (!picked.some((s) => s.row.league === 'MLB')) {
    const bestMlb = scored.find((s) => s.row.league === 'MLB');
    if (bestMlb) picked[picked.length - 1] = bestMlb;   // swap weakest slot for the top MLB
  }

  return picked.map((s, i) => {
    const item = {
      rank: i + 1,
      league: s.row.league,
      matchup: `${s.row.away_team} @ ${s.row.home_team}`,
      // DISPLAYED divisional context — plain text, e.g. "Brewers 1st · Cubs 2nd, NL
      // Central". null when standings don't resolve (iOS hides it). Replaces the old
      // reason chip as the rendered context.
      standing: s.standing,
      context: s.ctx,
      commence_time: s.row.commence_time || null,
      bdl_game_id: s.row.bdl_game_id ?? null,
    };
    // MLB only: BOTH probable starters' last names. "Undecided" per side when a
    // probable is unposted (left off entirely for other leagues).
    if (s.pitchers) {
      item.awayPitcher = s.pitchers.away;
      item.homePitcher = s.pitchers.home;
      item.pitchers = { away: s.pitchers.away, home: s.pitchers.home };
    }
    return item;
  });
}

/** "American League East" -> "AL East"; "National League Central" -> "NL Central". */
function shortDivision(name) {
  if (!name) return null;
  return String(name)
    .replace(/^American League\s+/i, 'AL ')
    .replace(/^National League\s+/i, 'NL ');
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", 5 -> "5th". */
function ordinal(n) {
  if (!Number.isFinite(n)) return null;
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/**
 * Plain-text divisional standing for a big game, e.g. "Brewers 1st · Cubs 2nd, NL
 * Central" when both lead the same division, else the more newsworthy single team's
 * place ("1st, NL Central"). GROUNDED from standings + team index; null when
 * neither side's rank/division resolves (a standings gap).
 */
function bigGameStanding({ aSt, hSt, aTeam, hTeam, awayTeam, homeTeam }) {
  const aRank = aSt?.divisionRank;
  const hRank = hSt?.divisionRank;
  const sameDivision = aTeam?.divisionId != null && aTeam.divisionId === hTeam?.divisionId;
  const divName = shortDivision(hTeam?.divisionName) || shortDivision(aTeam?.divisionName);

  // Both placed in the SAME division -> show both with one shared division tag.
  if (sameDivision && Number.isFinite(aRank) && Number.isFinite(hRank) && divName) {
    return `${nick(awayTeam)} ${ordinal(aRank)} · ${nick(homeTeam)} ${ordinal(hRank)}, ${divName}`;
  }
  // Different divisions (interleague / cross-division) -> name each side's place.
  const parts = [];
  if (Number.isFinite(aRank) && (shortDivision(aTeam?.divisionName))) {
    parts.push(`${nick(awayTeam)} ${ordinal(aRank)} ${shortDivision(aTeam.divisionName)}`);
  }
  if (Number.isFinite(hRank) && (shortDivision(hTeam?.divisionName))) {
    parts.push(`${nick(homeTeam)} ${ordinal(hRank)} ${shortDivision(hTeam.divisionName)}`);
  }
  if (parts.length) return parts.join(' · ');
  return null;
}

/**
 * Short, unambiguous team nickname ("Milwaukee Brewers" -> "Brewers"). Keeps the
 * two-word nicknames whole so "Boston Red Sox" -> "Red Sox" (not a bare "Sox" that
 * collides with the White Sox) and "Toronto Blue Jays" -> "Blue Jays".
 */
export function nick(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (parts.length >= 2) {
    const last2 = `${parts[parts.length - 2]} ${parts[parts.length - 1]}`;
    if (/^(red sox|white sox|blue jays)$/i.test(last2)) return last2;
  }
  return parts[parts.length - 1] || fullName || '';
}

/* ──────────────────────── presentation: board rows ──────────────────────── */

/**
 * Map an internal slate row to the persisted board[] row shape (mirrors
 * DailySlateRow + precomputed abbreviations + is_marquee). All line fields stay
 * nullable => Swift renders "—".
 */
export function toBoardRow(row, marqueeKeys, teamIndex) {
  const awayAbbr = row.league === 'MLB' ? abbrFor(row.away_team, teamIndex) : null;
  const homeAbbr = row.league === 'MLB' ? abbrFor(row.home_team, teamIndex) : null;
  return {
    league: row.league ?? null,
    away_team: row.away_team ?? null,
    home_team: row.home_team ?? null,
    away_abbr: awayAbbr,
    home_abbr: homeAbbr,
    commence_time: row.commence_time ?? null,
    scheduled_date: row.scheduled_date ?? null,
    kickoff_status: row.kickoff_status ?? null,
    // Preserve the exact provider state from this slate row. This is carried
    // by provider game identity, never borrowed from another matchup row (in
    // particular, the other game of a doubleheader).
    game_status: row.game_status ?? null,
    status_detail: row.status_detail ?? null,
    // Game identity (Jul 22 2026, doubleheader-safe) — pairs with the
    // starters' game_time so readers join board row ↔ arms BY GAME.
    bdl_game_id: row.bdl_game_id ?? null,
    away_ranking: row.away_ranking ?? null,
    home_ranking: row.home_ranking ?? null,
    venue: row.venue ?? null,
    spread: row.spread ?? null,
    ml_home: row.ml_home ?? null,
    ml_away: row.ml_away ?? null,
    total: row.total ?? null,
    ml_book: row.line_vendor ?? null,
    is_marquee: marqueeKeys.has(rowGameIdentity(row)),
    // PARK FACTOR (founder pick, Aug 14 2026 — replaces the weather-led row on
    // THE BIG NUMBERS; the wind/total fold into its sentence). Percentage, not
    // the raw factor, per his call: 1.03 ships as +3.
    park: (() => {
      if (row.league !== 'MLB') return null;
      const pd = findParkData(row.venue, row.home_team);
      if (!pd || !Number.isFinite(Number(pd.factor))) return null;
      return { name: pd.park, pct: Math.round((Number(pd.factor) - 1) * 100), type: pd.type ?? null };
    })(),
  };
}

/** Exact identities of the selected marquee games (doubleheader-safe). */
export function marqueeGameKeys(bigGames) {
  return new Set((bigGames || []).map((game) => {
    const [awayTeam, homeTeam] = String(game?.matchup || '').split(' @ ');
    return rowGameIdentity({
      league: game?.league,
      away_team: awayTeam,
      home_team: homeTeam,
      bdl_game_id: game?.bdl_game_id,
      commence_time: game?.commence_time,
    });
  }));
}
