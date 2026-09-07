// One-off, reviewed metadata enrichment for an existing quiet-day context row.
// Default: read/prepare a local receipt. Only --apply-reviewed writes, and that
// phase uses the reviewed games without calling a provider or model again.
import '../../gary2.0/src/loadEnv.js';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(new URL('../../gary2.0/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const currentDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const client = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });

function validate(receipt) {
  if (!['NFL', 'NCAAF'].includes(receipt.league) || receipt.date !== currentDate() || !receipt.id) throw new Error('Receipt must target one current-day football row');
  const old = receipt.expected_meta;
  const checked = Date.parse(receipt.next_slate_checked_at);
  if (!Number.isFinite(checked) || checked > Date.now() + 60_000 || Date.now() - checked > 30 * 60_000) throw new Error('Prepare a fresh schedule receipt before applying');
  const games = receipt.next_slate_games;
  if (old?.kind !== 'next_slate' || old.date !== receipt.date || old.scheduled_date <= receipt.date
      || !Array.isArray(games) || games.length !== old.game_count || games.length === 0
      || games.some(game => !game.game_id || game.scheduled_date !== old.scheduled_date)
      || new Set(games.map(game => game.game_id)).size !== games.length) throw new Error('Reviewed metadata must preserve the verified slate and exact game count');
}

if (option('--apply-reviewed')) {
  const receipt = JSON.parse(readFileSync(option('--apply-reviewed'), 'utf8'));
  validate(receipt);
  const meta = { ...receipt.expected_meta, next_slate_games: receipt.next_slate_games,
    next_slate_checked_at: receipt.next_slate_checked_at };
  // JSONB equality makes this a compare-and-swap: a concurrent normal writer
  // wins safely instead of receiving a stale metadata overwrite.
  const { data, error } = await client.from('insight_connections').update({ meta })
    .eq('id', receipt.id).eq('date', receipt.date).eq('league', receipt.league)
    .eq('category', 'next_slate').eq('meta', JSON.stringify(receipt.expected_meta)).select('id');
  if (error) throw new Error(error.message);
  if (data?.length !== 1) throw new Error('Existing row changed; no reviewed enrichment was applied');
  console.log(`Enriched one ${receipt.league} next-slate row; headline, detail and all other rows retained.`);
} else {
  const league = String(option('--league') || 'NFL').toUpperCase();
  if (!['NFL', 'NCAAF'].includes(league)) throw new Error('Expected --league NFL or NCAAF');
  const date = currentDate();
  const { data, error } = await client.from('insight_connections').select('id,date,league,meta')
    .eq('date', date).eq('league', league).eq('category', 'next_slate').limit(2);
  if (error) throw new Error(error.message);
  if (data?.length !== 1) throw new Error('Expected exactly one existing quiet-day context row');
  const { ballDontLieService: bdl } = await import('../../gary2.0/src/services/ballDontLieService.js');
  const { loadFootballSlate } = await import('../../gary2.0/src/services/insights/footballData.js');
  const games = await loadFootballSlate({ bdl, league: league.toLowerCase(), date });
  if (games.length) throw new Error('Today has games; the next-slate-only refresh is inappropriate');
  const module = league === 'NFL'
    ? await import('../../gary2.0/src/services/insights/computers/nflNextSlate.js')
    : await import('../../gary2.0/src/services/insights/computers/ncaafNextSlate.js');
  const compute = league === 'NFL' ? module.computeNflNextSlate : module.computeNcaafNextSlate;
  const rows = await compute({ league: league.toLowerCase(), date, games: [], bdl, as_of: new Date().toISOString() });
  if (rows.length !== 1 || rows[0].meta.scheduled_date !== data[0].meta.scheduled_date
      || rows[0].meta.game_count !== data[0].meta.game_count
      || rows[0].meta.first_confirmed_kickoff !== data[0].meta.first_confirmed_kickoff) {
    throw new Error('The underlying schedule changed; use the normal full context refresh after review');
  }
  const receipt = { date, league, id: data[0].id, expected_meta: data[0].meta,
    next_slate_games: rows[0].meta.next_slate_games, next_slate_checked_at: rows[0].meta.next_slate_checked_at };
  validate(receipt);
  const output = option('--output') || `/tmp/gary-${league.toLowerCase()}-next-slate-review.json`;
  writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  console.log(`Prepared ${receipt.next_slate_games.length} ${league} matchup(s) for review at ${output}. No rows written.`);
}
