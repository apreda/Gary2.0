'use client';

import { retireBrowserSessionOwner, supabaseBrowser } from './client';
import { bookAuthorization } from '@/lib/book/api';
import { clearAuthCookiesAtScopes, combineChunks, isChunkLike, parseCookieHeader, serializeCookieHeader, stringFromBase64URL } from '@supabase/ssr';

/** Keep the checked account's token even if the SDK's later lookup changes. */
export async function requestAccountDeletion(ownerId: string, isCurrent: () => boolean) {
  const authorization = await bookAuthorization(ownerId);
  if (!isCurrent()) throw new Error('Your account changed. Refresh this page before deleting an account.');
  return supabaseBrowser().functions.invoke('delete-account', {
    body: {}, headers: { Authorization: authorization },
  });
}

/** Call immediately before local preference cleanup/navigation, without awaiting. */
export function canFinishAccountDeletion(isCurrent: () => boolean): boolean {
  if (!isCurrent()) return false;
  const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  // SDK sign-in writes its cookie before announcing the identity change. Check
  // storage as well as the event-driven action guard at the final synchronous step.
  return !parseCookieHeader(document.cookie).some(cookie => isChunkLike(cookie.name, `sb-${project}-auth-token`));
}

/**
 * The edge handler already revokes the deleted owner's refresh sessions.
 * SDK signOut would asynchronously choose the browser's then-current user.
 * Clear only this owner's exact cookie snapshot instead, and let the caller
 * immediately navigate to a fresh signed-out page. Uses public SSR helpers
 * and the same default storage key/scope as createBrowserClient in client.ts.
 */
export async function clearDeletedAccountSession(ownerId: string, isCurrent: () => boolean): Promise<boolean> {
  if (!isCurrent()) return false;
  // The caller has verified the edge response for this owner. Fence pending
  // writes until page navigation, including refreshes that outlive this helper.
  retireBrowserSessionOwner(ownerId);
  const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  const storageKey = `sb-${project}-auth-token`;
  const sessionCookies = () => parseCookieHeader(document.cookie).filter(cookie => isChunkLike(cookie.name, storageKey));
  const fingerprint = (cookies: ReturnType<typeof sessionCookies>) => JSON.stringify([...cookies].sort((a,b) => a.name.localeCompare(b.name)));

  // A same-owner refresh may replace the cookie while its chunks are decoded.
  // Re-read at most once; another owner, uncertainty or continued churn stops.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!isCurrent()) return false;
    const cookies = sessionCookies();
    if (!cookies.length) return isCurrent();
    const base = cookies.some(cookie => cookie.name === storageKey);
    if (base && cookies.length !== 1) return false;
    if (!base && cookies.some((_, index) => !cookies.some(cookie => cookie.name === `${storageKey}.${index}`))) return false;
    const snapshot = fingerprint(cookies);
    const combined = await combineChunks(storageKey, name => cookies.find(cookie => cookie.name === name)?.value);
    if (!isCurrent()) return false;
    let session: { user?: { id?: unknown } };
    try { session = JSON.parse(combined?.startsWith('base64-') ? stringFromBase64URL(combined.slice(7)) : combined ?? 'null'); }
    catch { return false; }
    if (session?.user?.id !== ownerId) return false;
    let cleared = false;
    await clearAuthCookiesAtScopes({
      storageKey, scopes: [{}], getAll: () => cookies,
      setAll: cookiesToSet => {
        // No await between the final ownership/snapshot check and the writes.
        // A replacement session can never be selected by a later SDK lookup.
        if (!isCurrent() || fingerprint(sessionCookies()) !== snapshot) return;
        for (const { name, value, options } of cookiesToSet) {
          document.cookie = serializeCookieHeader(name, value, options);
        }
        cleared = sessionCookies().length === 0;
      },
    });
    // The SDK can finish a refresh between setAll and this await resuming.
    // Re-read here before reporting success; a same-owner write gets one retry.
    if (cleared && sessionCookies().length === 0) return isCurrent();
  }
  return false;
}
