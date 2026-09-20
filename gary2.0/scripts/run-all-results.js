#!/usr/bin/env node
/**
 * Results CLI: full settlement/recaps by default; optional manual football backstop.
 * Usage: node scripts/run-all-results.js [YYYY-MM-DD] [--football-settlements]
 * Ownership and testing: scripts/lib/results/README.md.
 */
import { createClient } from '@supabase/supabase-js';
import { parseResultsRunArgs } from './lib/resultsRunMode.js';
import { createResultsEngine } from './lib/results/index.js';

// Load environment variables FIRST (centralized)
await import('../src/loadEnv.js');

const RUN_OPTIONS = parseResultsRunArgs(process.argv.slice(2));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const BDL_API_KEY = process.env.BALLDONTLIE_API_KEY || process.env.VITE_BALL_DONT_LIE_API_KEY || process.env.BALL_DONT_LIE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials.');
  process.exit(1);
}

if (!BDL_API_KEY) {
  console.error('❌ Missing BallDontLie API key.');
  process.exit(1);
}

console.log(`\n🚀 GARY'S ULTIMATE RESULTS ENGINE`);
console.log(`════════════════════════════════════════`);
console.log(`🔑 Supabase:  ✅ ${SUPABASE_URL}`);
console.log(`📡 BDL API:   ✅`);
console.log(`📡 Grounding: ✅ (authorized subscription search)`);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});


const { run } = createResultsEngine({ supabase, apiKey: BDL_API_KEY, runOptions: RUN_OPTIONS });

run().catch(err => {
  console.error('\n❌ FATAL ERROR:', err);
  process.exit(1);
});
