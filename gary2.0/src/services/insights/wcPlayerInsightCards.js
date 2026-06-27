// gary2.0/src/services/insights/wcPlayerInsightCards.js
//
// Builds "Player Insight Cards" for the 2026 FIFA World Cup — the soccer twin of
// playerInsightCards.js (MLB). ONE pack per CONFIRMED STARTER across the day's WC
// matches (the starting XI from BDL FIFA /match_lineups), so the iOS Hub's
// full-breakdown view has a tappable card for every player on the pitch.
//
// GROUNDING IS THE ONLY RULE. Every field is sourced from real, verifiable data:
//   * Starter set + position  -> BDL FIFA getMatchLineups([matchId])
//       rows { team_id, is_starter, position, shirt_number, player:{id,name} }
//   * International season line + splits -> API-Football getSquadStats(teamName),
//       keyed by LOWERCASED player name -> { name, goals, assists, appearances,
//       shots, shots_on, position, + (NEW) saves, conceded, keyPasses,
//       passAccuracy, duelsTotal, duelsWon, tackles, yellow, red, minutes, rating }.
//       This is the player's CURRENT INTERNATIONAL cycle (qualifiers + friendlies +
//       Nations League) — labeled as caps, NEVER as club stats (there is NO club
//       fetcher). The season line + splits are ROLE-TAILORED (forward / midfielder /
//       defender / keeper) off these grounded numbers; the iOS container is fixed
//       (PlayerCardV4 reads PlayerInsightPack), so only WHICH numbers fill
//       season/splits/strengths varies by role — no new Swift fields.
//   * Per-player xG / xA / big-chance / progressive passes do NOT exist in
//       API-Football's player object (team-level only via getRecentTeamStats), so
//       "finishing regression (goals vs xG)" + xA are DROPPED at the player card.
//       The keeper's true save% (saves/(saves+conceded)) replaces "goals-vs-xG".
//       Team xG context lives in the Hub's wcXgRegression lane (team-level).
//   * Nation recent form (L5) -> API-Football getRecentForm(teamName)
//   * Tonight's lines        -> BDL FIFA getPlayerProps({matchId}) joined by
//       player_id (rows carry NO name): anytime_goal / shots / shots_on_target,
//       ONE preferred vendor per player.
//   * Prop hit rates + last-match form rows -> BDL FIFA getPlayerMatchStats over
//       the player's PRIOR COMPLETED matches (goals + shots_on_target are the only
//       per-match fields available; a non-scorer's goals come back null).
//
// Defensive contract (house rules, identical to the MLB twin): NEVER throws. Any
// missing data source skips that section (the field is simply omitted — iOS
// treats every field as optional). A starter we cannot place is skipped with a
// warn. Copy is plain/factual — no hype, no bet instructions.
//
// ANTI-FABRICATION (hard rules enforced below):
//   - A non-scorer's null stat is NOT 0. We never coerce null->0 as a displayed
//     stat. getSquadStats returns the source's real cycle totals (its own ?? 0
//     contract) for goals/assists/appearances; shots/shots_on are nullable and
//     omitted when absent. Per-match shots_on_target is omitted when null.
//   - Per-match form rows are built ONLY for a full-shift starter (non-null
//     minutes_played at/above the floor) — a sub's partial line never ships.
//   - Props are goal / shots / shots-on-target ONLY (no assists/saves invented),
//     and we never synthesize a "consensus" line across books — ONE vendor.
//   - No baseball-only fields (xstats/bvp/pitchMatchup/venue/hand) — absent.

import {
  num, asArray, dedupeCap, nameKey,
  formatProps, attachPropRates, safeCall as safeCallShared,
} from './shared.js';
import * as apiFootball from '../apiFootballService.js';
import { previousXI } from './computers/wcConfirmedXI.js';

// Thin local binding so every safeCall() site carries a '[wcPlayerInsightCards]'
// error prefix while reusing the shared implementation.
const safeCall = (fn, fallback) => safeCallShared(fn, fallback, 'wcPlayerInsightCards');

// ─────────────────────────────────────────────────────────────────────────────
// Tunables
// ─────────────────────────────────────────────────────────────────────────────

const MAX_PROPS = 3;            // anytime_goal / shots / shots_on_target
const MAX_STRENGTHS = 3;
const MAX_WEAKNESSES = 3;
const DEFAULT_SEASON = 2026;   // WC season (for the projected-XI regulars fetch)

// Prop-odds SANITY band. The FIFA player-prop feed (getPlayerProps) returns raw
// vendor odds that — unlike the moneyline/spread/total path — never pass through
// the service's cleanOdds() sentinel scrub, so a malformed/scaled milestone price
// (e.g. an "Anytime goal +70000", a 700:1 line that is a feed artifact, not a real
// market) can leak straight onto the card. We drop any prop whose American odds
// fall outside a realistic band: longer than a true longshot (+2000 ≈ 4.8% implied)
// or more juiced than a deep favorite (-10000 ≈ 99% implied). This is a junk-value
// guard, NOT Gary's pick-selection band (propOddsService is far tighter) — the card
// just must never SURFACE a garbage number.
const PROP_ODDS_MAX = 2000;     // drop anything longer than +2000
const PROP_ODDS_MIN = -10000;   // drop anything more juiced than -10000

// A card resting on only this many international caps (or fewer) is a small sample —
// flag it so a bettor isn't misled by e.g. "95% pass accuracy" off 2 games.
const SMALL_SAMPLE_CAPS = 2;

// A confirmed XI lists 11 starters per side; require a side to reach this before
// we treat the lineup as posted (a half-populated sheet would mislabel benchers).
const XI_MIN_STARTERS = 11;

// Per-match form rows + prop rates read the player's PRIOR completed matches.
const FORM_MIN_MINUTES = 60;    // "full shift" floor for a per-match form row
const RATE_WINDOW = 6;          // prop hit-rate window (recent WC matches)
const RATE_MIN_ROWS = 2;        // need >= 2 prior finals to publish a rate

// Single-book quote preference. ONE vendor per player (never a synthesized
// consensus): take the first present in this order. DraftKings first, then
// BetRivers, then BetMGM as a final fallback so a player only quoted on a
// secondary sharp book still gets a real (single-book) line rather than none.
const PROP_VENDORS = ['draftkings', 'betrivers', 'betmgm'];

// Trackable prop types (also the display order). "shots" stays trackable for the
// CARD (line + odds), but has no per-match extractor in getPlayerMatchStats
// (total shots isn't a field there), so it simply ships rate-less — fail closed,
// exactly like an untrackable MLB type. Likewise assists / saves / cards have no
// per-match field, so they ship line+odds only (rate-less), like MLB's walks.
const PROP_PRIORITY = ['anytime_goal', 'shots', 'shots_on_target'];

