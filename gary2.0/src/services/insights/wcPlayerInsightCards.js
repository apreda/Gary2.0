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
//       shots, shots_on, position }. This is the player's CURRENT INTERNATIONAL
//       cycle (qualifiers + friendlies + Nations League) — labeled as caps, NEVER
//       as club stats (there is NO club fetcher).
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

// Thin local binding so every safeCall() site carries a '[wcPlayerInsightCards]'
// error prefix while reusing the shared implementation.
const safeCall = (fn, fallback) => safeCallShared(fn, fallback, 'wcPlayerInsightCards');

// ─────────────────────────────────────────────────────────────────────────────
// Tunables
// ─────────────────────────────────────────────────────────────────────────────

const MAX_PROPS = 3;            // anytime_goal / shots / shots_on_target
const MAX_STRENGTHS = 3;
const MAX_WEAKNESSES = 3;

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
// exactly like an untrackable MLB type.
const PROP_PRIORITY = ['anytime_goal', 'shots', 'shots_on_target'];

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
  const stats = { matches: 0, starters: 0, built: 0, keeper: 0, outfield: 0, skipped: 0 };

  for (const match of slate) {
    const matchId = match?.id ?? match?.soccer_match_id ?? null;
    if (matchId == null) { continue; }
    stats.matches += 1;

    // 1. Confirmed starting XI for this match.
    const lineups = await safeCall(() => wc.getMatchLineups([matchId]), []);
    const starters = asArray(lineups).filter((l) => l?.is_starter && l?.player?.id != null);
    if (!starters.length) {
      console.log(`[wcPlayerInsightCards] match ${matchId}: no confirmed XI posted yet — skipping.`);
      continue;
    }
    // Require a real XI on at least one side before trusting the sheet.
    const perSide = {};
    for (const s of starters) perSide[s.team_id] = (perSide[s.team_id] || 0) + 1;
    if (!Object.values(perSide).some((c) => c >= XI_MIN_STARTERS)) {
      console.log(`[wcPlayerInsightCards] match ${matchId}: XI not fully posted (${starters.length} starters) — skipping.`);
      continue;
    }

    // 2. Per-match shared reads (one fetch each, reused across this match's starters).
    const teamMeta = buildTeamMeta(match);                       // team_id -> { name, abbr, isHome, oppId }
    const props = await safeCall(() => wc.getPlayerProps({ matchId }), []);
    const squadByTeam = await loadSquads(teamMeta);               // team_id -> getSquadStats map
    const formByTeam = await loadForms(teamMeta);                 // team_id -> getRecentForm result
    const histByPlayer = await loadPriorMatchHistory(wc, match, teamMeta); // player_id -> [finals stat rows, oldest->newest]
    const gameLabel = matchAbbrLabel(match);

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
    `[wcPlayerInsightCards] ${stats.matches} match(es), ${stats.starters} starters -> ` +
      `built ${stats.built} (${stats.outfield} outfield / ${stats.keeper} keeper), skipped ${stats.skipped}.`,
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

  const payload = { type: isKeeper ? 'keeper' : 'outfield', name, game: gameLabel };
  if (meta.abbr) payload.team = meta.abbr;
  if (position) payload.position = position;

  // Opponent = the OTHER nation (no "hand" concept in soccer — leave it absent).
  const opp = meta.oppId != null ? teamMeta.get(meta.oppId) : null;
  if (opp?.name) payload.opponent = { name: opp.name };

  // International season line + splits, from this team's squad map (joined id->name).
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
    const season = seasonDisplay(sstat);
    if (season) payload.season = season;
    const splits = seasonSplits(sstat);
    if (splits.length) payload.splits = splits;
  }

  // Nation recent form (L5) — the team-level signal that applies to every starter.
  const form = nationForm(formByTeam.get(teamId), meta.name);
  if (form) payload.form = form;

  // Tonight's lines for this player: ONE vendor, joined by player_id, reusing the
  // shared formatProps for label/line/odds + dedupe + cap.
  const vendorRows = pickVendorRows(props, playerId);
  const formatted = formatProps(vendorRows, playerId, PROP_PRIORITY, { labelFor: propLabel, maxProps: MAX_PROPS });
  if (formatted.length) payload.props = formatted;

  // Prior-match history (finals only) -> prop hit rates + last-match form rows.
  const history = asArray(histByPlayer.get(playerId)); // oldest -> newest
  const formRows = lastMatchFormRows(history);
  if (formRows.length) payload.formRows = formRows;
  attachPropRates(formatted, history, RATE_STAT, { window: RATE_WINDOW, minRows: RATE_MIN_ROWS });

  // Deterministic, plain-copy strengths / weaknesses derived from the above.
  const { strengths, weaknesses } = strengthsWeaknesses({ sstat, form, formRows, isKeeper });
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

