/**
 * RATIONALE LANES (founder GO, Sep 1 2026 — "measure, so we stop guessing"):
 * read each graded rationale AFTER the fact and record which desk lanes it
 * leaned on. Nothing here is ever shown to Gary and nothing asks him to cite
 * anything — the rationale stays his organic reasons; this is the ledger
 * reading it the way a person would, so coaching runs on evidence.
 *
 * Lanes are named for the desk section they come from. The patterns are the
 * ones used in the Sep 1 hand audit of the Aug 28-31 book (58 MLB picks).
 */

export const LANES = [
  ['bullpen_any', /bullpen|relief|relievers/i],
  ['bullpen_season_unit', /full season|current (bullpen|relie|arms|group)|pen as a unit|season(-long)? (bullpen|relief)/i],
  ['bullpen_recent_days', /last (five|seven|ten|5|7|10) days/i],
  ['bullpen_named_separator', /(separat|decisive|clearest|foundation of the (bet|ticket))/i],
  ['team_season_line', /(runs per game|R\/G|season OPS|\.\d{3} OPS)/i],
  ['handedness_split', /(against|vs\.?) (left|right)-hand|OPS (to|against) (left|right)/i],
  ['lineup_hand_count', /(starts?|sends?|counter\w*)[^.]*\b(left|right)-handed (hitters|bats|batters)/i],
  ['starter_last_three', /last three|last 3 starts/i],
  ['starter_home_road', /(home|road) ERA/i],
  ['starter_last_start', /(latest|last) (start|outing)|last time out|his (last|latest) (start|outing)/i],
  ['run_differential', /run differential/i],
  ['fielding', /fielding percentage|errors\b/i],
  ['contact_quality', /barrel|hard-hit|hard contact|whiff|xwOBA/i],
  ['player_rolling', /last (7|15|seven|fifteen) days|over the last (7|15)/i],
  ['injury_absence', /injur|absence|placed on|returning from|returns? (with|from)|scratch/i],
  ['weather_park', /wind|°F|roof|degree|sunny|cloudy|clear|pitcher-friendly|hitter-friendly|dome/i],
  ['streak_series_scene', /straight|streak|swept|sweep|(won|lost|taken) (the )?first two|opener|finale|rubber match/i],
  ['season_series_h2h', /season series|season-series|this series/i],
  ['story_or_press', /as written|as reported|described|reports?\b|beat writer|quote|said\b/i],
  ['box_score_detail', /scoring play|box score|in the (first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)/i],
  ['price_as_value', /(too expensive|worth|value|price (is|reflects)|plus money|at \+|inflated|the number)/i],
  ['ml_vs_rl_choice', /(away from|off|instead of|rather than|not) (laying|the run line|-1\.5|requiring)/i],
  ['discounts_momentum', /not momentum|not the (handicap|bet|foundation)|set(ting)? the streaks aside|does not decide|do not determine|not predictive/i],
  ['schedule_rest', /day off|off day|rest|travel|doubleheader|getaway|road trip|homestand/i],
  ['line_history', /line (history|moved|movement)|opened at|first seen/i],
];

/** Lane keys present in one rationale. */
export function tagRationale(text) {
  const t = String(text || '');
  return LANES.filter(([, rx]) => rx.test(t)).map(([key]) => key);
}

/** fav | dog | pick-em | unknown — from the pick's own side price on the board. */
export function sideOfPick(pick) {
  const team = String(pick.pick || '').split(' ML')[0].split(' -1.5')[0].split(' +1.5')[0].trim();
  const isHome = team === pick.homeTeam;
  const priced = (v) => (v == null || v === '' ? NaN : Number(v));
  const mine = priced(isHome ? pick.moneylineHome : pick.moneylineAway);
  const theirs = priced(isHome ? pick.moneylineAway : pick.moneylineHome);
  if (!Number.isFinite(mine) || !Number.isFinite(theirs)) return 'unknown';
  if (mine < theirs) return 'fav';
  if (mine > theirs) return 'dog';
  return 'pick-em';
}

/** One ledger row from a stored pick + its graded result (result may be null). */
export function laneRowFor(gameDate, pick, result) {
  const odds = Number(pick.odds);
  return {
    game_date: gameDate,
    league: String(pick.league || pick.sport || ''),
    game_id: String(pick.game_id ?? ''),
    pick_text: String(pick.pick || ''),
    bet_type: pick.type || null,
    odds: Number.isFinite(odds) ? odds : null,
    side: sideOfPick(pick),
    result: result?.result ?? null,
    prompt_sha: pick.prompt_sha || null,
    lanes: tagRationale(pick.rationale),
    rationale_chars: String(pick.rationale || '').length,
  };
}

/** Summary table: per lane, picks citing it and their record. */
export function summarizeLanes(rows) {
  const graded = rows.filter((r) => r.result === 'won' || r.result === 'lost');
  const out = [];
  for (const [key] of LANES) {
    const xs = graded.filter((r) => r.lanes.includes(key));
    const w = xs.filter((r) => r.result === 'won').length;
    out.push({ lane: key, cited: rows.filter((r) => r.lanes.includes(key)).length, of: rows.length, record: `${w}-${xs.length - w}` });
  }
  return out;
}
