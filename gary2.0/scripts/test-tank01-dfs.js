#!/usr/bin/env node
/**
 * Test script for Tank01 DFS API integration
 * 
 * Usage:
 *   node scripts/test-tank01-dfs.js
 *   node scripts/test-tank01-dfs.js --nba
 *   node scripts/test-tank01-dfs.js --nfl
 *   node scripts/test-tank01-dfs.js --date 2025-01-20
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Import the services
import { fetchDfsSalaries, fetchNbaDfsSalaries, fetchNflDfsSalaries } from '../src/services/tank01DfsService.js';
import { buildDFSContext } from '../src/services/agentic/dfsAgenticContext.js';

// Parse command line arguments
const args = process.argv.slice(2);
const testNba = args.includes('--nba') || (!args.includes('--nfl'));
const testNfl = args.includes('--nfl') || (!args.includes('--nba'));
const dateArg = args.find(a => a.startsWith('--date='))?.split('=')[1];

// Get today's date or use provided date
function getTestDate() {
  if (dateArg) return dateArg;
  
  const today = new Date();
  // Adjust for EST timezone
  const utc = today.getTime() + (today.getTimezoneOffset() * 60000);
  const est = new Date(utc + (3600000 * -5));
  return est.toISOString().split('T')[0];
}

async function testTank01Direct() {
  console.log('\n' + '='.repeat(70));
  console.log('TANK01 DFS API DIRECT TEST');
  console.log('='.repeat(70) + '\n');
  
  const testDate = getTestDate();
  console.log(`📅 Test date: ${testDate}\n`);
  
  // Test NBA if requested
  if (testNba) {
    console.log('🏀 Testing NBA DFS salaries...');
    console.log('-'.repeat(50));
    
    for (const platform of ['draftkings', 'fanduel']) {
      console.log(`\n📊 Platform: ${platform.toUpperCase()}`);
      
      try {
        const result = await fetchNbaDfsSalaries(testDate, platform);
        
        if (result.error) {
          console.error(`❌ Error: ${result.error}`);
        } else {
          console.log(`✅ Found ${result.players.length} players`);
          console.log(`⏱️ Fetch time: ${result.fetchTimeMs}ms`);
          
          if (result.players.length > 0) {
            // Show top 5 by salary
            const sorted = [...result.players].sort((a, b) => b.salary - a.salary);
            console.log('\nTop 5 by salary:');
            sorted.slice(0, 5).forEach((p, i) => {
              console.log(`  ${i + 1}. ${p.name} (${p.team}) - ${p.position} - $${p.salary.toLocaleString()} - ${p.status}`);
            });
            
            // Show salary distribution
            const salaries = result.players.map(p => p.salary).filter(s => s > 0);
            if (salaries.length > 0) {
              const min = Math.min(...salaries);
              const max = Math.max(...salaries);
              const avg = Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length);
              console.log(`\nSalary range: $${min.toLocaleString()} - $${max.toLocaleString()} (avg: $${avg.toLocaleString()})`);
            }
            
            // Show position breakdown
            const byPosition = {};
            result.players.forEach(p => {
              byPosition[p.position] = (byPosition[p.position] || 0) + 1;
            });
            console.log('\nBy position:', Object.entries(byPosition).map(([pos, count]) => `${pos}: ${count}`).join(', '));
          }
        }
      } catch (err) {
        console.error(`❌ Exception: ${err.message}`);
      }
    }
  }
  
  // Test NFL if requested
  if (testNfl) {
    console.log('\n\n🏈 Testing NFL DFS salaries...');
    console.log('-'.repeat(50));
    
    for (const platform of ['draftkings', 'fanduel']) {
      console.log(`\n📊 Platform: ${platform.toUpperCase()}`);
      
      try {
        const result = await fetchNflDfsSalaries(testDate, platform);
        
        if (result.error) {
          console.error(`❌ Error: ${result.error}`);
        } else {
          console.log(`✅ Found ${result.players.length} players`);
          console.log(`⏱️ Fetch time: ${result.fetchTimeMs}ms`);
          
          if (result.players.length > 0) {
            // Show top 5 by salary
            const sorted = [...result.players].sort((a, b) => b.salary - a.salary);
            console.log('\nTop 5 by salary:');
            sorted.slice(0, 5).forEach((p, i) => {
              console.log(`  ${i + 1}. ${p.name} (${p.team}) - ${p.position} - $${p.salary.toLocaleString()} - ${p.status}`);
            });
            
            // Show position breakdown
            const byPosition = {};
            result.players.forEach(p => {
              byPosition[p.position] = (byPosition[p.position] || 0) + 1;
            });
            console.log('\nBy position:', Object.entries(byPosition).map(([pos, count]) => `${pos}: ${count}`).join(', '));
          }
        }
      } catch (err) {
        console.error(`❌ Exception: ${err.message}`);
      }
    }
  }
}

async function testFullDFSContext() {
  console.log('\n\n' + '='.repeat(70));
  console.log('FULL DFS CONTEXT BUILD TEST (Tank01 + BDL + Gemini)');
  console.log('='.repeat(70) + '\n');
  
  const testDate = getTestDate();
  
  if (testNba) {
    console.log('🏀 Building full NBA DFS context for DraftKings...');
    console.log('-'.repeat(50));
    
    try {
      const context = await buildDFSContext('draftkings', 'NBA', testDate);
      
      console.log(`\n📊 Results:`);
      console.log(`  - Total players: ${context.players?.length || 0}`);
      console.log(`  - Games: ${context.gamesCount || 0}`);
      console.log(`  - BDL players: ${context.bdlPlayersCount || 0}`);
      console.log(`  - Tank01 players: ${context.tank01PlayersCount || 0}`);
      console.log(`  - Build time: ${context.buildTimeMs}ms`);
      console.log(`  - Salary source: ${context.salarySource || 'unknown'}`);
      console.log(`  - Salary quality: ${context.salaryDataInfo?.quality || 'unknown'}`);
      
      if (context.error) {
        console.error(`  ❌ Error: ${context.error}`);
      }
      
      if (context.players?.length > 0) {
        // Show sample players
        const withSalary = context.players.filter(p => p.salary > 0);
        console.log(`\n  Players with salary: ${withSalary.length}/${context.players.length}`);
        
        // Top 5 by projection
        const sorted = [...withSalary].sort((a, b) => (b.projected_pts || 0) - (a.projected_pts || 0));
        console.log('\n  Top 5 by projected points:');
        sorted.slice(0, 5).forEach((p, i) => {
          console.log(`    ${i + 1}. ${p.name} (${p.team}) - ${p.position} - $${(p.salary || 0).toLocaleString()} - ${p.status || 'HEALTHY'}`);
        });
      }
    } catch (err) {
      console.error(`❌ Exception: ${err.message}`);
      console.error(err.stack);
    }
  }
  
  if (testNfl) {
    console.log('\n\n🏈 Building full NFL DFS context for FanDuel...');
    console.log('-'.repeat(50));
    
    try {
      const context = await buildDFSContext('fanduel', 'NFL', testDate);
      
      console.log(`\n📊 Results:`);
      console.log(`  - Total players: ${context.players?.length || 0}`);
      console.log(`  - Games: ${context.gamesCount || 0}`);
      console.log(`  - BDL players: ${context.bdlPlayersCount || 0}`);
      console.log(`  - Tank01 players: ${context.tank01PlayersCount || 0}`);
      console.log(`  - Build time: ${context.buildTimeMs}ms`);
      console.log(`  - Salary source: ${context.salarySource || 'unknown'}`);
      console.log(`  - Salary quality: ${context.salaryDataInfo?.quality || 'unknown'}`);
      
      if (context.error) {
        console.error(`  ❌ Error: ${context.error}`);
      }
      
      if (context.players?.length > 0) {
        const withSalary = context.players.filter(p => p.salary > 0);
        console.log(`\n  Players with salary: ${withSalary.length}/${context.players.length}`);
      }
    } catch (err) {
      console.error(`❌ Exception: ${err.message}`);
      console.error(err.stack);
    }
  }
}

// Main execution
async function main() {
  console.log('🚀 Tank01 DFS API Integration Test');
  console.log(`📅 Using date: ${getTestDate()}`);
  console.log(`🏀 Test NBA: ${testNba}`);
  console.log(`🏈 Test NFL: ${testNfl}`);
  
  // Test 1: Direct Tank01 API calls
  await testTank01Direct();
  
  // Test 2: Full DFS context build (includes BDL + Gemini)
  await testFullDFSContext();
  
  console.log('\n\n✅ Tests complete!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

