/**
 * AN NBA GAME RECORD AS GARY READS IT (Oct 27 2026, the game-by-game system). One layout for every game, the same
 * detail for every game in the window: the setting, how it went, who was out, every player on both teams with his
 * quarters, each team's box, who was listed for the team's next game, and the opponent's season around this game.
 * What happened across games is read here from the season's summaries: who on an injury list had played for the team
 * before, who was listed after, and the opponent's results. Facts only.
 */
const etDay = (ymd) => new Date(`${String(ymd).slice(0, 10)}T16:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
const ord = (n) => `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th'}`;
const periodName = (q) => (q <= 4 ? `${ord(q)} quarter` : q === 5 ? 'overtime' : `${ord(q - 4)} overtime`);
const mins = (m) => (m > 0 && m < 0.5 ? '<1' : String(Math.round(m)));
const possessive = (name) => (/s$/.test(name) ? `${name}'` : `${name}'s`);
const signed = (n) => (n == null ? '' : n > 0 ? `+${n}` : String(n));
import { samePlayerIn } from '../../providers/nbaOfficialInjuryReport.js';

export const sideOf = (rec, teamId) => (String(rec.home.id) === String(teamId) ? 'home' : 'away');
const other = (s) => (s === 'home' ? 'away' : 'home');

/** The season's summaries by team id, oldest first: Map(teamId -> [{ game_id, game_date, summary }]). */
/** Each "Name (reason)" said in full the first time in `lines` (print order) and by name alone after (round 16: the same
 * absentees and their surgeries on every game of a log). Only lines `test` passes; a reason that changes is said again. */
export function reasonsOnce(lines, test = () => true) {
  const seen = new Set();
  return lines.map((l) => (l == null || !test(l) ? l : String(l).replace(/(\p{Lu}[\p{L}.'’-]*(?: (?:\p{Lu}[\p{L}.'’-]*|Jr\.|Sr\.|II|III|IV))*) \(((?!not in |not filed|not on file)[^()]+)\)/gu, (m, name, why) => {
    const k = `${name}|${why}`; if (seen.has(k)) return name; seen.add(k); return m; })));
}

export function summariesByTeam(rows) {
  const out = new Map();
  for (const r of rows || []) for (const t of [r.summary.home, r.summary.away]) {
    const k = String(t.id); if (!out.has(k)) out.set(k, []); out.get(k).push(r);
  }
  for (const list of out.values()) list.sort((a, b) => String(a.game_date).localeCompare(String(b.game_date)));
  return out;
}
const summarySide = (s, teamId) => (String(s.home.id) === String(teamId) ? 'home' : 'away');

const OPPONENT_GAMES = 10;
/** A team's wins and losses in these games. */
// The standings' games only: not the postseason and not the NBA Cup final (Oct 29 2026 hunt, round 7).
export const inStandingsRow = (r) => !r.summary?.postseason && !/^championship$/i.test(String(r.summary?.cup || ''));
export function wonLost(rows, teamId) {
  const counted = rows.filter(inStandingsRow);
  const w = counted.filter((r) => { const s = r.summary; const us = summarySide(s, teamId); return s[us].score > s[other(us)].score; }).length;
  return `${w}-${counted.length - w}`;
}

/** One game of a team's season in a line: date, opponent, result, score. */
export function resultLine(row, teamId) {
  const s = row.summary; const us = summarySide(s, teamId); const them = other(us);
  return `${etDay(s.date).replace(/^\w+, /, '')} ${s[us].score > s[them].score ? 'W' : 'L'} ${s[us].score}-${s[them].score} ${us === 'home' ? 'vs' : '@'} ${s[them].abbr}${s.ot ? ' (OT)' : ''}${inStandingsRow(row) ? '' : (s.postseason ? ' (postseason)' : ' (NBA Cup final, not in the standings)')}`;
}

function settingText(set, short) {
  if (set.daysOff == null) return `${short}: first game of the season`;
  const rest = set.daysOff === 0 ? 'second night of a back-to-back' : `${set.daysOff} day${set.daysOff === 1 ? '' : 's'} off`;
  const four = set.gamesInFourNights >= 3 ? `, ${ord(set.gamesInFourNights)} game in four nights` : '';
  const trip = set.miles === 0 ? 'same arena' : set.miles == null ? 'miles not on file' : `about ${set.miles.toLocaleString('en-US')} miles${set.tzShift ? `, ${Math.abs(set.tzShift)} time zone${Math.abs(set.tzShift) === 1 ? '' : 's'} ${set.tzShift > 0 ? 'east' : 'west'}` : ''}`;
  return `${short}: ${rest}${four}; last game ${set.prev.home ? 'vs' : '@'} ${set.prev.opponent} (${etDay(set.prev.date)}, ${set.prev.city || 'city not on file'}), ${set.miles == null && set.prev ? 'miles not on file' : trip}`;
}

