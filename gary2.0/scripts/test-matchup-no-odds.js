#!/usr/bin/env node
/**
 * Test Matchup Generator (No Odds Required)
 * 
 * Run Gary's analysis on any matchup without needing odds from the API
 * 
 * Usage:
 *   node scripts/test-matchup-no-odds.js --sport ncaaf --away "Indiana Hoosiers" --home "Oregon Ducks" --date 2026-01-10
 *   node scripts/test-matchup-no-odds.js --sport nba --away "Lakers" --home "Celtics" --date 2026-01-15
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env vars
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const { analyzeGame } = await import('../src/services/agentic/agenticOrchestrator.js');

// Parse command line args
const args = process.argv.slice(2);

function getArgValue(flag) {
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const next = args[idx + 1];
  if (!next || next.startsWith('--')) return undefined;
  return next;
}

const sport = getArgValue('--sport');
const awayTeam = getArgValue('--away');
const homeTeam = getArgValue('--home');
const dateStr = getArgValue('--date') || new Date().toISOString().split('T')[0];

if (!sport || !awayTeam || !homeTeam) {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║           🐻 GARY TEST MATCHUP (NO ODDS REQUIRED) 🐻             ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Test any matchup without needing odds from the API             ║
║                                                                  ║
║  Usage:                                                          ║
║    --sport <sport>     Sport (nba, nfl, nhl, ncaaf, ncaab)      ║
║    --away <team>       Away team name                            ║
║    --home <team>       Home team name                            ║
║    --date <date>       Game date (YYYY-MM-DD, optional)          ║
║                                                                  ║
║  Examples:                                                       ║
║    node scripts/test-matchup-no-odds.js --sport ncaaf \\         ║
║         --away "Indiana Hoosiers" --home "Oregon Ducks" \\       ║
║         --date 2026-01-10                                        ║
║                                                                  ║
║    node scripts/test-matchup-no-odds.js --sport nba \\           ║
║         --away "Lakers" --home "Celtics"                         ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);
  process.exit(0);
}

// Map sport to API key
const SPORT_KEYS = {
  'nba': 'basketball_nba',
  'nfl': 'americanfootball_nfl',
  'nhl': 'icehockey_nhl',
  'ncaaf': 'americanfootball_ncaaf',
  'ncaab': 'basketball_ncaab',
  'mlb': 'baseball_mlb'
};

const sportKey = SPORT_KEYS[sport.toLowerCase()];
if (!sportKey) {
  console.error(`❌ Invalid sport: ${sport}`);
  console.error(`   Valid options: ${Object.keys(SPORT_KEYS).join(', ')}`);
  process.exit(1);
}

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║           🐻 GARY TEST MATCHUP ANALYSIS 🐻                       ║
╠══════════════════════════════════════════════════════════════════╣
║  Sport:        ${sport.toUpperCase().padEnd(50)} ║
║  Matchup:      ${awayTeam.padEnd(50)} ║
║                @ ${homeTeam.padEnd(48)} ║
║  Date:         ${dateStr.padEnd(50)} ║
╚══════════════════════════════════════════════════════════════════╝
`);

// Construct minimal game object
const gameDate = new Date(dateStr + 'T20:00:00Z'); // Default to 8pm UTC
const game = {
  id: `test-${Date.now()}`,
  sport_key: sportKey,
  sport_title: sport.toUpperCase(),
  commence_time: gameDate.toISOString(),
  home_team: homeTeam,
  away_team: awayTeam,
  bookmakers: [] // No odds - Gary will analyze without them
};

console.log('\n🔄 Starting analysis (this may take 2-5 minutes)...\n');

try {
  const result = await analyzeGame(game, sportKey, {
    requireOdds: false,
    testMode: true
  });

  if (result.error) {
    console.error(`\n❌ Analysis failed: ${result.error}\n`);
    process.exit(1);
  }

  // Display results
  console.log('\n' + '═'.repeat(70));
  console.log('📊 GARY\'S ANALYSIS RESULT');
  console.log('═'.repeat(70) + '\n');

  if (result.pick) {
    console.log(`✅ PICK: ${result.pick}`);
    console.log(`   Type: ${result.type || 'N/A'}`);
    
    if (result.thesis_mechanism) {
      console.log(`\n💡 THESIS:`);
      console.log(`   ${result.thesis_mechanism}`);
    }

    if (result.supporting_factors && result.supporting_factors.length > 0) {
      console.log(`\n✅ SUPPORTING FACTORS:`);
      result.supporting_factors.forEach(factor => {
        console.log(`   • ${factor}`);
      });
    }

    if (result.contradicting_factors) {
      const major = result.contradicting_factors.major || [];
      const minor = result.contradicting_factors.minor || [];
      
      if (major.length > 0) {
        console.log(`\n⚠️  MAJOR CONTRADICTIONS:`);
        major.forEach(factor => {
          console.log(`   • ${factor}`);
        });
      }
      
      if (minor.length > 0) {
        console.log(`\n⚡ MINOR CONTRADICTIONS:`);
        minor.forEach(factor => {
          console.log(`   • ${factor}`);
        });
      }
    }

    if (result.rationale) {
      console.log(`\n📝 FULL RATIONALE:\n`);
      console.log(result.rationale);
    }

    if (result.statsUsed && result.statsUsed.length > 0) {
      console.log(`\n📊 STATS ANALYZED (${result.statsUsed.length}):`);
      console.log(`   ${result.statsUsed.join(', ')}`);
    }

  } else {
    console.log('⚠️  Gary passed on this game (no pick generated)');
  }

  console.log('\n' + '═'.repeat(70));
  console.log('✅ Analysis complete!');
  console.log('═'.repeat(70) + '\n');

} catch (error) {
  console.error(`\n❌ Error during analysis: ${error.message}\n`);
  console.error(error.stack);
  process.exit(1);
}

