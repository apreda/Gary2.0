/**
 * THE BETTOR'S DESK DATA (Oct 19 2026, the new NFL system): the facts a sharp reads before a game, each cut at the
 * moment of the pick. The line and how it got here (our line watch, six books), who starts at quarterback and what
 * he has done, how each team has scored and moved the ball (with this week's starter apart from the games someone
 * else started), the season game by game with who started at quarterback, and the spot. This season only: no last
 * season and no per-play numbers (founder, Oct 23 2026: "last season is old news"; TNF's reads took the Patriots off
 * last year's 14-3 and a per-play table that blended the Bears' three backup starts). Facts only: nothing here
 * weighs, scores or projects anything; what they mean is Gary's read.
 * Sources: odds_snapshots, nflverse (schedule, weekly team and player stats, snap counts, weekly rosters, and the play
 * ledger's per-game counts from the play-by-play), the desk's quarterback lines.
 */
import { loadNflverseFile, NFLVERSE_TEAM_CODES } from '../../providers/nflverseService.js';
import { getNflSchedule, sideFacts, restPhrase, tripPhrase } from './nflSchedule.js';
import { getPlayLedger } from './nflPlayLedger.js';
import { loadNflGameWeather, gameWeatherLine } from './nflGameWeather.js';

const nameOf = Object.fromEntries(Object.entries(NFLVERSE_TEAM_CODES).map(([n, c]) => [c, n]));
export const codeOf = (team) => NFLVERSE_TEAM_CODES[team];
const teamName = (code) => nameOf[code] || code;
const n = (x) => Number(x) || 0;
const etDay = (d) => new Date(`${d}T16:00:00Z`).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
export const etDate = (when = new Date()) => new Date(when).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/** Everything the desk reads, loaded once per call. Unavailable files leave their sections out, said so. */
export async function loadBettorData(season) {
  const [schedule, tw, pw, sc, rw, led] = await Promise.all([
    getNflSchedule().catch(() => null), loadNflverseFile('stats_team_week', season), loadNflverseFile('stats_player_week', season),
    loadNflverseFile('snap_counts', season).catch(() => null), loadNflverseFile('roster_weekly', season).catch(() => null),
    getPlayLedger(season).catch(() => null),
  ]);
  const rows = (f) => (f && !f.unavailable ? f.rows : null);
  // The play ledger's per-game counts: the score by quarter, how drives ended, QB hits beside the sacks and kneel-downs.
  // A ledger built before those fields (schema 7) is left out whole, and its lines say "not on file" (Oct 23 2026
  // data audit). Only games already played are ever looked up in it.
  const ledger = led && !led.unavailable && Number(led.schema) >= 7 ? led : null;
  // A schedule that did not load is said to be missing, never read as a season with no games (Oct 23 2026 source audit).
  const scheduleRows = schedule && !schedule.unavailable ? schedule.rows : [];
  // Rain and snow over each played outdoor game (nflGameWeather.js); a failed lookup says so on those games' lines.
  const playedRows = scheduleRows.filter((r) => r.season === String(season) && r.home_score !== '' && r.away_score !== '');
  const weather = await loadNflGameWeather(playedRows, kickoffMs).catch((e) => { console.warn(`[NFL data] game weather not on file: ${e.message}`); return null; });
  return { season, schedule: scheduleRows, scheduleMissing: !schedule || Boolean(schedule.unavailable),
    teamWeek: rows(tw), playerWeek: rows(pw), snaps: rows(sc), rosterWeekly: rows(rw),
    ledgerGames: ledger ? new Map((ledger.games || []).map((g) => [g.game_id, g])) : null, weather };
}

// The schedule's kickoff (Eastern date and time) as an instant: try standard time, then correct by the hour Eastern
// time actually shows at that instant (daylight time reads an hour later).
function kickoffMs(r) {
  const [y, mo, day] = String(r.gameday).split('-').map(Number);
  const [h, m] = String(r.gametime || '13:00').split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, day, h + 5, m || 0);
  const shown = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date(guess)));
  return guess - (((shown - h) % 24 + 24) % 24) * 3600_000;
}
// Games finished before the pick: earlier days, and the same day's games with a final score once their kickoff is 3¼ hours
// before the pick's moment (a live final score means the game is over; the time keeps replays honest)
// (Oct 23 2026 audit: a 4:25 pick read the Bears 3-2 an hour after their 1 PM win; the cut was the date).
const played = (d, season, before) => d.schedule.filter((r) => r.season === String(season) && r.game_type === 'REG'
  && r.home_score !== '' && r.away_score !== '' && (!before || r.gameday < before
    || (r.gameday === before && d.asOf != null && kickoffMs(r) + 3.25 * 3600_000 <= new Date(d.asOf).getTime())));
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

// One side of a game's box score, as counts: net yards, rushing yards and carries, turnovers (interceptions and lost
// fumbles, and how often it fumbled), times its quarterback was sacked, and its kicking (Oct 23 2026 data check: the
// Chargers' 13 giveaways in five games and five sacks in their last were nowhere in what Gary read; he guessed
// "interceptions explain much of the gap" from Herbert's line). The feed's fumbles count every fumble the team made,
// special teams included, and match the play-by-play in all 188 team games through Week 7. `hitsMade` is the feed's def_qb_hits, which counts a sack as a hit too (Oct 23 2026 data
// audit: 187 of 188 team games through Week 7 have at least as many hits as sacks, and the play-by-play flags 408 of
// 434 sacks as hits), so it is printed as hits with the sacks included, never "on top of" them.
const box = (r) => (r ? { yards: yards(r), rushing: n(r.rushing_yards), carries: n(r.carries), ints: n(r.passing_interceptions),
  fumbles: n(r.fumbles_total), fumblesLost: n(r.fumbles_lost_total), giveaways: n(r.passing_interceptions) + n(r.fumbles_lost_total), sacked: n(r.sacks_suffered),
  hitsMade: n(r.def_qb_hits),
  kicking: { fgMade: n(r.fg_made), fgAtt: n(r.fg_att), made: String(r.fg_made_list || '').split(';').filter(Boolean), missed: String(r.fg_missed_list || '').split(';').filter(Boolean), blocked: String(r.fg_blocked_list || '').split(';').filter(Boolean), xpMade: n(r.pat_made), xpAtt: n(r.pat_att) } } : null);

