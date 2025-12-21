/**
 * Scheduled Push Notification Script
 * Fetches active tokens and sends a push notification
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccountPath = join(__dirname, '../firebase-service-account.json');

function getServiceAccount() {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    return {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
    };
  }
  
  if (existsSync(serviceAccountPath)) {
    return JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
  }
  
  throw new Error('Firebase credentials not found');
}

async function fetchActiveTokens() {
  const supabaseUrl = 'https://xuttubsfgdcjfgmskcol.supabase.co';
  const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dHR1YnNmZ2RjamZnbXNrY29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4OTY4MDQsImV4cCI6MjA1OTQ3MjgwNH0.wppXQAUHQXoD0z5wbjy93_0KYMREPufl_BCtb4Ugd40';
  
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
          alert: { title, body },
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
