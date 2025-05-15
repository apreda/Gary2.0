#!/usr/bin/env node

/**
 * Pick Manager
 * 
 * This script manages the generation, storage, and distribution of betting picks.
 * It serves as the main entry point for the pick generation pipeline.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { generateGaryPicks } from '../src/services/garyEngine.js';
import { savePicks } from '../src/services/picksService.js';
import { logger } from '../src/utils/logger.js';
import { sendPicksNotification } from '../src/services/notificationService.js';

// Configure environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Get the current file and directory names
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure logger
const log = logger.child({ module: 'pickManager' });

/**
 * Main function to generate and store picks
 */
async function generateAndStorePicks() {
  try {
    log.info('Starting pick generation process');
    
    // 1. Generate picks using Gary's AI engine
    log.info('Generating picks...');
    const picks = await generateGaryPicks();
    
    if (!picks || picks.length === 0) {
      log.warn('No picks were generated');
      return;
    }
    
    log.info(`Generated ${picks.length} picks`);
    
    // 2. Save picks to the database
    log.info('Saving picks to database...');
    const savedPicks = await savePicks(picks);
    
    if (!savedPicks || savedPicks.length === 0) {
      log.error('Failed to save any picks');
      return;
    }
    
    log.info(`Successfully saved ${savedPicks.length} picks`);
    
    // 3. Send notifications (if configured)
    try {
      await sendPicksNotification(savedPicks);
      log.info('Successfully sent pick notifications');
    } catch (notifyError) {
      log.error({ error: notifyError }, 'Failed to send pick notifications');
    }
    
    return savedPicks;
  } catch (error) {
    log.error({ error }, 'Error in generateAndStorePicks');
    throw error;
  }
}

// Run the pick generation if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateAndStorePicks()
    .then(() => {
      log.info('Pick generation completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      log.error({ error }, 'Pick generation failed');
      process.exit(1);
    });
}

export {
  generateAndStorePicks
};
