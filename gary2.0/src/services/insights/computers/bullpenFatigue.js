// Observed bullpen workload, with the names, dated outings and performance
// behind the total. Workload alone does not establish today's availability.
// Source: the last three final MLB StatsAPI boxscores before the slate date.
// The detail is deterministic; neither Hub prose pass may turn it into advice.
import {
  makeRow, TONES, formatIpThirds, nameKey, shiftDateStr, clampScore,
} from '../shared.js';
import mlbStatsApi from '../../mlbStatsApiService.js';

const LOOKBACK_DAYS = 6;
const WINDOW_GAMES = 3;
const HEAVY_IP = 12.5;
const MAX_ROWS = 6;
export const BULLPEN_RESEARCH_VERSION = 'bullpen-facts-v1';

const integer = value => (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== ''
  && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const outsFromIp = value => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const match = String(value ?? '').match(/^(\d+)(?:\.([012]))?$/);
  const outs = match ? Number(match[1]) * 3 + Number(match[2] || 0) : null;
  return Number.isSafeInteger(outs) ? outs : null;
};
const ipFromOuts = outs => formatIpThirds(outs / 3);
const sumKnown = (a, b) => a === null || b === null ? null : a + b;
const shortDate = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
  month: 'short', day: 'numeric', timeZone: 'UTC',
});
const dateSpan = dates => {
  const unique = [...new Set(dates)].sort();
  return unique.length === 1 ? shortDate(unique[0]) : `${shortDate(unique[0])}–${shortDate(unique.at(-1))}`;
};

function seasonLine(player, asOf) {
  const stats = player?.seasonStats?.pitching;
  const outs = outsFromIp(stats?.inningsPitched);
  const era = typeof stats?.era === 'string' || typeof stats?.era === 'number' ? Number(stats.era) : NaN;
  if (outs === null || outs <= 0 || !Number.isFinite(era) || era < 0 || String(stats.era).trim() === '') return null;
  return { season_era: era, season_ip: ipFromOuts(outs), season_as_of: asOf,
    season_saves: integer(stats.saves), season_holds: integer(stats.holds) };
}

/** Current-date writer may replace legacy prose only for the same team/game. */
export function shouldUpgradeBullpenEvidence(stored, fresh, today) {
  return stored?.category === 'bullpen_fatigue' && fresh?.category === 'bullpen_fatigue'
    && typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today)
    && stored.date === today && fresh.date === today
    && Object.hasOwn(stored, 'result') && stored.result === null
    && stored.team_id != null && fresh.team_id != null && String(stored.team_id) === String(fresh.team_id)
    && stored.game_id != null && fresh.game_id != null && String(stored.game_id) === String(fresh.game_id)
    && typeof fresh.headline === 'string' && fresh.headline.trim().length > 0
    && fresh.meta?.research_version === BULLPEN_RESEARCH_VERSION
    && (stored.meta?.research_version == null
      || (stored.meta.research_version === BULLPEN_RESEARCH_VERSION && stored.headline !== fresh.headline));
}

/** Compact observed context; the full dated arm ledger remains in metadata. */
export function bullpenResearchDetail(meta) {
  const arms = meta.arms || [];
  const sentences = [];
  const bulk = [...arms].sort((a, b) => b.outs - a.outs || b.g - a.g)[0];
  // A large single outing can explain much of a team total without widespread
  // repeated use. Identify that outing rather than calling the entire pen tired.
  const hasBulk = bulk?.g === 1 && bulk.outs >= 12;
  if (hasBulk) {
    sentences.push(`${bulk.ip} of those innings came from ${bulk.name} on ${shortDate(bulk.dates[0])}${bulk.pitches === null ? '' : ` (${bulk.pitches} pitches)`}.`);
  }
  const repeated = arms.filter(a => a.g > 1).sort((a, b) => b.g - a.g || b.outs - a.outs);
  const first = repeated[0] || (hasBulk ? arms.find(a => a.id !== bulk.id) : bulk);
  // When known, include the season save leader among the observed arms. Saves
  // choose a useful factual comparison; they do not establish tonight's role.
  const second = arms.filter(a => a.id !== first?.id && (!hasBulk || a.id !== bulk.id))
    .sort((a, b) => (b.season_saves ?? -1) - (a.season_saves ?? -1) || b.g - a.g || b.outs - a.outs)[0];
  const usage = arm => {
    const games = arm.g === meta.games ? `all ${meta.games} games` : `${arm.g} game${arm.g === 1 ? '' : 's'}`;
    const stats = [arm.pitches === null ? `${arm.ip} IP` : `${arm.pitches} pitches`];
    if (arm === second && arm.season_era != null) {
      stats.push(`${arm.season_era.toFixed(2)} season ERA over ${arm.season_ip} IP`);
    }
    return `${arm.name} worked ${games} (${stats.join('; ')})`;
  };
  if (first) sentences.push(`${[first, second].filter(Boolean).map(usage).join('; ')}.`);
  if (meta.relief_er !== null) sentences.push(`The pen allowed ${meta.relief_er} ER in that ${meta.relief_ip}-IP span (${dateSpan(meta.window_dates)}).`);
  else sentences.push(`The ${meta.games}-game window covers ${dateSpan(meta.window_dates)}.`);
  if (meta.no_game_dates.length) sentences.push(`No team game on ${dateSpan(meta.no_game_dates)}.`);
  return sentences.join(' ');
}

