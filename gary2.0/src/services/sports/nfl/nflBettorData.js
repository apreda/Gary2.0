/**
 * THE BETTOR'S DESK DATA (Oct 19 2026, the new NFL system): the facts a sharp reads before a game, each cut at the
 * moment of the pick. The line and how it got here (our line watch, six books), who starts at quarterback and what
 * he has done, how each team has scored and moved the ball (with this week's starter apart from the games someone
 * else started), the season game by game with who started at quarterback, and the spot. This season only: no last
 * season and no per-play numbers (founder, Oct 23 2026: "last season is old news"; TNF's reads took the Patriots off
 * last year's 14-3 and a per-play table that blended the Bears' three backup starts). Facts only: nothing here
 * weighs, scores or projects anything; what they mean is Gary's read.
 * Sources: odds_snapshots, nflverse (schedule, weekly team and player stats), the desk's quarterback lines.
 */
import { loadNflverseFile, NFLVERSE_TEAM_CODES } from '../../providers/nflverseService.js';
import { getNflSchedule, sideFacts, restPhrase, tripPhrase } from './nflSchedule.js';

const nameOf = Object.fromEntries(Object.entries(NFLVERSE_TEAM_CODES).map(([n, c]) => [c, n]));
export const codeOf = (team) => NFLVERSE_TEAM_CODES[team];
const teamName = (code) => nameOf[code] || code;
const n = (x) => Number(x) || 0;
const one = (x) => x.toFixed(1);
const etDay = (d) => new Date(`${d}T16:00:00Z`).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
export const etDate = (when = new Date()) => new Date(when).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/** Everything the desk reads, loaded once per call. Unavailable files leave their sections out, said so. */
export async function loadBettorData(season) {
  const [schedule, tw, pw] = await Promise.all([
    getNflSchedule().catch(() => null), loadNflverseFile('stats_team_week', season), loadNflverseFile('stats_player_week', season),
  ]);
  const rows = (f) => (f && !f.unavailable ? f.rows : null);
  return { season, schedule: schedule && !schedule.unavailable ? schedule.rows : [], teamWeek: rows(tw), playerWeek: rows(pw) };
}

const played = (d, season, before) => d.schedule.filter((r) => r.season === String(season) && r.game_type === 'REG'
  && r.home_score !== '' && r.away_score !== '' && (!before || r.gameday < before));
const yards = (r) => n(r.passing_yards) - n(r.sack_yards_lost) + n(r.rushing_yards);
const starterOf = (x) => (x.home ? x.g.home_qb_name : x.g.away_qb_name) || null;

/** One team's season before `before`: each game's result, score, yards both ways and who started at quarterback. */
export function teamGames(d, code, season, before) {
  const tw = d.teamWeek || [];
  return played(d, season, before).filter((g) => g.home_team === code || g.away_team === code).map((g) => {
    const home = g.home_team === code; const opp = home ? g.away_team : g.home_team;
    const us = tw.find((r) => r.game_id === g.game_id && r.team === code); const them = tw.find((r) => r.game_id === g.game_id && r.team === opp);
    const pf = n(home ? g.home_score : g.away_score), pa = n(home ? g.away_score : g.home_score);
    return { g, home, opp, pf, pa, won: pf > pa, tied: pf === pa, week: Number(g.week), date: g.gameday,
      off: us ? { yards: yards(us) } : null, def: them ? { yards: yards(them) } : null };
  }).sort((a, b) => a.date.localeCompare(b.date));
}
const record = (gs) => { const w = gs.filter((x) => x.won).length, t = gs.filter((x) => x.tied).length; return `${w}-${gs.length - w - t}${t ? `-${t}` : ''}`; };
// Points a game both ways, and yards a game where the weekly stats are published.
function perGame(gs) {
  const avg = (xs, f) => xs.reduce((a, x) => a + f(x), 0) / xs.length;
  const m = gs.filter((x) => x.off && x.def);
  return `${one(avg(gs, (x) => x.pf))} points a game, ${one(avg(gs, (x) => x.pa))} allowed${m.length ? ` · ${Math.round(avg(m, (x) => x.off.yards))} yards a game, ${Math.round(avg(m, (x) => x.def.yards))} allowed` : ''}`;
}

/** HOW GOOD THEY ARE: this season to date; when this week's starter (`qb`) missed games, the team with him apart from
 * the games someone else started. */
