// Builds League Pulse tabs for NFL and NCAAF — the football half of the same
// generic { columns, rows } table contract leaguePulse.js ships for MLB. One
// pack per (date, league, tab); iOS renders every tab with zero per-tab code.
//
// GROUNDING IS THE ONLY RULE (identical to the MLB builder):
//   - NFL: BDL games index (the slate), /nfl/v1/odds, /nfl/v1/standings,
//     /nfl/v1/player_injuries. NCAAF: games index, /ncaaf/v1/odds,
//     /ncaaf/v1/rankings.
//   - A cell that cannot be computed is OMITTED, never invented; a tab that
//     cannot be grounded simply isn't emitted.
//   - August standings are the preseason ledger and the tab says so.
//
// Defensive contract: NEVER throws — every fetch is safeCall'd; failure means
// a thinner (or absent) tab.

import { asArray, safeCall as safeCallShared } from './shared.js';
import {
  footballSeasonForDate,
  loadFootballSlate,
  selectFootballOddsByGame,
} from './footballData.js';

const safeCall = (fn, fallback) => safeCallShared(fn, fallback, 'footballLeaguePulse');

const TOP_N = 15;
const SPORT_KEY = Object.freeze({
  NFL: 'americanfootball_nfl',
  NCAAF: 'americanfootball_ncaaf',
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared formatting
// ─────────────────────────────────────────────────────────────────────────────

function isPreseasonDate(date) {
  return Number(String(date || '').slice(5, 7)) === 8;
}

function etKickLabel(game) {
  const raw = game?.date ?? game?.datetime ?? game?.commence_time ?? game?.start_time_utc;
  if (!raw || /^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return 'TBD';
  const instant = new Date(raw);
  if (Number.isNaN(instant.getTime())) return 'TBD';
  return instant.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit',
  }).replace(' ', ' ') + ' ET';
}

function sideName(team) {
  return team?.abbreviation || team?.college || team?.name || team?.full_name || '—';
}

function signed(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n > 0 ? `+${n}` : String(n);
}

function moneylineText(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n > 0 ? `+${Math.round(n)}` : String(Math.round(n));
}

// ─────────────────────────────────────────────────────────────────────────────
// The Board — today's slate with the market (both leagues)
// ─────────────────────────────────────────────────────────────────────────────

async function buildFootballBoard({ date, league, bdl, games }) {
  if (!games.length) return null;

  const odds = asArray(await safeCall(() => bdl.getOddsV2(
    { game_ids: games.map((g) => g?.id).filter((id) => id != null), per_page: 100 },
    SPORT_KEY[league],
    1,
  ), []));
  const byGame = selectFootballOddsByGame(odds, new Set(games.map((g) => g?.id)));

  const rows = games
    .map((g) => {
      const away = g?.away_team ?? g?.visitor_team;
      const home = g?.home_team;
      if (!away || !home) return null;
      const picked = byGame.get(String(g?.id));
      const row = picked?.row;
      const cells = {
        matchup: `${sideName(away)} @ ${sideName(home)}`,
        kick: etKickLabel(g),
        spread: row?.spread_home_value != null ? `${sideName(home)} ${signed(row.spread_home_value)}` : '',
        total: picked?.total != null ? String(picked.total) : '',
        ml: [moneylineText(row?.moneyline_away_odds), moneylineText(row?.moneyline_home_odds)]
          .filter(Boolean).join(' / '),
      };
      // NCAAF ranked-first ordering rides the game's embedded metadata when the
      // slate loader attached it; unranked sides sort by kickoff below.
      return { cells, kickRaw: g?.date ?? g?.commence_time ?? '', gameId: g?.id };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.kickRaw).localeCompare(String(b.kickRaw)))
    .slice(0, TOP_N)
    .map((r) => r.cells);

  if (!rows.length) return null;
  return {
    date,
    league,
    tab: 'the_board',
    title: 'The Board',
    subtitle: `Today's ${league} slate with the market`,
    sort_note: games.length > TOP_N ? `first ${TOP_N} kickoffs of ${games.length}` : 'by kickoff',
    columns: [
      { key: 'matchup', label: 'GAME', align: 'leading', emphasis: 'primary' },
      { key: 'kick', label: 'KICK', align: 'trailing', emphasis: 'muted' },
      { key: 'spread', label: 'SPREAD', align: 'trailing', emphasis: 'stat' },
      { key: 'total', label: 'TOTAL', align: 'trailing', emphasis: 'stat' },
      { key: 'ml', label: 'ML', align: 'trailing', emphasis: 'stat' },
    ],
    rows,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NFL Form — the standings as they stand (preseason-labeled in August)
// ─────────────────────────────────────────────────────────────────────────────

async function buildNflForm({ date, season, bdl }) {
  const standings = asArray(await safeCall(() => bdl.getNflStandings(season), []));
  const played = standings.filter((s) =>
    (Number(s?.wins) || 0) + (Number(s?.losses) || 0) + (Number(s?.ties) || 0) > 0);
  if (!played.length) return null;

  const pre = isPreseasonDate(date);
  const rows = played
    .sort((a, b) =>
      (Number(b?.win_streak) || 0) - (Number(a?.win_streak) || 0)
      || (Number(b?.point_differential) || 0) - (Number(a?.point_differential) || 0))
    .slice(0, TOP_N)
    .map((s) => {
      const streak = Number(s?.win_streak) || 0;
      return {
        team: sideName(s?.team),
        record: s?.overall_record || '',
        streak: streak > 0 ? `W${streak}` : streak < 0 ? `L${Math.abs(streak)}` : '—',
        diff: signed(s?.point_differential) || '',
        home: s?.home_record || '',
        road: s?.road_record || '',
        trend: streak >= 2 ? 'hot' : streak <= -2 ? 'cold' : '',
      };
    });

  return {
    date,
    league: 'NFL',
    tab: 'form',
    title: pre ? 'Form — Preseason Ledger' : 'Form',
    subtitle: pre
      ? 'August records are exhibition records; the tab resets with Week 1'
      : 'Streaks and point differential, straight from the standings',
    sort_note: 'by streak, then point differential',
    columns: [
      { key: 'team', label: 'TEAM', align: 'leading', emphasis: 'primary' },
      { key: 'record', label: 'REC', align: 'trailing', emphasis: 'stat' },
      { key: 'streak', label: 'STK', align: 'trailing', emphasis: 'stat' },
      { key: 'diff', label: 'DIFF', align: 'trailing', emphasis: 'stat' },
      { key: 'home', label: 'HOME', align: 'trailing', emphasis: 'muted' },
      { key: 'road', label: 'ROAD', align: 'trailing', emphasis: 'muted' },
    ],
    rows,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NFL Injury Sheet — the league-wide report, heaviest teams first
// ─────────────────────────────────────────────────────────────────────────────

const SERIOUS_STATUS = /^(out|doubtful|injured reserve|ir)$/i;

async function buildNflInjurySheet({ date, season, bdl }) {
  // League-wide team ids come from the standings call (all 32); the injuries
  // endpoint filters by team ids.
  const standings = asArray(await safeCall(() => bdl.getNflStandings(season), []));
  const teamIds = standings.map((s) => s?.team?.id).filter((id) => id != null);
  if (!teamIds.length) return null;

  const reports = asArray(await safeCall(() => bdl.getNflPlayerInjuries(teamIds), []));
  if (!reports.length) return null;

  const byTeam = new Map();
  for (const r of reports) {
    const team = r?.player?.team;
    if (team?.id == null) continue;
    const key = String(team.id);
    const bucket = byTeam.get(key) || { team, serious: [], questionable: [] };
    const status = String(r?.status || '').trim();
    const name = [r?.player?.first_name, r?.player?.last_name].filter(Boolean).join(' ');
    if (!status || !name) continue;
    if (SERIOUS_STATUS.test(status)) bucket.serious.push({ name, status });
    else bucket.questionable.push({ name, status });
    byTeam.set(key, bucket);
  }
  if (!byTeam.size) return null;

  const rows = [...byTeam.values()]
    .sort((a, b) => (b.serious.length - a.serious.length)
      || (b.questionable.length - a.questionable.length))
    .slice(0, TOP_N)
    .map((b) => ({
      team: sideName(b.team),
      out: String(b.serious.length),
      quest: String(b.questionable.length),
      headliner: b.serious[0]
        ? `${b.serious[0].name} (${b.serious[0].status})`
        : (b.questionable[0] ? `${b.questionable[0].name} (${b.questionable[0].status})` : ''),
      trend: b.serious.length >= 3 ? 'cold' : '',
    }));

  return {
    date,
    league: 'NFL',
    tab: 'injury_sheet',
    title: 'The Injury Sheet',
    subtitle: 'The wire report by team — out/IR and questionable counts',
    sort_note: 'heaviest report first',
    columns: [
      { key: 'team', label: 'TEAM', align: 'leading', emphasis: 'primary' },
      { key: 'out', label: 'OUT/IR', align: 'trailing', emphasis: 'stat' },
      { key: 'quest', label: 'QUES', align: 'trailing', emphasis: 'stat' },
      { key: 'headliner', label: 'HEADLINER', align: 'leading', emphasis: 'muted' },
    ],
    rows,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NCAAF Rankings — the AP poll with records
// ─────────────────────────────────────────────────────────────────────────────

async function buildNcaafRankings({ date, season, bdl }) {
  let poll = asArray(await safeCall(() => bdl.getNcaafRankings(season), []));
  let pollSeason = season;
  if (!poll.length && isPreseasonDate(date)) {
    pollSeason = season - 1;
    poll = asArray(await safeCall(() => bdl.getNcaafRankings(pollSeason), []));
  }
  if (!poll.length) return null;

  const prior = pollSeason !== season;
  const rows = poll
    .filter((r) => Number.isFinite(Number(r?.rank)))
    .sort((a, b) => Number(a.rank) - Number(b.rank))
    .slice(0, 25)
    .map((r) => ({
      rank: String(r.rank),
      team: sideName(r?.team),
      record: r?.record || '',
      points: r?.points != null ? String(r.points) : '',
      trendcol: r?.trend != null && r?.trend !== '' ? String(r.trend) : '—',
      trend: String(r?.trend || '').startsWith('+') ? 'hot'
        : String(r?.trend || '').startsWith('-') ? 'cold' : '',
    }));
  if (!rows.length) return null;

  return {
    date,
    league: 'NCAAF',
    tab: 'rankings',
    title: prior ? `AP Top 25 — Final ${pollSeason}` : 'AP Top 25',
    subtitle: prior
      ? "Last season's final poll; the new season's poll replaces it when it posts"
      : `Week ${poll[0]?.week ?? ''} poll with records`,
    sort_note: 'by rank',
    columns: [
      { key: 'rank', label: '#', align: 'trailing', emphasis: 'stat' },
      { key: 'team', label: 'TEAM', align: 'leading', emphasis: 'primary' },
      { key: 'record', label: 'REC', align: 'trailing', emphasis: 'stat' },
      { key: 'points', label: 'PTS', align: 'trailing', emphasis: 'muted' },
      { key: 'trendcol', label: 'TREND', align: 'trailing', emphasis: 'muted' },
    ],
    rows,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the day's football League Pulse tab packs for one league.
 * @returns {Promise<Array<{date,league,tab,title,subtitle,sort_note,columns,rows}>>}
 */
export async function buildFootballLeaguePulse({ date, league, bdl } = {}) {
  const lg = String(league || '').toUpperCase();
  if (!SPORT_KEY[lg] || !bdl) return [];

  const season = footballSeasonForDate(date);
  if (!Number.isInteger(season)) return [];

  const games = asArray(await safeCall(
    () => loadFootballSlate({ bdl, league: lg.toLowerCase(), date }), [],
  ));

  const packs = [];
  const board = await safeCall(() => buildFootballBoard({ date, league: lg, bdl, games }), null);
  if (board) packs.push(board);

  if (lg === 'NFL') {
    const form = await safeCall(() => buildNflForm({ date, season, bdl }), null);
    if (form) packs.push(form);
    const injuries = await safeCall(() => buildNflInjurySheet({ date, season, bdl }), null);
    if (injuries) packs.push(injuries);
  } else {
    const rankings = await safeCall(() => buildNcaafRankings({ date, season, bdl }), null);
    if (rankings) packs.push(rankings);
  }

  console.log(`[footballLeaguePulse] ${lg} ${date}: built ${packs.length} tab(s): ${packs.map((p) => p.tab).join(', ') || 'none'}.`);
  return packs;
}

export default { buildFootballLeaguePulse };