function flowText(rec, us) {
  const them = other(us); const f = rec.flow;
  const q = (s) => `${rec[s].short} ${rec.quarters[s].map((v) => v ?? '?').join('-')}`;
  const parts = [`by quarter: ${q(us)} · ${q(them)}`, `about ${rec.teams[us].possessions} possessions each`];
  if (rec.afterThree) parts.push(`after three ${rec.afterThree[us]}-${rec.afterThree[them]}`);
  if (!f) return `${parts.join('; ')}; leads, runs and the late score not on file (the play-by-play does not end at the final)`;
  if (f.fiveLeft) parts.push(`with 5:00 left ${f.fiveLeft[us]}-${f.fiveLeft[them]}`);
  parts.push(`largest lead ${rec[us].short} ${f.largestLead[us]}, ${rec[them].short} ${f.largestLead[them]}`);
  parts.push(`${f.leadChanges} lead change${f.leadChanges === 1 ? '' : 's'}, ${f.ties} tie${f.ties === 1 ? '' : 's'}`);
  const run = (s) => { const r = f.biggestRun[s]; return r ? `${rec[s].short} ${r.pts}-0 in the ${periodName(r.startPeriod)}${r.endPeriod !== r.startPeriod ? ` into the ${periodName(r.endPeriod)}` : ''} (${r.start[us]}-${r.start[them]} to ${r.end[us]}-${r.end[them]})` : `${rec[s].short} none`; };
  parts.push(`biggest run ${run(us)}; ${run(them)}`);
  return parts.join('; ');
}

/** A stored game's flow from one team's side, without the quarters (the live log prints its own): after three, with
 * 5:00 left, the largest leads, lead changes and ties, and each side's biggest run (Oct 29 2026, founder: "who got
 * ahead, how ... being close the whole game"; the live system's game lines had the quarters only). */
// Technicals, flagrants and ejections, as the full game text says them (round 11: the live log never said Tari Eason was
// ejected in the first quarter of a game he played 3 minutes in).
const incidentsText = (rec) => (rec.incidents?.length ? `technicals, flagrants and ejections: ${rec.incidents.map((x) => `${x.text} (${periodName(x.period)})`).join('; ')}` : null);
// Players with 15+ minutes who last left the floor before the 4th quarter and never came back (round 12: Cooper Flagg's
// 17 minutes, out for good before half, read as an ordinary night).
// One on the floor to the end of a quarter and never back counts too when every later quarter was followed to the
// second (round 15: Durant sat the whole 4th of a 6-point game and was not named). A clock under a minute is seconds.
const clockWord = (c) => (/:/.test(String(c)) ? c : `${c} seconds`);
/** How a player who played on `date` was listed for his team's next stored game, status and reason; null when that game
 * is not stored or he was not listed (round 15: the live log said early exits in minutes only, and Gary guessed at
 * Markkanen's and Jackson's injuries the second system named). */
export function nextListed(byTeam, teamId, date, name) {
  const n = byTeam ? (byTeam.get(String(teamId)) || []).find((r) => r.game_date > String(date).slice(0, 10)) : null;
  const rows = n ? (n.summary.listed?.[summarySide(n.summary, teamId)] || []) : [];
  const hit = rows.find((x) => x.status !== 'Available' && !/g league - two-way/i.test(x.reason || '') && samePlayerIn(name, [x.name]) === x.name);
  return hit ? `${hit.status} for the next game, ${etDay(n.game_date)}: ${String(hit.reason || 'reason not on file').replace(/^Injury\/Illness - /, '')}` : null;
}
const goneEarly = (rec, byTeam = null) => {
  const followedAfter = (q) => !(rec.wholeMinuteQuarters || []).some((x) => x > q);
  const list = (rec.players || []).filter((p) => { const o = rec.lastOff?.[p.name]; return p.min >= 15 && o && o.period <= 3 && (o.clock !== 'end' || followedAfter(o.period)); });
  const listed = (p) => { const w = nextListed(byTeam, rec[p.side]?.id, rec.date, p.name); return w ? `; ${w}` : ''; };
  return list.length ? `played 15+ minutes and did not return after the 3rd quarter: ${list.map((p) => `${rec[p.side].short} ${p.name} (${Math.round(p.min)} min; ${rec.lastOff[p.name].clock === 'end' ? `on the floor to the end of the ${periodName(rec.lastOff[p.name].period)}` : `last left in the ${periodName(rec.lastOff[p.name].period)} with ${clockWord(rec.lastOff[p.name].clock)} left`}${listed(p)})`).join(', ')}` : null;
};
export function flowFacts(rec, teamId, byTeam = null) {
  const flow = flowText(rec, String(rec.home?.id) === String(teamId) ? 'home' : 'away').replace(/^by quarter: [^;]*; /, '');
  return [flow, incidentsText(rec), goneEarly(rec, byTeam)].filter(Boolean).join('; ');
}

