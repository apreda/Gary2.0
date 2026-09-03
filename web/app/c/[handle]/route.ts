import { NextResponse, after } from 'next/server';
import { campaignToken, creatorAppStoreUrl, normalizeCreatorHandle } from '@/lib/gary/app-store';
import { linkAttributionFromRequest } from '@/lib/gary/link-attribution';
import { storeWebLinkClick } from '@/lib/gary/growth-ingest';
import { requestRateFingerprint } from '@/lib/gary/request-fingerprint';

// Per-creator tracked App Store link for the Tier 3 creator funnel (Engine 1/3): each paid creator gets
// betwithgary.ai/c/<handle> in their bio/caption, which 302s to the App Store with ct=cr_<handle> so both
// our click log AND App Store Connect Campaigns attribute installs to that creator. Same pattern as /get.
export async function GET(request: Request, context: { params: Promise<{ handle: string }> }) {
  const { handle: rawHandle } = await context.params;
  const destination = creatorAppStoreUrl(rawHandle);
  const ct = campaignToken(new URL(destination).searchParams.get('ct'));
  const click = linkAttributionFromRequest(request, 'creator', ct);
  after(async () => {
    try {
      await storeWebLinkClick(click, requestRateFingerprint(request));
    } catch (error) {
      console.warn('[growth] App Store handoff logging failed', {
        route: '/c/[handle]',
        message: error instanceof Error ? error.message : 'unknown error',
      });
    }
  });
  const redirect = NextResponse.redirect(destination, 302);
  redirect.headers.set('Cache-Control', 'private, no-store, max-age=0');
  redirect.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return redirect;
}

export async function HEAD(_request: Request, context: { params: Promise<{ handle: string }> }) {
  const { handle: rawHandle } = await context.params;
  const redirect = NextResponse.redirect(creatorAppStoreUrl(normalizeCreatorHandle(rawHandle)), 302);
  redirect.headers.set('Cache-Control', 'private, no-store, max-age=0');
  redirect.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return redirect;
}
