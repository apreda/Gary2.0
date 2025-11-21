// Serverless endpoint to run the full daily picks orchestrator (NBA/MLB/NHL)
// Mirrors the behavior of pages/api/generate-daily-picks.js but for Vite/Vercel api/ routing

import { picksService } from '../src/services/picksService.js';
import { generateNBAPicks } from '../src/services/nbaPicksHandler.js';
import { generateMLBPicks } from '../src/services/mlbPicksHandler.js';
// NHL removed
import { generateNFLPicks } from '../src/services/nflPicksHandler.js';
import { generateWNBAPicks } from '../src/services/wnbaPicksHandler.js';
import { generateNCAAFPicks } from '../src/services/ncaafPicksHandler.js';
import { generateNCAABPicks } from '../src/services/ncaabPicksHandler.js';
import { generateEPLPicks } from '../src/services/eplPicksHandler.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const startedAt = Date.now();
    // Robust query parsing (req.query can be empty on some runtimes/redirects)
    let urlParams = {};
    try {
      const u = new URL(req.url, `http://${req.headers.host}`);
      urlParams = Object.fromEntries(u.searchParams.entries());
    } catch {}
    const query = req.query || {};
    const body = req.body || {};
    // Merge with URL params first so explicit query string values are honored
    const params = { ...urlParams, ...query, ...body };

    // Optional per-sport, per-game batching
    const allMode = params.all === '1' || params.all === 'true' || params.all === true;
    const sportsOrder = [
      'basketball_nba',
      'baseball_mlb',
      'americanfootball_nfl',
      'basketball_wnba',
      'americanfootball_ncaaf',
      'basketball_ncaab',
      'soccer_epl'
    ];
    let sport = params.sport || null;
    if (allMode && !sport) {
      sport = sportsOrder[0];
    }
    const cursor = Number.isFinite(Number(params.cursor)) ? Number(params.cursor) : 0;
    // Force single-game processing per request to avoid Vercel 120s timeouts
    const batch = 1;
    const autoNext = params.autonext === '1' || params.autonext === 'true' || params.autonext === true;
    // Default to fresh data (nocache=true) unless explicitly disabled
    const noCache = !(params.nocache === '0' || params.nocache === 'false');
    const forceReprocess = params.force === '1' || params.force === 'true' || params.force === true;

    const handlerMap = {
      baseball_mlb: generateMLBPicks,
      basketball_nba: generateNBAPicks,
      americanfootball_nfl: generateNFLPicks,
      basketball_wnba: generateWNBAPicks,
      americanfootball_ncaaf: generateNCAAFPicks,
      basketball_ncaab: generateNCAABPicks,
      soccer_epl: generateEPLPicks
    };

    let picks;
    let processedCount = 0;
    if (sport && handlerMap[sport]) {
      console.log(`[run-daily-picks] Batched processing for sport=${sport}, cursor=${cursor}, batch=${batch}`);
      const collected = [];
      for (let i = 0; i < batch; i++) {
        const index = cursor + i;
        try {
          const one = await handlerMap[sport]({ onlyAtIndex: index, nocache: noCache, force: forceReprocess });
          if (Array.isArray(one) && one.length > 0) {
            collected.push(...one);
          }
        } catch (e) {
          console.error(`[run-daily-picks] Error processing ${sport} at index ${index}:`, e?.message || e);
          if (e?.code === 'MISSING_ODDS') {
            throw e;
          }
        }
      }
      picks = collected;
      processedCount = Array.isArray(picks) ? picks.length : 0;
      // Append/store immediately (per-game/per-batch)
      if (Array.isArray(picks) && picks.length > 0) {
        await picksService.storeDailyPicksInDatabase(picks);
      }
    } else {
      // Full multi-sport generation
      picks = await picksService.generateDailyPicks();
    }

    const durationMs = Date.now() - startedAt;
    const nextCursor = sport ? cursor + 1 : null;
    const baseUrl = req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host']
      ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
      : '';
    // Determine nextUrl considering all-sports mode and whether this batch produced picks
    let nextSport = sport || null;
    let nextUrl = null;
    if (sport) {
      if (allMode && processedCount === 0) {
        // Advance to next sport when current sport returns no more picks
        const idx = sportsOrder.indexOf(sport);
        const nextIdx = idx >= 0 && idx + 1 < sportsOrder.length ? idx + 1 : -1;
        nextSport = nextIdx >= 0 ? sportsOrder[nextIdx] : null;
        if (nextSport) {
          nextUrl = `${baseUrl}/api/run-daily-picks?all=1&sport=${encodeURIComponent(nextSport)}&cursor=0&batch=${batch}${autoNext ? '&autonext=1' : ''}`;
        } else {
          nextUrl = null; // All done
        }
      } else {
        // Continue within same sport
        nextUrl = `${baseUrl}/api/run-daily-picks?${allMode ? 'all=1&' : ''}sport=${encodeURIComponent(sport)}&cursor=${nextCursor}&batch=1${autoNext ? '&autonext=1' : ''}`;
      }
    }

    // Auto-redirect to next step to avoid manual URL changes
    if (autoNext && nextUrl) {
      res.statusCode = 302;
      res.setHeader('Location', nextUrl);
      return res.end();
    }

    return res.status(200).json({
      success: true,
      generatedCount: Array.isArray(picks) ? picks.length : 0,
      durationMs,
      message: sport ? (allMode ? 'Batched (all-sports) step complete' : 'Batched picks generation step complete') : 'Daily picks generation complete',
      sport: sport || null,
      allMode,
      cursor,
      batch,
      nextCursor,
      nextSport,
      nextUrl
    });
  } catch (error) {
    console.error('[run-daily-picks] Error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Unknown error' });
  }
}

