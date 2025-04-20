// Scheduled background job: Runs syncGameResults.js daily at 10:30am ET using node-cron
// Usage: node scripts/syncGameResults.cron.js

import cron from 'node-cron';
import { exec } from 'child_process';

console.log('Starting scheduled job for syncing game results...');

// Schedule: 10:30am every day, Eastern Time (America/New_York)
cron.schedule('30 10 * * *', () => {
  console.log(`[${new Date().toLocaleString()}] Running syncGameResults.js...`);
  exec('node scripts/syncGameResults.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error running syncGameResults.js:`, error);
      return;
    }
    if (stderr) console.error('stderr:', stderr);
    if (stdout) console.log('stdout:', stdout);
  });
}, {
  timezone: 'America/New_York'
});

// Keep process alive
process.stdin.resume();
