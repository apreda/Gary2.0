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
  const [schedule, tw, pw, sc, rw] = await Promise.all([
    getNflSchedule().catch(() => null), loadNflverseFile('stats_team_week', season), loadNflverseFile('stats_player_week', season),
    loadNflverseFile('snap_counts', season).catch(() => null), loadNflverseFile('roster_weekly', season).catch(() => null),
  ]);
  const rows = (f) => (f && !f.unavailable ? f.rows : null);
  return { season, schedule: schedule && !schedule.unavailable ? schedule.rows : [], teamWeek: rows(tw), playerWeek: rows(pw), snaps: rows(sc), rosterWeekly: rows(rw) };
}

const played = (d, season, before) => d.schedule.filter((r) => r.season === String(season) && r.game_type === 'REG'
  && r.home_score !== '' && r.away_score !== '' && (!before || r.gameday < before));
// Net yards: passing less the yards lost on sacks, plus rushing. The feed carries sack yards as a negative number, so
// subtracting it as printed added them back (Oct 23 2026 data check: the Patriots read 390 gained and 338 allowed
// against the official 374 and 301; the more sacks, the bigger the error).
const yards = (r) => n(r.passing_yards) - Math.abs(n(r.sack_yards_lost)) + n(r.rushing_yards);
// Who played quarterback in a game: everyone who threw 5 or more passes for the team, most first, from the weekly
// player stats. The schedule's own quarterback field named Case Keenum for the Bears' Week 4 game that Tyson Bagent
// played start to finish (Oct 23 2026 data check), and it is never used in its place (founder, Oct 23: no fallback that
// gives different data when the source fails): without the player stats, who played says "not on file".
function passersOf(d, g, code) {
  return (d.playerWeek || []).filter((r) => r.game_id === g.game_id && r.team === code && n(r.attempts) >= 5)
    .sort((a, b) => n(b.attempts) - n(a.attempts));
}
const starterOf = (x) => x.qb || null;
// The same quarterback under two spellings: suffixes and punctuation aside, the same last name and first initial
// ("Michael Penix Jr." / "Michael Penix", "Cam Ward" / "Cameron Ward", "C.J. Stroud" / "CJ Stroud").
const qbKey = (name) => String(name || '').toLowerCase().replace(/\b(?:jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z ]/g, '').trim().split(/\s+/);
export function sameQb(a, b) {
  const x = qbKey(a), y = qbKey(b);
  if (!x[0] || !y[0]) return false;
  return x.join('') === y.join('') || (x.at(-1) === y.at(-1) && x[0][0] === y[0][0]);
}

/** One team's season before `before`: each game's result, score, yards both ways and who started at quarterback. */
export function teamGames(d, code, season, before) {
  const tw = d.teamWeek || [];
  return played(d, season, before).filter((g) => g.home_team === code || g.away_team === code).map((g) => {
    const home = g.home_team === code; const opp = home ? g.away_team : g.home_team;
    const us = tw.find((r) => r.game_id === g.game_id && r.team === code); const them = tw.find((r) => r.game_id === g.game_id && r.team === opp);
    const pf = n(home ? g.home_score : g.away_score), pa = n(home ? g.away_score : g.home_score);
    const passers = passersOf(d, g, code);
    // Who the opponent had at quarterback: Atlanta's loss to a 4-1 Baltimore was to Tyler Huntley, Lamar Jackson out
    // (Oct 23 2026 data check).
    const oppQb = passersOf(d, g, opp)[0]?.player_display_name || null;
    return { g, home, opp, pf, pa, won: pf > pa, tied: pf === pa, week: Number(g.week), date: g.gameday, passers, oppQb,
      qb: passers[0]?.player_display_name || null,
      off: us ? { yards: yards(us) } : null, def: them ? { yards: yards(them) } : null };
  }).sort((a, b) => a.date.localeCompare(b.date));
}
const record = (gs) => { const w = gs.filter((x) => x.won).length, t = gs.filter((x) => x.tied).length; return `${w}-${gs.length - w - t}${t ? `-${t}` : ''}`; };
// Points a game both ways, and yards a game where the weekly stats are published. Five games or fewer are listed game by
// game instead: an average of two carried by one blowout read as who the team is (Oct 23 2026 data check: "with
// Williams, 31.0 points a game" was 59, 3 and 31).
const VALUES_UP_TO = 5;
function perGame(gs) {
  if (gs.length <= VALUES_UP_TO) return gs.map((x) => `${x.won ? 'W' : x.tied ? 'T' : 'L'} ${x.pf}-${x.pa}${x.off && x.def ? ` (${Math.round(x.off.yards)} yards, allowed ${Math.round(x.def.yards)})` : ''}`).join(', ');
  const avg = (xs, f) => xs.reduce((a, x) => a + f(x), 0) / xs.length;
  const m = gs.filter((x) => x.off && x.def);
  return `${one(avg(gs, (x) => x.pf))} points a game, ${one(avg(gs, (x) => x.pa))} allowed${m.length ? ` · ${Math.round(avg(m, (x) => x.off.yards))} yards a game, ${Math.round(avg(m, (x) => x.def.yards))} allowed` : ''}`;
}

