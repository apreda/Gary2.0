/**
 * THE COLLEGE TOUCHDOWN LEDGER (Sep 21 2026) — the NCAAF half of the NFL
 * play-ledger settlement, sized to what BDL's college play feed can prove.
 *
 * The college player box omits defensive and special-teams scores, so a
 * player's zero rushing + receiving touchdowns could never settle an anytime
 * touchdown NO on its own (ncaafPropStats.js leaves it unresolved). The
 * college play feed names scorers only in free text, so a score cannot be
 * attributed to a player id from a play either. What the feed does establish
 * reliably is how many touchdowns each team scored, from the score changes on
 * its scoring plays.
 *
 * The rule: when a team's touchdowns in the complete play ledger equal the
 * touchdowns credited across its player box, every one of that team's scores
 * is an offensive score attributed to a boxed player, and a boxed player with
 * zero scored none. A return or recovery score outside the box counts as
 * attributed only when the play's text names its scorer in full and that
 * name matches exactly one box player with no offensive touchdown. A team
 * with any score left unattributed keeps every one of its players' NO
 * tickets pending: the missing score could be any of them.
 *
 * No initials, no jersey numbers, no partial names.
 */
import { isFinalGameStatus } from '../lib/resultsGradingReliability.js';

const id = value => (value == null || String(value).trim() === '' ? null : String(value));
const count = value => (Number.isSafeInteger(Number(value)) && Number(value) >= 0 && value !== null && value !== '' ? Number(value) : null);
const tdField = (row, field) => {
  if (row?.[field] == null) return 0; // a missing category on an existing row adds nothing to the team sum
  return count(row[field]);
};

/**
 * @returns {{ gameId, attributed: Set<string>, teamTdInPlays: Map, teamTdInBox: Map } | null}
 * null when the ledger cannot be trusted end to end.
 */
export function buildNcaafTouchdownLedger({ gameId, plays, playerStats, game } = {}) {
  const gid = id(gameId);
  if (!gid || !Array.isArray(plays) || !plays.length || !Array.isArray(playerStats) || !playerStats.length || !game) return null;
  if (game.status != null && !isFinalGameStatus(game.status)) return null;
  const homeId = id(game.home_team?.id ?? game.home_team_id);
  const awayId = id(game.visitor_team?.id ?? game.away_team?.id ?? game.visitor_team_id ?? game.away_team_id);
  const finalHome = count(game.home_team_score ?? game.home_score);
  const finalAway = count(game.visitor_team_score ?? game.away_score ?? game.visitor_score);
  if (!homeId || !awayId || homeId === awayId || finalHome == null || finalAway == null) return null;

  // Every play belongs to this exact game, with a unique explicit order.
  const orders = new Set();
  for (const play of plays) {
    if (id(play?.game_id ?? play?.game?.id) !== gid) return null;
    const order = count(play?.order);
    if (order == null || orders.has(order)) return null;
    orders.add(order);
  }
  const ordered = [...plays].sort((a, b) => a.order - b.order);
  const last = ordered.at(-1);
  if (count(last?.home_score) !== finalHome || count(last?.away_score) !== finalAway) return null;

  // Touchdowns by side, from the score change on each scoring play.
  const teamTdInPlays = new Map([[homeId, 0], [awayId, 0]]);
  const tdPlaysByTeam = new Map([[homeId, []], [awayId, []]]);
  let previousHome = 0, previousAway = 0;
  for (const play of ordered) {
    if (!play?.scoring_play) continue;
    const home = count(play.home_score), away = count(play.away_score);
    if (home == null || away == null) return null;
    const homeDelta = home - previousHome, awayDelta = away - previousAway;
    previousHome = home; previousAway = away;
    if (Number(play.score_value) !== 6) continue;
    const isHome = [6, 7, 8].includes(homeDelta) && awayDelta === 0;
    const isAway = [6, 7, 8].includes(awayDelta) && homeDelta === 0;
    if (isHome === isAway) return null;
    const side = isHome ? homeId : awayId;
    teamTdInPlays.set(side, teamTdInPlays.get(side) + 1);
    tdPlaysByTeam.get(side).push(play);
  }
  if (teamTdInPlays.get(homeId) * 6 > finalHome || teamTdInPlays.get(awayId) * 6 > finalAway) return null;

  // Touchdowns credited across each team's player box.
  const teamTdInBox = new Map([[homeId, 0], [awayId, 0]]);
  for (const row of playerStats) {
    if (row?._football_box_complete !== true || id(row?._game_id ?? row?.game?.id) !== gid) return null;
    const team = id(row?.team?.id);
    if (!teamTdInBox.has(team)) return null;
    const rushing = tdField(row, 'rushing_touchdowns'), receiving = tdField(row, 'receiving_touchdowns');
    if (rushing == null || receiving == null) return null;
    teamTdInBox.set(team, teamTdInBox.get(team) + rushing + receiving);
  }

  // A return or recovery score is not in any player's rushing/receiving box,
  // but the feed's text names its scorer in full ("Prophet Brown 99 Yd
  // Interception Return"). Credit such a play to a box player only on an
  // exact, unique full-name match with a player who carries no rushing or
  // receiving touchdown (a named offensive scorer's play is already in the
  // box sum and cannot be counted twice). No initials, no guessing.
  const namedExtras = new Map([[homeId, new Map()], [awayId, new Map()]]);
  for (const [team, tdPlays] of tdPlaysByTeam) {
    if (teamTdInPlays.get(team) === teamTdInBox.get(team)) continue;
    const rowsForTeam = playerStats.filter(row => id(row?.team?.id) === team);
    for (const play of tdPlays) {
      const match = /^\s*([A-Za-z.'’-]+(?: [A-Za-z.'’-]+){1,2}) \d+ Yd /.exec(String(play?.text ?? ''));
      if (!match) continue;
      const wanted = match[1].toLowerCase();
      const named = rowsForTeam.filter(row => `${row?.player?.first_name ?? ''} ${row?.player?.last_name ?? ''}`.trim().toLowerCase() === wanted);
      if (named.length !== 1) continue;
      const scorer = named[0];
      if ((tdField(scorer, 'rushing_touchdowns') ?? 0) + (tdField(scorer, 'receiving_touchdowns') ?? 0) > 0) continue;
      const playerId = id(scorer?.player?.id);
      if (!playerId) continue;
      namedExtras.get(team).set(playerId, (namedExtras.get(team).get(playerId) ?? 0) + 1);
    }
  }
  const namedCount = team => [...namedExtras.get(team).values()].reduce((sum, n) => sum + n, 0);
  const attributed = new Set([homeId, awayId].filter(team => teamTdInPlays.get(team) === teamTdInBox.get(team) + namedCount(team)));
  return { gameId: gid, attributed, teamTdInPlays, teamTdInBox, namedExtras };
}

/** The player's anytime-touchdown total, or null when his team's scores are not all attributed. */
export function ncaafAnytimeTouchdownActual(ledger, row) {
  if (!ledger || !row) return null;
  const team = id(row?.team?.id);
  if (!team || !ledger.attributed.has(team)) return null;
  const rushing = tdField(row, 'rushing_touchdowns'), receiving = tdField(row, 'receiving_touchdowns');
  if (rushing == null || receiving == null) return null;
  const named = ledger.namedExtras?.get(team)?.get(id(row?.player?.id)) ?? 0;
  return rushing + receiving + named;
}
