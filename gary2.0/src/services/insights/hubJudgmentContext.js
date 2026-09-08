// Current matchup context for synthesis, independent of which statistical
// highlight collectors emitted a row. No projections are relabeled confirmed.
import { normalizeMlbFantasyLineup } from './mlbFantasyEvidence.js';

const STAT_FIELDS = ['batting_gp', 'batting_pa', 'batting_ab', 'batting_r', 'batting_h',
  'batting_hr', 'batting_rbi', 'batting_bb', 'batting_so', 'batting_sb', 'batting_avg',
  'batting_obp', 'batting_slg', 'batting_ops', 'pitching_gp', 'pitching_gs', 'pitching_ip',
  'pitching_h', 'pitching_er', 'pitching_bb', 'pitching_k', 'pitching_k_per_9', 'pitching_era', 'pitching_whip'];
const sid = value => value == null ? null : String(value);
const asNumber = value => value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);

function displayMeasurements(raw) {
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => {
    const precision = /(?:_era|_k_per_9)$/.test(key) ? 2
      : /(?:_whip|_avg|_obp|_slg|_ops)$/.test(key) ? 3 : null;
    // Innings retain the provider's baseball outs notation. Counts must
    // already be integral; do not manufacture a rounded counting statistic.
    return [key, precision == null ? String(value) : value.toFixed(precision)];
  }));
}

function seasonStat(rows, playerID, season) {
  const selected = rows.filter(row => sid(row.player?.id ?? row.player_id) === playerID
    && Number(row.season) === season && row.postseason !== true
    && !/spring|postseason|playoff/i.test(String(row.season_type || row.seasonType || '')));
  const unique = [...new Map(selected.map(row => {
    const item = Object.fromEntries(STAT_FIELDS.map(key => [key, asNumber(row[key])]).filter(([, value]) => value != null));
    return [JSON.stringify(item), item];
  })).values()];
  return unique.length === 1 && Object.keys(unique[0]).length ? { season, season_type: 'regular', ...unique[0],
    display_measurements: displayMeasurements(unique[0]) } : null;
}

function describeSide(side, season) {
  const pitcher = side.probable_pitcher, baseline = pitcher?.season_baseline;
  const measured = (row, entries) => entries.filter(([key]) => row?.[key] != null)
    .map(([key, label]) => `${row.display_measurements?.[key] ?? row[key]} ${label}`).join(', ');
  const pitching = measured(baseline, [['pitching_era', 'ERA'], ['pitching_whip', 'WHIP'], ['pitching_ip', 'IP'],
    ['pitching_gp', 'appearances'], ['pitching_gs', 'starts']]);
  const status = side.lineup_status === 'confirmed' ? 'Posted batting order' : side.lineup_status === 'partial' ? 'Partial batting order' : 'Batting order not posted';
  const batting = side.batters.map(batter => {
    const line = measured(batter.season_baseline, [['batting_ops', 'OPS'], ['batting_ab', 'AB']]);
    return `${batter.order}. ${batter.name}${line ? ` (${line})` : ''}`;
  }).join('; ');
  return `${side.team}: ${pitcher ? `probable starter ${pitcher.name}${pitching ? ` (${pitching})` : '; season pitching baseline unavailable'}` : 'probable starter unavailable'}. ${status}${batting ? `: ${batting}` : ''}. Statistics are ${season} regular-season measurements.`;
}

async function bounded(promise, signal) {
  if (!signal) return promise;
  signal.throwIfAborted();
  let listener;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      listener = () => reject(signal.reason || new Error('Hub context cancelled'));
      signal.addEventListener('abort', listener, { once: true });
    })]);
  } finally { signal.removeEventListener('abort', listener); }
}