// The kicker on each side, from the weekly player stats (anyone with a field goal or extra point try that game).
function withKickers(b, d, g, code) {
  if (!b) return b;
  const names = (d.playerWeek || []).filter((r) => r.game_id === g.game_id && r.team === code && (n(r.fg_att) > 0 || n(r.pat_att) > 0)).map((r) => r.player_display_name);
  return { ...b, kicking: { ...b.kicking, kickers: [...new Set(names)] } };
}

/** One team's season before `before`: each game's result, score, box score both ways and who played quarterback. */
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
      // Overtime from the schedule (Oct 23 2026 data audit: Kansas City's 3-point win over Indianapolis read as a
      // regulation win), and the game's play-ledger entry, when the ledger has it.
      ot: g.overtime === '1', ledger: d.ledgerGames?.get(g.game_id) || null,
      off: withKickers(box(us), d, g, code), def: withKickers(box(them), d, g, opp) };
  }).sort((a, b) => a.date.localeCompare(b.date));
}
const record = (gs) => { const w = gs.filter((x) => x.won).length, t = gs.filter((x) => x.tied).length; return `${w}-${gs.length - w - t}${t ? `-${t}` : ''}`; };
// Each game listed, newest first: the result, the opponent, and yards both ways where the weekly stats are published.
// Never a season average, at any number of games: an average of two carried by one blowout read as who the team is
// (Oct 23 2026 data check: "with Williams, 31.0 points a game" was 59, 3 and 31), and from six games on the board read
// blended averages (Oct 23 2026 data audit: the Bears' three backup starts inside one points-a-game number).
const nickname = (code) => teamName(code).split(' ').at(-1);
// Each game with the opponent's record now and who played quarterback for it that day, as the game log gives them (Oct
// 24 2026: the board read "W 22-6 vs Chargers" without the Chargers being 0-6).
function perGame(d, before, gs) {
  return gs.slice().reverse().map((x) => {
    const opp = `${record(teamGames(d, x.opp, d.season, before))} now${x.oppQb ? `, ${x.oppQb} at QB` : ''}`;
    return `${x.won ? 'W' : x.tied ? 'T' : 'L'} ${x.pf}-${x.pa}${x.ot ? ' in overtime' : ''} ${x.home ? 'vs' : '@'} ${nickname(x.opp)} (${opp}${x.off && x.def ? `; ${Math.round(x.off.yards)} yards, allowed ${Math.round(x.def.yards)}` : ''})`;
  }).join(', ');
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
  if (d.scheduleMissing) return `${team}: the season's results are not on file (the schedule file did not load).`;
  const gs = teamGames(d, codeOf(team), d.season, before);
  if (!gs.length) return `${team}: no games played yet this season.`;
  const games = (k) => `${k} game${k === 1 ? '' : 's'}`;
  const season = `  This season, ${games(gs.length)}: ${perGame(d, before, gs)}`;
  // No home and road records: two or three games each, and every game says where it was (Oct 23 2026 data review).
  const lines = [`${team} (${record(gs)})`];
  const by = (role) => (qb ? gs.filter((x) => qbRole(x, qb) === role) : []);
  const his = by('with'), without = by('without'), both = by('shared'), unknown = by('unknown');
  if (unknown.length) lines.push(`  Who played quarterback is not on file for ${games(unknown.length)} (not in the weekly player stats), so no split by quarterback is shown.`);
  if (unknown.length) return [...lines, season].join('\n');
  if (!qb || (!without.length && !both.length)) return [...lines, season].join('\n');
  const others = [...new Set(without.map(starterOf).filter(Boolean))].join(', ') || 'other quarterbacks';
  if (his.length) lines.push(`  With ${qb} at quarterback, ${games(his.length)}: ${record(his)}, ${perGame(d, before, his)}`);
  else lines.push(`  ${qb} has not played a full game at quarterback this season.`);
  if (without.length) lines.push(`  Without him (${others} at quarterback), ${games(without.length)}: ${record(without)}, ${perGame(d, before, without)}`);
  if (both.length) lines.push(`  Shared at quarterback, ${games(both.length)}: ${both.map((x) => `Wk ${x.week} ${x.won ? 'W' : x.tied ? 'T' : 'L'} ${x.pf}-${x.pa}${x.ot ? ' in overtime' : ''} (${passerLine(x)})`).join('; ')}`);
  // The quarterback split replaces the season line: it covered three quarterbacks and repeated the lists (Oct 23 2026
  // audit); every score is in the game log.
  return lines.join('\n');
}

