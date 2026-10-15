/**
 * THIS WEEK'S STARTERS (founder GO, Oct 14 2026 night: "the data backstop. Add this week's starters with each one's
 * career facts: age, years in the league, career starts, and last season's team and role"). A fan knows the Patriots
 * are better than the Raiders from the players; what Gary knows about how good players are is his to use
 * (nflQuestion.js), and this section keeps that knowledge current: who is starting for each team now, with each
 * player's age, his season in the league and whether he joined the club this season. Players out this week are left
 * off. From nflverse: the season's roster and the snap counts of this season and last (last season's only to say who
 * joined). No last-season snap shares or career records (founder, Oct 14 2026 night). Facts only.
 */
import { nflverseCode } from '../../../../providers/nflverseService.js';

export const NFL_STARTERS_TITLE = "THIS WEEK'S STARTERS";

// A starter: half or more of his unit's snaps in either of the team's last two games.
const STARTER_SHARE = 0.5;
const key = (v) => String(v || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');
const pct = (v) => Math.round(Number(v) * 100);
const ord = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'}`;

function ageOn(birth, asOf) {
  const b = new Date(`${birth}T12:00:00Z`), d = new Date(asOf);
  if (Number.isNaN(b.getTime()) || Number.isNaN(d.getTime())) return null;
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

// A player who was on another club's snap counts last season and on this club's now joined it this season. That is
// all last season says here (founder, Oct 14 2026 night: no last-season snap shares or career records in front of
// Gary); it keeps his memory of who plays where current.
function joinedThisSeason(priorRows, pfrId, code) {
  const teams = new Set(priorRows.filter((r) => r.pfr_player_id === pfrId).map((r) => r.team));
  return teams.size > 0 && !teams.has(code);
}

function teamBlock(team, { roster, snaps, priorSnaps }, { asOf, out, questionable, quarterback }) {
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
    const joined = exp !== 0 && joinedThisSeason(priorSnaps, p.pfr, code) ? ', joined this season' : '';
    return `  ${p.position} ${p.name}${tag}${facts ? `, ${facts}` : ''}${joined}`;
  };
  const lines = [`${team}:`];
  if (quarterback) {
    const age = qbRow?.birth_date ? ageOn(qbRow.birth_date, asOf) : null;
    const exp = qbRow && qbRow.years_exp !== '' ? Number(qbRow.years_exp) : null;
    const facts = [age != null ? `${age}` : null, exp === 0 ? 'rookie' : exp != null ? `${ord(exp + 1)} season` : null].filter(Boolean).join(', ');
    const joined = exp !== 0 && qbRow?.pfr_id && joinedThisSeason(priorSnaps, qbRow.pfr_id, code) ? ', joined this season' : '';
    lines.push(`  QB ${quarterback}${facts ? `, ${facts}` : ''}${joined}`);
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
 * @param {{roster:object, snaps:object, priorSnaps:object}} files nflverse files as loaded (last season's snaps only
 *   say who joined a club this season)
 * @param {{homeTeam:string, awayTeam:string, season:number, asOf:string, out?:Set, questionable?:Set, quarterbacks?:object}} game
 */
export function nflStartersText(files, { homeTeam, awayTeam, season, asOf, out = new Set(), questionable = new Set(), quarterbacks = {} }) {
  const usable = (f) => f && !f.unavailable && Array.isArray(f.rows);
  if (![files.roster, files.snaps, files.priorSnaps].every(usable)) return '';
  const data = { roster: files.roster.rows, snaps: files.snaps.rows, priorSnaps: files.priorSnaps.rows };
  const blocks = [awayTeam, homeTeam].map((team) => teamBlock(team, data, { asOf, out, questionable, quarterback: quarterbacks[team] || null })).filter(Boolean);
  return blocks.length ? `Each team's starters in its last two games, players out this week left off.\n\n${blocks.join('\n\n')}` : '';
}

export const _starterKey = key;
