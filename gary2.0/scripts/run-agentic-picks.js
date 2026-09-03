#!/usr/bin/env node
/**
 * Agentic Pick Generation Script
 * 
 * This script runs Gary's agentic system to generate picks.
 * Usage:
 *   node scripts/run-agentic-picks.js --nba
 *   node scripts/run-agentic-picks.js --nfl
 *   node scripts/run-agentic-picks.js --nhl
 *   node scripts/run-agentic-picks.js --ncaab
 *   node scripts/run-agentic-picks.js --ncaaf
 *   node scripts/run-agentic-picks.js --all
 */

// MUST load env vars FIRST before any other imports
import path from 'node:path';
import '../src/loadEnv.js';
import {
  assertPicksStillPregame,
  exactFootballGameDiscoveryOptions,
  formatPickRunOutcome,
} from './lib/pickRunReliability.js';
import { exitAfterFlushing } from './lib/processLifecycle.js';
import { ncaabSeason } from '../src/utils/dateUtils.js';
import { countRealStats } from '../src/services/agentic/statsSubstance.js';
import { mlbCaseHeadings } from '../src/services/agentic/orchestrator/mlbCaseMenu.js';
import {
  classifyNcaafFbsGames,
  ncaafSlateDateForInstant,
} from '../src/services/ncaafGamePolicy.js';
import { classifyPickMarketSide } from './lib/pickSideClassification.js';

// Now import modules that depend on env vars
const { analyzeGame } = await import('../src/services/agentic/orchestrator/index.js');
const { oddsService } = await import('../src/services/oddsService.js');
const { picksService } = await import('../src/services/picksService.js');
const { ballDontLieService } = await import('../src/services/ballDontLieService.js');
const { findStaleInjuryMentions } = await import('../src/services/agentic/orchestrator/statAudit.js');
const { GAME_PICK_MODEL, MLB_JUNE_BRAIN_MODEL, DESK_FALLBACK_MODELS } = await import('../src/services/agentic/orchestrator/orchestratorConfig.js');

// ERA LIVE — this is a fresh process, so its module cache IS disk truth. One
// line + a ledger append make every pick run auditable by folder/commit/era,
// and the grading-side drift check (checkEraDrift) verifies that every era
// stamped in the database came from a run recorded here. Fail-open.
// (The pickdesk game era is gone with the pickdesk game lane — founder,
// Aug 27: one pick system. The June era is THE game era.)
try {
  const { recordEraRun, gitStamp, PROJECT_DIR } = await import('./lib/eraTruth.js');
  const { junePromptSha: juneEra } = await import('../src/services/agentic/orchestrator/junePromptSha.js');
  const etToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  console.log(`🧬 ERA LIVE: game ${juneEra()} · commit ${gitStamp()} @ ${PROJECT_DIR}`);
  recordEraRun('game', etToday, juneEra());
} catch (e) { console.log(`🧬 ERA LIVE: (unavailable — ${e.message})`); }

// ═══════════════════════════════════════════════════════════════════════════
// JUNE ENGINE (MLB) — Aug 18 2026 restoration (founder GO after the ledger
// post-mortem: June +26u/58% on the agentic engine, negative every week since
// the Jul 22-26 pickdesk cutover). MLB game picks return to the orchestrator:
// scout report → Haiku research briefing (checklist, hard-fail) → Sol brain
// WITH tools → bilateral cases → Pass 2 decision (ML or RL, Gary's choice)
// → Pass 3 + statAudit. THE lane, unconditionally (founder, Aug 27) —
// requires ANTHROPIC_API_KEY (researcher) + OPENAI_API_KEY (brain); a
// missing key fails loudly instead of rerouting to a second system.
// ═══════════════════════════════════════════════════════════════════════════
// ONE LANE (founder, Aug 27): MLB runs the June engine unconditionally —
// no pickdesk fallback, and as of the afternoon kill, NO RESEARCHER: the
// desk is Gary's entire evidence. Keys still power the desk's press lanes
// and the brains; a missing key fails loudly, never silently.
if (!process.env.OPENAI_API_KEY) {
  console.error(`[JuneEngine] 🚨 OPENAI_API_KEY MISSING — the brain bridge and desk press lanes WILL FAIL loudly until it lands in .env. There is no fallback system.`);
} else {
  console.log(`[JuneEngine] ⚾ MLB games run the June engine, desk-only (brain: ${MLB_JUNE_BRAIN_MODEL}, model cascade: ${DESK_FALLBACK_MODELS.join(' → ')}; researcher: OFF — founder kill, Aug 27).`);
}

// Era stamp for the restored lane: one hash over the engine's full surface —
// static prompts AND the dossier-surface files (see junePromptSha.js; the
// factor-plan file rode in Aug 19 with the situation-first walk). Shared
// with production-truth so the live June era is always visible.
let _junePromptShaFn = null;
async function junePromptSha() {
  if (!_junePromptShaFn) {
    ({ junePromptSha: _junePromptShaFn } = await import('../src/services/agentic/orchestrator/junePromptSha.js'));
  }
  return _junePromptShaFn();
}

// The June engine's Pass 1 bilateral cases ("Case for backing X tonight", or
// the older "Case for X winning") map onto the app's path fields — June's
// process stored in August's plumbing. Tolerant of full-name or mascot-only
// headers; a miss stores null and the app renders without paths.
function extractJuneBilateralPaths(rawAnalysis, homeTeam, awayTeam) {
  const text = String(rawAnalysis || '');
  if (!text) return { path_home: null, path_away: null };
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // PRIMARY: the exact-heading contract (Aug 18 — "CASE FOR BACKING X TONIGHT:").
  // LEGACY: the older loose "Case for (backing) X" phrasing, kept tolerant.
  const headerRx = (team) => new RegExp(`CASE FOR (?:BACKING\\s+)?(?:THE\\s+)?${esc(team)}(?:\\s+TONIGHT)?:?[^\\n]*`, 'i');
  const headerFor = (team) => {
    let m = text.match(headerRx(team));
    if (!m) {
      const mascot = String(team).trim().split(/\s+/).pop();
      if (mascot && mascot !== team) m = text.match(headerRx(mascot));
    }
    return m;
  };
  const findBlock = (team, otherTeam) => {
    const m = headerFor(team);
    if (!m) return null;
    const start = m.index + m[0].length;
    const rest = text.slice(start);
    const otherM = headerFor(otherTeam) ? rest.match(headerRx(otherTeam)) || rest.match(headerRx(String(otherTeam).trim().split(/\s+/).pop())) : null;
    const endByOther = otherM ? otherM.index : Infinity;
    const doneIdx = rest.search(/INVESTIGATION COMPLETE/i);
    const endByDone = doneIdx === -1 ? Infinity : doneIdx;
    const end = Math.min(endByOther, endByDone, rest.length);
    const block = rest.slice(0, end).trim();
    return block.length >= 80 ? block : null;
  };
  const byHeader = {
    path_home: findBlock(homeTeam, awayTeam),
    path_away: findBlock(awayTeam, homeTeam),
  };
  if (byHeader.path_home && byHeader.path_away) return byHeader;

  // EMERGENCY ONLY (founder law, Aug 18: fallbacks are for emergencies, not
  // a second main path): the Pass 1 ask now contracts EXACT headings, so
  // landing here means the format contract failed — log it loudly so the
  // contract gets fixed, then salvage by validator-style attribution.
  console.warn(`[JuneEngine] ⚠️ bilateral heading contract MISSED (home=${!!byHeader.path_home}, away=${!!byHeader.path_away}) — salvaging paths by paragraph attribution. If this repeats, the Pass 1 heading contract needs attention.`);
  const nick = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean).pop() || '';
  const hN = nick(homeTeam), aN = nick(awayTeam);
  if (!hN || !aN || hN === aN) return byHeader;
  const hRe = new RegExp(`\\b${esc(hN)}\\b`, 'i'), aRe = new RegExp(`\\b${esc(aN)}\\b`, 'i');
  const homeParas = [], awayParas = [];
  for (const para of text.split(/\n\s*\n/)) {
    const t = para.trim();
    if (t.length < 80 || /INVESTIGATION COMPLETE/i.test(t)) continue;
    const h = hRe.test(t), a = aRe.test(t);
    if (h && !a) homeParas.push(t);
    else if (a && !h) awayParas.push(t);
  }
  const join = (arr) => arr.length ? arr.join('\n\n').slice(0, 1600) : null;
  return {
    path_home: byHeader.path_home || join(homeParas),
    path_away: byHeader.path_away || join(awayParas),
  };
}

async function runMlbJuneEngine(game, runnerOptions) {
  // ONE PICK SYSTEM (founder, Aug 27: "no need for a full fallback other
  // pick system... fallback to another one like opus is fine"): a failure
  // re-runs the SAME engine — same desk, same prompts — on the next model
  // in the cascade. The separate pickdesk brain is retired.
  let result = await analyzeGame(game, 'baseball_mlb', { ...runnerOptions, modelOverride: MLB_JUNE_BRAIN_MODEL });
  if (result?.error || !result?.pick) {
    console.warn(`[JuneEngine] first attempt failed (${result?.error || 'no pick'}) — one retry on ${MLB_JUNE_BRAIN_MODEL}`);
    result = await analyzeGame(game, 'baseball_mlb', { ...runnerOptions, modelOverride: MLB_JUNE_BRAIN_MODEL });
  }
  let modelUsed = MLB_JUNE_BRAIN_MODEL;
  // DESK_FALLBACK_MODELS is filtered against GAME_PICK_MODEL at config time,
  // but THIS lane's primary is MLB_JUNE_BRAIN_MODEL — when the two constants
  // differ (any run without GARY_MODEL_OVERRIDE in env), the config filter
  // leaves the primary in the list and a failed brain would get a third run
  // before the first real fallback. Filter against the lane's own primary.
  for (const fallbackModel of DESK_FALLBACK_MODELS.filter((m) => m !== MLB_JUNE_BRAIN_MODEL)) {
    if (result?.pick && !result?.error) break;
    console.warn(`[JuneEngine] ⚠️ ${modelUsed} failed (${result?.error || 'no pick'}) — same engine on ${fallbackModel}`);
    result = await analyzeGame(game, 'baseball_mlb', { ...runnerOptions, modelOverride: fallbackModel });
    modelUsed = fallbackModel;
  }
  if (result?.error || !result?.pick) {
    console.error(`[JuneEngine] 🚫 every model in the cascade failed for ${game.away_team} @ ${game.home_team} (${result?.error || 'no pick'}) — no pick for this game. There is no second system.`);
    return result?.error ? result : { error: 'june engine exhausted: no model produced a pick' };
  }
  // Storage-contract fields (paths, model, era stamp). Bilateral cases live
  // in the PASS 1 message — rawAnalysis holds only the LAST assistant
  // message (Pass 2), so extract from the full narrative (Aug 18 finding).
  const raw = result._fullAssistantNarrative || result._context?.fullAssistantNarrative
    || result.rawAnalysis || result._context?.rawAnalysis || '';
  const paths = extractJuneBilateralPaths(raw, game.home_team, game.away_team);
  result.path_home = result.path_home ?? paths.path_home;
  result.path_away = result.path_away ?? paths.path_away;
  // THE CASE ORDER (Sep 2 2026): which club's case was written last —
  // the ledger's measurement of "last case wins".
  result.case_last = result.case_last ?? mlbCaseHeadings(game.home_team, game.away_team, game).lastSide;
  result._modelUsed = result._modelUsed ?? modelUsed;
  result._promptSha = result._promptSha ?? await junePromptSha();
  return result;
}

// Map verifiedTaleOfTape tokens to iOS StatValues property names.
// iOS StatValues.from(dict:) reads specific keys like "offensive_rating", "tempo", etc.;
// getValue(for: token) then uses the token to look up the value from those properties.
// Module-scoped (static, sport-agnostic) so BOTH the Tale-of-Tape builder AND the
// downstream no-stats hard-fail gate (countRealStats) can see it. It previously lived
// inside the per-game `if (verifiedTaleOfTape)` block, which left it out of scope at the
// gate — a ReferenceError that silently rejected every completed pick.
const tokenToIosKey = {
  // Common stats
  'L5_FORM': 'last_5',
  'L10_FORM': 'last_10',
  'RECORD': 'overall',
  'CONF_RECORD': 'conference_record',
  'EFG_PCT': 'efg_pct',
  // NBA stats (from BDL advanced + base)
  'OFF_RATING': 'offensive_rating',
  'DEF_RATING': 'defensive_rating',
  'NET_RATING': 'net_rating',
  'PACE': 'pace',
  'TS_PCT': 'true_shooting_pct',
  'PPG': 'points_per_game',
  'RPG': 'rebounds_per_game',
  'APG': 'assists_per_game',
  'FG_PCT': 'fg_pct',
  '3PT_PCT': 'three_pct',
  'FT_PCT': 'ft_pct',
  'TOV_GM': 'turnovers_per_game',
  'OREB_GM': 'oreb_per_game',
  'DREB_GM': 'dreb_per_game',
  // NFL verified Tale of the Tape rows
  'POINTS_GM': 'points_per_game',
  'OPP_PTS_GM': 'opp_points_per_game',
  'RUSH_YDS_GM': 'rushing_yards_per_game',
  'PASS_YDS_GM': 'passing_ypg',
  // NCAAB Barttorvik stats
  'ADJOE': 'offensive_rating',
  'ADJDE': 'defensive_rating',
  'ADJEM': 'net_rating',
  'TEMPO': 'tempo',
  'T_RANK': 'kenpom_rank',
  'BARTHAG': 'efg_pct',  // Reuse efg_pct slot for Barthag display
  'WAB': 'wab',
  // NHL stats
  'GOALS_FOR_GM': 'goals_for_per_game',
  'GOALS_AGST_GM': 'goals_against_per_game',
  'SHOTS_FOR_GM': 'shots_for',
  'PP_PCT': 'power_play_pct',
  'PK_PCT': 'penalty_kill_pct',
  'FO_PCT': 'faceoff_pct',
  'CORSI_PCT': 'corsi_pct',
  'XG_PCT': 'xg_pct',
  'PDO': 'pdo',
  'SH_PCT_5V5': 'sh_pct_5v5',
  'SV_PCT_5V5': 'sv_pct_5v5',
  // NCAAB Barttorvik rankings
  'ADJOE_RANK': 'adjoe_rank',
  'ADJDE_RANK': 'adjde_rank',
  'PROJ_RECORD': 'proj_record',
  // MLB stats (RECORD already mapped above; do not duplicate)
  'L10_RECORD': 'l10',
  'HOME_AWAY': 'home_away',
  'HOME_AWAY_RECORD': 'home_away',
  'SP_ERA': 'sp_era',
  'SP_WHIP': 'sp_whip',
  'SP_K9': 'sp_k9',
  'SP_BB9': 'sp_bb9',
  'SP_RECORD': 'sp_record',
  'SP_IP': 'sp_ip',
  'SP_SO': 'sp_so',
  'TEAM_AVG': 'team_avg',
  'TEAM_OBP': 'team_obp',
  'TEAM_SLG': 'team_slg',
  'TEAM_OPS': 'team_ops',
  'TEAM_HR': 'team_hr',
  'SP_NAME': 'sp_name',
  'SP_STARTS': 'sp_starts',
  // iOS StatValues carries matching fields for all three since Jul 22 2026
  // (they rendered N/A before — Models.swift getValue had no cases).
  'TEAM_ERA': 'team_era',
  'TEAM_OPS_BDL': 'team_ops',
  'RUNS_PER_GAME': 'runs_per_game',
};

/**
 * Fetch multi-book sportsbook odds from BDL for a single game.
 * Returns array in the shape formatSportsbookComparison() expects:
 *   { spread_away, spread_away_odds, ml_away, spread_home, spread_home_odds, ml_home, displayName }
 */
async function fetchSportsbookOdds(sportKey, gameId, homeTeam, awayTeam) {
  if (!gameId) return null;
  try {
    const rows = await ballDontLieService.getOddsV2({ game_ids: [gameId] }, sportKey);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows.map(r => ({
      spread_home: r.spread_home_value ?? null,
      spread_home_odds: r.spread_home_odds ?? null,
      spread_away: r.spread_away_value ?? null,
      spread_away_odds: r.spread_away_odds ?? null,
      ml_home: r.moneyline_home_odds ?? null,
      ml_away: r.moneyline_away_odds ?? null,
      total: r.total_value ?? null,
      total_over_odds: r.total_over_odds ?? null,
      total_under_odds: r.total_under_odds ?? null,
      displayName: r.vendor || 'Unknown',
      vendor: r.vendor || 'Unknown'
    }));
  } catch (err) {
    console.warn(`[Sportsbook Odds] BDL fetch failed for game ${gameId}: ${err.message}`);
    return null;
  }
}