// Role-tailored ANGLE markets (display order). Only types in the role's list are
// shown (an out-of-role market is dropped, never quoted) and only the first
// MAX_PROPS survive. anytime_goal + shots_on_target keep their per-match rates;
// assists / saves / cards ship rate-less (line+odds only).
const PROP_PRIORITY_BY_ROLE = {
  // Forwards/wingers are the scoring role — lead with the goal market.
  forward:    ['anytime_goal', 'shots', 'shots_on_target'],
  // ROLE-FIT (Jun 26): a midfielder — especially a holding/deep-lying one — is a low
  // anytime-goal threat, so leading his angle with "Anytime goal" misleads. Lead with
  // the markets that fit the job (assists, shots on target) and demote anytime_goal to
  // last so it only shows when nothing more on-role is posted.
  midfielder: ['assists', 'shots_on_target', 'anytime_goal'],
  // A defender's on-role markets are cards (he commits fouls) and the set-piece SoT
  // threat; anytime_goal is demoted to last (a centre-back rarely scores from open play).
  defender:   ['cards', 'shots_on_target', 'anytime_goal'],
  keeper:     ['saves'],
};
const propPriorityByRole = (role) => PROP_PRIORITY_BY_ROLE[role] || PROP_PRIORITY;

// ─────────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build WC player insight card packs for a day's slate.
 *
 * @param {object} args
 * @param {string} args.date         YYYY-MM-DD (ET slate day)
 * @param {string} args.league       'WC'
 * @param {Array}  args.connections  the day's stored insight rows (unused here; the
 *                                   candidate set is the confirmed XI, not the edge subset)
 * @param {Array}  args.matches      the day's BDL FIFA matches (getMatchesForDate shape)
 * @returns {Promise<Array<{date,league,player_id,player_name,team_abbr,game_id,payload}>>}
 */
