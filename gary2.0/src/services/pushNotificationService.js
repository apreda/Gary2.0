import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';

const log = logger.child({ module: 'pushNotificationService' });

// Create admin supabase client with service role key for reading push tokens
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
  : null;

// Initialize Firebase Admin SDK
let firebaseInitialized = false;

function initializeFirebase() {
  if (firebaseInitialized) return;
  
  try {
    // Initialize with service account credentials from environment
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    };
    
    if (!serviceAccount.projectId || !serviceAccount.privateKey || !serviceAccount.clientEmail) {
      log.warn('Firebase credentials not configured - push notifications disabled');
      return;
    }
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    
    firebaseInitialized = true;
    log.info('Firebase Admin SDK initialized');
  } catch (error) {
    log.error({ error }, 'Failed to initialize Firebase Admin SDK');
  }
}

/**
 * Send push notification to all active devices
 * @param {Object} notification - Notification payload
 * @param {string} notification.title - Notification title
 * @param {string} notification.body - Notification body
 * @param {Object} notification.data - Custom data payload
 */
export async function sendPushNotification({ title, body, data = {} }) {
  initializeFirebase();
  
  if (!firebaseInitialized) {
    log.warn('Firebase not initialized - skipping push notification');
    return { success: false, reason: 'Firebase not initialized' };
  }
  
  try {
    // Get all active push tokens using admin client (bypasses RLS)
    if (!supabaseAdmin) {
      log.error('Supabase admin client not configured - missing SUPABASE_SERVICE_ROLE_KEY');
      return { success: false, reason: 'Supabase admin not configured' };
    }
    
    const { data: tokens, error } = await supabaseAdmin
      .from('push_tokens')
      .select('device_token')
      .eq('active', true);
    
    if (error) {
      log.error({ error }, 'Failed to fetch push tokens');
      return { success: false, error };
    }
    
    if (!tokens || tokens.length === 0) {
      log.info('No active push tokens found');
      return { success: true, sent: 0 };
    }
    
    log.info(`Sending push notification to ${tokens.length} devices`);
    
    // Send to all tokens
    const message = {
      notification: {
        title,
        body,
      },
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };
    
    const deviceTokens = tokens.map(t => t.device_token);
    
    // Send using multicast (up to 500 tokens at a time)
    const batchSize = 500;
    let successCount = 0;
    let failureCount = 0;
    const failedTokens = [];
    
    for (let i = 0; i < deviceTokens.length; i += batchSize) {
      const batch = deviceTokens.slice(i, i + batchSize);
      
      try {
        const response = await admin.messaging().sendEachForMulticast({
          tokens: batch,
          ...message,
        });
        
        successCount += response.successCount;
        failureCount += response.failureCount;
        
        // Track failed tokens for cleanup
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errorCode = resp.error?.code;
            const errorMessage = resp.error?.message;
            log.error({ errorCode, errorMessage, token: batch[idx].substring(0, 20) + '...' }, 'Failed to send to device');
            // Mark invalid tokens for removal
            if (errorCode === 'messaging/invalid-registration-token' ||
                errorCode === 'messaging/registration-token-not-registered') {
              failedTokens.push(batch[idx]);
            }
          }
        });
      } catch (batchError) {
        log.error({ error: batchError }, `Failed to send batch ${i / batchSize + 1}`);
        failureCount += batch.length;
      }
    }
    
    // Deactivate invalid tokens
    if (failedTokens.length > 0) {
      await deactivateTokens(failedTokens);
    }
    
    log.info(`Push notification sent: ${successCount} success, ${failureCount} failed`);
    
    return {
      success: true,
      sent: successCount,
      failed: failureCount,
      total: deviceTokens.length,
    };
  } catch (error) {
    log.error({ error }, 'Failed to send push notification');
    return { success: false, error: error.message };
  }
}

/**
 * Send push notification for new picks
 * @param {Array} picks - Array of pick objects
 */
export async function sendNewPicksNotification(picks) {
  if (!picks || picks.length === 0) return;
  
  // Group picks by sport
  const sports = [...new Set(picks.map(p => p.league || p.sport))];
  const sportsText = sports.slice(0, 3).join(', ');
  
  const title = '🎯 New Betting Picks Available!';
  const body = picks.length === 1
    ? `${picks[0].league || picks[0].sport}: ${picks[0].pick_team || picks[0].team}`
    : `${picks.length} new picks for ${sportsText}${sports.length > 3 ? '...' : ''}`;
  
  return sendPushNotification({
    title,
    body,
    data: {
      type: 'new_picks',
      pickCount: String(picks.length),
      sports: sports.join(','),
    },
  });
}

/**
 * Send push notification for pick results
 * @param {Object} results - Results summary
 */
export async function sendResultsNotification(results) {
  const { wins, losses, pushes, profit } = results;
  const total = wins + losses + pushes;
  
  if (total === 0) return;
  
  const emoji = profit > 0 ? '💰' : profit < 0 ? '📉' : '⚖️';
  const profitText = profit > 0 ? `+${profit.toFixed(2)}u` : `${profit.toFixed(2)}u`;
  
  const title = `${emoji} Today's Results: ${wins}-${losses}${pushes > 0 ? `-${pushes}` : ''}`;
  const body = `${profitText} profit. Check the Billfold for details!`;
  
  return sendPushNotification({
    title,
    body,
    data: {
      type: 'results',
      wins: String(wins),
      losses: String(losses),
      pushes: String(pushes),
      profit: String(profit),
    },
  });
}

/**
 * Deactivate invalid push tokens
 * @param {Array} tokens - Array of token strings to deactivate
 */
async function deactivateTokens(tokens) {
  try {
    const { error } = await supabase
      .from('push_tokens')
      .update({ active: false })
      .in('device_token', tokens);
    
    if (error) {
      log.error({ error }, 'Failed to deactivate invalid tokens');
    } else {
      log.info(`Deactivated ${tokens.length} invalid push tokens`);
    }
  } catch (error) {
    log.error({ error }, 'Error deactivating tokens');
  }
}

export default {
  sendPushNotification,
  sendNewPicksNotification,
  sendResultsNotification,
};
