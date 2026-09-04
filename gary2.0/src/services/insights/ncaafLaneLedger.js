// The college lanes' pass ledger (NCAAF Picks page parity, Sep 4 2026).
//
// BDL's shared request gate allows about three requests a minute across every
// local process, and the NCAAF insights stage is hard-capped at 25 minutes —
// a 28-game Saturday cannot be covered by per-game fetches in one pass. So a
// college lane reads which games already carry its rows today (first-write-
// wins keeps them), works the remaining games in kickoff order, and stops
// STARTING games once its time budget is spent, returning what it has. The
// next pass of the day continues from there. A budget is never a kill: a
// game already in flight finishes.

import axios from 'axios';

const DEFAULT_BUDGET_MS = 8 * 60_000;

export function laneBudgetMs() {
  const n = Number(process.env.GARY_NCAAF_LANE_BUDGET_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BUDGET_MS;
}

function restConfig(options = {}) {
  return {
    supabaseUrl: options.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    key: options.key ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY,
    client: options.client ?? axios,
  };
}

/** Game ids (as strings) that already carry `category` rows for NCAAF today. */
export async function gamesWithRowsToday({ date, category, ...options }) {
  const { supabaseUrl, key, client } = restConfig(options);
  if (!supabaseUrl || !key || !date || !category) return new Set();
  try {
    const { data } = await client({
      method: 'GET',
      url: `${supabaseUrl}/rest/v1/insight_connections`,
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      params: { date: `eq.${date}`, league: 'eq.ncaaf', category: `eq.${category}`, select: 'game_id' },
    });
    return new Set((Array.isArray(data) ? data : [])
      .map((r) => r?.game_id)
      .filter((id) => id != null)
      .map((id) => String(id)));
  } catch (err) {
    console.warn(`[ncaafLaneLedger] ${category} ledger read failed: ${err?.message || err} — working the whole slate`);
    return new Set();
  }
}

function kickoff(game) {
  const t = Date.parse(game?.date || game?.commence_time || '');
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

/**
 * Work the undone games in kickoff order until the budget is spent.
 * `work(game)` returns that game's rows; a throwing game is logged and skipped.
 */
export async function runWithinBudget({ games, done = new Set(), budgetMs = laneBudgetMs(), work, label = 'ncaaf lane' }) {
  const startedAt = Date.now();
  const queue = (games || [])
    .filter((g) => g?.id != null && !done.has(String(g.id)))
    .sort((a, b) => kickoff(a) - kickoff(b));
  const out = [];
  let worked = 0;
  for (const game of queue) {
    if (Date.now() - startedAt >= budgetMs) {
      console.log(`[${label}] budget spent after ${worked} game(s); ${queue.length - worked} left for the next pass`);
      break;
    }
    try {
      const rows = await work(game);
      if (Array.isArray(rows)) out.push(...rows);
    } catch (err) {
      console.warn(`[${label}] game ${game.id}: ${err?.message || err}`);
    }
    worked += 1;
  }
  return out;
}

export default { gamesWithRowsToday, runWithinBudget, laneBudgetMs };
