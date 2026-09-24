import { NFL_RESEARCH_GROUPS } from './nflResearchPrompts.js';
const NFL_KEYS = new Set(['NFL', 'americanfootball_nfl']);

/**
 * Return the exact factor lanes Flash should run.
 *
 * NFL groups the complete token menu into weekly-context subjects. Other
 * sports retain their plans.
 */
export function buildResearchFactorPlan(sport, sportFactors = {}) {
  if (['NCAAF', 'americanfootball_ncaaf'].includes(sport)) {
    // Consolidate related questions while retaining every configured token.
    // Current QB/availability/staff and defensive baselines already ride the desk.
    const groups = {
      QB_AVAILABILITY_COACHING: ['QB_SITUATION', 'INJURIES'],
      EFFICIENCY_OPPONENT_QUALITY: ['ADVANCED_EFFICIENCY', 'SUCCESS_RATE', 'SCHEDULE_QUALITY'],
      TRENCHES_DEFENSE: ['TRENCHES', 'DEFENSE', 'HAVOC'],
      OFFENSE_EXPLOSIVES_RED_ZONE: ['OFFENSE', 'EXPLOSIVE_PLAYS', 'RED_ZONE'],
      FORM_GAME_CONTEXT: ['RECENT_FORM', 'CLOSE_GAMES', 'HOME_FIELD', 'MOTIVATION'],
    };
    return { mode: 'ncaaf_grouped_research', factors: Object.entries(groups).map(([name, keys]) => ({
      name, tokens: [...new Set(keys.flatMap(key => sportFactors[key] || []))], required: false, source: 'tools_and_scout_report',
    })) };
  }
  if (NFL_KEYS.has(sport)) {
    return { mode: 'nfl_weekly_context', factors: Object.entries(NFL_RESEARCH_GROUPS).map(([name, keys]) => ({
      name, tokens: [...new Set(keys.flatMap(key => sportFactors[key] || []))], required: false, source: 'tools_and_scout_report',
    })) };
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

export const NFL_RESEARCH_CONCURRENCY = 3;
export const MLB_CODEX_RESEARCH_CONCURRENCY = 3;

export function researchConcurrencyForSport(sport, provider) {
  // The subscription researcher otherwise spends its entire game budget on
  // the first two or three of eight factors. Each worker has its own chat and
  // the complete original desk; bound the pool without dropping any factors.
  if (['codex-cli', 'claude-cli'].includes(provider) && ['baseball_mlb', 'MLB'].includes(sport)) {
    return MLB_CODEX_RESEARCH_CONCURRENCY;
  }
  return NFL_KEYS.has(sport) ? NFL_RESEARCH_CONCURRENCY : 1;
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
