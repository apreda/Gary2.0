#!/usr/bin/env node
/**
 * Fix team names for specific NBA players in prop_picks for Dec 19, 2025
 * - Julius Randle -> Minnesota Timberwolves
 * - Karl-Anthony Towns -> New York Knicks
 * - Harrison Barnes -> San Antonio Spurs
 * - De'Aaron Fox -> San Antonio Spurs
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

// Player to correct team mapping
const teamCorrections = {
  'Julius Randle': 'Minnesota Timberwolves',
  'Karl-Anthony Towns': 'New York Knicks',
  'Karl Anthony Towns': 'New York Knicks',  // Handle variation without hyphen
  'Harrison Barnes': 'San Antonio Spurs',
  "De'Aaron Fox": 'San Antonio Spurs',
  'DeAaron Fox': 'San Antonio Spurs',  // Handle variation without apostrophe
  'Deaaron Fox': 'San Antonio Spurs'   // Handle lowercase variation
};

async function fixNbaTeamNames() {
  // Target December 19, 2025 specifically
  const targetDate = '2025-12-19';
  console.log(`🔧 Fixing NBA player team names in prop_picks for ${targetDate}...`);
  
  // 1. Fetch current prop_picks for the target date
  const { data } = await axios({
    method: 'GET',
    url: `${supabaseUrl}/rest/v1/prop_picks`,
    params: { date: `eq.${targetDate}` },
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    }
  });
  
  if (!data || data.length === 0) {
    console.log('No prop picks found for today');
    return;
  }
  
  console.log(`Found ${data.length} prop_picks record(s) for today`);
  
  let totalUpdates = 0;
  
  // 2. Process each record
  for (const row of data) {
    const picks = row.picks || [];
    let updated = false;
    
    // Check each pick for players that need team corrections
    const updatedPicks = picks.map(pick => {
      // Check if this player needs a team correction
      const playerName = pick.player;
      if (!playerName) return pick;
      
      // Normalize player name for comparison (lowercase, remove apostrophes/special chars)
      const normalizedPlayerName = playerName.toLowerCase().replace(/['-]/g, '');
      
      // Check against all variations of player names
      for (const [name, correctTeam] of Object.entries(teamCorrections)) {
        const normalizedTargetName = name.toLowerCase().replace(/['-]/g, '');
        
        // Check for exact match or close match
        if (normalizedPlayerName === normalizedTargetName ||
            normalizedPlayerName.includes(normalizedTargetName) ||
            normalizedTargetName.includes(normalizedPlayerName)) {
          if (pick.team !== correctTeam) {
            console.log(`  📝 ${playerName}: "${pick.team}" -> "${correctTeam}"`);
            pick.team = correctTeam;
            updated = true;
            totalUpdates++;
          }
          break; // Found a match, stop checking
        }
      }
      
      return pick;
    });
    
    // 3. Update the record if any changes were made
    if (updated) {
      await axios({
        method: 'PATCH',
        url: `${supabaseUrl}/rest/v1/prop_picks`,
        params: { id: `eq.${row.id}` },
        data: { picks: updatedPicks },
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }
      });
      console.log(`  ✅ Updated record ${row.id}`);
    }
  }
  
  if (totalUpdates === 0) {
    console.log('No team corrections needed - players may not be in today\'s picks or already correct');
  } else {
    console.log(`\n✅ Successfully updated ${totalUpdates} player team name(s)`);
  }
}

fixNbaTeamNames().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