// Who was missing and who came back, game by game, from the snap counts and the weekly rosters (Oct 23 2026 data checks:
// TNF's data never said Kyler Gordon was back for the Bears, which Patriots regulars were out, or that A.J. Brown, hurt
// in Week 1, spent Weeks 2-5 on reserve). Each game is read against the games before it only: a regular there played
// 60%+ of his side's snaps in at least half the earlier games; he is missing when he played under 10%. Anyone who
// played a quarter of the snaps in an earlier game and is on reserve that week is listed as on reserve; back is the
// first game at a quarter or more after a game under 10%; new is a first game at a quarter or more this season.
// The two players with the most carries and the four with the most targets in the earlier games count as regulars too,
// at any snap share (Oct 23 2026 data audit: Ladd McConkey, third on the Chargers in targets at 49/46/88/34% of the
// snaps, sat out Week 5 active and nothing said so); for them, only a game they missed is listed.
// A player on reserve is named on the first game after he went there, not on every game he stays there (Oct 23 2026
// data audit: David Njoku and Trey Pipkins read "on reserve" under three straight Chargers games).
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
  // The weekly roster by PFR id, by name and by last name with first initial: many of its rows carry no PFR id (no
  // offensive lineman has one) and names differ ("Mike"/"Michael Onwenu"). Reserve codes read as words.
  const key = (x) => String(x || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z ]/g, '').trim();
  const keys = (full) => { const k = key(full); const parts = k.split(/\s+/); return [k.replace(/ /g, ''), parts.length > 1 ? `${parts.at(-1)}|${parts[0][0]}` : null].filter(Boolean); };
  const RESERVE = { R01: 'IR', R02: 'IR, designated to return', R04: 'PUP', R06: 'reserve, did not report', R23: 'non-football injury', R27: 'non-football illness', R40: 'suspended', R48: 'IR, designated to return' };
  const status = new Map(); const rosterWeeks = new Set();
  for (const r of d.rosterWeekly || []) {
    if (r.team !== code) continue;
    const w = n(r.week); rosterWeeks.add(w);
    for (const k of [r.pfr_id, ...keys(r.full_name)].filter(Boolean)) status.set(`${w}|${k}`, { status: String(r.status || '').toUpperCase(), code: r.status_description_abbr });
  }
  const keysOf = (id) => [id, ...keys(name.get(id)?.name)];
  const statusAt = (g, id) => keysOf(id).map((k) => status.get(`${g.week}|${k}`)).find(Boolean) || null;
  const onReserve = (g, id) => statusAt(g, id)?.status === 'RES';
  const reserveWord = (g, id) => { const st = statusAt(g, id); return st?.status === 'RES' ? (RESERVE[st.code] || 'reserve') : null; };
  const wasInactive = (g, id) => statusAt(g, id)?.status === 'INA';
  // Off the team that week: matched on an earlier week's roster and on none of this week's (Oct 23 2026 audit: an id
  // missing from every week read as "no longer on the roster" for every lineman).
  const everOnRoster = (id) => [...rosterWeeks].some((w) => keysOf(id).some((k) => status.has(`${w}|${k}`)));
  const gone = (g, id) => rosterWeeks.has(g.week) && !statusAt(g, id) && everOnRoster(id);
  const st = new Map();
  for (const r of rows) st.set(`${r.game_id}|${r.pfr_player_id}`, n(r.st_pct));
  const specialTeamsOnly = (g, id) => (st.get(`${g.g.game_id}|${id}`) || 0) > 0;
  const players = [...name.keys()];
  const of = (g, id) => share.get(`${g.g.game_id}|${id}`) || 0;
  const label = (g, id, pct, extra = '') => `${name.get(id).name} (${posAt.get(`${g.g.game_id}|${id}`) || name.get(id).pos}${pct ? `, ${Math.round(100 * of(g, id))}% of snaps` : ''}${extra})`;
  const list = (ps, f) => ps.slice(0, 8).map(f).join(', ') + (ps.length > 8 ? ` and ${ps.length - 8} more` : '');
  const why = (g, id) => reserveWord(g, id) || (wasInactive(g, id) ? 'inactive' : specialTeamsOnly(g, id) ? 'special teams only' : statusAt(g, id)?.status === 'ACT' ? 'active, did not play' : 'did not play');
  // The weekly stats' players (GSIS ids) as snap-count players (PFR ids): through the weekly roster, else the name.
  const pfrOfGsis = new Map();
  for (const r of d.rosterWeekly || []) if (r.team === code && r.gsis_id && r.pfr_id) pfrOfGsis.set(r.gsis_id, r.pfr_id);
  const byName = new Map();
  for (const id of players) for (const k of keys(name.get(id).name)) if (!byName.has(k)) byName.set(k, id);
  const snapIdOf = (r) => { const viaRoster = pfrOfGsis.get(r.player_id); if (viaRoster && name.has(viaRoster)) return viaRoster; return keys(r.player_display_name).map((k) => byName.get(k)).find(Boolean) || null; };
  const touches = (d.playerWeek || []).filter((r) => r.team === code && r.position !== 'QB');
  const skillRegulars = (prior) => {
    const ids = new Set(prior.map((e) => e.g.game_id)); const tot = new Map();
    for (const r of touches) {
      if (!ids.has(r.game_id)) continue;
      const t = tot.get(r.player_id) || { r, carries: 0, targets: 0 }; t.carries += n(r.carries); t.targets += n(r.targets); tot.set(r.player_id, t);
    }
    const top = (k, m) => [...tot.values()].filter((t) => t[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, m);
    return new Set([...top('carries', 2), ...top('targets', 4)].map((t) => snapIdOf(t.r)).filter(Boolean));
  };
  const out = new Map(); out.absent = new Map();
  gs.forEach((g, i) => {
    const prior = gs.slice(0, i);
    const snapRegular = (id) => prior.length > 0 && prior.filter((e) => of(e, id) >= 0.6).length >= Math.ceil(prior.length / 2);
    const skill = skillRegulars(prior);
    const regular = (id) => snapRegular(id) || skill.has(id);
    const stillOnReserve = (id) => i > 0 && onReserve(g, id) && onReserve(gs[i - 1], id);
    // A regular who did not play at all is missing; one with a few snaps left early or was limited, with his share
    // (Oct 23 2026 data check: an in-game injury read as "missing"); one no longer on the roster has left the team.
    // A quarterback who was active and did not play is the backup that day, and the game's QB line names who played
    // (Oct 23 2026 data audit: Seattle read "without Drew Lock" the week Sam Darnold came back).
    const backupQb = (id) => name.get(id).pos === 'QB' && statusAt(g, id)?.status === 'ACT';
    const departed = players.filter((id) => regular(id) && of(g, id) === 0 && gone(g, id));
    const absent = players.filter((id) => regular(id) && of(g, id) === 0 && !gone(g, id) && !backupQb(id));
    const missing = absent.filter((id) => !stillOnReserve(id));
    const limited = players.filter((id) => snapRegular(id) && of(g, id) > 0 && of(g, id) < 0.25);
    const reserved = players.filter((id) => !absent.includes(id) && !departed.includes(id) && onReserve(g, id) && !stillOnReserve(id) && of(g, id) === 0 && prior.some((e) => of(e, id) >= 0.25));
    const back = i ? players.filter((id) => of(g, id) >= 0.25 && of(gs[i - 1], id) < 0.1 && prior.some((e) => of(e, id) >= 0.25)) : [];
    const fresh = i ? players.filter((id) => of(g, id) >= 0.25 && prior.every((e) => of(e, id) < 0.1)) : [];
    // Every regular who did not play that day, as an opponent's line reads it: its quarterback first, then whoever had
    // played the most snaps before (an opponent's line names four).
    const snapsBefore = (id) => prior.reduce((a, e) => a + of(e, id), 0);
    out.absent.set(g.g.game_id, absent.slice().sort((a, b) => (name.get(b).pos === 'QB') - (name.get(a).pos === 'QB') || snapsBefore(b) - snapsBefore(a))
      .map((id) => ({ name: name.get(id).name, pos: posAt.get(`${g.g.game_id}|${id}`) || name.get(id).pos, why: why(g, id) })));
    const parts = [
      missing.length ? `missing regulars: ${list(missing, (id) => `${name.get(id).name} (${name.get(id).pos}, ${why(g, id)})`)}` : null,
      limited.length ? `left early or limited: ${list(limited, (id) => label(g, id, true))}` : null,
      departed.length ? `no longer on the roster: ${list(departed, (id) => `${name.get(id).name} (${name.get(id).pos})`)}` : null,
      reserved.length ? `on reserve: ${list(reserved, (id) => `${name.get(id).name} (${name.get(id).pos}, ${reserveWord(g, id)})`)}` : null,
      back.length ? `back: ${list(back, (id) => label(g, id, true))}` : null,
      fresh.length ? `first game at 25%+ of snaps: ${list(fresh, (id) => label(g, id, true, prior.length && prior.every((e) => onReserve(e, id)) ? ', off reserve' : ''))}` : null,
    ].filter(Boolean);
    out.set(g.g.game_id, parts.join(' · '));
    out.missing = { names: [...missing, ...limited].map((id) => ({ name: name.get(id).name, pos: name.get(id).pos, limited: limited.includes(id), why: missing.includes(id) ? why(g, id) : null })) };
  });
  return out;
}

