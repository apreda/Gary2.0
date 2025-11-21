import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import runDailyPicks from '../api/run-daily-picks.js';

// Load env vars
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const app = express();
const PORT = 3001;

// Middleware to parse JSON bodies (though run-daily-picks mainly uses query params)
app.use(express.json());

app.all('/api/run-daily-picks', async (req, res) => {
  console.log(`Received request: ${req.method} ${req.url}`);
  try {
    await runDailyPicks(req, res);
  } catch (error) {
    console.error('Error in handler:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Picks API Server running at http://localhost:${PORT}`);
  console.log(`👉 Trigger NBA Picks: http://localhost:${PORT}/api/run-daily-picks?sport=basketball_nba&nocache=1`);
});