/**
 * Map multi-book odds to pick-side-specific format for storage & best-line selection.
 * Returns array of { book, spread, spread_odds, ml } from the perspective of the picked team.
 */
// Prediction markets excluded from odds pipeline (not real sportsbooks)
const EXCLUDED_VENDORS = new Set(['kalshi', 'polymarket']);

function formatOddsForStorage(oddsArray, pick, homeTeam, awayTeam) {
  if (!Array.isArray(oddsArray) || oddsArray.length === 0) return null;
  // Filter out prediction markets (Kalshi, Polymarket) — not real sportsbooks
  oddsArray = oddsArray.filter(row => {
    const vendor = (row.displayName || row.vendor || '').toLowerCase();
    return !EXCLUDED_VENDORS.has(vendor);
  });
  // Determine which side the pick is on (home or away)
  const pickLower = (pick || '').toLowerCase();
  const homeLower = (homeTeam || '').toLowerCase();
  const awayLower = (awayTeam || '').toLowerCase();
  const homeLastWord = homeLower.split(' ').pop();
  const awayLastWord = awayLower.split(' ').pop();
  let isHomePick = homeLastWord && pickLower.includes(homeLastWord);
  // Disambiguate when both teams share a last word (e.g., "Georgia Bulldogs" vs "Mississippi State Bulldogs")
  if (isHomePick && awayLastWord && awayLastWord === homeLastWord) {
    const homeFullMatch = pickLower.includes(homeLower);
    const awayFullMatch = pickLower.includes(awayLower);
    if (awayFullMatch && !homeFullMatch) isHomePick = false;
  }
  return oddsArray.map(row => {
    // BDL returns spread as string ("8.5") — convert to number for consistent storage
    const rawSpread = isHomePick ? row.spread_home : row.spread_away;
    const spreadNum = rawSpread != null ? parseFloat(rawSpread) : NaN;
    // Draw picks: the pick-side "ml" is the draw price, not either team's.
    const isDrawPick = pickLower.startsWith('draw');
    return {
    book: row.displayName || row.vendor || 'Unknown',
    spread: Number.isFinite(spreadNum) ? spreadNum : null,
    spread_odds: isHomePick ? row.spread_home_odds : row.spread_away_odds,
    ml: isDrawPick ? (row.ml_draw ?? null) : (isHomePick ? row.ml_home : row.ml_away),
    // Keep full data for Supabase storage
    spread_home: row.spread_home,
    spread_away: row.spread_away,
    ml_home: row.ml_home,
    ml_away: row.ml_away,
    ...(row.ml_draw != null ? { ml_draw: row.ml_draw } : {}),
    total: row.total,
    total_over_odds: row.total_over_odds,
    total_under_odds: row.total_under_odds
  };
  });
}

/**
 * Identify a football pick's exact sportsbook without electing a new market.
 * Spreads already use the explicit best-line election below. Moneylines/totals
 * historically stored the chosen number and price but dropped the vendor; this
 * recovers it only when one BDL book matches BOTH exactly. No consensus or
 * cross-book fallback is allowed.
 */
function exactFootballMarketBook(sportsbookOdds, result) {
  if (!Array.isArray(sportsbookOdds) || !result) return null;
  const wantedOdds = finiteNumber(result.odds);
  if (wantedOdds == null) return null;
  const pickText = String(result.pick || '').trim().toLowerCase();
  const candidates = sportsbookOdds.filter((row) => {
    if (!row?.book || normalizeVendorForReceipt(row.book) === 'unknown') return false;
    if (result.type === 'moneyline') return finiteNumber(row.ml) === wantedOdds;
    if (result.type !== 'total') return false;
    const wantedLine = finiteNumber(result.total);
    if (wantedLine == null || finiteNumber(row.total) !== wantedLine) return false;
    const rowOdds = pickText.startsWith('over')
      ? finiteNumber(row.total_over_odds)
      : pickText.startsWith('under')
        ? finiteNumber(row.total_under_odds)
        : null;
    return rowOdds === wantedOdds;
  });
  candidates.sort((a, b) => normalizeVendorForReceipt(a.book).localeCompare(normalizeVendorForReceipt(b.book)));
  return candidates[0]?.book ?? null;
}

function normalizeVendorForReceipt(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
const { supabase } = await import('../src/supabaseClient.js');
const { classOf, classWinRates, winnersScore } = await import('../src/services/pickdesk/winnersScore.js');
const { reviewPick } = await import('../src/services/pickdesk/winnersReviewer.js');
const { isFirstDogOfDay, isBigGame, winnersDecision, loadBigGameOverrides } = await import('../src/services/pickdesk/winnersRules.js');
const { pickIsHome } = await import('../src/services/agentic/rationaleLanes.js');
const { buildShadowPick } = await import('../src/services/shadow/shadowPick.js');

/**
 * THE WINNERS ROUTE (founder GO, Sep 2 2026): runs AFTER the pick is stored,
 * never before — the free pick posts on time; the Winners row follows.
 *   1. THE FIRST DOG OF THE DAY — the league's first plus-money moneyline,
 *      automatic. 2. THE BIG GAME — automatic. 3. THE REVIEWER — a separate
 *      brain answers the founder's checklist against the desk and both
 *      cases; STRONG goes on the board. Everything lands in winners_reviews
 *      (one row per game), which the page, the record and the ledger read.
 * Fail-soft end to end: nothing here can throw into the pick loop.
 */
async function routeToWinners({ league, game, slate, result, cleanPick, deskText }) {
  try {
    const gameDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const gameId = String(cleanPick.game_id ?? cleanPick.bdl_game_id ?? game?.id ?? '');
    let firstDog = false;
    let bigGame = false;
    try {
      const stored = await picksService.getStoredPicksForDate(gameDate, league);
      firstDog = isFirstDogOfDay({ ...cleanPick, game_id: gameId }, stored);
      bigGame = isBigGame({
        league,
        game: {
          ...(game || {}),
          id: gameId,
          commence_time: cleanPick.commence_time || game?.commence_time || null,
          home_team: cleanPick.homeTeam,
          away_team: cleanPick.awayTeam,
          homeRanking: cleanPick.homeRanking ?? game?.homeRanking ?? null,
          awayRanking: cleanPick.awayRanking ?? game?.awayRanking ?? null,
        },
        slate: Array.isArray(slate) && slate.length > 1 ? slate : [],
        dateEt: gameDate,
        overrides: loadBigGameOverrides(),
      });
      // THE BIG GAME from the whole slate (founder ruling, Sep 3 2026): the
      // daily slate publisher decided it for the day; this child only sees
      // its own game, so it reads the row.
      if (!bigGame) {
        const named = await picksService.getWinnersBigGame(gameDate, league);
        if (named && String(named.game_id) === gameId) bigGame = true;
      }
    } catch (ruleErr) {
      console.warn(`   ⚠️ [Winners] rules skipped (${ruleErr.message})`);
    }
    const rev = deskText
      ? await reviewPick({
          league,
          deskText,
          caseHome: cleanPick.path_home ?? result?.path_home ?? null,
          caseAway: cleanPick.path_away ?? result?.path_away ?? null,
          homeTeam: cleanPick.homeTeam,
          awayTeam: cleanPick.awayTeam,
          pickText: cleanPick.pick,
          odds: cleanPick.odds,
          betType: cleanPick.type,
          pickIsHome: pickIsHome(cleanPick),
          rationale: cleanPick.rationale,
          // The blind read sees the cases in the game's own order.
          first: league === 'MLB' && mlbCaseHeadings(cleanPick.homeTeam, cleanPick.awayTeam, game).order === 'away-first' ? 'away' : 'home',
        })
      : { ok: false, error: 'no desk text on the result' };
    const decision = winnersDecision({ verdict: rev.ok ? rev.verdict : null, firstDog, bigGame });
    const oddsNum = Number(cleanPick.odds);
    await picksService.storeWinnersReview({
      game_date: gameDate,
      league,
      game_id: gameId,
      pick_text: cleanPick.pick,
      matchup: `${cleanPick.awayTeam} @ ${cleanPick.homeTeam}`,
      odds: Number.isFinite(oddsNum) ? Math.round(oddsNum) : null,
      bet_type: cleanPick.type || null,
      on_board: decision.on_board,
      reason: decision.reason,
      verdict: rev.ok ? rev.verdict : null,
      decided_by: rev.ok ? rev.decided_by : null,
      review: rev.ok ? rev.review : null,
      review_error: rev.ok ? null : (rev.error || 'review failed'),
      model: rev.model || null,
      ms: Number.isFinite(rev.ms) ? Math.round(rev.ms) : null,
      reviewed_at: new Date().toISOString(),
    });
    console.log(`🏆 [Winners] ${cleanPick.pick}: ${decision.on_board ? 'ON THE BOARD' : 'off the board'}${decision.reason ? ` (${decision.reason})` : ''} · review ${rev.ok ? `${rev.verdict} — ${rev.decided_by}` : `failed: ${rev.error}`}${rev.ms ? ` · ${Math.round(rev.ms / 1000)}s` : ''}`);
  } catch (e) {
    console.warn(`   ⚠️ [Winners] route skipped (${e.message}) — pick unaffected`);
  }
}

const DAILY_SLATE_LEAGUE = {
  americanfootball_nfl: 'NFL',
  americanfootball_ncaaf: 'NCAAF',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
};

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Recover one exact scheduled game from the already-published morning slate.
 * This is a real frozen sportsbook snapshot, never a fabricated line. It is
 * only used for scheduler `--game-id` runs when BDL's live path is empty or
 * missing a market; valid live fields always win in the merge below.
 */
async function fetchDailySlateGame(sportKey, etDate, gameId) {
  const league = DAILY_SLATE_LEAGUE[sportKey];
  if (!league || !etDate || gameId == null) return null;

  const { data, error } = await supabase
    .from('daily_slate')
    .select('date,league,bdl_game_id,away_team,home_team,commence_time,spread,ml_away,ml_home,total,line_vendor')
    .eq('date', etDate)
    .eq('league', league)
    .eq('bdl_game_id', String(gameId))
    .limit(1);
  if (error) throw new Error(`daily_slate exact-game read failed: ${error.message}`);
  const row = data?.[0];
  if (!row) return null;

  const spreadHome = finiteNumber(row.spread);
  const mlHome = finiteNumber(row.ml_home);
  const mlAway = finiteNumber(row.ml_away);
  const total = finiteNumber(row.total);
  const vendor = row.line_vendor || 'opening-snapshot';
  const markets = [];
  if (mlHome !== null && mlAway !== null) {
    markets.push({
      key: 'h2h',
      outcomes: [
        { name: row.home_team, price: mlHome },
        { name: row.away_team, price: mlAway },
      ],
    });
  }

  return {
    id: row.bdl_game_id,
    bdl_game_id: row.bdl_game_id,
    sport_key: sportKey,
    home_team: row.home_team,
    away_team: row.away_team,
    commence_time: row.commence_time,
    spread_home: spreadHome,
    spread_away: spreadHome === null ? null : -spreadHome,
    spread_home_odds: null,
    spread_away_odds: null,
    moneyline_home: mlHome,
    moneyline_away: mlAway,
    total,
    line_vendor: vendor,
    line_snapshot: 'opening',
    // dailySlateService writes NCAAF rows only after the provider-grounded
    // FBS policy has accepted both teams. Carry that exact internal provenance
    // into this recovery object; no caller-supplied verified flag is trusted.
    ...(sportKey === 'americanfootball_ncaaf'
      ? { ncaaf_fbs_verified: true, ncaaf_fbs_verification_source: 'daily_slate' }
      : {}),
    bookmakers: markets.length ? [{ key: vendor, title: vendor, markets }] : [],
  };
}

function isVerifiedNcaafSlateFallback(game) {
  return game?.ncaaf_fbs_verified === true
    && ['daily_slate', 'provider_exact'].includes(game?.ncaaf_fbs_verification_source);
}

function mergeExactGameWithSlate(liveGame, slateGame) {
  if (!liveGame) return slateGame;
  if (!slateGame) return liveGame;
  const liveHasMl = finiteNumber(liveGame.moneyline_home) !== null && finiteNumber(liveGame.moneyline_away) !== null;
  const liveHasPricedSpread = finiteNumber(liveGame.spread_home) !== null &&
    (finiteNumber(liveGame.spread_home_odds) !== null || finiteNumber(liveGame.spread_away_odds) !== null);
  const liveHasBook = Array.isArray(liveGame.bookmakers) && liveGame.bookmakers.some(book => Array.isArray(book?.markets) && book.markets.length > 0);
  return {
    ...slateGame,
    ...liveGame,
    moneyline_home: liveHasMl ? liveGame.moneyline_home : slateGame.moneyline_home,
    moneyline_away: liveHasMl ? liveGame.moneyline_away : slateGame.moneyline_away,
    spread_home: liveHasPricedSpread ? liveGame.spread_home : slateGame.spread_home,
    spread_away: liveHasPricedSpread ? liveGame.spread_away : slateGame.spread_away,
    spread_home_odds: liveHasPricedSpread ? liveGame.spread_home_odds : null,
    spread_away_odds: liveHasPricedSpread ? liveGame.spread_away_odds : null,
    total: finiteNumber(liveGame.total) !== null ? liveGame.total : slateGame.total,
    line_vendor: liveHasMl || liveHasPricedSpread ? (liveGame.line_vendor ?? slateGame.line_vendor) : slateGame.line_vendor,
    line_snapshot: liveHasMl || liveHasPricedSpread ? (liveGame.line_snapshot ?? 'live') : 'opening',
    bookmakers: liveHasBook ? liveGame.bookmakers : slateGame.bookmakers,
  };
}

// WINNERS SCORE v1 (founder GO, Aug 10): trailing-30d class rates from the
// graded ledger, fetched once per run. A failed fetch scores every pick
// from the neutral base — never blocks storage.
let _winnersClassRates = null;
async function getWinnersClassRates() {
  if (_winnersClassRates) return _winnersClassRates;
  try {
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data } = await supabase.from('game_results')
      .select('pick_text, result')
      .eq('league', 'MLB')
      .gte('game_date', since)
      .limit(1000);
    _winnersClassRates = classWinRates(data || []);
  } catch { _winnersClassRates = {}; }
  return _winnersClassRates;
}
// Graceful shutdown handler — log and exit cleanly on SIGTERM/SIGINT
// Picks stored before the signal are already safe in Supabase (incremental storage)
process.on('SIGTERM', () => {
  console.log('\n⚠️ Received SIGTERM — shutting down gracefully...');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('\n⚠️ Received SIGINT — shutting down gracefully...');
  process.exit(0);
});

// Simple system: Gary picks SPREAD or ML.
// ═══════════════════════════════════════════════════════════════════════════
// GARY PICK GENERATION
// ═══════════════════════════════════════════════════════════════════════════

// Configuration
// All US sports use EST-based "today" filtering - games happening today that haven't started yet
const SPORT_CONFIG = {
  nba: { key: 'basketball_nba', name: 'NBA', emoji: '🏀', useToday: true }, // Today's games (EST)
  nfl: { key: 'americanfootball_nfl', name: 'NFL', emoji: '🏈', daysAhead: 7 }, // NFL is weekly
  nhl: { key: 'icehockey_nhl', name: 'NHL', emoji: '🏒', isBeta: true, useToday: true }, // Today's games (EST)
  ncaab: { key: 'basketball_ncaab', name: 'NCAAB', emoji: '🏀', useToday: true }, // Today's games (EST) — Flash pre-investigates 20-30 stat calls per game; Gary's own fetch_stats are supplementary
  ncaaf: { key: 'americanfootball_ncaaf', name: 'NCAAF', emoji: '🏈', fbsOnly: true, useToday: true }, // Today's games (EST)
  mlb: { key: 'baseball_mlb', name: 'MLB', emoji: '⚾', useToday: true },
};

// ═══════════════════════════════════════════════════════════════════════════
// PICK LOGGING & TRANSPARENCY
// ═══════════════════════════════════════════════════════════════════════════
// 
// Gary evaluates the full slate and makes a pick.
// We do not filter by confidence or apply hard rules here.
// This section only provides transparency tags (e.g., rest, injuries, traps).
// ═══════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════

// In-memory tracking to prevent duplicate processing in same run session
// This prevents race conditions where DB check passes but pick is already being generated
const processedGamesThisSession = new Set();
const existingPickGameIds = new Set();

function getGameKey(homeTeam, awayTeam) {
  return `${homeTeam}|${awayTeam}`.toLowerCase().trim();
}

