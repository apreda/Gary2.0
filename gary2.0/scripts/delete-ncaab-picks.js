#!/usr/bin/env node
/**
 * Delete NCAAB picks from today's daily_picks
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

async function deleteNcaabPicks() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`🗑️  Removing NCAAB picks for ${today}...`);
  
  // 1. Fetch current picks
  const { data } = await axios({
    method: 'GET',
    url: `${supabaseUrl}/rest/v1/daily_picks`,
    params: { date: `eq.${today}` },
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    }
  });
  
  if (!data || data.length === 0) {
    console.log('No picks found for today');
    return;
  }
  
  const row = data[0];
  const allPicks = row.picks || [];
  console.log(`Found ${allPicks.length} total picks`);
  
  // 2. Filter out NCAAB picks
  const ncaabPicks = allPicks.filter(p => p.league === 'NCAAB' || p.sport === 'basketball_ncaab');
  const otherPicks = allPicks.filter(p => p.league !== 'NCAAB' && p.sport !== 'basketball_ncaab');
  
  console.log(`NCAAB picks to remove: ${ncaabPicks.length}`);
  ncaabPicks.forEach(p => console.log(`  - ${p.awayTeam} @ ${p.homeTeam}: ${p.pick}`));
  console.log(`Other picks to keep: ${otherPicks.length}`);
  
  // 3. Update with only non-NCAAB picks
  await axios({
    method: 'PATCH',
    url: `${supabaseUrl}/rest/v1/daily_picks`,
    params: { date: `eq.${today}` },
    data: { picks: otherPicks },
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    }
  });
  
  console.log(`✅ Successfully removed ${ncaabPicks.length} NCAAB picks`);
}

deleteNcaabPicks().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

