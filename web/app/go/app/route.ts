import { after, NextResponse } from 'next/server';
import { campaignToken, normalizeAppStoreSurface, websiteAppStoreUrl } from '@/lib/gary/app-store';
import { linkAttributionFromRequest, shouldTrackStandardHandoff } from '@/lib/gary/link-attribution';
import { storeWebLinkClick } from '@/lib/gary/growth-ingest';
import { requestRateFingerprint } from '@/lib/gary/request-fingerprint';

function response(): NextResponse {
  const redirect = NextResponse.redirect(websiteAppStoreUrl(), 302);
  redirect.headers.set('Cache-Control', 'private, no-store, max-age=0');
  redirect.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return redirect;
}

export function GET(request: Request) {
  const destination = websiteAppStoreUrl();
  const requestUrl = new URL(request.url);
  const surface = normalizeAppStoreSurface(requestUrl.searchParams.get('surface'));
  const ct = campaignToken(new URL(destination).searchParams.get('ct'));
  const click = linkAttributionFromRequest(request, surface, ct);

  // Standard no-JS handoffs are unmeasured. The browser attaches both values
  // only after consent. Dedicated /get and /c campaign URLs remain aggregate
  // tracked-link endpoints by design.
  if (shouldTrackStandardHandoff(requestUrl, request.headers.get('cookie'))) {
    after(async () => {
      try {
        await storeWebLinkClick(click, requestRateFingerprint(request));
      } catch (error) {
        console.warn('[growth] App Store handoff logging failed', {
          route: '/go/app',
          message: error instanceof Error ? error.message : 'unknown error',
        });
      }
    });
  }

  const redirect = NextResponse.redirect(destination, 302);
  redirect.headers.set('Cache-Control', 'private, no-store, max-age=0');
  redirect.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return redirect;
}

/** Health checks and link-preview crawlers should not count as download intent. */
export function HEAD() {
  return response();
}
