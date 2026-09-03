// THE PRACTICE REPORT — the NFL's official injury report, per slate game
// (founder, Sep 3 2026: the Wed/Thu/Fri participation grid every fan reads).
//
// Source: nfl.com/injuries, the league's own ledger. One row per listed
// player on either side of a slate game: his injury, today's practice status,
// the game status. The page is a daily snapshot, so the week's grid is built
// here from this week's earlier `practice_report` rows (read back from
// insight_connections) plus today's page — a day the report did not list is
// null, never guessed. NFL-only: the college report has no league ledger.
//
// This lane never touches injury labeling (FRESH / PRICED IN …) — that is the
// locked dossier path. It is the league's printed report, verbatim.

import axios from 'axios';
import { makeRow, TONES } from '../shared.js';
import { fetchOfficialInjuryReport } from '../nflOfficialInjuryReport.js';

const PRACTICE_DAYS = ['wed', 'thu', 'fri'];
const RELEVANCE = Object.freeze({ Out: 82, Doubtful: 80, Questionable: 76, DNP: 70, LP: 62, FP: 50 });

function mascot(team) {
  const name = String(team?.name || team?.full_name || '').trim();
  return name.split(' ').pop().toLowerCase();
}

function weekdayET(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12));
  return noonUtc.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' }).toLowerCase();
}

/** Tuesday of the report week (ET) — the league week's first report day is Wednesday. */
function weekStartET(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d, 12));
  const weekday = day.getUTCDay(); // 0 Sun … 6 Sat
  const back = (weekday - 2 + 7) % 7; // days since Tuesday
  day.setUTCDate(day.getUTCDate() - back);
  return day.toISOString().slice(0, 10);
}

function restConfig(options = {}) {
  const supabaseUrl = options.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = options.key ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  return { supabaseUrl, key, client: options.client ?? axios };
}

/** This week's earlier snapshots for these games — the grid's other days. */
async function priorSnapshots(gameIds, date, options) {
  const { supabaseUrl, key, client } = restConfig(options);
  if (!supabaseUrl || !key || !gameIds.length) return [];
  try {
    const { data } = await client.get(`${supabaseUrl}/rest/v1/insight_connections`, {
      params: {
        select: 'date,game_id,headline,meta',
        league: 'eq.NFL',
        category: 'eq.practice_report',
        game_id: `in.(${gameIds.map((id) => `"${id}"`).join(',')})`,
        date: `gte.${weekStartET(date)}`,
        and: `(date.lt.${date})`,
        limit: 2000,
      },
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn(`[footballPracticeReport] prior snapshots unavailable (today's day only): ${err?.message || err}`);
    return [];
  }
}

function tone(row) {
  if (row.gameStatus === 'Out' || row.gameStatus === 'Doubtful' || row.practice === 'DNP') return TONES.COLD;
  if (row.practice === 'FP' && !row.gameStatus) return TONES.HOT;
  return TONES.NEUTRAL;
}

function relevance(row) {
  return RELEVANCE[row.gameStatus] ?? RELEVANCE[row.practice] ?? 45;
}

export async function computeFootballPracticeReport(ctx) {
  const { games, helpers, date } = ctx;
  if (String(ctx?.league || '').toLowerCase() !== 'nfl' || !Array.isArray(games) || games.length === 0) return [];

  let report;
  try {
    report = await (ctx.officialInjuryReport ? ctx.officialInjuryReport() : fetchOfficialInjuryReport());
  } catch (err) {
    console.warn(`[footballPracticeReport] official report unavailable: ${err?.message || err}`);
    return [];
  }
  if (!report?.units?.length) {
    console.log(`[footballPracticeReport] NFL ${date}: the league page carries no team tables yet`);
    return [];
  }

  // A team's table is a team's table wherever the page files it — each club
  // appears in exactly one unit a week, so match each side by its own club.
  const tableByMascot = new Map();
  for (const unit of report.units) {
    for (const team of unit.teams) tableByMascot.set(String(team.name || '').split(' ').pop().toLowerCase(), team);
  }

  const day = weekdayET(date);
  const prior = await priorSnapshots(games.map((g) => String(g?.id)).filter(Boolean), date, ctx.rest);
  const priorGrid = new Map(); // `${game_id}|${player}` → { wed, thu, fri }
  for (const r of prior) {
    const key = `${r.game_id}|${String(r.headline || '').toLowerCase()}`;
    const grid = priorGrid.get(key) || {};
    for (const d of PRACTICE_DAYS) if (r.meta?.practice?.[d]) grid[d] = r.meta.practice[d];
    priorGrid.set(key, grid);
  }

  const rows = [];
  for (const game of games) {
    const away = game?.away_team ?? game?.visitor_team;
    const home = game?.home_team;
    if (game?.id == null || !away || !home) continue;
    const sides = [
      { key: 'away', team: away, table: tableByMascot.get(mascot(away)) },
      { key: 'home', team: home, table: tableByMascot.get(mascot(home)) },
    ];
    if (!sides.some((side) => side.table)) continue;
    for (const side of sides) {
      for (const r of side.table?.rows || []) {
        const practice = { ...(priorGrid.get(`${game.id}|${r.player.toLowerCase()}`) || {}) };
        if (PRACTICE_DAYS.includes(day) && r.practice) practice[day] = r.practice;
        const detailBits = [r.injury, r.practiceText, r.gameStatus].filter(Boolean);
        rows.push(makeRow({
          category: 'practice_report',
          headline: r.player,
          detail: detailBits.length ? detailBits.join(' · ') : 'On the official report',
          game: helpers.gameLabel(game),
          value: r.gameStatus || r.practice || 'LISTED',
          tone: tone(r),
          relevance_score: relevance(r),
          team_id: side.team.id,
          game_id: game.id,
          meta: {
            kind: 'practice_report',
            source: 'nfl.com official injury report',
            report: report.title || null,
            report_week: report.week ?? null,
            report_season: report.season ?? null,
            team: side.team.abbreviation || side.table?.abbr || null,
            side: side.key,
            position: r.position,
            injury: r.injury,
            practice_text: r.practiceText,
            latest: r.practice,
            latest_day: day,
            practice,
            game_status: r.gameStatus,
            through: date,
          },
        }));
      }
    }
  }

  console.log(`[footballPracticeReport] NFL ${date} (${day}): ${report.units.length} game(s) on the league page -> ${rows.length} row(s) for the slate`);
  return rows;
}

export default { computeFootballPracticeReport };
