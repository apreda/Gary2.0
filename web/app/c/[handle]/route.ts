import { NextResponse, after } from 'next/server';
import { restInsert } from '@/lib/gary/supabase';

// Per-creator tracked App Store link for the Tier 3 creator funnel (Engine 1/3): each paid creator gets
// betwithgary.ai/c/<handle> in their bio/caption, which 302s to the App Store with ct=cr_<handle> so both
// our click log AND App Store Connect Campaigns attribute installs to that creator. Same pattern as /get.
const PPID = '3c207d81-dc0d-4cc3-a50d-b5f47e29b18f';

export function GET(request: Request, { params }: { params: { handle: string } }) {
  // Apple ct tokens: keep it short, lowercase alphanumeric + underscore, max ~40 chars.
  const handle = String(params.handle ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32) || 'unknown';
  const ct = `cr_${handle}`;
  const dest = `https://apps.apple.com/us/app/gary-ai/id6751238914?ppid=${PPID}&ct=${ct}`;
  const user_agent = request.headers.get('user-agent');
  const referer = request.headers.get('referer');
  after(async () => {
    try {
      await restInsert('link_clicks', { ct, user_agent, referer });
    } catch {
      // best-effort logging, never block the redirect
    }
  });
  return NextResponse.redirect(dest, 302);
}
