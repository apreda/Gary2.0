/**
 * Regenerate DFS lineups with safe injury filtering
 * Excludes QUESTIONABLE, GTD, DTD players
 */
import 'dotenv/config';
import { buildDFSContext } from '../src/services/agentic/dfsAgenticContext.js';
import { generateDFSLineup, validateLineup } from '../src/services/dfsLineupService.js';
import fs from 'fs';

async function main() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const est = new Date(utc + (3600000 * -5));
  const today = est.toISOString().split('T')[0];
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  REGENERATING DFS LINEUPS (Excluding QUESTIONABLE/GTD players)');
  console.log('  Date:', today);
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('');
  
  // Generate FanDuel
  console.log('📊 Building FanDuel NBA context...');
  const fdContext = await buildDFSContext('fanduel', 'NBA', today);
  const fdLineup = await generateDFSLineup({
    platform: 'fanduel',
    sport: 'NBA',
    players: fdContext.players,
    context: { fadePlayers: fdContext.fadePlayers || [], targetPlayers: fdContext.targetPlayers || [] }
  });
  const fdValid = validateLineup(fdLineup, 'fanduel', 'NBA').valid;
  
  console.log('');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('  FANDUEL NBA LINEUP');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`  Players in pool: ${fdContext.players.length}`);
  console.log(`  Salary: $${fdLineup.total_salary.toLocaleString()} / $60,000`);
  console.log(`  Projected: ${fdLineup.projected_points.toFixed(1)} pts`);
  console.log(`  Valid: ${fdValid ? '✅ YES' : '❌ NO'}`);
  console.log('');
  fdLineup.lineup.forEach((p, i) => {
    console.log(`  ${i+1}. ${p.position.padEnd(4)} ${p.player.padEnd(22)} $${p.salary.toLocaleString().padStart(6)} | ${p.projected_pts?.toFixed(1) || '?'} pts`);
  });
  
  // Check Embiid exclusion
  const embiidInFD = fdLineup.lineup.some(p => p.player.toLowerCase().includes('embiid'));
  console.log('');
  console.log(`  Embiid (Q): ${embiidInFD ? '❌ STILL IN LINEUP' : '✅ EXCLUDED'}`);
  
  // Build notes
  const fdNotes = [];
  if (fdContext.targetPlayers?.length > 0) {
    fdNotes.push('🎯 Targets: ' + fdContext.targetPlayers.slice(0, 3).map(t => t.name).join(', '));
  }
  if (fdContext.fadePlayers?.length > 0) {
    fdNotes.push('⚠️ Fading: ' + fdContext.fadePlayers.slice(0, 2).map(f => f.name).join(', '));
  }
  const fdCheapest = fdLineup.lineup.reduce((min, p) => p.salary < min.salary ? p : min, fdLineup.lineup[0]);
  fdNotes.push(`💰 Value: ${fdCheapest.player} ($${fdCheapest.salary.toLocaleString()})`);
  
  // Generate DraftKings
  console.log('');
  console.log('📊 Building DraftKings NBA context...');
  const dkContext = await buildDFSContext('draftkings', 'NBA', today);
  const dkLineup = await generateDFSLineup({
    platform: 'draftkings',
    sport: 'NBA',
    players: dkContext.players,
    context: { fadePlayers: dkContext.fadePlayers || [], targetPlayers: dkContext.targetPlayers || [] }
  });
  const dkValid = validateLineup(dkLineup, 'draftkings', 'NBA').valid;
  
  console.log('');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('  DRAFTKINGS NBA LINEUP');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`  Players in pool: ${dkContext.players.length}`);
  console.log(`  Salary: $${dkLineup.total_salary.toLocaleString()} / $50,000`);
  console.log(`  Projected: ${dkLineup.projected_points.toFixed(1)} pts`);
  console.log(`  Valid: ${dkValid ? '✅ YES' : '❌ NO'}`);
  console.log('');
  dkLineup.lineup.forEach((p, i) => {
    console.log(`  ${i+1}. ${p.position.padEnd(4)} ${p.player.padEnd(22)} $${p.salary.toLocaleString().padStart(6)} | ${p.projected_pts?.toFixed(1) || '?'} pts`);
  });
  
  const embiidInDK = dkLineup.lineup.some(p => p.player.toLowerCase().includes('embiid'));
  console.log('');
  console.log(`  Embiid (Q): ${embiidInDK ? '❌ STILL IN LINEUP' : '✅ EXCLUDED'}`);
  
  // Build notes
  const dkNotes = [];
  if (dkContext.targetPlayers?.length > 0) {
    dkNotes.push('🎯 Targets: ' + dkContext.targetPlayers.slice(0, 3).map(t => t.name).join(', '));
  }
  if (dkContext.fadePlayers?.length > 0) {
    dkNotes.push('⚠️ Fading: ' + dkContext.fadePlayers.slice(0, 2).map(f => f.name).join(', '));
  }
  const dkCheapest = dkLineup.lineup.reduce((min, p) => p.salary < min.salary ? p : min, dkLineup.lineup[0]);
  dkNotes.push(`💰 Value: ${dkCheapest.player} ($${dkCheapest.salary.toLocaleString()})`);
  
  // Save to file for Supabase insertion
  const output = {
    fanduel: {
      salary: fdLineup.total_salary,
      points: fdLineup.projected_points,
      notes: fdNotes.join(' | '),
      lineup: fdLineup.lineup,
      valid: fdValid
    },
    draftkings: {
      salary: dkLineup.total_salary,
      points: dkLineup.projected_points,
      notes: dkNotes.join(' | '),
      lineup: dkLineup.lineup,
      valid: dkValid
    }
  };
  
  fs.writeFileSync('/tmp/dfs_safe.json', JSON.stringify(output, null, 2));
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  ✅ COMPLETE - Saved to /tmp/dfs_safe.json');
  console.log('═══════════════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
});