/** WHO THE OFFENSE RUNS THROUGH: beyond the quarterback, the two players with the most carries and the four with the
 * most targets this season, each game's touches and yards newest first (five games or fewer, else the latest five and
 * the season's totals), and whether he is on this week's injury report (`reportText`). Counts, not rates (Oct 23 2026:
 * Kenneth Walker led the league in rushing and carried Kansas City past the Chargers; Gary read only quarterbacks, and
 * called Kansas City thin without Rice and Thornton without knowing who was left). */
const VALUES_UP_TO = 5;
export function skillPlayers(d, team, before, reportText = '') {
  if (d.scheduleMissing || !d.playerWeek) return `${team}: the players' weekly stats are not on file.`;
  const c = codeOf(team); const gs = teamGames(d, c, d.season, before);
  if (!gs.length) return `${team}: no games played yet this season.`;
  const ids = new Set(gs.map((x) => x.g.game_id));
  const rows = d.playerWeek.filter((r) => r.team === c && ids.has(r.game_id) && r.position !== 'QB');
  const by = new Map();
  for (const r of rows) { if (!by.has(r.player_id)) by.set(r.player_id, []); by.get(r.player_id).push(r); }
  const total = (rs, k) => rs.reduce((a, r) => a + n(r[k]), 0);
  const ranked = (k) => [...by.values()].filter((rs) => total(rs, k) > 0).sort((a, b) => total(b, k) - total(a, k));
  const chosen = [...new Set([...ranked('carries').slice(0, 2), ...ranked('targets').slice(0, 4)])];
  const text = String(reportText).toLowerCase().replace(/[^a-z]/g, '');
  // A game with no stats row is "did not play" only when the snap counts have no snap for him either: Rice left Week 4
  // after 10% of the snaps without a touch.
  const snapShare = (name, gameId) => { const k = sameKey(name); const r = (d.snaps || []).find((x) => x.team === c && x.game_id === gameId && sameKey(x.player) === k); return r ? Math.max(n(r.offense_pct), n(r.defense_pct)) : 0; };
  const game = (r) => [n(r.carries) ? `${n(r.carries)} ${n(r.carries) === 1 ? 'carry' : 'carries'} ${n(r.rushing_yards)} yds${n(r.rushing_tds) ? ` ${n(r.rushing_tds)} TD` : ''}` : null,
    n(r.targets) ? `${n(r.receptions)} of ${n(r.targets)} targets ${n(r.receiving_yards)} yds${n(r.receiving_tds) ? ` ${n(r.receiving_tds)} TD` : ''}` : null].filter(Boolean).join(', ') || 'no touches';
  const lines = chosen.map((rs) => {
    const last = rs.slice().sort((a, b) => n(b.week) - n(a.week))[0];
    const played = new Map(rs.map((r) => [r.game_id, r]));
    const recent = gs.slice().reverse().slice(0, VALUES_UP_TO).map((x) => `Wk ${x.week} ${played.has(x.g.game_id) ? game(played.get(x.g.game_id)) : snapShare(last.player_display_name, x.g.game_id) > 0 ? `no touches (${Math.round(100 * snapShare(last.player_display_name, x.g.game_id))}% of snaps)` : 'did not play'}`);
    const season = gs.length > VALUES_UP_TO ? ` · season, ${rs.length} games: ${game(Object.fromEntries(['carries', 'rushing_yards', 'rushing_tds', 'receptions', 'targets', 'receiving_yards', 'receiving_tds'].map((k) => [k, total(rs, k)])))}` : '';
    // With his status, as the report lists it (Oct 24 2026: Rice read "on this week's injury report" while Out).
    const reportLine = String(reportText).split('\n').find((l) => l.toLowerCase().replace(/[^a-z]/g, '').includes(sameKey(last.player_display_name)));
    const status = (reportLine?.match(/^\s*•\s*[^(]+\([^)]*\)\s*\(([^)]+)\)/) || [])[1];
    const listed = text.includes(sameKey(last.player_display_name)) ? ` · ${status ? `${status} on` : 'on'} this week\'s injury report` : '';
    return `  ${last.player_display_name} (${last.position})${listed}: ${recent.join('; ')}${season}`;
  });
  return [`${team}:`, ...lines].join('\n');
}

/** Regulars who missed the team's last game, or left it early, and are not on this week's injury report (`reported`:
 * the names on it): the report lists who may not play, so a player missing from it is one the team expects back (Oct 23
 * 2026 data check: Quentin Johnston missed Week 5, was cleared for Kansas City, and nothing Gary read said so). */
export function notOnReport(d, team, before, reportText = '') {
  if (d.scheduleMissing) return null;
  const c = codeOf(team); const gs = teamGames(d, c, d.season, before);
  if (!gs.length) return null;
  const changes = lineupChanges(d, c, gs);
  // Anywhere in the report counts, the reserve lists under it included.
  const text = String(reportText).toLowerCase().replace(/[^a-z]/g, '');
  const back = (changes.missing?.names || []).filter((p) => !text.includes(sameKey(p.name)));
  if (!back.length) return null;
  // How he missed it, as the game log says it (Oct 24 2026: "missed Wk 6" for a safety who played special teams only).
  return `${team}: ${back.map((p) => `${p.name} (${p.pos}, ${p.limited ? 'left early or limited' : p.why === 'special teams only' ? 'special teams only' : 'missed'} Wk ${gs.at(-1).week})`).join(', ')}`;
}
const sameKey = (x) => qbKey(x).join('');

