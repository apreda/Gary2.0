#!/usr/bin/env node

/**
 * Test Pick Generation Script
 * 
 * This script tests the pick generation and storage process.
 * It can be used to verify that everything is working correctly
 * before running in production.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { generateAndStorePicks } from './pickManager.js';
import { logger } from '../src/utils/logger.js';

// Configure environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Configure logger
const log = logger.child({ module: 'testPickGeneration' });

/**
 * Main test function
 */
async function testPickGeneration() {
  try {
    log.info('Starting pick generation test');
    
    // 1. Test pick generation and storage
    log.info('Testing pick generation and storage...');
    const picks = await generateAndStorePicks();
    
    if (!picks || picks.length === 0) {
      log.error('❌ No picks were generated');
      process.exit(1);
    }
    
    log.info(`✅ Successfully generated and stored ${picks.length} picks`);
    
    // 2. Log sample pick
    const samplePick = picks[0];
    log.info('Sample pick:', {
      id: samplePick.id,
      sport: samplePick.sport,
      game: `${samplePick.away_team} @ ${samplePick.home_team}`,
      pick: `${samplePick.pick_team} (${samplePick.pick_type})`,
      confidence: samplePick.confidence,
      created_at: samplePick.created_at
    });
    
    log.info('✅ Pick generation test completed successfully');
    process.exit(0);
  } catch (error) {
    log.error({ error }, '❌ Pick generation test failed');
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  testPickGeneration();
}
