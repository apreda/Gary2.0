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
// Gone from the club since his last game (founder GO, Oct 14 2026 night, the Eagles' Cam Jurgens traded midweek still
// listed): the season roster has him on another club, or marked retired, cut or traded.
const DEPARTED = /^(RET|CUT|TRD|TRT)$/i;
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

// One team's starters as rows: this week's quarterback, then everyone who took half or more of his unit's snaps in
// either of the team's last two games, players out this week left off.
function teamStarters(team, { roster, snaps, priorSnaps }, { asOf, out, questionable, quarterback }) {
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
  // The season roster by PFR id, or by name where the roster row carries no PFR id (Jurgens's and Johnson's don't).
  const anywhere = new Map(roster.filter((r) => r.pfr_id).map((r) => [r.pfr_id, [r]]));
  const byName = new Map();
  for (const r of roster) byName.set(key(r.full_name), [...(byName.get(key(r.full_name)) || []), r]);
  const stillHere = (p) => {
    const rows = anywhere.get(p.pfr) || byName.get(key(p.name)) || [];
    return !rows.length || rows.some((r) => r.team === code && !DEPARTED.test(String(r.status || '')));
  };
  const rosterByName = new Map(roster.filter((r) => r.team === code).map((r) => [key(r.full_name), r]));
  const facts = (name, r, pfr, tagged = true) => {
    const age = r?.birth_date ? ageOn(r.birth_date, asOf) : null;
    const exp = r && r.years_exp !== '' ? Number(r.years_exp) : null;
    const joined = exp !== 0 && pfr && joinedThisSeason(priorSnaps, pfr, code) ? 'joined this season' : null;
    return [tagged && questionable.has(key(name)) ? 'questionable this week' : null, age != null ? `${age}` : null, exp === 0 ? 'rookie' : exp != null ? `${ord(exp + 1)} season` : null, joined].filter(Boolean).join(', ');
  };
  // The quarterback is this week's starter, whoever took last week's snaps.
  const qbRow = quarterback ? rosterByName.get(key(quarterback)) : null;
  const qb = quarterback ? { position: 'QB', name: quarterback, unit: 'offense', share: 1, facts: facts(quarterback, qbRow, qbRow?.pfr_id, false) } : null;
  const players = [...byPlayer.values()].filter((p) => p.position !== 'QB' && !out.has(key(p.name)) && stillHere(p))
    .map((p) => ({ ...p, facts: facts(p.name, rosterBy.get(p.pfr) || rosterByName.get(key(p.name)), p.pfr) }));
  return { code, qb, players };
}

function teamBlock(team, data, opts) {
  const t = teamStarters(team, data, opts);
  if (!t) return null;
  // "QB Name, 26, 5th season" and "WR Name (questionable this week), 24, 4th season, joined this season", as before.
  const line = (p) => {
    const parts = p.facts ? p.facts.split(', ') : [];
    const tag = parts[0] === 'questionable this week' ? ` (${parts.shift()})` : '';
    return `  ${p.position} ${p.name}${tag}${parts.length ? `, ${parts.join(', ')}` : ''}`;
  };
  const lines = [`${team}:`];
  if (t.qb) lines.push(line(t.qb));
  for (const unit of ['offense', 'defense']) {
    const group = t.players.filter((p) => p.unit === unit).sort((a, b) => b.share - a.share);
    if (!group.length) continue;
    lines.push(` ${unit === 'offense' ? 'Offense' : 'Defense'}:`);
    for (const p of group) lines.push(line(p));
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

/**
 * WHO IS PLAYING (founder, Oct 14 2026 night: "It's not about who's not playing, it's about who is playing";
 * "he subtracts instead of comparing"). The same starters as above, the two teams side by side position by position,
 * so the comparison is the first thing Gary reads (Version K's story; off for live picks, NFL_STORY_LINEUPS_FIRST=1).
 */
export const NFL_LINEUPS_TITLE = 'WHO IS PLAYING';
const GROUPS = [
  ['QB', ['QB']], ['RB', ['RB', 'FB', 'HB']], ['WR', ['WR']], ['TE', ['TE']], ['OL', ['T', 'G', 'C', 'OT', 'OG', 'OL', 'LT', 'RT', 'LG', 'RG']],
  ['DL', ['DE', 'DT', 'NT', 'DL', 'EDGE']], ['LB', ['LB', 'ILB', 'OLB', 'MLB']], ['CB', ['CB', 'DB']], ['S', ['S', 'FS', 'SS', 'SAF']],
];
export function nflLineupsText(files, { homeTeam, awayTeam, asOf, out = new Set(), questionable = new Set(), quarterbacks = {} }) {
  const usable = (f) => f && !f.unavailable && Array.isArray(f.rows);
  if (![files.roster, files.snaps, files.priorSnaps].every(usable)) return '';
  const data = { roster: files.roster.rows, snaps: files.snaps.rows, priorSnaps: files.priorSnaps.rows };
  const sides = [awayTeam, homeTeam].map((team) => ({ team, t: teamStarters(team, data, { asOf, out, questionable, quarterback: quarterbacks[team] || null }) }));
  if (sides.some((s) => !s.t)) return '';
  const nick = (team) => team.split(' ').pop();
  const lines = [`This week's starters, position by position: each team's starters in its last two games, players out this week left off.`, ''];
  for (const [label, positions] of GROUPS) {
    const rows = sides.map(({ team, t }) => {
      const group = [...(t.qb ? [t.qb] : []), ...t.players].filter((p) => positions.includes(p.position)).sort((a, b) => b.share - a.share);
      return `${nick(team)}: ${group.length ? group.map((p) => `${p.name}${p.facts ? ` (${p.facts})` : ''}`).join('; ') : 'none listed'}`;
    });
    lines.push(`${label}`, `  ${rows[0]}`, `  ${rows[1]}`);
  }
  return lines.join('\n');
}
