/**
 * BACKFILL THE BOX LINE (Aug 5 2026; football added Sep 4 2026).
 *
 * game_recaps.box landed after these rows were written, so the headline card
 * had runs and no hits for every game already recapped. This walks a date's
 * recaps, re-fetches that game's box from BDL, and PATCHes it in. It NEVER
 * touches headline/recap/bullets — no model call, no rewrite; the prose those
 * rows already carry is what shipped and stays.
 *
 * Baseball counts hits and home runs; football counts touchdowns (founder,
 * Sep 4 2026: the football card is the MLB card "to a tee except HR are TD").
 *
 * Usage: node scripts/backfill-recap-box.js 2026-08-04 [2026-08-05 ...]
 *        node scripts/backfill-recap-box.js --league=NCAAF 2026-09-03
 */
import { createClient } from '@supabase/supabase-js';
import { loadRecapBox, recapBoxComplete } from '../src/services/recapBox.js';
await import('../src/loadEnv.js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const BDL_API_KEY = process.env.BALLDONTLIE_API_KEY || process.env.VITE_BALL_DONT_LIE_API_KEY || process.env.BALL_DONT_LIE_API_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dates = args.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const LEAGUE = (args.find((a) => a.startsWith('--league='))?.split('=')[1] ?? 'MLB').toUpperCase();
const STAT_PATH = { MLB: 'mlb/v1/stats', NFL: 'nfl/v1/stats', NCAAF: 'ncaaf/v1/player_stats' }[LEAGUE];
if (!STAT_PATH) {
  console.error(`Unsupported league: ${LEAGUE} (MLB, NFL, NCAAF)`);
  process.exit(1);
}
if (!dates.length) {
  console.error('Usage: node scripts/backfill-recap-box.js YYYY-MM-DD [...]');
  process.exit(1);
}

async function statsForGame(gameId) {
  if (!BDL_API_KEY || gameId == null) return null;
  try {
    const res = await fetch(
      `https://api.balldontlie.io/${STAT_PATH}?game_ids[]=${gameId}&per_page=100`,
      { headers: { Authorization: BDL_API_KEY }, signal: AbortSignal.timeout(20_000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.length ? data.data : null;
  } catch { return null; }
}

for (const date of dates) {
  const { data: recaps } = await supabase
    .from('game_recaps').select('id,matchup,box')
    .eq('game_date', date).eq('league', LEAGUE);
  const { data: results } = await supabase
    .from('game_results').select('game_id,matchup,final_score').eq('game_date', date).eq('league', LEAGUE);

  console.log(`\n📦 ${date} — ${recaps?.length ?? 0} ${LEAGUE} recap(s)`);
  let written = 0, skipped = 0;

  for (const row of recaps || []) {
    // Refresh rows written before the league's stat line joined the box.
    if (recapBoxComplete(row.box, LEAGUE)) { skipped++; continue; }
    const matching = (results || []).filter(r => r.matchup === row.matchup);
    if (matching.length !== 1 || matching[0].game_id == null) { skipped++; continue; }
    const gameId = matching[0].game_id;
    const [away, home] = String(row.matchup || '').split(' @ ');
    const scoreParts = String(matching[0].final_score || '').split(/[-–]/).map(s => s.trim());
    if (scoreParts.length !== 2 || !scoreParts.every(s => /^\d+$/.test(s))) { skipped++; continue; }
    const [awayScore, homeScore] = scoreParts.map(Number);
    const stats = LEAGUE === 'MLB' ? await statsForGame(gameId) : null;
    const sides = { awayTeam: away, homeTeam: home, awayScore, homeScore };
    const box = await loadRecapBox({ league: LEAGUE, gameId, mlbStats: stats, ...sides, apiKey: BDL_API_KEY });
    if (!box) {
      console.log(`   ⏭️  ${row.matchup}: no usable box`);
      skipped++;
      continue;
    }
    if (dryRun) { console.log(`   PREVIEW ${row.id} ${row.matchup}: ${JSON.stringify(box)}`); continue; }
    const { error } = await supabase.from('game_recaps').update({ box }).eq('id', row.id);
    if (error) {
      console.error(`   ❌ ${row.matchup}: ${error.message}`);
      continue;
    }
    const line = (side, name) => LEAGUE === 'MLB'
      ? `${name} ${side.runs}R ${side.hits}H`
      : `${name} ${side.runs} (${side.td} TD)`;
    console.log(`   ✅ ${row.matchup}: ${line(box.away, away)} · ${line(box.home, home)}`);
    written++;
  }
  console.log(`   → ${written} written, ${skipped} skipped`);
}
