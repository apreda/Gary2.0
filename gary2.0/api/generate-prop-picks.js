/**
 * Secure server-side endpoint to generate player prop picks (NBA/NFL/NHL)
 * - Fetches upcoming games for supported sports
 * - Generates player prop picks via propPicksService
 * - Stores top picks for the day in `prop_picks` table
 *
 * Security:
 * - Requires header `x-admin-token` to match env PROP_GEN_SECRET or ADMIN_TASK_TOKEN
 *
 * Optional query params:
 * - sports: comma-separated list (basketball_nba,americanfootball_nfl,icehockey_nhl)
 * - date: YYYY-MM-DD (defaults to EST today)
 * - limit: max picks to store (default 10)
 */
import { createClient } from '@supabase/supabase-js';

function estToday() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const est = new Date(utc + (3600000 * -5));
  return est.toISOString().split('T')[0];
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase admin env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  }
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false }});
}

function isAuthorized(req) {
  try {
    const headerToken = req.headers['x-admin-token'] || req.headers['X-Admin-Token'];
    const secret = process.env.PROP_GEN_SECRET || process.env.ADMIN_TASK_TOKEN;
    // Header auth
    if (secret && headerToken && String(headerToken) === String(secret)) return true;
    // Query param auth for browser-triggered GET (token in URL)
    const queryToken = req.query?.token;
    if (secret && queryToken && String(queryToken) === String(secret)) return true;
    return false;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    if (!isAuthorized(req)) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const supabase = getSupabaseAdmin();
    const dateParam = (req.query.date || estToday());
    const limit = Math.max(1, Math.min(25, parseInt(req.query.limit ?? '10', 10) || 10));

    // Sports to process (default NBA and NFL)
    const defaultSports = ['basketball_nba', 'americanfootball_nfl'];
    let sports = (req.query.sports
      ? String(req.query.sports).split(',').map(s => s.trim()).filter(Boolean)
      : defaultSports);
    // Enforce: only NBA and NFL player props are supported
    const supportedPropSports = new Set(['basketball_nba', 'americanfootball_nfl']);
    const filteredSports = sports.filter(s => supportedPropSports.has(s));
    if (filteredSports.length !== sports.length) {
      console.log(`[Prop Picks] Filtering sports → allowed=${Array.from(supportedPropSports).join(',')} requested=${sports.join(',')}`);
    }
    sports = filteredSports;

    console.log(`[Prop Picks] Start generation – date=${dateParam} sports=${sports.join(',')} limit=${limit}`);

    // Lazy import heavy modules
    const { oddsService } = await import('../src/services/oddsService.js');
    const { ballDontLieOddsService } = await import('../src/services/ballDontLieOddsService.js');
    const { propPicksService } = await import('../src/services/propPicksService.js');

    // Helper: fetch games within next 36h for sanity
    const now = new Date();
    const horizon = new Date(now.getTime() + 36 * 60 * 60 * 1000).getTime();
    const estOptions = { timeZone: 'America/New_York' };
    const todayEst = new Date().toLocaleDateString('en-US', estOptions);
    const [m, d, y] = todayEst.split('/');
    const todayStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

    let allPropPicks = [];

    for (const sport of sports) {
      try {
        // Use Ball Don't Lie Odds for all sports
        const games = await ballDontLieOddsService.getGamesWithOddsForSport(sport, dateParam);
        console.log(`[Prop Picks] ${sport}: found ${games.length} upcoming games`);

        const gamesToProcess = games.filter(g => {
          const t = new Date(g.commence_time).getTime();
          return isFinite(t) && t <= horizon;
        });
        console.log(`[Prop Picks] ${sport}: processing ${gamesToProcess.length} games (<=36h)`);

        for (const game of gamesToProcess) {
          try {
            const picks = await propPicksService.generatePropBets({
              sport,
              homeTeam: game.home_team,
              awayTeam: game.away_team,
              time: game.commence_time
            });
            if (Array.isArray(picks) && picks.length > 0) {
              allPropPicks.push(...picks);
              console.log(`[Prop Picks] ${sport}: +${picks.length} picks for ${game.away_team} @ ${game.home_team}`);
            }
          } catch (e) {
            console.warn(`[Prop Picks] ${sport}: generation error for ${game.away_team} @ ${game.home_team}:`, e.message);
          }
        }
      } catch (e) {
        console.warn(`[Prop Picks] ${sport}: failed to fetch/process games:`, e.message);
      }
    }

    if (allPropPicks.length === 0) {
      console.log('[Prop Picks] No prop picks generated across selected sports');
      return res.status(200).json({ ok: true, message: 'No prop picks generated', count: 0 });
    }

    // Sort and take top `limit`
    const sorted = allPropPicks.sort((a, b) => {
      const ca = typeof a.confidence === 'number' ? a.confidence : parseFloat(a.confidence) || 0;
      const cb = typeof b.confidence === 'number' ? b.confidence : parseFloat(b.confidence) || 0;
      if (cb !== ca) return cb - ca;
      const eva = a.ev || 0;
      const evb = b.ev || 0;
      return evb - eva;
    });
    const topPicks = sorted.slice(0, limit);

    // Replace any existing row for this date
    try {
      await supabase
        .from('prop_picks')
        .delete()
        .eq('date', todayStr);
    } catch (delErr) {
      console.warn('[Prop Picks] delete warning:', delErr?.message || delErr);
    }

    const { error: insertError } = await supabase
      .from('prop_picks')
      .insert({ date: todayStr, picks: topPicks, created_at: new Date().toISOString() });
    if (insertError) {
      console.error('[Prop Picks] insert error:', insertError.message);
      return res.status(500).json({ ok: false, error: insertError.message });
    }

    console.log(`[Prop Picks] Stored ${topPicks.length} picks for ${todayStr}`);
    return res.status(200).json({ ok: true, stored: topPicks.length, totalGenerated: allPropPicks.length });
  } catch (error) {
    console.error('[Prop Picks] Fatal error:', error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
}


