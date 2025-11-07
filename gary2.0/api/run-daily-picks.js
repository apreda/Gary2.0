// Serverless endpoint to run the full daily picks orchestrator (NBA/MLB/NHL)
// Mirrors the behavior of pages/api/generate-daily-picks.js but for Vite/Vercel api/ routing

import { picksService } from '../src/services/picksService.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const startedAt = Date.now();
    const picks = await picksService.generateDailyPicks();
    const durationMs = Date.now() - startedAt;

    return res.status(200).json({
      success: true,
      generatedCount: Array.isArray(picks) ? picks.length : 0,
      durationMs,
      message: 'Daily picks generation complete'
    });
  } catch (error) {
    console.error('[run-daily-picks] Error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Unknown error' });
  }
}


