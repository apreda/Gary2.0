#!/usr/bin/env node

/**
 * Database Setup Script
 * 
 * This script sets up the required database tables for the pick generation system.
 * It should be run during initial setup and after database schema changes.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { logger } from '../src/utils/logger.js';

// Configure environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Configure logger
const log = logger.child({ module: 'setupDatabase' });

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  log.error('Missing required environment variables: SUPABASE_URL and SUPABASE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * SQL statements for table creation
 */
const SQL_STATEMENTS = {
  picks: `
    CREATE TABLE IF NOT EXISTS picks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      sport TEXT NOT NULL,
      league TEXT NOT NULL,
      game_date TIMESTAMPTZ NOT NULL,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      pick_type TEXT NOT NULL CHECK (pick_type IN ('moneyline', 'spread')),
      pick_team TEXT NOT NULL,
      pick_value NUMERIC,
      confidence INTEGER NOT NULL CHECK (confidence BETWEEN 1 AND 100),
      odds INTEGER NOT NULL,
      analysis TEXT NOT NULL,
      key_metrics JSONB,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'win', 'loss', 'push', 'no_contest')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata JSONB
    );
    
    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_picks_sport ON picks(sport);
    CREATE INDEX IF NOT EXISTS idx_picks_game_date ON picks(game_date);
    CREATE INDEX IF NOT EXISTS idx_picks_status ON picks(status);
  `,
  
  user_settings: `
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email_notifications BOOLEAN NOT NULL DEFAULT true,
      push_notifications BOOLEAN NOT NULL DEFAULT true,
      notification_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata JSONB
    );
  `,
  
  notifications: `
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      read BOOLEAN NOT NULL DEFAULT false,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read_at TIMESTAMPTZ
    );
    
    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
  `,
  
  webhooks: `
    CREATE TABLE IF NOT EXISTS webhooks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      event_type TEXT NOT NULL,
      api_key TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata JSONB,
      CONSTRAINT webhooks_url_event_type_key UNIQUE (url, event_type)
    );
    
    -- Index for active webhooks
    CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(active) WHERE active = true;
  `
};

/**
 * Create the UUID extension if it doesn't exist
 */
async function createUuidExtension() {
  try {
    const { data, error } = await supabase.rpc('create_extension', {
      extension_name: 'uuid-ossp'
    });
    
    if (error && !error.message.includes('already exists')) {
      throw error;
    }
    
    log.info('UUID extension is ready');
    return true;
  } catch (error) {
    log.error({ error }, 'Error creating UUID extension');
    throw error;
  }
}

/**
 * Create a database table
 * @param {string} name - Table name
 * @param {string} sql - SQL statement for table creation
 */
async function createTable(name, sql) {
  try {
    log.info(`Creating ${name} table...`);
    const { error } = await supabase.rpc('exec_sql', { query: sql });
    
    if (error) {
      // Check if the error is because the table already exists
      if (error.message.includes('already exists')) {
        log.warn(`${name} table already exists`);
        return false;
      }
      throw error;
    }
    
    log.info(`Created ${name} table`);
    return true;
  } catch (error) {
    log.error({ error }, `Error creating ${name} table`);
    throw error;
  }
}

/**
 * Main function to set up the database
 */
async function setupDatabase() {
  try {
    log.info('Starting database setup...');
    
    // 1. Create UUID extension if it doesn't exist
    await createUuidExtension();
    
    // 2. Create tables
    for (const [tableName, sql] of Object.entries(SQL_STATEMENTS)) {
      await createTable(tableName, sql);
    }
    
    log.info('✅ Database setup completed successfully');
    process.exit(0);
  } catch (error) {
    log.error({ error }, '❌ Database setup failed');
    process.exit(1);
  }
}

// Run the setup if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  setupDatabase();
}

export {
  setupDatabase
};
