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
