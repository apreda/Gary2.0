'use client';

/**
 * Web conversion-funnel events → the SAME Supabase `log_app_event` RPC the iOS
 * app uses, so web + iOS land in one `app_events` table. The anon key is
 * already public (NEXT_PUBLIC_*) and the RPC is insert-only SECURITY DEFINER,
 * so calling it from the browser exposes nothing the site doesn't already ship.
 * Fire-and-forget with keepalive so events survive a click-through navigation.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Stable anonymous identity for the funnel (no auth on web). */
export function webIdentity(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    const key = 'gary_web_id';
    let v = localStorage.getItem(key);
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(key, v);
    }
    return v;
  } catch {
    return 'anon';
  }
}

export function logEvent(event: string, props: Record<string, unknown> = {}): void {
  if (!SUPABASE_URL || !ANON_KEY || typeof window === 'undefined') return;
  try {
    void fetch(`${SUPABASE_URL}/rest/v1/rpc/log_app_event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        p_event: event,
        p_identity: webIdentity(),
        p_platform: 'web',
        p_props: props,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never let analytics break the page */
  }
}
