#!/usr/bin/env node
/**
 * PLAYER RED ZONE, filled from Ball Don't Lie's NFL play-by-play (Sep 24 2026).
 * Reads every final game not yet read into nfl_red_zone_games. The NFL dart
 * run and the NFL props desk call the same refresh before they read, so this
 * script is for backfills.
 *
 *   node scripts/refresh-nfl-red-zone.js            # this season
 *   node scripts/refresh-nfl-red-zone.js 2025 2026
 */
import '../src/loadEnv.js';
import { createClient } from '@supabase/supabase-js';
import { refreshNflRedZone } from '../src/services/nflRedZone.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const now = new Date();
const thisSeason = now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
const seasons = process.argv.slice(2).map(Number).filter(Boolean);
const t0 = Date.now();
const read = await refreshNflRedZone({ supabase, seasons: seasons.length ? seasons : [thisSeason] });
console.log(`red zone: ${read} games read in ${Math.round((Date.now() - t0) / 1000)} s`);
process.exit(0);
