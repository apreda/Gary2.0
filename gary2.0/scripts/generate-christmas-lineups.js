#!/usr/bin/env node

/**
 * Generate NBA DFS Lineups for Christmas Day 2025
 * 
 * This script:
 * 1. Gets the NBA games scheduled for Dec 25, 2025
 * 2. Only uses players from teams playing that day
 * 3. Generates lineups for both DraftKings and FanDuel
 * 4. Stores them in Supabase
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const CHRISTMAS_DATE = '2025-12-25';
const CHRISTMAS_DATE_DISPLAY = 'December 25, 2025';

// Platform constraints
const PLATFORM_CONSTRAINTS = {
  draftkings: {
    NBA: {
      salaryCap: 50000,
      rosterSize: 8,
      positions: ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'UTIL']
    }
  },
  fanduel: {
    NBA: {
      salaryCap: 60000,
      rosterSize: 9,
      positions: ['PG', 'PG', 'SG', 'SG', 'SF', 'SF', 'PF', 'PF', 'C']
    }
  }
};

// Initialize clients
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');
  return new GoogleGenerativeAI(apiKey);
}

// Safety settings
const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
];

/**
 * Fetch Christmas Day games and generate complete lineups using Gemini
 */
async function generateChristmasLineup(platform) {
  const genAI = getGemini();
  const platformName = platform === 'draftkings' ? 'DraftKings' : 'FanDuel';
  const constraints = PLATFORM_CONSTRAINTS[platform].NBA;
  
  console.log(`\n🎄 Generating ${platformName} NBA lineup for Christmas Day 2025`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{ google_search: {} }],
    safetySettings: SAFETY_SETTINGS,
    generationConfig: {
      temperature: 0.9,
      topP: 0.95,
      maxOutputTokens: 16384,
    }
  });

  const prompt = `You are Gary AI, an expert DFS analyst. Generate an optimal ${platformName} NBA lineup for Christmas Day, December 25, 2025.

CRITICAL: Only use players from teams that are ACTUALLY PLAYING on Christmas Day 2025. The NBA Christmas games are typically 5 marquee matchups.

First, search for:
1. "NBA Christmas Day 2025 schedule games" - Find the exact teams playing
2. "${platformName} NBA salaries December 25 2025" - Get current salaries
3. "NBA injury report December 25 2025" - Check who's OUT

${platformName} Rules:
- Salary Cap: $${constraints.salaryCap.toLocaleString()}
- Roster: ${constraints.rosterSize} players
- Positions needed: ${constraints.positions.join(', ')}

For each player in the lineup, provide:
1. Position slot (${constraints.positions.join('/')})
2. Player name
3. Team abbreviation
4. Salary
5. Projected fantasy points
6. Rationale (1 sentence why this player)
7. 3-4 supporting stats
8. Three pivot options:
   - Direct Swap: Similar price (+/- $300), comparable upside
   - Mid Value: Saves $300-800 in salary
   - Budget Play: Saves $800+ to spend elsewhere

Return ONLY this JSON (no markdown):
{
  "christmas_games": [
    { "away": "TEAM", "home": "TEAM", "time": "12:00 PM ET" }
  ],
  "lineup": [
    {
      "position": "PG",
      "player": "Player Name",
      "team": "TM",
      "salary": 8500,
      "projected_pts": 45.5,
      "rationale": "Elite usage in high-total Christmas game",
      "supportingStats": [
        { "label": "PPG", "value": "28.5" },
        { "label": "AST", "value": "7.2" },
        { "label": "FP/G", "value": "52.3" }
      ],
      "pivots": [
        {
          "tier": "direct",
          "tierLabel": "Direct Swap",
          "player": "Alt Player",
          "team": "TM",
          "salary": 8400,
          "projected_pts": 43.0,
          "rationale": "Similar ceiling at lower ownership"
        },
        {
          "tier": "mid",
          "tierLabel": "Mid Value",
          "player": "Mid Player",
          "team": "TM",
          "salary": 7200,
          "projected_pts": 38.0,
          "rationale": "Saves salary while maintaining floor"
        },
        {
          "tier": "budget",
          "tierLabel": "Budget Play",
          "player": "Value Player",
          "team": "TM",
          "salary": 5500,
          "projected_pts": 28.0,
          "rationale": "Cheap pivot to upgrade elsewhere"
        }
      ]
    }
  ],
  "total_salary": 49500,
  "projected_points": 285.5,
  "gary_notes": "Narrative explanation of Gary's overall strategy for this lineup - mention key game stacks, value plays, and why certain stars are prioritized on Christmas Day. Keep it conversational and insightful, 2-3 sentences."
}

IMPORTANT:
- Total salary MUST be under $${constraints.salaryCap.toLocaleString()}
- ALL players must be from Christmas Day games only
- Include realistic 2025-26 season stats
- Pivot players must ALSO be from Christmas Day teams
- Make sure projected points are realistic based on salary and recent performance`;

  console.log('🔍 Searching for Christmas Day games and salaries...\n');
  
  const startTime = Date.now();
  const result = await model.generateContent(prompt);
  const duration = Date.now() - startTime;
  
  console.log(`✅ Response received in ${duration}ms`);
  
  const text = result.response.text();
  
  // Parse JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('❌ Failed to parse JSON from response');
    console.log('Raw response:', text.substring(0, 1000));
    throw new Error('Failed to parse lineup JSON');
  }
  
  const lineup = JSON.parse(jsonMatch[0]);
  
  // Display results
  console.log(`\n🎄 CHRISTMAS DAY GAMES:`);
  lineup.christmas_games?.forEach(g => {
    console.log(`   ${g.away} @ ${g.home} - ${g.time}`);
  });
  
  console.log(`\n📋 ${platformName.toUpperCase()} OPTIMAL LINEUP`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Salary: $${lineup.total_salary?.toLocaleString()} / $${constraints.salaryCap.toLocaleString()}`);
  console.log(`Projected: ${lineup.projected_points} pts`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  
  lineup.lineup.forEach((slot, i) => {
    const salary = `$${slot.salary?.toLocaleString()}`;
    const pts = slot.projected_pts?.toFixed(1) || '?';
    console.log(`${slot.position.padEnd(4)} ${slot.player.padEnd(24)} ${slot.team.padEnd(4)} ${salary.padStart(7)}  ${pts.padStart(5)} pts`);
    
    if (slot.rationale) {
      console.log(`     💡 ${slot.rationale}`);
    }
    
    if (slot.supportingStats?.length > 0) {
      const statsStr = slot.supportingStats.map(s => `${s.label}: ${s.value}`).join(' | ');
      console.log(`     📊 ${statsStr}`);
    }
    
    if (slot.pivots?.length > 0) {
      slot.pivots.forEach(p => {
        const pSalary = `$${p.salary?.toLocaleString()}`;
        const pPts = p.projected_pts?.toFixed(1) || '?';
        const diff = p.salary - slot.salary;
        const diffStr = diff >= 0 ? `+${diff}` : diff;
        console.log(`       ↳ ${(p.tierLabel || p.tier).padEnd(12)} ${p.player} (${p.team}) ${pSalary} ${pPts} pts [${diffStr}]`);
      });
    }
    console.log('');
  });
  
  if (lineup.gary_notes) {
    console.log(`📝 Gary's Notes:`);
    console.log(`   ${lineup.gary_notes}\n`);
  }
  
  // Add salary diff to pivots
  lineup.lineup = lineup.lineup.map(slot => ({
    ...slot,
    pivots: (slot.pivots || []).map(p => ({
      ...p,
      salaryDiff: p.salary - slot.salary
    }))
  }));
  
  return lineup;
}

