/**
 * Test Push Notification Script
 * Run with:
 *  - Single token:
 *      node scripts/test-push-notification.js "Title" "Body" "<FCM_TOKEN>"
 *  - Multiple tokens:
 *      node scripts/test-push-notification.js "Title" "Body" "<TOKEN1>" "<TOKEN2>" ...
 * 
 * Supports two modes:
 * 1. Environment variables: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL
 * 2. Local file fallback: firebase-service-account.json (for development only, never commit!)
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
    
    // Initialize with explicit project ID
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
    }
    
    const title = process.argv[2] || 'Gary AI';
    const body = process.argv[3] || 'Test push';
    const tokens = process.argv.slice(4).filter(Boolean);

    if (tokens.length === 0) {
      throw new Error('No FCM tokens provided. Usage: node scripts/test-push-notification.js "Title" "Body" "<TOKEN1>" "<TOKEN2>" ...');
    }

    console.log(`Sending "${title}" to ${tokens.length} token(s)`);

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
    let firstError = null;

    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      const resp = await admin.messaging().sendEachForMulticast({ ...message, tokens: batch });
      successCount += resp.successCount;
      failureCount += resp.failureCount;

      // Capture the first failure reason for quick debugging
      if (!firstError) {
        const firstFail = resp.responses.find(r => !r.success);
        if (firstFail?.error) firstError = firstFail.error;
      }
    }

    console.log(`✅ Done. Success: ${successCount}, Failed: ${failureCount}`);
    if (firstError) {
      console.log('First error:', firstError.code || '', firstError.message || '');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    if (error.errorInfo) {
      console.error('Error info:', JSON.stringify(error.errorInfo, null, 2));
    }
    
    // Check if it's a permissions issue
    if (error.message.includes('authentication credential')) {
      console.log('');
      console.log('🔧 TROUBLESHOOTING:');
      console.log('1. Go to Google Cloud Console: https://console.cloud.google.com/iam-admin/iam?project=gary-ai-7da75');
      console.log('2. Find the service account: firebase-adminsdk-fbsvc@gary-ai-7da75.iam.gserviceaccount.com');
      console.log('3. Click the pencil icon to edit');
      console.log('4. Add role: "Firebase Cloud Messaging Admin"');
      console.log('5. Click Save and try again');
    }
  }
}

main();
