#!/usr/bin/env node
/**
 * 🐻 GARY LOCAL PICK GENERATOR
 * 
 * Run this script locally to generate picks for all sports.
 * Picks are stored directly in Supabase, so users will see them immediately.
 * 
 * Usage:
 *   node scripts/generate-picks-local.js              # Run all sports
 *   node scripts/generate-picks-local.js --nba       # Run NBA only
 *   node scripts/generate-picks-local.js --nfl       # Run NFL only
 *   node scripts/generate-picks-local.js --ncaab     # Run NCAAB only
 *   node scripts/generate-picks-local.js --ncaaf     # Run NCAAF only
 *   node scripts/generate-picks-local.js --nba --nfl # Run multiple sports
 */

// CRITICAL: Load env vars BEFORE any other imports
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Load .env.local first (has the most complete config), then .env as fallback
dotenv.config({ path: path.join(rootDir, '.env.local') });
dotenv.config({ path: path.join(rootDir, '.env') });

// Map env var aliases for compatibility
if (!process.env.SUPABASE_ANON_KEY && process.env.VITE_SUPABASE_ANON_KEY) {
  process.env.SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
}
if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
}
if (!process.env.PERPLEXITY_API_KEY && process.env.VITE_PERPLEXITY_API_KEY) {
  process.env.PERPLEXITY_API_KEY = process.env.VITE_PERPLEXITY_API_KEY;
}

// NOW import the services (after env vars are set)
const { generateNBAPicks } = await import('../src/services/nbaPicksHandler.js');
const { generateNFLPicks } = await import('../src/services/nflPicksHandler.js');
const { generateNCAABPicks } = await import('../src/services/ncaabPicksHandler.js');
const { generateNCAAFPicks } = await import('../src/services/ncaafPicksHandler.js');
const { picksService } = await import('../src/services/picksService.js');

// Parse command line arguments
const args = process.argv.slice(2);
const runNBA = args.includes('--nba') || args.length === 0;
const runNFL = args.includes('--nfl') || args.length === 0;
const runNCAAB = args.includes('--ncaab') || args.length === 0;
const runNCAAF = args.includes('--ncaaf') || args.length === 0;

// Color helpers for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

function banner() {
  console.log(`
${colors.cyan}╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🐻  GARY 2.0 LOCAL PICK GENERATOR  🐻                       ║
║                                                               ║
║   Picks will be stored directly in Supabase.                 ║
║   Users will see them immediately on the website.            ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝${colors.reset}
`);
}

async function runSport(name, emoji, generator) {
  log(colors.bright + colors.blue, `\n${'═'.repeat(60)}`);
  log(colors.bright + colors.yellow, `${emoji} STARTING ${name} PICK GENERATION`);
  log(colors.bright + colors.blue, `${'═'.repeat(60)}\n`);

  const startTime = Date.now();
  let totalPicks = 0;
  let gameIndex = 0;

  try {
    // Process games one by one until no more games
    while (true) {
      log(colors.cyan, `\n📊 Processing ${name} game at index ${gameIndex}...`);
      
      const result = await generator({ 
        onlyAtIndex: gameIndex, 
        nocache: true 
      });

      // Handle new metadata format
      const picks = result?.picks || (Array.isArray(result) ? result : []);
      const noMoreGames = result?.noMoreGames === true;
      const totalGames = result?.totalGames;

      if (noMoreGames) {
        log(colors.magenta, `\n✅ No more ${name} games (processed ${gameIndex} of ${totalGames || '?'} total)`);
        break;
      }

      if (picks.length > 0) {
        for (const pick of picks) {
          totalPicks++;
          const pickStr = pick?.rawAnalysis?.rawOpenAIOutput?.pick || pick?.pick || 'Unknown';
          const confidence = pick?.rawAnalysis?.rawOpenAIOutput?.confidence || pick?.confidence || '?';
          const game = pick?.game || `${pick?.awayTeam} @ ${pick?.homeTeam}`;
          
          log(colors.green, `\n🎯 PICK #${totalPicks}: ${pickStr}`);
          log(colors.yellow, `   Game: ${game}`);
          log(colors.yellow, `   Confidence: ${confidence}`);
          
          // Store in database
          try {
            await picksService.storeDailyPicksInDatabase([pick]);
            log(colors.green, `   ✓ Stored in Supabase`);
          } catch (storeErr) {
            log(colors.red, `   ✗ Storage error: ${storeErr.message}`);
          }
        }
      } else {
        log(colors.yellow, `   ⏭️  No pick generated for game ${gameIndex} (skipped or filtered)`);
      }

      gameIndex++;
      
      // Safety limit to prevent infinite loops
      if (gameIndex > 50) {
        log(colors.red, `\n⚠️  Safety limit reached (50 games). Stopping ${name}.`);
        break;
      }
    }
  } catch (err) {
    log(colors.red, `\n❌ Error in ${name}: ${err.message}`);
    console.error(err);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  log(colors.bright + colors.green, `\n${emoji} ${name} COMPLETE: ${totalPicks} picks in ${duration}s`);
  
  return totalPicks;
}

async function main() {
  banner();

  const sports = [];
  if (runNBA) sports.push({ name: 'NBA', emoji: '🏀', generator: generateNBAPicks });
  if (runNFL) sports.push({ name: 'NFL', emoji: '🏈', generator: generateNFLPicks });
  if (runNCAAB) sports.push({ name: 'NCAAB', emoji: '🏀', generator: generateNCAABPicks });
  if (runNCAAF) sports.push({ name: 'NCAAF', emoji: '🏈', generator: generateNCAAFPicks });

  log(colors.cyan, `Sports to process: ${sports.map(s => s.name).join(', ')}`);
  log(colors.cyan, `Started at: ${new Date().toLocaleString()}\n`);

  const startTime = Date.now();
  let grandTotal = 0;

  for (const sport of sports) {
    const count = await runSport(sport.name, sport.emoji, sport.generator);
    grandTotal += count;
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`
${colors.cyan}╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ✅ ALL SPORTS COMPLETE                                      ║
║                                                               ║
║   Total Picks Generated: ${String(grandTotal).padEnd(35)}║
║   Total Time: ${String(totalDuration + 's').padEnd(46)}║
║                                                               ║
║   Picks are now live in Supabase! 🚀                         ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝${colors.reset}
`);
}

// Run the script
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
