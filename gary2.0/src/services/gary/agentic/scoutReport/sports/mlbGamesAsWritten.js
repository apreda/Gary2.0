/**
 * The MLB desk's box score and bullpen press query. The per-team "last games,
 * as written" selection and renderer that once lived here were unused and
 * removed Sep 24 2026; the June desk prints its stories from
 * mlbStoriesAsWritten.js.
 */

/**
 * FULL BOX SCORE (founder, Aug 27: "i want the full box scores AND the
 * context that stats dont show which comes from the stories"). Renders the
 * complete official box for one game — every batter who appeared, in
 * lineup order, and every pitcher in appearance order — from the statsapi
 * boxscore payload the pen ledger already fetches. Facts only, whole lines,
 * no trims; a side with no player data renders nothing for that side.
 */
export function renderBoxScore(gameHead, box) {
  const sides = [];
  for (const key of ['away', 'home']) {
    const side = box?.teams?.[key];
    if (!side?.players) continue;
    const teamName = side?.team?.name || key;
    const players = Object.values(side.players);

    const batters = players
      .filter((pl) => pl?.stats?.batting && Object.keys(pl.stats.batting).length > 0 && pl.battingOrder != null)
      .sort((a, b) => Number(a.battingOrder) - Number(b.battingOrder));
    const batLines = batters.map((pl) => {
      const b = pl.stats.batting;
      const slot = String(pl.battingOrder ?? '');
      const starter = slot.endsWith('00');
      const name = pl?.person?.fullName || '?';
      const pos = pl?.position?.abbreviation || '';
      return `  ${starter ? Number(slot) / 100 + '.' : ' ↳'} ${name}${pos ? ` (${pos})` : ''}: ${b.atBats ?? 0} AB, ${b.runs ?? 0} R, ${b.hits ?? 0} H, ${b.homeRuns ?? 0} HR, ${b.rbi ?? 0} RBI, ${b.baseOnBalls ?? 0} BB, ${b.strikeOuts ?? 0} K`;
    });

    const pitcherIds = Array.isArray(side.pitchers) ? side.pitchers : [];
    const pitLines = pitcherIds
      .map((pid) => side.players[`ID${pid}`])
      .filter((pl) => pl?.stats?.pitching)
      .map((pl) => {
        const pi = pl.stats.pitching;
        const name = pl?.person?.fullName || '?';
        const pitches = pi.numberOfPitches != null ? `, ${pi.numberOfPitches} pitches` : '';
        return `  ${name}: ${pi.inningsPitched ?? '?'} IP, ${pi.hits ?? 0} H, ${pi.runs ?? 0} R, ${pi.earnedRuns ?? 0} ER, ${pi.baseOnBalls ?? 0} BB, ${pi.strikeOuts ?? 0} K${pitches}`;
      });

    if (batLines.length === 0 && pitLines.length === 0) continue;
    const chunk = [`${teamName}:`];
    if (batLines.length) chunk.push(...batLines);
    if (pitLines.length) chunk.push(`  Pitching:`, ...pitLines);
    sides.push(chunk.join('\n'));
  }
  if (sides.length === 0) return '';
  return `BOX SCORE — ${gameHead}:\n${sides.join('\n')}`;
}

/**
 * THE PEN, AS REPORTED (option A — the press beat on the bullpen).
 * One grounded search query per team, riding the existing press machinery
 * and its freshness/budget bounds at the call site. Fan-parity voice:
 * everything a fan reading the beat would know about the pen, as reported,
 * attributed — awareness only, no conclusions asked for and none implied.
 */
export function buildPenPressQuery(teamName) {
  // GAME BY GAME (founder GO, Sep 2 2026): the beat's account of the last
  // three games' bullpen innings — when the starter came out, who followed
  // in what order, what happened — beside the roles, moves and availability
  // notes. Reported facts only, attributed and dated.
  return (
    `MLB: what the press is reporting about the ${teamName} bullpen right now, game by game — ` +
    `for each of the team's last three games as written by reporters: when the starter came out and why, who pitched after him in what order and how each of those innings went, any meltdown or escape as described in game coverage; ` +
    `which relievers have worked on consecutive days or carried heavy pitch counts, who was reported unavailable or being rested and why, ` +
    `the closer situation and any role changes as reported, fresh reliever injuries, activations, call-ups or option moves, ` +
    `and manager comments about bullpen decisions, matchups or availability for the next game. ` +
    `Attribute claims to the outlet and date them. Report only what has been published — no predictions, no betting advice, no opinions of your own. Write the report directly: do not narrate your search process, do not describe what you are about to look for, and do not mention searching at all.`
  );
}