// Parse arguments
const args = process.argv.slice(2);
const runAll = args.includes('--all');
const sportsToRun = [];

function getArgValue(flag) {
  // Supports: --flag value  |  --flag=value
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const next = args[idx + 1];
  if (!next || next.startsWith('--')) return undefined;
  return next;
}

function parseBoolish(val, defaultValue = true) {
  if (val === undefined || val === null) return defaultValue;
  const v = String(val).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
  return defaultValue;
}

const shouldStore = parseBoolish(getArgValue('--store'), true);

// --matchup flag to run a single specific game (e.g., "Bengals @ Dolphins" or "Cincinnati")
const matchupFilter = getArgValue('--matchup');
// --game-id flag to run exactly one game by BDL game id (used by the scheduler).
// This is unambiguous — no substring collisions, no doubleheader issues.
const gameIdFilter = getArgValue('--game-id');
// --force flag to skip deduplication check (for re-running specific games)
const forceRerun = args.includes('--force');
// --date flag to filter games to specific date(s) (e.g., "2025-12-25" or "2025-12-25,2025-12-26")
// Scheduler exact-game runs are always for the current ET slate. Supplying an
// exact game id without a date used to reopen NFL's entire rolling week, spend
// eight BDL requests, and then lose the requested game to 429s. Derive today's
// ET date for that exact-id path; manual weekly runs without --game-id retain
// the existing weekly behavior.
const requestedDateFilter = getArgValue('--date');
const dateFilter = requestedDateFilter || (gameIdFilter
  ? (args.includes('--ncaaf')
      ? ncaafSlateDateForInstant(new Date())
      : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()))
  : undefined);
// --dynamic flag to enable dynamic slate review (organic pick selection based on board quality)
const useDynamicSlateReview = args.includes('--dynamic');
// NCAAB always filters to NCAA Tournament games during March Madness (no flag needed)
// --advance-days N: also fetch and pick games for N days ahead (e.g., --advance-days 2 picks today + tomorrow + day after)
const advanceDays = parseInt(getArgValue('--advance-days'), 10) || 0;
// --test flag to store picks in test_daily_picks table instead of production (for testing)
const useTestTable = args.includes('--test');
// --test-name flag to label the test run (e.g., "Sharp Betting Reference Test")
const testName = getArgValue('--test-name');
// --limit flag to limit number of games to analyze (useful for testing)
const gameLimit = parseInt(getArgValue('--limit'), 10) || null;
// --offset flag to skip N games before applying limit (for parallel terminals)
const gameOffset = parseInt(getArgValue('--offset'), 10) || 0;
// --time flag to filter games by start time in EST (e.g., "12" for 12pm, "12,1" for 12pm and 1pm)
const timeFilter = getArgValue('--time');

if (runAll) {
  sportsToRun.push('nba', 'nfl', 'nhl', 'ncaab', 'ncaaf');
} else {
  if (args.includes('--nba')) sportsToRun.push('nba');
  if (args.includes('--nfl')) sportsToRun.push('nfl');
  if (args.includes('--nhl')) sportsToRun.push('nhl');
  if (args.includes('--ncaab')) sportsToRun.push('ncaab');
  if (args.includes('--ncaaf')) sportsToRun.push('ncaaf');
  if (args.includes('--mlb')) sportsToRun.push('mlb');
}

if (sportsToRun.length === 0) {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                 🐻 GARY AGENTIC PICKS GENERATOR                  ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Usage:                                                          ║
║    node scripts/run-agentic-picks.js --nba                       ║
║    node scripts/run-agentic-picks.js --nfl                       ║
║    node scripts/run-agentic-picks.js --nhl   (BETA)              ║
║    node scripts/run-agentic-picks.js --ncaab                     ║
║    node scripts/run-agentic-picks.js --ncaaf                     ║
║    node scripts/run-agentic-picks.js --all                       ║
║                                                                  ║
║  Or combine sports:                                              ║
║    node scripts/run-agentic-picks.js --nba --nfl                 ║
║                                                                  ║
║  Advanced options:                                               ║
║    --date 2025-12-25           (filter to specific date)         ║
║    --date 2025-12-25,2025-12-26 (multiple dates)                 ║
║    --time 12                   (filter to 12pm EST games)        ║
║    --time 12,13                (filter to 12pm and 1pm EST)      ║
║    --limit 5                   (limit to N games)                ║
║    --force                     (skip deduplication)              ║
║    --store false               (analyze only, don't save)        ║
║    --test                      (store to test_daily_picks table) ║
║    --test-name "My Test"       (label the test run)              ║
║    --matchup "Chicago"         (run single game only)            ║
║    --fresh                     (clear cache for fresh data)      ║
║                                                                  ║
║  Gary's Pick System:                                             ║
║    - Gary always picks a side (SPREAD or MONEYLINE)              ║
║    - No PASS, no totals — spread/ML only                         ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);
  process.exit(0);
}

// Check environment variables
function checkEnv() {
  const checks = [
    // ANTHROPIC_API_KEY powers the researcher pool + grounded-search fallback
    // (GEMINI_API_KEY was required here until Aug 24 2026 — vendor retired).
    { name: 'ANTHROPIC_API_KEY', alts: [] },
    { name: 'SUPABASE_URL', alts: ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'] },
    { name: 'SUPABASE_SERVICE_ROLE_KEY', alts: ['SUPABASE_SERVICE_KEY', 'VITE_SUPABASE_SERVICE_ROLE_KEY'] }
  ];
  const missing = [];

  for (const check of checks) {
    let value = process.env[check.name];
    if (!value) {
      for (const alt of check.alts) {
        if (process.env[alt]) {
          value = process.env[alt];
          break;
        }
      }
    }
    if (!value) {
      missing.push(check.name);
    }
  }

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(k => console.error(`   - ${k}`));
    console.error('\nMake sure you have a .env file with these variables.');
    process.exit(1);
  }
}

