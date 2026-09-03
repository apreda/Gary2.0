import { NextResponse, after } from 'next/server';
import { campaignToken, xBioAppStoreUrl } from '@/lib/gary/app-store';
import { linkAttributionFromRequest } from '@/lib/gary/link-attribution';
import { storeWebLinkClick } from '@/lib/gary/growth-ingest';
import { requestRateFingerprint } from '@/lib/gary/request-fingerprint';

// Short, brandable App Store link for the X bio. X's profile website field caps at 100 chars, and the full
// App Store URL with the Custom Product Page id (ppid) + Apple campaign tag (ct) is too long to paste there.
// betwithgary.ai/get is short, looks better than a raw store URL, and carries ppid + ct through to Apple.
// 302 (temporary) so the destination can change without cache lock-in.
export function GET(request: Request) {
  const destination = xBioAppStoreUrl();
  const ct = campaignToken(new URL(destination).searchParams.get('ct'));
  const click = linkAttributionFromRequest(request, 'x_bio', ct);
  // Snapshot the request bits we want before responding, then log AFTER the redirect is sent. after() keeps the
  // serverless instance alive to finish the write without blocking the 302, and still runs through a redirect.
  // This is the real-time click signal (download intent) that Apple's delayed, thresholded install data can't show.
  after(async () => {
    try {
      await storeWebLinkClick(click, requestRateFingerprint(request));
    } catch (error) {
      console.warn('[growth] App Store handoff logging failed', {
        route: '/get',
        message: error instanceof Error ? error.message : 'unknown error',
      });
    }
  });
  const redirect = NextResponse.redirect(destination, 302);
  redirect.headers.set('Cache-Control', 'private, no-store, max-age=0');
  redirect.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return redirect;
}

export function HEAD() {
  const redirect = NextResponse.redirect(xBioAppStoreUrl(), 302);
  redirect.headers.set('Cache-Control', 'private, no-store, max-age=0');
  redirect.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return redirect;
}