/** An older game's people and boxes from one team's side, for the live log (loop 3, Oct 29 2026: its ten older games
 * read a score, the quarters and the flow, and nothing of who played): each side's starters and who was out at tip,
 * then both team boxes. */
export function olderGameFacts(rec, teamId) {
  const us = String(rec.home?.id) === String(teamId) ? 'home' : 'away', them = other(us);
  const starters = (side) => (rec.players || []).filter((p) => p.side === side && p.starter).map((p) => p.name).join(', ') || 'not on file';
  const out = (side) => (!rec.report?.[side] || rec.report[side].notOnFile ? 'the injury report not on file'
    : rec.report[side].rows.filter((r) => r.status === 'Out' && !/g league - two-way/i.test(r.reason || '')).map((r) => r.name).join(', ') || 'nobody');
  return [`started: ${rec[us].short} ${starters(us)} · ${rec[them].short} ${starters(them)}`,
    `out at tip: ${rec[us].short} ${out(us)} · ${rec[them].short} ${out(them)}`,
    teamBox(rec, us).trim(), teamBox(rec, them).trim()];
}

// A team's listing at tip, its players who had not played in any of the team's games before this one set apart.
function reportText(rec, side, before) {
  const r = rec.report[side]; const short = rec[side].short;
  if (!r || r.notOnFile) return `${short}: not on file`;
  const rows = r.rows.filter((x) => !/g league - two-way/i.test(x.reason));
  if (!rows.length) return `${short}: nobody listed`;
  const reason = (x) => String(x.reason || '').replace(/^Injury\/Illness - /, '').replace(/;\s*/g, ' ');
  // Report names against box names the way the live read matches them (Oct 29 2026 hunt: the report's "Sergio de Larrea"
  // and "Morez Johnson Jr." are the box's "Sergio De Larrea" and "Morez Johnson", and read as not in any game before).
  const played = [...new Set(before.flatMap((b) => b.summary.played[summarySide(b.summary, rec[side].id)] || []))];
  const names = rows.map((x) => x.name);
  const groups = new Map();
  for (const x of rows) {
    const fresh = before.length && !samePlayerIn(x.name, played, names);
    const key = `${x.status}${fresh ? ` (not in ${before.length === 1 ? 'their one game' : `any of their ${before.length} games`} before this one)` : ''}`;
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(`${x.name} (${reason(x)})`);
  }
  return `${short}: ${[...groups].map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ')}`;
}

function playerRow(p) {
  const q = p.min < 1 ? '' : !p.quarters ? ' · quarters not on file'
    : p.quarterPts === false ? ` · minutes by quarter ${p.quarters.map((x) => Math.round(x.min)).join(' ')} (points by quarter not on file)`
      : ` · quarters (min/pts) ${p.quarters.map((x) => `${Math.round(x.min)}/${x.pts}`).join(' ')}`;
  return `    ${p.name}${p.starter ? '*' : ''} ${mins(p.min)} min · ${p.pts} pts, ${p.reb} reb (${p.oreb} off), ${p.ast} ast, ${p.stl} stl, ${p.blk} blk, ${p.turnover} TO, ${p.pf} PF · ${p.fgm}-${p.fga} FG, ${p.fg3m}-${p.fg3a} 3PT, ${p.ftm}-${p.fta} FT · ${signed(p.pm)}${q}`;
}