// Main execution
async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║              🐻 GARY AGENTIC PICKS GENERATOR 🐻                  ║
║                                                                  ║
║        Stats-First Analysis | Tool-Calling Research              ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);

  checkEnv();

  // OUTBOX FLUSH (Aug 24 2026, Aug 23 outage post-mortem): a pick generated
  // during a storage outage is spooled to disk instead of discarded (see
  // storePicks below). Flushing here — before any research — means a retry
  // tier after an outage lands the rescued pick in seconds instead of
  // re-running the whole pipeline, and the exact-game preflight then sees it
  // stored. No-ops in dry-run/test modes and when the outbox is empty.
  if (shouldStore && !useTestTable && !process.argv.includes('--dry-run')) {
    try {
      const { flushOutbox } = await import('./lib/pickOutbox.js');
      const etToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const flushed = await flushOutbox({
        dateStr: etToday,
        assertStillPregame: assertPicksStillPregame,
        storeDaily: (spooledPicks, spoolDate) => picksService.storeDailyPicksInDatabase(
          spooledPicks,
          spoolDate || null,
          { beforeRetry: () => assertPicksStillPregame(spooledPicks) },
        ),
        storeNflWeekly: (spooledPicks) => picksService.storeWeeklyNFLPicks(spooledPicks),
      });
      for (const flushedId of flushed.flushed) existingPickGameIds.add(String(flushedId));
    } catch (e) {
      console.warn(`⚠️ [Outbox] flush pass failed (non-fatal): ${e.message}`);
    }
  }

  // Clear cache if --nocache or --fresh flag is passed (ensures fresh injury/lineup data)
  if (process.argv.includes('--nocache') || process.argv.includes('--fresh')) {
    console.log('🔄 Clearing all caches for fresh injury/lineup data...');
    ballDontLieService.clearCache();
    console.log('✅ Cache cleared - fetching fresh data from APIs\n');
  }

  const startTime = Date.now();
  const allPicks = [];
  const summary = {};

  for (const sportShort of sportsToRun) {
    const config = SPORT_CONFIG[sportShort];
    const sportStartTime = Date.now();


    console.log(`\n${'═'.repeat(70)}`);
    console.log(`${config.emoji} STARTING ${config.name} ANALYSIS`);
    console.log(`${'═'.repeat(70)}\n`);

    try {
      // Scheduler retries are exact-game runs. If that provider game id is
      // already durably stored, stop before touching BDL or the model. The old
      // path fetched the full slate first, so a harmless retry could spend
      // minutes in the shared rate-limit queue and delay the next live game.
      // `--force`, dry runs and test-table runs intentionally bypass this.
      if (gameIdFilter && !forceRerun && shouldStore && !useTestTable) {
        const preflightDate = dateFilter?.split(',')[0]?.trim();
        const stored = await picksService.pickAlreadyStoredByGameId(
          config.name,
          preflightDate,
          gameIdFilter,
        );
        if (stored?.exists) {
          console.log(`[${config.name}] ⏭️ Exact game ${gameIdFilter} is already stored (${stored.source}); skipping upstream fetch and analysis`);
          existingPickGameIds.add(String(gameIdFilter));
          summary[config.name] = {
            games: 1,
            picks: 0,
            existing: 1,
            time: (Date.now() - sportStartTime) / 1000,
          };
          continue;
        }
      }

      // Fetch games
      console.log(`[${config.name}] Fetching upcoming games...`);

      let allGames = await oddsService.getUpcomingGames(config.key, {
        nocache: true,
        targetDate: dateFilter,
        ...exactFootballGameDiscoveryOptions(config.key, gameIdFilter),
      });
      if (gameIdFilter && dateFilter) {
        try {
          const slateGame = await fetchDailySlateGame(config.key, dateFilter.split(',')[0].trim(), gameIdFilter);
          if (slateGame) {
            const liveIndex = (allGames || []).findIndex(game => String(game.bdl_game_id ?? game.id ?? '') === String(gameIdFilter));
            if (liveIndex >= 0) {
              allGames[liveIndex] = mergeExactGameWithSlate(allGames[liveIndex], slateGame);
            } else {
              allGames = [...(allGames || []), slateGame];
            }
            console.log(`[${config.name}] Exact game ${gameIdFilter}: daily_slate opening snapshot armed as verified market fallback`);
          }
        } catch (slateError) {
          console.warn(`[${config.name}] Exact daily_slate fallback unavailable: ${slateError.message}`);
        }
      }

      // Filter to games within time window
      const now = new Date();
      let games;
      let timeLabel;

      // NFL: Filter to current NFL week or playoffs
      if (config.key === 'americanfootball_nfl') {
        const currentWeekNumber = picksService.getNFLWeekNumber();
        const currentWeekStart = picksService.getNFLWeekStart();

        // Detect if we're in playoffs based on DATE (Odds API doesn't have postseason flag)
        // NFL playoffs: Wild Card (early Jan), Divisional (mid Jan), Championship (late Jan), Super Bowl (early Feb)
        // Regular season ends around Week 18 (typically first week of January)
        const month = now.getMonth() + 1; // 1-indexed
        const day = now.getDate();
        const isPlayoffPeriod = (month === 1 && day >= 10) || (month === 2 && day <= 15);
        const hasPlayoffGames = isPlayoffPeriod;

        if (isPlayoffPeriod) {
          console.log(`[${config.name}] Date check: ${month}/${day} - NFL Playoffs period detected`);
        }

        // CHECK: If --date flag is provided, filter to specific date(s) ONLY
        if (dateFilter) {
          // Parse comma-separated dates (e.g., "2025-12-25,2025-12-26")
          const targetDates = dateFilter.split(',').map(d => d.trim());
          console.log(`[${config.name}] --date filter active: targeting ${targetDates.join(', ')}`);

          games = allGames?.filter(g => {
            const gameTime = new Date(g.commence_time);
            const gameDateEST = config.key === 'americanfootball_ncaaf'
              ? ncaafSlateDateForInstant(gameTime)
              : gameTime.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
            // Game date matches one of the target dates
            return targetDates.includes(gameDateEST);
          }) || [];

          timeLabel = `${targetDates.join(' & ')}`;
          console.log(`[${config.name}] Date filter: found ${games.length} games on ${targetDates.join(', ')}`);
        } else if (hasPlayoffGames) {
          // PLAYOFFS: Use simple rolling window instead of week-based filtering
          // Playoffs have irregular schedules (Wild Card weekend = Sat+Sun, Divisional = Sat+Sun, etc.)
          console.log(`[${config.name}] 🏈 PLAYOFFS DETECTED - using rolling window filter`);

          // Get all games within next 48 hours that haven't started
          const windowMs = 48 * 60 * 60 * 1000; // 48 hours
          games = allGames?.filter(g => {
            const gameTime = new Date(g.commence_time);
            return gameTime > now && gameTime <= new Date(now.getTime() + windowMs);
          }) || [];

          // Determine playoff round based on date (already have month/day from above)
          let playoffRound = 'Playoffs';
          if (month === 1) {
            if (day >= 10 && day <= 16) playoffRound = 'Wild Card';
            else if (day >= 17 && day <= 23) playoffRound = 'Divisional';
            else if (day >= 24 && day <= 31) playoffRound = 'Conference Championship';
          } else if (month === 2) {
            if (day <= 7) playoffRound = 'Conference Championship';
            else if (day <= 15) playoffRound = 'Super Bowl';
          }

          timeLabel = `NFL ${playoffRound}`;
          console.log(`[${config.name}] NFL ${playoffRound}: found ${games.length} games in next 48h`);
        } else {
          // REGULAR SEASON: Default NFL week-based filtering
          // NFL weeks run Tuesday-Monday, so we filter games that belong to the current week
          // Get end of current week (next Tuesday 5:00 AM ET to catch late Monday games)
          const weekStartDate = new Date(currentWeekStart + 'T00:00:00');
          const weekEndDate = new Date(weekStartDate);
          weekEndDate.setDate(weekEndDate.getDate() + 7); // Tuesday of next week
          weekEndDate.setHours(5, 0, 0, 0); // 5 AM to catch any late Monday finishes

          // Check if today is Monday (MNF day) - only process today's games
          const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
          const dayOfWeek = estNow.getDay(); // 0 = Sunday, 1 = Monday
          const isMonday = dayOfWeek === 1;

          if (isMonday) {
            // On Monday, only process Monday Night Football (games happening today)
            const todayStart = new Date(estNow);
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date(estNow);
            todayEnd.setHours(23, 59, 59, 999);

            games = allGames?.filter(g => {
              const gameTime = new Date(g.commence_time);
              const gameTimeEST = new Date(gameTime.toLocaleString("en-US", { timeZone: "America/New_York" }));
              // Game must be in the future AND happening today (Monday Night Football)
              return gameTime >= now && gameTimeEST >= todayStart && gameTimeEST <= todayEnd;
            }) || [];

            timeLabel = `MNF (Week ${currentWeekNumber})`;
            console.log(`[${config.name}] Monday Night Football filter: only today's games`);
          } else {
            // Other days, process the full week
            games = allGames?.filter(g => {
              const gameTime = new Date(g.commence_time);
              // Game must be in the future AND within the current NFL week
              return gameTime >= now && gameTime >= weekStartDate && gameTime < weekEndDate;
            }) || [];

            timeLabel = `Week ${currentWeekNumber} (${currentWeekStart})`;
            console.log(`[${config.name}] NFL Week ${currentWeekNumber} filter: weekStart=${currentWeekStart}, weekEnd=${weekEndDate.toISOString()}`);
          }
        }
      } else if (config.useToday) {
        // CHECK: If --date flag is provided, filter to specific date(s) instead of today
        if (dateFilter) {
          const targetDates = dateFilter.split(',').map(d => d.trim());
          console.log(`[${config.name}] --date filter active: targeting ${targetDates.join(', ')}`);
          
          games = allGames?.filter(g => {
            const gameTime = new Date(g.commence_time);
            const gameDateEST = gameTime.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
            // Game date matches one of the target dates
            return targetDates.includes(gameDateEST);
          }) || [];
          
          timeLabel = `${targetDates.join(' & ')}`;
          console.log(`[${config.name}] Date filter: found ${games.length} games on ${targetDates.join(', ')}`);
        } else {
          // Default: Get TODAY's games in EST timezone
          const todayEST = config.key === 'americanfootball_ncaaf'
            ? ncaafSlateDateForInstant(now)
            : now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD format

          const isNCAAB = config.key === 'basketball_ncaab';
          const isNHL = config.key === 'icehockey_nhl';
          const isMLB = config.key === 'baseball_mlb';

          games = allGames?.filter(g => {
            const gameTime = new Date(g.commence_time);
            const gameDateEST = config.key === 'americanfootball_ncaaf'
              ? ncaafSlateDateForInstant(gameTime)
              : gameTime.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

            // Game must be today in EST AND hasn't started yet
            return gameDateEST === todayEST && gameTime >= now;
          }) || [];

          timeLabel = `today (${todayEST})`;
          console.log(`[${config.name}] EST date filter: today=${todayEST}, found ${games.length} ${isNCAAB ? 'games' : 'upcoming games'}`);
        }
      } else if (config.daysAhead) {
        // Weekly sports: Use days ahead
        const endTime = new Date(now.getTime() + config.daysAhead * 24 * 60 * 60 * 1000);
        games = allGames?.filter(g => {
          const gameTime = new Date(g.commence_time);
          return gameTime >= now && gameTime <= endTime;
        }) || [];
        timeLabel = 'this week';
      } else {
        // Fallback: all upcoming games
        games = allGames?.filter(g => new Date(g.commence_time) >= now) || [];
        timeLabel = 'upcoming';
      }

      // NFL: Enrich games with playoff round significance (Wild Card, Divisional, Championship, Super Bowl)
      if (config.key === 'americanfootball_nfl' && games.length > 0) {
        const weekToSignificance = {
          1: 'Wild Card',
          2: 'Divisional Round',
          3: 'Conference Championship',
          4: 'Super Bowl'
        };
        if (gameIdFilter) {
          // The exact provider response already carries postseason/week. Do not
          // download the full postseason slate just to label one scheduler game.
          for (const game of games) {
            if (game.postseason && game.week) {
              game.gameSignificance = weekToSignificance[game.week] || 'Playoff';
            }
          }
        } else try {
          console.log(`[${config.name}] Checking for postseason games via BDL...`);
          const bdlGames = await ballDontLieService.getGames('americanfootball_nfl', {
            postseason: true,
            seasons: [new Date().getMonth() <= 2 ? new Date().getFullYear() - 1 : new Date().getFullYear()],
            per_page: 100
          });
          
          if (bdlGames && bdlGames.length > 0) {
            // Create a map of BDL games by team matchup for quick lookup
            const bdlGameMap = new Map();
            for (const g of bdlGames) {
              const homeKey = g.home_team?.full_name?.toLowerCase() || g.home_team?.name?.toLowerCase() || '';
              const awayKey = g.visitor_team?.full_name?.toLowerCase() || g.visitor_team?.name?.toLowerCase() || '';
              const key = `${homeKey}:${awayKey}`;
              bdlGameMap.set(key, g);
            }
            
            // Enrich each game with gameSignificance
            for (const game of games) {
              const homeKey = game.home_team?.toLowerCase() || '';
              const awayKey = game.away_team?.toLowerCase() || '';
              const key = `${homeKey}:${awayKey}`;
              
              const bdlGame = bdlGameMap.get(key);
              if (bdlGame && bdlGame.postseason && bdlGame.week) {
                game.gameSignificance = weekToSignificance[bdlGame.week] || 'Playoff';
                console.log(`[${config.name}] ✓ ${game.away_team} @ ${game.home_team}: ${game.gameSignificance}`);
              }
            }
          }
        } catch (err) {
          console.warn(`[${config.name}] Could not fetch postseason data from BDL:`, err.message);
        }
      }

      // NCAAF: Filter to FBS only (exclude FCS games)
      if (config.fbsOnly && config.key === 'americanfootball_ncaaf') {
        console.log(`[${config.name}] Filtering to FBS games only (excluding FCS)...`);
        const beforeCount = games.length;
        const verifiedSlateFallbacks = games.filter(isVerifiedNcaafSlateFallback);
        const providerGames = games.filter((game) => !isVerifiedNcaafSlateFallback(game));
        // An exact authoritative morning-slate fallback has already passed the
        // provider policy, so it must not depend on a second BDL teams request
        // during the outage/rate-limit condition it exists to recover from.
        const ncaafTeams = providerGames.length > 0
          ? await ballDontLieService.getTeams('americanfootball_ncaaf')
          : [];
        const classified = classifyNcaafFbsGames(
          providerGames,
          ncaafTeams,
        );
        if (classified.unresolved.length > 0) {
          throw new Error(
            `NCAAF FBS identity unresolved for ${classified.unresolved.length} game(s); refusing a partial pick slate`,
          );
        }
        const accepted = new Set([...classified.accepted, ...verifiedSlateFallbacks]);
        games = games.filter((game) => accepted.has(game));
        console.log(`[${config.name}] FBS filter: ${beforeCount} → ${games.length} games (removed ${beforeCount - games.length} FCS games)`);
      }

      // NCAAB Tournament: use bracket endpoint as authoritative game source + filter out NIT
      if (config.key === 'basketball_ncaab') {
        try {
          const { ballDontLieService: bdl } = await import('../src/services/ballDontLieService.js');
          const bracket = await bdl.getNcaabBracket(ncaabSeason());
          if (bracket && bracket.length > 0) {
            // Build set of tournament team names for NIT filtering
            const tournamentTeams = new Set();
            for (const g of bracket) {
              if (g.home_team?.full_name) tournamentTeams.add(g.home_team.full_name.toLowerCase());
              if (g.home_team?.name) tournamentTeams.add(g.home_team.name.toLowerCase());
              if (g.away_team?.full_name) tournamentTeams.add(g.away_team.full_name.toLowerCase());
              if (g.away_team?.name) tournamentTeams.add(g.away_team.name.toLowerCase());
            }

            // Filter odds-sourced games to tournament only
            const beforeCount = games.length;
            games = games.filter(g => {
              const homeMatch = tournamentTeams.has((g.home_team || '').toLowerCase());
              const awayMatch = tournamentTeams.has((g.away_team || '').toLowerCase());
              return homeMatch && awayMatch;
            });
            console.log(`[${config.name}] Tournament filter: ${beforeCount} → ${games.length} games (removed ${beforeCount - games.length} non-tournament games)`);

            // Merge in bracket games that the games/odds endpoint missed (e.g., Friday games still TBD in games API)
            const existingMatchups = new Set(games.map(g => `${(g.away_team||'').toLowerCase()}_${(g.home_team||'').toLowerCase()}`));
            // Filter bracket games by --date if provided
            const targetDatesForBracket = dateFilter ? dateFilter.split(',').map(d => d.trim()) : null;
            const bracketR1 = bracket.filter(bg => {
              if (bg.round !== 1 && bg.round !== 0) return false; // R64 + First Four only
              const away = bg.away_team?.full_name || bg.away_team?.name;
              const home = bg.home_team?.full_name || bg.home_team?.name;
              if (!away || !home || away === 'TBD' || home === 'TBD') return false;
              // Date filter: only include bracket games matching target date(s)
              if (targetDatesForBracket && bg.date) {
                const gameDate = new Date(bg.date).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
                if (!targetDatesForBracket.includes(gameDate)) return false;
              }
              // Skip if already in games list
              const key = `${away.toLowerCase()}_${home.toLowerCase()}`;
              const keyRev = `${home.toLowerCase()}_${away.toLowerCase()}`;
              return !existingMatchups.has(key) && !existingMatchups.has(keyRev);
            });

            if (bracketR1.length > 0) {
              // Convert bracket entries to game-like objects with odds lookup
              for (const bg of bracketR1) {
                const away = bg.away_team?.full_name || bg.away_team?.name;
                const home = bg.home_team?.full_name || bg.home_team?.name;
                // Try to find odds from our odds data
                const oddsKey1 = `${away.toLowerCase()}_${home.toLowerCase()}`;
                const oddsKey2 = `${home.toLowerCase()}_${away.toLowerCase()}`;
                const matchedOdds = (allGames || []).find(g =>
                  `${(g.away_team||'').toLowerCase()}_${(g.home_team||'').toLowerCase()}` === oddsKey1 ||
                  `${(g.away_team||'').toLowerCase()}_${(g.home_team||'').toLowerCase()}` === oddsKey2
                );
                games.push({
                  id: bg.id || `bracket-${away}-${home}`,
                  home_team: home,
                  away_team: away,
                  commence_time: bg.date || new Date().toISOString(),
                  spread_home: matchedOdds?.spread_home ?? null,
                  spread_away: matchedOdds?.spread_away ?? null,
                  moneyline_home: matchedOdds?.moneyline_home ?? null,
                  moneyline_away: matchedOdds?.moneyline_away ?? null,
                  total: matchedOdds?.total ?? null,
                  status: 'Pre-Game',
                  _fromBracket: true,
                });
              }
              console.log(`[${config.name}] Added ${bracketR1.length} games from bracket endpoint (missing from games API)`);
            }
            console.log(`[${config.name}] Total tournament games: ${games.length}`);
          } else {
            console.log(`[${config.name}] No bracket data available — skipping tournament filter`);
          }
        } catch (e) {
          console.log(`[${config.name}] Tournament filter error: ${e.message}`);
        }
      }

      // NCAAB: Attach conference names to games for storage (no conference filtering — Gary picks all games)
      if (config.key === 'basketball_ncaab') {
        const { ballDontLieService } = await import('../src/services/ballDontLieService.js');

        const CONF_ID_NAMES = {
          1: 'ACC', 2: 'America East', 3: 'Atlantic 10', 4: 'AAC', 5: 'Atlantic Sun',
          6: 'Big 12', 7: 'Big East', 8: 'Big Sky', 9: 'Big South',
          10: 'Big Ten', 11: 'Big West', 12: 'CAA', 13: 'Conference USA',
          14: 'Horizon', 15: 'Ivy League', 16: 'MAAC', 17: 'MEAC',
          18: 'MAC', 19: 'Missouri Valley', 20: 'Mountain West', 21: 'NEC',
          22: 'Ohio Valley', 23: 'Patriot', 24: 'SEC', 25: 'Southern',
          26: 'Southland', 27: 'SWAC', 28: 'Summit', 29: 'Sun Belt',
          30: 'WAC', 31: 'WCC', 32: 'West Coast', 33: 'Pac-12'
        };

        const getConfName = (confId) => {
          return CONF_ID_NAMES[confId] || `Conf-${confId}`;
        };

        const ncaabTeams = await ballDontLieService.getTeams('basketball_ncaab');
        const normalize = (name) => name?.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

        const teamMap = new Map();
        ncaabTeams.forEach(t => {
          if (t.full_name) teamMap.set(normalize(t.full_name), t);
          if (t.name) teamMap.set(normalize(t.name), t);
        });

        const findTeam = (name) => {
          const norm = normalize(name);
          if (teamMap.has(norm)) return teamMap.get(norm);
          for (const [key, team] of teamMap.entries()) {
            if (key.includes(norm) || norm.includes(key)) return team;
          }
          return null;
        };

        const skippedGames = [];
        console.log(`[${config.name}] Attaching conference data to ${games.length} games (all conferences accepted)...`);

        for (const game of games) {
          try {
            const homeTeam = findTeam(game.home_team);
            const awayTeam = findTeam(game.away_team);

            if (!homeTeam || !awayTeam) {
              skippedGames.push({ game, reason: 'Team not found in database' });
              continue;
            }

            game.homeConference = getConfName(homeTeam.conference_id);
            game.awayConference = getConfName(awayTeam.conference_id);
          } catch (err) {
            console.warn(`[${config.name}] Could not verify data for ${game.away_team} @ ${game.home_team}: ${err.message}`);
          }
        }

        if (skippedGames.length > 0) {
          console.log(`[${config.name}] ⚠️ Skipped ${skippedGames.length} games with insufficient data:`);
          skippedGames.slice(0, 5).forEach(({ game, reason }) => {
            console.log(`   - ${game.away_team} @ ${game.home_team}: ${reason}`);
          });
          if (skippedGames.length > 5) {
            console.log(`   ... and ${skippedGames.length - 5} more`);
          }
        }
        console.log(`[${config.name}] Conference data attached to ${games.length} games (all conferences accepted)`);

      }

      // NCAAF: stamp conference names + AP Top 25 ranks (founder, Aug 25 2026).
      // The app's college navigation defaults to ranked matchups and filters
      // the rest by conference — both reads come from these per-side fields.
      // Fail-soft by contract: navigation chrome never delays a pick.
      if (config.key === 'americanfootball_ncaaf' && games.length > 0) {
        try {
          const { attachNcaafGameMetadata } = await import('../src/services/ncaafGameMetadata.js');
          await attachNcaafGameMetadata(games);
        } catch (metaErr) {
          console.warn(`[${config.name}] Conference/rank stamping skipped: ${metaErr.message}`);
        }
      }

      // Apply --game-id filter (exact, used by scheduler — no ambiguity)
      if (gameIdFilter) {
        const targetId = String(gameIdFilter);
        const before = games.length;
        games = games.filter(game => String(game.bdl_game_id ?? game.id ?? '') === targetId);
        console.log(`[${config.name}] Game ID filter "${targetId}": ${before} -> ${games.length} games`);
        if (games.length === 0) {
          console.log(`[${config.name}] No game found with id "${targetId}"`);
        }
      }

      // Apply --matchup filter to run a single specific game
      if (matchupFilter) {
        const filterLower = matchupFilter.toLowerCase();
        const beforeMatchupFilter = games.length;
        games = games.filter(game => {
          const homeTeam = (game.home_team || '').toLowerCase();
          const awayTeam = (game.away_team || '').toLowerCase();
          // Match if filter appears in either team name
          return homeTeam.includes(filterLower) || awayTeam.includes(filterLower);
        });
        console.log(`[${config.name}] Matchup filter "${matchupFilter}": ${beforeMatchupFilter} -> ${games.length} games`);
        if (games.length === 0) {
          console.log(`[${config.name}] No games found matching "${matchupFilter}"`);
        }
      }

      // Apply --time filter to filter games by start time in EST (e.g., "12" for 12pm, "12,1" for 12pm and 1pm)
      if (timeFilter) {
        const targetHours = timeFilter.split(',').map(h => parseInt(h.trim(), 10));
        const beforeTimeFilter = games.length;
        games = games.filter(game => {
          const gameTime = new Date(game.commence_time);
          // Convert to EST hour (12-hour format for easier matching)
          const estHour = parseInt(gameTime.toLocaleString('en-US', { 
            timeZone: 'America/New_York', 
            hour: 'numeric', 
            hour12: false 
          }), 10);
          // Match if game hour matches any of the target hours
          return targetHours.includes(estHour);
        });
        const hoursDisplay = targetHours.map(h => `${h > 12 ? h - 12 : h}${h >= 12 ? 'pm' : 'am'}`).join(', ');
        console.log(`[${config.name}] Time filter (${hoursDisplay} EST): ${beforeTimeFilter} -> ${games.length} games`);
        if (games.length > 0) {
          games.forEach(g => {
            const gameTime = new Date(g.commence_time);
            const estTimeStr = gameTime.toLocaleString('en-US', { 
              timeZone: 'America/New_York', 
              hour: 'numeric', 
              minute: '2-digit',
              hour12: true 
            });
            console.log(`   - ${g.away_team} @ ${g.home_team} (${estTimeStr} EST)`);
          });
        }
      }

      // Apply max games limit if specified (for NCAAB which can have 70+ games)
      // --limit flag overrides config.maxGames for testing
      // --offset flag skips N games before applying limit (for parallel terminals)
      const MAX_GAMES = gameLimit || config.maxGames || 100;
      const limitedGames = games.slice(gameOffset, gameOffset + MAX_GAMES);

      const offsetNote = gameOffset ? ` --offset ${gameOffset}` : '';
      const limitNote = gameLimit ? ` (--limit ${gameLimit}${offsetNote})` : (games.length > MAX_GAMES ? ` (limited to ${MAX_GAMES})` : '');
      console.log(`[${config.name}] Found ${allGames?.length || 0} total games, ${games.length} ${timeLabel}${limitNote}`);

      // Replace games with limited version
      const finalGames = limitedGames;

      if (!finalGames || finalGames.length === 0) {
        console.log(`[${config.name}] No games found for today.`);
        summary[config.name] = { games: 0, picks: 0, time: 0 };
        continue;
      }

      console.log(`[${config.name}] Found ${finalGames.length} games\n`);

      // ═══════════════════════════════════════════════════════════════
      // TRUE MEMORY SESSION: Gary maintains memory across all games
      // ═══════════════════════════════════════════════════════════════
      // Create a session that persists Gary's analysis memory across games.
      // This enables organic ranking based on true conviction rather than
      // re-reading summaries of his own picks.
      // ═══════════════════════════════════════════════════════════════
      
      // Build system prompt for this sport
      console.log(`[${config.name}] 🎯 Processing ${finalGames.length} games`);

      // Process each game
      const sportPicks = [];
      let picksGenerated = 0;
      for (let i = 0; i < finalGames.length; i++) {
        const game = finalGames[i];

        console.log(`\n[${i + 1}/${finalGames.length}] ${game.away_team} @ ${game.home_team}`);

        // Create game key for deduplication. Include BDL game id when present
        // so MLB doubleheaders (same teams + date, different game ids) don't collide.
        const bdlGameId = game.bdl_game_id ?? game.id ?? null;
        const gameKey = bdlGameId != null
          ? `${getGameKey(game.home_team, game.away_team)}|${bdlGameId}`
          : getGameKey(game.home_team, game.away_team);

        // Skip deduplication checks if --force flag is set (for re-running specific games)
        if (!forceRerun) {
        // FIRST: Check in-memory set (prevents race conditions within same run)
        if (processedGamesThisSession.has(gameKey)) {
          console.log(`⏭️  Already processed in this session: "${gameKey}"`);
          continue;
        }

        // SECOND: Check database for existing pick (use game's EST date, not today)
        const gameESTDate = game.commence_time
          ? new Date(game.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
          : null;
        const existingPick = await checkExistingPick(config.name, game.home_team, game.away_team, gameESTDate, bdlGameId);
        if (existingPick) {
          console.log(`⏭️  Already have pick for this game: "${existingPick}"`);
          if (bdlGameId != null) existingPickGameIds.add(String(bdlGameId));
          processedGamesThisSession.add(gameKey); // Mark as processed
          continue;
          }
        } else {
          console.log(`🔄 Force re-run enabled - skipping deduplication for "${gameKey}"`);
        }

        // Mark as being processed BEFORE we start (prevents race condition)
        processedGamesThisSession.add(gameKey);

        // Fetch sportsbook odds BEFORE analysis so Gary sees available lines
        let preSportsbookOdds = null;
        try {
          const preGameId = game.bdl_game_id || game.id;
          if (preGameId) {
            console.log(`   Fetching sportsbook odds comparison (pre-analysis)...`);
            preSportsbookOdds = await fetchSportsbookOdds(config.key, preGameId, game.home_team, game.away_team);
            if (preSportsbookOdds?.length > 0) {
              console.log(`   Found odds from ${preSportsbookOdds.length} sportsbooks`);
            }
          }
        } catch (oddsPreErr) {
          console.log(`   Could not fetch pre-analysis sportsbook odds: ${oddsPreErr.message}`);
        }

        // Run agentic analysis (each game is independent)
        const runnerOptions = {
          nocache: process.argv.includes('--nocache'),
          sportsbookOdds: preSportsbookOdds // Pass multi-book odds for scout report
        };
        let result;
        try {
          // MLB game picks: THE June engine, unconditionally (founder,
          // Aug 27 — the separate pickdesk system is retired; model
          // failures cascade inside runMlbJuneEngine). Other sports route
          // through analyzeGame as before.
          if (config.key === 'baseball_mlb') {
            result = await runMlbJuneEngine(game, runnerOptions);
          } else {
            // ONE BRAIN PER PICK, every sport (founder, Aug 27): a failed or
            // quota-dead brain never hands THIS game's context to another
            // model mid-stream — the next brain re-runs the whole game.
            result = await analyzeGame(game, config.key, { ...runnerOptions, modelOverride: GAME_PICK_MODEL });
            let cascadeModel = GAME_PICK_MODEL;
            for (const fallbackModel of DESK_FALLBACK_MODELS) {
              if (result?.pick && !result?.error) break;
              console.warn(`[Runner] ⚠️ ${cascadeModel} failed (${result?.error || 'no pick'}) — same game, whole re-run on ${fallbackModel}`);
              result = await analyzeGame(game, config.key, { ...runnerOptions, modelOverride: fallbackModel });
              cascadeModel = fallbackModel;
            }
            if (result && !result.error && result.pick) result._modelUsed = result._modelUsed ?? cascadeModel;
          }
        } catch (err) {
          if (err.message?.includes('USER_ABORTED') || err.message?.includes('aborted')) {
            console.log(`\n⚠️  Request aborted for ${game.away_team} @ ${game.home_team}. Skipping...`);
            continue;
          }
          throw err; // Re-throw other errors
        }

        if (result && !result.error && result.pick) {
          // Check minimum stats requirement (for NCAAB especially)
          // Use UNIQUE stats count — exclude rejected tokens (quality: 'unavailable')
          const allTokens = (result.toolCallHistory || [])
            .filter(t => t.token && t.quality !== 'unavailable')
            .map(t => t.token);
          const uniqueTokens = [...new Set(allTokens)];
          const statsCount = uniqueTokens.length;

          // For NCAAB: Check that we have real stat values (not 0.0% or 0-0)
          if (config.key === 'basketball_ncaab' && result.toolCallHistory) {
            let zeroStatCount = 0;
            let totalCheckedStats = 0;
            const badStats = [];

            for (const stat of result.toolCallHistory.filter(t => t.quality !== 'unavailable')) {
              // Check for zero/empty values in home and away data
              const checkForZeros = (obj, teamLabel) => {
                if (!obj || typeof obj !== 'object') return false;
                for (const [key, val] of Object.entries(obj)) {
                  if (key === 'team') continue;
                  // Check for problematic zero values that indicate missing data
                  const isZero = val === 0 || val === '0' || val === '0.0' || val === '0.0%' ||
                    val === '0-0' || val === '0.000' || val === 0.0 || val === '0.00';
                  if (isZero) {
                    badStats.push(`${stat.token}:${teamLabel}:${key}=${val}`);
                    return true;
                  }
                }
                return false;
              };

              if (stat.homeValue || stat.awayValue) {
                totalCheckedStats++;
                const homeHasZero = checkForZeros(stat.homeValue, 'home');
                const awayHasZero = checkForZeros(stat.awayValue, 'away');
                if (homeHasZero || awayHasZero) {
                  zeroStatCount++;
                }
              }
            }

            // If more than 25% of stats have zeros, skip this pick
            const zeroRatio = totalCheckedStats > 0 ? zeroStatCount / totalCheckedStats : 0;
            if (zeroRatio > 0.25) {
              console.log(`\n⏭️  SKIPPED: ${result.pick}`);
              console.log(`   Reason: Too many zero/missing stats (${zeroStatCount}/${totalCheckedStats} = ${(zeroRatio * 100).toFixed(0)}%)`);
              console.log(`   Bad stats: ${badStats.slice(0, 5).join(', ')}${badStats.length > 5 ? '...' : ''}`);
              continue;
            }
          }

          console.log(`\n✅ PICK: ${result.pick}`);
          console.log(`   Type: ${result.type}`);
          // Stale-injury telemetry (Jul 22 2026, founder: monitor that old
          // injuries never carry a pick's case). Log-only, never blocks.
          try {
            const staleInj = findStaleInjuryMentions(result.rationale, typeof result.injuries === 'string' ? result.injuries : '');
            if (staleInj.length) console.warn(`   [InjuryWatch] card cites ESTABLISHED absences: ${staleInj.join(', ')} — review whether they carry the case.`);
          } catch { /* telemetry must never break the run */ }
          if (result.toolCallHistory) {
            // Show UNIQUE stats only (not duplicates)
            console.log(`   Stats Requested (${statsCount} unique): ${uniqueTokens.join(', ')}`);
            
            // 📊 INVESTIGATION AUDIT - Show what Gary actually investigated
            // Filter out undefined/empty tokens AND rejected tokens (quality: 'unavailable')
            const tokens = result.toolCallHistory.filter(t => t.token && t.quality !== 'unavailable').map(t => t.token);
            // Count player stats: tokens containing PLAYER_, _PLAYER, GAME_LOGS, or specific player stat patterns
            const playerStatsCount = tokens.filter(t => 
              t && (t.includes('PLAYER_') || 
              t.includes('_PLAYER') || 
              t.includes('GAME_LOGS') ||
              t.match(/^(NBA|NFL|NHL|NCAAB|NCAAF)_PLAYER_STATS/))
            ).length;
            const teamStatsCount = tokens.filter(t => 
              t && !t.includes('PLAYER_') && 
              !t.includes('_PLAYER') && 
              !t.includes('GAME_LOGS') &&
              !t.match(/^(NBA|NFL|NHL|NCAAB|NCAAF)_PLAYER_STATS/)
            ).length;
            
            // Check key investigation areas (sport-aware)
            const isNCAABSport = config.key === 'basketball_ncaab';
            const investigatedAreas = isNCAABSport ? {
              // NCAAB: BDL tokens only — scout report covers KenPom, rankings, H2H, injuries, home court
              fourFactors: tokens.some(t => t && (t.includes('EFG') || t.includes('TURNOVER_RATE') || t.includes('OREB_RATE') || t.includes('FT_RATE'))),
              tempo: tokens.some(t => t && t.includes('TEMPO')),
              efficiency: tokens.some(t => t && (t.includes('RATING') || t.includes('TS_PCT'))),
              scoring: tokens.some(t => t && (t.includes('SCORING') || t.includes('FG_PCT') || t.includes('THREE_PT'))),
              defense: tokens.some(t => t && (t.includes('REBOUNDS') || t.includes('STEALS') || t.includes('BLOCKS'))),
              assists: tokens.some(t => t && t.includes('ASSISTS')),
              playerLogs: playerStatsCount > 0
            } : config.key === 'baseball_mlb' ? {
              // MLB investigation areas
              startingPitchers: tokens.some(t => t && (t.includes('STARTING_PITCHER') || t.includes('PITCHER_SEASON') || t.includes('PITCHER_SCOUTING'))),
              bullpen: tokens.some(t => t && (t.includes('BULLPEN') || t.includes('CLOSER'))),
              lineup: tokens.some(t => t && (t.includes('LINEUP') || t.includes('KEY_HITTERS'))),
              platoonSplits: tokens.some(t => t && (t.includes('SPLITS') || t.includes('BATTER_VS'))),
              standings: tokens.some(t => t && (t.includes('STANDINGS') || t.includes('TEAM_RECORD'))),
              parkWeather: tokens.some(t => t && (t.includes('PARK') || t.includes('WEATHER'))),
              injuries: tokens.some(t => t && t.includes('INJUR')),
              odds: tokens.some(t => t && t.includes('ODDS'))
            } : {
              homeAwaySplits: tokens.some(t => t && (t.includes('HOME_AWAY') || t.includes('SPLITS'))),
              recentForm: tokens.some(t => t && (t.includes('RECENT_FORM') || t.includes('LAST_'))),
              h2hHistory: true, // H2H is preloaded in scout report for all sports
              pace: tokens.some(t => t && t.includes('PACE')),
              efficiency: tokens.some(t => t && (t.includes('RATING') || t.includes('EFG'))),
              clutchStats: tokens.some(t => t && t.includes('CLUTCH')),
              benchDepth: tokens.some(t => t && t.includes('BENCH')),
              playerLogs: playerStatsCount > 0
            };
            
            const coveredCount = Object.values(investigatedAreas).filter(v => v).length;
            const totalAreas = Object.keys(investigatedAreas).length;
            
            console.log(`\n📊 INVESTIGATION AUDIT:`);
            console.log(`   Team Stats: ${teamStatsCount} | Player Stats: ${playerStatsCount}`);
            console.log(`   Coverage: ${coveredCount}/${totalAreas} key areas`);
            console.log(`   Areas: ${Object.entries(investigatedAreas).map(([k, v]) => `${v ? '✓' : '✗'}${k.replace(/([A-Z])/g, ' $1').trim()}`).join(' | ')}`);
          }
          // Log full rationale (no truncation - Gary is guided to keep it ~250-350 words)
          const rationale = result.rationale || result.analysis || '';
          if (rationale) {
            console.log(`\n📝 RATIONALE:\n${rationale}\n`);
          } else if (result.rawAnalysis) {
            // Extract rationale from raw response if not parsed
            const raw = result.rawAnalysis;
            const rationaleMatch = raw.match(/"rationale"\s*:\s*"([^"]+)"/s);
            if (rationaleMatch) {
              console.log(`\n📝 RATIONALE:\n${rationaleMatch[1]}\n`);
            }
          }

          // Extract stat data with values for structured Tale of the Tape display
          // NOTE: iOS expects statsData rows to be keyed by the STAT TOKEN (e.g. TURNOVER_RATE),
          // and will only render values it can decode for that token. For NCAAB we keep 1 row per
          // token so the iOS app can show the full set Gary requested.
          const seenStatKeys = new Set(); // Track unique stat keys to avoid duplicates
          const statsData = [];

          // Helper to check if a value is valid
          const isValidValue = (k, v) => {
            if (k === 'team' || k === 'category' || k === 'note' || k === 'interpretation') return false;
            if (v === 'N/A' || v === '' || v === null || v === undefined) return false;
            if (Array.isArray(v) && v.length === 0) return false;
            if (typeof v === 'object') return false; // Skip nested objects
            if (String(v).includes('Check scout')) return false;
            // Filter out invalid zero rates
            if ((k.includes('rate') || k.includes('pct') || k.includes('_pct')) &&
              (v === '0.000' || v === 0 || v === '0' || v === '0.0' || v === '0.00')) {
              return false;
            }
            return true;
          };

          // Human-readable names for common stat keys
          const statNameMap = {
            // Football (NFL/NCAAF)
            'yards_per_game': 'Total YPG',
            'yards_per_play': 'Yards/Play',
            'points_per_game': 'PPG',
            'opp_yards_per_game': 'Opp Yards/Game',
            'opp_points_per_game': 'Opp PPG',
            'opp_ppg': 'Opp PPG',
            'third_down_pct': '3rd Down %',
            'fourth_down_pct': '4th Down %',
            'opp_third_down_pct': 'Opp 3rd Down %',
            'opp_fourth_down_pct': 'Opp 4th Down %',
            'turnover_diff': 'Turnover +/-',
            'takeaways': 'Takeaways',
            'giveaways': 'Giveaways',
            'qb_rating': 'QB Rating',
            'completion_pct': 'Completion %',
            'yards_per_attempt': 'Yards/Attempt',
            'passing_tds': 'Pass TDs',
            'interceptions': 'INTs',
            'rushing_yards_per_game': 'Rush YPG',
            'yards_per_carry': 'Yards/Carry',
            'rushing_tds': 'Rush TDs',
            'sacks_made': 'Sacks',
            'sacks_allowed': 'Sacks Allowed',
            'qb_hits': 'QB Hits',
            'fumble_recoveries': 'Fumble Rec',
            'total_takeaways': 'Total Takeaways',
            'point_diff': 'Point Diff',
            'red_zone_td_pct': 'Red Zone TD %',
            'red_zone_scores': 'Red Zone Scores',
            'red_zone_attempts': 'Red Zone Attempts',
            'receiving_yards_per_game': 'Receiving YPG',
            'receiving_tds': 'Receiving TDs',
            'yards_per_catch': 'Yards/Catch',
            'longest_pass': 'Long Pass',
            'total_yards_per_game': 'Total YPG',
            'passing_ypg': 'Passing YPG',
            'rushing_ypg': 'Rush YPG',
            'total_ypg': 'Total YPG',
            'total_tds': 'Total TDs',
            'opp_passing_yards': 'Opp Pass Yds',
            'opp_rushing_yards': 'Opp Rush Yds',
            'opp_total_yards': 'Opp Total Yds',
            'total_yards': 'Total Yards',
            'passing_yards': 'Pass Yards',
            'rushing_yards': 'Rush Yards',
            'passing_ints': 'Pass INTs',
            'interceptions_thrown': 'INTs Thrown',
            'sacks': 'Sacks',
            
            // NHL - Special Teams
            'pp_pct': 'Power Play %',
            'pk_pct': 'Penalty Kill %',
            'pp_opportunities': 'PP Ops',
            'ppPct': 'Power Play %',
            'pkPct': 'Penalty Kill %',
            
            // NHL - Advanced Analytics
            'corsi_for_pct': 'Corsi For %',
            'expected_goals_for_pct': 'xG For %',
            'xg_for_pct': 'xG For %',
            'cf_pct': 'Corsi For %',
            'xgf_pct': 'xG For %',
            'high_danger_pct': 'High Danger %',
            'high_danger_chances_for_pct': 'HD Chances %',
            'pdo': 'PDO',
            
            // NHL - Goalie Stats
            'save_pct': 'Save %',
            'gsax': 'GSAX',
            'gaa': 'GAA',
            'starter': 'Starting Goalie',
            'record': 'Goalie Record',
            
            // NHL - Shots & Goals
            'shots_for_pg': 'Shots For/G',
            'shots_against_pg': 'Shots Against/G',
            'goals_for_pg': 'Goals For/G',
            'goals_against_pg': 'Goals Against/G',
            'shot_diff': 'Shot Diff',
            'shotsForPerGame': 'Shots For/G',
            'shotsAgainstPerGame': 'Shots Against/G',
            'goalsForPerGame': 'Goals For/G',
            'goalsAgainstPerGame': 'Goals Against/G',
            
            // NHL - Rest & Form
            'daysSinceLastGame': 'Days Rest',
            'isBackToBack': 'Back-to-Back',
            'gamesLast7Days': 'Games Last 7D',
            'goalsPerGame': 'Goals/Game',
            'goalsAgainstPerGame': 'GA/Game',
            'last5': 'Last 5',
            'last10': 'Last 10',
            
            // NHL - League Ranks
            'pp_rank': 'PP Rank',
            'pk_rank': 'PK Rank',
            'gf_rank': 'GF Rank',
            'ga_rank': 'GA Rank',
            'goals_for_rank': 'GF Rank',
            'goals_against_rank': 'GA Rank',
            
            // NCAAB
            'kenpom_rank': 'KenPom Rank',
            'adj_em': 'AdjEM',
            'adj_offense': 'AdjO',
            'adj_defense': 'AdjD',
            'net_rank': 'NET Rank',
            'net_ranking': 'NET Rank',
            'offensive_rating': 'Off Rating',
            'defensive_rating': 'Def Rating',
            'conference_record': 'Conf Record',
            'conference_win_pct': 'Conf Win %',
            'tempo': 'Tempo',
            
            // Weather
            'temperature': 'Temperature',
            'feels_like': 'Feels Like',
            'wind_speed': 'Wind Speed',
            'conditions': 'Conditions',
            'impact': 'Weather Impact'
          };

          // Normalize stat keys for dedup (e.g., opp_ppg and opp_points_per_game are the same)
          const normalizeKey = (key) => {
            const lower = key.toLowerCase();
            // Map common variations to canonical forms
            if (lower === 'opp_ppg' || lower === 'opp_points_per_game') return 'opp_ppg';
            if (lower === 'ppg' || lower === 'points_per_game') return 'ppg';
            if (lower === 'total_ypg' || lower === 'yards_per_game' || lower === 'total_yards_per_game' || lower === 'ypg') return 'ypg';
            if (lower === 'opp_ypg' || lower === 'opp_yards_per_game' || lower === 'opp_total_yards') return 'opp_ypg';
            if (lower === 'pass_tds' || lower === 'passing_tds' || lower === 'passing_touchdowns') return 'pass_tds';
            if (lower === 'rush_tds' || lower === 'rushing_tds' || lower === 'rushing_touchdowns') return 'rush_tds';
            if (lower === 'ints' || lower === 'interceptions' || lower === 'interceptions_thrown' || lower === 'passing_interceptions') return 'ints';
            if (lower === 'recv_ypg' || lower === 'receiving_yards_per_game' || lower === 'receiving_ypg') return 'recv_ypg';
            if (lower === 'recv_tds' || lower === 'receiving_tds' || lower === 'receiving_touchdowns') return 'recv_tds';
            if (lower === 'pp_pct' || lower === 'pppct' || lower === 'power_play_pct') return 'pp_pct';
            if (lower === 'pk_pct' || lower === 'pkpct' || lower === 'penalty_kill_pct') return 'pk_pct';
            if (lower === 'cf_pct' || lower === 'corsiforpct' || lower === 'corsi_for_pct') return 'cf_pct';
            if (lower === 'xgf_pct' || lower === 'xgforpct' || lower === 'xg_for_pct') return 'xgf_pct';
            return lower;
          };

          if (result.toolCallHistory) {
            // All sports now use flattened stats for better Tale of the Tape depth
            for (const t of result.toolCallHistory) {
              if (!t.token) continue;
              // Skip tracking-only entries (no actual stat data) — these are coverage markers, not display stats
              if (t.homeValue === undefined && t.awayValue === undefined) continue;
              // Skip unavailable stats
              if (t.quality === 'unavailable') continue;

              const homeVal = t.homeValue;
              const awayVal = t.awayValue;

              // If home/away are objects, flatten each key into its own stat row
              if (typeof homeVal === 'object' && homeVal !== null &&
                typeof awayVal === 'object' && awayVal !== null) {
                  const homeKeys = Object.keys(homeVal).filter(k => isValidValue(k, homeVal[k]));
                  const awayKeys = Object.keys(awayVal).filter(k => isValidValue(k, awayVal[k]));
                  const allKeys = [...new Set([...homeKeys, ...awayKeys])];

                  for (const key of allKeys) {
                    const hv = homeVal[key];
                    const av = awayVal[key];

                    // Skip if both are invalid
                    if (!isValidValue(key, hv) && !isValidValue(key, av)) continue;

                    // Create unique key for dedup using normalized key
                    const normalizedKey = normalizeKey(key);
                    const statKey = `${normalizedKey}:${hv}:${av}`;
                    if (seenStatKeys.has(statKey)) continue;
                    seenStatKeys.add(statKey);

                    // Get human-readable name
                    const displayName = statNameMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

                    statsData.push({
                      name: displayName,
                      token: key.toUpperCase(),
                      home: { team: homeVal.team, [key]: hv ?? 'N/A' },
                      away: { team: awayVal.team, [key]: av ?? 'N/A' }
                    });
                  }
                } else {
                  // Primitive values - store directly
                  if (homeVal === 'N/A' || awayVal === 'N/A') continue;

                  const statKey = `${t.token}:${homeVal}:${awayVal}`;
                  if (seenStatKeys.has(statKey)) continue;
                  seenStatKeys.add(statKey);

                  statsData.push({
                    name: t.token.replace(/_/g, ' '),
                    token: t.token,
                    home: homeVal,
                    away: awayVal
                });
              }
            }
          }

          // For NCAAF/NFL: Filter out useless stats that BDL doesn't provide
          if (config.key === 'americanfootball_ncaaf' || config.key === 'americanfootball_nfl') {
            // Remove stats with 0.0 or N/A values (BDL doesn't have this data)
            for (let i = statsData.length - 1; i >= 0; i--) {
              const stat = statsData[i];
              const home = stat.home || {};
              const away = stat.away || {};

              // Get values (excluding team name)
              const getVal = (obj) => {
                if (typeof obj !== 'object') return obj;
                const vals = Object.entries(obj).filter(([k]) => k !== 'team').map(([, v]) => v);
                return vals[0]; // First non-team value
              };

              const hv = getVal(home);
              const av = getVal(away);

              // Remove if both are zero or N/A
              const isZeroOrNA = (v) => v === '0.0' || v === '0' || v === 0 || v === 'N/A' || v === null || v === undefined;
              if (isZeroOrNA(hv) && isZeroOrNA(av)) {
                statsData.splice(i, 1);
              }
            }
          }

          // For NCAAB: Filter out stats that BDL doesn't provide for college basketball
          if (config.key === 'basketball_ncaab') {
            // Remove stats with 0.0 net ratings - BDL doesn't have efficiency ratings for NCAAB
            const efficiencyTokens = ['ADJ_EFFICIENCY_MARGIN', 'NET_RATING', 'ADJ_OFFENSIVE_EFF', 'ADJ_DEFENSIVE_EFF'];
            for (let i = statsData.length - 1; i >= 0; i--) {
              const stat = statsData[i];
              if (efficiencyTokens.includes(stat.token)) {
                const home = stat.home || {};
                const away = stat.away || {};
                // Check if net_rating is 0.0 or all values are N/A
                const netRatingZero = home.net_rating === '0.0' || home.net_rating === 0 ||
                  away.net_rating === '0.0' || away.net_rating === 0;
                const allNA = Object.entries(home).filter(([k]) => k !== 'team').every(([, v]) => v === 'N/A') &&
                  Object.entries(away).filter(([k]) => k !== 'team').every(([, v]) => v === 'N/A');
                if (netRatingZero || allNA) {
                  statsData.splice(i, 1);
                }
              }

              // For TURNOVER_RATE and OREB_RATE - remove N/A rate fields, keep only per_game
              if (stat.token === 'TURNOVER_RATE' && stat.home && stat.away) {
                // Remove tov_rate if N/A, keep turnovers_per_game
                if (stat.home.tov_rate === 'N/A') delete stat.home.tov_rate;
                if (stat.away.tov_rate === 'N/A') delete stat.away.tov_rate;
                // Rename token for cleaner display
                stat.name = 'TURNOVERS PER GAME';
              }

              if (stat.token === 'OREB_RATE' && stat.home && stat.away) {
                // Remove oreb_rate if N/A, keep oreb_per_game
                if (stat.home.oreb_rate === 'N/A') delete stat.home.oreb_rate;
                if (stat.away.oreb_rate === 'N/A') delete stat.away.oreb_rate;
                // Rename token for cleaner display
                stat.name = 'OFFENSIVE REBOUNDS PER GAME';
              }

              // Filter out RECENT_FORM if it has undefined scores (means no completed games)
              if (stat.token === 'RECENT_FORM' && stat.home && stat.away) {
                const hasUndefinedScores = (stat.home.summary && stat.home.summary.includes('undefined-undefined')) ||
                  (stat.away.summary && stat.away.summary.includes('undefined-undefined'));
                const allTies = (stat.home.last_5 && stat.home.last_5.match(/^T+$/)) ||
                  (stat.away.last_5 && stat.away.last_5.match(/^T+$/));
                if (hasUndefinedScores || allTies) {
                  statsData.splice(i, 1);
                }
              }
            }
          }

          // ALWAYS use verifiedTaleOfTape when available — toolCallHistory is inconsistent
          if ((config.key === 'icehockey_nhl' || config.key === 'basketball_nba' || config.key === 'basketball_ncaab' || config.key === 'baseball_mlb' || config.key === 'americanfootball_nfl' || config.key === 'americanfootball_ncaaf') && result.verifiedTaleOfTape?.rows) {
            const sportLabels = {
              'icehockey_nhl': 'NHL',
              'basketball_nba': 'NBA',
              'basketball_ncaab': 'NCAAB',
              'baseball_mlb': 'MLB',
              'americanfootball_nfl': 'NFL',
              'americanfootball_ncaaf': 'NCAAF'
            };
            const sportLabel = sportLabels[config.key] || config.key;
            console.log(`   📊 ${sportLabel}: Using verified Tale of Tape (${result.verifiedTaleOfTape.rows.length} rows) for pick card`);

            // tokenToIosKey is now a module-scoped constant (see top of file) so the
            // no-stats hard-fail gate downstream can also reference it.

            // Clear any toolCallHistory stats and use the verified rows instead
            statsData.length = 0;
            for (const row of result.verifiedTaleOfTape.rows) {
              // Skip injuries row (shown separately)
              if (row.name === 'Key Injuries') continue;
              // Extract value from nested structure: { team: "Name", value: "3.45" }
              // CRITICAL: iOS StatValues.from(dict:) casts with `as? String` — numbers silently fail
              // Always convert to String so iOS can parse them
              const rawHome = typeof row.home === 'object' ? row.home.value : row.home;
              const rawAway = typeof row.away === 'object' ? row.away.value : row.away;
              const homeValue = rawHome != null ? String(rawHome) : 'N/A';
              const awayValue = rawAway != null ? String(rawAway) : 'N/A';
              const homeTeam = typeof row.home === 'object' ? row.home.team : result.homeTeam;
              const awayTeam = typeof row.away === 'object' ? row.away.team : result.awayTeam;
              // Map token to iOS-compatible property name
              const iosKey = tokenToIosKey[row.token] || row.token.toLowerCase();
              statsData.push({
                name: row.name,
                token: row.token,
                home: { team: homeTeam, [iosKey]: homeValue },
                away: { team: awayTeam, [iosKey]: awayValue },
                // NFL prior-season baselines must remain visibly attributable
                // after the verified tape is reshaped for storage/iOS.
                ...(row.statProvenance ? { statProvenance: row.statProvenance } : {})
              });
            }
            console.log(`   ✓ ${sportLabel}: Added ${statsData.length} stats from verified Tale of Tape`);

            // Per-sport expected row counts — drift is a silent iOS rendering bug
            // MLB = 16 since Jul 22 2026 (team-stats block restored after the
            // gp<100 date-bomb fix; 15 when BDL lacks batting_r for Runs/Game).
            const expectedRowCount = { 'NHL': 15, 'NCAAB': 15, 'NBA': 15, 'MLB': 16, 'NFL': 6, 'NCAAF': 7 }[sportLabel];
            if (expectedRowCount && statsData.length !== expectedRowCount) {
              console.warn(`   ⚠️ ${sportLabel}: Expected ${expectedRowCount} Tale of Tape rows, got ${statsData.length} — check scout report builder`);
            }
          }

          // Also keep simple token list for backwards compatibility
          const statsUsed = result.toolCallHistory
            ? result.toolCallHistory.map(t => t.token)
            : [];

          // Use pre-fetched sportsbook odds (already fetched before analysis)
          let sportsbookOdds = null;
          let bestLine = null;
          try {
            const rawOdds = preSportsbookOdds; // Reuse pre-analysis odds — no duplicate API call
            if (rawOdds && rawOdds.length > 0) {
              // Format odds for the picked team
              sportsbookOdds = formatOddsForStorage(rawOdds, result.pick, result.homeTeam, result.awayTeam);
              console.log(`   Found odds from ${sportsbookOdds?.length || 0} sportsbooks`);

              // BEST LINE SELECTION: Find the best spread for Gary's pick.
              // MLB is exempt (Jul 26 2026, founder: one standard book —
              // Gary quotes the chosen book's line; electing a different
              // book's price here would contradict the card).
              // FOOTBALL is exempt too (founder, Aug 24: "so NFL is as good
              // as MLB" — one-book quoting brought to MLB's shape). The
              // preseason audit showed election-after-compose made 11/16
              // cards argue a different number than their ticket; the desk's
              // posted line IS the ticket now, and the ticket-restate guard
              // stays behind it as belt-and-suspenders.
              const electionExempt = config.key === 'baseball_mlb'
                || config.key === 'americanfootball_nfl'
                || config.key === 'americanfootball_ncaaf';
              if (!electionExempt && sportsbookOdds && sportsbookOdds.length > 0 && result.type === 'spread') {
                const validOdds = sportsbookOdds.filter(o => typeof o.spread === 'number' && !isNaN(o.spread));
                if (validOdds.length > 0) {
                  const firstSpread = validOdds[0].spread;
                  const isUnderdog = firstSpread > 0;

                  // Compute median spread to filter outliers (e.g., Kalshi +32.5 vs consensus +17.5)
                  const sortedSpreads = validOdds.map(o => o.spread).sort((a, b) => a - b);
                  const medianSpread = sortedSpreads[Math.floor(sortedSpreads.length / 2)];
                  const MAX_DEVIATION = 4; // Max points away from median to be considered valid
                  const inRangeOdds = validOdds.filter(o => Math.abs(o.spread - medianSpread) <= MAX_DEVIATION);
                  const searchOdds = inRangeOdds.length > 0 ? inRangeOdds : validOdds;

                  let best = searchOdds[0];
                  for (const odds of searchOdds) {
                    // Better number first (+18.5 > +17.5 = more cushion; -16.5 > -17.5 =
                    // fewer to cover); on the SAME number, better price wins — MLB run
                    // lines are -1.5 at every book, so without the price tie-break the
                    // stored odds came from whichever book listed first and could
                    // contradict the pick text (caught on Sol launch review, Jul 22).
                    if (odds.spread > best.spread) best = odds;
                    else if (odds.spread === best.spread &&
                             (odds.spread_odds ?? -Infinity) > (best.spread_odds ?? -Infinity)) best = odds;
                  }

                  bestLine = {
                    book: best.book,
                    spread: best.spread,
                    spreadOdds: best.spread_odds
                  };

                  const defaultSpread = result.spread;
                  if (defaultSpread !== null && best.spread !== defaultSpread) {
                    console.log(`   Best line: ${best.spread > 0 ? '+' : ''}${best.spread} @ ${best.book} (default was ${defaultSpread > 0 ? '+' : ''}${defaultSpread})`);
                  }
                }
              }
            }
          } catch (oddsErr) {
            console.log(`   Could not process sportsbook odds: ${oddsErr.message}`);
          }

          // Create clean pick object without large/unnecessary fields
          // Use best available line if found, otherwise fall back to default.
          // iOS GaryPick types spread/spreadOdds as Double? — a string here
          // (result.spread parsed from pick text) poisons the WHOLE picks-array
          // decode on the phone (Aug 18 "BOARD DATA UNAVAILABLE" incident).
          const asStoredNumber = (v) => {
            const n = typeof v === 'string' ? parseFloat(v) : v;
            return Number.isFinite(n) ? n : null;
          };
          const finalSpread = asStoredNumber(bestLine?.spread ?? result.spread);
          const finalSpreadOdds = asStoredNumber(bestLine?.spreadOdds ?? result.spreadOdds);
          const isFootballPick = config.key === 'americanfootball_nfl' || config.key === 'americanfootball_ncaaf';
          const exactFootballBook = isFootballPick
            ? exactFootballMarketBook(sportsbookOdds, result)
            : null;
          const bestLineBook = bestLine?.book ?? result.book ?? exactFootballBook ?? null;
          // AFTER GARY receipt: seal the exact elected football market beside
          // the pick. First-writer-wins storage makes this immutable; later
          // proof refreshes compare only this vendor to that same vendor.
          const footballPublishedAt = isFootballPick ? new Date().toISOString() : null;
          const footballPublishedMarket = isFootballPick ? {
            market_type: result.type,
            vendor: bestLineBook,
            line: result.type === 'spread'
              ? finalSpread
              : (result.type === 'total' ? result.total : null),
            odds: result.type === 'spread'
              ? (finalSpreadOdds ?? result.odds)
              : result.odds,
          } : null;

          // Update pick text to reflect best available line (not just Gary's raw output).
          // F-5: the stored odds are the ELECTED board line, so the pick text must say
          // the same thing — rewrite on a price-only election too, not just a number
          // change (Jul 23 Tigers: every book sat at -1.5, the price tie-break stored
          // -108 while the text kept the prose "-110").
          let finalPickText = result.pick;
          if (bestLine && result.type === 'spread' && finalPickText) {
            // Replace the spread number + price in the pick text
            // e.g., "Washington Wizards +6.0 -114" → "Washington Wizards +6.5 -110"
            const spreadStr = finalSpread > 0 ? `+${finalSpread}` : `${finalSpread}`;
            const oddsStr = typeof finalSpreadOdds === 'number' ? ` ${finalSpreadOdds > 0 ? '+' + finalSpreadOdds : finalSpreadOdds}` : '';
            // Match pattern: team name followed by spread number and optional odds
            const pickMatch = finalPickText.match(/^(.+?)\s*[+-]\d+\.?\d*\s*[+-]?\d*$/);
            if (pickMatch) {
              const rewritten = `${pickMatch[1].trim()} ${spreadStr}${oddsStr}`;
              if (rewritten !== finalPickText) {
                finalPickText = rewritten;
                console.log(`   📝 Pick text updated: "${result.pick}" → "${finalPickText}"`);
              }
            }
          }

          // Format game time for UI display
          const gameTimeEST = game.commence_time
            ? new Date(game.commence_time).toLocaleString('en-US', {
                timeZone: 'America/New_York',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              })
            : 'TBD';

          // TICKET RESTATEMENT (founder GO, Aug 24: "fix the bugs"): the
          // preseason audit found 10/16 football cards arguing a different
          // spread or price than the elected ticket — composition happens
          // before best-line election by necessity (the best line depends on
          // the side Gary picks), so when the prose quotes numbers that
          // contradict the final ticket, Gary restates HIS OWN card against
          // it. One corrective call, arguments unchanged, fail-soft: any
          // failure keeps the original card and the pick ships on time.
          if (config.key !== 'baseball_mlb' && result.type === 'spread'
              && finalSpread != null && result.rationale) {
            try {
              const { ticketNumbersDrift, restateAgainstTicket } = await import('./lib/ticketRestate.js');
              if (ticketNumbersDrift(result.rationale, finalSpread, finalSpreadOdds)) {
                console.log(`   🎫 [Ticket Restate] card quotes numbers that differ from the elected ticket (${finalPickText}) — asking Gary to restate`);
                const restated = await restateAgainstTicket({
                  rationale: result.rationale,
                  pickText: finalPickText,
                  spread: finalSpread,
                  spreadOdds: finalSpreadOdds,
                  book: bestLineBook,
                  model: result.model || null,
                });
                if (restated) {
                  result.rationale = restated;
                  console.log('   ✅ [Ticket Restate] card now argues the actual ticket');
                }
              }
            } catch (restateErr) {
              console.warn(`   ⚠️ [Ticket Restate] skipped (${restateErr.message})`);
            }
          }

          // (The Aug 10 Winners judge ran here; it was gated on a field the
          // orchestrator never set and died in late August. THE WINNERS
          // REVIEWER — Sep 2 — runs after the store; see routeToWinners.)

          const cleanPick = {
            pick: finalPickText,
            type: result.type,
            odds: result.type === 'spread' ? (finalSpreadOdds || result.odds) : result.odds,
            // Gary's conviction in the bet (0.50-1.00). NEVER defaulted: a
            // missing score stores as null (Jul 30 — `|| 0.65` FABRICATED a
            // conviction Gary never stated, and the ledger read it as real).
            // The loud warn below is the founder-ordered alert for that case.
            confidence: result.confidence ?? null,
            // WINNERS SCORE v1 (founder GO, Aug 10): ledger-empirical rank
            // for the Winners-page slot chooser — the pick's class 30d win
            // rate plus a small confidence tiebreak. App sorts by it;
            // null = unrankable pick text.
            winners_class: classOf(finalPickText),
            winners_score: winnersScore(finalPickText, result.confidence ?? null, await getWinnersClassRates()),
            // THE BLIND SPLIT (Aug 5): the sealed pre-lines read — the winner
            // Gary named before any price reached the session, and his why.
            // Null on non-desk lanes; the ledger reads ticket-vs-read crossings.
            read_winner: result.read_winner ?? null,
            game_read: result.game_read ?? null,
            // THE BLIND REPORT (Aug 12): both win paths ride every pick.
            path_away: result.path_away ?? null,
            path_home: result.path_home ?? null,
            case_last: result.case_last ?? null,
            homeTeam: result.homeTeam,
            awayTeam: result.awayTeam,
            // UI display fields
            game: `${result.awayTeam} @ ${result.homeTeam}`,
            time: gameTimeEST,
            spread: finalSpread, // Best available line (not just the first sportsbook)
            spreadOdds: finalSpreadOdds,
            bestLineBook: bestLineBook, // Which sportsbook has the best line
            ...(isFootballPick ? {
              published_at: footballPublishedAt,
              published_market: footballPublishedMarket,
              season_type: game?.season_type ?? null,
              homeTeamAbbreviation: game?.home_team?.abbreviation ?? null,
              awayTeamAbbreviation: (game?.away_team ?? game?.visitor_team)?.abbreviation ?? null,
            } : {}),
            moneylineHome: result.moneylineHome,
            moneylineAway: result.moneylineAway,
            total: result.total,
            rationale: result.rationale,
            // Audit trail: rationale numbers that didn't trace to provided data
            // (null when all traced). Visibility/filtering hook — was being dropped.
            statAuditWarnings: result._statAuditWarnings ?? null,
            // Which brain produced this pick — without it the DB can't distinguish
            // model eras (the Sol cutover review had to infer brains from timestamps).
            // _modelUsed = the RESPONDER after any cascade; the configured
            // primary is only the fallback for lanes that don't report one.
            model: result._modelUsed ?? GAME_PICK_MODEL,
            // Which CONTRACT wording produced it — prompt-era hash (Jul 29);
            // joins against prompt_eras for pre-registered before/after reads.
            prompt_sha: result._promptSha ?? null,
            league: config.name,
            sport: config.key,
            pick_id: `agentic-${config.key}-${game.id || Date.now()}`,
            // BDL game id — disambiguates doubleheaders for dedupe
            bdl_game_id: game.bdl_game_id ?? game.id ?? null,
            // Football's weekly storage must follow the scheduled game, not
            // the wall clock of whichever machine ran the process.
            season: game.season ?? null,
            week: game.week ?? null,
            commence_time: game.commence_time,
            soccer_match_id: game.soccer_match_id ?? null,
            soccer_three_way_ml: game.soccer_three_way_ml ?? null,
            soccer_competition: game.soccer_competition ?? null,
            soccer_stage: game.soccer_stage ?? null,
            soccer_round: game.soccer_round ?? null,
            soccer_group: game.soccer_group ?? null,
            goal_line: result.goal_line ?? result.total ?? null,
            handicap: result.handicap ?? null,
            // Venue/tournament context (for NBA Cup, playoffs, NFL primetime, etc.)
            venue: result.venue || null,
            isNeutralSite: result.isNeutralSite || false,
            tournamentContext: result.tournamentContext || null,
            gameSignificance: result.gameSignificance || null,
            // CFP-specific fields for NCAAF (seeding, round, venue)
            cfpRound: result.cfpRound || null,
            homeSeed: result.homeSeed || null,
            awaySeed: result.awaySeed || null,
            // AP Top 25 rankings (NCAAB: from the scout; NCAAF: stamped on the
            // game object by attachNcaafGameMetadata — Aug 25 2026)
            homeRanking: result.homeRanking ?? game.homeRanking ?? null,
            awayRanking: result.awayRanking ?? game.awayRanking ?? null,
            // Conference data for app filtering (same two sources)
            homeConference: result.homeConference ?? game.homeConference ?? null,
            awayConference: result.awayConference ?? game.awayConference ?? null,
            // Single conference field for app filtering (based on which team is in the pick).
            // Longest whole-word match wins (shared-mascot class, Aug 19 sweep): a bare
            // last-word join reads "Michigan State" and "Ohio State" as the same school.
            conference: (() => {
              const pickText = (result.pick || '').toLowerCase();
              const matchLen = (teamName) => {
                const name = String(teamName || '').toLowerCase().trim();
                if (!name) return 0;
                const words = name.split(' ');
                // Full name, name-minus-last-word, last word — most specific first.
                const forms = [name, words.slice(0, -1).join(' '), words.slice(-1)[0]].filter(Boolean);
                for (const f of forms) {
                  const esc = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  if (new RegExp(`(^|[^a-z])${esc}([^a-z]|$)`).test(pickText)) return f.length;
                }
                return 0;
              };
              const h = matchLen(result.homeTeam);
              const a = matchLen(result.awayTeam);
              const homeConf = result.homeConference ?? game.homeConference ?? null;
              const awayConf = result.awayConference ?? game.awayConference ?? null;
              if (h > a) return homeConf;
              if (a > h) return awayConf;
              // Tie or no match: use home conference if available
              return homeConf || awayConf;
            })(),
            statsUsed: statsUsed, // Token names for backwards compatibility
            statsData: statsData, // Full stat data with values for Tale of the Tape
            // Pre-computed Tale of the Tape from scout report (BDL verified stats)
            // Used when toolCallHistory is sparse (e.g., NHL, NCAAB)
            verifiedTaleOfTape: result.verifiedTaleOfTape || null,
            // Structured injury data from BDL. iOS types this TeamInjuries? —
            // the June engine's dossier carries injuries as a TEXT block, and a
            // string in this field breaks the phone's whole-array decode
            // (Aug 18 incident). Objects only; anything else stores null.
            injuries: (result.injuries && typeof result.injuries === 'object') ? result.injuries : null,
            sportsbook_odds: sportsbookOdds, // Multi-book odds comparison (ML + Spread)
            isBeta: config.isBeta || false, // Beta flag for sports with limited data
            dataLimitationNote: config.isBeta
              ? `${config.name} picks use supplemental web-sourced analytics. Confidence may be lower than NBA/NFL.`
              : null
          };

          // HARD FAIL: a pick whose Tale of the Tape carries no real values means the
          // stats pipeline returned nothing for this game (every row "N/A") — Gary
          // cannot have analyzed it, so the rationale is ungrounded. Never store a
          // no-stats pick.
          const realStatCount = countRealStats(statsData, tokenToIosKey);
          const minRealStats = 1;
          if (realStatCount < minRealStats) {
            console.error(`\n🛑 [${config.name}] HARD FAIL: "${result.pick}" — only ${realStatCount} real performance stat(s) (need ${minRealStats}). Tale of the Tape is metadata-only; the pick is ungrounded. REJECTING — no pick stored.`);
            if (i < finalGames.length - 1) { await sleep(2000); }
            continue;
          }

          // (Plain-language re-register REMOVED — founder ruling, Aug 12:
          // "Gary makes the pick. He writes the rationale... I never
          // authorized a middleman." One organic rationale, nothing else.)

          // Founder-ordered alert (Jul 30): a missing confidence must be LOUD,
          // never silently papered over — ⚠️ lines surface in scheduler logs.
          if (cleanPick.confidence == null) {
            console.warn(`⚠️ [Pick] ${cleanPick.pick} stored with NO confidence_score — the brain omitted it; check the contract/parse`);
          }

          const picksForGame = [cleanPick];

          // Add to picks
          sportPicks.push(...picksForGame);
          picksGenerated += picksForGame.length;

          // Store each pick immediately so it appears in the app as soon as it's ready
          // Skip immediate store in test mode — test picks are stored in batch at the end
          if (shouldStore && !useTestTable && cleanPick.type !== 'pass' && cleanPick.pick !== 'PASS') {
            try {
              console.log(`\n📤 [${config.name}] Storing ${picksForGame.length} pick(s) immediately: ${picksForGame.map(p => p.pick).join(' | ')}`);
              await storePicks(picksForGame);
              console.log(`✅ [${config.name}] Pick(s) stored to Supabase`);
              // THE DESK snapshot (spec 2026-07-26): the pick is a pure
              // function of the desk — persist exactly what Gary read.
              // Non-blocking by contract. (Sep 2: the orchestrator returns
              // the desk as _context.scoutReport — the old `deskText` key
              // never existed, so no desk was stored from Jul 26 to Sep 2.)
              const deskText = result?._context?.scoutReport || null;
              if (deskText) {
                await picksService.storeDeskSnapshot({
                  game_date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
                  matchup: `${cleanPick.awayTeam} @ ${cleanPick.homeTeam}`,
                  pick: cleanPick.pick,
                  desk: deskText,
                });
              }
              // THE WINNERS ROUTE (founder GO, Sep 2 2026): after the store,
              // never before. First dog, big game, then the reviewer.
              await routeToWinners({ league: config.name, game, slate: games, result, cleanPick, deskText });
              // THE SHADOW MODEL (founder GO, Sep 3 2026): a second system's
              // bet for the same game, stored beside Gary's and never shown
              // to him or to fans; graded and read nightly against his.
              if (config.name === 'MLB') {
                try {
                  const { supabaseAdmin, supabase } = await import('../src/supabaseClient.js');
                  const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
                  const shadow = await buildShadowPick({
                    game, homeTeam: cleanPick.homeTeam, awayTeam: cleanPick.awayTeam, todayEt,
                    garyPick: cleanPick.pick, deskText, db: supabaseAdmin || supabase,
                  });
                  if (shadow.ok) {
                    const r = shadow.row;
                    console.log(`🧪 [Shadow] ${r.pick_text} (market ${(r.p_market * 100).toFixed(1)}% → ${(r.p_adj * 100).toFixed(1)}% home, ${r.adjustment_pts >= 0 ? '+' : ''}${r.adjustment_pts} pts: ${(r.drivers || []).map((d) => d.name).join(', ') || 'no tonight adjustment'}) · Gary ${cleanPick.pick} · ${r.agree_with_gary === false ? 'DIFFERENT side' : r.agree_with_gary ? 'same side' : 'side unread'}`);
                  } else {
                    console.warn(`   ⚠️ [Shadow] no shadow pick (${shadow.error})`);
                  }
                } catch (shadowErr) {
                  console.warn(`   ⚠️ [Shadow] skipped (${shadowErr.message}) — pick unaffected`);
                }
                // THE NOTEBOOK SHADOW (founder GO, Sep 3 2026): Gary with a
                // memory — a second read of the same desk with his notebook
                // appended, in its own detached process so it never delays
                // this child or touches the real pick. It reads the desk
                // snapshot stored above; if that store failed there is no
                // desk to re-read and the shadow simply skips.
                if (deskText) {
                  try {
                    const { spawn } = await import('node:child_process');
                    const { openSync, mkdirSync } = await import('node:fs');
                    const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
                    const logDir = path.join(process.cwd(), 'logs', 'scheduler');
                    mkdirSync(logDir, { recursive: true });
                    const logFd = openSync(path.join(logDir, `diary-${todayEt}-${cleanPick.game_id ?? game?.id ?? 'game'}.log`), 'a');
                    const child = spawn(process.execPath, [
                      path.join(process.cwd(), 'scripts', 'run-diary-pick.js'),
                      '--game-id', String(cleanPick.game_id ?? game?.id ?? ''),
                      '--date', todayEt,
                      '--matchup', `${cleanPick.awayTeam} @ ${cleanPick.homeTeam}`,
                    ], { detached: true, stdio: ['ignore', logFd, logFd], env: { ...process.env, ANTHROPIC_API_KEY: '' } });
                    child.unref();
                    console.log(`📓 [Diary] notebook shadow started for ${cleanPick.awayTeam} @ ${cleanPick.homeTeam} (pid ${child.pid})`);
                  } catch (diaryErr) {
                    console.warn(`   ⚠️ [Diary] not started (${diaryErr.message}) — pick unaffected`);
                  }
                }
              }
            } catch (storeErr) {
              console.log(`⚠️  [${config.name}] Immediate store failed (will retry at end): ${storeErr.message}`);
            }
          }

          // THE NCAAF PIGGYBACK (founder GO, Aug 25 2026): college props ride
          // the game pick — right after Gary's pick for an FBS game, he takes
          // at most two props from that game's live menu (popular books,
          // piggyback price band), and they publish on the production NCAAF
          // prop rails (prop_picks → grading, records, the game's card).
          // Fail-soft by contract: a props failure never touches the stored
          // game pick. NFL keeps its full props desk — this lane is college's.
          if (config.key === 'americanfootball_ncaaf' && shouldStore
              && cleanPick.type !== 'pass' && cleanPick.pick !== 'PASS') {
            try {
              const { runNcaafPiggyback } = await import('../src/services/pickdesk/ncaafPiggybackProps.js');
              const piggyback = await runNcaafPiggyback({
                game,
                pickText: cleanPick.pick,
                rationale: cleanPick.rationale,
              });
              if (!piggyback.picks.length) {
                console.log(`   [NCAAF Piggyback] no props stored (${piggyback.reason || 'Gary passed the menu'}; menu size ${piggyback.menuSize})`);
              } else {
                await storeNcaafPiggybackProps(piggyback.picks, { useTestTable });
                console.log(`   [NCAAF Piggyback] stored ${piggyback.picks.length} prop(s): ${piggyback.picks.map((p) => `${p.player} ${p.bet.toUpperCase()} ${p.prop} ${p.line} @ ${p.odds}`).join(' | ')}`);
              }
            } catch (piggybackErr) {
              console.warn(`   ⚠️ [NCAAF Piggyback] skipped (${piggybackErr.message}) — game pick unaffected`);
            }
          }
        } else if (result.error) {
          console.log(`\n⚠️  Error: ${result.error}`);
        } else {
          console.log(`\n⚠️  No pick generated for this game`);
        }

        // Small delay between games
        if (i < finalGames.length - 1) {
          await sleep(2000);
        }
      }

      // Store picks for this sport
      let storedPicksCount = 0;
      let filteredOutCount = 0;

      if (sportPicks.length > 0) {
        if (!shouldStore) {
          console.log(`\n[${config.name}] Storage disabled (--store false). Generated ${sportPicks.length} pick(s) but will NOT write to Supabase.`);
        } else {
          console.log(`\n[${config.name}] Processing ${sportPicks.length} picks...`);

          // ═══════════════════════════════════════════════════════════════
          // GARY'S PICKS SUMMARY
          // ═══════════════════════════════════════════════════════════════
          console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
          console.log(`║  🏈 GARY'S ${config.name} PICKS (${sportPicks.length} picks)                   `);
          console.log(`╠══════════════════════════════════════════════════════════════════╣`);
          for (let i = 0; i < sportPicks.length; i++) {
            const p = sportPicks[i];
            const typeTag = p.type === 'moneyline' ? 'ML' : 'SPREAD';
            const pickStr = (p.pick || '').slice(0, 30).padEnd(30);
            console.log(`║  ${pickStr} | ${typeTag.padEnd(6)}`);
          }
          console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);

          const qualifiedPicks = sportPicks.filter(p => {
            // Filter out totals (over/under) - game picks are spread/ML only.
            if (p.type === 'total') {
              console.log(`  ❌ Filtered: ${p.pick} (totals not included for game picks)`);
              return false;
            }
            // Defense-in-depth: catch PASS if orchestrator didn't
            if (p.type === 'pass' || (p.pick && p.pick.toUpperCase() === 'PASS')) {
              console.log(`  ❌ Filtered: PASS pick (Gary must always pick a side)`);
              return false;
            }

            // Classify the actual market side. Searching the rendered pick for
            // "+" also sees plus-money juice (for example -0.5 +100) and used
            // to mislabel favorites as dogs in the production audit log.
            const marketSide = classifyPickMarketSide(p);
            const pickType = p.type === 'moneyline' ? '💰ML' : '📊SPREAD';
            const sideTag = marketSide === 'underdog'
              ? '🐕DOG'
              : marketSide === 'favorite'
                ? '🏆FAV'
                : marketSide === 'pickem'
                  ? 'PK'
                  : 'UNKNOWN';
            console.log(`  ✅ PICK: ${p.pick} [${pickType}] [${sideTag}]`);

            return true;
          });

          console.log(`\n[${config.name}] ${qualifiedPicks.length} picks ready for filtering`)

          // ═══════════════════════════════════════════════════════════════
          // ═══════════════════════════════════════════════════════════════
          // STORE PICKS — Gary's output is final (no sport post-filters)
          // ═══════════════════════════════════════════════════════════════
          const finalPicks = qualifiedPicks;

          if (finalPicks.length > 0) {
            let picksToStore = finalPicks;

            filteredOutCount = qualifiedPicks.length - finalPicks.length;
            const filterNote = (config.name === 'NBA' || config.name === 'NHL' || config.name === 'NCAAB') && filteredOutCount > 0 ? ` (${filteredOutCount} filtered out)` : '';
            console.log(`\n[${config.name}] Storing ${picksToStore.length} picks${filterNote}`);
            await storePicks(picksToStore);
            allPicks.push(...picksToStore);
            storedPicksCount = picksToStore.length;
          } else {
            filteredOutCount = qualifiedPicks.length;
            const filterMsg = (config.name === 'NBA' || config.name === 'NHL' || config.name === 'NCAAB') ? ' (all filtered out)' : '';
            console.log(`\n[${config.name}] No picks to store${filterMsg}`);
          }
        }
      }

      const sportTime = ((Date.now() - sportStartTime) / 1000).toFixed(1);

      const pickCount = sportPicks.length;

      summary[config.name] = {
        games: finalGames.length,
        picks: pickCount,
        stored: storedPicksCount,
        filtered: filteredOutCount,
        time: sportTime
      };

      const filterNote = filteredOutCount > 0 ? `, ${filteredOutCount} filtered` : '';
      console.log(`\n${config.emoji} ${config.name} COMPLETE: ${storedPicksCount} stored (${pickCount} picks${filterNote}) in ${sportTime}s`);

    } catch (error) {
      console.error(`\n❌ Error processing ${config.name}:`, error.message);
      summary[config.name] = { error: error.message };
    }
  }

  // Final summary
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                       📊 FINAL SUMMARY                           ║
╠══════════════════════════════════════════════════════════════════╣`);

  for (const [sport, data] of Object.entries(summary)) {
    if (data.error) {
      console.log(`║  ${sport.padEnd(8)} Error: ${data.error.slice(0, 40)}`);
    } else {
      const filteredStr = data.filtered > 0 ? `, ${data.filtered} filtered` : '';
      const failedStr = data.failed > 0 ? ` (${data.failed} failed)` : '';
      console.log(`║  ${sport.padEnd(8)} ${String(data.games).padStart(3)} games -> ${String(data.stored || 0).padStart(2)} stored (${data.picks} picks${filteredStr})${failedStr} (${data.time}s)`);
    }
  }

  // Show details of any failed games
  const allFailedGames = Object.entries(summary)
    .filter(([_, data]) => data.failedGames && data.failedGames.length > 0)
    .flatMap(([sport, data]) => data.failedGames.map(f => ({ sport, ...f })));
  
  if (allFailedGames.length > 0) {
    console.log(`╠══════════════════════════════════════════════════════════════════╣`);
    console.log(`║  ⚠️  FAILED GAMES (${allFailedGames.length}):                                       `);
    for (const failed of allFailedGames.slice(0, 5)) {
      console.log(`║    ${failed.game.slice(0, 35).padEnd(35)} | ${failed.statsGathered} stats | ${failed.iterations} iterations`);
      console.log(`║      → ${failed.error.slice(0, 50)}`);
    }
    if (allFailedGames.length > 5) {
      console.log(`║    ... and ${allFailedGames.length - 5} more`);
    }
  }

  console.log(`╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Total Picks: ${String(allPicks.length).padStart(3)}                                               ║
