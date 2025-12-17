/**
 * Direct FCM API Test - bypasses firebase-admin to debug auth issues
 * 
 * Supports two modes:
 * 1. Environment variables: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL
 * 2. Local file fallback: firebase-service-account.json (for development only, never commit!)
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GoogleAuth } from 'google-auth-library';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccountPath = join(__dirname, '../firebase-service-account.json');

function getServiceAccount() {
  // Prefer environment variables (production/CI)
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    console.log('Using Firebase credentials from environment variables');
    return {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
    };
  }
  
  // Fallback to local file (development only)
  if (existsSync(serviceAccountPath)) {
    console.log('Using Firebase credentials from local file (dev mode)');
    return JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
  }
  
  throw new Error(
    'Firebase credentials not found. Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL ' +
    'environment variables, or create firebase-service-account.json for local development.'
  );
}

async function main() {
  try {
    const serviceAccount = getServiceAccount();
    
    console.log('Project ID:', serviceAccount.project_id);
    console.log('Client email:', serviceAccount.client_email);
    console.log('');
    
    // Create auth client
    const auth = new GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging']
    });
    
    // Get access token
    console.log('Getting access token...');
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    
    if (!accessToken.token) {
      throw new Error('Failed to get access token');
    }
    
    console.log('✅ Got access token:', accessToken.token.substring(0, 50) + '...');
    console.log('');
    
    // Send FCM message directly via HTTP
    // Usage:
    //   node scripts/test-push-direct.js "<FCM_TOKEN>"
    const fcmToken =
      process.argv[2] ||
      'cSGXTJBfgkMLm0WFjWsUNd:APA91bHGN6CwxTk-sXN3ZV4oqLTwzJSjccBjaH69KGtDdWqMjSKmVjJRPmj51vobTlGReZBFIGw-i7Qp4uzqDScHqhFRMAOmdTLEQhZQT2bxDqWOCFocIvE';
    
    const message = {
      message: {
        token: fcmToken,
        notification: {
          title: 'Gary AI Test',
          body: 'Push notifications are working! 🎉'
        }
      }
    };
    
    console.log('Sending FCM message...');
    
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
      }
    );
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Successfully sent message!');
      console.log('Response:', JSON.stringify(result, null, 2));
    } else {
      console.log('❌ Failed to send message');
      console.log('Status:', response.status);
      console.log('Error:', JSON.stringify(result, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

main();
