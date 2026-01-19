#!/usr/bin/env node
/**
 * One-off fix for tournamentContext on specific picks.
 *
 * Required env:
 * - SUPABASE_URL (or VITE_SUPABASE_URL)
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env:
 * - NFL_WEEK_NUMBER (default: 18)
 * - NFL_SEASON (optional; filters weekly rows)
 * - DAILY_PICKS_DATE (default: 2026-01-19)
 * - NFL_TOURNAMENT_CONTEXT (default: Playoffs)
 * - NCAAF_TOURNAMENT_CONTEXT (default: National Championship)
 * - DRY_RUN (set to "true" to skip updates)
 */
import { createRequire } from 'module';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase admin credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const WEEK_NUMBER = Number(process.env.NFL_WEEK_NUMBER || 18);
const SEASON = process.env.NFL_SEASON ? Number(process.env.NFL_SEASON) : null;
const DAILY_DATE = process.env.DAILY_PICKS_DATE || '2026-01-19';
const DRY_RUN = ['true', '1', 'yes'].includes((process.env.DRY_RUN || '').toLowerCase());
const NFL_TARGET_CONTEXT = process.env.NFL_TOURNAMENT_CONTEXT || 'Playoffs';
const NCAAF_TARGET_CONTEXT = process.env.NCAAF_TOURNAMENT_CONTEXT || 'National Championship';

const NFL_TARGETS = [
  { label: 'Patriots -3.5', regex: /(?:new england\s+)?patriots\s*-3\.5\b/i },
  { label: 'Bears +3.5', regex: /(?:chicago\s+)?bears\s*\+3\.5\b/i }
];

const NCAAF_TARGETS = [
  { label: 'Indiana -7', regex: /\bindiana\s*-7\b/i }
];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const getPickText = (pick) => {
  if (!pick || typeof pick !== 'object') return '';
  const candidates = [pick.pick, pick.pickText, pick.pick_text, pick.name];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return '';
};

const leagueMatches = (pick, leagueTag) => {
  const league = `${pick?.league || pick?.sport || ''}`.toUpperCase();
  if (!league) return true;
  if (leagueTag === 'NFL') return league.includes('NFL');
  if (leagueTag === 'NCAAF') {
    return league.includes('NCAAF') || league.includes('MCAAF') || league.includes('NCAA');
  }
  return true;
};

const applyTournamentContext = (picks, targets, leagueTag, targetContext) => {
  let updates = 0;
  const matches = new Map();
  const updatedPicks = picks.map((pick) => {
    if (!pick || typeof pick !== 'object') return pick;
    const pickText = getPickText(pick);
    if (!pickText || !leagueMatches(pick, leagueTag)) return pick;

    const target = targets.find((entry) => entry.regex.test(pickText));
    if (!target) return pick;

    matches.set(target.label, (matches.get(target.label) || 0) + 1);
    const currentContext = `${pick.tournamentContext || pick.tournament_context || ''}`.toLowerCase();
    if (currentContext === targetContext.toLowerCase()) return pick;

    updates += 1;
    const updatedPick = { ...pick, tournamentContext: targetContext };
    if (Object.prototype.hasOwnProperty.call(pick, 'tournament_context')) {
      updatedPick.tournament_context = targetContext;
    }
    return updatedPick;
  });

  return { updatedPicks, updates, matches };
};

const logMatches = (matches) => {
  if (matches.size === 0) {
    console.log('  No target picks matched.');
    return;
  }
  for (const [label, count] of matches.entries()) {
    console.log(`  Matched ${label}: ${count}`);
  }
};

