/**
 * ONE LINEUP SOURCE FOR THE WHOLE INSIGHTS LANE (founder GO, Aug 14 2026).
 *
 * BDL posts a game's batting order ~2-3h before first pitch. Before that its
 * sheet comes back with a real probable pitcher but ZERO batters — and every
 * hitter-facing computer read that as "no lineup" and returned nothing:
 *
 *   heatCheck / coolingOff / platoonEdge  ->  0 rows on the 6:00, 7:15 and
 *   8:00 insight runs, first rows only at 11:00 once BDL posts.
 *
 * Those three are the lanes that fill the Picks page's BIG NUMBERS rail (three
 * gold edge rows above the weather and series). So the founder's page showed
 * two rows all morning — "its 10:17am EST our users are awake" — not because
 * anything was misconfigured, but because the rail's whole supply starves until
 * late morning.
 *
 * playerInsightCards already solved exactly this with the projected nine from
 * mlb_field_lineups (the same set the iOS field view draws), and that table is
 * populated for the full slate well before the 6:00 run. This module lifts that
 * fallback out of playerInsightCards so the computers share ONE implementation
 * rather than growing a second, drifting copy.
 *
 * Contract: a posted BDL sheet ALWAYS wins. The projection is a floor, never an
 * override, and it upgrades itself the moment the real card is posted.
 */

import axios from 'axios';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

/** A lineup object is usable when at least one side has batters posted. */
export function usableLineup(lineups) {
  if (!lineups || typeof lineups !== 'object') return false;
  return Object.values(lineups).some((side) => Array.isArray(side?.batters) && side.batters.length > 0);
}

/** Reassemble a "bats_throws"-style string from the field-lineup bats + pitcher hand. */
function batsThrowsFrom(bats, throws) {
  const b = bats ? String(bats).trim().toUpperCase()[0] : '';
  const t = throws ? String(throws).trim().toUpperCase()[0] : '';
  if (!b && !t) return '';
  return `${b}/${t}`;
}

/**
 * mlb_field_lineups payload ({ home, away } w/ fielders + pitcher) -> the
 * getMlbLineups() shape ({ [abbr]: { teamName, pitcher, batters[] } }), so a
 * caller cannot tell which source it got.
 */
export function adaptFieldLineupPayload(row) {
  const payload = row?.payload;
  if (!payload || typeof payload !== 'object') return null;
  const out = {};
  for (const [side, abbr] of [['home', row?.home_team], ['away', row?.away_team]]) {
    const t = payload[side];
    if (!t || !Array.isArray(t.fielders) || t.fielders.length === 0) continue;
    const key = abbr || t.team || side;
    out[key] = {
      teamName: t.team || abbr || null,
      pitcher: t.pitcher && t.pitcher.playerId != null && t.pitcher.playerId !== ''
        ? {
            name: t.pitcher.name,
            position: 'P',
            batsThrows: batsThrowsFrom('', t.pitcher.hand),
            playerId: t.pitcher.playerId,
          }
        : null,
      batters: t.fielders
        .filter((b) => b?.playerId != null && b.playerId !== '')
        .map((b) => ({
          name: b.name,
          position: b.pos,
          battingOrder: b.order,
          batsThrows: batsThrowsFrom(b.bats, ''),
          playerId: b.playerId,
        })),
    };
  }
  return Object.keys(out).length ? out : null;
}

/**
 * The day's projected lineups keyed by BDL game_id. Reads projected AND
 * confirmed rows — a confirmed field-lineup row is an equally good floor if
 * BDL's live sheet blips. NON-FATAL: any failure returns an empty map, which
 * simply restores the old confirmed-only behaviour.
 */
export async function loadProjectedFieldLineups(date) {
  const map = new Map();
  if (!SUPABASE_URL || !SUPABASE_KEY) return map;
  let rows = [];
  try {
    const resp = await axios.get(`${SUPABASE_URL}/rest/v1/mlb_field_lineups`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      params: { date: `eq.${date}`, select: 'game_id,home_team,away_team,status,payload' },
      timeout: 15000,
    });
    rows = Array.isArray(resp.data) ? resp.data : [];
  } catch (err) {
    console.warn(`[lineupSource] mlb_field_lineups fetch failed: ${err?.message || err}`);
    return map;
  }
  for (const row of rows) {
    const gameId = row?.game_id != null ? String(row.game_id) : null;
    if (!gameId) continue;
    const lineups = adaptFieldLineupPayload(row);
    if (usableLineup(lineups)) map.set(gameId, lineups);
  }
  return map;
}

/**
 * Per-run lineup reader shared by the computers: posted BDL sheet first, the
 * day's projected nine as the floor. One projected fetch and one BDL call per
 * game per run, both memoized.
 *
 * Usage inside a computer:
 *   const lineupsFor = makeLineupReader({ bdl, date });
 *   const lineups = await lineupsFor(game.id);
 */
export function makeLineupReader({ bdl, date }) {
  const memo = new Map();
  let projectedPromise = null;

  return async function lineupsFor(gameId) {
    if (gameId == null) return null;
    const key = String(gameId);
    if (memo.has(key)) return memo.get(key);

    let lineups = null;
    try {
      lineups = await bdl.getMlbLineups(gameId);
    } catch { /* fall through to the projection */ }

    if (!usableLineup(lineups)) {
      if (!projectedPromise) projectedPromise = loadProjectedFieldLineups(date);
      const projected = (await projectedPromise)?.get(key) || null;
      if (usableLineup(projected)) {
        console.log(`[lineupSource] game ${key}: no posted sheet — using the projected nine.`);
        lineups = projected;
      }
    }

    memo.set(key, lineups);
    return lineups;
  };
}

export default { makeLineupReader, loadProjectedFieldLineups, adaptFieldLineupPayload, usableLineup };
