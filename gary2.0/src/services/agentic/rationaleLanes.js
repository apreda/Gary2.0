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
  ['weather_park', /\bwind\b|°F|\broof\b|degree|sunny|cloudy|\bclear\b|pitcher-friendly|hitter-friendly|\bdome\b/i],
  ['streak_series_scene', /straight|streak|swept|sweep|(won|lost|taken) (the )?first two|opener|finale|rubber match/i],
  ['season_series_h2h', /season series|season-series|this series/i],
  ['story_or_press', /as written|as reported|described|reports?\b|beat writer|quote|said\b/i],
  ['box_score_detail', /scoring play|box score|in the (first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)/i],
  ['price_as_value', /(too expensive|worth|value|price (is|reflects)|plus money|at \+|inflated|the number)/i],
  ['ml_vs_rl_choice', /(away from|off|instead of|rather than|not) (laying|the run line|-1\.5|requiring)/i],
  ['discounts_momentum', /not momentum|not the (handicap|bet|foundation)|set(ting)? the streaks aside|does not decide|do not determine|not predictive/i],
  ['schedule_rest', /day off|off day|\brest\b|\brested\b|\btravel\b|doubleheader|getaway|road trip|homestand/i],
  ['line_history', /line (history|moved|movement)|opened at|first seen/i],
  // THE TALLY DEVICE (Sep 2 2026): the closing line of a card decided by
  // adding up who is better rather than by how tonight's game goes — the
  // shape of the five Sep 1 losses. Measured, never shown to Gary.
  ['tally_device', /more reliable paths?|sturdier path|stronger (season-long |overall )?foundation|deeper season-long|larger body of work|broader (matchup |season )?profile|more ways to (win|finish|survive)|better team overall|the better club/i],
  // Football lanes (Sep 1 2026) — the desk sections a football rationale cites.
  ['fb_quarterback', /quarterback|\bQB\b|passer|under center/i],
  ['fb_epa_success', /\bEPA\b|success rate|yards per play|explosive/i],
  ['fb_pressure_trenches', /pressure rate|sack|pass protection|offensive line|defensive line|trench/i],
  ['fb_injury_report', /questionable|doubtful|out for|inactive|injury report/i],
  ['fb_spread_key_number', /key number|\bhook\b|cover(ed|ing)? the (spread|number)|by more than|within the number/i],
];

const FOOTBALL_LEAGUES = new Set(['NFL', 'NCAAF']);

/** Lane keys present in one rationale. Football lanes (fb_*) apply only to
 * football rationales — "questionable" and "explosive" are baseball words too. */
export function tagRationale(text, league = '') {
  const t = String(text || '');
  const football = FOOTBALL_LEAGUES.has(String(league || '').toUpperCase());
  return LANES
    .filter(([key, rx]) => (football || !key.startsWith('fb_')) && rx.test(t))
    .map(([key]) => key);
}

/** The club named on the ticket. */
export function pickTeam(pick) {
  return String(pick.pick || '').split(' ML')[0].split(' -1.5')[0].split(' +1.5')[0].trim();
}

/** true = the ticket is the home side, false = away, null = unrecognised. */
export function pickIsHome(pick) {
  const team = pickTeam(pick);
  if (team && team === pick.homeTeam) return true;
  if (team && team === pick.awayTeam) return false;
  return null;
}

/** fav | dog | pick-em | unknown — from the pick's own side price on the board. */
export function sideOfPick(pick) {
  const team = pickTeam(pick);
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
    lanes: tagRationale(pick.rationale, pick.league || pick.sport),
    rationale_chars: String(pick.rationale || '').length,
    // THE CASES (Sep 2 2026): both Pass 1 cases tagged the same way, and
    // which side the ticket took — so the ledger can say what the picked
    // case and the other case leaned on, not just the card.
    pick_is_home: pickIsHome(pick),
    case_home_lanes: tagRationale(pick.path_home, pick.league || pick.sport),
    case_away_lanes: tagRationale(pick.path_away, pick.league || pick.sport),
    case_home_chars: String(pick.path_home || '').length,
    case_away_chars: String(pick.path_away || '').length,
    // THE CASE ORDER (Sep 2 2026): which club's case was written last,
    // stamped by the runner; null before the alternation shipped.
    case_last: pick.case_last ?? null,
  };
}

/**
 * Did the bet follow the case written last? Rows with a known side and a
 * stamped case order only. `byLast` splits the tally by which club's case
 * came last, so a home/away lean and a last-case lean can be told apart.
 */
export function summarizeCaseOrder(rows) {
  const xs = rows.filter((r) => (r.pick_is_home === true || r.pick_is_home === false) && (r.case_last === 'home' || r.case_last === 'away'));
  const rec = (arr) => {
    const g = arr.filter((r) => r.result === 'won' || r.result === 'lost');
    const w = g.filter((r) => r.result === 'won').length;
    return `${w}-${g.length - w}`;
  };
  const pickedLast = xs.filter((r) => (r.pick_is_home ? 'home' : 'away') === r.case_last);
  const pickedFirst = xs.filter((r) => (r.pick_is_home ? 'home' : 'away') !== r.case_last);
  const byLast = {};
  for (const side of ['home', 'away']) {
    const sub = xs.filter((r) => r.case_last === side);
    byLast[side] = { n: sub.length, pickedLast: sub.filter((r) => (r.pick_is_home ? 'home' : 'away') === side).length };
  }
  return { n: xs.length, pickedLast: pickedLast.length, pickedLastRecord: rec(pickedLast), pickedFirst: pickedFirst.length, pickedFirstRecord: rec(pickedFirst), byLast };
}

/**
 * The cases beside the card: per lane, how many picked-side cases and
 * other-side cases carried it, and the record of picks whose picked-side
 * case carried it. Rows without a recognisable side are skipped.
 */
export function summarizeCaseLanes(rows) {
  const sided = rows.filter((r) => r.pick_is_home === true || r.pick_is_home === false);
  const pickedOf = (r) => (r.pick_is_home ? r.case_home_lanes : r.case_away_lanes) || [];
  const otherOf = (r) => (r.pick_is_home ? r.case_away_lanes : r.case_home_lanes) || [];
  const out = [];
  for (const [key] of LANES) {
    const picked = sided.filter((r) => pickedOf(r).includes(key));
    const other = sided.filter((r) => otherOf(r).includes(key));
    const graded = picked.filter((r) => r.result === 'won' || r.result === 'lost');
    const w = graded.filter((r) => r.result === 'won').length;
    out.push({ lane: key, card: rows.filter((r) => r.lanes.includes(key)).length, pickedCase: picked.length, otherCase: other.length, of: sided.length, record: `${w}-${graded.length - w}` });
  }
  return out;
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
