/**
 * Shared Constitution Blocks — Centralized
 *
 * Each function returns a string for interpolation in template literals via ${}.
 *
 * All pipelines use: getInjuryDurationLabels (via BASE_RULES), getH2HZeroTolerance
 *
 * Injury INVESTIGATION lives in flashInvestigationPrompts.js (Flash handles it).
 * Gary only needs label awareness — what FRESH/SHORT-TERM/LONG-TERM/SEASON-LONG mean.
 */

// ═══════════════════════════════════════════════════════════════════════
// Injury Duration Label Awareness (ALL pipelines — game picks, props, DFS)
// Gary reads these labels in the scout report — Flash handles the actual
// investigation via flashInvestigationPrompts.js.
// ═══════════════════════════════════════════════════════════════════════

export function getInjuryDurationLabels() {
  return `### INJURY DURATION LABELS

The scout report labels each injury with a duration tag:

- **FRESH** — Recent absence, market has had limited time to adjust
- **SHORT-TERM** — Team has played several games without this player, market partially adjusted
- **LONG-TERM** — Extended absence, market has fully adjusted. Current stats already reflect the roster without this player.
- **SEASON-LONG** — Out for the season. Non-factor — do not treat as new information.

Don't assume a player being out helps or hurts anyone. The data shows whether there's a real shift.`;
}

// ═══════════════════════════════════════════════════════════════════════
// H2H Zero Tolerance (guardrails)
// Core rule identical; sport-specific context about matchup frequency.
// ═══════════════════════════════════════════════════════════════════════

const H2H_SPORT_CONTEXT = {
  NBA: `   - If you get "0 games found" or "No previous matchups" → DO NOT mention H2H at all`,
  NFL: `   - If divisional teams: they play twice, so there may be 1 previous meeting this season
   - If non-divisional: they may NOT have played this season at all
   - [NO] NEVER claim: "Cowboys are 6-2 vs Eagles in recent years" without data`,
  NHL: `   - NHL divisional teams play multiple times per season - there may be recent meetings
   - [NO] NEVER claim: "Bruins are 5-1 vs Leafs this year" without data`,
  NCAAB: `   - Most non-conference teams only play once per season IF they meet in tournaments
   - Conference teams play twice (home and away)`,
  NCAAF: `   - Most NCAAF teams play rarely or never
   - [NO] NEVER claim: "Ohio State is 8-2 vs Michigan in last 10" without data
   - [NO] NEVER guess rivalry patterns from training data`,
};

export function getH2HZeroTolerance(sport) {
  const normalized = sport?.toUpperCase?.()
    .replace('BASKETBALL_', '')
    .replace('AMERICANFOOTBALL_', '')
    .replace('ICEHOCKEY_', '') || sport;

  const sportContext = H2H_SPORT_CONTEXT[normalized] || '';

  return `**HEAD-TO-HEAD (H2H) - ZERO TOLERANCE FOR GUESSING**:
   - H2H data is included in your scout report. Review it there. If you need ADDITIONAL historical matchups beyond what's shown, you can call fetch_stats(token: 'H2H_HISTORY', ...)
${sportContext}
   - [NO] NEVER guess historical H2H patterns from training data
   - [YES] If you have H2H data, cite ONLY the specific games shown
   - [YES] If you DON'T have H2H data, skip H2H analysis entirely`;
}

