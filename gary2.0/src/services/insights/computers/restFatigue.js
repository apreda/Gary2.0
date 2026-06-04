// gary2.0/src/services/insights/computers/restFatigue.js
//
// LANE: restFatigue
// "Schedule spot matters: a team on a back-to-back / heavy stretch, or a
//  bullpen that's been overworked, is at a fatigue disadvantage tonight."
//
// Planned data path (documented BDL methods only — to implement):
//   * Slate is ctx.games (getMlbGamesForDate already loaded). For each team,
//     derive rest/B2B by looking back at recent games. NOTE: there is no
//     documented BDL "rest" endpoint — recent-game dates must be assembled
//     from getMlbGamesForDate across prior dates (cheap, 5-min cache) to
//     compute days-rest / games-in-last-N. Do NOT invent a rest field.
//   * Bullpen usage: getMlbGameStats({ gameIds, seasons }) per-game box rows
//     for the team's recent games can total reliever innings/appearances.
//     Keep this OPTIONAL — skip the bullpen angle if box data is absent.
//
// Contract: return makeRow({...}) rows; tone CAUTION (fatigued side) /
// EDGE (rested opponent); defensive; relevance scaled by severity
// (B2B + heavy bullpen usage > single short-rest day).

// eslint-disable-next-line no-unused-vars
export async function computeRestFatigue(ctx) {
  // TODO: implement days-rest/B2B from prior-date getMlbGamesForDate lookups,
  //       optionally layer bullpen usage from getMlbGameStats.
  return [];
}

export default { computeRestFatigue };
