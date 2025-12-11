/**
 * Chunked daily picks generator (server-side)
 * - Processes MLB games in small batches to respect serverless limits
 * - Upserts results into Supabase `daily_picks` per date
 *
 * Query params (optional):
 * - cursor: starting game index (default 0)
 * - batch: number of games to process this call (default 3)
 * - date: YYYY-MM-DD (defaults to EST today)
 */

import { createClient } from '@supabase/supabase-js';

const EST_DATE = () => {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const est = new Date(utc + (3600000 * -5));
  return est.toISOString().split('T')[0];
};

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase admin env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  }
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false }});
}

async function generatePickForGame(game, date) {
  // Lazy-import heavy modules to avoid top-level evaluation issues
  const { combinedMlbService } = await import('../src/services/combinedMlbService.js');
  const { generateGaryAnalysis } = await import('../src/services/garyEngine.js');
  const { picksService: enhancedPicksService } = await import('../src/services/picksService.enhanced.js');
  const homeTeam = game.home_team;
  const awayTeam = game.away_team;

  const gameData = await combinedMlbService.getComprehensiveGameData(homeTeam, awayTeam, date);
  if (!gameData) return null;

  const analysisPrompt = enhancedPicksService.buildMlbGameAnalysisPrompt({ game: { homeTeam, awayTeam }, ...gameData }, game);

  const ensure = (v, d) => v || d;
  const complete = {
    homeTeam,
    awayTeam,
    prompt: analysisPrompt,
    sport: 'baseball_mlb',
    league: 'MLB',
    teamStats: ensure(gameData.teamStats, { homeTeam: { teamName: homeTeam }, awayTeam: { teamName: awayTeam } }),
    pitchers: ensure(gameData.pitchers, { home: { fullName: 'TBD', seasonStats: {} }, away: { fullName: 'TBD', seasonStats: {} }}),
    gameContext: ensure(gameData.gameContext, {}),
    hitterStats: ensure(gameData.hitterStats, { home: [], away: [] }),
    odds: gameData.odds ? { bookmakers: gameData.odds.bookmakers || [], markets: gameData.odds.bookmakers?.[0]?.markets || [] } : null,
    gameTime: game.commence_time || new Date().toISOString(),
    time: game.commence_time || new Date().toISOString()
  };

  const analysis = await generateGaryAnalysis(complete);
  if (!analysis) return null;

  // Minimal pick-card payload: store only what the UI needs from OpenAI JSON
  const oai = analysis?.rawOpenAIOutput || {};
  const minimal = {
    id: game.id,
    date,
    // Spread OpenAI card fields (pick, odds, type, confidence, homeTeam, awayTeam, league, time, rationale, etc.)
    ...oai
  };

  return minimal;
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();
    const dateParam = req.query.date || EST_DATE();
    const cursor = parseInt(req.query.cursor ?? '0', 10) || 0;
    // Default batch size to 1 to reduce serverless execution time per request
    const batch = Math.max(1, Math.min(5, parseInt(req.query.batch ?? '1', 10) || 1));
    const autoNext = (req.query.autonext === '1' || req.query.autonext === 'true');

    // Status-only mode: return processed vs total without doing work
    if (req.query.status === '1' || req.query.status === 'true') {
      const { oddsService } = await import('../src/services/oddsService.js');
      const games = await oddsService.getUpcomingGames('baseball_mlb');
      const total = games?.length || 0;
      const { data: existing } = await supabase
        .from('daily_picks')
        .select('picks')
        .eq('date', dateParam)
        .maybeSingle();
      const prev = Array.isArray(existing?.picks) ? existing.picks : (existing?.picks ? JSON.parse(existing.picks) : []);
      return res.status(200).json({ ok: true, processed: prev.length, total });
    }

    console.log(`[Daily Picks] Start batch – date=${dateParam} cursor=${cursor} batch=${batch}`);

    // Lazy import oddsService to avoid import-time side effects
    const { oddsService } = await import('../src/services/oddsService.js');
    const games = await oddsService.getUpcomingGames('baseball_mlb');
    const total = games?.length || 0;
    if (total === 0) {
      return res.status(200).json({ ok: true, message: 'No upcoming MLB games found', total: 0 });
    }

    const start = Math.min(cursor, total);
    const end = Math.min(start + batch, total);
    const slice = games.slice(start, end);

    const picks = [];
    for (const game of slice) {
      try {
        const pick = await generatePickForGame(game, dateParam);
        if (pick) picks.push(pick);
      } catch (e) {
        console.error('[Daily Picks] Game failed:', e.message);
      }
    }

    // Upsert into daily_picks table
    const { data: existing, error: selErr } = await supabase
      .from('daily_picks')
      .select('*')
      .eq('date', dateParam)
      .maybeSingle();
    if (selErr) console.warn('[Daily Picks] select error:', selErr.message);

    const prev = Array.isArray(existing?.picks) ? existing.picks : (existing?.picks ? JSON.parse(existing.picks) : []);
    // Apply confidence filter (>= 0.65) to both existing and new picks
    const parseConfidence = (v) => {
      if (typeof v === 'number') return v;
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };
    const filterByConfidence = (arr) => (Array.isArray(arr) ? arr.filter(p => parseConfidence(p?.confidence) >= 0.65) : []);

    const filteredPrev = filterByConfidence(prev);
    const filteredNew = filterByConfidence(picks);

    // De-duplicate by id, prefer latest, after filtering
    const byId = new Map(filteredPrev.map(p => [p.id, p]));
    for (const p of filteredNew) byId.set(p.id, p);
    const nextPicks = Array.from(byId.values());

    if (existing?.id) {
      const { error: upErr } = await supabase
        .from('daily_picks')
        .update({ picks: nextPicks, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (upErr) console.error('[Daily Picks] update error:', upErr.message);
    } else {
      const { error: insErr } = await supabase
        .from('daily_picks')
        .insert({ date: dateParam, picks: nextPicks, created_at: new Date().toISOString() });
      if (insErr) console.error('[Daily Picks] insert error:', insErr.message);
    }

    const nextCursor = end < total ? end : null;

    // Self-chaining: schedule the next cursor invocation and return immediately
    if (nextCursor !== null && autoNext) {
      try {
        const host = process.env.SITE_URL || process.env.VERCEL_URL || req.headers.host;
        const origin = host?.startsWith('http') ? host : `https://${host}`;
        const nextUrl = `${origin.replace(/\/$/, '')}/api/generate-daily-picks?cursor=${nextCursor}&date=${encodeURIComponent(dateParam)}&batch=${batch}&autonext=1`;
        // Fire-and-forget; do not await
        // eslint-disable-next-line no-undef
        fetch(nextUrl, { method: 'GET', headers: { 'x-self-chain': '1' } }).catch(() => {});
        console.log(`[Daily Picks] Chained next batch → ${nextUrl}`);
      } catch (chainErr) {
        console.warn('[Daily Picks] self-chain failed:', chainErr.message);
      }
      return res.status(202).json({ ok: true, processed: picks.length, cursor: nextCursor, total, chained: true });
    }

    return res.status(200).json({ ok: true, processed: picks.length, cursor: nextCursor, total });
  } catch (error) {
    console.error('[Daily Picks] Fatal error:', error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
}