║  Total Time: ${totalTime.padStart(6)}s                                            ║
║                                                                  ║
║  ${allPicks.length > 0 ? '✅ Picks are now live in Supabase!' : 'ℹ️  No picks stored this run — see per-game detail in the log above.'}
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);

  // ═══════════════════════════════════════════════════════════════════════════
  // GRACEFUL EXIT
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n🐻 Gary is signing off. Session complete!');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
  
  // Give time for any pending async operations (Supabase connections, etc.) to complete
  await sleep(2000);

  const failedSports = Object.entries(summary).filter(([, data]) => data?.error);
  if (failedSports.length > 0) {
    throw new Error(`Pick run failed: ${failedSports.map(([sport, data]) => `${sport}: ${data.error}`).join(' | ')}`);
  }

  const storedGameIds = allPicks
    .map((pick) => pick?.bdl_game_id ?? pick?.game_id)
    .filter((id) => id != null)
    .map(String);
  const coveredGameIds = [...new Set([...existingPickGameIds, ...storedGameIds])];
  if (gameIdFilter && !coveredGameIds.includes(String(gameIdFilter))) {
    throw new Error(`Exact game ${gameIdFilter} completed without a verified stored pick`);
  }

  const outcome = {
    status: shouldStore ? 'stored' : 'dry_run',
    game_ids: coveredGameIds,
    pick_count: allPicks.length,
  };
  console.log(formatPickRunOutcome(outcome));
  console.log('✅ Process complete. Exiting cleanly...');
}

