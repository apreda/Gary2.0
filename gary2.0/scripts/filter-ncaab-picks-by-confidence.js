#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Supabase URL or Service Role Key missing from environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [k, vInline] = a.split('=');
    const key = k.replace(/^--/, '');
    const v = vInline ?? argv[i + 1];
    if (vInline == null && v && !v.startsWith('--')) i++;
    out[key] = vInline != null ? vInline : v;
  }
  return out;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date || process.argv[2] || new Date().toISOString().slice(0, 10);
  const minConfidence = Number.parseFloat(args.minConfidence ?? args.min_confidence ?? args.min ?? '0.68');
  const sportKey = args.sport ?? args.sportKey ?? args.sport_key ?? 'basketball_ncaab';

  if (!Number.isFinite(minConfidence)) {
    console.error('❌ Invalid minConfidence. Example: --minConfidence 0.68');
    process.exit(1);
  }

  console.log(`🧹 Filtering ${sportKey} picks for ${date} with confidence >= ${minConfidence}...`);

  const { data: row, error: fetchError } = await supabase
    .from('daily_picks')
    .select('picks')
    .eq('date', date)
    .single();

  if (fetchError) {
    console.error('❌ Error fetching daily picks:', fetchError.message);
    process.exit(1);
  }

  const allPicks = Array.isArray(row?.picks) ? row.picks : [];
  const targetPicks = allPicks.filter((p) => p?.sport === sportKey);
  const otherPicks = allPicks.filter((p) => p?.sport !== sportKey);

  const keptTarget = targetPicks.filter((p) => {
    const c = typeof p?.confidence === 'number' ? p.confidence : Number.parseFloat(String(p?.confidence ?? 'NaN'));
    return Number.isFinite(c) && c >= minConfidence;
  });

  const removed = targetPicks.length - keptTarget.length;

  console.log(`Found ${allPicks.length} total picks`);
  console.log(`- ${sportKey}: ${targetPicks.length} → ${keptTarget.length} (removed ${removed})`);
  console.log(`- Other sports kept: ${otherPicks.length}`);

  if (removed <= 0) {
    console.log('✅ Nothing to remove.');
    return;
  }

  const newPicks = [...otherPicks, ...keptTarget];

  const { error: updateError } = await supabase
    .from('daily_picks')
    .update({ picks: newPicks })
    .eq('date', date);

  if (updateError) {
    console.error('❌ Error updating daily picks:', updateError.message);
    process.exit(1);
  }

  console.log('✅ Updated daily_picks row.');
  console.log(`Removed ${sportKey} picks:`);
  targetPicks
    .filter((p) => !keptTarget.includes(p))
    .slice(0, 20)
    .forEach((p) => {
      const conf = p?.confidence;
      console.log(`- ${(p?.awayTeam || p?.away_team || 'Away')} @ ${(p?.homeTeam || p?.home_team || 'Home')}: ${p?.pick} (conf ${conf})`);
    });
}

run().then(() => process.exit(0)).catch((e) => {
  console.error('❌ Script failed:', e);
  process.exit(1);
});


