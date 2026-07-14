/**
 * run-allstar-pulse.js — LEAGUE PULSE for a no-game MLB day (All-Star break).
 *
 * The daily insights runner no-ops when the MLB slate is empty, but the break
 * still has a "slate": the event's participants. This driver reads the day's
 * All-Star board (allstar_props), uses its players as the batter pool and their
 * teams as the injuries filter, and UPSERTs the standard League Pulse tabs so
 * the iOS Pulse view runs exactly like any other day.
 *
 * Usage:
 *   node scripts/run-allstar-pulse.js                 # today (ET)
 *   node scripts/run-allstar-pulse.js --date 2026-07-14
 */

import '../src/loadEnv.js';

import axios from 'axios';
import { getESTDate } from '../src/utils/dateUtils.js';

const { buildLeaguePulse } = await import('../src/services/insights/leaguePulse.js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const args = process.argv.slice(2);
const dateFlag = args.indexOf('--date');
const date = (dateFlag !== -1 && args[dateFlag + 1]) || getESTDate();

const headers = {
  apikey: adminKey,
  Authorization: `Bearer ${adminKey}`,
  'Content-Type': 'application/json',
};

// The board's team labels are display names ("White Sox"); the BDL injuries
// feed speaks abbreviations. Only teams that can appear on an All-Star board
// need mapping — extend as boards do.
const TEAM_ABBR = {
  'yankees': 'NYY', 'phillies': 'PHI', 'royals': 'KC', 'cardinals': 'STL',
  'rays': 'TB', 'white sox': 'CHW', 'red sox': 'BOS', 'dodgers': 'LAD',
  'braves': 'ATL', 'mets': 'NYM', 'cubs': 'CHC', 'mariners': 'SEA',
  'astros': 'HOU', 'orioles': 'BAL', 'guardians': 'CLE', 'tigers': 'DET',
  'blue jays': 'TOR', 'twins': 'MIN', 'rangers': 'TEX', 'angels': 'LAA',
  'athletics': 'ATH', 'giants': 'SF', 'padres': 'SD', 'diamondbacks': 'ARI',
  'rockies': 'COL', 'brewers': 'MIL', 'pirates': 'PIT', 'reds': 'CIN',
  'marlins': 'MIA', 'nationals': 'WSH',
};

async function run() {
  // The day's participant pool — every board row with a resolved BDL player id.
  const { data: rows } = await axios.get(
    `${supabaseUrl}/rest/v1/allstar_props?date=eq.${date}&player_id=not.is.null&select=player,team,player_id`,
    { headers },
  );
  const ids = [...new Set((rows || []).map((r) => String(r.player_id)))];
  const abbrs = [...new Set((rows || [])
    .map((r) => TEAM_ABBR[String(r.team || '').toLowerCase()])
    .filter(Boolean))];

  // An empty pool still builds the league-wide tabs (ASG day: no contest
  // list, but the Hot & Cold Teams form stays live).
  console.log(`[allstar-pulse] ${date}: pool = ${ids.length} player(s)${abbrs.length ? `, teams = ${abbrs.join(', ')}` : ''}`);

  const packs = await buildLeaguePulse({
    date, league: 'MLB',
    batterIdsOverride: ids,
    teamAbbrsOverride: abbrs,
  });
  if (!packs.length) {
    console.log('[allstar-pulse] No tabs built.');
    return;
  }

  const out = packs.map((p) => ({
    date: p.date, league: p.league, tab: p.tab, title: p.title,
    subtitle: p.subtitle ?? null, columns: p.columns, rows: p.rows,
    sort_note: p.sort_note ?? null, generated_by: 'allstar-pulse',
  }));
  // on_conflict names the (date,league,tab) UNIQUE key — PostgREST merges
  // against the PK by default, which 23505s on a same-day re-run.
  await axios.post(`${supabaseUrl}/rest/v1/league_pulse?on_conflict=date,league,tab`, JSON.parse(JSON.stringify(out)), {
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
  });
  console.log(`[allstar-pulse] ✅ Stored ${out.length} tab(s): ${out.map((r) => r.tab).join(', ')}.`);
}

run().catch((e) => {
  console.error('[allstar-pulse] FAILED:', e.response?.data ? JSON.stringify(e.response.data) : e.message);
  process.exit(1);
});
