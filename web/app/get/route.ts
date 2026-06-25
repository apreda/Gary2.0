import { NextResponse, after } from 'next/server';
import { restInsert } from '@/lib/gary/supabase';

// Short, brandable App Store link for the X bio. X's profile website field caps at 100 chars, and the full
// App Store URL with the Custom Product Page id (ppid) + Apple campaign tag (ct) is too long to paste there.
// betwithgary.ai/get is short, looks better than a raw store URL, and carries ppid + ct through to Apple.
// 302 (temporary) so the destination can change without cache lock-in.
const APP_STORE_URL =
  'https://apps.apple.com/us/app/gary-ai/id6751238914?ppid=3c207d81-dc0d-4cc3-a50d-b5f47e29b18f&ct=x_bio';

// Tag each logged click with the same Apple campaign token this link carries, so the click log lines up 1:1
// with App Store Connect's campaign attribution. Derived from the URL so the two can never drift apart.
const CT = new URL(APP_STORE_URL).searchParams.get('ct') ?? 'x_bio';

export function GET(request: Request) {
  // Snapshot the request bits we want before responding, then log AFTER the redirect is sent. after() keeps the
  // serverless instance alive to finish the write without blocking the 302, and still runs through a redirect.
  // This is the real-time click signal (download intent) that Apple's delayed, thresholded install data can't show.
  const user_agent = request.headers.get('user-agent');
  const referer = request.headers.get('referer');
  after(async () => {
    try {
      await restInsert('link_clicks', { ct: CT, user_agent, referer });
    } catch {
      // Click logging is best-effort and must never affect the redirect.
    }
  });
  return NextResponse.redirect(APP_STORE_URL, 302);
}