/** HOW GOOD THEY ARE: this season to date; when this week's starter (`qb`) missed games, the team with him apart from
 * the games someone else played quarterback (whoever threw the most passes). */
// One game relative to this week's quarterback: his game when he threw 75%+ of the passes, shared when he threw fewer,
// without him when he threw none (Oct 23 2026 data audit: a backups-only game sat in "shared" and the Falcons read
// 0-1 without Penix when they were 0-2). Without passing rows, the schedule's quarterback decides.
function qbRole(x, qb) {
  if (!x.passers.length) return 'unknown';
  const his = x.passers.find((r) => sameQb(r.player_display_name, qb));
  if (!his) return 'without';
  return n(his.attempts) >= 0.75 * x.passers.reduce((a, r) => a + n(r.attempts), 0) ? 'with' : 'shared';
}
const passerLine = (x) => x.passers.map((r) => `${r.player_display_name} ${n(r.completions)}-of-${n(r.attempts)}`).join(', ');

/** HOW GOOD THEY ARE: when this week's starter (`qb`) missed or shared games, his games first, then the games without
 * him, then the shared ones, then the season as a whole (the season line leading read as who the team is). */
export function strength(d, team, before, qb = null) {
  const gs = teamGames(d, codeOf(team), d.season, before);
  if (!gs.length) return `${team}: no games played yet this season.`;
  const split = [gs.some((x) => x.home) ? `${record(gs.filter((x) => x.home))} at home` : null, gs.some((x) => !x.home) ? `${record(gs.filter((x) => !x.home))} on the road` : null].filter(Boolean).join(', ');
  const games = (k) => `${k} game${k === 1 ? '' : 's'}`;
  const season = `  This season, ${games(gs.length)}: ${perGame(gs)}`;
  const lines = [`${team} (${record(gs)}, ${split})`];
  const by = (role) => (qb ? gs.filter((x) => qbRole(x, qb) === role) : []);
  const his = by('with'), without = by('without'), both = by('shared'), unknown = by('unknown');
  if (unknown.length) lines.push(`  Who played quarterback is not on file for ${games(unknown.length)} (the weekly player stats did not load), so no split by quarterback is shown.`);
  if (unknown.length) return [...lines, season].join('\n');
  if (!qb || (!without.length && !both.length)) return [...lines, season].join('\n');
  const others = [...new Set(without.map(starterOf).filter(Boolean))].join(', ') || 'other quarterbacks';
  if (his.length) lines.push(`  With ${qb} at quarterback, ${games(his.length)}: ${record(his)}, ${perGame(his)}`);
  else lines.push(`  ${qb} has not played a full game at quarterback this season.`);
  if (without.length) lines.push(`  Without him (${others} at quarterback), ${games(without.length)}: ${record(without)}, ${perGame(without)}`);
  if (both.length) lines.push(`  Shared at quarterback, ${games(both.length)}: ${both.map((x) => `Wk ${x.week} ${x.won ? 'W' : x.tied ? 'T' : 'L'} ${x.pf}-${x.pa} (${passerLine(x)})`).join('; ')}`);
  return [...lines, season].join('\n');
}

