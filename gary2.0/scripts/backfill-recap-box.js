/**
 * BACKFILL THE BOX LINE (Aug 5 2026).
 *
 * game_recaps.box landed after these rows were written, so the headline card
 * had runs and no hits for every game already recapped. This walks a date's
 * MLB recaps, re-fetches that game's batting lines from BDL, and PATCHes the
 * box in. It NEVER touches headline/recap/bullets — no model call, no rewrite;
 * the prose those rows already carry is what shipped and stays.
 *
 * Usage: node scripts/backfill-recap-box.js 2026-08-04 [2026-08-05 ...]
 */
import { createClient } from '@supabase/supabase-js';
import { buildBoxLine } from '../src/services/gameRecap.js';
await import('../src/loadEnv.js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const BDL_API_KEY = process.env.BALLDONTLIE_API_KEY || process.env.VITE_BALL_DONT_LIE_API_KEY || process.env.BALL_DONT_LIE_API_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const dates = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
if (!dates.length) {
  console.error('Usage: node scripts/backfill-recap-box.js YYYY-MM-DD [...]');
  process.exit(1);
}

async function statsForGame(gameId) {
  if (!BDL_API_KEY || gameId == null) return null;
  try {
    const res = await fetch(
      `https://api.balldontlie.io/mlb/v1/stats?game_ids[]=${gameId}&per_page=100`,
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
    .eq('game_date', date).eq('league', 'MLB');
  const { data: pickRows } = await supabase
    .from('daily_picks').select('picks').eq('date', date);
  const { data: results } = await supabase
    .from('game_results').select('matchup,final_score').eq('game_date', date);

  const picks = (pickRows || []).flatMap((r) =>
    typeof r.picks === 'string' ? JSON.parse(r.picks) : (r.picks || []));
  const gameIdByMatchup = new Map(
    picks.map((p) => [`${p.awayTeam} @ ${p.homeTeam}`, p.game_id]));
  const scoreByMatchup = new Map((results || []).map((r) => [r.matchup, r.final_score]));

  console.log(`\n📦 ${date} — ${recaps?.length ?? 0} MLB recap(s)`);
  let written = 0, skipped = 0;

  for (const row of recaps || []) {
    if (row.box) { skipped++; continue; }
    const gameId = gameIdByMatchup.get(row.matchup);
    const [away, home] = String(row.matchup || '').split(' @ ');
    const [awayScore, homeScore] = String(scoreByMatchup.get(row.matchup) || '')
      .split('-').map(Number);
    const stats = await statsForGame(gameId);
    const box = buildBoxLine({ mlbStats: stats, awayTeam: away, homeTeam: home, awayScore, homeScore });
    if (!box) {
      console.log(`   ⏭️  ${row.matchup}: no batting lines`);
      skipped++;
      continue;
    }
    const { error } = await supabase.from('game_recaps').update({ box }).eq('id', row.id);
    if (error) {
      console.error(`   ❌ ${row.matchup}: ${error.message}`);
      continue;
    }
    console.log(`   ✅ ${row.matchup}: ${away} ${box.away.runs}R ${box.away.hits}H · ${home} ${box.home.runs}R ${box.home.hits}H`);
    written++;
  }
  console.log(`   → ${written} written, ${skipped} skipped`);
}
