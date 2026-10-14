/**
 * THIS WEEK'S STARTERS (founder GO, Oct 14 2026 night: "the data backstop. Add this week's starters with each one's
 * career facts: age, years in the league, career starts, and last season's team and role"). A fan knows the Patriots
 * are better than the Raiders from the players; what Gary knows about how good players are is his to use
 * (nflQuestion.js), and this section keeps that knowledge current: who is starting for each team now, with each
 * player's age, his season in the league and where and how much he played last season. Quarterbacks add their career
 * starts and the record in them. Players out this week are left off. From nflverse: the season's roster, the snap
 * counts of this season and last, and the schedule file's starting quarterbacks. Facts only.
 */
import { nflverseCode } from '../../../../providers/nflverseService.js';

export const NFL_STARTERS_TITLE = "THIS WEEK'S STARTERS";

// A starter: half or more of his unit's snaps in either of the team's last two games.
const STARTER_SHARE = 0.5;
const key = (v) => String(v || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');
const pct = (v) => Math.round(Number(v) * 100);
const ord = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'}`;
const record = (w, l, t) => `${w}-${l}${t ? `-${t}` : ''}`;

function ageOn(birth, asOf) {
  const b = new Date(`${birth}T12:00:00Z`), d = new Date(asOf);
  if (Number.isNaN(b.getTime()) || Number.isNaN(d.getTime())) return null;
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

// Where and how much he played last season, in his own unit's snaps.
function lastSeasonRole(priorRows, pfrId, unit, priorSeason) {
  const mine = priorRows.filter((r) => r.pfr_player_id === pfrId);
  if (!mine.length) return `${priorSeason}: no NFL snaps`;
  const field = unit === 'offense' ? 'offense_pct' : 'defense_pct';
  const teams = [...new Set(mine.map((r) => r.team))];
  const played = mine.filter((r) => Number(r[field]) > 0);
  if (!played.length) return `${priorSeason}: ${mine.length} games for ${teams.join(' and ')}, special teams only`;
  const avg = played.reduce((sum, r) => sum + Number(r[field]), 0) / played.length;
  return `${priorSeason}: ${played.length} games for ${teams.join(' and ')}, ${pct(avg)}% of ${unit === 'offense' ? 'offensive' : 'defensive'} snaps in them`;
}

// A quarterback's starts from the schedule file: last season's and his career's, regular season and playoffs apart.
function quarterbackStarts(scheduleRows, gsisId, priorSeason) {
  if (!gsisId) return null;
  const tally = { reg: [0, 0, 0], post: [0, 0, 0] };
  const last = {};
  for (const r of scheduleRows) {
    if (r.home_score === '' || r.home_score == null || r.home_score === 'NA') continue;
    const home = r.home_qb_id === gsisId, away = r.away_qb_id === gsisId;
    if (!home && !away) continue;
    const scored = Number(home ? r.home_score : r.away_score), allowed = Number(home ? r.away_score : r.home_score);
    const t = tally[r.game_type === 'REG' ? 'reg' : 'post'];
    t[scored > allowed ? 0 : scored < allowed ? 1 : 2]++;
    if (Number(r.season) === priorSeason && r.game_type === 'REG') { const team = home ? r.home_team : r.away_team; last[team] = (last[team] || 0) + 1; }
  }
  const reg = tally.reg[0] + tally.reg[1] + tally.reg[2], post = tally.post[0] + tally.post[1] + tally.post[2];
  const lastText = Object.keys(last).length ? `${priorSeason}: ${Object.entries(last).map(([team, n]) => `${n} start${n === 1 ? '' : 's'} for ${team}`).join(' and ')}` : `${priorSeason}: no starts`;
  const career = `career: ${reg} regular-season start${reg === 1 ? '' : 's'} (${record(...tally.reg)})${post ? `, ${post} playoff start${post === 1 ? '' : 's'} (${record(...tally.post)})` : ''}`;
  return `${lastText} · ${career}`;
}

function teamBlock(team, { roster, snaps, priorSnaps, schedule }, { season, asOf, out, questionable, quarterback }) {
  const code = nflverseCode(team);
  if (!code) return null;
  const rows = snaps.filter((r) => r.team === code && r.game_type === 'REG');
  const games = [...new Set(rows.map((r) => r.game_id))].sort((a, b) => Number(rows.find((r) => r.game_id === b).week) - Number(rows.find((r) => r.game_id === a).week));
  const recent = new Set(games.slice(0, 2));
  const byPlayer = new Map();
  for (const r of rows.filter((x) => recent.has(x.game_id))) {
    const unit = Number(r.offense_pct) >= STARTER_SHARE ? 'offense' : Number(r.defense_pct) >= STARTER_SHARE ? 'defense' : null;
    if (!unit) continue;
    const share = Number(unit === 'offense' ? r.offense_pct : r.defense_pct);
    const seen = byPlayer.get(r.pfr_player_id);
    if (!seen || share > seen.share) byPlayer.set(r.pfr_player_id, { name: r.player, position: r.position, unit, share, pfr: r.pfr_player_id });
  }
  const rosterBy = new Map(roster.filter((r) => r.team === code).map((r) => [r.pfr_id, r]));
  const rosterByName = new Map(roster.filter((r) => r.team === code).map((r) => [key(r.full_name), r]));
  // The quarterback is this week's starter, whoever took last week's snaps.
  const players = [...byPlayer.values()].filter((p) => p.position !== 'QB' && !out.has(key(p.name)));
  const qbRow = quarterback ? rosterByName.get(key(quarterback)) : null;
  const line = (p, r) => {
    const age = r?.birth_date ? ageOn(r.birth_date, asOf) : null;
    const exp = r && r.years_exp !== '' ? Number(r.years_exp) : null;
    const facts = [age != null ? `${age}` : null, exp === 0 ? 'rookie' : exp != null ? `${ord(exp + 1)} season` : null].filter(Boolean).join(', ');
    const tag = questionable.has(key(p.name)) ? ' (questionable this week)' : '';
    return `  ${p.position} ${p.name}${tag}${facts ? `, ${facts}` : ''} · ${exp === 0 ? `${season - 1}: not yet in the league` : lastSeasonRole(priorSnaps, p.pfr, p.unit, season - 1)}`;
  };
  const lines = [`${team}:`];
  if (quarterback) {
    const age = qbRow?.birth_date ? ageOn(qbRow.birth_date, asOf) : null;
    const exp = qbRow && qbRow.years_exp !== '' ? Number(qbRow.years_exp) : null;
    const facts = [age != null ? `${age}` : null, exp === 0 ? 'rookie' : exp != null ? `${ord(exp + 1)} season` : null].filter(Boolean).join(', ');
    lines.push(`  QB ${quarterback}${facts ? `, ${facts}` : ''} · ${quarterbackStarts(schedule, qbRow?.gsis_id, season - 1) || 'starts not available'}`);
  }
  for (const unit of ['offense', 'defense']) {
    const group = players.filter((p) => p.unit === unit).sort((a, b) => b.share - a.share);
    if (!group.length) continue;
    lines.push(` ${unit === 'offense' ? 'Offense' : 'Defense'}:`);
    for (const p of group) lines.push(line(p, rosterBy.get(p.pfr) || rosterByName.get(key(p.name))));
  }
  return lines.length > 1 ? lines.join('\n') : null;
}

/**
 * The section body, the visitors first. Empty when a file is missing.
 * @param {{roster:object, snaps:object, priorSnaps:object, schedule:object}} files nflverse files as loaded
 * @param {{homeTeam:string, awayTeam:string, season:number, asOf:string, out?:Set, questionable?:Set, quarterbacks?:object}} game
 */
export function nflStartersText(files, { homeTeam, awayTeam, season, asOf, out = new Set(), questionable = new Set(), quarterbacks = {} }) {
  const usable = (f) => f && !f.unavailable && Array.isArray(f.rows);
  if (![files.roster, files.snaps, files.priorSnaps, files.schedule].every(usable)) return '';
  const data = { roster: files.roster.rows, snaps: files.snaps.rows, priorSnaps: files.priorSnaps.rows.filter((r) => r.game_type === 'REG'), schedule: files.schedule.rows };
  const blocks = [awayTeam, homeTeam].map((team) => teamBlock(team, data, { season, asOf, out, questionable, quarterback: quarterbacks[team] || null })).filter(Boolean);
  return blocks.length ? `Each team's starters in its last two games, players out this week left off. Last season's snaps are the share of his unit's snaps in the games he played.\n\n${blocks.join('\n\n')}` : '';
}

export const _starterKey = key;
