/** Carry only a boolean outcome across sign-out; never server-provided URLs or IDs. */
export function deletionSuccessHref(result: unknown): string {
  const data = result as { ok?: unknown; apple_revocation_required?: unknown } | null;
  return data?.ok === true && data.apple_revocation_required === true
    ? '/account?deleted=1&apple_permission=1'
    : '/account?deleted=1';
}

export const APPLE_SIGN_IN_REMOVAL_HELP = 'https://support.apple.com/en-us/102571';
