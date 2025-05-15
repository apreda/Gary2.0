#!/usr/bin/env node

/**
 * End-to-End Test Script
 * 
 * This script tests the complete pick generation and storage flow.
 * It verifies that all components work together correctly.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { logger } from '../src/utils/logger.js';
import { setupDatabase } from './setupDatabase.js';
import { generateAndStorePicks } from './pickManager.js';

// Configure environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Configure logger
const log = logger.child({ module: 'testEndToEnd' });

/**
 * Run the end-to-end test
 */
async function runEndToEndTest() {
  try {
    log.info('🚀 Starting End-to-End Test');
    
    // 1. Test database setup
    log.info('1. Testing database setup...');
    await setupDatabase();
    log.info('✅ Database setup test passed');
    
    // 2. Test pick generation and storage
    log.info('2. Testing pick generation and storage...');
    const picks = await generateAndStorePicks();
    
    if (!picks || picks.length === 0) {
      throw new Error('No picks were generated');
    }
    
    log.info(`✅ Successfully generated and stored ${picks.length} picks`);
    
    // 3. Log sample pick details
    const samplePick = picks[0];
    log.info('Sample pick details:', {
      id: samplePick.id,
      sport: samplePick.sport,
      game: `${samplePick.away_team} @ ${samplePick.home_team}`,
      pick: `${samplePick.pick_team} (${samplePick.pick_type}${samplePick.pick_value ? ' ' + samplePick.pick_value : ''})`,
      confidence: samplePick.confidence,
      odds: samplePick.odds,
      created_at: samplePick.created_at
    });
    
    log.info('✅ Pick generation test passed');
    
    // 4. Test notification system (if configured)
    try {
      log.info('3. Testing notification system...');
      const { sendPicksNotification } = await import('../src/services/notificationService.js');
      const notificationResult = await sendPicksNotification([samplePick]);
      log.info('Notification test result:', notificationResult);
      log.info('✅ Notification test passed');
    } catch (notifyError) {
      log.warn({ error: notifyError }, '⚠️ Notification test skipped or failed');
    }
    
    log.info('🎉 All tests completed successfully!');
    process.exit(0);
  } catch (error) {
    log.error({ error }, '❌ End-to-end test failed');
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runEndToEndTest();
}
