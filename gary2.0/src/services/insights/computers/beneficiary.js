// gary2.0/src/services/insights/computers/beneficiary.js
//
// LANE: beneficiary
// "An injury opens a role; identify the next-man-up who benefits."
//
// Planned data path (documented BDL methods only — to implement):
//   * getInjuriesGeneric('baseball_mlb', { team_ids: [homeId, awayId] })
//     -> Array of injury records: player ({ full_name, position, team:{id} }),
//        type, status, date (drives FRESH/PRICED-IN). Injury labeling/duration
//        logic is LOCKED (CLAUDE.md) — READ ONLY, never alter labels.
//   * For the injured player's position, find the next-man-up via
//     getMlbPlayerSeasonStats({ season, teamId }) (same position, healthy) and
//     /or getMlbLineups(gameId) (who actually slots in tonight).
//   * Surface the beneficiary's role bump + their relevant stat as the value.
//
// Contract: return makeRow({...}) rows; tone EDGE/HOT; defensive (skip when no
// fresh injury or no identifiable replacement); relevance scaled by how big the
// role bump is (everyday starter replacing a star > platoon bat).

// eslint-disable-next-line no-unused-vars
export async function computeBeneficiary(ctx) {
  // TODO: implement using getInjuriesGeneric + getMlbLineups/getMlbPlayerSeasonStats.
  //  - filter to slate teams (ctx.games -> home/visitor team ids)
  //  - LOCKED: read injury freshness labels, do not modify them
  //  - emit one beneficiary row per opened role on the slate
  return [];
}

export default { computeBeneficiary };
