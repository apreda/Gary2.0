// Tonight's nine, as roster entries (MLBAM ids), in batting order. The June
// desk's expected-vs-actual block read the first four roster hitters, which
// are alphabetical: on Sep 23 it showed Valencia, Callahan and Ortiz, none
// of them starting, and 2 of Detroit's 9 starters. The confirmed lineup names
// the hitters; the roster carries the ids the Savant rows are keyed by.

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

/** Lineup hitters matched to roster entries; the roster's first four when no lineup is posted. */
export function lineupRosterHitters(lineup, roster) {
  const pool = (roster || []).filter((p) => p.positionType !== 'Pitcher');
  if (!lineup?.batters?.length) return pool.slice(0, 4);
  return lineup.batters.map((b) => pool.find((p) => fold(p.name) === fold(b.name))).filter(Boolean);
}
