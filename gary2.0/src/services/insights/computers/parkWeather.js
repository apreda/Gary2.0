// gary2.0/src/services/insights/computers/parkWeather.js
//
// LANE: parkWeather  (category token emitted: park_weather)
// "The weather is playing tonight: wind blowing out (or in) double digits, or
//  a temperature extreme that changes how the ball carries."
//
// Approach (the same free MLB Stats API weather the picks pipeline reads via
// getProbablePitchers — see scoutReport/sports/mlb.js):
//   - Each live BDL slate game maps to its MLBAM gamePk through
//     getMlbSchedule(etDate) + full-team-name matching (the scout report's
//     resolution pattern; BDL dates are UTC instants, so the schedule date is
//     the ET calendar date of first pitch via etDateStr).
//   - getProbablePitchers(gamePk) returns gameData.weather:
//     { condition, temp, wind } — e.g. "Partly Cloudy", "81",
//     "11 mph, Out To RF" (probed live 2026-06-10, populated pre-game).
//   - Signals: wind >= WIND_MIN mph blowing OUT (over lean) or IN (under
//     lean); temp >= TEMP_HOT (ball carries) or <= TEMP_COLD (dead air).
//     Domes / closed roofs / crosswinds are skipped. When wind and temp pull
//     in opposite directions the stronger one must clearly win or the game is
//     skipped (no mush).
//   - line_val = tonight's consensus total (median total_value across vendors
//     from getMlbGameOdds({ gameIds })), so the morning grader can settle the
//     row against the actual final total. No posted total -> the row still
//     ships for the drama, and the grader marks it context (NULL result).
//
// Tone: over lean = HOT, under lean = COLD — the grader branches on tone.
// Weather can flip between the 3 daily runs; the day's rows are DELETE+INSERT
// idempotent so the latest read wins.
//
// Defensive: unmatched gamePk, missing/empty weather, unparseable wind ->
// skip that game silently; never throws. One row max per game; slate-wide
// cap, relevance-ranked.

import {
  makeRow, TONES, clampScore, nameKey, etDateStr, median, pickVariant,
} from '../shared.js';
import mlbStatsApi from '../../mlbStatsApiService.js';

// Tunables.
const WIND_MIN = 10;       // mph out/in before the wind "is playing"
const TEMP_HOT = 92;       // °F at/above: the ball carries
const TEMP_COLD = 48;      // °F at/below: dead air, heavy ball
const MAX_ROWS = 6;        // slate-wide cap, relevance-ranked

