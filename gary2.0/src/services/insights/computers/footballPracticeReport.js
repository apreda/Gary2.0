// Per-game practice reports from BDL's dated player designations. This lane
// does not alter dossier injury duration or FRESH / PRICED IN labeling.
import { makeRow, TONES } from '../shared.js';
import { fetchNflPracticeDesignations, nflSeasonType } from '../nflPracticeProvider.js';

const CODES = Object.freeze({ did_not_participate: 'DNP', limited: 'LP', full: 'FP' });
const LABELS = Object.freeze({ DNP: 'Did not practice', LP: 'Limited practice', FP: 'Full practice' });
const STATUSES = Object.freeze({ out: 'Out', doubtful: 'Doubtful', questionable: 'Questionable' });
const RELEVANCE = Object.freeze({ Out: 82, Doubtful: 80, Questionable: 76, DNP: 70, LP: 62, FP: 50 });
const id = value => /^\d+$/.test(String(value)) && Number(value) > 0 ? String(value) : null;
const dateOnly = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const weekday = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' }).toLowerCase();
const dayET = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(date));

function scope(game) {
  const season = Number(game?.season), week = Number(game?.week), seasonType = nflSeasonType(game?.season_type);
  const away = game?.away_team ?? game?.visitor_team, home = game?.home_team;
  if (!id(game?.id) || !id(away?.id) || !id(home?.id) || String(away.id) === String(home.id) ||
      !Number.isInteger(season) || !Number.isInteger(week) || (game.season_type != null && !seasonType)) return null;
  // BDL's actual single-game response can omit season_type. Request explicit
  // types together and match the globally unique game ID; never guess regular
  // season from postseason:false (which can also describe preseason).
  const seasonTypes = seasonType ? [seasonType] : game.postseason === true ? [3] : [1, 2, 3];
  return { season, week, seasonType, seasonTypes, away, home, key: `${season}|${week}|${seasonTypes.join(',')}` };
}

function datedPractice(reports, through) {
  if (!Array.isArray(reports)) return { grid: {}, dates: {}, latest: null, latestDay: null };
  const byDate = new Map();
  for (const report of reports) {
    if (!dateOnly(report?.date) || report.date > through || !Object.hasOwn(CODES, report.status)) continue;
    const code = CODES[report.status];
    // Conflicting marks for one date stay unknown rather than picking a winner.
    if (byDate.has(report.date) && byDate.get(report.date) !== code) byDate.set(report.date, null);
    else if (!byDate.has(report.date)) byDate.set(report.date, code);
  }
  const entries = [...byDate].sort(([a], [b]) => a.localeCompare(b));
  const grid = {}, dates = {};
  for (const [date, code] of entries) {
    const day = weekday(date);
    if (['wed', 'thu', 'fri'].includes(day)) { grid[day] = code; dates[day] = date; }
  }
  const last = entries.at(-1);
  return { grid, dates, latest: last?.[1] ?? null, latestDay: last ? weekday(last[0]) : null };
}

export async function computeFootballPracticeReport(ctx) {
  const { games, helpers, date } = ctx;
  if (String(ctx?.league || '').toLowerCase() !== 'nfl' || !Array.isArray(games) || !dateOnly(date)) return [];
  const groups = new Map();
  for (const game of games) {
    const s = scope(game);
    if (!s) continue;
    const group = groups.get(s.key) ?? { ...s, games: [], teamIds: new Set() };
    group.games.push(game);
    group.teamIds.add(s.away.id); group.teamIds.add(s.home.id);
    groups.set(s.key, group);
  }
  const rows = [];
  for (const group of groups.values()) {
    let reports;
    try {
      reports = await (ctx.practiceDesignations ?? fetchNflPracticeDesignations)({
        season: group.season, week: group.week, seasonType: group.seasonType, seasonTypes: group.seasonTypes,
        teamIds: [...group.teamIds], signal: ctx.signal,
      });
      if (!Array.isArray(reports)) throw new Error('Malformed report collection');
    } catch (error) {
      console.warn(`[footballPracticeReport] BDL report unavailable: ${error?.message || 'request failed'}`);
      continue;
    }
    for (const game of group.games) {
      const s = scope(game);
      const unique = new Map();
      for (const r of reports) {
        if (String(r?.game_id) !== String(game.id) || Number(r.season) !== s.season || Number(r.week) !== s.week ||
            !s.seasonTypes.includes(nflSeasonType(r.season_type)) || !id(r.player?.id) || !id(r.team?.id) ||
            ![String(s.home.id), String(s.away.id)].includes(String(r.team.id))) continue;
        const updated = Date.parse(r.updated_at);
        // The provider's injury/game-status fields are current snapshots, not
        // historical revisions. Do not leak a later update into a prior date.
        if (!Number.isFinite(updated) || dayET(updated) > date) continue;
        const key = `${r.team.id}|${r.player.id}`;
        const prior = unique.get(key);
        if (!prior || updated > prior.updated) unique.set(key, { r, updated });
        else if (updated === prior.updated && JSON.stringify(r) !== JSON.stringify(prior.r)) {
          unique.set(key, { r: null, updated });
        }
      }
      for (const { r } of unique.values()) {
        if (!r) continue;
        const name = (r.player.full_name || [r.player.first_name, r.player.last_name].filter(Boolean).join(' ')).trim();
        if (!name) continue;
        const p = datedPractice(r.practice_reports, date);
        const injury = typeof r.injury === 'string' ? r.injury.trim() || null : null;
        const gameStatus = Object.hasOwn(STATUSES, r.game_status) ? STATUSES[r.game_status] : null;
        // Designations include healthy roster members. Null is not "active"
        // or "full practice"; did_not_play is a separate completed-game fact.
        if (!injury && !gameStatus && !p.latest && !Object.values(p.grid).some(Boolean)) continue;
        const home = String(r.team.id) === String(s.home.id), team = home ? s.home : s.away;
        const tone = gameStatus === 'Out' || gameStatus === 'Doubtful' || p.latest === 'DNP' ? TONES.COLD
          : p.latest === 'FP' && !gameStatus ? TONES.HOT : TONES.NEUTRAL;
        rows.push(makeRow({
          category: 'practice_report', headline: name,
          detail: [injury, LABELS[p.latest], gameStatus].filter(Boolean).join(' · ') || 'Practice report available',
          game: helpers.gameLabel(game), value: gameStatus || p.latest || 'LISTED', tone,
          relevance_score: RELEVANCE[gameStatus] ?? RELEVANCE[p.latest] ?? 45,
          player_id: r.player.id, team_id: team.id, game_id: game.id,
          meta: { kind: 'practice_report', source: 'BallDontLie player designations',
            report: `Week ${s.week} practice and game status`, report_week: s.week, report_season: s.season,
            team: team.abbreviation || null, side: home ? 'home' : 'away',
            position: r.player.position_abbreviation || r.player.position || null,
            injury, practice_text: LABELS[p.latest] ?? null, latest: p.latest, latest_day: p.latestDay,
            practice: p.grid, practice_dates: p.dates, game_status: gameStatus, through: date, provider_updated_at: r.updated_at },
        }));
      }
    }
  }
  return rows;
}

export default { computeFootballPracticeReport };