async function checkExistingPick(league, homeTeam, awayTeam, gameDate = null, gameId = null) {
  try {
    // NFL uses weekly table, other sports use daily table
    if (league === 'NFL') {
      const { nflGameAlreadyHasPick } = await import('../src/services/picksService.js');
      if (typeof nflGameAlreadyHasPick === 'function') {
        const result = await nflGameAlreadyHasPick(homeTeam, awayTeam, gameDate, gameId);
        if (result.exists) {
          return result.existingPick;
        }
      }
    } else {
      const { gameAlreadyHasPick } = await import('../src/services/picksService.js');
      if (typeof gameAlreadyHasPick === 'function') {
        const result = await gameAlreadyHasPick(league, homeTeam, awayTeam, gameDate, gameId);
        if (result.exists) {
          return result.existingPick;
        }
      }
    }
  } catch (e) {
    // Function may not exist, continue
  }
  return null;
}

/**
 * Store NCAAF piggyback props on the production prop rails. Production takes
 * the same atomic Postgres date lock as every props writer (no read/merge
 * fallback); --test mirrors the props CLI's isolated test_prop_picks merge.
 * Dates follow the GAME's NCAAF slate date, never the run's wall clock.
 */
async function storeNcaafPiggybackProps(rows, { useTestTable: toTestTable = false } = {}) {
  if (!rows.length) return;
  const { storePropPicksAtomic, stampFootballTdCategory } = await import('./lib/propPicksStorage.js');

  const byDate = new Map();
  for (const row of rows) {
    const date = ncaafSlateDateForInstant(row.commence_time);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(row);
  }

  if (toTestTable) {
    for (const [date, datePicks] of byDate) {
      const stamped = datePicks.map((p) => stampFootballTdCategory(p, 'NCAAF'));
      const { data: existing, error: readErr } = await supabase
        .from('test_prop_picks').select('picks').eq('date', date).maybeSingle();
      if (readErr) throw new Error(`test_prop_picks read failed for ${date}: ${readErr.message}`);
      const kept = (existing?.picks || []).filter((p) =>
        !stamped.some((n) => String(p.game_id) === String(n.game_id)
          && (p.player || '').toLowerCase() === (n.player || '').toLowerCase()
          && (p.prop || '') === (n.prop || '')));
      const { error: upsertErr } = await supabase.from('test_prop_picks')
        .upsert({ date, picks: [...kept, ...stamped], created_at: new Date().toISOString() });
      if (upsertErr) throw new Error(`test_prop_picks upsert failed for ${date}: ${upsertErr.message}`);
      console.log(`🧪 [NCAAF Piggyback] TEST: ${stamped.length} prop(s) → test_prop_picks (${date})`);
    }
    return;
  }

  for (const [date, datePicks] of byDate) {
    const result = await storePropPicksAtomic({
      client: supabase,
      date,
      leagueLabel: 'NCAAF',
      picks: datePicks,
      forceRun: false,
    });
    console.log(`✅ [NCAAF Piggyback] atomic prop storage (${date}): ${result.added} added, ${result.skipped} already present`);
  }
}

