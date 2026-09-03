import { isAuthorizedCron } from '@/lib/email/cron';
import { runWeeklyRecordCampaign } from '@/lib/email/send';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const summary = await runWeeklyRecordCampaign();
    console.info(JSON.stringify({ event: 'email_campaign_complete', ...summary }));
    return Response.json(summary, { status: summary.failed > 0 ? 503 : 200 });
  } catch (error) {
    console.error(JSON.stringify({ event: 'email_campaign_failed', kind: 'weekly_record', code: error instanceof Error ? error.name : 'unknown' }));
    return Response.json({ error: 'campaign_failed' }, { status: 500 });
  }
}