function teamBox(rec, side) {
  const t = rec.teams[side];
  const kindsOf = [['paint', 'in the paint'], ['secondChance', 'second chance'], ['fastBreak', 'fast break'], ['offTurnovers', 'off turnovers']];
  const onFile = kindsOf.filter(([k]) => t[k] != null), off = kindsOf.filter(([k]) => t[k] == null);
  const kinds = `points: ${[...onFile.map(([k, label]) => `${t[k]} ${label}`), `${t.bench} bench`].join(', ')}${off.length ? `; ${off.map(([, label]) => label.replace(/^in the /, '')).join(', ').replace(/, ([^,]*)$/, ' and $1')} not on file` : ''}`;
  const gap = t.official && t.playersSum && ['fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta'].some((k) => t.playersSum[k] !== t[k])
    ? ` · its players' lines above add up to ${t.playersSum.fgm}-${t.playersSum.fga} FG, ${t.playersSum.fg3m}-${t.playersSum.fg3a} 3PT, ${t.playersSum.ftm}-${t.playersSum.fta} FT (the stats feed is missing what the official box has)` : '';
  const source = t.official ? 'official box' : "players' rows summed (the official box not on file; team turnovers and rebounds not included)";
  return `  ${rec[side].short} team (${source}): ${t.fgm}-${t.fga} FG, ${t.fg3m}-${t.fg3a} 3PT, ${t.ftm}-${t.fta} FT, ${t.reb} reb (${t.oreb} off), ${t.ast} ast, ${t.stl} stl, ${t.blk} blk, ${t.turnover} TO${t.teamTurnovers ? ` (${t.teamTurnovers} of them team turnovers)` : ''}, ${t.pf} PF · ${kinds}${gap}`;
}

