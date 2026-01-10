#!/usr/bin/env node
/**
 * Test DFS Lineup Generation with REAL DATA
 * Uses actual API keys from .env to fetch today's NBA games and generate lineups
 */

import 'dotenv/config';
import handler from './api/generate-dfs-lineups.js';

const platform = process.argv[2] || 'draftkings';
const sport = process.argv[3] || 'NBA';
const date = process.argv[4] || new Date().toISOString().split('T')[0];

console.log(`\n🎰 Testing Gary's Fantasy with REAL DATA`);
console.log(`   Platform: ${platform}`);
console.log(`   Sport: ${sport}`);
console.log(`   Date: ${date}`);
console.log(`   Using real API keys from .env\n`);

// Mock request with auth
const req = {
  method: 'POST',
  headers: {
    'x-admin-token': process.env.DFS_GEN_SECRET || process.env.ADMIN_TASK_TOKEN || 'test'
  },
  query: {
    platform,
    sport,
    date
  }
};

// Mock response that logs output
const res = {
  setHeader: () => {},
  status: (code) => ({
    json: (data) => {
      console.log('\n' + '='.repeat(80));
      console.log('  RESULT');
      console.log('='.repeat(80));
      console.log(JSON.stringify(data, null, 2));
      console.log('\n');
    },
    end: () => {}
  })
};

// Run the handler
handler(req, res).catch(err => {
  console.error('\nError:', err.message);
  console.error(err.stack);
  process.exit(1);
});