export async function computeBullpenFatigue(ctx) {
  const { games = [], date, helpers } = ctx;
  if (!games.length) return [];
  let examined = 0;
  const finalsByTeam = new Map();
  const scheduledByTeam = new Map();
  const ambiguousTeams = new Set();
  // A failed schedule cannot become an off day, or silently shift the window.
  for (let back = 1; back <= LOOKBACK_DAYS; back++) {
    const d = shiftDateStr(date, -back);
    if (!d) return [];
    let schedule;
    try { schedule = await mlbStatsApi.getMlbSchedule(d, { throwOnError: true }); }
    catch (error) { console.error('[bullpenFatigue] incomplete schedule:', error?.message || error); return []; }
    if (!Array.isArray(schedule)) return [];
    for (const game of schedule) {
      const gd = String(game.officialDate || game.gameDate || d).slice(0, 10);
      for (const side of ['home', 'away']) {
        const teamId = game?.teams?.[side]?.team?.id;
        if (teamId == null) continue;
        if (!scheduledByTeam.has(teamId)) scheduledByTeam.set(teamId, new Set());
        scheduledByTeam.get(teamId).add(d);
        // A resumed game can appear on this queried day with an older official
        // date. That is not an off day, and its box cannot divide the workload
        // between the two dates. Keep the affected team's window unknown.
        if (gd !== d || !game.gamePk) { ambiguousTeams.add(teamId); continue; }
        if (game?.status?.detailedState !== 'Final') continue;
        if (!finalsByTeam.has(teamId)) finalsByTeam.set(teamId, new Map());
        finalsByTeam.get(teamId).set(game.gamePk, { date: gd, gamePk: game.gamePk, side,
          gameDate: game.gameDate || '', gameNumber: Number(game.gameNumber) || 1 });
      }
    }
  }
  let mlbamIdByName;
  try { mlbamIdByName = new Map(((await mlbStatsApi.getMlbTeams()) || []).map(t => [nameKey(t.name), t.id])); }
  catch (error) { console.error('[bullpenFatigue] teams error:', error?.message || error); return []; }

  const candidates = [];
  const seen = new Set();
  for (const game of games) {
    if (String(game?.status || '').toUpperCase().includes('FINAL') || game?.id == null) continue;
    for (const team of [game.home_team, game.visitor_team || game.away_team]) {
      const teamName = team?.display_name || team?.full_name || team?.name;
      const mlbamId = mlbamIdByName.get(nameKey(teamName));
      if (mlbamId == null || team?.id == null || ambiguousTeams.has(mlbamId)) continue;
      const dedupe = `${game.id}:${mlbamId}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const recent = [...(finalsByTeam.get(mlbamId)?.values() || [])]
        .sort((a, b) => b.date.localeCompare(a.date) || b.gameDate.localeCompare(a.gameDate) || b.gameNumber - a.gameNumber)
        .slice(0, WINDOW_GAMES);
      if (recent.length < WINDOW_GAMES) continue;
      examined++;
      const armInfo = new Map();
      const seasons = new Map();
      let ok = true;
      for (const record of recent) {
        let box;
        try { box = await mlbStatsApi.getGameBoxScore(record.gamePk); } catch { ok = false; break; }
        const side = box?.teams?.[record.side];
        const pitchers = side?.pitchers;
        if (!Array.isArray(pitchers) || !pitchers.length
          || new Set(pitchers).size !== pitchers.length
          || (side.team?.id != null && Number(side.team.id) !== Number(mlbamId))) { ok = false; break; }
        for (const [key, player] of Object.entries(side.players || {})) {
          const id = Number(key.replace(/^ID/, ''));
          const season = seasonLine(player, record.date);
          // Do not backfill an absent latest snapshot with an older ERA after
          // the pitcher has appeared again. Its earlier total is now stale.
          if (!seasons.has(id)) seasons.set(id, season);
        }
        // Boxscore order is appearance order: the first arm started the game.
        for (const id of pitchers.slice(1)) {
          const player = side.players?.[`ID${id}`];
          const stats = player?.stats?.pitching;
          const outs = outsFromIp(stats?.inningsPitched);
          const recordedOuts = integer(stats?.outs);
          if (outs === null || !player?.person?.fullName
            || (player.person.id != null && String(player.person.id) !== String(id))
            || (recordedOuts !== null && recordedOuts !== outs)) { ok = false; break; }
          const pitches = integer(stats.numberOfPitches);
          const er = integer(stats.earnedRuns), k = integer(stats.strikeOuts), bb = integer(stats.baseOnBalls);
          const arm = armInfo.get(id) || { id, name: player.person.fullName, outs: 0, pitches: 0, er: 0, k: 0, bb: 0, dates: [], outings: [] };
          arm.outs += outs;
          for (const [field, value] of Object.entries({ pitches, er, k, bb })) arm[field] = sumKnown(arm[field], value);
          arm.dates.push(record.date);
          arm.outings.push({ game_id: record.gamePk, date: record.date, ip: ipFromOuts(outs), pitches, er, k, bb });
          armInfo.set(id, arm);
        }
        if (!ok) break;
      }
      if (!ok) continue;
      const reliefOuts = [...armInfo.values()].reduce((sum, arm) => sum + arm.outs, 0);
      if (reliefOuts / 3 < HEAVY_IP) continue;
      const arms = [...armInfo.values()].sort((a, b) => b.outs - a.outs || b.dates.length - a.dates.length || a.id - b.id)
        .map(arm => ({ ...arm, ip: ipFromOuts(arm.outs), g: arm.dates.length,
          b2b: [shiftDateStr(date, -1), shiftDateStr(date, -2)].every(d => arm.dates.includes(d)),
          last_used: arm.dates[0], ...(seasons.get(Number(arm.id)) || {}) }));
      const multiArms = arms.filter(arm => new Set(arm.dates).size >= 2).length;
      const noGameDates = [];
      for (let d = shiftDateStr(recent[0].date, 1); d < date; d = shiftDateStr(d, 1)) {
        if (!scheduledByTeam.get(mlbamId)?.has(d)) noGameDates.push(d);
      }
      const sum = key => arms.reduce((total, arm) => sumKnown(total, arm[key]), 0);
      const opp = team === game.home_team ? (game.visitor_team || game.away_team) : game.home_team;
      const meta = { kind: 'bullpen_fatigue', research_version: BULLPEN_RESEARCH_VERSION,
        relief_ip: ipFromOuts(reliefOuts), relief_pitches: sum('pitches'), relief_er: sum('er'), relief_k: sum('k'), relief_bb: sum('bb'),
        multi_day_arms: multiArms, games: recent.length, arms, arms_used: arms.length,
        opp: opp?.display_name || opp?.full_name || opp?.name || '',
        team_identity: { id: team.id, name: teamName, abbreviation: team.abbreviation || '' },
        source: 'MLB StatsAPI final boxscores', source_game_ids: recent.map(r => r.gamePk),
        window_dates: [...new Set(recent.map(r => r.date))].sort(), no_game_dates: noGameDates,
        source_as_of: recent[0].date, source_collected_at: new Date().toISOString(), availability: 'not_reported' };
      const detail = bullpenResearchDetail(meta);
      meta.computed_detail = detail;
      meta.computed_detail_kind = 'measured_research';
      meta.evidence = detail;
      meta.read = detail;
      candidates.push(makeRow({ category: 'bullpenFatigue',
        headline: `${teamName} pen: ${meta.relief_ip} relief IP across ${recent.length} games`,
        detail, game: helpers.gameLabel(game), value: `${meta.relief_ip} IP`, tone: TONES.NEUTRAL,
        relevance_score: clampScore(52 + (reliefOuts / 3 - HEAVY_IP) * 4 + multiArms * 5),
        team_id: team.id, game_id: game.id, meta }));
    }
  }
  candidates.sort((a, b) => b.relevance_score - a.relevance_score);
  const rows = candidates.slice(0, MAX_ROWS);
  console.log(`[bullpenFatigue] examined ${examined}, emitted ${rows.length}`);
  return rows;
}

export default { computeBullpenFatigue };