/**
 * Store lineup in Supabase
 */
async function storeLineup(platform, lineup) {
  const supabase = getSupabase();
  const constraints = PLATFORM_CONSTRAINTS[platform].NBA;
  
  const record = {
    date: CHRISTMAS_DATE,
    platform,
    sport: 'NBA',
    salary_cap: constraints.salaryCap,
    total_salary: lineup.total_salary,
    projected_points: lineup.projected_points,
    lineup: lineup.lineup,
    gary_notes: lineup.gary_notes,
    updated_at: new Date().toISOString()
  };
  
  const { error } = await supabase
    .from('dfs_lineups')
    .upsert(record, { onConflict: 'date,platform,sport' });
  
  if (error) {
    console.error(`❌ Supabase error: ${error.message}`);
    return false;
  }
  
  console.log(`✅ Stored ${platform} lineup in Supabase`);
  return true;
}

async function main() {
  console.log(`\n🎄🏀 GARY'S CHRISTMAS DAY DFS LINEUPS 🏀🎄`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Date: ${CHRISTMAS_DATE_DISPLAY}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  
  try {
    // Generate DraftKings lineup
    const dkLineup = await generateChristmasLineup('draftkings');
    await storeLineup('draftkings', dkLineup);
    
    // Small delay between API calls
    await new Promise(r => setTimeout(r, 2000));
    
    // Generate FanDuel lineup
    const fdLineup = await generateChristmasLineup('fanduel');
    await storeLineup('fanduel', fdLineup);
    
    console.log(`\n🎄 All Christmas Day lineups generated and stored!`);
    console.log(`   View in app: Gary's Fantasy tab`);
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    if (error.stack) console.error(error.stack.split('\n').slice(0, 5).join('\n'));
    process.exit(1);
  }
}

main();

