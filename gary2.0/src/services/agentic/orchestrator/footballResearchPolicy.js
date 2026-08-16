const NFL_KEYS = new Set(['NFL', 'americanfootball_nfl']);
const NFL_CURRENT_CONTEXT_TOKENS = new Set([
  'INJURIES',
  'REST_SITUATION',
  'SCHEDULE_CONTEXT',
  'STANDINGS',
  'DIVISION_RECORD'
]);

// August NFL is a materially different evidence problem from the regular
// season. The verified scout report already contains the current QB rotation,
// rested starters, camp/depth-chart notes, injuries and the prior completed
// regular-season Tale of the Tape. Re-fetching the full 18-factor regular-
// season menu duplicates that evidence, consumes the shared BDL gate, and can
// run past kickoff. Flash still has to complete every factor below; it simply
// analyzes the evidence already assembled by the scout instead of launching a
// second data-collection pass.
export const NFL_AUGUST_PRESEASON_SCOUT_FACTORS = Object.freeze([
  'QB_SITUATION',
  'SKILL_PLAYERS',
  'INJURIES',
  'TRENCHES',
  'COACHING',
  'EFFICIENCY'
]);

export function isNflAugustPreseasonResearch(sport, options = {}) {
  if (!NFL_KEYS.has(sport)) return false;
  if (options.researchSeasonScope !== 'prior_completed_regular_season') return false;

  const gameTime = new Date(options.gameTime || '');
  return Number.isFinite(gameTime.getTime()) && gameTime.getUTCMonth() === 7;
}

/**
 * Return the exact factor lanes Flash should run.
 *
 * Regular-season NFL and every other sport retain the complete configured
 * factor map. During verified August NFL preseason, the current scout is the
 * evidence source and each required factor is deliberately tool-free.
 */
export function buildResearchFactorPlan(sport, sportFactors = {}, options = {}) {
  if (isNflAugustPreseasonResearch(sport, options)) {
    return {
      mode: 'nfl_august_preseason_scout',
      factors: NFL_AUGUST_PRESEASON_SCOUT_FACTORS.map((name) => ({
        name,
        tokens: [],
        required: true,
        source: 'verified_scout_report'
      }))
    };
  }

  return {
    mode: 'full_research',
    factors: Object.entries(sportFactors).map(([name, tokens]) => ({
      name,
      tokens: Array.isArray(tokens) ? [...tokens] : [],
      required: false,
      source: 'tools_and_scout_report'
    }))
  };
}

function hasSubstantiveFactorFinding(result) {
  if (!result || typeof result !== 'object') return false;
  const text = [
    result.keyFinding,
    result.key_finding,
    result.finding,
    result.numbers,
    result.stats,
    result.context,
    result.sample_context
  ]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .trim();
  return text.length >= 20;
}

/**
 * Required preseason factors fail closed. This does not synthesize a pass or a
 * pick: it prevents Gary from being called when Flash did not finish the
 * bounded evidence review.
 */
export function findMissingRequiredResearchFactors(plan, results = []) {
  const factors = Array.isArray(plan?.factors) ? plan.factors : [];
  return factors
    .map((factor, index) => ({ factor, result: results[index] }))
    .filter(({ factor, result }) => factor.required && !hasSubstantiveFactorFinding(result))
    .map(({ factor }) => factor.name);
}

export const NFL_RESEARCH_CONCURRENCY = 3;

export function researchConcurrencyForSport(sport) {
  return NFL_KEYS.has(sport) ? NFL_RESEARCH_CONCURRENCY : 1;
}

export function shouldUseNflResearchBaseline(sport, token) {
  if (!NFL_KEYS.has(sport)) return false;
  const baseToken = String(token || '').split(':')[0];
  return Boolean(baseToken) && !NFL_CURRENT_CONTEXT_TOKENS.has(baseToken);
}

/**
 * Run independent research factors through a small, bounded worker pool.
 * Results retain input order even though factors may finish out of order.
 * The first error stops new work from being claimed and rejects the whole pool,
 * preserving the research lane's fail-closed contract.
 */
export async function mapResearchFactors(items, concurrency, mapper) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];

  const width = Math.max(1, Math.min(list.length, Math.trunc(concurrency) || 1));
  const results = new Array(list.length);
  let nextIndex = 0;
  let stopped = false;
  let firstError = null;

  async function worker() {
    for (;;) {
      if (stopped) return;
      const index = nextIndex++;
      if (index >= list.length) return;
      try {
        results[index] = await mapper(list[index], index);
      } catch (error) {
        stopped = true;
        firstError ||= error;
        return;
      }
    }
  }

  await Promise.all(Array.from({ length: width }, () => worker()));
  if (firstError) throw firstError;
  return results;
}

/**
 * The NFL scout records which season actually supplied its verified Tale of
 * the Tape. During August preseason that is intentionally the prior completed
 * regular season. Reuse that same season for research instead of downloading
 * the empty current-season table and then searching the web to replace it.
 */
export function resolveNflResearchBaseline(sport, verifiedTaleOfTape) {
  if (!NFL_KEYS.has(sport)) return null;
  const home = verifiedTaleOfTape?.provenance?.home;
  const away = verifiedTaleOfTape?.provenance?.away;
  const homeSeason = Number(home?.season);
  const awaySeason = Number(away?.season);
  if (!Number.isInteger(homeSeason) || homeSeason !== awaySeason) return null;
  if (!home?.scope || home.scope !== away?.scope) return null;

  const label = home.scope === 'prior_completed_regular_season'
    ? `${homeSeason} prior completed regular-season baseline (not current-season form)`
    : (home?.label || away?.label || `${homeSeason} ${home.scope}`);

  return { season: homeSeason, scope: home.scope, label };
}