const updateWeeklyNFLPicks = async () => {
  let query = supabase
    .from('weekly_nfl_picks')
    .select('week_start, week_number, season, picks')
    .eq('week_number', WEEK_NUMBER);

  if (Number.isFinite(SEASON)) {
    query = query.eq('season', SEASON);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch weekly_nfl_picks: ${error.message}`);
  }

  if (!data || data.length === 0) {
    console.log(`No weekly_nfl_picks rows found for week ${WEEK_NUMBER}.`);
    return { rowsUpdated: 0, picksUpdated: 0 };
  }

  let rowsUpdated = 0;
  let picksUpdated = 0;

  for (const row of data) {
    if (!Array.isArray(row.picks)) {
      console.warn(`Skipping week ${row.week_number} season ${row.season}: picks is not an array.`);
      continue;
    }

    const { updatedPicks, updates, matches } = applyTournamentContext(
      row.picks,
      NFL_TARGETS,
      'NFL',
      NFL_TARGET_CONTEXT
    );
    console.log(`Weekly NFL row: week ${row.week_number}, season ${row.season}`);
    logMatches(matches);

    if (updates === 0) {
      console.log('  No tournamentContext updates needed.');
      continue;
    }

    if (DRY_RUN) {
      console.log(`  DRY_RUN: would update ${updates} pick(s).`);
    } else {
      const { error: updateError } = await supabase
        .from('weekly_nfl_picks')
        .update({ picks: updatedPicks, updated_at: new Date().toISOString() })
        .eq('week_start', row.week_start)
        .eq('season', row.season);

      if (updateError) {
        throw new Error(`Failed to update weekly_nfl_picks week ${row.week_number}: ${updateError.message}`);
      }
      console.log(`  Updated ${updates} pick(s).`);
      rowsUpdated += 1;
      picksUpdated += updates;
    }
  }

  return { rowsUpdated, picksUpdated };
};

const updateDailyPicks = async () => {
  const { data, error } = await supabase
    .from('daily_picks')
    .select('id, date, picks')
    .eq('date', DAILY_DATE);

  if (error) {
    throw new Error(`Failed to fetch daily_picks for ${DAILY_DATE}: ${error.message}`);
  }

  if (!data || data.length === 0) {
    console.log(`No daily_picks rows found for ${DAILY_DATE}.`);
    return { rowsUpdated: 0, picksUpdated: 0 };
  }

  let rowsUpdated = 0;
  let picksUpdated = 0;

  for (const row of data) {
    if (!Array.isArray(row.picks)) {
      console.warn(`Skipping daily_picks ${row.date}: picks is not an array.`);
      continue;
    }

    const { updatedPicks, updates, matches } = applyTournamentContext(
      row.picks,
      NCAAF_TARGETS,
      'NCAAF',
      NCAAF_TARGET_CONTEXT
    );
    console.log(`Daily picks row: ${row.date}`);
    logMatches(matches);

    if (updates === 0) {
      console.log('  No tournamentContext updates needed.');
      continue;
    }

    if (DRY_RUN) {
      console.log(`  DRY_RUN: would update ${updates} pick(s).`);
    } else {
      const { error: updateError } = await supabase
        .from('daily_picks')
        .update({ picks: updatedPicks })
        .eq('id', row.id);

      if (updateError) {
        throw new Error(`Failed to update daily_picks ${row.date}: ${updateError.message}`);
      }
      console.log(`  Updated ${updates} pick(s).`);
      rowsUpdated += 1;
      picksUpdated += updates;
    }
  }

  return { rowsUpdated, picksUpdated };
};

const main = async () => {
  console.log('Starting tournamentContext update...');
  console.log(`NFL week: ${WEEK_NUMBER}${Number.isFinite(SEASON) ? `, season: ${SEASON}` : ''}`);
  console.log(`Daily date: ${DAILY_DATE}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY_RUN' : 'UPDATE'}`);

  const weeklyResult = await updateWeeklyNFLPicks();
  const dailyResult = await updateDailyPicks();

  console.log('Update complete.');
  console.log(`Weekly NFL rows updated: ${weeklyResult.rowsUpdated}, picks updated: ${weeklyResult.picksUpdated}`);
  console.log(`Daily rows updated: ${dailyResult.rowsUpdated}, picks updated: ${dailyResult.picksUpdated}`);
};

main().catch((error) => {
  console.error('Update failed:', error.message);
  process.exit(1);
});
