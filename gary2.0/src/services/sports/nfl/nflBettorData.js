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
import { loadNflverseFile, NFLVERSE_TEAM_CODES, getPracticeReport } from '../../providers/nflverseService.js';
import { getNflSchedule, sideFacts, restPhrase, tripPhrase } from './nflSchedule.js';
import { getPlayLedger } from './nflPlayLedger.js';
import { loadNflGameWeather, gameWeatherLine } from './nflGameWeather.js';
import { withOfficialBox } from './espnNflBox.js';
import { getNflHeadCoach } from '../../providers/espnNflCoaches.js';

const nameOf = Object.fromEntries(Object.entries(NFLVERSE_TEAM_CODES).map(([n, c]) => [c, n]));
export const codeOf = (team) => NFLVERSE_TEAM_CODES[team];
const teamName = (code) => nameOf[code] || code;
const n = (x) => Number(x) || 0;
const etDay = (d) => new Date(`${d}T16:00:00Z`).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
export const etDate = (when = new Date()) => new Date(when).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/** Everything the desk reads, loaded once per call. Unavailable files leave their sections out, said so. */
// A receiver's drops in one game from PFR's receiving charting (round 14: A.J. Brown's three drops in a 3-of-10 day).
// By PFR id through the weekly roster first, then by name (round 15: "Zonovan Knight" is the weekly stats' Bam Knight).
const dropsOf = (d, r) => { if (!d.recAdv) return 0;
  if (!d.dropMap) { d.dropMap = new Map(); const pfrOf = new Map((d.rosterWeekly || []).filter((x) => x.gsis_id && x.pfr_id).map((x) => [x.gsis_id, x.pfr_id]));
    d.dropPfr = pfrOf; for (const x of d.recAdv) { d.dropMap.set(`${x.game_id}|${retireKey(x.pfr_player_name)}`, n(x.receiving_drop)); d.dropMap.set(`${x.game_id}|pfr:${x.pfr_player_id}`, n(x.receiving_drop)); } }
  const pfr = d.dropPfr.get(r.player_id);
  return (pfr ? d.dropMap.get(`${r.game_id}|pfr:${pfr}`) : null) ?? d.dropMap.get(`${r.game_id}|${retireKey(r.player_display_name)}`) ?? 0; };