export function strength(d, team, before, qb = null) {
  const gs = teamGames(d, codeOf(team), d.season, before);
  if (!gs.length) return `${team}: no games played yet this season.`;
  const split = [gs.some((x) => x.home) ? `${record(gs.filter((x) => x.home))} at home` : null, gs.some((x) => !x.home) ? `${record(gs.filter((x) => !x.home))} on the road` : null].filter(Boolean).join(', ');
  const lines = [`${team} (${record(gs)}, ${split})`, `  This season, ${gs.length} game${gs.length === 1 ? '' : 's'}: ${perGame(gs)}`];
  const last = qb ? qb.split(' ').at(-1) : null;
  const his = last ? gs.filter((x) => String(starterOf(x) || '').endsWith(last)) : []; const rest = gs.filter((x) => !his.includes(x));
  if (his.length && rest.length) {
    const others = [...new Set(rest.map(starterOf).filter(Boolean))].join(', ') || 'other quarterbacks';
    lines.push(`  With ${qb} starting, ${his.length} game${his.length === 1 ? '' : 's'}: ${record(his)}, ${perGame(his)}`,
      `  With ${others} starting, ${rest.length} game${rest.length === 1 ? '' : 's'}: ${record(rest)}, ${perGame(rest)}`);
  }
  return lines.join('\n');
}

/** THIS SEASON GAME BY GAME: result and score, who started at quarterback, yards both ways; the opponent's record now. */
export function gameByGame(d, team, before) {
  const c = codeOf(team); const gs = teamGames(d, c, d.season, before);
  if (!gs.length) return `${team}: no games played yet this season.`;
  return [`${team}, newest first:`, ...gs.slice().reverse().map((x) => {
    const qb = starterOf(x) ? ` · ${starterOf(x)} at QB` : '';
    const how = x.off && x.def ? ` · ${Math.round(x.off.yards)} yards, allowed ${Math.round(x.def.yards)}` : '';
    return `  Wk ${x.week} · ${etDay(x.date)} · ${x.home ? 'vs' : '@'} ${teamName(x.opp)} (${record(teamGames(d, x.opp, d.season, before))}) · ${x.won ? 'W' : x.tied ? 'T' : 'L'} ${x.pf}-${x.pa}${qb}${how}`;
  })].join('\n');
}

