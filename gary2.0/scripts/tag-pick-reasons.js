#!/usr/bin/env node
// Tags every published game pick that has no row in gary_pick_reasons (src/services/jev/pickReasons.js).
// Safe to run again: a tagged pick is skipped. Usage: node scripts/tag-pick-reasons.js [--league NFL,NCAAF] [--since 2026-08-01]
import 'dotenv/config';
import { supabaseAdmin, supabase } from '../src/supabaseClient.js';
import { tagUntaggedPicks } from '../src/services/jev/pickReasons.js';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback; };
const leagues = arg('--league', 'NFL,NCAAF').split(',').map((s) => s.trim()).filter(Boolean);
const since = arg('--since', `${new Date().getFullYear()}-08-01`);

const { tagged, missed, already } = await tagUntaggedPicks(supabaseAdmin || supabase, { leagues, since });
console.log(`done: ${tagged} tagged, ${missed} left untagged, ${already} already tagged`);
process.exit(0);
