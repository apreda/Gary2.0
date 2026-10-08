#!/usr/bin/env node
/** One pass of the big-game ask (garyBigGameStake.js): node scripts/winners-big-game-stake.js [--date 2026-10-08] */
import '../src/loadEnv.js';
import { supabaseAdmin as supabase } from '../src/supabaseClient.js';
import { runBigGameStakes } from '../src/services/pickdesk/garyBigGameStake.js';
const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const date = arg('--date') || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const booked = await runBigGameStakes(supabase, date);
console.log(`[Big game] ${date}: ${booked} booked`);
