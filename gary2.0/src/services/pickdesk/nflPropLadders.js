/**
 * NFL LADDER BETS (founder, Sep 25 2026). Every NFL prop is the book's normal
 * over/under, with a few "X or more" bets beside it, the way a fan sees them
 * on FanDuel:
 *
 *   - 3+ and 4+ passing touchdowns for a quarterback with a passing-TD line;
 *   - 6+ / 7+ style receptions: the two counts just above the receptions
 *     line, for each team's top four receivers;
 *   - rushing yards: the two ladder rungs at least ten yards above the line,
 *     for each team's top two rushers;
 *   - 2+ touchdowns for those same receivers and rushers (1+ is the anytime TD).
 *
 * "Top" is the market's own read: the higher receptions (or rushing yards)
 * line on the board. A ladder rung that equals a player's over/under is the
 * same bet as the over and is allowed for every stat.
 *
 * Returns allowLadder(row, source) for the standard-market check. A ladder is
 * an over bet only; its price is the book's own.
 */
import { propMarketLine } from '../propMarketLine.js';

const RECEIVERS_PER_TEAM = 4;
const RUSHERS_PER_TEAM = 2;
const PASSING_TD_RUNGS = [2.5, 3.5];
const TWO_TD_RUNG = 1.5;
const RUSH_RUNG_MIN_GAP = 10;
const LADDER_MAX_ODDS = 400;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};
const lineOf = (r) => { try { return propMarketLine(r); } catch { return null; } };

export function nflLadderAllowance(rawRows, boardRows) {
  const teamOf = new Map();
  for (const r of boardRows || []) if (r?.player_id != null && r.team) teamOf.set(String(r.player_id), r.team);

  // Each player's standard lines per stat, from every book's over/under.
  const ou = new Map();
  for (const r of rawRows || []) {
    if (r?.market?.type !== 'over_under') continue;
    const line = lineOf(r);
    if (line == null) continue;
    const k = `${r.player_id}|${r.prop_type}`;
    if (!ou.has(k)) ou.set(k, []);
    ou.get(k).push(line);
  }
  const standardLine = (pid, type) => median(ou.get(`${pid}|${type}`) || []);

  const topByTeam = (type, n) => {
    const byTeam = new Map();
    for (const [k, lines] of ou) {
      const [pid, t] = k.split('|');
      if (t !== type || !teamOf.has(pid)) continue;
      const team = teamOf.get(pid);
      if (!byTeam.has(team)) byTeam.set(team, []);
      byTeam.get(team).push({ pid, line: median(lines) });
    }
    const out = new Set();
    for (const list of byTeam.values()) list.sort((a, b) => b.line - a.line).slice(0, n).forEach((x) => out.add(x.pid));
    return out;
  };
  const receivers = topByTeam('receptions', RECEIVERS_PER_TEAM);
  const rushers = topByTeam('rushing_yards', RUSHERS_PER_TEAM);

  // Rushing-yard rungs come from the ladder the books actually post.
  const rushRungs = new Map();
  for (const pid of rushers) {
    const base = standardLine(pid, 'rushing_yards');
    if (base == null) continue;
    const posted = [...new Set((rawRows || []).filter((r) => String(r.player_id) === pid && r.prop_type === 'rushing_yards'
      && r.market?.type === 'milestone').map(lineOf).filter((l) => l != null && l >= base + RUSH_RUNG_MIN_GAP))].sort((a, b) => a - b);
    rushRungs.set(pid, new Set(posted.slice(0, 2)));
  }

  const allowed = (pid, type, line) => {
    const lines = ou.get(`${pid}|${type}`) || [];
    if (lines.includes(line)) return true; // the same bet as the over
    if (type === 'passing_tds') return lines.length > 0 && PASSING_TD_RUNGS.includes(line);
    if (type === 'receptions' && receivers.has(pid)) {
      const base = standardLine(pid, 'receptions');
      return base != null && (line === base + 1 || line === base + 2);
    }
    if (type === 'rushing_yards' && rushers.has(pid)) return Boolean(rushRungs.get(pid)?.has(line));
    if (type === 'anytime_td') return line === TWO_TD_RUNG && (receivers.has(pid) || rushers.has(pid));
    return false;
  };

  // A rung past the takeable window's +400 top can never be picked; it stays off the board.
  return (row, source) => source?.market?.type === 'milestone' && Number(source.market.odds) <= LADDER_MAX_ODDS
    && allowed(String(source.player_id ?? row?.player_id), source.prop_type ?? row?.prop_type, lineOf(source));
}
