import { isChunkLike, parseCookieHeader, serializeCookieHeader, stringFromBase64URL, type CookieMethodsBrowser } from '@supabase/ssr';

/** Default SSR document-cookie storage with a page-lifetime deletion write fence. */
export function createDeletionAwareCookieStore(storageKey: string) {
  const retiredOwners = new Set<string>();
  const sessionOwner = (chunks: { name: string; value: string }[]): string | null => {
    const base = chunks.find(cookie => cookie.name === storageKey);
    let value = base?.value ?? '';
    let complete = base ? chunks.length === 1 : chunks.length > 0;
    if (!base) {
      for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks.find(cookie => cookie.name === `${storageKey}.${index}`);
        if (!chunk) { complete = false; break; }
        value += chunk.value;
      }
    }
    try {
      const session = complete && JSON.parse(value.startsWith('base64-') ? stringFromBase64URL(value.slice(7)) : value);
      return typeof session?.user?.id === 'string' ? session.user.id : null;
    } catch { return null; }
  };
  const cookies: CookieMethodsBrowser = {
    getAll: () => parseCookieHeader(document.cookie),
    setAll: updates => {
      const sessionUpdates = updates.filter(cookie => isChunkLike(cookie.name, storageKey));
      const positive = sessionUpdates.filter(cookie => cookie.value !== '' && cookie.options.maxAge !== 0);
      let rejectSession = false;
      if (retiredOwners.size && positive.length) {
        // SSR supplies the complete new session value in a base cookie or a
        // contiguous chunk batch. Decode synchronously before any cookie writes.
        const owner = sessionOwner(positive);
        rejectSession = owner === null || retiredOwners.has(owner);
      } else if (retiredOwners.size && sessionUpdates.length) {
        // A failed retired-owner refresh may emit an ownerless removal batch
        // after B signs in. Preserve B (or an uncertain replacement) in this
        // document. Normal explicit Sign out is a server action, outside this
        // browser adapter; deleting B explicitly also retires B before cleanup.
        const current = parseCookieHeader(document.cookie).filter(cookie => isChunkLike(cookie.name, storageKey));
        const owner = sessionOwner(current);
        rejectSession = current.length > 0 && (owner === null || !retiredOwners.has(owner));
      }
      for (const { name, value, options } of updates) {
        // Also skip this batch's removals: a late A write must not erase B's
        // differently chunked cookies before its new A value is discarded.
        if (rejectSession && isChunkLike(name, storageKey)) continue;
        document.cookie = serializeCookieHeader(name, value, options);
      }
    },
  };
  return { cookies, retireOwner: (ownerId: string) => { retiredOwners.add(ownerId); } };
}
