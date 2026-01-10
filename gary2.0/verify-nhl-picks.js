#!/usr/bin/env node
/**
 * Verify NHL picks stored correctly in Supabase
 * Checks that each pick has unique pick text, odds, and rationale
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '.env.local'), override: true });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyNHLPicks() {
  // Get today's date in EST
  const now = new Date();
  const estOptions = { timeZone: 'America/New_York' };
  const estDate = now.toLocaleDateString('en-CA', estOptions); // YYYY-MM-DD

  console.log(`\n🔍 Verifying NHL picks for ${estDate}...\n`);

  // Query daily_picks for today's NHL picks
  const { data, error } = await supabase
    .from('daily_picks')
    .select('*')
    .eq('date', estDate)
    .eq('league', 'NHL')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Error fetching picks:', error);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('⚠️  No NHL picks found for today');
    process.exit(0);
  }

  console.log(`✅ Found ${data.length} NHL picks\n`);
  console.log('═'.repeat(80));

  // Check each pick
  const pickTexts = new Set();
  const rationales = new Set();
  
  data.forEach((pick, index) => {
    console.log(`\n📋 Pick #${index + 1}`);
    console.log(`   Teams: ${pick.awayTeam} @ ${pick.homeTeam}`);
    console.log(`   Pick: ${pick.pick || 'MISSING'}`);
    console.log(`   Odds: ${pick.odds || 'N/A'}`);
    console.log(`   Confidence: ${pick.confidence || 'N/A'}`);
    console.log(`   Rationale (first 100 chars): ${(pick.rationale || 'MISSING').substring(0, 100)}...`);
    
    // Track for duplicate detection
    pickTexts.add(pick.pick);
    rationales.add(pick.rationale);
  });

  console.log('\n' + '═'.repeat(80));
  console.log(`\n📊 SUMMARY:`);
  console.log(`   Total picks: ${data.length}`);
  console.log(`   Unique pick texts: ${pickTexts.size}`);
  console.log(`   Unique rationales: ${rationales.size}`);
  
  if (pickTexts.size < data.length) {
    console.log(`\n⚠️  WARNING: Found duplicate pick texts! (${pickTexts.size} unique out of ${data.length} total)`);
  } else {
    console.log(`\n✅ All picks have unique pick texts`);
  }
  
  if (rationales.size < data.length) {
    console.log(`⚠️  WARNING: Found duplicate rationales! (${rationales.size} unique out of ${data.length} total)`);
  } else {
    console.log(`✅ All picks have unique rationales`);
  }
}

verifyNHLPicks().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

