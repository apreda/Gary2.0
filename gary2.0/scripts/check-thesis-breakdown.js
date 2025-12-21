#!/usr/bin/env node
/**
 * Check thesis breakdown for NBA picks on a given date
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    // Get date from args or default to yesterday
    const dateArg = process.argv[2];
    let queryDate;

    if (dateArg) {
        queryDate = dateArg;
    } else {
        // Default to yesterday EST
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        queryDate = yesterday.toISOString().split('T')[0];
    }

    console.log(`\nFetching NBA picks from ${queryDate}...\n`);

    const { data, error } = await supabase
        .from('daily_picks')
        .select('date, picks')
        .eq('date', queryDate)
        .single();

    if (error) {
        console.error('Error:', error.message);
        return;
    }

    if (!data || !data.picks) {
        console.log('No picks found for', queryDate);
        return;
    }

    const picks = typeof data.picks === 'string' ? JSON.parse(data.picks) : data.picks;
    const nbaPicks = picks.filter(p => p.league === 'NBA' || p.sport === 'basketball_nba');

    console.log('='.repeat(80));
    console.log(`NBA PICKS FROM ${queryDate} - THESIS BREAKDOWN`);
    console.log('='.repeat(80));
    console.log();

    // Group by thesis type
    const byThesis = {};

    nbaPicks.forEach((pick) => {
        const thesis = pick.thesis_type || 'NO_THESIS';
        if (!byThesis[thesis]) byThesis[thesis] = [];
        byThesis[thesis].push(pick);
    });

    // Print summary
    console.log('SUMMARY:');
    console.log('-'.repeat(40));
    Object.entries(byThesis).forEach(([thesis, thesisPicks]) => {
        console.log(`  ${thesis}: ${thesisPicks.length} picks`);
    });
    console.log(`\n  TOTAL: ${nbaPicks.length} NBA picks`);
    console.log();

    // Print each pick with details
    console.log('DETAILED BREAKDOWN:');
    console.log('-'.repeat(80));

    nbaPicks.forEach((pick, i) => {
        const majors = pick.contradicting_factors?.major?.length || 0;
        const minors = pick.contradicting_factors?.minor?.length || 0;
        console.log();
        console.log(`${i + 1}. ${pick.pick}`);
        console.log(`   Thesis Type: ${pick.thesis_type || 'NOT SET'}`);
        console.log(`   Confidence: ${pick.confidence}`);
        console.log(`   Mechanism: ${(pick.thesis_mechanism || 'N/A').substring(0, 100)}`);
        console.log(`   Contradictions: MAJOR=${majors}, minor=${minors}`);
        if (pick.contradicting_factors?.major?.length) {
            console.log(`   Major factors: ${pick.contradicting_factors.major.join(', ')}`);
        }
    });

    console.log('\n' + '='.repeat(80));
}

main().catch(console.error);