/** One game in full, from `teamId`'s side. `byTeam` is summariesByTeam over the season so far. */
export function fullGameText(rec, teamId, byTeam) {
  const us = sideOf(rec, teamId); const them = other(us);
  const before = (id) => (byTeam.get(String(id)) || []).filter((r) => r.game_date < rec.date);
  const next = (id) => (byTeam.get(String(id)) || []).find((r) => r.game_date > rec.date);
  const won = rec.final[us] > rec.final[them];
  const v = rec.setting.home.venue;
  const where = v ? `at ${v.name}, ${v.city}${rec.setting.home.altitudeFt ? ` (${rec.setting.home.altitudeFt.toLocaleString('en-US')} ft)` : ''}${v.neutral ? ', a neutral site' : ''}` : 'venue not on file';
  const lines = [`${etDay(rec.date)} · ${us === 'home' ? 'vs' : '@'} ${rec[them].name} ${where} · ${won ? 'W' : 'L'} ${rec.final[us]}-${rec.final[them]}${rec.periods.length > 4 ? ` (${rec.periods.length - 4 === 1 ? 'OT' : `${rec.periods.length - 4} OT`})` : ''}${rec.cup ? ` · ${/^championship$/i.test(rec.cup) ? 'NBA Cup final, not in the standings' : `NBA Cup (${rec.cup})`}` : ''}${rec.postseason ? ' · postseason' : ''}`];
  lines.push(`  setting: ${settingText(rec.setting[us], rec[us].short)} · ${settingText(rec.setting[them], rec[them].short)}`);
  lines.push(`  how it went: ${flowText(rec, us)}`);
  // Who finished it and who carried the fourth quarter (Oct 27 2026, founder: "who takes up the share of the fourth-quarter
  // minutes"; the closing five from the last quarter's substitutions, checked against its minutes).
  const lateOf = (p) => (p.lateMin != null ? p.lateMin : p.quarters ? p.quarters.filter((x) => x.q >= 4).reduce((a, x) => a + x.min, 0) : null);
  const q4 = (side) => {
    const mine = rec.players.filter((p) => p.side === side && p.min > 0);
    const known = mine.filter((p) => lateOf(p) != null).map((p) => ({ name: p.name, min: lateOf(p) })).filter((x) => x.min >= 1).sort((a, b) => b.min - a.min).map((x) => `${x.name} ${Math.round(x.min)}`);
    const unknown = mine.filter((p) => lateOf(p) == null).map((p) => p.name);
    return [...known, ...(unknown.length ? [`not on file for ${unknown.join(', ')}`] : [])].join(', ');
  };
  lines.push(`  on the floor at the end: ${rec.closing ? `${rec[us].short} ${rec.closing[us].join(', ')} · ${rec[them].short} ${rec.closing[them].join(', ')}` : 'not on file (the play-by-play does not account for the last quarter\'s minutes)'}`);
  const cut = (rec.wholeMinuteQuarters || []).filter((q) => q >= 4).length ? ' (whole minutes, cut down)' : '';
  // Only when some player's quarters are not on his row below, which already ends with his 4th (round 16).
  if (rec.players.some((p) => p.min > 0 && !p.quarters)) lines.push(`  minutes in the 4th${rec.periods.length > 4 ? ' and overtime' : ''}${cut}: ${rec[us].short} ${q4(us) || 'not on file'} · ${rec[them].short} ${q4(them) || 'not on file'}`);
  if (rec.incidents?.length) lines.push(`  technicals, flagrants and ejections: ${rec.incidents.map((x) => `${x.text} (${periodName(x.period)})`).join('; ')}`);
  lines.push(`  injury report at tip: ${reportText(rec, us, before(rec[us].id))} · ${reportText(rec, them, before(rec[them].id))}`);
  for (const side of [us, them]) {
    const mine = rec.players.filter((p) => p.side === side);
    const played = mine.filter((p) => p.min > 0).sort((a, b) => (b.starter - a.starter) || (b.min - a.min));
    // Who sat: listed Available and did not play apart from those not on the report at all (Oct 29 2026 hunt: Zuby
    // Ejiofor, Available at Atlanta, read "not on the injury report" a few lines under the report).
    const rowsHere = rec.report[side].rows || [];
    const onReport = (p, rows) => samePlayerIn(p.name, rows.map((x) => x.name), mine.map((q) => q.name));
    const benched = mine.filter((p) => p.min <= 0);
    const availableSat = benched.filter((p) => onReport(p, rowsHere.filter((x) => x.status === 'Available'))).map((p) => p.name);
    const sat = benched.filter((p) => !onReport(p, rowsHere)).map((p) => p.name);
    lines.push(`  ${rec[side].short} (* started):`, ...played.map(playerRow));
    if (availableSat.length) lines.push(`    listed Available, did not play: ${availableSat.join(', ')}`);
    if (sat.length) lines.push(`    did not play, not on the injury report: ${sat.join(', ')}`);
    // Who was on the team's next listing that wasn't on this one, among those who played here.
    const n = next(rec[side].id);
    if (n) {
      const listedHere = (rec.report[side].rows || []).map((x) => x.name);
      const nextRows = (n.summary.listed?.[summarySide(n.summary, rec[side].id)] || []);
      const box = (x) => played.find((p) => p.name === samePlayerIn(x.name, played.map((q) => q.name), nextRows.map((y) => y.name)));
      const after = nextRows.filter((x) => x.status !== 'Available' && !samePlayerIn(x.name, listedHere, nextRows.map((y) => y.name)) && box(x) && !/g league - two-way/i.test(x.reason));
      const left = (name) => { const o = rec.lastOff?.[name]; return !o ? '' : o.clock === 'end' ? `, on the floor to the end of the ${periodName(o.period)}` : `, last left the floor in the ${periodName(o.period)} with ${clockWord(o.clock)} left`; };
      if (after.length) lines.push(`    listed for their next game (${etDay(n.game_date)}), not listed for this one: ${after.map((x) => `${x.name} (${x.status}, ${String(x.reason || '').replace(/^Injury\/Illness - /, '')}; ${Math.round(box(x).min)} min here${left(box(x).name)})`).join(', ')}`);
    }
  }
  lines.push(teamBox(rec, us), teamBox(rec, them));
  // The opponent around this game: its last OPPONENT_GAMES games before it, its record then and now (a count of the
  // games; the league's records tonight are at the head of the read).
  const season = (byTeam.get(String(rec[them].id)) || []);
  const prior = season.filter((r) => r.game_date < rec.date);
  const shown = prior.slice(-OPPONENT_GAMES);
  lines.push(`  ${rec[them].short} coming in: ${wonLost(prior, rec[them].id)}${shown.length ? `; ${prior.length > shown.length ? `last ${shown.length}: ` : ''}${shown.map((r) => resultLine(r, rec[them].id)).join('; ')}` : ' (their first game)'} · ${wonLost(season, rec[them].id)} before tonight`);
  return lines.join('\n');
}

/** An older game in one line: date, opponent, result, quarters, starters and who was out on both sides. */
export function shortGameText(row, teamId) {
  const s = row.summary; const us = summarySide(s, teamId); const them = other(us);
  return `  ${resultLine(row, teamId)} · started: ${s.starters[us].join(', ') || 'not on file'} · out: ${s.out[us].join(', ') || 'nobody'} · theirs out: ${s.out[them].join(', ') || 'nobody'}`;
}