export async function buildWcPlayerInsightCards({ date, league, matches } = {}) {
  if (String(league || '').toUpperCase() !== 'WC') return [];

  const wc = await loadFifa();
  if (!wc) return [];

  const slate = Array.isArray(matches) ? matches.filter(Boolean) : [];
  if (!slate.length) {
    console.log('[wcPlayerInsightCards] empty WC slate — nothing to build.');
    return [];
  }

  const packs = [];
  const stats = { matches: 0, starters: 0, built: 0, keeper: 0, outfield: 0, skipped: 0, projectedMatches: 0, confirmedMatches: 0 };

  for (const match of slate) {
    const matchId = match?.id ?? match?.soccer_match_id ?? null;
    if (matchId == null) { continue; }
    stats.matches += 1;

    // team_id -> { name, abbr, isHome, oppId } (needed for both the confirmed-XI
    // side check and the projected-XI regulars fetch below).
    const teamMeta = buildTeamMeta(match);

    // 1. Starting XI: prefer the CONFIRMED sheet (posts ~90 min before kickoff). When
    // it's not posted/full yet, fall back to the PROJECTED XI — each side's recent
    // regulars (OUT/suspended dropped), the SAME projection the field view shows — so
    // a card populates in the morning. A later run upgrades it to the confirmed build.
    const lineups = await safeCall(() => wc.getMatchLineups([matchId]), []);
    let starters = asArray(lineups).filter((l) => l?.is_starter && l?.player?.id != null);
    let xiSource = 'confirmed';

    // Require a real XI on at least one side before trusting the live sheet.
    const sideCount = (rows) => {
      const per = {};
      for (const s of rows) per[s.team_id] = (per[s.team_id] || 0) + 1;
      return per;
    };
    const confirmedFull = Object.values(sideCount(starters)).some((c) => c >= XI_MIN_STARTERS);

    if (!confirmedFull) {
      const projected = await projectedStarters(match, teamMeta);
      if (projected.length) {
        starters = projected;
        xiSource = 'projected';
        console.log(`[wcPlayerInsightCards] match ${matchId}: no confirmed XI yet — using projected XI (${projected.length} starters).`);
      } else if (!starters.length) {
        console.log(`[wcPlayerInsightCards] match ${matchId}: no confirmed XI + no projection available — skipping.`);
        continue;
      } else {
        // Partial confirmed sheet, no projection — keep what's confirmed (better than nothing).
        console.log(`[wcPlayerInsightCards] match ${matchId}: partial confirmed XI (${starters.length} starters), no projection — building what's posted.`);
      }
    }

    // 2. Per-match shared reads (one fetch each, reused across this match's starters).
    const props = await safeCall(() => wc.getPlayerProps({ matchId }), []);
    const squadByTeam = await loadSquads(teamMeta);               // team_id -> getSquadStats map
    const formByTeam = await loadForms(teamMeta);                 // team_id -> getRecentForm result
    const histByPlayer = await loadPriorMatchHistory(wc, match, teamMeta); // player_id -> [finals stat rows, oldest->newest]
    const gameLabel = matchAbbrLabel(match);
    if (xiSource === 'projected') stats.projectedMatches += 1; else stats.confirmedMatches += 1;

    for (const starter of starters) {
      stats.starters += 1;
      try {
        const pack = buildOnePack({
          starter, match, matchId, gameLabel,
          teamMeta, props, squadByTeam, formByTeam, histByPlayer,
        });
        if (!pack) { stats.skipped += 1; continue; }
        if (pack.payload.type === 'keeper') stats.keeper += 1; else stats.outfield += 1;
        stats.built += 1;
        packs.push({
          date,
          league: 'WC',
          player_id: String(starter.player.id),
          player_name: pack.payload.name || null,
          team_abbr: pack.payload.team || null,
          game_id: String(matchId),
          payload: pack.payload,
        });
      } catch (err) {
        stats.skipped += 1;
        console.error(`[wcPlayerInsightCards] player ${starter?.player?.id} error:`, err?.message || err);
      }
    }
  }

  console.log(
    `[wcPlayerInsightCards] ${stats.matches} match(es) (${stats.confirmedMatches} confirmed / ${stats.projectedMatches} projected), ` +
      `${stats.starters} starters -> built ${stats.built} (${stats.outfield} outfield / ${stats.keeper} keeper), skipped ${stats.skipped}.`,
  );
  return packs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-player pack assembly
// ─────────────────────────────────────────────────────────────────────────────

function buildOnePack(ctx) {
  const { starter, matchId, gameLabel, teamMeta, props, squadByTeam, formByTeam, histByPlayer } = ctx;

  const playerId = String(starter.player.id);
  const name = starter.player.name || 'Player';
  const teamId = starter.team_id;
  const meta = teamMeta.get(teamId) || {};
  const position = normalizePosition(starter.position || starter.player.position);
  const isKeeper = isGoalkeeper(starter.position || starter.player.position);
  // Outfield sub-role drives WHICH grounded numbers fill season/splits/strengths.
  // (The iOS container is fixed; only the field contents vary by role.)
  const role = isKeeper ? 'keeper' : outfieldRole(position);

  const payload = { type: isKeeper ? 'keeper' : 'outfield', name, game: gameLabel };
  if (meta.abbr) payload.team = meta.abbr;
  if (position) payload.position = position;
  // Role-aware title for the stats block, so iOS can render a soccer-appropriate
  // section header ("FINISHING" / "ON THE BALL" / "AT THE BACK" / "IN GOAL") in
  // place of the MLB "Splits". iOS reads this field; MLB cards never carry it, so
  // MLB keeps "Splits" untouched.
  payload.statsSectionTitle = statsSectionTitleForRole(role);

  // Opponent = the OTHER nation (no "hand" concept in soccer — leave it absent).
  const opp = meta.oppId != null ? teamMeta.get(meta.oppId) : null;
  if (opp?.name) payload.opponent = { name: opp.name };

  // Team-level form context, shared across splits/strengths:
  //   ownForm = this nation's recent fixtures (clean sheets, GA/gm)
  //   oppForm = the opponent nation's recent fixtures (their attack — keeper context)
  const ownForm = formByTeam.get(teamId) || null;
  const oppForm = meta.oppId != null ? (formByTeam.get(meta.oppId) || null) : null;

  // International season line + splits, from this team's squad map (joined id->name).
  // ROLE-TAILORED: a forward shows G/A/SH + conversion; a midfielder key passes +
  // duels; a defender duels/tackles/discipline/clean sheets; a keeper save%/CS.
  const squad = squadByTeam.get(teamId) || {};
  const sstat = lookupSquadStat(squad, name);
  if (!sstat) {
    // No international-cycle row (API-Football is thin for some nations, e.g. South
    // Korea / Qatar). Fall back to a self-aggregated TOURNAMENT-to-date line from this
    // player's OWN prior WC match stats — labeled "this tournament," NEVER as caps.
    // (BDL's /rosters 2026 aggregates are all-zero, so those are not usable here.)
    const tour = tournamentSeasonLine(histByPlayer.get(playerId));
    if (tour) {
      payload.season = tour;
    } else {
      console.warn(`[wcPlayerInsightCards] squad-join MISS: "${name}" (${meta.name || teamId}) — no intl row + no tournament minutes; season omitted.`);
    }
  } else {
    const season = seasonDisplayByRole(sstat, role, { ownForm });
    if (season) payload.season = season;
    const splits = seasonSplitsByRole(sstat, role, { meta, opp, ownForm, oppForm });
    if (splits.length) payload.splits = splits;
    // SMALL-SAMPLE TELL: when the whole stats block rests on <= 2 caps, a rate like
    // "95% pass accuracy" off 2 games is noise — flag it so the bettor isn't misled.
    const caps = num(sstat.appearances);
    if (caps != null && caps > 0 && caps <= SMALL_SAMPLE_CAPS) {
      payload.smallSample = `Small sample — ${caps} ${caps === 1 ? 'cap' : 'caps'} this cycle`;
    }
  }

  // Nation recent form (L5) — the team-level signal that applies to every starter.
  const form = nationForm(ownForm, meta.name);
  if (form) payload.form = form;

  // Tonight's lines for this player: ONE vendor, joined by player_id, reusing the
  // shared formatProps for label/line/odds + dedupe + cap. The ANGLE markets are
  // role-tailored: forwards/wingers -> goal/shots/SoT; midfielders -> goal/assists/
  // SoT; defenders -> goal/SoT/cards; keepers -> saves. assists/saves/cards have no
  // per-match extractor in getPlayerMatchStats, so they ship rate-less (line+odds
  // only), exactly like MLB's walks.
  const propPriority = propPriorityByRole(role);
  const vendorRows = pickVendorRows(props, playerId, propPriority);
  // SANITY CAP: pre-filter the raw vendor rows so a junk/scaled milestone price
  // (e.g. "+70000") never even survives selection — it's dropped, not flagged, so
  // the card always carries either a real number or no odds at all.
  const sanedRows = sanePropRows(vendorRows);
  const formatted = formatProps(sanedRows, playerId, propPriority, { labelFor: propLabel, maxProps: MAX_PROPS });
  if (formatted.length) payload.props = formatted;

  // Prior-match history (finals only) -> prop hit rates + last-match form rows.
  const history = asArray(histByPlayer.get(playerId)); // oldest -> newest
  const formRows = lastMatchFormRowsByRole(history, role);
  if (formRows.length) payload.formRows = formRows;
  // anytime_goal is a yes/no market, so "0/2 over" reads wrong — phrase it as
  // "scored 0 of 2". shots_on_target is a true over/under, so it keeps "over".
  attachPropRates(formatted, history, RATE_STAT, {
    window: RATE_WINDOW, minRows: RATE_MIN_ROWS, phraseFor: propRatePhrase,
  });

  // Deterministic, plain-copy strengths / weaknesses derived from the above.
  const { strengths, weaknesses } = strengthsWeaknesses({ sstat, form, formRows, role, ownForm, oppForm, meta });
  if (strengths.length) payload.strengths = strengths;
  if (weaknesses.length) payload.weaknesses = weaknesses;

  return { payload, matchId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * International season line from a getSquadStats row. line1 = goal involvement +
 * (when present) shot volume; line2 = caps. goals/assists are the source's real
 * cycle totals; shots are omitted when the source has none (never coerced to 0).
 * e.g. line1 "3 G / 0 A / 9 SH", line2 "4 caps".
 */
/** Self-aggregated TOURNAMENT-to-date season line from a player's prior WC match
 *  stat rows — used ONLY when the international squad join misses. Labeled "this
 *  tournament," never relabeled as caps/cycle. null if no completed minutes yet.
 *  A null goals/assists/SoT on a played match means did-not-tally (counts as 0). */
function tournamentSeasonLine(hist) {
  const rows = asArray(hist).filter((r) => num(r?.minutes_played) != null && num(r.minutes_played) > 0);
  if (!rows.length) return null;
  const apps = rows.length;
  const mins = rows.reduce((sum, r) => sum + (num(r.minutes_played) || 0), 0);
  const goals = rows.reduce((sum, r) => sum + (num(r.goals) || 0), 0);
  const assists = rows.reduce((sum, r) => sum + (num(r.assists) || 0), 0);
  const sot = rows.reduce((sum, r) => sum + (num(r.shots_on_target) || 0), 0);
  const bits = [`${goals} G`, `${assists} A`];
  if (sot > 0) bits.push(`${sot} SoT`);
  return { line1: bits.join(' / '), line2: `${apps} app${apps === 1 ? '' : 's'} · ${mins} min, this tournament` };
}

/** Map a readable position label to the outfield sub-role used for tailoring. */
function outfieldRole(position) {
  const p = String(position || '').toLowerCase();
  if (p.startsWith('defend')) return 'defender';
  if (p.startsWith('midfield')) return 'midfielder';
  // Forward / Winger / Attacker / Striker all read as the scoring role; unknown
  // outfielders default to forward (the scoring-tilted, most-generic read).
  return 'forward';
}

/** "{caps} caps" label (or null when caps unknown — never a fabricated 0). */
function capsLabel(caps) { return caps != null ? `${caps} ${caps === 1 ? 'cap' : 'caps'}` : null; }

/** Count this nation's recent fixtures where it kept a clean sheet (ga === 0),
 *  from getRecentForm().fixtures (team-level, grounded). Returns {cs, n} or null. */
function cleanSheetsFromForm(formResult) {
  const fx = asArray(formResult?.fixtures).filter((f) => num(f?.ga) != null);
  if (!fx.length) return null;
  const cs = fx.filter((f) => num(f.ga) === 0).length;
  return { cs, n: fx.length };
}

/** This nation's recent goals-scored-per-match (opponent's attack read for a keeper). */
function gfPerMatch(formResult) {
  const span = formResult?.l5 || formResult?.l10;
  return span ? num(span.gfPerMatch) : null;
}

/**
 * ROLE-TAILORED international season line from a getSquadStats row. The two display
 * rungs map 1:1 onto PlayerCardV4's season.line1 / season.line2 — only the grounded
 * numbers chosen vary by role. Every field is omitted (never coerced to 0) when its
 * source value is null.
 */
function seasonDisplayByRole(s, role, { ownForm } = {}) {
  if (!s) return null;
  const caps = num(s.appearances);
  const out = {};

  if (role === 'keeper') {
    // line1: "{saves} saves / {conceded} GA"  line2: "{caps} caps"
    const saves = num(s.saves);
    const conc = num(s.conceded);
    const p1 = [];
    if (saves != null) p1.push(`${saves} saves`);
    if (conc != null) p1.push(`${conc} GA`);
    if (p1.length) out.line1 = p1.join(' / ');
    // Caps = the keeper's OWN cycle appearances. The team clean-sheet count lives in the
    // splits with its proper "/N" denominator; pairing a bare "5 CS" next to a low cap
    // count (e.g. "1 cap · 5 CS") reads as a contradiction, so line2 is caps only.
    const l2 = [];
    if (caps != null) l2.push(capsLabel(caps));
    if (l2.length) out.line2 = l2.join(' · ');
    return (out.line1 || out.line2) ? out : null;
  }

  const g = num(s.goals);
  const a = num(s.assists);

  if (role === 'midfielder') {
    // line1: "{G} G / {A} A / {KP} KP" (omit KP rung when absent — never 0).
    const kp = num(s.keyPasses);
    const p1 = [];
    if (g != null) p1.push(`${g} G`);
    if (a != null) p1.push(`${a} A`);
    if (kp != null) p1.push(`${kp} KP`);
    if (p1.length) out.line1 = p1.join(' / ');
    // line2: "{caps} caps · {rating} rating"
    const rating = num(s.rating);
    const l2 = [];
    if (caps != null) l2.push(capsLabel(caps));
    if (rating != null) l2.push(`${rating.toFixed(2)} rating`);
    if (l2.length) out.line2 = l2.join(' · ');
    return (out.line1 || out.line2) ? out : null;
  }

  if (role === 'defender') {
    // line1: "{G} G / {A} A" (set-piece threat)  line2: "{caps} caps"
    const p1 = [];
    if (g != null) p1.push(`${g} G`);
    if (a != null) p1.push(`${a} A`);
    if (p1.length) out.line1 = p1.join(' / ');
    if (caps != null) out.line2 = capsLabel(caps);
    return (out.line1 || out.line2) ? out : null;
  }

  // forward / winger: line1 "{G} G / {A} A / {SH} SH"  line2 "{caps} caps"
  const sh = num(s.shots);
  const p1 = [];
  if (g != null) p1.push(`${g} G`);
  if (a != null) p1.push(`${a} A`);
  if (sh != null) p1.push(`${sh} SH`);
  if (p1.length) out.line1 = p1.join(' / ');
  if (caps != null) out.line2 = capsLabel(caps);
  return (out.line1 || out.line2) ? out : null;
}

/**
 * ROLE-TAILORED splits (PlayerCardV4 SPLITS section: LabeledStat label/value/detail).
 * Every rung is omitted when its grounded source value is null — no fabricated 0.
 * Per-player xG / xA / big-chance are NOT groundable (team-level only) so they never
 * appear here; conversion is computed from grounded goals + shots, NOT xG.
 */
function seasonSplitsByRole(s, role, { meta, opp, ownForm, oppForm } = {}) {
  if (!s) return [];
  const caps = num(s.appearances);
  const nation = meta?.name || 'Nation';
  const out = [];

  if (role === 'keeper') {
    const saves = num(s.saves);
    const conc = num(s.conceded);
    if (saves != null && conc != null && (saves + conc) > 0) {
      const faced = saves + conc;
      out.push({ label: 'Save rate', value: `${Math.round((saves / faced) * 100)}%`, detail: `${saves} of ${faced} faced` });
    }
    const csInfo = cleanSheetsFromForm(ownForm);
    if (csInfo) out.push({ label: 'Clean sheets', value: `${csInfo.cs}/${csInfo.n}`, detail: `over ${csInfo.n} recent` });
    // OPPONENT CONTEXT: the attack the keeper is about to face.
    const oppGf = gfPerMatch(oppForm);
    if (oppGf != null && opp?.name) {
      out.push({ label: `vs ${opp.name} attack`, value: `${oppGf} scored/gm`, detail: "opponent's recent scoring" });
    }
    // Form lives in RECENT (payload.form) — do NOT duplicate the nation last-5 here.
    return out;
  }

  if (role === 'midfielder') {
    const kp = num(s.keyPasses);
    // ROLE-FIT: a near-zero key-pass count isn't "Creativity" — omit it rather than
    // dress up "1 key pass over 2 caps" as a creative read. Only surface when there's
    // a meaningful sample of creation (>= 2 key passes).
    if (kp != null && kp >= 2) {
      out.push({ label: 'Creativity', value: `${kp} ${kp === 1 ? 'key pass' : 'key passes'}`, detail: `over ${capsLabel(caps) || 'this cycle'}` });
    }
    const pa = num(s.passAccuracy);
    // API reports 0 when it doesn't track a player's passing; a real value is 40-99%,
    // so floor out the gap rather than surface a bogus "0%".
    if (pa != null && pa >= 40) out.push({ label: 'Pass accuracy', value: `${Math.round(pa)}%` });
    const dt = num(s.duelsTotal);
    const dw = num(s.duelsWon);
    if (dt != null && dw != null && dt > 0) {
      out.push({ label: 'Duels won', value: `${dw}/${dt}`, detail: `${Math.round((dw / dt) * 100)}%` });
    }
    pushOppMatchup(out, role, opp, oppForm);
    return out;
  }

  if (role === 'defender') {
    const dt = num(s.duelsTotal);
    const dw = num(s.duelsWon);
    if (dt != null && dw != null && dt > 0) {
      // API-Football duels are NOT split aerial-only — label honestly. Frame as a
      // set-piece threat only when the defender has actually scored (goals > 0).
      const setPiece = (num(s.goals) || 0) > 0;
      out.push({ label: setPiece ? 'Duels (set-piece)' : 'Duels', value: `${dw}/${dt}`, detail: `${Math.round((dw / dt) * 100)}% won` });
    }
    const tk = num(s.tackles);
    if (tk != null) out.push({ label: 'Tackles', value: `${tk}`, detail: `over ${capsLabel(caps) || 'this cycle'}` });
    const y = num(s.yellow);
    const r = num(s.red);
    if (y != null || r != null) out.push({ label: 'Discipline', value: `${y ?? 0}Y / ${r ?? 0}R` });
    const csInfo = cleanSheetsFromForm(ownForm);
    if (csInfo) out.push({ label: `${nation} clean sheets`, value: `${csInfo.cs}/${csInfo.n}`, detail: `team kept ${csInfo.cs} of last ${csInfo.n}` });
    pushOppMatchup(out, role, opp, oppForm);
    return out;
  }

  // forward / winger
  const sot = num(s.shots_on);
  if (sot != null) {
    out.push({ label: 'On target (intl)', value: `${sot}`, detail: `over ${capsLabel(caps) || 'this cycle'}` });
  }
  const goals = num(s.goals);
  const shots = num(s.shots);
  if (goals != null && shots != null && shots > 0) {
    // Conversion computed from grounded goals + shots — NOT xG (not groundable).
    out.push({ label: 'Conversion', value: `${Math.round((goals / shots) * 100)}%`, detail: `${goals} on ${shots} shots` });
  }
  pushOppMatchup(out, role, opp, oppForm);
  // Form lives in RECENT (payload.form) — do NOT duplicate the nation last-5 here.
  return out;
}

/**
 * OPPONENT CONTEXT (the matchup angle a bettor wants, not just the player's own form).
 * For an attacker (forward/winger/midfielder) the relevant matchup is the OPPONENT'S
 * DEFENCE — how much they concede; for a defender it's the OPPONENT'S ATTACK — how
 * much they score. Grounded entirely from API-Football getRecentForm() per-match
 * rates; omitted when the opponent's form or name is missing (never fabricated).
 */
function pushOppMatchup(out, role, opp, oppForm) {
  if (!opp?.name) return;
  if (role === 'defender') {
    const gf = gfPerMatch(oppForm);
    if (gf != null) out.push({ label: `vs ${opp.name} attack`, value: `${gf} scored/gm`, detail: "opponent's recent scoring" });
    return;
  }
  // forward / winger / midfielder — the defence they're attacking.
  const ga = gaPerMatch(oppForm);
  if (ga != null) out.push({ label: `vs ${opp.name} defense`, value: `${ga} conceded/gm`, detail: "opponent's recent leaks" });
}

/**
 * Nation recent form (last-5 internationals): W-D-L + goals scored/conceded per
 * match. Read from API-Football getRecentForm().l5 (falls back to l10). Plain,
 * factual — the team context every starter shares.
 */
function nationForm(formResult, teamName) {
  const span = formResult?.l5 || formResult?.l10;
  if (!span || !num(span.played)) return null;
  const value = `${span.w}-${span.d}-${span.l}`;
  const gf = num(span.gfPerMatch);
  const ga = num(span.gaPerMatch);
  const detailBits = [];
  if (gf != null) detailBits.push(`${gf} scored/gm`);
  if (ga != null) detailBits.push(`${ga} conceded/gm`);
  const out = { label: `${teamName || 'Nation'} last ${span.played}`, value };
  if (detailBits.length) out.detail = detailBits.join(' · ');
  return out;
}

/**
 * Last-match form rows from the player's PRIOR completed matches. Only a
 * full-shift appearance (non-null minutes_played >= floor) yields a row, so a
 * sub's partial line never ships. Shows goals (a played-full-shift 0 is a true,
 * gradeable observation — the grader reads a played player's null goals as 0) and
 * shots-on-target only when that field is present (null omitted, never coerced).
 */
function lastMatchFormRowsByRole(history, role) {
  const played = asArray(history).filter((r) => num(r?.minutes_played) != null && num(r.minutes_played) >= FORM_MIN_MINUTES);
  if (!played.length) return [];
  const last = played[played.length - 1];
  const min = num(last.minutes_played);
  const g = num(last.goals) ?? 0;          // full shift confirmed -> 0 is real
  const a = num(last.assists) ?? 0;
  const sot = num(last.shots_on_target);    // nullable: omit when absent

  let value;
  if (role === 'keeper') {
    // No per-player shots-FACED field exists on player_match_stats, so a busy-keeper
    // "faced N SoT" can't be grounded here — show a clean full-shift minutes row.
    value = min != null ? `${min}'` : 'Full shift';
  } else if (role === 'defender') {
    // Defenders rarely tally — a clean full-shift row, goals only if they scored.
    const bits = [];
    if (g > 0) bits.push(`${g} G`);
    if (a > 0) bits.push(`${a} A`);
    bits.push(min != null ? `${min}'` : 'full shift');
    value = bits.join(' · ');
  } else if (role === 'midfielder') {
    // NON-SCORER HEADLINE: a midfielder's "0 G" last match is a weak lead. When he
    // didn't score, lead with minutes + involvement (assists, SoT) — the parts of his
    // shift that actually matter — and only surface goals when he scored.
    const bits = [];
    if (g > 0) bits.push(`${g} G`);
    if (a > 0) bits.push(`${a} A`);
    if (sot != null && sot > 0) bits.push(`${sot} SoT`);
    bits.push(min != null ? `${min}'` : 'full shift');
    value = bits.join(' · ');
  } else {
    // forward / winger: scoring is the job — lead with goals (a played-full-shift 0
    // is a real, gradeable observation), then assists + SoT when present.
    const bits = [`${g} G`];
    if (a > 0) bits.push(`${a} A`);
    if (sot != null) bits.push(`${sot} SoT`);
    value = bits.join(' · ');
  }

  const entry = { label: 'LAST MATCH', value };
  const det = [];
  // The keeper / defender / midfielder rows already carry minutes in their value;
  // only the forward row gets minutes in detail.
  if (role === 'forward' && min != null) det.push(`${min}'`);
  const dt = matchShortDate(last);
  if (dt) det.push(dt);
  if (det.length) entry.detail = det.join(' · ');
  return [entry];
}

/**
 * Up to 3 plain-copy strengths / weaknesses, deterministic, ROLE-TAILORED, derived
 * ONLY from the grounded fields above. No bet instructions, no Layer-3 conclusions
 * about the pick. Forwards read on scoring/finishing; midfielders on creativity +
 * duels; defenders on aerial/set-piece threat + tackle volume + discipline + team
 * clean-sheet rate; keepers on save% + clean-sheet rate.
 */
function strengthsWeaknesses({ sstat, form, formRows, role, ownForm, oppForm, meta } = {}) {
  const strengths = [];
  const weaknesses = [];
  const nation = meta?.name || (form?.label ? form.label.replace(/ last \d+$/, '') : 'Nation');

  if (sstat) {
    const g = num(sstat.goals);
    const a = num(sstat.assists);
    const caps = num(sstat.appearances);
    const sot = num(sstat.shots_on);

    if (role === 'keeper') {
      const saves = num(sstat.saves);
      const conc = num(sstat.conceded);
      if (saves != null && conc != null && (saves + conc) > 0) {
        const rate = Math.round((saves / (saves + conc)) * 100);
        if (rate >= 70) strengths.push(`Strong save rate — stopping ${rate}% of shots faced this cycle`);
        else if (rate <= 55) weaknesses.push(`Low save rate — only ${rate}% of shots faced stopped`);
      }
      const csInfo = cleanSheetsFromForm(ownForm);
      if (csInfo && csInfo.n >= 2) {
        const pct = Math.round((csInfo.cs / csInfo.n) * 100);
        if (pct >= 50) strengths.push(`${nation} keeping clean sheets — ${csInfo.cs} of last ${csInfo.n}`);
      }
    } else if (role === 'midfielder' && caps != null && caps > 0) {
      const involvement = (g ?? 0) + (a ?? 0);
      if (involvement >= 3) strengths.push(`Goal involvement — ${g ?? 0}G/${a ?? 0}A in ${caps} cap${caps === 1 ? '' : 's'}`);
      const kp = num(sstat.keyPasses);
      if (kp != null && kp >= 6) strengths.push(`Creator — ${kp} key passes over ${caps} cap${caps === 1 ? '' : 's'}`);
      const dt = num(sstat.duelsTotal);
      const dw = num(sstat.duelsWon);
      if (dt != null && dw != null && dt >= 4) {
        const pct = Math.round((dw / dt) * 100);
        if (pct >= 55) strengths.push(`Duel dominance — wins ${pct}% of duels`);
        else if (pct < 40) weaknesses.push(`Loses the duel battle — ${pct}% won`);
      }
      const pa = num(sstat.passAccuracy);
      // Only a genuine-but-low value is a weakness; a 0 is missing data, not loose passing.
      if (pa != null && pa >= 40 && pa < 75) weaknesses.push(`Loose distribution — ${Math.round(pa)}% pass accuracy`);
    } else if (role === 'defender' && caps != null && caps > 0) {
      if (g != null && g >= 2) strengths.push(`Set-piece threat — ${g} goals from the back this cycle`);
      const tk = num(sstat.tackles);
      if (tk != null && tk >= 8) strengths.push(`Tackle volume — ${tk} tackles over ${caps} cap${caps === 1 ? '' : 's'}`);
      const csInfo = cleanSheetsFromForm(ownForm);
      if (csInfo && csInfo.n >= 2) {
        const pct = Math.round((csInfo.cs / csInfo.n) * 100);
        if (pct >= 50) strengths.push(`${nation} clean-sheet rate — ${csInfo.cs} of last ${csInfo.n}`);
      }
      const y = num(sstat.yellow);
      const r = num(sstat.red);
      if ((y != null && y >= 3) || (r != null && r >= 1)) {
        weaknesses.push(`Discipline risk — ${y ?? 0}Y / ${r ?? 0}R this cycle`);
      }
    } else if (caps != null && caps > 0) {
      // forward / winger
      const involvement = (g ?? 0) + (a ?? 0);
      if (g != null && g >= 3) strengths.push(`Scoring this cycle — ${g} goal${g === 1 ? '' : 's'} in ${caps} cap${caps === 1 ? '' : 's'}`);
      else if (involvement >= 3) strengths.push(`Goal involvement — ${g ?? 0}G/${a ?? 0}A in ${caps} cap${caps === 1 ? '' : 's'}`);
      if (sot != null && sot >= 4) strengths.push(`Hits the target — ${sot} shots on target this cycle`);
      const shots = num(sstat.shots);
      if (g != null && shots != null && shots >= 5) {
        const conv = Math.round((g / shots) * 100);
        if (conv >= 25) strengths.push(`Clinical finisher — ${conv}% conversion (${g} on ${shots})`);
      }
      if (involvement === 0 && caps >= 3) weaknesses.push(`No goals or assists in ${caps} caps this cycle`);
    }
  }

  // Nation form -> a context read (applies to the whole side; not for keepers,
  // whose own-GA read lives in their splits instead).
  if (role !== 'keeper' && form?.detail) {
    const gf = parseRate(form.detail, /([\d.]+)\s*scored\/gm/);
    const ga = parseRate(form.detail, /([\d.]+)\s*conceded\/gm/);
    if (gf != null && gf >= 2.0) strengths.push(`${nation} scoring freely — ${gf} goals/gm recently`);
    if (ga != null && ga >= 2.0) weaknesses.push(`${nation} leaking goals — ${ga} conceded/gm recently`);
  }

  // Keeper: own-nation recent GA as a leak read.
  if (role === 'keeper') {
    const ga = gaPerMatch(ownForm);
    if (ga != null && ga >= 2.0) weaknesses.push(`${nation} leaking goals — ${ga} conceded/gm recently`);
  }

  return {
    strengths: dedupeCap(strengths, MAX_STRENGTHS),
    weaknesses: dedupeCap(weaknesses, MAX_WEAKNESSES),
  };
}

/** This nation's recent goals-conceded-per-match (own GA read). */
function gaPerMatch(formResult) {
  const span = formResult?.l5 || formResult?.l10;
  return span ? num(span.gaPerMatch) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Props (vendor selection + labels + per-match rate extractors)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Select a SINGLE preferred vendor's prop rows for one player (never mixes books
 * into a synthesized consensus). For anytime_goal — a milestone market that can be
 * posted at line 1 (true anytime) or 2/3 (brace/hat-trick) — keep the LOWEST line
 * so the card shows the standard anytime number, not a long-shot milestone.
 */
function pickVendorRows(propRows, playerId, allowedTypes) {
  const allow = Array.isArray(allowedTypes) && allowedTypes.length
    ? new Set(allowedTypes.map((t) => String(t).toLowerCase()))
    : null;
  const mine = asArray(propRows)
    .filter((r) => String(r?.player_id) === String(playerId))
    // Only consider the role's markets when choosing a vendor, so e.g. a keeper's
    // vendor is chosen on the book that actually posts saves, not a stray goal line.
    .filter((r) => !allow || allow.has(String(r?.prop_type || '').toLowerCase()));
  if (!mine.length) return [];
  let vendor = null;
  for (const v of PROP_VENDORS) {
    if (mine.some((r) => String(r?.vendor || '').toLowerCase() === v)) { vendor = v; break; }
  }
  if (!vendor) return []; // none of the trusted books quoted this player — omit
  const rows = mine.filter((r) => String(r?.vendor || '').toLowerCase() === vendor);
  // Per prop_type, keep the single best rung: for anytime_goal the lowest line
  // (the real anytime), otherwise the first seen (one line per shots/SoT market).
  const best = new Map();
  for (const r of rows) {
    const type = String(r?.prop_type || '').toLowerCase();
    const cur = best.get(type);
    if (!cur) { best.set(type, r); continue; }
    if (type === 'anytime_goal') {
      const ln = num(r?.line_value), cl = num(cur?.line_value);
      if (ln != null && (cl == null || ln < cl)) best.set(type, r);
    }
  }
  return [...best.values()];
}

function propLabel(propType) {
  const map = {
    anytime_goal: 'Anytime goal',
    shots: 'Shots',
    shots_on_target: 'Shots on target',
    assists: 'Assists',
    saves: 'Saves',
    cards: 'Card',
  };
  return map[propType] || propType.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/**
 * Drop any prop row whose American odds fall outside the sanity band (a junk /
 * scaled milestone price like "+70000"). The surfaced number is market.odds for a
 * milestone (anytime_goal) and over/under rows alike — the same field formatProps
 * reads — so we evaluate exactly the value that would ship. A row with NO numeric
 * odds is kept (it may still carry a line); only a present-but-insane price is cut.
 */
function sanePropRows(rows) {
  return asArray(rows).filter((r) => {
    const o = Number(r?.market?.odds);
    if (!Number.isFinite(o)) return true;             // no odds → keep (line-only)
    if (o > PROP_ODDS_MAX || o < PROP_ODDS_MIN) {
      console.warn(`[wcPlayerInsightCards] dropping insane prop odds: ${r?.prop_type || 'prop'} @ ${o} (player ${r?.player_id}).`);
      return false;
    }
    return true;
  });
}

/**
 * Rate wording per prop type. anytime_goal is a YES/NO market, so over/under
 * wording ("0/2 over") is wrong — phrase it as "scored 0 of 2". shots_on_target is
 * a true over/under, so it keeps the default "{cleared}/{total} over" (returns null
 * to defer to attachPropRates' default).
 */
function propRatePhrase(type, cleared, total) {
  if (type === 'anytime_goal') return `scored ${cleared} of ${total}`;
  return null;
}

/**
 * Role-aware title for the stats block (drives the iOS section header). MLB keeps
 * "Splits"; WC gets a soccer-appropriate, role-aware title. Forwards/wingers read
 * the scoring role ("FINISHING"); midfielders the ball-progression role ("ON THE
 * BALL"); defenders the defensive role ("AT THE BACK"); keepers ("IN GOAL").
 */
function statsSectionTitleForRole(role) {
  switch (role) {
    case 'keeper': return 'IN GOAL';
    case 'defender': return 'AT THE BACK';
    case 'midfielder': return 'ON THE BALL';
    default: return 'FINISHING'; // forward / winger
  }
}

// prop_type -> per-match stat extractor from a getPlayerMatchStats row. ONLY the
// fields that actually exist on player_match_stats: goals (anytime_goal) and
// shots_on_target. "shots" (total) has no field there, so it gets no rate (fail
// closed). A played player's null goals/SoT read as 0 for the rate count, which
// is correct — every row here is from a COMPLETED match the player appears in.
const RATE_STAT = {
  anytime_goal: (r) => num(r.goals) ?? 0,
  shots_on_target: (r) => num(r.shots_on_target) ?? 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-match shared reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * team_id -> { name, abbr, isHome, oppId } from a FIFA match. Handles BOTH the
 * RAW BDL match shape (getMatchesForDate: home_team/away_team are the full team
 * OBJECTS { id, name, abbreviation }) and the pipeline-normalized shape
 * (formatMatchForPipeline: home_team is a string, the object lives on
 * home_team_data / _raw.home_team).
 */
function buildTeamMeta(match) {
  const map = new Map();
  const home = resolveTeamObj(match, 'home');
  const away = resolveTeamObj(match, 'away');
  const homeId = home?.id ?? null;
  const awayId = away?.id ?? null;
  if (homeId != null) map.set(homeId, { name: nameOf(home), abbr: abbrOf(home), isHome: true, oppId: awayId });
  if (awayId != null) map.set(awayId, { name: nameOf(away), abbr: abbrOf(away), isHome: false, oppId: homeId });
  return map;
}

/**
 * Projected XI starter rows for BOTH sides of a match, in the SAME shape the
 * confirmed sheet yields ({ team_id, is_starter, position, shirt_number,
 * player:{id,name} }). Built from previousXI() — each side's recent regulars with
 * OUT/suspended dropped — the canonical projection the field view + situational
 * lane share. Returns [] when neither side has a usable prior-match XI (openers).
 *
 * Grounding: every projected starter is a REAL player who actually started recent
 * matches; nothing is invented. Their card's stats (season/splits/form) are joined
 * by player id/name exactly as for a confirmed starter, so the morning card is just
 * as grounded — only the "is he starting tonight" question is a projection, which
 * the confirmed run resolves.
 */
async function projectedStarters(match, teamMeta) {
  const matchId = match?.id ?? match?.soccer_match_id ?? null;
  const out = [];
  for (const [teamId, meta] of teamMeta.entries()) {
    if (teamId == null || !meta?.name) continue;
    const side = await safeCall(
      () => previousXI(teamId, meta.name, matchId, DEFAULT_SEASON),
      null,
    );
    const starters = asArray(side?.starters);
    if (!starters.length) continue;
    for (const s of starters) {
      if (s?.player?.id == null) continue;
      out.push({
        team_id: s.team_id ?? teamId,
        is_starter: true,
        position: s.position ?? s.player?.position ?? null,
        shirt_number: s.shirt_number ?? null,
        player: { id: s.player.id, name: s.player.name },
      });
    }
  }
  return out;
}

/** Resolve a side's team object across the raw + normalized match shapes. */
function resolveTeamObj(match, side) {
  const raw = match?.[`${side}_team`];
  if (raw && typeof raw === 'object') return raw;                 // raw BDL: object
  const data = match?.[`${side}_team_data`] || match?._raw?.[`${side}_team`];
  if (data && typeof data === 'object') return data;              // normalized: *_team_data
  if (typeof raw === 'string') return { name: raw };              // normalized: string name only
  return null;
}

/** Per-team international squad-stat maps (API-Football, keyed by lowercased name). */
async function loadSquads(teamMeta) {
  const out = new Map();
  for (const [teamId, meta] of teamMeta.entries()) {
    if (!meta?.name) continue;
    const squad = await safeCall(() => apiFootball.getSquadStats(meta.name), {});
    out.set(teamId, squad || {});
  }
  return out;
}

/** Per-team recent international form (API-Football getRecentForm). */
async function loadForms(teamMeta) {
  const out = new Map();
  for (const [teamId, meta] of teamMeta.entries()) {
    if (!meta?.name) continue;
    const form = await safeCall(() => apiFootball.getRecentForm(meta.name, 10), null);
    out.set(teamId, form);
  }
  return out;
}

/**
 * player_id -> the player's PRIOR completed-match stat rows (oldest -> newest),
 * for prop rates + last-match form rows. We pull each team's completed WC matches
 * that kicked off BEFORE this match (so tonight never pollutes the window), fetch
 * their player_match_stats in one batched call, and bucket rows by player_id.
 */
async function loadPriorMatchHistory(wc, match, teamMeta) {
  const byPlayer = new Map();
  const teamIds = [...teamMeta.keys()];
  if (!teamIds.length) return byPlayer;

  const thisStart = matchStartMs(match);
  // All WC matches for these two teams (cheap, cached in the service).
  const teamMatches = await safeCall(() => wc.getMatches({ teamIds }), []);
  const priorCompleted = asArray(teamMatches).filter((m) => {
    if (m?.status !== 'completed') return false;
    if (String(m?.id) === String(match?.id)) return false; // exclude tonight
    const ms = matchStartMs(m);
    return thisStart == null || ms == null || ms < thisStart; // strictly before tonight
  });
  if (!priorCompleted.length) return byPlayer;

  // Sort prior matches oldest -> newest so each player's history is chronological.
  priorCompleted.sort((a, b) => (matchStartMs(a) ?? 0) - (matchStartMs(b) ?? 0));
  const priorIds = [...new Set(priorCompleted.map((m) => m.id).filter((x) => x != null))];

  // One batched stat read for all prior matches; then order rows per match.
  const allRows = await safeCall(() => wc.getPlayerMatchStats(priorIds), []);
  const rowsByMatch = new Map();
  for (const r of asArray(allRows)) {
    const mid = r?.match_id;
    if (mid == null) continue;
    if (!rowsByMatch.has(mid)) rowsByMatch.set(mid, []);
    rowsByMatch.get(mid).push(r);
  }
  for (const m of priorCompleted) {
    const mDate = m?.datetime || m?._raw?.datetime || null;
    for (const r of (rowsByMatch.get(m.id) || [])) {
      const pid = r?.player_id;
      if (pid == null) continue;
      const key = String(pid);
      if (!byPlayer.has(key)) byPlayer.set(key, []);
      // Stamp the match date so a form row can show "JUN 18" (rows carry none).
      byPlayer.get(key).push(mDate ? { ...r, _matchDate: mDate } : r);
    }
  }
  return byPlayer;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Join a starter name to a getSquadStats map: exact lowercased name, then last name. */
function lookupSquadStat(squad, playerName) {
  if (!squad || typeof squad !== 'object') return null;
  const lower = String(playerName || '').toLowerCase().trim();
  if (squad[lower]) return squad[lower];
  const ln = lastNameKey(playerName);
  if (!ln) return null;
  return Object.values(squad).find((s) => lastNameKey(s?.name) === ln) || null;
}

function lastNameKey(name) {
  const parts = String(name || '').toLowerCase().trim().split(/\s+/);
  const last = parts[parts.length - 1] || '';
  // require a real last name (avoid 1-2 char initials colliding)
  return last.length > 2 ? nameKey(last) : '';
}

/** A FIFA lineup position is a single-letter code: G(oalkeeper) D M F. */
function isGoalkeeper(pos) {
  const p = String(pos || '').toUpperCase();
  return p === 'G' || p === 'GK' || p.startsWith('GOAL');
}

/** Map the single-letter FIFA position code to a readable label. */
function normalizePosition(pos) {
  const p = String(pos || '').toUpperCase().trim();
  const map = { G: 'Goalkeeper', GK: 'Goalkeeper', D: 'Defender', M: 'Midfielder', F: 'Forward' };
  return map[p] || (pos ? String(pos) : null);
}

function nameOf(team) { return team?.name || team?.full_name || null; }
function abbrOf(team) { return team?.abbreviation || team?.country_code || null; }

/** "AWY @ HOM" using 3-letter country abbreviations, matching the MLB card label. */
function matchAbbrLabel(match) {
  const home = resolveTeamObj(match, 'home');
  const away = resolveTeamObj(match, 'away');
  const a = abbrOf(away) || nameOf(away) || 'AWY';
  const h = abbrOf(home) || nameOf(home) || 'HOM';
  return `${a} @ ${h}`;
}

const MONTHS_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** A completed match's date -> "JUN 18" (null when unparseable). */
function matchShortDate(statRow) {
  // player_match_stats rows carry no date; the loader keeps chronological order,
  // so we only surface a date when the stat row was annotated with one upstream.
  const iso = statRow?._matchDate || statRow?.datetime || null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return `${MONTHS_ABBR[mo - 1]} ${Number(m[3])}`;
}

/** Match kickoff in epoch ms (from the normalized or raw FIFA shape). */
function matchStartMs(match) {
  const iso = match?.datetime || match?.commence_time || match?._raw?.datetime || null;
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t) ? t : null;
}

/** Pull a numeric rate out of a display string via the supplied regex. */
function parseRate(s, re) {
  const m = re.exec(String(s || ''));
  return m ? Number(m[1]) : null;
}

/**
 * Lazy-load the FIFA service so this module stays import-cheap for callers. We
 * return the NAMESPACE (not the default export) because getPlayerProps is a
 * named-only export — it isn't on fifaWorldCupService's default object.
 */
async function loadFifa() {
  try {
    const mod = await import('../fifaWorldCupService.js');
    return mod || null;
  } catch (err) {
    console.error('[wcPlayerInsightCards] failed to load fifaWorldCupService:', err?.message || err);
    return null;
  }
}

export default { buildWcPlayerInsightCards };
