import { supabase } from '../supabaseClient.js';
import logger from '../utils/logger.js';

const log = logger.child({ module: 'notificationService' });

/**
 * Send notifications for new picks
 * @param {Array} picks - Array of pick objects
 * @returns {Promise<Object>} Result of the notification process
 */
export async function sendPicksNotification(picks) {
  try {
    if (!picks || picks.length === 0) {
      log.warn('No picks provided for notification');
      return { success: false, message: 'No picks provided' };
    }

    log.info(`Sending notifications for ${picks.length} picks`);

    // 1. Get all users who should receive notifications
    const { data: subscribers, error: subsError } = await supabase
      .from('user_settings')
      .select('user_id, notification_preferences')
      .eq('email_notifications', true)
      .eq('active', true);

    if (subsError) {
      log.error({ error: subsError }, 'Error fetching subscribers');
      throw subsError;
    }

    if (!subscribers || subscribers.length === 0) {
      log.info('No active subscribers found for notifications');
      return { success: true, message: 'No active subscribers' };
    }

    log.info(`Found ${subscribers.length} subscribers to notify`);

    // 2. Format the picks for the notification
    const notificationContent = formatPicksForNotification(picks);

    // 3. For each subscriber, create a notification record
    const notifications = subscribers.map(sub => ({
      user_id: sub.user_id,
      type: 'new_picks',
      title: 'New Betting Picks Available!',
      content: notificationContent,
      metadata: {
        pick_ids: picks.map(p => p.id),
        sport: picks[0]?.sport || 'unknown',
        count: picks.length
      },
      read: false,
      created_at: new Date().toISOString()
    }));

    // 4. Insert the notifications in batches to avoid hitting limits
    const BATCH_SIZE = 50;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < notifications.length; i += BATCH_SIZE) {
      const batch = notifications.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('notifications')
        .insert(batch);

      if (error) {
        log.error({ error }, `Error inserting notifications batch ${i / BATCH_SIZE + 1}`);
        errorCount += batch.length;
      } else {
        successCount += batch.length;
      }
    }

    log.info(`Sent ${successCount} notifications with ${errorCount} errors`);

    // 5. Trigger any webhooks or external services
    await triggerExternalWebhooks(picks);

    return {
      success: true,
      sent: successCount,
      errors: errorCount,
      total: subscribers.length
    };
  } catch (error) {
    log.error({ error }, 'Error in sendPicksNotification');
    throw error;
  }
}

/**
 * Format picks for notification content
 * @param {Array} picks - Array of pick objects
 * @returns {string} Formatted notification content
 */
function formatPicksForNotification(picks) {
  if (!picks || picks.length === 0) return 'No picks available';

  let content = `🎯 ${picks.length} New Betting Picks Available!\n\n`;
  
  // Group picks by sport
  const picksBySport = {};
  picks.forEach(pick => {
    if (!picksBySport[pick.sport]) {
      picksBySport[pick.sport] = [];
    }
    picksBySport[pick.sport].push(pick);
  });

  // Format each sport's picks
  for (const [sport, sportPicks] of Object.entries(picksBySport)) {
    content += `🏆 ${sport.toUpperCase()}\n`;
    
    sportPicks.forEach((pick, index) => {
      const emoji = pick.confidence >= 75 ? '🔥' : pick.confidence >= 55 ? '💪' : '📊';
      const vs = `${pick.away_team} @ ${pick.home_team}`;
      const pickType = pick.pick_type === 'moneyline' 
        ? 'ML' 
        : `Spread (${pick.pick_value > 0 ? '+' : ''}${pick.pick_value})`;
      
      content += `${index + 1}. ${emoji} ${pick.pick_team} (${pickType}) - ${pick.confidence}%\n`;
      content += `   ${vs}\n\n`;
    });
  }

  content += '\nGood luck with your bets! 🍀';
  return content;
}

/**
 * Trigger external webhooks for picks
 * @param {Array} picks - Array of pick objects
 */
async function triggerExternalWebhooks(picks) {
  try {
    // Get all active webhooks
    const { data: webhooks, error } = await supabase
      .from('webhooks')
      .select('*')
      .eq('active', true)
      .eq('event_type', 'new_picks');

    if (error || !webhooks || webhooks.length === 0) {
      return;
    }

    // Trigger each webhook
    for (const webhook of webhooks) {
      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': webhook.api_key || ''
          },
          body: JSON.stringify({
            event: 'new_picks',
            timestamp: new Date().toISOString(),
            data: {
              count: picks.length,
              sport: picks[0]?.sport,
              pick_ids: picks.map(p => p.id)
            },
            // Include minimal pick data for webhook consumers
            picks: picks.map(p => ({
              id: p.id,
              sport: p.sport,
              home_team: p.home_team,
              away_team: p.away_team,
              pick_team: p.pick_team,
              pick_type: p.pick_type,
              pick_value: p.pick_value,
              confidence: p.confidence,
              created_at: p.created_at
            }))
          })
        });

        if (!response.ok) {
          log.warn(`Webhook ${webhook.id} returned status ${response.status}`);
        }
      } catch (webhookError) {
        log.error({ error: webhookError }, `Error triggering webhook ${webhook.id}`);
      }
    }
  } catch (error) {
    log.error({ error }, 'Error in triggerExternalWebhooks');
    // Don't throw - webhook failures shouldn't fail the whole process
  }
}

export default {
  sendPicksNotification,
  triggerExternalWebhooks
};