function seasonDisplay(s) {
  if (!s) return null;
  const g = num(s.goals);
  const a = num(s.assists);
  const sh = num(s.shots);
  const caps = num(s.appearances);
  const p1 = [];
  if (g != null) p1.push(`${g} G`);
  if (a != null) p1.push(`${a} A`);
  if (sh != null) p1.push(`${sh} SH`);
  const out = {};
  if (p1.length) out.line1 = p1.join(' / ');
  if (caps != null) out.line2 = `${caps} ${caps === 1 ? 'cap' : 'caps'}`;
  return (out.line1 || out.line2) ? out : null;
}

/**
 * International shot splits as LabeledStats: total shots and shots-on-target over
 * the current cycle. Each rung is omitted when its source value is null (a player
 * with no recorded shots shows no shot split — never a fabricated 0).
 */
function seasonSplits(s) {
  if (!s) return [];
  const caps = num(s.appearances);
  const capTail = caps != null ? ` over ${caps} ${caps === 1 ? 'cap' : 'caps'}` : '';
  const out = [];
  const shots = num(s.shots);
  if (shots != null) {
    out.push({ label: 'Shots (intl)', value: `${shots}`, detail: `Total shots${capTail}`.trim() });
  }
  const sot = num(s.shots_on);
  if (sot != null) {
    out.push({ label: 'On target (intl)', value: `${sot}`, detail: `Shots on target${capTail}`.trim() });
  }
  return out;
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
function lastMatchFormRows(history) {
  const played = asArray(history).filter((r) => num(r?.minutes_played) != null && num(r.minutes_played) >= FORM_MIN_MINUTES);
  if (!played.length) return [];
  const last = played[played.length - 1];
  const min = num(last.minutes_played);
  const g = num(last.goals) ?? 0;          // full shift confirmed -> 0 is real
  const a = num(last.assists) ?? 0;
  const sot = num(last.shots_on_target);    // nullable: omit when absent
  const bits = [`${g} G`];
  if (a > 0) bits.push(`${a} A`);
  if (sot != null) bits.push(`${sot} SoT`);
  const entry = { label: 'LAST MATCH', value: bits.join(' · ') };
  const det = [];
  if (min != null) det.push(`${min}'`);
  const dt = matchShortDate(last);
  if (dt) det.push(dt);
  if (det.length) entry.detail = det.join(' · ');
  return [entry];
}

/**
 * Up to 3 plain-copy strengths / weaknesses, deterministic, derived only from the
 * grounded fields above. No bet instructions, no Layer-3 conclusions about the
 * pick. Keepers get a save-volume read; outfielders a scoring/form read.
 */
function strengthsWeaknesses({ sstat, form, formRows, isKeeper }) {
  const strengths = [];
  const weaknesses = [];

  if (sstat) {
    const g = num(sstat.goals);
    const a = num(sstat.assists);
    const caps = num(sstat.appearances);
    const sot = num(sstat.shots_on);
    if (!isKeeper && caps != null && caps > 0) {
      const involvement = (g ?? 0) + (a ?? 0);
      if (g != null && g >= 3) strengths.push(`Scoring this cycle — ${g} goal${g === 1 ? '' : 's'} in ${caps} cap${caps === 1 ? '' : 's'}`);
      else if (involvement >= 3) strengths.push(`Goal involvement — ${g ?? 0}G/${a ?? 0}A in ${caps} cap${caps === 1 ? '' : 's'}`);
      if (sot != null && sot >= 4) strengths.push(`Hits the target — ${sot} shots on target this cycle`);
      if (involvement === 0 && caps >= 3) weaknesses.push(`No goals or assists in ${caps} caps this cycle`);
    }
  }

  // Nation form -> a context read (applies to the whole side).
  if (form?.detail) {
    const gf = parseRate(form.detail, /([\d.]+)\s*scored\/gm/);
    const ga = parseRate(form.detail, /([\d.]+)\s*conceded\/gm/);
    if (gf != null && gf >= 2.0) strengths.push(`${form.label.replace(/ last \d+$/, '')} scoring freely — ${gf} goals/gm recently`);
    if (ga != null && ga >= 2.0) weaknesses.push(`${form.label.replace(/ last \d+$/, '')} leaking goals — ${ga} conceded/gm recently`);
  }

  // Keeper save volume from the last full match.
  if (isKeeper && formRows.length) {
    const sotConceded = parseRate(formRows[0].value, /(\d+)\s*SoT/);
    if (sotConceded != null && sotConceded >= 4) strengths.push(`Busy last out — faced ${sotConceded} shots on target`);
  }

  return {
    strengths: dedupeCap(strengths, MAX_STRENGTHS),
    weaknesses: dedupeCap(weaknesses, MAX_WEAKNESSES),
  };
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
function pickVendorRows(propRows, playerId) {
  const mine = asArray(propRows).filter((r) => String(r?.player_id) === String(playerId));
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
  };
  return map[propType] || propType.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
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
