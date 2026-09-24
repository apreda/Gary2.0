// THE LINEUP'S HANDS (bug fix, founder GO Sep 24 2026). When BDL's lineup
// feed skips a team, the desk takes that team's lineup from the MLB Stats API
// box score, whose players carry an id but no batting or throwing hand. Every
// hitter printed [Bats: ?] and the starter (Throws: ?): one club's platoon
// picture was blank on 33 of 145 desks from Sep 12-23. The September desk
// fixed this on Aug 19; the June restore brought it back. The same people
// lookup fills the hands here. Hands never change; nothing else is touched.

import { getMlbPeopleHands } from '../../../mlbStatsApiService.js';

const unknownBat = (bt) => String(bt || '?').startsWith('?');
const unknownThrow = (bt) => (String(bt || '').split('/')[1] || '?') === '?';

/**
 * Fill '?' hands in place. `sides` = { home, away } lineup objects
 * ({ batters: [{ personId, batsThrows }], pitcher: { name, personId?, batsThrows } }),
 * `probables` = the probable-pitchers feed ({ home: { id, fullName } }), used
 * for a starter the box score has not listed yet.
 */
export async function hydrateLineupHands(sides, probables = {}, { getHands = getMlbPeopleHands } = {}) {
  const pitcherId = (key) => {
    const p = sides?.[key]?.pitcher;
    if (!p) return null;
    if (p.personId != null) return p.personId;
    const probable = probables?.[key];
    return probable?.id != null && probable?.fullName === p.name ? probable.id : null;
  };
  const need = [];
  for (const key of ['home', 'away']) {
    for (const b of sides?.[key]?.batters || []) if (unknownBat(b.batsThrows) && b.personId != null) need.push(b.personId);
    const pid = pitcherId(key);
    if (pid != null && unknownThrow(sides[key].pitcher.batsThrows)) need.push(pid);
  }
  if (!need.length) return 0;
  const hands = await getHands(need).catch(() => new Map());
  let filled = 0;
  for (const key of ['home', 'away']) {
    for (const b of sides?.[key]?.batters || []) {
      const h = b.personId != null ? hands.get(b.personId) : null;
      if (h && unknownBat(b.batsThrows)) { b.batsThrows = `${h.bat}/${h.throw}`; filled++; }
    }
    const pid = pitcherId(key);
    const h = pid != null ? hands.get(pid) : null;
    const p = sides?.[key]?.pitcher;
    if (h && p && unknownThrow(p.batsThrows)) {
      const bat = String(p.batsThrows || '').split('/')[0];
      p.batsThrows = `${bat && bat !== '?' ? bat : h.bat}/${h.throw}`;
      filled++;
    }
  }
  return filled;
}
