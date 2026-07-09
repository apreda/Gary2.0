/**
 * teamMatch.js — which side of a game a pick text refers to.
 *
 * Two teams can SHARE a token, most notoriously the mascot: "Boston Red Sox" and
 * "Chicago White Sox" both end in "Sox". Matching each side with
 * `pick.includes(mascot) || pick.includes(fullName)` lets a shared mascot flag BOTH
 * sides, and the grader's "default to home" fallback then INVERTS away-team picks
 * (Jul 8 2026: "Red Sox ML" graded a 5-0 Red Sox win as a loss). pickSide() decides the
 * side using ONLY the tokens that DISTINGUISH the two teams, so a shared name can never
 * flip the result. Mirror of supabase/functions/grade-results/grading.ts (Deno copy).
 */

// Alphanumeric tokens of a team name ("Chicago White Sox" -> ["chicago","white","sox"]).
function teamWords(name) {
  return String(name).toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, '')).filter(Boolean);
}

// Does `hay` contain `token` as a STANDALONE token (not a substring of a longer word)?
function hasToken(hay, token) {
  if (!token) return false;
  return new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`, 'i').test(hay);
}

/**
 * @returns {'home'|'away'|null} the side the pick is on, or null if undetermined.
 */
export function pickSide(pickText, homeTeam, awayTeam) {
  const pick = String(pickText ?? '').toLowerCase();
  const hFull = String(homeTeam ?? '').toLowerCase().trim();
  const aFull = String(awayTeam ?? '').toLowerCase().trim();

  // 1) Whole team name in the pick text — unambiguous when it lands on exactly one side.
  const homeFull = !!hFull && pick.includes(hFull);
  const awayFull = !!aFull && pick.includes(aFull);
  if (homeFull && !awayFull) return 'home';
  if (awayFull && !homeFull) return 'away';

  // 2) Otherwise match on the words UNIQUE to each team. A token they SHARE ("sox",
  //    "united", "city") can never decide the side, so it is dropped from both.
  const hWords = teamWords(hFull), aWords = teamWords(aFull);
  const shared = new Set(hWords.filter((w) => aWords.includes(w)));
  const homeHit = hWords.some((w) => !shared.has(w) && hasToken(pick, w));
  const awayHit = aWords.some((w) => !shared.has(w) && hasToken(pick, w));
  if (homeHit && !awayHit) return 'home';
  if (awayHit && !homeHit) return 'away';

  return null; // no distinguishing token present, or both matched — caller decides
}
