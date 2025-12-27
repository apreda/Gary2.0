/**
 * Test Comprehensive Props Narrative Fetching
 * 
 * Tests that all three sports (NBA, NHL, NFL) can fetch the comprehensive
 * narrative context including all required factors.
 * 
 * Run with: node scripts/test-comprehensive-narrative.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

// Import the function we're testing
import { fetchComprehensivePropsNarrative } from '../src/services/agentic/scoutReport/scoutReportBuilder.js';

const EXPECTED_SECTIONS = {
  NBA: ['breakingNews', 'motivation', 'schedule', 'playerContext', 'teamTrends', 'bettingSignals'],
  NHL: ['breakingNews', 'motivation', 'schedule', 'playerContext', 'teamTrends', 'bettingSignals', 'goalies'],
  NFL: ['breakingNews', 'motivation', 'schedule', 'weather', 'playerContext', 'teamTrends', 'bettingSignals', 'qbSituation']
};

const TEST_MATCHUPS = [
  { sport: 'NBA', home: 'Los Angeles Lakers', away: 'Boston Celtics' },
  { sport: 'NHL', home: 'Edmonton Oilers', away: 'Colorado Avalanche' },
  { sport: 'NFL', home: 'Buffalo Bills', away: 'Kansas City Chiefs' }
];

async function testNarrative(sport, homeTeam, awayTeam) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing ${sport}: ${awayTeam} @ ${homeTeam}`);
  console.log('='.repeat(80));
  
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  
  try {
    const result = await fetchComprehensivePropsNarrative(homeTeam, awayTeam, sport, today, { useFlash: true });
    
    if (!result) {
      console.log(`❌ ${sport}: Failed to fetch narrative (null result)`);
      return false;
    }
    
    console.log(`\n✅ ${sport}: Got narrative (${result.raw?.length || 0} chars)`);
    
    // Check which sections were found
    const expectedSections = EXPECTED_SECTIONS[sport] || [];
    const foundSections = [];
    const missingSections = [];
    
    for (const section of expectedSections) {
      if (result.sections?.[section] && result.sections[section].length > 10) {
        foundSections.push(section);
      } else {
        missingSections.push(section);
      }
    }
    
    console.log(`\n📋 Sections Found (${foundSections.length}/${expectedSections.length}):`);
    foundSections.forEach(s => console.log(`   ✅ ${s}`));
    
    if (missingSections.length > 0) {
      console.log(`\n⚠️ Sections Missing or Empty:`);
      missingSections.forEach(s => console.log(`   ⚠️ ${s}`));
    }
    
    // Show preview of each section
    console.log(`\n📝 Section Previews:`);
    for (const [key, value] of Object.entries(result.sections || {})) {
      if (value && value.length > 10) {
        const preview = value.substring(0, 200).replace(/\n/g, ' ').trim();
        console.log(`\n   [${key}] (${value.length} chars):`);
        console.log(`   "${preview}..."`);
      }
    }
    
    // Check for key expected content
    const rawLower = (result.raw || '').toLowerCase();
    const keyFactors = {
      NBA: ['back-to-back', 'revenge', 'milestone', 'contract', 'injury', 'lineup'],
      NHL: ['goalie', 'back-to-back', 'revenge', 'injury', 'line combination'],
      NFL: ['weather', 'wind', 'quarterback', 'qb', 'injury', 'revenge', 'contract']
    };
    
    console.log(`\n🔍 Key Factors Mentioned:`);
    const factors = keyFactors[sport] || [];
    factors.forEach(factor => {
      const found = rawLower.includes(factor);
      console.log(`   ${found ? '✅' : '⚠️'} ${factor}`);
    });
    
    return foundSections.length >= expectedSections.length * 0.5; // Pass if at least 50% of sections found
    
  } catch (error) {
    console.log(`❌ ${sport}: Error - ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🧪 Testing Comprehensive Props Narrative Fetching');
  console.log(`📅 Date: ${new Date().toLocaleDateString()}`);
  console.log(`🔑 GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ Set' : '❌ Missing'}`);
  
  if (!process.env.GEMINI_API_KEY) {
    console.error('\n❌ GEMINI_API_KEY is required. Add it to .env.local');
    process.exit(1);
  }
  
  const results = [];
  
  for (const { sport, home, away } of TEST_MATCHUPS) {
    const passed = await testNarrative(sport, home, away);
    results.push({ sport, passed });
    
    // Small delay between tests to avoid rate limiting
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  
  let allPassed = true;
  for (const { sport, passed } of results) {
    console.log(`${passed ? '✅' : '❌'} ${sport}`);
    if (!passed) allPassed = false;
  }
  
  console.log(`\n${allPassed ? '✅ All tests passed!' : '⚠️ Some tests had issues - check output above'}`);
  
  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);

