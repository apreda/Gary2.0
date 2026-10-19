/**
 * THE BETTOR'S DESK DATA (Oct 19 2026, the new NFL system): the facts a sharp reads before a game, each cut at the
 * moment of the pick. The line and how it got here (our line watch, six books), who starts at quarterback and what
 * he has done, how good each team is play after play with its rank, the season game by game with how both sides
 * played, and the spot. Facts only: nothing here weighs, scores or projects anything; what they mean is Gary's read.
 * Sources: odds_snapshots, nflverse (schedule, weekly team and player stats), the desk's quarterback lines.
 */
import { loadNflverseFile, NFLVERSE_TEAM_CODES } from '../../providers/nflverseService.js';
import { getNflSchedule, sideFacts, restPhrase, tripPhrase } from './nflSchedule.js';

const nameOf = Object.fromEntries(Object.entries(NFLVERSE_TEAM_CODES).map(([n, c]) => [c, n]));
export const codeOf = (team) => NFLVERSE_TEAM_CODES[team];
const teamName = (code) => nameOf[code] || code;
const n = (x) => Number(x) || 0;
const signed2 = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}`;
const one = (x) => x.toFixed(1);
const ord = (k) => `${k}${['th', 'st', 'nd', 'rd'][(k % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][k % 100] || 'th'}`;
const etDay = (d) => new Date(`${d}T16:00:00Z`).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
export const etDate = (when = new Date()) => new Date(when).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/** Everything the desk reads, loaded once per call. Unavailable files leave their sections out, said so. */
export async function loadBettorData(season) {
  const [schedule, tw, twLast, pw, pwLast] = await Promise.all([
    getNflSchedule().catch(() => null),
    loadNflverseFile('stats_team_week', season), loadNflverseFile('stats_team_week', season - 1),
    loadNflverseFile('stats_player_week', season), loadNflverseFile('stats_player_week', season - 1),
  ]);
  const rows = (f) => (f && !f.unavailable ? f.rows : null);
  return { season, schedule: schedule && !schedule.unavailable ? schedule.rows : [], teamWeek: { [season]: rows(tw), [season - 1]: rows(twLast) },
    playerWeek: { [season]: rows(pw), [season - 1]: rows(pwLast) } };
}

const played = (d, season, before) => d.schedule.filter((r) => r.season === String(season) && r.game_type === 'REG'
  && r.home_score !== '' && r.away_score !== '' && (!before || r.gameday < before));
const plays = (r) => n(r.attempts) + n(r.sacks_suffered) + n(r.carries);
const yards = (r) => n(r.passing_yards) - n(r.sack_yards_lost) + n(r.rushing_yards);
const epa = (r) => n(r.passing_epa) + n(r.rushing_epa);

/** One team's season before `before`: each game's result, score and how both sides played per play. */
export function teamGames(d, code, season, before) {
  const tw = d.teamWeek[season] || [];
  return played(d, season, before).filter((g) => g.home_team === code || g.away_team === code).map((g) => {
    const home = g.home_team === code; const opp = home ? g.away_team : g.home_team;
    const us = tw.find((r) => r.game_id === g.game_id && r.team === code); const them = tw.find((r) => r.game_id === g.game_id && r.team === opp);
    const pf = n(home ? g.home_score : g.away_score), pa = n(home ? g.away_score : g.home_score);
    return { g, home, opp, pf, pa, won: pf > pa, tied: pf === pa, week: Number(g.week), date: g.gameday,
      off: us ? { plays: plays(us), yards: yards(us), epa: epa(us) } : null, def: them ? { plays: plays(them), yards: yards(them), epa: epa(them) } : null };
  }).sort((a, b) => a.date.localeCompare(b.date));
}
const record = (gs) => { const w = gs.filter((x) => x.won).length, t = gs.filter((x) => x.tied).length; return `${w}-${gs.length - w - t}${t ? `-${t}` : ''}`; };
function totals(gs) {
  const sum = (side, k) => gs.reduce((a, x) => a + (x[side] ? x[side][k] : 0), 0);
  const op = sum('off', 'plays'), dp = sum('def', 'plays');
  return { n: gs.length, measured: gs.filter((x) => x.off && x.def).length, pf: gs.reduce((a, x) => a + x.pf, 0) / (gs.length || 1), pa: gs.reduce((a, x) => a + x.pa, 0) / (gs.length || 1),
    oe: op ? sum('off', 'epa') / op : null, oy: op ? sum('off', 'yards') / op : null, de: dp ? sum('def', 'epa') / dp : null, dy: dp ? sum('def', 'yards') / dp : null };
}
function league(d, season, before) {
  const codes = [...new Set(d.schedule.filter((r) => r.season === String(season)).flatMap((r) => [r.home_team, r.away_team]))];
  return Object.fromEntries(codes.map((c) => [c, totals(teamGames(d, c, season, before))]).filter(([, t]) => t.n));
}
const rankOf = (lg, code, k, high) => {
  const v = Object.entries(lg).filter(([, t]) => t[k] != null).sort((a, b) => (high ? b[1][k] - a[1][k] : a[1][k] - b[1][k]));
  return v.findIndex(([c]) => c === code) + 1;
};
function strengthLine(lg, code, label) {
  const t = lg[code]; if (!t) return `${label}: no games.`;
  if (t.oe == null) return `${label}: ${one(t.pf)} points a game, ${one(t.pa)} allowed (per-play numbers not published yet).`;
  return `${label}: ${one(t.pf)} points a game, ${one(t.pa)} allowed · offense ${signed2(t.oe)} EPA per play (${ord(rankOf(lg, code, 'oe', true))}), ${one(t.oy)} yards per play (${ord(rankOf(lg, code, 'oy', true))}) · defense ${signed2(t.de)} EPA per play allowed (${ord(rankOf(lg, code, 'de', false))}), ${one(t.dy)} yards per play allowed (${ord(rankOf(lg, code, 'dy', false))})${t.measured < t.n ? ` (per-play figures cover ${t.measured} of ${t.n} games)` : ''}`;
}

/** HOW GOOD THEY ARE: this season to date with ranks among all 32, and last season in full. */
export function strength(d, team, before) {
  const c = codeOf(team); const { season } = d;
  const gs = teamGames(d, c, season, before);
  const now = league(d, season, before); const last = league(d, season - 1, null);
  const split = gs.length ? `, ${[gs.some((x) => x.home) ? `${record(gs.filter((x) => x.home))} at home` : null, gs.some((x) => !x.home) ? `${record(gs.filter((x) => !x.home))} on the road` : null].filter(Boolean).join(', ')}` : '';
  return [`${team} (${record(gs)}${split})`,
    `  ${strengthLine(now, c, `This season, ${gs.length} game${gs.length === 1 ? '' : 's'}`)}`,
    `  ${strengthLine(last, c, `Last season (${season - 1}), ${record(teamGames(d, c, season - 1, null))}`)}`].join('\n');
}

/** THIS SEASON GAME BY GAME: result and score with how each side played per play; the opponent's record now. */
export function gameByGame(d, team, before) {
  const c = codeOf(team); const gs = teamGames(d, c, d.season, before);
  if (!gs.length) return `${team}: no games played yet this season.`;
  return [`${team}, newest first:`, ...gs.slice().reverse().map((x) => {
    const how = x.off && x.def
      ? ` · offense ${signed2(x.off.epa / (x.off.plays || 1))} EPA/play, ${one(x.off.yards / (x.off.plays || 1))} yds/play; defense allowed ${signed2(x.def.epa / (x.def.plays || 1))}, ${one(x.def.yards / (x.def.plays || 1))}`
      : ' · per-play numbers not published yet';
    return `  Wk ${x.week} · ${etDay(x.date)} · ${x.home ? 'vs' : '@'} ${teamName(x.opp)} (${record(teamGames(d, x.opp, d.season, before))}) · ${x.won ? 'W' : x.tied ? 'T' : 'L'} ${x.pf}-${x.pa}${how}`;
  })].join('\n');
}

const passing = (rows) => {
  const g = rows.filter((r) => n(r.attempts) >= 8); if (!g.length) return null;
  const s = (k) => g.reduce((a, r) => a + n(r[k]), 0); const drops = s('attempts') + s('sacks_suffered');
  return `${g.length} game${g.length === 1 ? '' : 's'} · ${(100 * s('completions') / (s('attempts') || 1)).toFixed(1)}% · ${(s('passing_yards') / (s('attempts') || 1)).toFixed(1)} yds/att · ${s('passing_tds')} TD, ${s('passing_interceptions')} INT · ${signed2(s('passing_epa') / (drops || 1))} EPA per dropback`;
};
/** The desk's starter for each team ("[HOME] Team: Name (…"), the starts so far, his own passing this season and last. */
export function quarterbacks(d, deskQbSection, homeTeam, awayTeam, before) {
  const { season } = d; const out = [];
  for (const team of [awayTeam, homeTeam]) {
    const m = String(deskQbSection || '').match(new RegExp(`\\] ${team.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: ([^(\\n]+?) \\(`));
    const qb = m ? m[1].trim() : null;
    const gs = teamGames(d, codeOf(team), season, before);
    const starts = {}; for (const x of gs) { const nm = x.home ? x.g.home_qb_name : x.g.away_qb_name; if (nm) starts[nm] = (starts[nm] || 0) + 1; }
    const who = Object.entries(starts).sort((a, b) => b[1] - a[1]).map(([nm, k]) => `${nm} ${k}`).join(', ');
    const last = qb ? qb.split(' ').at(-1) : null;
    const hasStarted = qb && Object.keys(starts).some((nm) => nm.endsWith(last));
    const ids = new Set(played(d, season, before).map((g) => g.game_id));
    const his = (yr) => (d.playerWeek[yr] || []).filter((r) => r.position === 'QB' && r.player_display_name === qb && (yr !== season || ids.has(r.game_id)));
    const lines = [`${team}: ${qb || 'starter not on the desk'}`];
    if (gs.length) lines.push(`  started this season: ${who || 'not recorded'}${qb && !hasStarted ? ` · this is ${qb}'s first start of the season` : ''}`);
    if (qb) { lines.push(`  ${qb} this season: ${passing(his(season)) || 'no games with 8+ passes'}`); lines.push(`  ${qb} last season: ${passing(his(season - 1)) || 'no games with 8+ passes'}`); }
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

/** The line's path from the line watch: the six-book median at each poll, from the first board to `until`. */
export async function linePath(db, gameId, until = new Date()) {
  if (!db || gameId == null) return null;
  const { data, error } = await db.from('odds_snapshots')
    .select('seen_at,line_vendor,spread_home,moneyline_home,moneyline_away,total')
    .eq('sport', 'americanfootball_nfl').eq('game_id', String(gameId)).lte('seen_at', new Date(until).toISOString())
    .order('seen_at').limit(5000);
  if (error || !data?.length) return null;
  const latest = new Map(); const path = []; let last = null;
  const board = (at) => { const rs = [...latest.values()]; return { at, spread_home: half(median(rs.map((x) => x.spread_home))), total: half(median(rs.map((x) => x.total))), ml_home: median(rs.map((x) => x.moneyline_home)), ml_away: median(rs.map((x) => x.moneyline_away)), books: rs.length }; };
  for (const r of data) {
    latest.set(r.line_vendor, r); const b = board(r.seen_at);
    if (!last || b.spread_home !== last.spread_home || b.total !== last.total) { path.push(b); last = b; }
  }
  return { path, now: board(new Date(until).toISOString()) };
}

/** The ticket's own spread from THE LINE ("Spread: A +3.0 (-105) | B -3.0 (-115)"), as the favorite and points. */
export function ticketSpread(line, homeTeam, awayTeam) {
  const m = String(line || '').match(/^Spread: (.+?) ([+-]?\d+(?:\.\d+)?|PK) \([^)]*\) \| (.+?) ([+-]?\d+(?:\.\d+)?|PK) \(/m);
  if (!m) return null;
  const pts = (x) => (x === 'PK' ? 0 : Number(x));
  const a = { team: m[1].trim(), pts: pts(m[2]) }, b = { team: m[3].trim(), pts: pts(m[4]) };
  const home = [a, b].find((x) => x.team === homeTeam) || (a.team === awayTeam ? b : a);
  return { home: home.pts };
}

/** The path in words: where it opened, each spread move (one per poll), where it is now, and the ticket's number when
 * its book differs from the median (Oct 19 2026: Saints @ Lions, the card said 6.5 and the path said 7). */
export function lineStory(lines, homeTeam, awayTeam, ticketLine = null) {
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
    kept.length ? `Spread moves since (median of the books we watch):\n${kept.join('\n')}` : 'The spread has not moved since it opened.',
    `Now: ${side(lines.now.spread_home)}, total ${lines.now.total} (opened ${open.total}) · moneylines ${awayTeam} ${ml(lines.now.ml_away)}, ${homeTeam} ${ml(lines.now.ml_home)}`,
    ...(() => { const t = ticketSpread(ticketLine, homeTeam, awayTeam); return t && t.home !== lines.now.spread_home ? [`The ticket on this game is ${side(t.home)}: its book's number, not the median of the books.`] : []; })()].join('\n');
}
