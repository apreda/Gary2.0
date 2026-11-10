/**
 * A TEAM WITHOUT A PLAYER LISTED TONIGHT (Nov 10 2026, founder GO). The Lakers were +18.7 per 48 with Luka Doncic on the
 * floor and -28.3 in the minutes he rested, then won both full games he missed. A bare on/off number can't be read without
 * knowing when those minutes came, who the other team had out there, and who plays tonight; the founder: "the lakers being
 * -20 without luka does matter but only in terms of the opponent and who else the lakers have playing". So, from the
 * stored stretches on the floor (nbaGameRecord.js followQuarter), for a regular listed Out, Doubtful or Questionable whose
 * absence is new (he played in one of the team's last three games):
 *   - the minutes he sat in the games he played, the score in them, and how many were garbage time;
 *   - the rest split by whether 3 or more of the other team's starters were on the floor;
 *   - tonight's projected starters without him: their minutes together with him off the floor, and the score;
 *   - the full games he missed, with their results.
 * Only past MIN_MINUTES outside garbage time (founder: "only if there is a large sample size"); below it there is no line.
 * Garbage time here: the 4th quarter with the teams 20+ apart and more than 6:00 left, or 15+ apart after, as each stretch
 * began. Facts only; nothing here says what they mean.
 */
import { samePlayerIn } from '../../providers/nbaOfficialInjuryReport.js';

export const MIN_MINUTES = 200;
const REGULAR_MINUTES = 24;
const FRESH_GAMES = 2;

const etDay = (ymd) => new Date(`${String(ymd).slice(0, 10)}T16:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
export const isGarbage = (s) => s.q === 4 && ((s.from > 360 && Math.abs(s.margin) >= 20) || (s.from <= 360 && Math.abs(s.margin) >= 15));

function sideOf(g, teamId) { return String(g.home?.id) === String(teamId) ? 'home' : 'away'; }
const other = (s) => (s === 'home' ? 'away' : 'home');
/** The player in this game's box for `side` matching `name`, or null. */
function inBox(g, side, name) {
  const mine = (g.players || []).filter((p) => p.side === side);
  const hit = samePlayerIn(name, mine.map((p) => p.name), mine.map((p) => p.name));
  return hit ? mine.find((p) => p.name === hit) : null;
}

/** The counts behind the line: { played, avgMin, gamesSince, off: { secs, pts:[us,them] }, garbage, vsStarters, vsBench,
 * group: { names, secs, pts } | null, missed: [{ date, line }], partly } from the team's stored games (any order). */
export function offFloor(games, teamId, name, projected = null) {
  const list = [...(games || [])].sort((a, b) => String(a.game_date).localeCompare(String(b.game_date)));
  const zero = () => ({ secs: 0, pts: [0, 0] });
  const add = (acc, s, us) => { acc.secs += s.from - s.to; acc.pts[0] += s.pts[us === 'home' ? 0 : 1]; acc.pts[1] += s.pts[us === 'home' ? 1 : 0]; };
  const out = { played: 0, minutes: 0, gamesSince: 0, off: zero(), garbage: zero(), vsStarters: zero(), vsBench: zero(), missed: [], partly: 0, group: null };
  const groupNames = projected ? projected.filter((n) => !samePlayerIn(n, [name], [name, ...projected])) : null;
  if (groupNames?.length) out.group = { names: groupNames, ...zero(), inFive: groupNames.length === 4 };
  for (const g of list) {
    const us = sideOf(g, teamId), them = other(us);
    const me = inBox(g, us, name);
    const counted = Array.isArray(g.stints) && (g.stintQuarters || []).length === (g.periods || []).length;
    if (me && me.min > 0) {
      out.played += 1; out.minutes += me.min; out.gamesSince = 0;
      if (!counted) out.partly += 1;
    } else {
      out.gamesSince += 1;
      const a = g.final?.[us], b = g.final?.[them];
      if (a != null && b != null) out.missed.push({ date: g.game_date, line: `${a > b ? 'W' : 'L'} ${a}-${b} ${us === 'home' ? 'vs' : '@'} ${g[them]?.abbr || g[them]?.name} (${etDay(g.game_date)})` });
    }
    if (!Array.isArray(g.stints)) continue;
    const myId = me?.id ?? null;
    const theirStarters = new Set((g.players || []).filter((p) => p.side === them && p.starter).map((p) => p.id));
    const groupIds = out.group ? out.group.names.map((n) => inBox(g, us, n)?.id ?? null) : null;
    for (const s of g.stints) {
      if (myId != null && s[us].includes(myId)) continue;
      if (me && me.min > 0 && counted) {
        add(out.off, s, us);
        if (isGarbage(s)) add(out.garbage, s, us);
        else add(s[them].filter((id) => theirStarters.has(id)).length >= 3 ? out.vsStarters : out.vsBench, s, us);
      }
      if (groupIds && groupIds.every((id) => id != null && s[us].includes(id))) add(out.group, s, us);
    }
  }
  out.avgMin = out.played ? out.minutes / out.played : 0;
  return out;
}

const min = (secs) => Math.round(secs / 60);
const score = (acc) => `${acc.pts[0]}-${acc.pts[1]}`;

/** The line for one player, or null when he isn't a regular, his absence isn't new, or the minutes are too few. */
export function withoutHimLine(games, { teamId, team, name, status, projected = null }) {
  const o = offFloor(games, teamId, name, projected);
  if (!o.played || o.avgMin < REGULAR_MINUTES || o.gamesSince > FRESH_GAMES) return null;
  const competitive = o.vsStarters.secs + o.vsBench.secs;
  if (competitive < MIN_MINUTES * 60) return null;
  const parts = [`${team} with ${name} (${status} tonight) off the floor, in the ${o.played} games he played${o.partly ? ` (${o.partly} of them not counted: the play-by-play does not account for every minute)` : ''}: ${min(o.off.secs)} minutes, ${score(o.off)}`,
    `${min(o.garbage.secs)} of those minutes garbage time (${score(o.garbage)})`,
    `the rest, ${min(o.vsStarters.secs)} minutes against 3 or more of the other team's starters (${score(o.vsStarters)}) and ${min(o.vsBench.secs)} against fewer (${score(o.vsBench)})`];
  if (o.group) {
    const who = o.group.inFive ? `the other four projected starters (${o.group.names.join(', ')})` : `tonight's projected five (${o.group.names.join(', ')})`;
    parts.push(o.group.secs > 0 ? `${who} together with him off the floor: ${min(o.group.secs)} minutes this season, ${score(o.group)}` : `${who} have not been on the floor together without him this season`);
  }
  parts.push(o.missed.length ? `full games without him: ${o.missed.map((m) => m.line).join(', ')}` : 'no full games without him this season');
  return `${parts.join('; ')}.`;
}

/** Projected starters by team from the desk's STARTING LINEUPS block: { [team]: [names] }. */
export function projectedFives(block) {
  const out = {};
  for (const l of String(block || '').split('\n')) {
    const m = l.match(/^\[(?:HOME|AWAY)\] ([^:]+): (.+)$/);
    if (m) out[m[1].trim()] = m[2].split(/, (?=[^,()]+(?:\(|$))/).map((p) => p.replace(/\s*\([^)]*\)\s*$/, '').trim()).filter(Boolean);
  }
  return out;
}
