/**
 * EACH TEAM'S 3s BY CLOSEST DEFENDER (Nov 9 2026, founder GO). The reads leaned on 3s allowed ("the Lakers allowed 19-43
 * from three to Portland") with no way to tell open looks the defense gave up from tough shots that went in; Portland's
 * 43 were 38 open or wide open. The NBA's tracking buckets by how far the closest defender was at the shot: very tight
 * 0-2 ft, tight 2-4, open 4-6, wide open 6+. Facts only: makes and attempts per bucket, both teams, every game.
 *
 * What it can't say, so it isn't dressed up as more: the distance only (not the defender's height or a hand up), the
 * whole game only (no quarter split, so garbage-time looks are in it), and the tracking now and then misses a shot or two
 * the box has; when its total differs from the box's 3s, both are said.
 */
const BUCKETS = [['wideOpen', '6_plus_ft', 'wide open (6+ ft)'], ['open', '4_6_ft', 'open (4-6 ft)'], ['tight', '2_4_ft', 'tight (2-4 ft)'], ['veryTight', '0_2_ft', 'very tight (0-2 ft)']];

/** One team's 3s in a game from BDL's defender_distance rows: { wideOpen: [made, att], open, tight, veryTight, made, att },
 * or null when the feed has no rows for the team. */
export function threesByDefender(rows, teamId) {
  const mine = (rows || []).filter((r) => String(r?.team_id) === String(teamId));
  if (!mine.length) return null;
  const out = { made: 0, att: 0 };
  for (const [key, range] of BUCKETS) {
    const here = mine.filter((r) => r.range === range);
    const m = here.reduce((a, r) => a + (Number(r.stats?.fg3_m) || 0), 0), a = here.reduce((x, r) => x + (Number(r.stats?.fg3_a) || 0), 0);
    out[key] = [m, a]; out.made += m; out.att += a;
  }
  return out;
}

/** "Lakers 7-20 wide open (6+ ft), 2-8 open (4-6 ft), 2-9 tight (2-4 ft)", very tight only when it has attempts, and the
 * box's 3s beside the tracked total when they differ. `box` is the team's { fg3m, fg3a } from the box; no `name`, no name in front. */
export function threesByDefenderText(t, name = null, box = null) {
  const who = name ? `${name} ` : '';
  if (!t) return `${who}not on file`;
  const parts = BUCKETS.filter(([key]) => key !== 'veryTight' || t.veryTight[1] > 0).map(([key, , label]) => `${t[key][0]}-${t[key][1]} ${label}`);
  const differs = box?.fg3a != null && (box.fg3a !== t.att || box.fg3m !== t.made);
  return `${who}${parts.join(', ')}${differs ? ` (tracked ${t.made}-${t.att} of the box's ${box.fg3m}-${box.fg3a})` : ''}`;
}
