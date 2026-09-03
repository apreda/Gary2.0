const LOCAL_ORIGIN = 'https://gary.local';

/**
 * Accept only an internal path for post-auth navigation.
 *
 * The value comes from the URL, so absolute URLs, protocol-relative URLs,
 * backslash variants, and malformed encodings must all fall back locally.
 */
export function safeNextPath(
  value: string | null | undefined,
  fallback = '/account',
): string {
  const candidate = value?.trim();
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) {
    return fallback;
  }

  try {
    const target = new URL(candidate, LOCAL_ORIGIN);
    const decodedPath = decodeURIComponent(target.pathname);
    if (
      target.origin !== LOCAL_ORIGIN ||
      candidate.includes('\\') ||
      decodedPath.startsWith('//') ||
      decodedPath.includes('\\')
    ) {
      return fallback;
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

export type AccountMode = 'signin' | 'signup';

/** Build one encoded, local-only account URL for every conversion surface. */
export function accountHref(
  nextPath: string,
  mode: AccountMode = 'signin',
): string {
  const params = new URLSearchParams();
  params.set('next', safeNextPath(nextPath, '/'));
  if (mode === 'signup') params.set('mode', 'signup');
  return `/account?${params.toString()}`;
}

/** Keep the page a visitor meant to return to through password recovery. */
export function resetPasswordHref(nextPath: string): string {
  const params = new URLSearchParams();
  params.set('next', safeNextPath(nextPath, '/account'));
  return `/account/reset?${params.toString()}`;
}