// Who was missing and who came back, game by game, from the snap counts and the weekly rosters (Oct 23 2026 data checks:
// TNF's data never said Kyler Gordon was back for the Bears, which Patriots regulars were out, or that A.J. Brown, hurt
// in Week 1, spent Weeks 2-5 on reserve). Each game is read against the games before it only: a regular there played
// 60%+ of his side's snaps in at least half the earlier games; he is missing when he played under 10%. Anyone who
// played a quarter of the snaps in an earlier game and is on reserve that week is listed as on reserve; back is the
// first game at a quarter or more after a game under 10%; new is a first game at a quarter or more this season.
// Players are matched on their PFR id and named as the latest snap row names them; positions are that game's.
function lineupChanges(d, code, gs) {
  const ids = new Set(gs.map((g) => g.g.game_id));
  const rows = (d.snaps || []).filter((r) => r.team === code && ids.has(r.game_id) && r.pfr_player_id);
  if (!rows.length || !gs.length) return new Map();
  const share = new Map(), posAt = new Map(), name = new Map();
  for (const r of rows) {
    share.set(`${r.game_id}|${r.pfr_player_id}`, Math.max(n(r.offense_pct), n(r.defense_pct)));
    posAt.set(`${r.game_id}|${r.pfr_player_id}`, r.position);
    const prev = name.get(r.pfr_player_id);
    if (!prev || n(r.week) >= prev.week) name.set(r.pfr_player_id, { week: n(r.week), name: r.player, pos: r.position });
  }
  const reserve = new Map();
  for (const r of d.rosterWeekly || []) if (r.team === code && r.pfr_id && /^RES$/i.test(r.status)) reserve.set(`${n(r.week)}|${r.pfr_id}`, r.status_description_abbr || 'RES');
  const onReserve = (g, id) => reserve.has(`${g.week}|${id}`);
  const players = [...name.keys()];
  const of = (g, id) => share.get(`${g.g.game_id}|${id}`) || 0;
  const label = (g, id, pct, extra = '') => `${name.get(id).name} (${posAt.get(`${g.g.game_id}|${id}`) || name.get(id).pos}${pct ? `, ${Math.round(100 * of(g, id))}% of snaps` : ''}${extra})`;
  const list = (ps, f) => ps.slice(0, 8).map(f).join(', ') + (ps.length > 8 ? ` and ${ps.length - 8} more` : '');
  const out = new Map();
  gs.forEach((g, i) => {
    const prior = gs.slice(0, i);
    const regular = (id) => prior.length > 0 && prior.filter((e) => of(e, id) >= 0.6).length >= Math.ceil(prior.length / 2);
    const missing = players.filter((id) => regular(id) && of(g, id) < 0.1);
    const reserved = players.filter((id) => !missing.includes(id) && onReserve(g, id) && of(g, id) < 0.1 && prior.some((e) => of(e, id) >= 0.25));
    const back = i ? players.filter((id) => of(g, id) >= 0.25 && of(gs[i - 1], id) < 0.1 && prior.some((e) => of(e, id) >= 0.25)) : [];
    const fresh = i ? players.filter((id) => of(g, id) >= 0.25 && prior.every((e) => of(e, id) < 0.1)) : [];
    const parts = [
      missing.length ? `missing regulars: ${list(missing, (id) => `${name.get(id).name} (${name.get(id).pos}${onReserve(g, id) ? ', on reserve' : ''})`)}` : null,
      reserved.length ? `on reserve: ${list(reserved, (id) => `${name.get(id).name} (${name.get(id).pos})`)}` : null,
      back.length ? `back: ${list(back, (id) => label(g, id, true))}` : null,
      fresh.length ? `new in the lineup: ${list(fresh, (id) => label(g, id, true, prior.length && prior.every((e) => onReserve(e, id)) ? ', off reserve' : ''))}` : null,
    ].filter(Boolean);
    out.set(g.g.game_id, parts.join(' · '));
  });
  return out;
}

/** THIS SEASON GAME BY GAME: result and score, who played quarterback (everyone with 5+ passes), yards both ways, and
 * which regulars were missing or back; the opponent's record now. */
