#!/usr/bin/env node
/**
 * Fix team names for specific NBA prop picks
 */
import axios from 'axios';

const supabaseUrl = 'https://xuttubsfgdcjfgmskcol.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dHR1YnNmZ2RjamZnbXNrY29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4OTY4MDQsImV4cCI6MjA1OTQ3MjgwNH0.wppXQAUHQXoD0z5wbjy93_0KYMREPufl_BCtb4Ugd40';

// Team corrections to apply
const teamCorrections = {
  'Julius Randle': 'Minnesota Timberwolves',
  'Karl-Anthony Towns': 'New York Knicks',
  'Harrison Barnes': 'San Antonio Spurs',
  "De'Aaron Fox": 'San Antonio Spurs'
};

async function fixPropTeams() {
  const today = '2025-12-19';
  console.log(`🔧 Fixing team names in prop_picks for ${today}...`);
  
  // 1. Fetch current prop picks
  const response = await axios({
    method: 'GET',
    url: `${supabaseUrl}/rest/v1/prop_picks`,
    params: { date: `eq.${today}` },
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    }
  });
  
  const data = response.data;
  
  if (!data || data.length === 0) {
    console.log('No prop picks found for today');
    return;
  }
  
  const row = data[0];
  const rowId = row.id;
  const picks = row.picks || [];
  
  console.log(`Found row ${rowId} with ${picks.length} picks`);
  
  // 2. Update team names for specific players
  let updatedCount = 0;
  const updatedPicks = picks.map(pick => {
    const correctTeam = teamCorrections[pick.player];
    if (correctTeam && pick.team !== correctTeam) {
      console.log(`  ✏️  ${pick.player}: "${pick.team}" → "${correctTeam}"`);
      updatedCount++;
      return { ...pick, team: correctTeam };
    }
    return pick;
  });
  
  if (updatedCount === 0) {
    console.log('\n⚠️  No matching picks found to update. Exiting without changes.');
    return;
  }
  
  console.log(`\nUpdating database...`);
  
  // 3. Update the database using the row ID
  const updateResponse = await axios({
    method: 'PATCH',
    url: `${supabaseUrl}/rest/v1/prop_picks?id=eq.${rowId}`,
    data: { picks: updatedPicks },
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  });
  
  console.log(`Update response status: ${updateResponse.status}`);
  
  // 4. Verify the update
  const verifyResponse = await axios({
    method: 'GET',
    url: `${supabaseUrl}/rest/v1/prop_picks`,
    params: { id: `eq.${rowId}` },
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    }
  });
  
  const verifiedPicks = verifyResponse.data[0]?.picks || [];
  const nbaPicks = verifiedPicks.filter(p => p.sport === 'NBA');
  
  console.log(`\n📋 Verification - NBA picks after update:`);
  for (const player of Object.keys(teamCorrections)) {
    const pick = nbaPicks.find(p => p.player === player);
    if (pick) {
      const status = pick.team === teamCorrections[player] ? '✅' : '❌';
      console.log(`  ${status} ${pick.player}: ${pick.team}`);
    }
  }
  
  console.log(`\n✅ Successfully updated ${updatedCount} player team names!`);
}

fixPropTeams().catch(err => {
  console.error('Error:', err.response?.data || err.message);
  process.exit(1);
});
