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

/**
 * Find the game a pick refers to, and whether the pick's home/away labels are
 * reversed relative to the provider's.
 *
 * ── The Jul 15 2026 "swapped-by-default" bug this fixes ──────────────────────
 * When matching by game_id (the trusted path — "eliminates all ambiguity" per
 * the original comment), the code used to sanity-check the ID match against
 * the provider's home-team NAME: if the names didn't line up, it assumed the
 * pick had home/away reversed and flipped the scores to compensate. That's a
 * reasonable check for a normal game with a real team name — but for a
 * synthetic/exhibition game (e.g. the All-Star Game), the provider's
 * home_team/away_team objects can be unpopulated placeholders (literally
 * named "Unknown"). "unknown" never contains "nl" or "al", so the check
 * always concluded "swapped" — inverting the score attribution regardless of
 * the TRUE orientation. Live fallout: "NL ML -134" (NL actually lost 4-0)
 * graded WON, because AL's real 4 runs got attributed to NL and NL's real 0
 * got attributed to AL.
 *
 * Fix: an ID match is already unambiguous — that's the whole point of
 * matching by ID. Only mark `swapped` when the provider's name gives an
 * ACTUAL, readable signal that contradicts the pick's home team; an
 * unreadable/placeholder name is not evidence of anything, so it must not
 * flip the result. Trust the pick's own labeling by default.
 *
 * IDs belong to the supplied provider: an explicit ID miss must never fall
 * through to a different game with the same teams. ID-less legacy picks need
 * one candidate with an unambiguous home/away orientation.
 *
 * @returns {{game: object, swapped: boolean}|null}
 */
export function matchGame(games, h, v, gameId) {
  const id = String(gameId ?? '').trim();
  if (id) {
    const byId = games.filter((g) => g?.id != null && String(g.id).trim() === id);
    if (byId.length !== 1) return null;
    const game = byId[0];
    const rawHome = game.home_team?.full_name || game.home_team?.name || '';
    // An unrelated or unreadable provider label is not evidence of reversal.
    const swapped = normalizeTeamName(rawHome) !== 'unknown' && pickSide(rawHome, h, v) === 'away';
    return { game, swapped };
  }

  if (!hasDistinctTeamNames(h, v)) return null;
  const candidates = legacyGameCandidates(games, h, v);
  return candidates.length === 1 && candidates[0].swapped !== null ? candidates[0] : null;
}

/**
 * Teams and date alone cannot ground a score for a missing exact ID or an
 * ambiguous provider matchup. Keep only the legacy, provider-absent fallback;
 * a known provider game with missing scores also remains pending.
 */
export function canGroundGameScore(games, h, v, gameId) {
  return !String(gameId ?? '').trim() && hasDistinctTeamNames(h, v)
    && legacyGameCandidates(games, h, v).length === 0;
}

function legacyGameCandidates(games, h, v) {
  const hn = normalizeTeamName(h), vn = normalizeTeamName(v);
  const candidates = [];
  for (const g of games) {
    const gh = normalizeTeamName(g.home_team?.full_name || g.home_team?.name || '');
    const gv = normalizeTeamName(g.visitor_team?.full_name || g.visitor_team?.name || g.away_team?.full_name || g.away_team?.name || '');
    const normal = nameCouldMatch(gh, hn) && nameCouldMatch(gv, vn);
    const reversed = nameCouldMatch(gh, vn) && nameCouldMatch(gv, hn);
    if (!normal && !reversed) continue;
    // Keep shared-mascot candidates in the ambiguity count, but only resolve
    // their orientation from distinguishing names (Red Sox vs White Sox).
    const homeSide = pickSide(gh, h, v), awaySide = pickSide(gv, h, v);
    const swapped = homeSide === 'home' && awaySide === 'away' ? false
      : homeSide === 'away' && awaySide === 'home' ? true : null;
    candidates.push({ game: g, swapped });
  }
  return candidates;
}

function nameCouldMatch(providerName, storedName) {
  return !!providerName && !!storedName && (
    ` ${providerName} `.includes(` ${storedName} `)
    || hasToken(providerName, teamWords(storedName).at(-1))
  );
}

function hasDistinctTeamNames(h, v) {
  const hn = normalizeTeamName(h), vn = normalizeTeamName(v);
  return !!hn && !!vn && hn !== vn && hn !== 'unknown' && vn !== 'unknown';
}

function normalizeTeamName(name) {
  return String(name ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}