const passing = (rows) => {
  const g = rows.filter((r) => n(r.attempts) >= 8); if (!g.length) return null;
  const s = (k) => g.reduce((a, r) => a + n(r[k]), 0);
  return `${g.length} game${g.length === 1 ? '' : 's'} · ${(100 * s('completions') / (s('attempts') || 1)).toFixed(1)}% · ${(s('passing_yards') / (s('attempts') || 1)).toFixed(1)} yds/att · ${s('passing_tds')} TD, ${s('passing_interceptions')} INT`;
};
/** The desk's starter for a team ("[HOME] Team: Name (…"), or null. */
export function deskStarter(deskQbSection, team) {
  const m = String(deskQbSection || '').match(new RegExp(`\\] ${team.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: ([^(\\n]+?) \\(`));
  return m ? m[1].trim() : null;
}
/** The desk's starter for each team, the starts so far and his own passing this season. */
export function quarterbacks(d, deskQbSection, homeTeam, awayTeam, before) {
  const { season } = d; const out = [];
  for (const team of [awayTeam, homeTeam]) {
    const qb = deskStarter(deskQbSection, team);
    const gs = teamGames(d, codeOf(team), season, before);
    const starts = {}; for (const x of gs) { const nm = x.home ? x.g.home_qb_name : x.g.away_qb_name; if (nm) starts[nm] = (starts[nm] || 0) + 1; }
    const who = Object.entries(starts).sort((a, b) => b[1] - a[1]).map(([nm, k]) => `${nm} ${k}`).join(', ');
    const last = qb ? qb.split(' ').at(-1) : null;
    const hasStarted = qb && Object.keys(starts).some((nm) => nm.endsWith(last));
    const ids = new Set(played(d, season, before).map((g) => g.game_id));
    const his = (d.playerWeek || []).filter((r) => r.position === 'QB' && r.player_display_name === qb && ids.has(r.game_id));
    const lines = [`${team}: ${qb || 'starter not on the desk'}`];
    if (gs.length) lines.push(`  started this season: ${who || 'not recorded'}${qb && !hasStarted ? ` · this is ${qb}'s first start of the season` : ''}`);
    if (qb) lines.push(`  ${qb} this season: ${passing(his) || 'no games with 8+ passes'}`);
    out.push(lines.join('\n'));
  }
  return out.join('\n');
}

/** The spot: rest and travel for each side, from the schedule. */
export function spot(d, homeTeam, awayTeam, gameDate) {
  const hc = codeOf(homeTeam), ac = codeOf(awayTeam);
  const row = d.schedule.find((r) => r.season === String(d.season) && r.home_team === hc && r.away_team === ac && r.gameday === gameDate)
    || d.schedule.find((r) => r.season === String(d.season) && r.home_team === hc && r.away_team === ac && r.home_score === '');
  const lines = [row?.div_game === '1' ? 'A division game.' : null];
  for (const [team, code] of [[awayTeam, ac], [homeTeam, hc]]) {
    const f = row ? sideFacts(row, code) : null;
    const bits = [f ? restPhrase(f.rest) : null, f ? (tripPhrase(f) || (f.atHome ? 'at home' : null)) : null].filter(Boolean);
    if (bits.length) lines.push(`${team}: ${bits.join(' · ')}`);
  }
  return { text: lines.filter(Boolean).join('\n'), neutral: row?.location === 'Neutral' ? row.stadium : null };
}

// ── THE LINE AND HOW IT GOT HERE ───────────────────────────────────────────
const median = (xs) => { const s = xs.filter((x) => x != null && Number.isFinite(Number(x))).map(Number).sort((a, b) => a - b); if (!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const half = (x) => (x == null ? null : Math.round(x * 2) / 2);

// The ticket's book: the first of these the line watch has for the game, the order oddsService walks to price a pick.
const TICKET_BOOKS = ['fanduel', 'draftkings', 'betrivers', 'caesars', 'betmgm', 'fanatics', 'betway', 'ballybet', 'betparx', 'rebet'];

/** The line's path from the line watch, from the first board to `until`, at the ticket's own book, so the path ends on
 * the number Gary bets (a six-book median beside the ticket gave him two numbers half a point apart, and he argued the
 * half point). Falls back to the median of the books when none of the ticket's books is on file. College and the NBA
 * read their own games' paths through `sport`, at the ticket's own `book` when the game names it (Oct 21 2026). */
export async function linePath(db, gameId, until = new Date(), sport = 'americanfootball_nfl', book = null) {
  if (!db || gameId == null) return null;
  const { data: rows, error } = await db.from('odds_snapshots')
    .select('seen_at,line_vendor,spread_home,moneyline_home,moneyline_away,total')
    .eq('sport', sport).eq('game_id', String(gameId)).lte('seen_at', new Date(until).toISOString())
    .order('seen_at').limit(5000);
  if (error || !rows?.length) return null;
  const vendor = [String(book || '').toLowerCase(), ...TICKET_BOOKS].find((b) => b && rows.some((r) => r.line_vendor === b));
  const data = vendor ? rows.filter((r) => r.line_vendor === vendor) : rows;
  const latest = new Map(); const path = []; let last = null;
  const board = (at) => { const rs = [...latest.values()]; return { at, spread_home: half(median(rs.map((x) => x.spread_home))), total: half(median(rs.map((x) => x.total))), ml_home: median(rs.map((x) => x.moneyline_home)), ml_away: median(rs.map((x) => x.moneyline_away)), books: rs.length }; };
  for (const r of data) {
    latest.set(r.line_vendor, r); const b = board(r.seen_at);
    if (!last || b.spread_home !== last.spread_home || b.total !== last.total) { path.push(b); last = b; }
  }
  return { path, now: board(new Date(until).toISOString()) };
}

/** The path in words: where it opened, each spread move (one per poll) and where it is now. The ticket's own book is
 * not set against the median: a note that it was half a point better became the main reason for 8 of 23 test board
 * bets, and half a point decides only the games that land on the number. */
export function lineStory(lines, homeTeam, awayTeam) {
  if (!lines?.now || !lines.path?.length) return 'No line history on file for this game.';
  const side = (h) => (h == null ? '?' : h === 0 ? "pick'em" : h < 0 ? `${homeTeam} ${h}` : `${awayTeam} -${h}`);
  const when = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const ml = (x) => (x == null ? '?' : x > 0 ? `+${Math.round(x)}` : `${Math.round(x)}`);
  const open = lines.path[0];
  // Books update seconds apart; moves inside the same minute collapse to the last.
  const polls = [];
  for (const p of lines.path.slice(1)) { const k = p.at.slice(0, 16); if (polls.length && polls.at(-1).k === k) polls[polls.length - 1] = { k, p }; else polls.push({ k, p }); }
  const moves = []; let prev = open.spread_home;
  for (const { p } of polls) { if (p.spread_home !== prev) { moves.push(`  ${when(p.at)}: ${side(p.spread_home)}`); prev = p.spread_home; } }
  const kept = moves.length > 12 ? [...moves.slice(0, 4), `  … ${moves.length - 8} more moves …`, ...moves.slice(-4)] : moves;
  return [`Opened (${when(open.at)}): ${side(open.spread_home)}, total ${open.total}`,
    kept.length ? `Spread moves since:\n${kept.join('\n')}` : 'The spread has not moved since it opened.',
    `Now: ${side(lines.now.spread_home)}, total ${lines.now.total} (opened ${open.total}) · moneylines ${awayTeam} ${ml(lines.now.ml_away)}, ${homeTeam} ${ml(lines.now.ml_home)}`].join('\n');
}