/** THIS SEASON GAME BY GAME: each game newest first, its first line the result and score (overtime said), the
 * opponent's record now and quarterback that day, and who played quarterback (everyone with 5+ passes); under it, the
 * opponent's regulars who did not play, the box score both ways, the score by quarter and the kicking, how each side's
 * drives ended, and which of the team's own regulars were missing or back. One game's facts on one line each, so a
 * line stays readable (Oct 23 2026 data audit). */
// The record and the kickers head the log. Who played quarterback, with the record with this week's starter and
// without him, is in THE QUARTERBACKS (Oct 23 2026 section review: the same split headed both sections).
function seasonHeader(d, gs, team, before) {
  const lines = [`${team} (${record(gs)}), newest first:`];
  // A ledger that did not load is said once, not under every game (Oct 23 2026 section review).
  if (!d.ledgerGames) lines.push('  score by quarter and drives: not on file (the play-by-play ledger did not load)');
  const kick = kickers(d, codeOf(team), gs, before);
  if (kick) lines.push(`  ${kick}`);
  return lines.join('\n');
}

// Who kicked, when more than one man has: each game's kicker is whoever tried the most field goals (then extra points)
// for the team; the game lines carry each game's kicks. And this week's kicker when this week's roster has a new one
// (Oct 23 2026 data audit: the Rams went from Harrison Mevis, 5 of 9 on field goals, to Blake Grupe in Week 6 and to
// Brandon McManus in Week 7, and nothing Gary read said so). The weekly roster carries no time, so this week's is read
// only for a pick made now: a replay would read a signing made after its pick.
function kickers(d, code, gs, before) {
  const rows = (x) => (d.playerWeek || []).filter((r) => r.game_id === x.g.game_id && r.team === code && n(r.fg_att) + n(r.pat_att) > 0);
  const by = gs.map((x) => ({ week: x.week, r: rows(x).sort((a, b) => n(b.fg_att) - n(a.fg_att) || n(b.pat_att) - n(a.pat_att))[0] })).filter((k) => k.r);
  const names = [...new Set(by.map((k) => k.r.player_display_name))];
  const weeksOf = (ks) => `Wk ${ks.map((k) => k.week).join(', ')}`;
  const parts = names.length > 1 ? [`kickers: ${names.map((nm) => `${nm} ${weeksOf(by.filter((k) => k.r.player_display_name === nm))}`).join('; ')}`] : [];
  const live = d.asOf == null || Date.now() - new Date(d.asOf).getTime() < 12 * 3600_000;
  const next = live && before ? d.schedule.filter((r) => r.season === String(d.season) && r.game_type === 'REG' && (r.home_team === code || r.away_team === code)
    && r.gameday >= before && !gs.some((x) => x.g.game_id === r.game_id)).sort((a, b) => a.gameday.localeCompare(b.gameday))[0] : null;
  const onRoster = next ? (d.rosterWeekly || []).filter((r) => r.team === code && n(r.week) === n(next.week) && r.position === 'K' && String(r.status).toUpperCase() === 'ACT') : [];
  const last = by.at(-1);
  if (last && onRoster.length && !onRoster.some((r) => r.gsis_id === last.r.player_id)) {
    const his = (r) => by.filter((k) => k.r.player_id === r.gsis_id);
    parts.push(`kicker on this week's roster: ${onRoster.map((r) => `${r.full_name} (${his(r).length ? `kicked ${weeksOf(his(r))}` : `no kicks for the ${nickname(code)} this season`})`).join(', ')}; ${last.r.player_display_name} kicked Wk ${last.week}`);
  }
  return parts.join('\n  ') || null;
}

const count = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const kneelDowns = (k) => (k === 1 ? '1 of them a kneel-down' : `${k} of them kneel-downs`);
// Turnovers as the box score has them: interceptions and lost fumbles, and how often the team fumbled when it kept
// some (Oct 23 2026 data audit: the Chargers fumbled 12 times in five games and lost 6).
function giveaways(b) {
  const fumbled = b.fumbles > b.fumblesLost ? `fumbled ${b.fumbles === 1 ? 'once' : `${b.fumbles} times`}` : null;
  if (!b.giveaways) return `0 turnovers${fumbled ? ` (${fumbled}, lost none)` : ''}`;
  return `${count(b.giveaways, 'turnover')} (${[b.ints ? `${b.ints} INT` : null, b.fumblesLost ? count(b.fumblesLost, 'lost fumble') : null].filter(Boolean).join(', ')}${fumbled ? `; ${fumbled}` : ''})`;
}
// Team rushing with the quarterbacks' own carries apart (Oct 23 2026 data audit: the Chargers' 155 rushing in Week 5
// was Herbert's 54 on 6 and 101 on 28 by everyone else, and read as a run game behind backup tackles). The weekly stats
// count kneel-downs as carries; the play ledger says how many of his were kneel-downs.
function rushing(x, code) {
  const qbs = x.passers.filter((r) => n(r.carries) > 0);
  if (!qbs.length) return `${x.off.rushing} rushing`;
  const kneels = x.ledger?.lines?.[code]?.kneels || {};
  const theirs = qbs.map((r) => { const k = kneels[r.player_id] || 0; return `${r.player_display_name} ${n(r.rushing_yards)} on ${n(r.carries)}${k ? ` (${kneelDowns(k)})` : ''}`; });
  const c = x.off.carries - qbs.reduce((a, r) => a + n(r.carries), 0), y = x.off.rushing - qbs.reduce((a, r) => a + n(r.rushing_yards), 0);
  return `${x.off.rushing} rushing: ${theirs.join(', ')}${c > 0 ? `, the rest ${y} on ${c}` : ''}`;
}
// The box score both ways, as counts.
const boxLine = (x, code) => (!x.off || !x.def ? 'box score not on file'
  : `${Math.round(x.off.yards)} yards (${rushing(x, code)}), allowed ${Math.round(x.def.yards)} (${x.def.rushing} rushing) · ${giveaways(x.off)}, ${count(x.def.giveaways, 'takeaway')} · ${count(x.off.sacked, 'sack')} allowed, ${x.def.sacked} made · QB hits (sacks included): ${x.def.hitsMade} taken, ${x.off.hitsMade} made`);
