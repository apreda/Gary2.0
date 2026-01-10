/**
 * Scheduled Push Notification Script
 * Fetches active tokens and sends a push notification
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

function getServiceAccount() {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    return {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
    };
  }
  
  throw new Error('Firebase credentials not found in environment variables (FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL)');
}

async function fetchActiveTokens() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase configuration missing (SUPABASE_URL, SUPABASE_ANON_KEY)');
  }
  
  const url = `${supabaseUrl}/rest/v1/push_tokens?select=device_token&active=eq.true&order=created_at.desc`;
  const response = await fetch(url, {
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`
    }
  });
  
  const data = await response.json();
  return data.map(t => t.device_token);
}

async function sendPush(title, body, tokens) {
  const serviceAccount = getServiceAccount();
  
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
  }
  
  const message = {
    notification: { title, body },
    apns: {
      payload: {
        aps: {
          sound: 'default',
        },
      },
    },
  };
  
  const batchSize = 500;
  let successCount = 0;
  let failureCount = 0;
  
  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    const resp = await admin.messaging().sendEachForMulticast({ ...message, tokens: batch });
    successCount += resp.successCount;
    failureCount += resp.failureCount;
  }
  
  console.log(`✅ Sent: ${successCount} success, ${failureCount} failed`);
}

async function main() {
  const title = process.argv[2] || 'Fresh Picks are in!';
  const body = process.argv[3] || '';
  
  if (!body) {
    console.error('Usage: node scripts/send-scheduled-push.js "Title" "Body"');
    process.exit(1);
  }
  
  console.log(`Sending: "${title}"`);
  console.log(`Body: "${body}"`);
  console.log('');
  
  const tokens = await fetchActiveTokens();
  console.log(`Found ${tokens.length} active tokens`);
  
  await sendPush(title, body, tokens);
}

main().catch(console.error);