export async function collectHubJudgmentContext({ date, league, games = [], bdl, asOf,
  signal, budgetMs = 90_000 } = {}) {
  const result = new Map(), key = String(league).toLowerCase(), season = Number(date?.slice(0, 4));
  const controller = new AbortController(), abort = () => controller.abort(signal?.reason || new Error('Hub context cancelled'));
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Hub current-context deadline exceeded')), budgetMs);
  const selectedGames = games.filter(game => game?.id != null);
  try {
    if (key !== 'mlb') {
      // Football/NBA retain their sport-specific collected boxes/availability
      // in the evidence packet. This adds the common exact current schedule.
      for (const game of selectedGames) result.set(String(game.id), { complete: true, evidence: [],
        limitations: ['Only this sport\'s collected observations are available. Unreported roles, availability and matchup measurements remain unknown.'] });
      return result;
    }
    let next = 0;
    const contexts = new Map();
    await Promise.all(Array.from({ length: Math.min(3, selectedGames.length) }, async () => {
      while (next < selectedGames.length) {
        const game = selectedGames[next++], gameID = String(game.id);
        try {
          controller.signal.throwIfAborted();
          const sheet = await bounded(bdl.getMlbLineups(game.id, { throwOnError: true }), controller.signal);
          // The shipping adapter returns null for a healthy zero-entry sheet;
          // throwOnError distinguishes that unposted state from transport failure.
          if (sheet != null && (typeof sheet !== 'object' || Array.isArray(sheet))) throw new Error('Malformed current lineup response');
          const sides = [['away', game.visitor_team || game.away_team], ['home', game.home_team]].map(([side, team]) => {
            const raw = Object.entries(sheet || {}).find(([abbr]) => abbr.toUpperCase() === String(team?.abbreviation || '').toUpperCase())?.[1];
            const lineup = normalizeMlbFantasyLineup(raw);
            return { side, team_id: sid(team?.id), team: team?.full_name || team?.name || team?.abbreviation,
              lineup_status: lineup.status, probable_pitcher: lineup.pitcher, batters: lineup.batters };
          });
          contexts.set(gameID, { game, sides });
        } catch (error) { result.set(gameID, { complete: false, evidence: [], limitations: [`Current lineup check failed: ${error.message}`] }); }
      }
    }));
    const playerIDs = [...new Set([...contexts.values()].flatMap(({ sides }) => sides.flatMap(side => [
      side.probable_pitcher?.player_id, ...side.batters.map(batter => batter.player_id),
    ])).filter(Boolean))];
    let statistics = [], statisticsComplete = true;
    // Keep provider query size bounded; the provider adapter owns pagination.
    for (let index = 0; index < playerIDs.length; index += 60) {
      try {
        controller.signal.throwIfAborted();
        const rows = await bounded(bdl.getMlbPlayerSeasonStats({ season, playerIds: playerIDs.slice(index, index + 60), throwOnError: true }), controller.signal);
        if (!Array.isArray(rows)) throw new Error('Malformed current season statistics');
        statistics.push(...rows);
      } catch { statisticsComplete = false; break; }
    }
    for (const [gameID, { sides }] of contexts) {
      const current = sides.map(side => ({ ...side,
        probable_pitcher: side.probable_pitcher ? { ...side.probable_pitcher,
          season_baseline: seasonStat(statistics, side.probable_pitcher.player_id, season) } : null,
        batters: side.batters.map(batter => ({ ...batter, season_baseline: seasonStat(statistics, batter.player_id, season) })),
      }));
      const summary = current.map(side => describeSide(side, season)).join('\n\n');
      result.set(gameID, { complete: statisticsComplete, evidence: [{ id: 'current_context', game_id: gameID,
        source_key: `current_context|${gameID}||`, label: 'Today’s pitchers and batting orders', summary,
        source: 'BALLDONTLIE current game lineups and regular-season player statistics', as_of: asOf,
        source_updated_at: null, player_id: null, team_id: null,
        facts: { date, season, sides: current, starter_status: 'probable, never confirmed by this endpoint' } }],
      limitations: [
        'The collection time is when Gary checked; these providers do not give their last update time.',
        'Season measurements are background. Planned starter innings, late replacements and unreported availability remain unknown.',
        ...(!statisticsComplete ? ['The season-statistics check failed; this packet cannot renew a prior judgment.'] : []),
      ] });
    }
    return result;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
