import { accountHref, safeNextPath } from './redirect';

const LOCAL_ORIGIN = 'https://gary.local';
const KIND_PARAM = 'book_kind';
const SIDE_PARAM = 'book_side';
const KEY_PARAM = 'book_key';

export type BookIntent = {
  kind: 'game' | 'prop';
  side: 'tail' | 'fade';
  key: string;
};

export function gameIntentKey(pickId: string | null | undefined, pickText: string): string {
  return `game:${pickId?.trim() || pickText.trim()}`;
}

export function propIntentKey(player: string, propToken: string): string {
  return `prop:${player.trim().toLowerCase()}:${propToken.trim().toLowerCase()}`;
}

/** Put a pending UI choice into the local return URL. It never places a bet. */
export function withBookIntent(currentPath: string, intent: BookIntent): string {
  const target = new URL(safeNextPath(currentPath, '/picks'), LOCAL_ORIGIN);
  target.searchParams.set(KIND_PARAM, intent.kind);
  target.searchParams.set(SIDE_PARAM, intent.side);
  target.searchParams.set(KEY_PARAM, intent.key.slice(0, 300));
  return `${target.pathname}${target.search}${target.hash}`;
}

export function bookIntentAccountHref(currentPath: string, intent: BookIntent): string {
  return accountHref(withBookIntent(currentPath, intent));
}

export function readBookIntent(search: string): BookIntent | null {
  const params = new URLSearchParams(search);
  const kind = params.get(KIND_PARAM);
  const side = params.get(SIDE_PARAM);
  const key = params.get(KEY_PARAM)?.trim();
  if ((kind !== 'game' && kind !== 'prop') || (side !== 'tail' && side !== 'fade') || !key) {
    return null;
  }
  return { kind, side, key };
}

/** Remove only Gary's transient intent keys, preserving every other query/hash. */
export function clearBookIntent(path: string): string {
  const target = new URL(safeNextPath(path, '/picks'), LOCAL_ORIGIN);
  target.searchParams.delete(KIND_PARAM);
  target.searchParams.delete(SIDE_PARAM);
  target.searchParams.delete(KEY_PARAM);
  return `${target.pathname}${target.search}${target.hash}`;
}