async function storePicks(picks) {
  // DRY RUN MODE - skip storage if --dry-run flag is passed
  if (process.argv.includes('--dry-run')) {
    console.log(`🧪 DRY RUN MODE - Skipping storage of ${picks.length} picks`);
    return;
  }

  // TEST MODE - store to test_daily_picks instead of production tables
  if (useTestTable) {
    console.log(`🧪 TEST MODE - Storing ${picks.length} picks to test_daily_picks table`);
    // The row is keyed by date and shared across same-day runs, so stamp each
    // pick with its arm — test queries separate arms by test_arm, not by the
    // row's (last-writer-wins) test_name.
    const armLabel = testName || process.env.GARY_MODEL_OVERRIDE || 'default';
    for (const p of picks) p.test_arm = armLabel;
    const result = await picksService.storeTestPicks(picks, testName, `Test run at ${new Date().toISOString()}`);
    if (!result.success) {
      throw new Error(`TEST storage failed: ${result.error || result.message || 'unknown error'}`);
    }
    console.log(`✅ TEST: Stored ${result.count} picks in test_daily_picks (mode: ${result.mode})`);
    return result;
  }

  // Re-check at the actual write boundary. Research can be long-running and
  // a game that was upcoming when this process started may now be live.
  assertPicksStillPregame(picks);

  // Separate NFL picks (go to weekly table) from other picks (go to daily table)
  const nflPicks = picks.filter(p => p.league === 'NFL');
  const otherPicks = picks.filter(p => p.league !== 'NFL');

  // WRITE-AHEAD SPOOL (Aug 24 2026, Aug 23 outage post-mortem): the generated
  // pick becomes durable ON DISK before the network write, and the spool is
  // deleted only after the atomic RPC confirms it. If storage stays down
  // through every retry — or the scheduler SIGKILLs this child mid-retry —
  // the pick survives in logs/pick-outbox/ and the next run's flush stores it
  // in seconds instead of re-running research. Spooling failure never blocks
  // the live write.
  const { writeSpool, removeSpool } = await import('./lib/pickOutbox.js');
  const etToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  // Store NFL picks in weekly table
  if (nflPicks.length > 0) {
    const nflSpool = writeSpool('nfl_weekly', etToday, nflPicks);
    console.log(`🏈 Storing ${nflPicks.length} NFL picks in weekly table...`);
    const nflResult = await picksService.storeWeeklyNFLPicks(nflPicks);
    if (!nflResult.success) {
      throw new Error(`NFL storage failed: ${nflResult.error || nflResult.message || 'unknown error'}`);
    }
    removeSpool(nflSpool);
    console.log(`✅ NFL: Stored ${nflResult.count} new picks (${nflResult.total || nflResult.count} total for week)`);
  }

  // Store other sports in daily table
  if (otherPicks.length > 0) {
    const dailySpool = writeSpool('daily', dateFilter || etToday, otherPicks);
    const result = await picksService.storeDailyPicksInDatabase(otherPicks, dateFilter || null, {
      beforeRetry: () => assertPicksStillPregame(otherPicks),
    });
    if (!result.success) {
      throw new Error(`Daily-picks storage failed: ${result.error || result.message || 'unknown error'}`);
    }
    removeSpool(dailySpool);
    console.log(`✅ Successfully stored ${otherPicks.length} picks in daily table`);
  }
  return { success: true, count: picks.length };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Football exact-game children must exit explicitly after a successful
// decision so open provider sockets or SDK timers cannot delay that game's
// props. Preserve the existing termination behavior for every other sport.
const exitRunner = (code) => (
  args.includes('--nfl') || args.includes('--ncaaf')
    ? exitAfterFlushing(code)
    : process.exit(code)
);

main()
  .then(() => exitRunner(0))
  .catch(error => {
    console.error('Fatal error:', error);
    return exitRunner(1);
  });
