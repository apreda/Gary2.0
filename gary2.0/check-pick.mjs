import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '.env.local'), override: true });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const { data, error } = await supabase
  .from('test_daily_picks')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(1);

if (error) {
  console.log('Error:', error);
  process.exit(1);
}

if (data && data.length > 0) {
  const latest = data[0];
  console.log('\n=== LATEST PICK IN test_daily_picks ===');
  console.log('Test Name:', latest.test_name);
  console.log('Created At:', latest.created_at);

  if (latest.picks && latest.picks.length > 0) {
    const pick = latest.picks[0];
    console.log('\n--- PICK DETAILS ---');
    console.log('Pick:', pick.pick);
    console.log('Type:', pick.type);
    console.log('Confidence:', pick.confidence);

    console.log('\n--- RATIONALE (Gary\'s Take) ---');
    console.log(pick.rationale || 'N/A');

    console.log('\n--- STEEL MAN CASES STORED? ---');
    if (pick.steelManCases) {
      console.log('✅ YES - Steel Man Cases are stored!');
      console.log('\nHome Team Case (' + (pick.steelManCases.homeTeamCase?.length || 0) + ' chars):');
      console.log(pick.steelManCases.homeTeamCase?.substring(0, 600) + '...');
      console.log('\nAway Team Case (' + (pick.steelManCases.awayTeamCase?.length || 0) + ' chars):');
      console.log(pick.steelManCases.awayTeamCase?.substring(0, 600) + '...');
    } else {
      console.log('❌ NO - Steel Man Cases NOT stored');
    }
  }
}