export async function computeParkWeather(ctx) {
  const { games, bdl, helpers } = ctx;
  const rows = [];
  let examined = 0;

  const live = games.filter((g) => g?.id != null
    && !String(g?.status || '').toUpperCase().includes('FINAL'));
  if (!live.length) {
    console.log('[parkWeather] examined 0, emitted 0 (no live games)');
    return [];
  }

  // Tonight's consensus totals (one call for the whole slate; 5-min cached).
  const lineByGameId = new Map();
  try {
    const odds = (await bdl.getMlbGameOdds({ gameIds: live.map((g) => g.id) })) || [];
    const byGame = new Map();
    for (const r of odds) {
      const tv = Number(r?.total_value);
      if (r?.game_id == null || !Number.isFinite(tv)) continue;
      if (!byGame.has(r.game_id)) byGame.set(r.game_id, []);
      byGame.get(r.game_id).push(tv);
    }
    for (const [gid, totals] of byGame) {
      const m = median(totals);
      if (m != null) lineByGameId.set(gid, m);
    }
  } catch (err) {
    console.error('[parkWeather] odds error:', err?.message || err);
  }

  // MLBAM schedule per ET date (2-hr cached service call, shared per date).
  const schedByDate = new Map();
  const scheduleFor = async (etDate) => {
    if (!etDate) return [];
    if (schedByDate.has(etDate)) return schedByDate.get(etDate);
    let sched = [];
    try {
      sched = (await mlbStatsApi.getMlbSchedule(etDate)) || [];
    } catch (err) {
      console.error('[parkWeather] schedule error:', err?.message || err);
    }
    schedByDate.set(etDate, sched);
    return sched;
  };

  for (const game of live) {
    try {
      examined++;
      const sched = await scheduleFor(etDateStr(game.date));
      const match = sched.find((sg) => (
        nameKey(sg?.teams?.home?.team?.name) === nameKey(game?.home_team?.display_name || game?.home_team?.full_name)
        && nameKey(sg?.teams?.away?.team?.name) === nameKey(game?.visitor_team?.display_name || game?.visitor_team?.full_name)
      ));
      if (!match?.gamePk) continue;

      let pp = null;
      try {
        pp = await mlbStatsApi.getProbablePitchers(match.gamePk);
      } catch (err) {
        console.error('[parkWeather] feed error:', err?.message || err);
        continue;
      }
      const w = pp?.weather;
      if (!w) continue;

      const condition = String(w.condition || '');
      if (/dome|roof closed/i.test(condition)) continue;

      const wind = parseWind(w.wind);
      const temp = Number(w.temp);
      const venue = pp?.venue?.name || game?.venue || 'the park';

      // Score the over/under lean. Wind dominates; temp extremes stack or
      // oppose. A wash (opposing signals within 2 points) is skipped.
      let overScore = 0;
      let underScore = 0;
      if (wind && wind.dir === 'out' && wind.mph >= WIND_MIN) overScore += wind.mph - WIND_MIN + 4;
      if (wind && wind.dir === 'in' && wind.mph >= WIND_MIN) underScore += wind.mph - WIND_MIN + 4;
      if (Number.isFinite(temp) && temp >= TEMP_HOT) overScore += (temp - TEMP_HOT) / 2 + 2;
      if (Number.isFinite(temp) && temp <= TEMP_COLD) underScore += (TEMP_COLD - temp) / 2 + 2;
      if (overScore === 0 && underScore === 0) continue;
      if (Math.abs(overScore - underScore) < 2 && overScore > 0 && underScore > 0) continue;
      const overLean = overScore > underScore;
      const strength = Math.abs(overScore - underScore);

      const windOut = wind?.dir === 'out' && wind.mph >= WIND_MIN;
      const windIn = wind?.dir === 'in' && wind.mph >= WIND_MIN;
      const hot = Number.isFinite(temp) && temp >= TEMP_HOT;
      const cold = Number.isFinite(temp) && temp <= TEMP_COLD;

      let headline;
      let value;
      if (windOut) {
        headline = `Wind blowing out ${wind.mph} mph at ${venue} tonight`;
        value = `OUT ${wind.mph}`;
      } else if (windIn) {
        headline = `Wind blowing in ${wind.mph} mph at ${venue} tonight`;
        value = `IN ${wind.mph}`;
      } else if (hot) {
        headline = `${temp}° at ${venue} — the ball will carry tonight`;
        value = `${temp}°F`;
      } else {
        headline = `${temp}° and heavy air at ${venue} tonight`;
        value = `${temp}°F`;
      }

      const tempBit = Number.isFinite(temp) ? `${temp}°` : null;
      const windBit = wind ? `wind ${wind.raw}` : null;
      const condBit = condition || null;
      const reading = [condBit, tempBit, windBit].filter(Boolean).join(', ');
      const line = lineByGameId.get(game.id);
      const lineClause = line != null ? ` The total sits at ${line}.` : '';
      const detail = overLean
        ? pickVariant([
          `Conditions at ${venue}: ${reading}. ${windOut ? 'Fly balls that die most nights have a chance to go tonight.' : 'Heat like this turns warning-track outs into souvenirs.'}${lineClause}`,
          `Tonight's reading at ${venue} — ${reading}. Everything about the air says carry.${lineClause}`,
        ], game.id)
        : pickVariant([
          `Conditions at ${venue}: ${reading}. ${windIn ? 'That wind knocks down anything hit in the air.' : 'Cold, heavy air — the ball is not going anywhere tonight.'}${lineClause}`,
          `Tonight's reading at ${venue} — ${reading}. The air is taking runs off the board.${lineClause}`,
        ], game.id);

      rows.push(makeRow({
        category: 'parkWeather',
        headline,
        detail,
        game: helpers.gameLabel(game),
        value,
        tone: overLean ? TONES.HOT : TONES.COLD,
        relevance_score: clampScore(52 + strength * 3),
        line_val: line != null ? line : undefined,
        game_id: game.id,
        meta: {
          kind: 'park_weather',
          venue,
          condition: condition || null,
          temp_f: Number.isFinite(temp) ? temp : null,
          wind_mph: wind?.mph ?? null,
          wind_dir: wind?.dir ?? null,
          lean: overLean ? 'over' : 'under',
        },
      }));
    } catch (err) {
      console.error('[parkWeather] game error:', err?.message || err);
    }
  }

  rows.sort((a, b) => b.relevance_score - a.relevance_score);
  const capped = rows.slice(0, MAX_ROWS);
  console.log(`[parkWeather] examined ${examined}, emitted ${capped.length}`);
  return capped;
}

/**
 * Parse an MLB Stats API wind string like "11 mph, Out To RF" into
 * { mph, dir: 'out'|'in'|'cross', raw }. Returns null for calm/absent wind.
 */
function parseWind(windStr) {
  const raw = String(windStr || '').trim();
  if (!raw) return null;
  const m = raw.match(/(\d+)\s*mph/i);
  if (!m) return null;
  const mph = Number(m[1]);
  if (!Number.isFinite(mph) || mph <= 0) return null;
  let dir = 'cross';
  if (/out\s+to/i.test(raw)) dir = 'out';
  else if (/in\s+from/i.test(raw)) dir = 'in';
  return { mph, dir, raw };
}

export default { computeParkWeather };