// The score by quarter from the play ledger, kept only when it adds up to the final (Oct 23 2026 data audit: the
// Chargers' "never blown out" read off final margins; Seattle led them 30-13 after three quarters). Checked against
// ESPN's quarter scores for 27 games.
function quarters(x, code) {
  const q = x.ledger?.quarters; const sum = (xs) => xs.reduce((a, v) => a + v, 0);
  if (!q?.[code] || !q?.[x.opp] || sum(q[code]) !== x.pf || sum(q[x.opp]) !== x.pa) return null;
  return q;
}
const quarterLine = (x, code) => {
  const q = quarters(x, code);
  if (!q) return 'quarters not on file';
  const side = (c) => `${nickname(c)} ${q[c].slice(0, 4).join('-')}${q[c].length > 4 ? `, overtime ${q[c].slice(4).join('-')}` : ''}`;
  return `by quarter: ${side(code)}; ${side(x.opp)}`;
};
// Field goals made of tried, with the distance of each miss and block, and extra points (Oct 23 2026 data audit).
// Who kicked and every try's distance (founder, Oct 24 2026: "FG 0-of-2" invites "they can't kick" when the misses were
// from 50-plus, or by a kicker who is not kicking today).
const kicks = (k) => [k.fgAtt ? `FG ${k.kickers?.length ? `${k.kickers.join(' and ')} ` : ''}${k.fgMade}-of-${k.fgAtt}${k.made?.length || k.missed.length || k.blocked.length ? ` (${[k.made?.length ? `made ${k.made.join(', ')}` : null, k.missed.length ? `missed ${k.missed.join(', ')}` : null, k.blocked.length ? `blocked ${k.blocked.join(', ')}` : null].filter(Boolean).join('; ')})` : ''}` : 'no field goal tries',
  k.xpAtt ? `XP ${k.xpMade}-of-${k.xpAtt}` : null].filter(Boolean).join(', ');
// How each side's drives ended, red-zone trips, drives that began in the other side's territory and their points, and
// touchdowns the offense did not score: counts from the play ledger, never its average start or per-play numbers
// (Oct 23 2026 data audit: Denver began 5 of 12 drives in Chargers territory and scored 20 of its 23 points there).
function driveLine(x, code) {
  const L = x.ledger?.lines;
  if (!L?.[code] || !L?.[x.opp] || L[code].drive_end_of_half == null) return 'drives not on file';
  const side = (c, o) => {
    const t = L[c];
    const ends = [t.drive_tds ? `${t.drive_tds} TD` : null, t.drive_fgs ? `${t.drive_fgs} FG` : null, t.drive_missed_fgs ? `${t.drive_missed_fgs} missed FG` : null,
      t.drive_punts ? count(t.drive_punts, 'punt') : null, t.drive_turnovers ? count(t.drive_turnovers, 'turnover') : null,
      t.drive_downs ? `${t.drive_downs} on downs` : null, t.drive_safeties ? count(t.drive_safeties, 'safety', 'safeties') : null].filter(Boolean).join(', ');
    const half = t.drive_end_of_half ? `; ${t.drive_end_of_half} more ended as a half ran out` : '';
    const rz = t.red_zone_trips ? `red zone ${count(t.red_zone_trips, 'trip')}, ${t.red_zone_tds} TD` : 'no red-zone trips';
    const short = t.opp_territory_drives ? `${t.opp_territory_drives} began in ${nickname(o)} territory (${count(t.opp_territory_points, 'point')})` : `none began in ${nickname(o)} territory`;
    const other = [t.defensive_tds ? count(t.defensive_tds, 'defensive TD') : null, t.special_teams_tds ? count(t.special_teams_tds, 'special-teams TD') : null].filter(Boolean).join(', ');
    return `${nickname(c)} ${t.drives} (${ends}${half}); ${rz}; ${short}${other ? `; also ${other}` : ''}`;
  };
  return `drives: ${side(code, x.opp)} · ${side(x.opp, code)}`;
}

export function gameByGame(d, team, before) {
  if (d.scheduleMissing) return `${team}: the season game by game is not on file (the schedule file did not load).`;
  const c = codeOf(team); const gs = teamGames(d, c, d.season, before);
  if (!gs.length) return `${team}: no games played yet this season.`;
  const changes = lineupChanges(d, c, gs);
  return [seasonHeader(d, gs, team, before), ...gs.slice().reverse().map((x) => {
    const qb = x.passers.length ? ` · QB ${x.passers.map((r) => `${r.player_display_name} ${n(r.completions)}-of-${n(r.attempts)}, ${n(r.passing_yards)} yds, ${n(r.passing_tds)} TD, ${n(r.passing_interceptions)} INT`).join('; ')}`
      : ' · QB not on file';
    // Who the opponent was without that day: its own regulars who did not play, its quarterback first, at most four
    // (Oct 23 2026 data audit: Herbert's 121 yards in Week 5 came against a Denver secondary without Pat Surtain II and
    // Riley Moss).
    const oppGames = teamGames(d, x.opp, d.season, before);
    const absent = lineupChanges(d, x.opp, oppGames).absent?.get(x.g.game_id) || [];
    const without = absent.length ? `${nickname(x.opp)} regulars out that day: ${absent.slice(0, 4).map((p) => `${p.name} (${p.pos}, ${p.why})`).join(', ')}${absent.length > 4 ? ` and ${absent.length - 4} more` : ''}` : null;
    // Overtime from the schedule (Oct 23 2026 data audit: Kansas City's 3-point win over Indianapolis read as a
    // regulation win), with the score after four quarters when the quarters are on file.
    const q = quarters(x, c);
    const regulation = (k, pts) => pts - q[k].slice(4).reduce((a, v) => a + v, 0);
    const ot = x.ot ? ` in overtime${q ? ` (${regulation(c, x.pf)}-${regulation(x.opp, x.pa)} after four quarters)` : ''}` : '';
    const kicking = x.off && x.def ? `kicking: ${nickname(c)} ${kicks(x.off.kicking)}; ${nickname(x.opp)} ${kicks(x.def.kicking)}` : null;
    const scoring = !d.ledgerGames ? null : !x.ledger ? 'quarters and drives not on file' : quarterLine(x, c);
    const weather = d.weather ? gameWeatherLine(x.g, d.weather.get(x.g.game_id)) : ['outdoors', 'open'].includes(x.g.roof) ? 'weather: not on file' : null;
    const detail = [without, boxLine(x, c), [scoring, kicking].filter(Boolean).join(' · ') || null,
      d.ledgerGames && x.ledger ? driveLine(x, c) : null, weather, changes.get(x.g.game_id) || null].filter(Boolean);
    return `  Wk ${x.week} · ${etDay(x.date)} · ${x.home ? 'vs' : '@'} ${teamName(x.opp)} (${record(oppGames)} now${x.oppQb ? `; ${x.oppQb} at QB that day` : ''}) · ${x.won ? 'W' : x.tied ? 'T' : 'L'} ${x.pf}-${x.pa}${ot}${qb}${detail.map((l) => `\n      ${l}`).join('')}`;
  })].join('\n');
}