export function gameByGame(d, team, before) {
  const c = codeOf(team); const gs = teamGames(d, c, d.season, before);
  if (!gs.length) return `${team}: no games played yet this season.`;
  const changes = lineupChanges(d, c, gs);
  return [`${team}, newest first:`, ...gs.slice().reverse().map((x) => {
    const qb = x.passers.length ? ` · QB ${x.passers.map((r) => `${r.player_display_name} ${n(r.completions)}-of-${n(r.attempts)}`).join(', ')}`
      : ' · QB not on file';
    const how = x.off && x.def ? ` · ${Math.round(x.off.yards)} yards, allowed ${Math.round(x.def.yards)}` : '';
    const who = changes.get(x.g.game_id);
    return `  Wk ${x.week} · ${etDay(x.date)} · ${x.home ? 'vs' : '@'} ${teamName(x.opp)} (${record(teamGames(d, x.opp, d.season, before))} now${x.oppQb ? `; ${x.oppQb} at QB that day` : ''}) · ${x.won ? 'W' : x.tied ? 'T' : 'L'} ${x.pf}-${x.pa}${qb}${how}${who ? `\n      ${who}` : ''}`;
  })].join('\n');
}

const passing = (rows) => {
  const g = rows.filter((r) => n(r.attempts) >= 8); if (!g.length) return null;
  const s = (k) => g.reduce((a, r) => a + n(r[k]), 0);
  const relief = rows.filter((r) => n(r.attempts) > 0 && n(r.attempts) < 8);
  const short = relief.length ? ` (plus ${relief.length} game${relief.length === 1 ? '' : 's'} with fewer passes: ${relief.reduce((a, r) => a + n(r.completions), 0)}-of-${relief.reduce((a, r) => a + n(r.attempts), 0)}, ${relief.reduce((a, r) => a + n(r.passing_interceptions), 0)} INT)` : '';
  return `${g.length} game${g.length === 1 ? '' : 's'} with 8+ passes · ${(100 * s('completions') / (s('attempts') || 1)).toFixed(1)}% · ${(s('passing_yards') / (s('attempts') || 1)).toFixed(1)} yds/att · ${s('passing_tds')} TD, ${s('passing_interceptions')} INT${short}`;
};
/** The desk's starter for a team ("[HOME] Team: Name (…"), or null. */
export function deskStarter(deskQbSection, team) {
  const m = String(deskQbSection || '').match(new RegExp(`\\] ${team.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: ([^(\\n]+?)(?: \\(|\\s*$)`, 'm'));
  return m ? m[1].trim() : null;
}
/** The desk's starter for each team, the starts so far and his own passing this season. */
export function quarterbacks(d, deskQbSection, homeTeam, awayTeam, before) {
  const { season } = d; const out = [];
  for (const team of [awayTeam, homeTeam]) {
    const qb = deskStarter(deskQbSection, team);
    const gs = teamGames(d, codeOf(team), season, before);
    // The same count as HOW GOOD: his full games, shared games, and the games without him by who played.
    const roles = qb ? gs.map((x) => qbRole(x, qb)) : [];
    const k = (role) => roles.filter((r) => r === role).length;
    const others = {}; gs.forEach((x, i) => { if (!qb || roles[i] === 'without') { const nm = starterOf(x); if (nm) others[nm] = (others[nm] || 0) + 1; } });
    const otherList = Object.entries(others).sort((a, b) => b[1] - a[1]).map(([nm, c]) => `${nm} ${c}`).join(', ');
    const who = k('unknown') ? 'not on file (the weekly player stats did not load)'
      : qb ? [`${qb} ${k('with')}`, k('shared') ? `shared ${k('shared')}` : null, otherList ? `without him: ${otherList}` : null].filter(Boolean).join(' · ') : otherList;
    const hasStarted = !qb || k('unknown') > 0 || k('with') > 0 || k('shared') > 0;
    const ids = new Set(played(d, season, before).map((g) => g.game_id));
    const his = (d.playerWeek || []).filter((r) => r.position === 'QB' && sameQb(r.player_display_name, qb) && r.team === codeOf(team) && ids.has(r.game_id));
    const lines = [`${team}: ${qb || 'starter not on the desk'}`];
    if (gs.length) lines.push(`  games at quarterback this season: ${who || 'not recorded'}${qb && !hasStarted ? ` · this would be ${qb}'s first game at quarterback this season` : ''}`);
    if (qb) lines.push(`  ${qb} this season: ${!d.playerWeek ? 'not on file (the weekly player stats did not load)' : passing(his) || 'no games with 8+ passes'}`);
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
  // A moneyline move of 15 cents or more is a point on the path too (Oct 23 2026 data audit: Thunder -300 to -335 with
  // the spread unchanged read as "a settled number").
  const mlMoved = (b, l) => Math.abs((Number(b.ml_home) || 0) - (Number(l.ml_home) || 0)) >= 15 || Math.abs((Number(b.ml_away) || 0) - (Number(l.ml_away) || 0)) >= 15;
  for (const r of data) {
    latest.set(r.line_vendor, r); const b = board(r.seen_at);
    if (!last || b.spread_home !== last.spread_home || b.total !== last.total || mlMoved(b, last)) { path.push(b); last = b; }
  }
  return { path, now: board(new Date(until).toISOString()), book: vendor || null };
}

/** The path in words: where it opened, each spread move (one per poll) and where it is now. The ticket's own book is
 * not set against the median: a note that it was half a point better became the main reason for 8 of 23 test board
 * bets, and half a point decides only the games that land on the number. */
const BOOK_NAMES = { fanduel: 'FanDuel', draftkings: 'DraftKings', betrivers: 'BetRivers', caesars: 'Caesars', betmgm: 'BetMGM', fanatics: 'Fanatics', betway: 'Betway', ballybet: 'Bally Bet', betparx: 'betPARX', rebet: 'ReBet' };
// "Opened" was our first look, not the market's opening line (every Oct 17 college game "opened" Sunday 6:00 AM, when
// the line watch first polled), and no book was named; each move is when we first saw it, and moneyline moves of 15
// cents or more print with the spread's (Oct 23 2026 data audit).
export function lineStory(lines, homeTeam, awayTeam) {
  if (!lines?.now || !lines.path?.length) return 'No line history on file for this game.';
  const side = (h) => (h == null ? '?' : h === 0 ? "pick'em" : h < 0 ? `${homeTeam} ${h}` : `${awayTeam} -${h}`);
  const when = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const ml = (x) => (x == null ? '?' : x > 0 ? `+${Math.round(x)}` : `${Math.round(x)}`);
  const mls = (b) => `moneylines ${awayTeam} ${ml(b.ml_away)}, ${homeTeam} ${ml(b.ml_home)}`;
  const open = lines.path[0];
  // Books update seconds apart; moves inside the same minute collapse to the last.
  const polls = [];
  for (const p of lines.path.slice(1)) { const k = p.at.slice(0, 16); if (polls.length && polls.at(-1).k === k) polls[polls.length - 1] = { k, p }; else polls.push({ k, p }); }
  const moves = []; let prev = open;
  for (const { p } of polls) {
    const spread = p.spread_home !== prev.spread_home;
    const money = Math.abs((Number(p.ml_home) || 0) - (Number(prev.ml_home) || 0)) >= 15 || Math.abs((Number(p.ml_away) || 0) - (Number(prev.ml_away) || 0)) >= 15;
    if (spread || money) { moves.push(`  seen ${when(p.at)}: ${side(p.spread_home)} · ${mls(p)}`); prev = p; }
  }
  const kept = moves.length > 12 ? [...moves.slice(0, 4), `  … ${moves.length - 8} more moves …`, ...moves.slice(-4)] : moves;
  const book = lines.book ? `at ${BOOK_NAMES[lines.book] || lines.book}` : "across the books (median)";
  return [`The line ${book}, first on file ${when(open.at)} (when the line watch first saw it, not necessarily the market's opening): ${side(open.spread_home)}, total ${open.total} · ${mls(open)}`,
    kept.length ? `Moves since (spread, and moneyline moves of 15 cents or more):\n${kept.join('\n')}` : 'Neither the spread nor the moneyline has moved since.',
    `Now: ${side(lines.now.spread_home)}, total ${lines.now.total} (first on file ${open.total}) · ${mls(lines.now)}`].join('\n');
}
