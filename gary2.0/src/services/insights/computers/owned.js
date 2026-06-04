// gary2.0/src/services/insights/computers/owned.js
//
// LANE: owned
// "A hitter has historically OWNED tonight's probable pitcher (or vice-versa)
//  — a batter-vs-pitcher career edge."
//
// Planned data path (documented BDL methods only — to implement):
//   * getMlbLineups(gameId) -> each side's batters + the OPPOSING probable
//     pitcher (name/playerId, on the other team's entry).
//   * getMlbPlayerVsPlayer({ playerId, opponentTeamId }) returns the batter's
//     career line vs ALL of the opponent team's pitchers:
//       [{ opponent_player: { full_name, last_name, id }, at_bats, hits,
//          home_runs, avg, ops, strikeouts (or k), walks (or bb) }]
//     Match opponent_player to tonight's probable starter (by id or name) and
//     surface the BvP line when at_bats clears a minimum sample.
//
// Contract: return makeRow({...}) rows; tone HOT (batter owns) /
// CAUTION (pitcher owns); defensive (skip on tiny AB sample or no match);
// relevance scaled by BvP OPS edge AND sample size (more AB = more trustworthy).

// eslint-disable-next-line no-unused-vars
export async function computeOwned(ctx) {
  // TODO: implement via getMlbLineups + getMlbPlayerVsPlayer({ playerId, opponentTeamId });
  //       require a MIN_AB sample, match opponent_player to tonight's starter.
  return [];
}

export default { computeOwned };
