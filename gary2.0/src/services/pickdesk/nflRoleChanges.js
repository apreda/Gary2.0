// THE ROLE CHANGE (founder GO, Oct 6 2026: "shouldnt our formula still understand role changes ... if lets say a
// WR2 becomes WR1 because the normal WR1 goes out ... that doesnt mean he still cant hit the over").
//
// The NFL volume model (nflPropModel.js) read a player's share of his team's targets and carries from his own past
// games only. A line the books raised because his role grew read as "too high", and the menu took the under: its
// unders went 19-21 from Sep 23 to Oct 5, and 33 of those 40 were against a line set above his own season average.
// Three corrections, from data the props desk already loads:
//   1. FRESH ABSENCES: a teammate who played the team's last game and is out for this one (Out, Doubtful, Inactive,
//      IR or any reserve list) leaves his recent share of targets and carries to the players still active, whose
//      shares scale up together. An absence already a game old is in everyone's recent numbers and is not counted
//      again (the NFL injuries law: priced in once a game is missed).
//   2. THIS SEASON FIRST: from his third game this season his role is this season's alone (nflPlayerProfile).
//   3. SNAP TREND: his share of the offense's snaps over his last two games against his season, held within 0.8 to
//      1.25, moves his share the same way (four games or more).
import { normName } from '../darts/dartsCommon.js';
import { TEAM_NAMES } from '../nflStreaksService.js';

const OUT_STATUS = /^(out|doubtful|inactive|ir|pup|nfi|reserve)/i;
const MAX_VACATED = 0.6;
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** nflverse team abbreviation for a full team name ("Los Angeles Rams" → "LA"). */
export const abbrForTeam = (fullName) => Object.entries(TEAM_NAMES).find(([, name]) => name === fullName)?.[0] || null;

/** The names on one team's injury report who will not play this game. */
export function outNamesFor(injuries, teamFullName) {
  return (injuries || [])
    .filter((i) => i?.player?.team?.full_name === teamFullName && OUT_STATUS.test(String(i?.status || '').trim()))
    .map((i) => `${i.player.first_name || ''} ${i.player.last_name || ''}`.trim())
    .filter(Boolean);
}

/** One team's weekly rows this season (before `beforeWeek`) and its targets and carries per week. */
function teamWeeks(weekly, abbr, beforeWeek = Infinity) {
  const rows = (weekly || []).filter((r) => r.team === abbr && n(r.week) < beforeWeek);
  const totals = new Map();
  for (const r of rows) {
    const t = totals.get(n(r.week)) || { targets: 0, carries: 0 };
    t.targets += n(r.targets);
    t.carries += n(r.carries);
    totals.set(n(r.week), t);
  }
  return { rows, totals, lastWeek: totals.size ? Math.max(...totals.keys()) : null };
}

/** A player's share of his team's targets and carries over his last three games played, and whether he played its last one. */
function recentShare(team, name) {
  const mine = team.rows.filter((r) => normName(r.player_display_name) === name).sort((a, b) => n(b.week) - n(a.week)).slice(0, 3);
  let tg = 0, tt = 0, cr = 0, ct = 0;
  for (const r of mine) {
    const t = team.totals.get(n(r.week));
    tg += n(r.targets); tt += t.targets; cr += n(r.carries); ct += t.carries;
  }
  return {
    targets: tt > 0 ? tg / tt : 0,
    carries: ct > 0 ? cr / ct : 0,
    playedLast: mine.some((r) => n(r.week) === team.lastWeek && n(r.targets) + n(r.carries) > 0),
  };
}

/** The players out for this game who played the team's last one, and the share of targets and carries they leave. */
export function freshAbsences({ weekly, outNames, abbr, beforeWeek = Infinity }) {
  const team = teamWeeks(weekly, abbr, beforeWeek);
  if (team.lastWeek == null) return { players: [], targets: 0, carries: 0 };
  const players = [];
  for (const name of new Set((outNames || []).map(normName).filter(Boolean))) {
    const s = recentShare(team, name);
    if (!s.playedLast || (s.targets <= 0 && s.carries <= 0)) continue;
    players.push({ name, targets: s.targets, carries: s.carries });
  }
  return {
    players,
    targets: Math.min(MAX_VACATED, players.reduce((a, p) => a + p.targets, 0)),
    carries: Math.min(MAX_VACATED, players.reduce((a, p) => a + p.carries, 0)),
  };
}

/** The scale the active players' shares take when `vacated` of the team's targets (or carries) is out. */
export const vacatedScale = (vacated) => 1 / (1 - Math.min(MAX_VACATED, Math.max(0, n(vacated))));

/** His snap share over his last two games against his season, within 0.8 to 1.25; 1 before his fourth game. */
export function snapScale(list, beforeWeek = Infinity) {
  const games = (list || []).filter((g) => n(g.week) < beforeWeek && n(g.teamSnaps) > 0).sort((a, b) => n(b.week) - n(a.week));
  if (games.length < 4) return 1;
  const pct = (g) => n(g.snaps) / n(g.teamSnaps);
  const recent = (pct(games[0]) + pct(games[1])) / 2;
  const season = games.reduce((a, g) => a + pct(g), 0) / games.length;
  return season > 0 ? Math.min(1.25, Math.max(0.8, recent / season)) : 1;
}

/** The role inputs for one side of one game: the scales and who left them. */
export function sideRole({ weekly, injuries, teamFullName, outNames = null, beforeWeek = Infinity }) {
  const abbr = abbrForTeam(teamFullName);
  if (!abbr || !weekly) return { abbr, targetScale: 1, carryScale: 1, absences: [] };
  const absent = freshAbsences({ weekly, outNames: outNames ?? outNamesFor(injuries, teamFullName), abbr, beforeWeek });
  return { abbr, targetScale: vacatedScale(absent.targets), carryScale: vacatedScale(absent.carries), absences: absent.players };
}
