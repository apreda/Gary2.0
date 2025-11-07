// Serverless endpoint to run the full daily picks orchestrator (NBA/MLB/NHL)
// Mirrors the behavior of pages/api/generate-daily-picks.js but for Vite/Vercel api/ routing

import { picksService } from '../src/services/picksService.js';
import { generateNBAPicks } from '../src/services/nbaPicksHandler.js';
import { generateMLBPicks } from '../src/services/mlbPicksHandler.js';
import { generateNHLPicks } from '../src/services/nhlPicksHandler.js';
import { generateNFLPicks } from '../src/services/nflPicksHandler.js';
import { generateWNBAPicks } from '../src/services/wnbaPicksHandler.js';
import { generateNCAAFPicks } from '../src/services/ncaafPicksHandler.js';
import { generateNCAABPicks } from '../src/services/ncaabPicksHandler.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const startedAt = Date.now();
    const query = req.query || {};
    const body = req.body || {};
    const params = { ...query, ...body };

    // Optional per-sport, per-game batching
    const sport = params.sport;
    const cursor = Number.isFinite(Number(params.cursor)) ? Number(params.cursor) : 0;
    const batch = Number.isFinite(Number(params.batch)) ? Number(params.batch) : 1;
    const autoNext = params.autonext === '1' || params.autonext === 'true' || params.autonext === true;

    const handlerMap = {
      baseball_mlb: generateMLBPicks,
      basketball_nba: generateNBAPicks,
      icehockey_nhl: generateNHLPicks,
      americanfootball_nfl: generateNFLPicks,
      basketball_wnba: generateWNBAPicks,
      americanfootball_ncaaf: generateNCAAFPicks,
      basketball_ncaab: generateNCAABPicks
    };

    let picks;
    if (sport && handlerMap[sport]) {
      console.log(`[run-daily-picks] Batched processing for sport=${sport}, cursor=${cursor}, batch=${batch}`);
      const collected = [];
      for (let i = 0; i < batch; i++) {
        const index = cursor + i;
        try {
          const one = await handlerMap[sport]({ onlyAtIndex: index });
          if (Array.isArray(one) && one.length > 0) {
            collected.push(...one);
          }
        } catch (e) {
          console.error(`[run-daily-picks] Error processing ${sport} at index ${index}:`, e?.message || e);
        }
      }
      picks = collected;
      // Append/store immediately (per-game/per-batch)
      if (Array.isArray(picks) && picks.length > 0) {
        await picksService.storeDailyPicksInDatabase(picks);
      }
    } else {
      // Full multi-sport generation
      picks = await picksService.generateDailyPicks();
    }

    const durationMs = Date.now() - startedAt;
    const nextCursor = sport ? cursor + batch : null;
    const baseUrl = req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host']
      ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
      : '';
    const nextUrl = sport
      ? `${baseUrl}/api/run-daily-picks?sport=${encodeURIComponent(sport)}&cursor=${nextCursor}&batch=${batch}${autoNext ? '&autonext=1' : ''}`
      : null;

    return res.status(200).json({
      success: true,
      generatedCount: Array.isArray(picks) ? picks.length : 0,
      durationMs,
      message: sport ? 'Batched picks generation step complete' : 'Daily picks generation complete',
      sport: sport || null,
      cursor,
      batch,
      nextCursor,
      nextUrl
    });
  } catch (error) {
    console.error('[run-daily-picks] Error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Unknown error' });
  }
}