// Retirements from ESPN's team transactions, "TEAM|namekey" -> 'YYYY-MM-DD' (round 14: Lane Johnson retired Oct 6 and
// read for weeks as a regular who missed games; neither the weekly roster nor ESPN's roster says so). Null on a failure.
const retireKey = (x) => String(x || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');
let retirementsOnce = null;
async function espnRetirements(season) {
  retirementsOnce ||= (async () => {
    const get = async (url) => { const r = await fetch(url, { signal: AbortSignal.timeout(15_000) }); if (!r.ok) throw new Error(`ESPN ${r.status}`); return r.json(); };
    const teams = (await get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams')).sports?.[0]?.leagues?.[0]?.teams?.map((t) => t.team) || [];
    const out = new Map();
    await Promise.all(teams.map(async (t) => {
      const code = codeOf(t.displayName); if (!code) return;
      const list = (await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/transactions?team=${t.id}&limit=300`)).transactions || [];
      for (const x of list) {
        const day = String(x.date || '').slice(0, 10); if (!day.startsWith(String(season))) continue;
        const text = String(x.description || '');
        for (const m of text.matchAll(/(?:^|\.\s+)(?:[A-Z]{1,4}s?\s+)?([A-Z][\w.'-]+(?:\s+[A-Z][\w.'-]+)+)\s+announced (?:his|their) retirement/g)) out.set(`${code}|${retireKey(m[1])}`, day);
        for (const m of text.matchAll(/Placed (?:[A-Z]{1,4}s?\s+)?([A-Z][\w.'-]+(?:\s+[A-Z][\w.'-]+)+) on the reserve\/retired list/g)) out.set(`${code}|${retireKey(m[1])}`, day);
      }
    }));
    return out;
  })().catch(() => { retirementsOnce = null; return null; });
  return retirementsOnce;
}

export async function loadBettorData(season) {
  const [schedule, tw, pw, sc, rw, led, pp, dp, ij, rr] = await Promise.all([
    getNflSchedule().catch(() => null), loadNflverseFile('stats_team_week', season), loadNflverseFile('stats_player_week', season),
    loadNflverseFile('snap_counts', season).catch(() => null), loadNflverseFile('roster_weekly', season).catch(() => null),
    getPlayLedger(season).catch(() => null),
    loadNflverseFile('advstats_week_pass', season).catch(() => null), loadNflverseFile('advstats_week_def', season).catch(() => null),
    loadNflverseFile('injuries', season).catch(() => null),
    loadNflverseFile('advstats_week_rush', season).catch(() => null),
  ]);
  const recAdv = await loadNflverseFile('advstats_week_rec', season).catch(() => null);
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
  // Each player's line in the official box's counts (espnNflBox.js: tackles, targets, QB hits, passes defended).
  const official = await withOfficialBox(rows(pw), scheduleRows, season).catch((e) => { console.warn(`[NFL data] official box not checked: ${e.message}`); return null; });
  // Each club's head coach this season from ESPN (espnNflCoaches.js, as the desk reads it; Oct 29 2026 hunt, round 7:
  // the second system printed the schedule's out-of-date "coach Sean McDermott" on every Bills game). Null: not on file.
  const coaches = new Map(await Promise.all(Object.entries(NFLVERSE_TEAM_CODES).map(async ([name, code]) => [code, await getNflHeadCoach(name, season).catch(() => null)])));
  const retired = await espnRetirements(season);
  return { season, schedule: scheduleRows, scheduleMissing: !schedule || Boolean(schedule.unavailable), retired, recAdv: recAdv && !recAdv.unavailable ? recAdv.rows : null,
    teamWeek: rows(tw), playerWeek: official?.rows ?? rows(pw), officialCorrections: official?.corrected ?? null, snaps: rows(sc), rosterWeekly: rows(rw),
    ledgerGames: ledger ? new Map((ledger.games || []).map((g) => [g.game_id, g])) : null, weather, coaches,
    pressure: pressureByGame(rows(pp), rows(dp)),
    // PFR's run charting per player-game (round 12: contact and tackling were missing): "game_id|team" -> rows.
    rushCharting: rows(rr) ? rows(rr).reduce((m, r) => m.set(`${r.game_id}|${r.team}`, [...(m.get(`${r.game_id}|${r.team}`) || []), r]), new Map()) : null,
    // Who was on each week's injury report, by league id: an inactive player not on it was a healthy scratch (round 11).
    onReport: rows(ij) ? new Set(rows(ij).map((r) => `${Number(r.week)}|${r.gsis_id}`)) : null };
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
  const list = (d.playerWeek || []).filter((r) => r.game_id === g.game_id && r.team === code && n(r.attempts) >= 5)
    .sort((a, b) => n(b.attempts) - n(a.attempts));
  // The quarterback who started and left early is on the list whatever his attempts (Oct 27 2026 data loop: Darnold,
  // Murray, Dart and Mariota each started a game and threw under five passes, and their games read as games they missed).
  const starter = startedEarlyExit(d, g, code);
  return starter && !list.includes(starter) ? [...list, starter] : list;
}
// A quarterback who threw one to four passes in relief (Oct 29 2026 hunt: Kenny Pickett ran the Panthers' last two drives
// in Week 7, 3-of-4, and nothing said he played), named after the game's quarterbacks.
function reliefOf(d, g, code, passers) {
  return (d.playerWeek || []).filter((r) => r.game_id === g.game_id && r.team === code && r.position === 'QB' && n(r.attempts) > 0 && !passers.includes(r));
}
// The player-stat row of a game's starting quarterback when someone else threw most of its passes (the play ledger names
// him "S.Darnold": first initial and last name), or null.
function startedEarlyExit(d, g, code) {
  const st = d.ledgerGames?.get(g.game_id)?.starters?.[code]?.started;
  if (!st) return null;
  const [initial, ...rest] = String(st).toLowerCase().split('.');
  const last = rest.join('').replace(/[^a-z]/g, '');
  const rows = (d.playerWeek || []).filter((r) => r.game_id === g.game_id && r.team === code && n(r.attempts) > 0
    && String(r.player_display_name).toLowerCase().charAt(0) === initial
    && String(r.player_display_name).toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').trim().split(/\s+/).pop().replace(/[^a-z]/g, '') === last);
  return rows.length === 1 ? rows[0] : null;
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
  // Field goals and extra points named apart (round 8: the punter's one extra point after Grupe's injury read "FG Blake
  // Grupe and Ethan Evans 1-of-1").
  const rows = (d.playerWeek || []).filter((r) => r.game_id === g.game_id && r.team === code);
  const names = (k) => [...new Set(rows.filter((r) => n(r[k]) > 0).map((r) => r.player_display_name))];
  return { ...b, kicking: { ...b.kicking, kickers: names('fg_att'), xpKickers: names('pat_att') } };
}

/** One team's season before `before`: each game's result, score, box score both ways and who played quarterback. */
export function teamGames(d, code, season, before) {
  const tw = d.teamWeek || [];
  return played(d, season, before).filter((g) => g.home_team === code || g.away_team === code).map((g) => {
    const home = g.home_team === code; const opp = home ? g.away_team : g.home_team;
    const us = tw.find((r) => r.game_id === g.game_id && r.team === code); const them = tw.find((r) => r.game_id === g.game_id && r.team === opp);
    const pf = n(home ? g.home_score : g.away_score), pa = n(home ? g.away_score : g.home_score);
    const passers = passersOf(d, g, code);
    const relief = reliefOf(d, g, code, passers);
    // Who the opponent had at quarterback: Atlanta's loss to a 4-1 Baltimore was to Tyler Huntley, Lamar Jackson out
    // (Oct 23 2026 data check).
    const oppPassers = passersOf(d, g, opp);
    const oppQb = oppPassers[0]?.player_display_name || null;
    return { g, home, opp, pf, pa, won: pf > pa, tied: pf === pa, week: Number(g.week), date: g.gameday, passers, relief, oppQb, oppPassers,
      qb: passers[0]?.player_display_name || null, startedQb: startedEarlyExit(d, g, code)?.player_display_name || null,
      oppStartedQb: startedEarlyExit(d, g, opp)?.player_display_name || null,
      // Overtime from the schedule (Oct 23 2026 data audit: Kansas City's 3-point win over Indianapolis read as a
      // regulation win), and the game's play-ledger entry, when the ledger has it.
      ot: g.overtime === '1', ledger: d.ledgerGames?.get(g.game_id) || null,
      // A neutral site (Oct 26 2026: the Eagles' London game read "@ Jacksonville Jaguars", a road game, and eight games
      // this season are at neutral sites).
      neutral: g.location === 'Neutral', stadium: g.stadium || null,
      off: withKickers(box(us), d, g, code), def: withKickers(box(them), d, g, opp) };
  }).sort((a, b) => a.date.localeCompare(b.date));
}
const record = (gs) => { const w = gs.filter((x) => x.won).length, t = gs.filter((x) => x.tied).length; return `${w}-${gs.length - w - t}${t ? `-${t}` : ''}`; };
// Each game listed, newest first: the result, the opponent, and yards both ways where the weekly stats are published.
// Never a season average, at any number of games: an average of two carried by one blowout read as who the team is
// (Oct 23 2026 data check: "with Williams, 31.0 points a game" was 59, 3 and 31), and from six games on the board read
// blended averages (Oct 23 2026 data audit: the Bears' three backup starts inside one points-a-game number).
const nickname = (code) => teamName(code).split(' ').at(-1);
// "vs Bills", "@ Bills", or "vs Jaguars at a neutral site (Tottenham Hotspur Stadium)"; `short` for a line of many games.
const versus = (x, name, short = false) => (!x.neutral ? `${x.home ? 'vs' : '@'} ${name}`
  : short ? `vs ${name} (neutral site)` : `vs ${name} at a neutral site${x.stadium ? ` (${x.stadium})` : ''}`);
// Who the opponent was that day: its record now, its quarterback that day, and its other games as results with the
// quarterback in each (founder, Oct 29 2026: no averages and no league places, "give Gary the numbers behind the
// average"; it replaced "allowing 21.6 points a game, 14th fewest; Baker Mayfield 0-3 in his 3 other full games,
// scoring 20.7 points a game"). The scores carry the points both ways, and a backup's games show his name (the Oct 26
// Bears-with-Keenum lesson), so nothing is blended.
const surname = (name) => String(name || '').trim().split(/\s+/).slice(1).join(' ') || String(name || '');
// Every quarterback who threw five or more passes that day (and a starter who left early), most passes first (round 9:
// the Bears' Week 2 read "Caleb Williams at QB that day"; Tyson Bagent threw 9 after Williams got hurt). `short` gives
// surnames for a line of many games.
function qbsText(rows, started, short = false) {
  if (!rows?.length) return null;
  const name = (r) => (short ? surname(r.player_display_name) : r.player_display_name);
  const leftEarly = started && !sameQb(started, rows[0].player_display_name);
  if (short) return `${rows.map(name).join(' and ')}${leftEarly ? `, ${surname(started)} started` : ''}`;
  if (rows.length === 1) return `${name(rows[0])}${leftEarly ? ` (${started} started, left early)` : ''}`;
  return rows.map((r) => `${name(r)} (${n(r.attempts)} passes${leftEarly && sameQb(started, r.player_display_name) ? ', started, left early' : ''})`).join(' and ');
}
function opponentThatDay(d, before, x) {
  const games = teamGames(d, x.opp, d.season, before);
  // The starter who left early is named too (Oct 29 2026 hunt, round 7: the Patriots' Week 1 opponent read "Drew Lock at
  // QB that day", Sam Darnold's start and exit unsaid).
  const qbThat = x.oppPassers?.length ? `; ${qbsText(x.oppPassers, x.oppStartedQb)} at QB that day` : '';
  const others = games.filter((g) => g.g.game_id !== x.g.game_id).slice().reverse()
    // Each of its games with what it did on the ground and through the air, and what it allowed (round 12, the Packers
    // read: Dallas's 48 rushing against Green Bay was Dallas's usual output; only scores were shown).
    // With its sacks and turnovers both ways too (round 13: a pass rush's sacks could not be read against the lines it faced).
    .map((g) => { const u = g.off && g.def ? `; ran ${g.off.rushing} on ${g.off.carries}, passed for ${Math.round(g.off.yards - g.off.rushing)}, sacked ${g.off.sacked}, ${g.off.giveaways} giveaway${g.off.giveaways === 1 ? '' : 's'}; allowed ${g.def.rushing} rushing, ${Math.round(g.def.yards - g.def.rushing)} passing, ${g.def.sacked} sacks made, ${g.def.giveaways} takeaway${g.def.giveaways === 1 ? '' : 's'}` : '';
      return `${g.won ? 'W' : g.tied ? 'T' : 'L'} ${g.pf}-${g.pa}${g.ot ? ' (OT)' : ''} ${versus(g, g.opp, true)}${g.passers?.length || u ? ` (${g.passers?.length ? qbsText(g.passers, g.startedQb, true) : 'QB not on file'}${u})` : ''}`; });
  return `${record(games)} now${qbThat}; ${others.length ? `their other games, newest first: ${others.join(', ')}` : 'no other games yet'}`;
}
/** The defense a player faced, for the prop sheets: its record now and the points it allowed in each of its games,
 * newest first (Oct 29 2026, founder: no averages or places; it read "allowing 26.3 points a game, 5th most"). */
export function defensesFaced(schedule, season, before, asOf = null) {
  const d = { schedule: schedule || [], season, asOf };
  const codes = [...new Set((d.schedule || []).filter((g) => String(g.season) === String(season)).flatMap((g) => [g.home_team, g.away_team]))];
  return new Map(codes.map((code) => { const gs = teamGames(d, code, season, before); return [code, gs.length ? `${record(gs)} now; allowed ${gs.slice().reverse().map((g) => g.pa).join(', ')} in its games, newest first` : 'no games yet']; }));
}
// Each game with the opponent's record and season now and who played quarterback for it that day, as the game log gives
// them (Oct 24 2026: the board read "W 22-6 vs Chargers" without the Chargers being 0-6).
function perGame(d, before, gs) {
  return gs.slice().reverse().map((x) => {
    return `${x.won ? 'W' : x.tied ? 'T' : 'L'} ${x.pf}-${x.pa}${x.ot ? ' in overtime' : ''} ${versus(x, nickname(x.opp), true)} (${opponentThatDay(d, before, x)}${x.off && x.def ? `; ${Math.round(x.off.yards)} yards, allowed ${Math.round(x.def.yards)}` : ''})`;
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
  // The commissioner's exempt list is off the active roster the same way (Oct 29 2026 hunt: Josh Jacobs, exempt for
  // Weeks 1-6, read as a plain "did not play").
  const onReserve = (g, id) => ['RES', 'EXE'].includes(statusAt(g, id)?.status);
  const reserveWord = (g, id) => { const st = statusAt(g, id); return st?.status === 'RES' ? (RESERVE[st.code] || 'reserve') : st?.status === 'EXE' ? "commissioner's exempt list" : null; };
  const wasInactive = (g, id) => statusAt(g, id)?.status === 'INA';
  // Off the team that week: matched on an earlier week's roster and on none of this week's (Oct 23 2026 audit: an id
  // missing from every week read as "no longer on the roster" for every lineman).
  const everOnRoster = (id) => [...rosterWeeks].some((w) => keysOf(id).some((k) => status.has(`${w}|${k}`)));
  // Released, retired or traded that week is off the team too (round 10: Najee Harris, released in Week 7, read as a
  // missing regular who "did not play").
  const OFF = { CUT: 'released', RET: 'retired', TRD: 'traded', TRT: 'traded', TRC: 'traded', DEV: 'moved to the practice squad' };
  // A retirement ESPN's transactions date before the game is off the team the same way (round 14).
  const retiredOn = (id) => d.retired?.get(`${code}|${retireKey(name.get(id)?.name)}`) || null;
  const offWord = (g, id) => OFF[statusAt(g, id)?.status] || (retiredOn(id) && retiredOn(id) < String(g.date) ? `retired ${new Date(`${retiredOn(id)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}` : null);
  const gone = (g, id) => rosterWeeks.has(g.week) && (!statusAt(g, id) || Boolean(offWord(g, id))) && everOnRoster(id);
  const st = new Map();
  for (const r of rows) st.set(`${r.game_id}|${r.pfr_player_id}`, n(r.st_pct));
  const specialTeamsOnly = (g, id) => (st.get(`${g.g.game_id}|${id}`) || 0) > 0;
  const players = [...name.keys()];
  const of = (g, id) => share.get(`${g.g.game_id}|${id}`) || 0;
  const label = (g, id, pct, extra = '') => `${name.get(id).name} (${posAt.get(`${g.g.game_id}|${id}`) || name.get(id).pos}${pct ? `, ${Math.round(100 * of(g, id))}% of snaps` : ''}${extra})`;
  const list = (ps, f) => ps.slice(0, 8).map(f).join(', ') + (ps.length > 8 ? ` and ${ps.length - 8} more` : '');
  const why = (g, id) => reserveWord(g, id) || offWord(g, id) || (statusAt(g, id)?.status === 'DEV' ? 'practice squad' : null) || (wasInactive(g, id) ? 'inactive' : specialTeamsOnly(g, id) ? 'special teams only' : statusAt(g, id)?.status === 'ACT' ? 'active, did not play' : 'did not play');
  // The weekly stats' players (GSIS ids) as snap-count players (PFR ids): through the weekly roster, else the name.
  const pfrOfGsis = new Map();
  for (const r of d.rosterWeekly || []) if (r.team === code && r.gsis_id && r.pfr_id) pfrOfGsis.set(r.gsis_id, r.pfr_id);
  const gsisOf = new Map([...pfrOfGsis].map(([gsis, pfr]) => [pfr, gsis]));
  const gsisByKey = new Map();
  for (const r of d.rosterWeekly || []) if (r.team === code && r.gsis_id) for (const k of keys(r.full_name)) if (!gsisByKey.has(k)) gsisByKey.set(k, r.gsis_id);
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
  const out = new Map(); out.absent = new Map(); out.limited = new Map();
  gs.forEach((g, i) => {
    const prior = gs.slice(0, i);
    // A regular by his recent games, the last three before this one (round 8: T.J. Bass, a fill-in guard until Tyler Smith
    // came back, and the benched Jackson Powers-Johnson read as missing regulars every week after).
    // His last three games on hand (played, or active): weeks inactive or on reserve are left out of the window (round 9:
    // Antoine Winfield Jr., inactive Weeks 5-7, stopped reading as a missing regular in his third week out).
    const onHand = (e, id) => of(e, id) > 0 || statusAt(e, id)?.status === 'ACT';
    const snapRegular = (id) => { const recent = prior.filter((e) => onHand(e, id)).slice(-3); return recent.length > 0 && recent.filter((e) => of(e, id) >= 0.6).length >= Math.ceil(recent.length / 2); };
    // Active and held under a quarter of the snaps two games running is a backup now, not a regular missing.
    const activeBench = (e, id) => statusAt(e, id)?.status === 'ACT' && of(e, id) < 0.25;
    // An inactive week off that week's injury report is a healthy scratch, a bench week too (round 11: Alontae Taylor,
    // scratched then active without a snap, read "missed Wk 6-7").
    // By name on the club's weekly roster when the snap file's id has no GSIS link (round 15: no offensive lineman's
    // roster row carries a PFR id, so Jake Majors, scratched healthy the day Kendall returned, read as a missing regular).
    const gsisFor = (id) => gsisOf.get(id) || keysOf(id).map((k) => gsisByKey.get(k)).find(Boolean) || null;
    const healthyScratch = (e, id) => statusAt(e, id)?.status === 'INA' && d.onReport && Boolean(gsisFor(id)) && !d.onReport.has(`${Number(e.week)}|${gsisFor(id)}`);
    const benchWeek = (e, id) => activeBench(e, id) || healthyScratch(e, id);
    const benched = (id) => i > 0 && benchWeek(g, id) && benchWeek(gs[i - 1], id);
    const skill = skillRegulars(prior);
    const regular = (id) => snapRegular(id) || skill.has(id);
    const stillOnReserve = (id) => i > 0 && onReserve(g, id) && onReserve(gs[i - 1], id);
    // A regular who did not play at all is missing; one with a few snaps left early or was limited, with his share
    // (Oct 23 2026 data check: an in-game injury read as "missing"); one no longer on the roster has left the team.
    // A quarterback who was active and did not play is the backup that day, and the game's QB line names who played
    // (Oct 23 2026 data audit: Seattle read "without Drew Lock" the week Sam Darnold came back).
    const backupQb = (id) => name.get(id).pos === 'QB' && statusAt(g, id)?.status === 'ACT';
    // Named on the first game he was gone only (Oct 29 2026 hunt: Marvin Harrison Jr., traded after Week 5, read "no
    // longer on the roster" under Weeks 6 and 7).
    // Corners and safeties apart, linemen and linebackers by group.
    const GROUP = (pos) => (/^(T|G|C|OT|OG|OL)$/.test(pos) ? 'OL' : /^(DE|DT|NT|DL|EDGE)$/.test(pos) ? 'DL' : /LB$/.test(pos) ? 'LB' : pos === 'CB' ? 'CB' : /^(S|FS|SS|SAF)$/.test(pos) ? 'S' : pos);
    const posOf = (id) => posAt.get(`${g.g.game_id}|${id}`) || name.get(id).pos;
    // Back from an absence: not active the game before (round 14: Caleb Rogers, active on special teams in Week 5, read
    // "back" in Week 6 and Jackson Powers-Johnson, benched for him, read as the fill-in), or his first game off a reserve
    // list (Tyler Smith off IR in Week 5).
    const wasOut = (e, id) => statusAt(e, id)?.status !== 'ACT' || (of(e, id) === 0 && !specialTeamsOnly(e, id));
    const back = i ? players.filter((id) => of(g, id) >= 0.25 && of(gs[i - 1], id) < 0.1 && wasOut(gs[i - 1], id)
      && (prior.some((e) => of(e, id) >= 0.25) || (of(g, id) >= 0.5 && onReserve(gs[i - 1], id)))) : [];
    // A fill-in back to his old role the day the starter he filled for returns is neither missing nor limited (round 11:
    // T.J. Bass read "out that day" the game Tyler Smith came back).
    // Only a player who filled in for him: under half the snaps in the returning player's last full game before his
    // absence (round 12: Justin Jefferson, hurt in the first quarter the day Jauan Jennings came back, read "back to a
    // reserve role").
    // On the field in that game, never inactive (round 14); a starter back from a reserve list with no game before was
    // filled for by whoever played half or more while he was on it.
    const filledFor = (id, q) => { const lw = prior.slice().reverse().find((e) => of(e, q) >= 0.5);
      return lw ? of(lw, id) > 0 && of(lw, id) < 0.5 : prior.some((e) => onReserve(e, q) && of(e, id) >= 0.5); };
    const returned = (id) => back.filter((q) => q !== id && GROUP(posOf(q)) === GROUP(posOf(id)) && of(g, q) >= 0.5 && filledFor(id, q));
    // Only one who was active that day: an injured or inactive player stays missing (round 11 build: Jalen Thompson).
    // A fill-in scratched healthy that day (inactive, on no report that week) is back on the bench too (round 14: Jake
    // Majors, inactive the day Drew Kendall returned, read as a missing regular).
    const displaced = (id) => (of(g, id) > 0 || statusAt(g, id)?.status === 'ACT' || healthyScratch(g, id)) && of(g, id) < 0.25 && returned(id).length > 0;
    const departed = players.filter((id) => regular(id) && of(g, id) === 0 && gone(g, id) && !(i > 0 && gone(gs[i - 1], id)));
    const absent = players.filter((id) => regular(id) && of(g, id) === 0 && !gone(g, id) && !backupQb(id) && !benched(id) && !displaced(id));
    const missing = absent.filter((id) => !stillOnReserve(id));
    // A fill-in quarterback's late snaps behind the returning starter are not a regular hurt or held back (Oct 29 2026
    // hunt: Jalon Daniels, the Bucs' starter for three weeks, read "left early or limited" at 10% the day Mayfield
    // came back).
    const starterBack = (id) => name.get(id).pos === 'QB' && players.some((q) => q !== id && name.get(q).pos === 'QB' && of(g, q) >= 0.5);
    const limited = players.filter((id) => snapRegular(id) && of(g, id) > 0 && of(g, id) < 0.25 && !starterBack(id) && !benched(id) && !displaced(id));
    const reserveRole = players.filter((id) => snapRegular(id) && displaced(id) && !gone(g, id));
    const reserved = players.filter((id) => !absent.includes(id) && !departed.includes(id) && onReserve(g, id) && !stillOnReserve(id) && of(g, id) === 0 && prior.some((e) => of(e, id) >= 0.25));
    const fresh = i ? players.filter((id) => of(g, id) >= 0.25 && prior.every((e) => of(e, id) < 0.1)) : [];
    // Every regular who did not play that day, as an opponent's line reads it: its quarterback first, then whoever had
    // played the most snaps before (an opponent's line names four).
    const snapsBefore = (id) => prior.reduce((a, e) => a + of(e, id), 0);
    // The regulars who left early or were held to a few snaps, as an opponent's line reads them too (Oct 28 2026 data
    // check: the 49ers' Week 6 win read without Washington losing McLaurin in the first quarter).
    out.limited.set(g.g.game_id, limited.map((id) => label(g, id, true)));
    out.absent.set(g.g.game_id, absent.slice().sort((a, b) => (name.get(b).pos === 'QB') - (name.get(a).pos === 'QB') || snapsBefore(b) - snapsBefore(a))
      .map((id) => ({ name: name.get(id).name, pos: posAt.get(`${g.g.game_id}|${id}`) || name.get(id).pos, why: why(g, id) })));
    // Who played his spot that game: the same position group, half the snaps or more, not back from his own absence, and
    // either under half but on the field in the missing player's last game or never a regular before (rounds 10-11:
    // Justin Jefferson, back from his own missed game, read as Jordan Addison's fill-in).
    // A starter of his own up to that game is not a fill-in, and neither is a rotation player at about his usual share:
    // a fill-in rose by a quarter of the snaps or more (round 15: Will Campbell, the left tackle, 37% the day he was hurt
    // in Week 5, and DeMario Douglas at his usual 46-65%, read as Vera-Tucker's and Doubs's fill-ins).
    const inPlace = (id) => { const lw = prior.findLastIndex((e) => of(e, id) >= 0.5); const lastWith = lw >= 0 ? prior[lw] : null;
      const incumbent = (p) => { const recent = prior.slice(0, lw + 1).filter((e) => onHand(e, p)).slice(-3); return recent.length > 0 && recent.filter((e) => of(e, p) >= 0.6).length >= Math.ceil(recent.length / 2); };
      // Nor one out hurt that day, on reserve or inactive on the report, back in his own role since (round 16 build: A.J.
      // Brown, on IR for Weeks 2-5, read as Doubs's fill-in).
      const outHurt = (e, p) => onReserve(e, p) || (statusAt(e, p)?.status === 'INA' && d.onReport && !healthyScratch(e, p));
      return players.filter((p) => p !== id && GROUP(posOf(p)) === GROUP(posOf(id)) && of(g, p) >= 0.5 && !back.includes(p)
        && (lastWith ? of(lastWith, p) < 0.5 && of(g, p) - of(lastWith, p) >= 0.25 && !incumbent(p) && !outHurt(lastWith, p) : prior.every((e) => of(e, p) < 0.5)))
        .map((p) => `${name.get(p).name} ${Math.round(100 * of(g, p))}%`); };
    const parts = [
      missing.length ? `missing regulars: ${list(missing, (id) => `${name.get(id).name} (${name.get(id).pos}, ${why(g, id)}${inPlace(id).length ? `; at ${GROUP(posOf(id))} that day: ${inPlace(id).join(', ')}` : ''})`)}` : null,
      limited.length ? `left early or limited: ${list(limited, (id) => label(g, id, true))}` : null,
      reserveRole.length ? `back to a reserve role: ${list(reserveRole, (id) => `${name.get(id).name} (${name.get(id).pos}) as ${returned(id).map((q) => name.get(q).name).join(' and ')} returned`)}` : null,
      departed.length ? `no longer on the roster: ${list(departed, (id) => `${name.get(id).name} (${name.get(id).pos}${offWord(g, id) ? `, ${offWord(g, id)}` : ''})`)}` : null,
      reserved.length ? `on reserve: ${list(reserved, (id) => `${name.get(id).name} (${name.get(id).pos}, ${reserveWord(g, id)})`)}` : null,
      back.length ? `back: ${list(back, (id) => label(g, id, true))}` : null,
      // One who played for another club this season says so (round 13: the Ravens' Cam Jurgens, acquired from
      // Philadelphia, read like a backup's first big game).
      fresh.length ? `first game at 25%+ of snaps: ${list(fresh, (id) => { const elsewhere = (d.snaps || []).filter((r) => r.pfr_player_id === id && r.team !== code && n(r.week) < n(g.week) && Math.max(n(r.offense_pct), n(r.defense_pct)) >= 0.25);
        const from = elsewhere.length ? `; with ${elsewhere[0].team} this season, Wk ${Math.min(...elsewhere.map((r) => n(r.week)))}-${Math.max(...elsewhere.map((r) => n(r.week)))}` : '';
        return label(g, id, true, `${prior.length && prior.every((e) => onReserve(e, id)) ? `, off ${statusAt(gs[i - 1], id)?.status === 'EXE' ? "the commissioner's exempt list" : 'reserve'}` : ''}${from}`); })}` : null,
    ].filter(Boolean);
    out.set(g.g.game_id, parts.join(' · '));
    out.missing = { names: [...missing, ...limited].map((id) => ({ name: name.get(id).name, pos: name.get(id).pos, limited: limited.includes(id), why: missing.includes(id) ? why(g, id) : null })) };
  });
  return out;
}

/** WHO THE OFFENSE RUNS THROUGH: beyond the quarterback, the two players with the most carries and the four with the
 * most targets this season, every game's touches and yards newest first with no season total (Oct 26 2026: the total
 * was the rows added up plus the games past the latest five, and a total says nothing of who or when; founder: "all they
 * do is play games"), and whether he is on this week's injury report (`reportText`). Counts, not rates (Oct 23 2026:
 * Kenneth Walker led the league in rushing and carried Kansas City past the Chargers; Gary read only quarterbacks, and
 * called Kansas City thin without Rice and Thornton without knowing who was left). */
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
  // The season's leaders, and each of the last three games' (Oct 27 2026 data check: the season's leaders alone left out
  // the back and the tight end taking the work now: Pierce for the Eagles, Darnell Washington for the Steelers).
  const floor = { carries: 3, targets: 2 };
  const gameTop = (gid, k, top) => [...by.values()].map((rs) => [rs, rs.find((r) => r.game_id === gid)]).filter(([, r]) => r && n(r[k]) >= floor[k])
    .sort((a, b) => n(b[1][k]) - n(a[1][k])).slice(0, top).map(([rs]) => rs);
  const recent = gs.slice(-3).flatMap((x) => [...gameTop(x.g.game_id, 'carries', 2), ...gameTop(x.g.game_id, 'targets', 4)]);
  const chosen = [...new Set([...ranked('carries').slice(0, 2), ...ranked('targets').slice(0, 4), ...recent])];
  const text = String(reportText).toLowerCase().replace(/[^a-z]/g, '');
  // A game with no stats row is "did not play" only when the snap counts have no snap for him either: Rice left Week 4
  // after 10% of the snaps without a touch.
  const snapRow = snapMatcher(d, c);
  // Offensive snaps for an offensive usage line, defense said apart (round 10: Travis Hunter's 100% on defense read "no
  // touches (100% of snaps)").
  const snapShare = (row, gameId) => { const r = snapRow(row, gameId); return r ? n(r.offense_pct) : 0; };
  const defShare = (row, gameId) => n(snapRow(row, gameId)?.defense_pct);
  // Special-teams snaps are playing too (Oct 27 2026 data check: KaVontae Turpin, hurt on his first return in Week 6,
  // read "did not play").
  const stShare = (row, gameId) => n(snapRow(row, gameId)?.st_pct);
  // With his fumbles lost (round 12: the live read gave the team's count and never who put it on the ground).
  const lostBy = (r) => n(r.rushing_fumbles_lost) + n(r.receiving_fumbles_lost) + n(r.sack_fumbles_lost);
  const game = (r) => [n(r.carries) ? `${n(r.carries)} ${n(r.carries) === 1 ? 'carry' : 'carries'} ${n(r.rushing_yards)} yds${n(r.rushing_tds) ? ` ${n(r.rushing_tds)} TD` : ''}` : null,
    n(r.targets) ? `${n(r.receptions)} of ${n(r.targets)} targets ${n(r.receiving_yards)} yds${n(r.receiving_tds) ? ` ${n(r.receiving_tds)} TD` : ''}${dropsOf(d, r) ? `, ${dropsOf(d, r)} drop${dropsOf(d, r) === 1 ? '' : 's'}` : ''}` : null,
    lostBy(r) ? `${lostBy(r)} fumble${lostBy(r) === 1 ? '' : 's'} lost` : null].filter(Boolean).join(', ') || 'no touches';
  // Why a game has no line for him: another club that week (with its numbers), a reserve list, inactive, the practice
  // squad, or no club at all (round 9: Marvin Harrison Jr.'s four Arizona games read "did not play" for Houston).
  const rosterAt = new Map((d.rosterWeekly || []).filter((r) => r.gsis_id).map((r) => [`${r.gsis_id}|${n(r.week)}`, r]));
  const notPlayed = (p, week) => {
    const elsewhere = d.playerWeek.find((r) => r.player_id === p.player_id && n(r.week) === week && r.team !== c && String(r.season) === String(d.season));
    // That game's own opponent, not this team's that week (round 10: Harrison's Arizona games read beside Houston's).
    if (elsewhere) return `with ${elsewhere.team} against ${elsewhere.opponent_team}: ${game(elsewhere)}`;
    const r = rosterAt.get(`${p.player_id}|${week}`);
    if (!r) return d.rosterWeekly?.length ? 'on no club\'s roster that week' : 'did not play';
    const st = String(r.status || '').toUpperCase();
    const word = st === 'INA' ? 'inactive' : st === 'EXE' ? "commissioner's exempt list" : st === 'DEV' ? 'practice squad'
      : st === 'CUT' ? 'released' : st === 'RET' ? 'retired' : /^TR/.test(st) ? 'traded'
      : st === 'RES' ? (/^R(?:01|48)$/.test(String(r.status_description_abbr || '')) ? 'injured reserve' : 'on a reserve list') : st === 'ACT' ? 'active, did not play' : 'did not play';
    // Another club's week names that club's own game (round 11: "Wk 5 @ Titans with ARI, inactive" was Arizona vs Detroit).
    const theirGame = r.team !== c ? (d.schedule || []).find((x) => x.season === String(d.season) && Number(x.week) === week && (x.home_team === r.team || x.away_team === r.team)) : null;
    if (r.team !== c) return theirGame ? `with ${r.team} against ${theirGame.home_team === r.team ? theirGame.away_team : theirGame.home_team}, ${word}` : `with ${r.team} (no game that week), ${word}`;
    return st === 'ACT' ? 'did not play, active' : word === 'did not play' ? word : `did not play (${word})`;
  };
  const lines = chosen.map((rs) => {
    const last = rs.slice().sort((a, b) => n(b.week) - n(a.week))[0];
    const played = new Map(rs.map((r) => [r.game_id, r]));
    // Each game names the opponent (Oct 26 2026): the game log above says who it was and how good it is.
    // A stat row with no carry or target (a return) says how much he played.
    const rowGame = (x) => { const t = game(played.get(x.g.game_id)); if (t !== 'no touches') return t; const off = snapShare(last, x.g.game_id), sts = stShare(last, x.g.game_id); return off > 0 ? `no touches (${Math.round(100 * off)}% of offensive snaps)` : sts > 0 && !defShare(last, x.g.game_id) ? `no carries or targets; special teams only (${Math.round(100 * sts)}% of special-teams snaps)` : defShare(last, x.g.game_id) > 0 ? 'no offensive snaps' : t; };
    const recent = gs.slice().reverse().map((x) => { const why = played.has(x.g.game_id) ? null : snapShare(last, x.g.game_id) > 0 ? null : stShare(last, x.g.game_id) > 0 ? null : notPlayed(last, x.week);
      // Another club's game is its own row, with its own opponent; this team's opponent that week is not his.
      if (why && /^with [A-Z]+ (?:against |\(no game)/.test(why)) return `Wk ${x.week} ${why}`;
      return `Wk ${x.week} ${versus(x, nickname(x.opp), true)} ${played.has(x.g.game_id) ? rowGame(x) : snapShare(last, x.g.game_id) > 0 ? `no touches (${Math.round(100 * snapShare(last, x.g.game_id))}% of offensive snaps)` : stShare(last, x.g.game_id) > 0 ? `special teams only (${Math.round(100 * stShare(last, x.g.game_id))}% of special-teams snaps)` : why}${defShare(last, x.g.game_id) > 0 ? `; ${Math.round(100 * defShare(last, x.g.game_id))}% on defense` : ''}`; });
    // With his status, as the report lists it (Oct 24 2026: Rice read "on this week's injury report" while Out).
    const reportLine = String(reportText).split('\n').find((l) => l.toLowerCase().replace(/[^a-z]/g, '').includes(sameKey(last.player_display_name)));
    // A player on a reserve list has his status after his name there (Oct 29 2026 hunt, round 7: De'Von Achane, out for
    // the season, read only "on this week's injury report"; the line is "also on reserve lists: ... De'Von Achane (IR)").
    const status = (reportLine?.match(/^\s*•\s*[^(]+\([^)]*\)\s*\(([^)]+)\)/) || [])[1]
      || (/reserve lists?:/i.test(reportLine || '') ? [...reportLine.split(/reserve lists?:/i)[1].matchAll(/\s*([^,(]+?) \(([^)]+)\)/g)]
        .find((m) => sameKey(m[1]) === sameKey(last.player_display_name))?.[2] : undefined);
    const listed = text.includes(sameKey(last.player_display_name)) ? ` · ${status ? `${status} on` : 'on'} this week\'s injury report` : '';
    return `  ${last.player_display_name} (${last.position})${listed}: ${recent.join('; ')}`;
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
  // Each of his names on the weekly roster (Oct 29 2026 hunt: the snaps' "Patrick Surtain II" read "not on this week's
  // injury report" under "Pat Surtain II", listed).
  const variants = rosterNames(d, c);
  const back = (changes.missing?.names || []).filter((p) => !variants(p.name).some((k) => k && text.includes(k)));
  // A regular on a reserve, suspended or exempt list in the last game who is active on the coming week's roster and on no
  // report (round 15: Montez Sweat, back from a two-week suspension, read nowhere for the coming game).
  const lastGame = gs.at(-1);
  const rosterWeeks = (d.rosterWeekly || []).filter((r) => r.team === c).map((r) => n(r.week));
  const nextWeek = rosterWeeks.length ? Math.max(...rosterWeeks) : 0;
  const activeNow = (nm) => nextWeek > n(lastGame.week) && (d.rosterWeekly || []).some((r) => r.team === c && n(r.week) === nextWeek && String(r.status).toUpperCase() === 'ACT' && variants(nm).includes(sameKey(r.full_name)));
  const returning = (changes.absent?.get(lastGame.g.game_id) || []).filter((a) => /suspend|IR|reserve|exempt|PUP|non-football/i.test(a.why || '')
    && !back.some((b) => b.name === a.name) && !variants(a.name).some((k) => k && text.includes(k)) && activeNow(a.name));
  if (!back.length && !returning.length) return null;
  // How he missed it, as the game log says it (Oct 24 2026: "missed Wk 6" for a safety who played special teams only).
  // How many straight games he has been without, so a month away does not read as one missed week (Oct 29 2026 hunt:
  // Lane Johnson, retired Oct 6 and still on both rosters, read "missed Wk 7").
  const straight = (p) => { let k = 0; for (let i = gs.length - 1; i >= 0 && (changes.absent?.get(gs[i].g.game_id) || []).some((a) => a.name === p.name); i--) k += 1; return k; };
  // With why, game by game (round 11: a healthy scratch and a practice-squad player read as plain missed games).
  const whyIn = (p, x) => (changes.absent?.get(x.g.game_id) || []).find((a) => a.name === p.name)?.why || null;
  const missed = (p) => { const k = straight(p); const ws = gs.slice(-Math.max(k, 1)).map((x) => [x.week, whyIn(p, x)]);
    const why = ws.every(([, w]) => w === ws[0][1]) ? (ws[0][1] ? ` (${ws[0][1]})` : '') : ` (${ws.map(([w, y]) => `Wk ${w} ${y || 'did not play'}`).join(', ')})`;
    return k > 1 ? `missed Wk ${gs.at(-k).week}-${gs.at(-1).week}, ${k} straight games${why}` : `missed Wk ${gs.at(-1).week}${why}`; };
  return `${team}: ${[...back.map((p) => `${p.name} (${p.pos}, ${p.limited ? `left early or limited Wk ${gs.at(-1).week}` : p.why === 'special teams only' ? `special teams only Wk ${gs.at(-1).week}` : missed(p)})`),
    ...returning.map((a) => `${a.name} (${a.pos}, back from the ${a.why} list: ${missed(a)}; active on the Wk ${nextWeek} roster, not on this week's report)`)].join(', ')}`;
}
const sameKey = (x) => qbKey(x).join('');
// Every name a team's player goes by in the weekly roster (full name, first and last, the name he plays under) and the
// snap counts, joined by his PFR id: name -> those names as keys.
function rosterNames(d, code) {
  const byId = new Map();
  const add = (id, nm) => { if (!id || !nm || !String(nm).trim()) return; if (!byId.has(id)) byId.set(id, new Set()); byId.get(id).add(sameKey(nm)); };
  for (const r of d.rosterWeekly || []) if (r.team === code) { add(r.pfr_id, r.full_name); add(r.pfr_id, `${r.first_name || ''} ${r.last_name || ''}`); if (r.football_name) add(r.pfr_id, `${r.football_name} ${r.last_name || ''}`); }
  for (const s of d.snaps || []) if (s.team === code) add(s.pfr_player_id, s.player);
  const byKey = new Map();
  for (const set of byId.values()) for (const k of set) byKey.set(k, set);
  return (nm) => [...(byKey.get(sameKey(nm)) || new Set([sameKey(nm)]))];
}
// A weekly stats row's snap-count row in one game: through the weekly roster's GSIS-to-PFR ids, then the name (Oct 29 2026
// hunt: the two feeds spell about 25 players differently, Kenny and Kenneth Gainwell, Bam and Zonovan Knight, so the same
// player read twice in a box, once with no snap share, or "did not play" in games he played).
function snapMatcher(d, code) {
  const pfr = new Map();
  for (const r of d.rosterWeekly || []) if (r.team === code && r.gsis_id && r.pfr_id) pfr.set(r.gsis_id, r.pfr_id);
  const byGame = new Map();
  for (const s of d.snaps || []) if (s.team === code) { if (!byGame.has(s.game_id)) byGame.set(s.game_id, []); byGame.get(s.game_id).push(s); }
  return (row, gameId) => {
    const snaps = byGame.get(gameId) || [], id = pfr.get(row.player_id), k = sameKey(row.player_display_name);
    return (id && snaps.find((s) => s.pfr_player_id === id)) || snaps.find((s) => sameKey(s.player) === k) || null;
  };
}

/** THIS SEASON GAME BY GAME: each game newest first, its first line the result and score (overtime said), the
 * opponent's record and points scored and allowed a game now, its quarterback that day, and who played quarterback
 * (everyone with 5+ passes); under it, the opponent's regulars who did not play, the box score both ways, the score by quarter and the kicking, how each side's
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
// Either side's rushing with its quarterbacks' runs apart: `side` 'def' is the rushing allowed, the opposing passers'
// runs split out (round 12: Jayden Daniels' 103 on 9 was half of the Giants' "202 rushing" allowed).
function rushing(x, code, side = 'off') {
  const b = side === 'def' ? x.def : x.off, team = side === 'def' ? x.opp : code;
  const qbs = ((side === 'def' ? x.oppPassers : x.passers) || []).filter((r) => n(r.carries) > 0);
  if (!qbs.length) return `${b.rushing} rushing`;
  const kneels = x.ledger?.lines?.[team]?.kneels || {};
  const theirs = qbs.map((r) => { const k = kneels[r.player_id] || 0; return `${r.player_display_name} ${n(r.rushing_yards)} on ${n(r.carries)}${k ? ` (${kneelDowns(k)})` : ''}`; });
  const c = b.carries - qbs.reduce((a, r) => a + n(r.carries), 0), y = b.rushing - qbs.reduce((a, r) => a + n(r.rushing_yards), 0);
  return `${b.rushing} rushing: ${theirs.join(', ')}${c > 0 ? `, the rest ${y} on ${c}` : ''}`;
}
// THE PASS RUSH, GAME BY GAME (founder, Oct 29 2026: Gary had each game's sacks and QB hits but not how often a
// quarterback was under pressure, or who brought it; Bryce Young's 5 sacks against Tampa came on 6 pressures, the game
// his tackle and guard went down, after 20 pressures on Chicago's rush in Week 1). Pro Football Reference's charting
// via nflverse (advstats_week_pass, advstats_week_def): each quarterback's pressures, sacks, hits, hurries and the
// blitzes he saw, and each defense's leading rushers that day. Null when the files did not load.
function pressureByGame(passRows, defRows) {
  if (!passRows || !defRows) return null;
  const qbs = new Map(), rushers = new Map();
  for (const r of passRows) { const k = `${r.game_id}|${r.team}`; qbs.set(k, [...(qbs.get(k) || []), r]); }
  for (const r of defRows) { const k = `${r.game_id}|${r.team}`; rushers.set(k, [...(rushers.get(k) || []), r]); }
  return { qbs, rushers };
}
const pct = (v) => (v === '' || v == null ? null : Math.round(Number(v) * 100));
function pressureLine(d, x, code) {
  if (!d.pressure) return 'pressure: not on file';
  const side = (team) => {
    const qbs = (d.pressure.qbs.get(`${x.g.game_id}|${team}`) || []).filter((r) => n(r.times_pressured) || n(r.times_sacked));
    return qbs.length ? qbs.map((r) => `${r.pfr_player_name} pressured ${n(r.times_pressured)} time${n(r.times_pressured) === 1 ? '' : 's'}${pct(r.times_pressured_pct) != null ? ` (${pct(r.times_pressured_pct)}% of dropbacks)` : ''}: ${n(r.times_sacked)} sacked, ${n(r.times_hit)} hit, ${n(r.times_hurried)} hurried; blitzed ${n(r.times_blitzed)}`).join('; ') : null;
  };
  const rush = (team) => (d.pressure.rushers.get(`${x.g.game_id}|${team}`) || []).filter((r) => n(r.def_pressures) > 0)
    // Ties by sacks, then hits (round 14: the sack makers fell off a list of three with one pressure each).
    .sort((a, b) => n(b.def_pressures) - n(a.def_pressures) || n(b.def_sacks) - n(a.def_sacks) || n(b.def_times_hitqb) - n(a.def_times_hitqb)).slice(0, 3)
    .map((r) => `${r.pfr_player_name} ${n(r.def_pressures)}${n(r.def_sacks) ? ` (${n(r.def_sacks)} sack${n(r.def_sacks) === 1 ? '' : 's'})` : ''}`).join(', ');
  const ours = side(code), theirs = side(x.opp);
  if (!ours && !theirs) return 'pressure: not on file for this game';
  return `pressure: ${nickname(code)} ${ours || 'not on file'}${rush(x.opp) ? ` (${nickname(x.opp)} rushers: ${rush(x.opp)})` : ''} · ${nickname(x.opp)} ${theirs || 'not on file'}${rush(code) ? ` (${nickname(code)} rushers: ${rush(code)})` : ''}`;
}

// The run game's contact and the tackling, game by game, from PFR's charting (round 12, the blind-spots hunt: missed
// tackles showed only beside defenders thrown at, and yards before and after contact nowhere): each side's carries,
// yards before and after contact, broken tackles, and its defense's missed tackles with who missed most.
function contactLine(d, x, code) {
  if (!d.rushCharting) return null;
  const run = (team) => { const rs = d.rushCharting.get(`${x.g.game_id}|${team}`) || []; if (!rs.length) return null;
    const sum = (k) => rs.reduce((a, r) => a + n(r[k]), 0);
    return `${sum('carries')} carries, ${sum('rushing_yards_before_contact')} yds before contact, ${sum('rushing_yards_after_contact')} after, ${sum('rushing_broken_tackles') + sum('receiving_broken_tackles')} broken tackles`; };
  // A defense with no defender charted for a missed tackle while the other side's runners broke some was not charted
  // (round 13: the Titans' defense read "0 missed tackles" four straight weeks; PFR left those games at zero).
  const broke = (team) => (d.rushCharting.get(`${x.g.game_id}|${team}`) || []).reduce((a, r) => a + n(r.rushing_broken_tackles) + n(r.receiving_broken_tackles), 0);
  const missed = (team) => { const all = d.pressure?.rushers.get(`${x.g.game_id}|${team}`) || [];
    const rs = all.filter((r) => n(r.def_missed_tackles) > 0).sort((a, b) => n(b.def_missed_tackles) - n(a.def_missed_tackles));
    const total = rs.reduce((a, r) => a + n(r.def_missed_tackles), 0);
    const other = team === code ? x.opp : code;
    if (!all.length || (total === 0 && broke(other) > 0)) return 'missed tackles not charted for this game';
    return `${total} missed tackles${rs.length ? ` (${rs.slice(0, 3).map((r) => `${r.pfr_player_name} ${n(r.def_missed_tackles)}`).join(', ')})` : ''}`; };
  const side = (team) => `${nickname(team)} ${run(team) || 'run charting not on file'}; its defense ${/not charted/.test(missed(team)) ? missed(team) : `${missed(team)}`}`;
  return `contact and tackling: ${side(code)} · ${side(x.opp)}`;
}

// Coverage and throws, game by game, from the same PFR charting (round 10: only pressure was printed): each defender
// thrown at three times or more with what he allowed, and each quarterback's dropped passes and bad throws.
function coverageLine(d, x, code) {
  if (!d.pressure) return null;
  const cover = (team) => (d.pressure.rushers.get(`${x.g.game_id}|${team}`) || []).filter((r) => n(r.def_targets) >= 3)
    .sort((a, b) => n(b.def_targets) - n(a.def_targets)).slice(0, 5)
    .map((r) => `${r.pfr_player_name} ${n(r.def_completions_allowed)} of ${n(r.def_targets)} for ${n(r.def_yards_allowed)}${n(r.def_receiving_td_allowed) ? `, ${n(r.def_receiving_td_allowed)} TD` : ''}${n(r.def_missed_tackles) >= 2 ? `, ${n(r.def_missed_tackles)} missed tackles` : ''}`).join('; ');
  const throws = (team) => (d.pressure.qbs.get(`${x.g.game_id}|${team}`) || []).filter((r) => r.passing_drops !== '' || r.passing_bad_throws !== '')
    .map((r) => `${r.pfr_player_name} ${n(r.passing_drops)} dropped, ${n(r.passing_bad_throws)} bad throws`).join('; ');
  const side = (team) => `${nickname(team)} defenders thrown at: ${cover(team) || 'none three times or more'}`;
  const qbs = [code, x.opp].map((t) => throws(t) ? `${nickname(t)} ${throws(t)}` : null).filter(Boolean);
  return `coverage: ${side(code)} · ${side(x.opp)}${qbs.length ? `; passes: ${qbs.join(' · ')}` : ''}`;
}

// THE GAME'S FLOW AND ITS DOWNS (founder GO, Oct 29 2026: "who got ahead, how, when did the team go up 14 versus
// being close the whole game", "how the team did on third downs and fourth downs, coupled with down and distance").
// From the play ledger: every score in order with the score after it, the largest lead each way and when, lead
// changes; each team's third downs with the distance of each, every fourth-down try with where and the score, time of
// possession and penalties. Null when the ledger has no such game.
const whenIn = (e) => `${e.q > 4 ? 'OT' : `Q${e.q}`}${e.clock ? ` ${e.clock}` : ''}`;
function flowLine(x, code) {
  const f = x.ledger?.flow;
  if (!f?.events) return null;
  if (!f.events.length) return 'scoring: none';
  const ours = (e) => (f.home === code ? `${e.home}-${e.away}` : `${e.away}-${e.home}`);
  const lead = (c) => { const l = f.lead?.[f.home === c ? 'home' : 'away']; return l ? `${nickname(c)} by ${l.by} (${whenIn(l)})` : `${nickname(c)} never led`; };
  return `scoring: ${f.events.map((e) => `${whenIn(e)} ${nickname(e.team)} ${e.how} (${ours(e)})`).join(' · ')}
      largest lead: ${lead(code)}, ${lead(x.opp)}; the lead changed hands ${f.lead_changes} time${f.lead_changes === 1 ? '' : 's'}`;
}
function downsLine(x, code) {
  const L = x.ledger?.lines;
  if (!L?.[code]?.third_downs || !L?.[x.opp]?.third_downs) return null;
  const spot = (yl, c, o) => (yl == null ? '' : yl === 50 ? ' at midfield' : yl < 50 ? ` at the ${nickname(o)} ${yl}` : ` at their own ${100 - yl}`);
  const score = (d) => (d == null ? '' : d > 0 ? `, up ${d}` : d < 0 ? `, down ${-d}` : ', tied');
  const one = (c, o) => {
    const l = L[c];
    const t = l.third_downs, fo = l.fourth_downs || [];
    const togo = (xs) => xs.map((d) => d.togo).sort((a, b) => a - b).join(', ') || 'none';
    const third = t.length ? `3rd down ${t.filter((d) => d.made).length} of ${t.length} (made on 3rd & ${togo(t.filter((d) => d.made))}; not on 3rd & ${togo(t.filter((d) => !d.made))})` : 'no 3rd downs';
    const fourth = fo.length ? `4th down ${fo.filter((d) => d.made).length} of ${fo.length} (${fo.map((d) => `4th & ${d.togo}${spot(d.yardline, c, o)}, ${whenIn(d)}${score(d.diff)}: ${d.made ? 'made' : 'not made'}`).join('; ')})` : 'no 4th-down tries';
    const top = l.top_seconds ? `; possession ${Math.floor(l.top_seconds / 60)}:${String(l.top_seconds % 60).padStart(2, '0')}` : '';
    const pens = l.penalties != null ? `; penalties ${l.penalties} for ${l.penalty_yards} yds` : '';
    return `${nickname(c)} ${third}, ${fourth}${top}${pens}`.replace(/not on 3rd & none\)/, 'missed none)').replace(/made on 3rd & none;/, 'made none;');
  };
  return `downs: ${one(code, x.opp)} · ${one(x.opp, code)}`;
}
// Plays of 20 yards or more, and the runs and passes by the score at the snap, for both teams.
function bigPlaysLine(x, code) {
  const L = x.ledger?.lines;
  if (!L?.[code]?.big_plays || !L?.[x.opp]?.big_plays) return null;
  // Each team's plays and first downs, and its returns of 40+ yards (loop 2, Oct 29 2026: counted, never printed).
  const one = (c) => {
    const l = L[c], b = l.big_plays;
    const plays = (Number(l.offense_runs) || 0) + (Number(l.offense_pass_plays) || 0);
    const returns = (l.long_returns || []).map((r) => `${r.kind} return ${r.yards}`).join(', ');
    return `${nickname(c)} ${b.length ? b.map((p) => `${p.who} ${p.yards} ${p.kind === 'pass' ? 'catch' : 'run'}`).join(', ') : 'none'} (${plays} plays, ${l.first_downs ?? '?'} first downs${returns ? `; returns of 40+: ${returns}` : ''})`;
  };
  return `plays of 20+ yards: ${one(code)} · ${one(x.opp)}`;
}
function byScoreLine(x, code) {
  const L = x.ledger?.lines;
  if (!L?.[code]?.by_score || !L?.[x.opp]?.by_score) return null;
  const part = (s) => `${s.runs} run${s.runs === 1 ? '' : 's'} for ${s.runYards} yds, ${s.passes} pass play${s.passes === 1 ? '' : 's'} for ${s.passYards}`;
  const one = (c) => { const b = L[c].by_score; return `${nickname(c)} ${[['within one score', b.close], ['ahead by 9+', b.ahead], ['behind by 9+', b.behind]].filter(([, s]) => s.runs || s.passes).map(([k, s]) => `${k}: ${part(s)}`).join('; ')}`; };
  return `by the score at the snap: ${one(code)} · ${one(x.opp)}`;
}

// What the other side's passers and top rusher did, and who on this side made the sacks and interceptions (round 14:
// "Brock Purdy at QB that day" with no line, and "2 made" with no names; the second system had both).
function againstLine(d, x, code) {
  const rows = (d.playerWeek || []).filter((r) => r.game_id === x.g.game_id);
  const theirs = rows.filter((r) => r.team === x.opp), mine = rows.filter((r) => r.team === code);
  if (!theirs.length || !mine.length) return null;
  const passing = theirs.filter((r) => n(r.attempts) >= 5).sort((a, b) => n(b.attempts) - n(a.attempts)).map((r) => `${r.player_display_name} ${passLine(r)}`).join('; ');
  const runner = theirs.filter((r) => n(r.carries) > 0).sort((a, b) => n(b.rushing_yards) - n(a.rushing_yards))[0];
  const by = (k) => mine.filter((r) => n(r[k]) > 0).sort((a, b) => n(b[k]) - n(a[k])).map((r) => `${r.player_display_name} ${n(r[k])}`).join(', ');
  return `${nickname(x.opp)} passing: ${passing || 'nobody with 5+ passes'}${runner ? `; its top rusher ${runner.player_display_name} ${n(runner.carries)} for ${n(runner.rushing_yards)}` : ''} · ${nickname(code)} sacks by ${by('def_sacks') || 'nobody'}; interceptions by ${by('def_interceptions') || 'nobody'}`;
}

// The box score both ways, as counts.
const boxLine = (x, code) => (!x.off || !x.def ? 'box score not on file'
  : `${Math.round(x.off.yards)} yards (${rushing(x, code)}), allowed ${Math.round(x.def.yards)} (${rushing(x, code, 'def')}) · ${giveaways(x.off)}, ${count(x.def.giveaways, 'takeaway')} · ${count(x.off.sacked, 'sack')} allowed, ${x.def.sacked} made · QB hits (sacks included): ${x.def.hitsMade} taken, ${x.off.hitsMade} made`);
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
  k.xpAtt ? `XP ${k.xpKickers?.length && (k.xpKickers.length > 1 || k.xpKickers[0] !== k.kickers?.[0]) ? `${k.xpKickers.join(' and ')} ` : ''}${k.xpMade}-of-${k.xpAtt}` : null].filter(Boolean).join(', ');
// Who got hurt during the game, from the play text, and whether a later play named him (round 12).
function hurtLine(x, code) {
  const h = x.ledger?.hurt;
  if (!x.ledger || !Array.isArray(h)) return null;
  const ej = x.ledger.ejected || [];
  const ejected = ej.length ? ` · ejected: ${ej.map((e) => `${nickname(e.team)} ${e.who} (Q${e.q}${e.clock ? ` ${e.clock}` : ''})`).join(', ')}` : '';
  if (!h.length) return `hurt during the game (play-by-play): nobody${ejected}`;
  const one = (e) => `${nickname(e.team)} ${e.who} (Q${e.q}${e.clock ? ` ${e.clock}` : ''}; ${e.later ? 'on a later play' : 'not on a later play'})`;
  return `hurt during the game (play-by-play): ${[...h.filter((e) => e.team === code), ...h.filter((e) => e.team !== code)].map(one).join(', ')}${ejected}`;
}

// Special teams game by game for both sides (round 10, founder: special teams; the read had only unnamed 40+ returns):
// punting from the play ledger (punts, gross yards, inside the 20, blocked), who returned kicks and punts and for how
// much from the weekly player stats, and who blocked a punt, field goal or extra point.
function specialTeamsLine(d, x, code) {
  const rows = (d.playerWeek || []).filter((r) => r.game_id === x.g.game_id);
  const side = (c) => {
    const L = x.ledger?.lines?.[c];
    const punting = !L ? 'punting not on file' : !n(L.punts) ? 'no punts' : `${n(L.punts)} punt${n(L.punts) === 1 ? '' : 's'} for ${n(L.punt_yards)} yds (${n(L.punts_inside_20)} inside the 20${n(L.punts_blocked) ? `, ${n(L.punts_blocked)} blocked` : ''})`;
    const mine = rows.filter((r) => r.team === c);
    const ret = mine.filter((r) => n(r.kickoff_returns) || n(r.punt_returns)).map((r) => `${r.player_display_name} ${[n(r.kickoff_returns) ? `${n(r.kickoff_returns)} kickoff return${n(r.kickoff_returns) === 1 ? '' : 's'} for ${n(r.kickoff_return_yards)}` : null, n(r.punt_returns) ? `${n(r.punt_returns)} punt return${n(r.punt_returns) === 1 ? '' : 's'} for ${n(r.punt_return_yards)}` : null].filter(Boolean).join(', ')}`);
    const blocks = mine.flatMap((r) => [['def_punt_blocks', 'punt'], ['def_fg_blocks', 'field goal'], ['def_pat_blocks', 'extra point']].filter(([k]) => n(r[k])).map(([k, w]) => `${r.player_display_name} blocked a ${w}`));
    // Fumbles lost on kicks and punts, and onside kicks recovered (round 13: counted in the turnovers, never said).
    const stLost = n(L?.special_teams_fumbles_lost), onside = n(L?.onside_recoveries);
    const stTurn = [stLost ? `${stLost} return fumble${stLost === 1 ? '' : 's'} lost` : null, onside ? `${onside} onside kick${onside === 1 ? '' : 's'} recovered` : null].filter(Boolean).join(', ');
    return `${nickname(c)} ${punting}; returns ${rows.length ? ret.join('; ') || 'none' : 'not on file'}${blocks.length ? `; ${blocks.join(', ')}` : ''}${stTurn ? `; ${stTurn}` : ''}`;
  };
  return `special teams: ${side(code)} · ${side(x.opp)}`;
}

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

// A club's coach in one of this season's games: the schedule's name when its latest game names ESPN's coach (so a change
// during the season shows game by game), ESPN's when the schedule's column is out of date for the club, null when ESPN
// has no answer.
function coachThatDay(d, g, code) {
  const current = d.coaches?.get(code);
  if (!current) return null;
  const col = (r) => (r.home_team === code ? r.home_coach : r.away_coach) || null;
  const latest = (d.schedule || []).filter((r) => String(r.season) === String(d.season) && (r.home_team === code || r.away_team === code) && r.home_score !== '' && r.home_score != null)
    .sort((a, b) => Number(b.week) - Number(a.week))[0];
  return latest && col(latest) === current ? col(g) || current : current;
}

export function gameByGame(d, team, before) {
  if (d.scheduleMissing) return `${team}: the season game by game is not on file (the schedule file did not load).`;
  const c = codeOf(team); const gs = teamGames(d, c, d.season, before);
  if (!gs.length) return `${team}: no games played yet this season.`;
  const changes = lineupChanges(d, c, gs);
  return [seasonHeader(d, gs, team, before), ...gs.slice().reverse().map((x) => {
    // The starter who left early first, said so, as the second system says it (Oct 29 2026 hunt, round 7: the Vikings'
    // Week 1 read "Carson Wentz 12-of-19 ...; Kyler Murray 3-of-5", Murray's start read as late relief).
    const st = startedEarlyExit(d, x.g, c);
    const all = [...x.passers, ...(x.relief || [])];
    const ordered = st && all.includes(st) ? [st, ...all.filter((r) => r !== st)] : all;
    const qb = x.passers.length ? ` · QB ${ordered.map((r) => `${r.player_display_name}${r === st ? ' (started, left early)' : x.relief?.includes(r) ? ' (relief)' : ''} ${n(r.completions)}-of-${n(r.attempts)}, ${n(r.passing_yards)} yds, ${n(r.passing_tds)} TD, ${n(r.passing_interceptions)} INT`).join('; ')}`
      : ' · QB not on file';
    // Who the opponent was without that day: its own regulars who did not play, its quarterback first, at most four
    // (Oct 23 2026 data audit: Herbert's 121 yards in Week 5 came against a Denver secondary without Pat Surtain II and
    // Riley Moss).
    const oppGames = teamGames(d, x.opp, d.season, before);
    const theirs = lineupChanges(d, x.opp, oppGames);
    const absent = theirs.absent?.get(x.g.game_id) || [];
    const left = theirs.limited?.get(x.g.game_id) || [];
    const without = [absent.length ? `${nickname(x.opp)} regulars out that day: ${absent.map((p) => `${p.name} (${p.pos}, ${p.why})`).join(', ')}` : null,
      left.length ? `${nickname(x.opp)} regulars who left early or were limited: ${left.join(', ')}` : null].filter(Boolean).join('\n      ') || null;
    // Overtime from the schedule (Oct 23 2026 data audit: Kansas City's 3-point win over Indianapolis read as a
    // regulation win), with the score after four quarters when the quarters are on file.
    const q = quarters(x, c);
    const regulation = (k, pts) => pts - q[k].slice(4).reduce((a, v) => a + v, 0);
    const ot = x.ot ? ` in overtime${q ? ` (${regulation(c, x.pf)}-${regulation(x.opp, x.pa)} after four quarters)` : ''}` : '';
    const kicking = x.off && x.def ? `kicking: ${nickname(c)} ${kicks(x.off.kicking)}; ${nickname(x.opp)} ${kicks(x.def.kicking)}` : null;
    const scoring = !d.ledgerGames ? null : !x.ledger ? 'quarters and drives not on file' : quarterLine(x, c);
    const weather = d.weather ? gameWeatherLine(x.g, d.weather.get(x.g.game_id)) : ['outdoors', 'open'].includes(x.g.roof) ? 'weather: not on file' : null;
    const detail = [without, boxLine(x, c), againstLine(d, x, c), pressureLine(d, x, c), coverageLine(d, x, c), contactLine(d, x, c), hurtLine(x, c), [scoring, kicking].filter(Boolean).join(' · ') || null, specialTeamsLine(d, x, c), flowLine(x, c), downsLine(x, c), bigPlaysLine(x, c), byScoreLine(x, c),
      d.ledgerGames && x.ledger ? driveLine(x, c) : null, weather, changes.get(x.g.game_id) || null].filter(Boolean);
    return `  Wk ${x.week} · ${etDay(x.date)} · ${versus(x, teamName(x.opp))} (${opponentThatDay(d, before, x)}) · ${x.won ? 'W' : x.tied ? 'T' : 'L'} ${x.pf}-${x.pa}${ot}${qb}${detail.map((l) => `\n      ${l}`).join('')}`;
  })].join('\n');
}

// ROSTER MOVES SINCE EACH TEAM'S LAST GAME (round 8, Oct 29 2026: the Titans traded Jeffery Simmons, 83-98% of their
// defensive snaps, to the Bears on the Thursday before their game, and neither read said so; the weekly roster lags a
// move made after a team's last game). ESPN's team roster is who is there now (it keeps injured reserve and drops a
// player traded or released). Gone: a player with a quarter or more of a unit's snaps in either of the team's last two
// games who is off its roster. New: a player on its roster who played a quarter or more for another club this season
// and never for it. Null when ESPN's roster did not load.
const espnRosters = new Map();
async function espnRosterNames(team) {
  if (!espnRosters.has(team)) espnRosters.set(team, (async () => {
    const get = async (url) => { const r = await fetch(url, { signal: AbortSignal.timeout(15_000) }); if (!r.ok) throw new Error(`ESPN ${r.status}`); return r.json(); };
    const teams = (await get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams')).sports?.[0]?.leagues?.[0]?.teams?.map((t) => t.team) || [];
    const t = teams.find((x) => x.displayName === team);
    if (!t) return null;
    const roster = await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${t.id}/roster`);
    // The practice squad is not the roster (round 9: practice-squad signings read as arrivals, and a regular moved there
    // never read as gone); it is kept apart so a move to it can be said.
    const group = (g) => g.position === 'practiceSquad';
    const set = (people) => ({ ids: new Set(people.map((a) => String(a.id))), keys: new Set(people.map((a) => lastInitial(a.fullName))), full: new Set(people.map((a) => qbKey(a.fullName).join(''))) });
    // By ESPN id first, then last name and first initial ("Dax Hill" is the snaps' Daxton Hill, "Cam Lewis" Cameron).
    return { ...set((roster.athletes || []).filter((g) => !group(g)).flatMap((g) => g.items || [])), practice: set((roster.athletes || []).filter(group).flatMap((g) => g.items || [])) };
  })().catch(() => { espnRosters.delete(team); return null; }));
  return espnRosters.get(team);
}
const lastInitial = (name) => { const k = qbKey(name); return `${k.at(-1)}|${(k[0] || '').charAt(0)}`; };
// The snap file's position to ESPN's depth-chart spots.
const SPOTS = { G: ['lg', 'rg'], OG: ['lg', 'rg'], T: ['lt', 'rt'], OT: ['lt', 'rt'], C: ['c'], OL: ['lt', 'lg', 'c', 'rg', 'rt'],
  DT: ['dt', 'ldt', 'rdt', 'nt'], NT: ['dt', 'ldt', 'rdt', 'nt'], DE: ['de', 'lde', 'rde', 'edge', 'ledge', 'redge'], DL: ['dt', 'ldt', 'rdt', 'nt', 'de', 'lde', 'rde'],
  LB: ['wlb', 'mlb', 'slb', 'lilb', 'rilb', 'lb', 'olb', 'lolb', 'rolb'], ILB: ['mlb', 'lilb', 'rilb', 'lb'], OLB: ['wlb', 'slb', 'olb', 'lolb', 'rolb'], MLB: ['mlb', 'lilb', 'rilb'],
  CB: ['lcb', 'rcb', 'nb', 'cb'], S: ['fs', 'ss', 's'], FS: ['fs'], SS: ['ss'], DB: ['lcb', 'rcb', 'nb', 'fs', 'ss'],
  WR: ['wr'], TE: ['te'], RB: ['rb'], FB: ['fb'], QB: ['qb'] };
export async function rosterMoves(d, homeTeam, awayTeam, before) {
  const lines = [];
  const espnOf = new Map((d.rosterWeekly || []).filter((r) => r.pfr_id && r.espn_id).map((r) => [r.pfr_id, String(r.espn_id)]));
  // Gone: off the roster by ESPN id, or with no id by full name and by last name and initial (a nickname is not a
  // departure). New: on the roster by ESPN id, or by exact full name (linemen carry no id, and "J. Williams" is several).
  const still = (now, r) => (espnOf.has(r.pfr_player_id) ? now.ids.has(espnOf.get(r.pfr_player_id)) : now.full.has(qbKey(r.player).join('')) || now.keys.has(lastInitial(r.player)));
  const joined = (now, r) => (espnOf.has(r.pfr_player_id) ? now.ids.has(espnOf.get(r.pfr_player_id)) : now.full.has(qbKey(r.player).join('')));
  for (const team of [awayTeam, homeTeam]) {
    const code = codeOf(team);
    const now = await espnRosterNames(team);
    if (!now) { lines.push(`${team}: not on file (the current roster did not load)`); continue; }
    const rows = (d.snaps || []).filter((r) => n(r.week) > 0 && r.game_type !== 'POST');
    const share = (r) => Math.max(n(r.offense_pct), n(r.defense_pct));
    // Gone since its last game with snaps on file, the week named (round 9: a player released before the last game read
    // "gone since its last game" from the game before it).
    const weeks = new Set(teamGames(d, code, d.season, before).map((x) => n(x.week)));
    const last = Math.max(0, ...rows.filter((r) => r.team === code && weeks.has(n(r.week))).map((r) => n(r.week)));
    const goneRows = [...new Map(rows.filter((r) => r.team === code && n(r.week) === last && share(r) >= 0.25 && !still(now, r))
      .map((r) => [r.player, r])).values()];
    // Who has his spot now: ESPN's starters at that position who played under half of the last game (round 13: the Colts'
    // new left guard, Jalen Farmer, 5% of one game all season, was named nowhere), with their snaps by game.
    const depth = goneRows.some((r) => share(r) >= 0.5) ? await espnDepthChart(team) : null;
    const { rosterOf, snaps: snapsBy } = depthSnaps(d, code, before);
    const lastShare = (a) => { const pfr = rosterOf(a).find((x) => x.pfr_id)?.pfr_id; const r = rows.find((x) => x.team === code && n(x.week) === last && (pfr ? x.pfr_player_id === pfr : depthKey(x.player) === depthKey(a.name))); return r ? share(r) : 0; };
    const inSpot = (r) => {
      if (!depth || share(r) < 0.5) return '';
      const spots = SPOTS[String(r.position || '').toUpperCase()] || [];
      const fresh = depth.filter(([pos, names]) => spots.includes(pos.toLowerCase()) && names[0] && depthKey(names[0].name) !== depthKey(r.player) && lastShare(names[0]) < 0.5)
        .map(([pos, names]) => `${pos.toUpperCase()} ${names[0].name}: ${snapsBy(names[0])}`);
      return fresh.length ? `; ESPN's chart now starts ${[...new Set(fresh)].join('; ')}` : `; ESPN's starters at ${r.position} all played half or more of the Wk ${last} game`;
    };
    const gone = goneRows.map((r) => `${r.player} (${r.position}, ${Math.round(share(r) * 100)}% of snaps; ${still(now.practice, r) ? 'moved to its practice squad' : 'no longer on the roster'}${inSpot(r)})`);
    // When an arrival joined: the first week on this team's weekly roster (practice squad aside), or after its last game.
    const joinedWeek = (r) => { const ws = (d.rosterWeekly || []).filter((x) => x.team === code && x.pfr_id && x.pfr_id === r.pfr_player_id && String(x.status).toUpperCase() !== 'DEV').map((x) => n(x.week)); return ws.length ? Math.min(...ws) : null; };
    const everHere = new Set(rows.filter((r) => r.team === code).map((r) => r.pfr_player_id || r.player));
    // A waiver claim ESPN's roster has not added yet is on the club's weekly roster for the coming week (round 15: the
    // Dolphins' Christian Haynes, claimed from Seattle on Oct 28, 52-69% of its snaps, was named nowhere).
    const newest = Math.max(0, ...(d.rosterWeekly || []).filter((x) => x.team === code).map((x) => n(x.week)));
    const coming = newest > last ? (d.rosterWeekly || []).filter((x) => x.team === code && n(x.week) === newest && ['ACT', 'INA', 'RES'].includes(String(x.status || '').toUpperCase())) : [];
    const onComing = (r) => coming.some((x) => (x.pfr_id ? x.pfr_id === r.pfr_player_id : qbKey(x.full_name).join('') === qbKey(r.player).join('')));
    const fresh = new Map();
    for (const r of rows.filter((x) => x.team !== code && share(x) >= 0.25 && (joined(now, x) || onComing(x)) && !everHere.has(x.pfr_player_id || x.player))) {
      const e = fresh.get(r.player) || { r, weeks: [], shares: [] }; e.weeks.push(n(r.week)); e.shares.push(Math.round(share(r) * 100)); fresh.set(r.player, e);
    }
    const arrived = [...fresh.values()].map(({ r, weeks: ws, shares }) => { const j = joinedWeek(r); return `${r.player} (${r.position}, with ${teamName(r.team)} this season: ${Math.min(...shares)}-${Math.max(...shares)}% of snaps in Wk ${Math.min(...ws)}-${Math.max(...ws)}; ${j ? `on its roster since Wk ${j}` : last ? `joined after its Wk ${last} game` : 'joined since'})`; });
    const since = last ? `since its Wk ${last} game` : 'since its last game';
    lines.push(`${team}: ${[gone.length ? `gone ${since}: ${gone.join('; ')}` : null, arrived.length ? `on its roster now (practice squad aside), played for another club this season and not yet for it: ${arrived.join('; ')}` : null].filter(Boolean).join(' · ') || `no regular gone ${since}, and nobody on its roster (practice squad aside) who played for another club this season`}`);
  }
  return lines.join('\n');
}

// NEXT ON THE DEPTH CHART (round 11): for each starter on this week's report (a game status, or a practice he missed), the player behind him at his spot on ESPN's depth chart and that player's own snaps by game. A fan
// knows who steps in; the read named a fill-in only after a game was missed.
const espnDepths = new Map();
async function espnDepthChart(team) {
  if (!espnDepths.has(team)) espnDepths.set(team, (async () => {
    const get = async (url) => { const r = await fetch(url, { signal: AbortSignal.timeout(15_000) }); if (!r.ok) throw new Error(`ESPN ${r.status}`); return r.json(); };
    const teams = (await get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams')).sports?.[0]?.leagues?.[0]?.teams?.map((t) => t.team) || [];
    const t = teams.find((x) => x.displayName === team);
    if (!t) return null;
    const dc = await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${t.id}/depthcharts`);
    const out = [];
    // Offense and defense before special teams (round 12: a starter who also returns kicks mapped to the return job's
    // backup); each name with its ESPN id.
    const groups = [...(dc.depthchart || [])].sort((a, b) => /special/i.test(a.name || '') - /special/i.test(b.name || ''));
    for (const grp of groups) for (const [pos, v] of Object.entries(grp.positions || {})) out.push([pos, (v.athletes || []).map((a) => ({ name: a.displayName || a.fullName, id: String(a.id || '') })).filter((a) => a.name)]);
    return out;
  })().catch(() => { espnDepths.delete(team); return null; }));
  return espnDepths.get(team);
}
// A depth-chart player's weekly roster rows and his snaps in each of the club's games, newest first, a week without a snap
// said why (shared by NEXT ON THE DEPTH CHART and ROSTER MOVES).
const depthKey = (x) => String(x || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');
function depthSnaps(d, code, before) {
  const key = depthKey;
  // By ESPN id through the weekly roster to the PFR id the snap file uses, every club this season (round 12: ESPN's
  // "Hollywood Brown" is the snaps' Marquise Brown and read "no snaps"); by name only without an id.
  const rosterBy = (espn) => (d.rosterWeekly || []).filter((r) => String(r.espn_id || '') === espn).sort((a, b) => n(b.week) - n(a.week));
  // By ESPN id, else by his name on this club's weekly roster (some rows carry no ESPN id: Giovanni Manu, on reserve
  // all season, read as the next man up).
  const rosterOf = (a) => { const byId = a.id ? rosterBy(a.id) : []; return byId.length ? byId
    : (d.rosterWeekly || []).filter((r) => r.team === code && key(r.full_name) === key(a.name)).sort((x, y) => n(y.week) - n(x.week)); };
  // Every one of the club's games, a week without a snap said why from the weekly roster (round 13: a backup's three
  // inactive weeks dropped out and he read as the next man up).
  const WHY = { INA: 'inactive', RES: 'reserve list', DEV: 'practice squad', EXE: 'exempt list', CUT: 'released' };
  const snaps = (a) => {
    const roster = rosterOf(a); const pfr = roster.find((r) => r.pfr_id)?.pfr_id || null;
    const rows = (d.snaps || []).filter((r) => n(r.week) > 0 && (pfr ? r.pfr_player_id === pfr : r.team === code && key(r.player) === key(a.name)));
    const weeks = teamGames(d, code, d.season, before).map((x) => n(x.week)).sort((x, y) => y - x);
    if (!weeks.length) return 'no games yet';
    const cell = (w) => { const r = rows.find((x) => n(x.week) === w && x.team === code) || rows.find((x) => n(x.week) === w);
      if (r) { const p = Math.max(n(r.offense_pct), n(r.defense_pct)); return `Wk ${w} ${p > 0 ? `${Math.round(100 * p)}%` : `special teams only`}${r.team !== code ? ` (with ${r.team})` : ''}`; }
      const st = roster.find((x) => n(x.week) === w); const word = st ? (st.team !== code ? `with ${st.team}` : WHY[String(st.status).toUpperCase()] || 'active, no snap') : 'not on the roster';
      return `Wk ${w} ${word}`; };
    return `by game, newest first: ${weeks.map(cell).join(', ')}`;
  };
  return { rosterOf, snaps };
}
export async function nextUp(d, homeTeam, awayTeam, before) {
  const lines = [];
  const key = (x) => String(x || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');
  for (const team of [awayTeam, homeTeam]) {
    const code = codeOf(team);
    const week = (d.schedule || []).filter((r) => r.season === String(d.season) && (r.home_team === code || r.away_team === code) && String(r.gameday) >= before)
      .sort((a, b) => String(a.gameday).localeCompare(String(b.gameday)))[0]?.week;
    const report = week ? await getPracticeReport(team, d.season, Number(week)).catch(() => null) : null;
    // A report not in the file, or not read, is said, never read as nobody listed (round 13).
    if (!report?.players) { lines.push(`${team}: the official report is not on file, so the next man up is not listed`); continue; }
    // A game status, or a missed practice (limited alone usually plays).
    const listed = (report?.players || []).filter((p) => /out|doubtful|questionable/i.test(p.game_status || '') || p.practice === 'DNP');
    if (!listed.length) continue;
    const depth = await espnDepthChart(team);
    if (!depth) { lines.push(`${team}: ESPN's depth chart did not load`); continue; }
    const { rosterOf, snaps } = depthSnaps(d, code, before);
    // A backup on a reserve list, inactive or released is not the one who steps in (round 12: ESPN still listed the
    // Jets' Marcelino McCrary-Ball, on IR since Week 3); the next name is.
    const OFFLIST = { RES: 'on a reserve list', INA: 'inactive', EXE: "on the commissioner's exempt list", CUT: 'released', DEV: 'on the practice squad' };
    // This week's report first (round 14: the Jets' Joseph Ossai, DNP all week, read as the next man up), then this week's
    // roster row: a move since the last game counts (round 15: Dameon Pierce, put on IR Wednesday, read as Saquon
    // Barkley's backup, and Jaydon Blue, promoted the same day, was skipped). Inactive last game alone is not unavailable:
    // a player practicing this week is back.
    const onReport = (a) => (report?.players || []).find((p) => depthKey(p.name) === depthKey(a.name));
    const unavailable = (a) => {
      const rep = onReport(a);
      if (rep && (/out|doubtful/i.test(rep.game_status || '') || rep.practice === 'DNP')) return `on this week's report (${rep.game_status ? String(rep.game_status).toLowerCase() : 'practice DNP'}${rep.injury ? `, ${String(rep.injury).toLowerCase()}` : ''})`;
      const r = rosterOf(a)[0];
      const st = String(r?.status || '').toUpperCase();
      return r && r.team === code && st !== 'INA' ? OFFLIST[st] || null : null;
    };
    const seen = new Set();
    for (const p of listed) {
      const spot = depth.find(([, names]) => names[0] && key(names[0].name) === key(p.name));
      if (!spot || seen.has(p.name)) continue;
      seen.add(p.name);
      // A spot with no second name is said (round 15: the Titans' punter, on the report, went without a line).
      if (!spot[1][1]) { lines.push(`${team}: ${p.name} (${spot[0].toUpperCase()}; ${p.game_status || `practice ${p.practice}`}) → no backup listed at his spot on ESPN's chart`); continue; }
      const skipped = [];
      let next = null;
      for (const a of spot[1].slice(1)) { const why = unavailable(a); if (!why) { next = a; break; } skipped.push(`${a.name} ${why}`); }
      const note = skipped.length ? ` (ahead of him on ESPN's chart: ${skipped.join(', ')})` : '';
      lines.push(`${team}: ${p.name} (${spot[0].toUpperCase()}; ${p.game_status || `practice ${p.practice}`}) → ${next ? `${next.name}${note}: ${snaps(next)}` : `no available backup on ESPN's chart${note}`}`);
    }
  }
  return lines.length ? lines.join('\n') : null;
}

/** The desk's starter for a team ("[HOME] Team: Name (…"), or null. */
export function deskStarter(deskQbSection, team) {
  const m = String(deskQbSection || '').match(new RegExp(`\\] ${team.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: ([^(\\n]+?)(?: \\(|\\s*$)`, 'm'));
  return m ? m[1].trim() : null;
}
/** The desk's starter for each team, the starts so far and his own passing this season. */
// When this week's starter missed or shared games, each group carries its weeks and its record: the game log's header
// carried the same split a section below and repeated these counts (Oct 23 2026 section review).
// His passing, game by game (`byGame`, the board, which has no game log) or not at all (the read: each game's line in the
// game log carries his passing beside who it came against). A season total stood beside the game log with no opponent
// in it (Oct 26 2026 blind review: Cousins's "14 TD, 5 INT", 9 of them against Miami, the Chargers and the Saints).
export function quarterbacks(d, deskQbSection, homeTeam, awayTeam, before, { byGame = false } = {}) {
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
    if (qb && byGame) {
      const at = new Map(gs.map((x) => [x.g.game_id, x]));
      const each = his.filter((r) => at.has(r.game_id) && n(r.attempts) > 0).sort((a, b) => n(b.week) - n(a.week)).map((r) => {
        const x = at.get(r.game_id);
        return `Wk ${x.week} ${versus(x, nickname(x.opp), true)} ${n(r.completions)}-of-${n(r.attempts)}, ${n(r.passing_yards)} yds, ${n(r.passing_tds)} TD, ${n(r.passing_interceptions)} INT`;
      });
      lines.push(`  ${qb} by game, newest first: ${!d.playerWeek ? 'not on file (the weekly player stats did not load)' : each.join('; ') || 'no passes this season'}`);
    }
    out.push(lines.join('\n'));
  }
  return out.join('\n');
}

/** The spot: rest and travel for each side, from the schedule. */
export function spot(d, homeTeam, awayTeam, gameDate) {
  // The same shape as a loaded one (round 11: the bare string had no .text, and the read lost the line and the section).
  if (d.scheduleMissing) return { text: 'Rest and travel are not on file (the schedule file did not load).', neutral: null };
  const hc = codeOf(homeTeam), ac = codeOf(awayTeam);
  const row = d.schedule.find((r) => r.season === String(d.season) && r.home_team === hc && r.away_team === ac && r.gameday === gameDate)
    || d.schedule.find((r) => r.season === String(d.season) && r.home_team === hc && r.away_team === ac && r.home_score === '');
  const lines = [row?.div_game === '1' ? 'A division game.' : null];
  for (const [team, code] of [[awayTeam, ac], [homeTeam, hc]]) {
    const f = row ? sideFacts(row, code) : null;
    const bits = [f ? restPhrase(f.rest) : null, f ? (tripPhrase(f) || (f.atHome ? 'at home' : null)) : null].filter(Boolean);
    if (bits.length) lines.push(`${team}: ${bits.join(' · ')}`);
  }
  // Each team's next game after this one, and the days between (round 8 and loop 2, Oct 29 2026: the NBA read had it,
  // football did not; a short week or a bye next is what a fan knows).
  for (const [team, code] of [[awayTeam, ac], [homeTeam, hc]]) {
    const at = row?.gameday || gameDate;
    const next = d.schedule.filter((r) => r.season === String(d.season) && (r.home_team === code || r.away_team === code) && r.gameday > at)
      .sort((a, b) => String(a.gameday).localeCompare(String(b.gameday)))[0];
    if (!next) { lines.push(`${team}: no game after this one on the schedule`); continue; }
    const days = Math.round((Date.parse(`${next.gameday}T12:00:00Z`) - Date.parse(`${at}T12:00:00Z`)) / 86_400_000);
    const bye = row && Number(next.week) > Number(row.week) + 1 ? ', after a bye week' : '';
    // A neutral site said, with its kickoff (round 9: the Bengals and Falcons in Madrid read as a road and a home game).
    const clock = /^\d{1,2}:\d{2}$/.test(String(next.gametime || '')) ? (() => { const [h, m] = next.gametime.split(':').map(Number); return `, ${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'} ET kickoff`; })() : '';
    const opp = next.location === 'Neutral' ? `vs ${teamName(next.home_team === code ? next.away_team : next.home_team)} at a neutral site${next.stadium ? ` (${next.stadium})` : ''}${clock}`
      : next.home_team === code ? `vs ${teamName(next.away_team)}` : `@ ${teamName(next.home_team)}`;
    lines.push(`${team}: next game ${new Date(`${next.gameday}T16:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })} ${opp}, ${days} days later${bye}`);
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

// ── THE GAME-BY-GAME SYSTEM (Oct 27 2026, founder GO; the second system, run beside the live read) ──────────────────
// One game as a fan who watched it knows it, from one team's side: where and when, each side's rest and coach, how it
// went (quarters, kicking, drives), both quarterbacks, both boxes, who each side was without, every player on both
// sides with what he did (passing, rushing, receiving; tackles, sacks, hits, takeaways) and his share of the snaps, and
// the opponent coming in. No season averages or ranks: the opponent is its results. nflverse publishes no play-level
// participation this season, so who was on the field is each player's snap share.
const plural = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const passLine = (r) => `${n(r.completions)}-of-${n(r.attempts)}, ${n(r.passing_yards)} yds, ${n(r.passing_tds)} TD, ${n(r.passing_interceptions)} INT${n(r.sacks_suffered) ? `, sacked ${plural(n(r.sacks_suffered), 'time')} for ${Math.abs(n(r.sack_yards_lost))} yds` : ''}`;
function sidePlayers(d, x, code) {
  const rows = (d.playerWeek || []).filter((r) => r.game_id === x.g.game_id && r.team === code);
  const snaps = (d.snaps || []).filter((s) => s.game_id === x.g.game_id && s.team === code);
  const snapFor = snapMatcher(d, code), snapOf = (r) => snapFor(r, x.g.game_id);
  const pct = (v) => `${Math.round(100 * n(v))}%`;
  const snapText = (r) => { const s = snapOf(r); return !s ? '' : ` · ${[n(s.offense_pct) ? `${pct(s.offense_pct)} off` : null, n(s.defense_pct) ? `${pct(s.defense_pct)} def` : null, n(s.st_pct) ? `${pct(s.st_pct)} ST` : null].filter(Boolean).join(', ') || 'no snaps'}`; };
  const offense = rows.filter((r) => n(r.attempts) || n(r.carries) || n(r.targets)).sort((a, b) => (n(b.attempts) - n(a.attempts)) || (n(b.carries) + n(b.targets) - n(a.carries) - n(a.targets)))
    .map((r) => `    ${r.player_display_name} (${r.position}) ${[n(r.attempts) ? passLine(r) : null,
      n(r.carries) ? `${n(r.carries)} ${n(r.carries) === 1 ? 'carry' : 'carries'} ${n(r.rushing_yards)} yds${n(r.rushing_tds) ? ` ${n(r.rushing_tds)} TD` : ''}` : null,
      n(r.targets) ? `${n(r.receptions)} of ${n(r.targets)} targets ${n(r.receiving_yards)} yds${n(r.receiving_tds) ? ` ${n(r.receiving_tds)} TD` : ''}${dropsOf(d, r) ? `, ${dropsOf(d, r)} drop${dropsOf(d, r) === 1 ? '' : 's'}` : ''}` : null,
      n(r.rushing_fumbles_lost) + n(r.receiving_fumbles_lost) + n(r.sack_fumbles_lost) ? `${n(r.rushing_fumbles_lost) + n(r.receiving_fumbles_lost) + n(r.sack_fumbles_lost)} fumble lost` : null].filter(Boolean).join(', ')}${snapText(r)}`);
  const tackles = (r) => n(r.def_tackles_solo) + n(r.def_tackles_with_assist) + n(r.def_tackle_assists);
  // Under defense only who played a defensive snap; a tackle on special teams or after a turnover is listed apart (Oct 28
  // 2026 sweep: the Ravens' center, 100% of the offensive snaps, and a Bengals running back read as defenders).
  const defensiveStats = (r) => tackles(r) || n(r.def_sacks) || n(r.def_qb_hits) || n(r.def_interceptions) || n(r.def_pass_defended) || n(r.def_fumbles_forced);
  const noDefensiveSnap = (r) => { const s = snapOf(r); return Boolean(s) && !n(s.defense_snaps) && !n(s.defense_pct); };
  const statLine = (r) => `    ${r.player_display_name} (${r.position}) ${[tackles(r) ? plural(tackles(r), 'tackle') : null, n(r.def_tackles_for_loss) ? `${n(r.def_tackles_for_loss)} for loss` : null,
      n(r.def_sacks) ? `${n(r.def_sacks)} sack${n(r.def_sacks) === 1 ? '' : 's'}` : null, n(r.def_qb_hits) ? `${n(r.def_qb_hits)} QB hit${n(r.def_qb_hits) === 1 ? '' : 's'}` : null,
      n(r.def_interceptions) ? `${n(r.def_interceptions)} INT` : null, n(r.def_pass_defended) ? plural(n(r.def_pass_defended), 'pass defended', 'passes defended') : null,
      n(r.def_fumbles_forced) ? `${n(r.def_fumbles_forced)} forced fumble${n(r.def_fumbles_forced) === 1 ? '' : 's'}` : null, n(r.def_tds) ? `${n(r.def_tds)} TD` : null].filter(Boolean).join(', ')}${snapText(r)}`;
  const byTackles = (a, b) => tackles(b) - tackles(a);
  const defense = rows.filter((r) => defensiveStats(r) && !noDefensiveSnap(r)).sort(byTackles).map(statLine);
  const otherTackles = rows.filter((r) => defensiveStats(r) && noDefensiveSnap(r)).sort(byTackles).map((r) => statLine(r).trim());
  // Everyone else who played: his snap share.
  const named = new Set(rows.filter((r) => n(r.attempts) || n(r.carries) || n(r.targets) || tackles(r) || n(r.def_sacks) || n(r.def_qb_hits) || n(r.def_interceptions) || n(r.def_pass_defended) || n(r.def_fumbles_forced)).map(snapOf).filter(Boolean));
  const others = snaps.filter((s) => !named.has(s) && (n(s.offense_snaps) || n(s.defense_snaps) || n(s.st_snaps)))
    .sort((a, b) => Math.max(n(b.offense_pct), n(b.defense_pct)) - Math.max(n(a.offense_pct), n(a.defense_pct)))
    .map((s) => `${s.player} (${s.position}) ${[n(s.offense_pct) ? `${pct(s.offense_pct)} off` : null, n(s.defense_pct) ? `${pct(s.defense_pct)} def` : null, n(s.st_pct) ? `${pct(s.st_pct)} ST` : null].filter(Boolean).join(', ')}`);
  return { offense, defense, otherTackles, others, onFile: rows.length > 0, snapsOnFile: snaps.length > 0 };
}

/** A team's games before `before` in the game-by-game layout's record words: W-L(-T). */
export const recordOf = (d, code, before) => record(teamGames(d, code, d.season, before));

/** One game in full, from `code`'s side (the second system). */
export function nflGameFull(d, x, code, before) {
  const o = x.opp;
  const head = `Wk ${x.week} · ${etDay(x.date)} · ${versus(x, teamName(o))}${x.g.stadium && !x.neutral ? ` at ${x.g.stadium}` : ''}${x.g.roof ? ` (${[x.g.roof, x.g.surface].filter(Boolean).join(', ')})` : ''} · ${x.won ? 'W' : x.tied ? 'T' : 'L'} ${x.pf}-${x.pa}${x.ot ? ' in overtime' : ''}`;
  // A team's first game has no rest: the schedule's 7 there is a filler (Oct 29 2026 hunt: every Week 1 game read "7 days
  // since their last game", the Thursday opener and the Monday games too).
  const first = (c) => teamGames(d, c, d.season, before)[0]?.g.game_id === x.g.game_id;
  const rest = (k, c) => (first(c) ? 'first game of the season' : x.g[`${k}_rest`] ? `${x.g[`${k}_rest`]} days since their last game` : 'days since their last game not on file');
  const ourKey = x.home ? 'home' : 'away', theirKey = x.home ? 'away' : 'home';
  const setting = `  setting: ${nickname(code)} ${rest(ourKey, code)}, coach ${coachThatDay(d, x.g, code) || 'not on file'} · ${nickname(o)} ${rest(theirKey, o)}, coach ${coachThatDay(d, x.g, o) || 'not on file'}`;
  const weather = d.weather ? gameWeatherLine(x.g, d.weather.get(x.g.game_id)) : ['outdoors', 'open'].includes(x.g.roof) ? 'weather: not on file' : null;
  const scoring = !d.ledgerGames ? 'score by quarter and drives: not on file' : !x.ledger ? 'quarters and drives not on file' : quarterLine(x, code);
  const kicking = x.off && x.def ? `kicking: ${nickname(code)} ${kicks(x.off.kicking)}; ${nickname(o)} ${kicks(x.def.kicking)}` : null;
  const theirs = teamGames(d, o, d.season, before).find((g) => g.g.game_id === x.g.game_id);
  const qb = (sideCode) => { const st = startedEarlyExit(d, x.g, sideCode); const ps = passersOf(d, x.g, sideCode); const rel = reliefOf(d, x.g, sideCode, ps); return ps.length ? [...(st && ps.includes(st) ? [st] : []), ...ps.filter((r) => r !== st), ...rel].map((r) => `${r.player_display_name}${r === st ? ' (started, left early)' : rel.includes(r) ? ' (relief)' : ''} ${passLine(r)}`).join('; ') : 'not on file'; };
  const ourGames = teamGames(d, code, d.season, before), oppGames = teamGames(d, o, d.season, before);
  // A team's first game has no regulars to be without yet (Oct 29 2026 hunt: every Week 1 game read "none of its
  // regulars", the Packers' too, Josh Jacobs on the exempt list).
  const absent = (c, gs) => { const a = lineupChanges(d, c, gs).absent?.get(x.g.game_id) || []; return a.length ? a.map((p) => `${p.name} (${p.pos}, ${p.why})`).join(', ') : first(c) ? 'regulars not yet set (its first game)' : 'none of its regulars'; };
  const changesUs = lineupChanges(d, code, ourGames).get(x.g.game_id), changesThem = lineupChanges(d, o, oppGames).get(x.g.game_id);
  const lines = [head, setting, weather ? `  ${weather}` : null,
    `  how it went: ${[scoring, kicking].filter(Boolean).join(' · ')}`,
    `  ${specialTeamsLine(d, x, code)}`,
    d.ledgerGames && x.ledger ? `  ${driveLine(x, code)}` : null,
    `  quarterbacks: ${nickname(code)} ${qb(code)} · ${nickname(o)} ${qb(o)}`,
    `  ${boxLine(x, code)}`,
    `  ${pressureLine(d, x, code)}`,
    coverageLine(d, x, code) ? `  ${coverageLine(d, x, code)}` : null,
    contactLine(d, x, code) ? `  ${contactLine(d, x, code)}` : null,
    hurtLine(x, code) ? `  ${hurtLine(x, code)}` : null,
    flowLine(x, code) ? `  ${flowLine(x, code)}` : null,
    downsLine(x, code) ? `  ${downsLine(x, code)}` : null,
    bigPlaysLine(x, code) ? `  ${bigPlaysLine(x, code)}` : null,
    byScoreLine(x, code) ? `  ${byScoreLine(x, code)}` : null,
    `  without that day: ${nickname(code)} ${absent(code, ourGames)} · ${nickname(o)} ${absent(o, oppGames)}`,
    // The missing regulars are on the "without that day" line; the lineup line keeps the rest, and goes when nothing is
    // left (Oct 29 2026 hunt, round 7: a team with absences only read its missing regulars twice).
    ...[[code, changesUs], [o, changesThem]].map(([c, ch]) => { const rest = ch ? ch.replace(/^missing regulars: [^·]*(?:· ?|$)/, '').trim() : ''; return rest ? `  ${nickname(c)} lineup: ${rest}` : null; })];
  for (const c of [code, o]) {
    const p = sidePlayers(d, x, c);
    lines.push(`  ${teamName(c)}:${p.onFile ? '' : ' player lines not on file'}`);
    if (p.offense.length) lines.push('   offense', ...p.offense);
    if (p.defense.length) lines.push('   defense', ...p.defense);
    if (p.otherTackles?.length) lines.push(`   tackles by players with no defensive snap: ${p.otherTackles.join('; ')}`);
    if (p.others.length) lines.push(`   also played (snaps): ${p.others.join('; ')}`);
    else if (!p.snapsOnFile) lines.push('   snap counts not on file');
  }
  // The opponent coming in: its record before this game and its games before it, then its record before tonight.
  const prior = oppGames.filter((g) => g.date < x.date);
  // With what it ran and passed for and allowed in each (round 12: as on the live read's opponent lines).
  const units = (g) => (g.off && g.def ? `; ran ${g.off.rushing} on ${g.off.carries}, passed for ${Math.round(g.off.yards - g.off.rushing)}, sacked ${g.off.sacked}, ${g.off.giveaways} giveaway${g.off.giveaways === 1 ? '' : 's'}; allowed ${g.def.rushing} rushing, ${Math.round(g.def.yards - g.def.rushing)} passing, ${g.def.sacked} sacks made, ${g.def.giveaways} takeaway${g.def.giveaways === 1 ? '' : 's'}` : '');
  const res = (g) => `Wk ${g.week} ${g.won ? 'W' : g.tied ? 'T' : 'L'} ${g.pf}-${g.pa}${g.ot ? ' (OT)' : ''} ${versus(g, nickname(g.opp), true)}${g.passers?.length || units(g) ? ` (${g.passers?.length ? `QB ${qbsText(g.passers, g.startedQb)}` : 'QB not on file'}${units(g)})` : ''}`;
  lines.push(`  ${teamName(o)} coming in: ${record(prior)}${prior.length ? `; ${prior.map(res).join('; ')}` : ' (their first game)'} · ${record(oppGames)} before tonight`);
  return lines.filter(Boolean).join('\n');
}

/** An older game in one line, from `code`'s side: result, score, both quarterbacks, who it was without. */
export function nflGameShort(d, x, code, before) {
  const a = lineupChanges(d, code, teamGames(d, code, d.season, before)).absent?.get(x.g.game_id) || [];
  const firstGame = teamGames(d, code, d.season, before)[0]?.g.game_id === x.g.game_id;
  return `  Wk ${x.week} ${x.won ? 'W' : x.tied ? 'T' : 'L'} ${x.pf}-${x.pa} ${versus(x, teamName(x.opp), true)} · QB ${qbsText(x.passers, x.startedQb) || 'not on file'} · theirs ${qbsText(x.oppPassers, x.oppStartedQb) || 'not on file'} · without: ${a.length ? a.map((p) => p.name).join(', ') : firstGame ? 'regulars not yet set (its first game)' : 'none of its regulars'}`;
}

/** Every team's record before `before`, in alphabetical order by code: not a standings table (round 9, Oct 29 2026:
 * sorted best first, it put every team in a league place). */
export function nflLeagueRecords(d, before) {
  const codes = [...new Set((d.schedule || []).filter((g) => g.season === String(d.season)).flatMap((g) => [g.home_team, g.away_team]))].sort();
  const rows = codes.map((c) => { const gs = teamGames(d, c, d.season, before); const w = gs.filter((x) => x.won).length, t = gs.filter((x) => x.tied).length; return { c, w, l: gs.length - w - t, t, gp: gs.length }; });
  return rows.map((r) => `${r.c} ${nickname(r.c)} ${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`).join(' · ');
}

/** A team's games before `before` (the second system's read takes its window from these). */
export const nflTeamGames = (d, team, before) => teamGames(d, codeOf(team), d.season, before);