// His own carries in the same games, kneel-downs counted apart when the play ledger has the game (Oct 23 2026 data
// audit: a quarterback's scrambles sat inside the team's rushing).
const passing = (rows, kneelsOf = () => 0) => {
  const g = rows.filter((r) => n(r.attempts) >= 8); if (!g.length) return null;
  const s = (k) => g.reduce((a, r) => a + n(r[k]), 0);
  const relief = rows.filter((r) => n(r.attempts) > 0 && n(r.attempts) < 8);
  const short = relief.length ? ` (plus ${relief.length} game${relief.length === 1 ? '' : 's'} with fewer passes: ${relief.reduce((a, r) => a + n(r.completions), 0)}-of-${relief.reduce((a, r) => a + n(r.attempts), 0)}, ${relief.reduce((a, r) => a + n(r.passing_interceptions), 0)} INT)` : '';
  const kneels = g.reduce((a, r) => a + kneelsOf(r), 0);
  const runs = s('carries') ? ` · ${s('carries')} ${s('carries') === 1 ? 'carry' : 'carries'} for ${s('rushing_yards')} yds${kneels ? ` (${kneelDowns(kneels)})` : ''}` : ' · no carries';
  // Totals, not rates: a completion rate over two or three games read as a level (Oct 23 2026 audit).
  return `${g.length} game${g.length === 1 ? '' : 's'} with 8+ passes · ${s('completions')}-of-${s('attempts')}, ${s('passing_yards')} yds, ${s('passing_tds')} TD, ${s('passing_interceptions')} INT${runs}${short}`;
};
/** The desk's starter for a team ("[HOME] Team: Name (…"), or null. */
export function deskStarter(deskQbSection, team) {
  const m = String(deskQbSection || '').match(new RegExp(`\\] ${team.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: ([^(\\n]+?)(?: \\(|\\s*$)`, 'm'));
  return m ? m[1].trim() : null;
}
/** The desk's starter for each team, the starts so far and his own passing this season. */
// When this week's starter missed or shared games, each group carries its weeks and its record: the game log's header
// carried the same split a section below and repeated these counts (Oct 23 2026 section review).
export function quarterbacks(d, deskQbSection, homeTeam, awayTeam, before) {
  const { season } = d; const out = [];
  for (const team of [awayTeam, homeTeam]) {
    const qb = deskStarter(deskQbSection, team);
    const gs = teamGames(d, codeOf(team), season, before);
    // The same count as the board's: his full games, shared games, and the games without him by who played.
    const roles = qb ? gs.map((x) => qbRole(x, qb)) : [];
    const k = (role) => roles.filter((r) => r === role).length;
    const group = (role) => gs.filter((x, i) => roles[i] === role);
    const others = {}; gs.forEach((x, i) => { if (!qb || roles[i] === 'without') { const nm = starterOf(x); if (nm) others[nm] = (others[nm] || 0) + 1; } });
    const otherList = Object.entries(others).sort((a, b) => b[1] - a[1]).map(([nm, c]) => `${nm} ${c}`).join(', ');
    const split = qb && (k('without') || k('shared'));
    const rec = (xs) => (split && xs.length ? ` (Wk ${xs.map((x) => x.week).join(', ')}: ${record(xs)})` : '');
    const who = k('unknown') ? 'not on file (the weekly player stats did not load)'
      : qb ? [`${qb} ${k('with')}${rec(group('with'))}`, k('shared') ? `shared ${k('shared')}${rec(group('shared'))}` : null,
        k('without') ? `without him ${k('without')}${otherList ? `: ${otherList}` : ''}${rec(group('without'))}` : null].filter(Boolean).join(' · ') : otherList;
    const hasStarted = !qb || k('unknown') > 0 || k('with') > 0 || k('shared') > 0;
    const ids = new Set(played(d, season, before).map((g) => g.game_id));
    const his = (d.playerWeek || []).filter((r) => r.position === 'QB' && sameQb(r.player_display_name, qb) && r.team === codeOf(team) && ids.has(r.game_id));
    const lines = [`${team}: ${qb || 'starter not on the desk'}`];
    if (gs.length) lines.push(`  games at quarterback this season: ${who || 'not recorded'}${qb && !hasStarted ? ` · this would be ${qb}'s first game at quarterback this season` : ''}`);
    if (qb) lines.push(`  ${qb} this season: ${!d.playerWeek ? 'not on file (the weekly player stats did not load)' : passing(his, (r) => d.ledgerGames?.get(r.game_id)?.lines?.[r.team]?.kneels?.[r.player_id] || 0) || 'no games with 8+ passes'}`);
    out.push(lines.join('\n'));
  }
  return out.join('\n');
}

/** The spot: rest and travel for each side, from the schedule. */
export function spot(d, homeTeam, awayTeam, gameDate) {
  if (d.scheduleMissing) return 'Rest and travel are not on file (the schedule file did not load).';
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

// A moneyline move is a change of 2.5 points or more in the home side's implied chance (Oct 23 2026 audit: cents
// subtracted across +100 read +104 to -102 as a 206-cent move; a fixed 15 cents is a different size at -110 and -300).
const implied = (odds) => { const o = Number(odds); return !Number.isFinite(o) || o === 0 ? null : o < 0 ? -o / (-o + 100) : 100 / (o + 100); };
export function moneylineMoved(b, l) {
  const a = implied(b?.ml_home), c = implied(l?.ml_home);
  return a != null && c != null && Math.abs(a - c) >= 0.025;
}

/** The line's path from the line watch, from the first board to `until`, at the ticket's own book, so the path ends on
 * the number Gary bets (a six-book median beside the ticket gave him two numbers half a point apart, and he argued the
 * half point). Falls back to the median of the books when none of the ticket's books is on file. College and the NBA
 * read their own games' paths through `sport`, at the ticket's own `book` when the game names it (Oct 21 2026). */
export async function linePath(db, gameId, until = new Date(), sport = 'americanfootball_nfl', book = null) {
  if (!db || gameId == null) return null;
  const { data: rows, error } = await db.from('odds_snapshots')
    .select('seen_at,line_vendor,spread_home,spread_home_odds,spread_away_odds,moneyline_home,moneyline_away,total')
    .eq('sport', sport).eq('game_id', String(gameId)).lte('seen_at', new Date(until).toISOString())
    .order('seen_at').limit(5000);
  if (error || !rows?.length) return null;
  // With a ticket's book, that book's rows only: another book's path, or the median of all, is a different line from
  // the one Gary bets (Oct 23 2026 source audit). Without one (the boards), the first ticket book on file.
  const asked = String(book || '').toLowerCase();
  const vendor = asked ? asked : TICKET_BOOKS.find((b) => rows.some((r) => r.line_vendor === b));
  const data = vendor ? rows.filter((r) => r.line_vendor === vendor) : rows;
  if (asked && !data.length) return { path: [], now: null, book: asked, missing: true };
  const latest = new Map(); const path = []; let last = null;
  const board = (at) => { const rs = [...latest.values()]; return { at, spread_home: half(median(rs.map((x) => x.spread_home))), total: half(median(rs.map((x) => x.total))), ml_home: median(rs.map((x) => x.moneyline_home)), ml_away: median(rs.map((x) => x.moneyline_away)),
    sp_home: median(rs.map((x) => x.spread_home_odds)), sp_away: median(rs.map((x) => x.spread_away_odds)), books: rs.length }; };
  const mlMoved = (b, l) => moneylineMoved(b, l);
  for (const r of data) {
    latest.set(r.line_vendor, r); const b = board(r.seen_at);
    if (!last || b.spread_home !== last.spread_home || b.total !== last.total || mlMoved(b, last)) { path.push(b); last = b; }
  }
  return { path, now: board(new Date(until).toISOString()), book: vendor || null };
}

// With no listed move, what did change under the marks, never "has not moved" for a price that drifted (Oct 23 2026
// data audit: the Thunder's moneyline went from -300 to -335 under the 2.5-point mark, the story said neither line had
// moved, and Gary read a settled market). The favorite's price is the one named; the underdog's when only it changed.
function stillSince(open, now, homeTeam, awayTeam, side, ml) {
  const pct = (x) => `${(100 * implied(x)).toFixed(1)}%`;
  const spPrice = (b) => (b.spread_home < 0 ? b.sp_home : b.sp_away);
  const spread = spPrice(open) != null && spPrice(now) != null && Math.round(Number(spPrice(open))) !== Math.round(Number(spPrice(now)))
    ? `The spread has not moved off ${side(open.spread_home)}; its price went from ${ml(spPrice(open))} to ${ml(spPrice(now))}.`
    : 'The spread has not moved.';
  const sides = [{ team: homeTeam, k: 'ml_home' }, { team: awayTeam, k: 'ml_away' }].sort((a, b) => Number(now[a.k]) - Number(now[b.k]));
  const moved = sides.find((x) => implied(open[x.k]) != null && implied(now[x.k]) != null && Math.round(Number(open[x.k])) !== Math.round(Number(now[x.k])));
  const money = !moved ? 'The moneylines have not moved.'
    : `The moneyline drifted under the 2.5-point mark of implied chance for a listed move: ${moved.team} ${ml(open[moved.k])} to ${ml(now[moved.k])} (${pct(open[moved.k])} to ${pct(now[moved.k])} implied).`;
  return `${spread} ${money}`;
}

/** The path in words: where it opened, each spread move (one per poll) and where it is now. The ticket's own book is
 * not set against the median: a note that it was half a point better became the main reason for 8 of 23 test board
 * bets, and half a point decides only the games that land on the number. */
const BOOK_NAMES = { fanduel: 'FanDuel', draftkings: 'DraftKings', betrivers: 'BetRivers', caesars: 'Caesars', betmgm: 'BetMGM', fanatics: 'Fanatics', betway: 'Betway', ballybet: 'Bally Bet', betparx: 'betPARX', rebet: 'ReBet' };
// "Opened" was our first look, not the market's opening line (every Oct 17 college game "opened" Sunday 6:00 AM, when
// the line watch first polled), and no book was named; each move is when we first saw it, and moneyline moves of 15
// cents or more print with the spread's (Oct 23 2026 data audit).
export function lineStory(lines, homeTeam, awayTeam) {
  if (lines?.missing) return `No line history on file at ${BOOK_NAMES[lines.book] || lines.book} for this game.`;
  if (!lines?.now || !lines.path?.length) return 'No line history on file for this game.';
  const price = (b, home) => { const x = home ? b?.sp_home : b?.sp_away; return Number.isFinite(Number(x)) && x != null ? ` (${Number(x) > 0 ? '+' : ''}${Math.round(Number(x))})` : ''; };
  const side = (h, b = null) => (h == null ? '?' : h === 0 ? "pick'em" : h < 0 ? `${homeTeam} ${h}${price(b, true)}` : `${awayTeam} -${h}${price(b, false)}`);
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
    const money = moneylineMoved(p, prev);
    if (spread || money) { moves.push(`  seen ${when(p.at)}: ${side(p.spread_home, p)} · ${mls(p)}`); prev = p; }
  }
  const kept = moves.length > 12 ? [...moves.slice(0, 4), `  … ${moves.length - 8} more moves …`, ...moves.slice(-4)] : moves;
  const book = lines.book ? `at ${BOOK_NAMES[lines.book] || lines.book}` : "across the books (median)";
  return [`The line ${book}, first on file ${when(open.at)} (when the line watch first saw it, not necessarily the market's opening): ${side(open.spread_home, open)}, total ${open.total} · ${mls(open)}`,
    kept.length ? `Moves since (spread, and moneyline moves of 2.5 points or more of implied chance):\n${kept.join('\n')}` : stillSince(open, lines.now, homeTeam, awayTeam, side, ml),
    `Now: ${side(lines.now.spread_home, lines.now)}, total ${lines.now.total} (first on file ${open.total}) · ${mls(lines.now)}`].join('\n');
}
