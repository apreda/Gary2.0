// Serverless endpoint to generate and store daily picks
// Intended for use with a Vercel Cron Job (GET request)

import { picksService } from '../../src/services/picksService.js';

export default async function handler(req, res) {
  // Allow only GET (cron) and POST (manual trigger)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const start = Date.now();
    const picks = await picksService.generateDailyPicks();
    const ms = Date.now() - start;

    return res.status(200).json({
      success: true,
      generatedCount: Array.isArray(picks) ? picks.length : 0,
      durationMs: ms,
      message: 'Daily picks generation complete'
    });
  } catch (error) {
    console.error('[generate-daily-picks] Error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Unknown error' });
  }
}


