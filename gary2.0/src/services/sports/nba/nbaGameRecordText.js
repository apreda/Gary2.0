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
export const sideOf = (rec, teamId) => (String(rec.home.id) === String(teamId) ? 'home' : 'away');
const other = (s) => (s === 'home' ? 'away' : 'home');

/** The season's summaries by team id, oldest first: Map(teamId -> [{ game_id, game_date, summary }]). */
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
export function wonLost(rows, teamId) {
  const w = rows.filter((r) => { const s = r.summary; const us = summarySide(s, teamId); return s[us].score > s[other(us)].score; }).length;
  return `${w}-${rows.length - w}`;
}

/** One game of a team's season in a line: date, opponent, result, score. */
export function resultLine(row, teamId) {
  const s = row.summary; const us = summarySide(s, teamId); const them = other(us);
  return `${etDay(s.date).replace(/^\w+, /, '')} ${s[us].score > s[them].score ? 'W' : 'L'} ${s[us].score}-${s[them].score} ${us === 'home' ? 'vs' : '@'} ${s[them].abbr}${s.ot ? ' (OT)' : ''}`;
}

function settingText(set, short) {
  if (set.daysOff == null) return `${short}: first game of the season`;
  const rest = set.daysOff === 0 ? 'second night of a back-to-back' : `${set.daysOff} day${set.daysOff === 1 ? '' : 's'} off`;
  const four = set.gamesInFourNights >= 3 ? `, ${ord(set.gamesInFourNights)} game in four nights` : '';
  const trip = !set.miles ? 'same arena' : `about ${set.miles.toLocaleString('en-US')} miles${set.tzShift ? `, ${Math.abs(set.tzShift)} time zone${Math.abs(set.tzShift) === 1 ? '' : 's'} ${set.tzShift > 0 ? 'east' : 'west'}` : ''}`;
  return `${short}: ${rest}${four}; last game ${set.prev.home ? 'vs' : '@'} ${set.prev.opponent} (${etDay(set.prev.date)}, ${set.prev.city}), ${trip}`;
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

// A team's listing at tip, its players who had not played in any of the team's games before this one set apart.
function reportText(rec, side, before) {
  const r = rec.report[side]; const short = rec[side].short;
  if (!r || r.notOnFile) return `${short}: not on file`;
  const rows = r.rows.filter((x) => !/g league/i.test(x.reason));
  if (!rows.length) return `${short}: nobody listed`;
  const reason = (x) => String(x.reason || '').replace(/^Injury\/Illness - /, '').replace(/;\s*/g, ' ');
  const played = new Set(before.flatMap((b) => b.summary.played[summarySide(b.summary, rec[side].id)] || []));
  const groups = new Map();
  for (const x of rows) {
    const fresh = before.length && !played.has(x.name);
    const key = `${x.status}${fresh ? ` (not in any of their ${before.length} game${before.length === 1 ? '' : 's'} before this one)` : ''}`;
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(`${x.name} (${reason(x)})`);
  }
  return `${short}: ${[...groups].map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ')}`;
}

function playerRow(p) {
  const q = p.min < 1 ? '' : p.quarters ? ` · quarters (min/pts) ${p.quarters.map((x) => `${Math.round(x.min)}/${x.pts}`).join(' ')}` : ' · quarters not on file';
  return `    ${p.name}${p.starter ? '*' : ''} ${mins(p.min)} min · ${p.pts} pts, ${p.reb} reb (${p.oreb} off), ${p.ast} ast, ${p.stl} stl, ${p.blk} blk, ${p.turnover} TO, ${p.pf} PF · ${p.fgm}-${p.fga} FG, ${p.fg3m}-${p.fg3a} 3PT, ${p.ftm}-${p.fta} FT · ${signed(p.pm)}${q}`;
}

function teamBox(rec, side) {
  const t = rec.teams[side];
  const kinds = t.paint != null ? `points: ${t.paint} in the paint, ${t.secondChance} second chance, ${t.fastBreak} fast break, ${t.offTurnovers} off turnovers, ${t.bench} bench` : `points: ${t.bench} bench; paint, second chance, fast break and off turnovers not on file`;
  return `  ${rec[side].short} team: ${t.fgm}-${t.fga} FG, ${t.fg3m}-${t.fg3a} 3PT, ${t.ftm}-${t.fta} FT, ${t.reb} reb (${t.oreb} off), ${t.ast} ast, ${t.stl} stl, ${t.blk} blk, ${t.turnover} TO, ${t.pf} PF · ${kinds}`;
}

/** One game in full, from `teamId`'s side. `byTeam` is summariesByTeam over the season so far. */
export function fullGameText(rec, teamId, byTeam) {
  const us = sideOf(rec, teamId); const them = other(us);
  const before = (id) => (byTeam.get(String(id)) || []).filter((r) => r.game_date < rec.date);
  const next = (id) => (byTeam.get(String(id)) || []).find((r) => r.game_date > rec.date);
  const won = rec.final[us] > rec.final[them];
  const alt = rec.setting.home.altitudeFt ? ` (${rec.setting.home.altitudeFt.toLocaleString('en-US')} ft)` : '';
  const lines = [`${etDay(rec.date)} · ${us === 'home' ? 'vs' : '@'} ${rec[them].name} in ${rec.setting.home.arenaCity || rec.home.name}${alt} · ${won ? 'W' : 'L'} ${rec.final[us]}-${rec.final[them]}${rec.periods.length > 4 ? ` (${rec.periods.length - 4 === 1 ? 'OT' : `${rec.periods.length - 4} OT`})` : ''}${rec.cup ? ` · NBA Cup (${rec.cup})` : ''}${rec.postseason ? ' · postseason' : ''}`];
  lines.push(`  setting: ${settingText(rec.setting[us], rec[us].short)} · ${settingText(rec.setting[them], rec[them].short)}`);
  lines.push(`  how it went: ${flowText(rec, us)}`);
  lines.push(`  injury report at tip: ${reportText(rec, us, before(rec[us].id))} · ${reportText(rec, them, before(rec[them].id))}`);
  for (const side of [us, them]) {
    const mine = rec.players.filter((p) => p.side === side);
    const played = mine.filter((p) => p.min > 0).sort((a, b) => (b.starter - a.starter) || (b.min - a.min));
    const listed = new Set((rec.report[side].rows || []).map((x) => x.name));
    const sat = mine.filter((p) => p.min <= 0 && !listed.has(p.name)).map((p) => p.name);
    lines.push(`  ${rec[side].short} (* started):`, ...played.map(playerRow));
    if (sat.length) lines.push(`    did not play, not on the injury report: ${sat.join(', ')}`);
    // Who was on the team's next listing that wasn't on this one, among those who played here.
    const n = next(rec[side].id);
    if (n) {
      const listedHere = new Set((rec.report[side].rows || []).map((x) => x.name));
      const after = (n.summary.listed?.[summarySide(n.summary, rec[side].id)] || []).filter((x) => !listedHere.has(x.name) && played.some((p) => p.name === x.name) && !/g league/i.test(x.reason));
      if (after.length) lines.push(`    listed for their next game (${etDay(n.game_date)}), not listed for this one: ${after.map((x) => `${x.name} (${x.status}, ${String(x.reason || '').replace(/^Injury\/Illness - /, '')}; ${Math.round(played.find((p) => p.name === x.name).min)} min here)`).join(', ')}`);
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
