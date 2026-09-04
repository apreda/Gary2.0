import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { deletionSuccessHref, APPLE_SIGN_IN_REMOVAL_HELP } from '@/lib/auth/deletion-result';
import { AccountDeleted } from '@/components/book/AccountDeleted';

describe('account deletion Apple permission follow-up', () => {
  it('carries a boolean after successful deletion and ignores response-supplied URLs and account IDs', () => {
    expect(deletionSuccessHref({ ok: true, apple_revocation_required: true, apple_revocation_url: 'https://malicious.test', deleted: 'private-id' })).toBe('/account?deleted=1&apple_permission=1');
    expect(deletionSuccessHref({ ok: true, apple_revocation_required: false })).toBe('/account?deleted=1');
    expect(deletionSuccessHref({ ok: false, apple_revocation_required: true })).not.toContain('apple_permission');
    expect(deletionSuccessHref(null)).not.toContain('apple_permission');
  });
  it('shows completed deletion and the trusted Apple instructions only when needed', () => {
    const html = renderToStaticMarkup(createElement(AccountDeleted, { applePermissionRemains: true }));
    expect(html).toContain('deletion is already complete'); expect(html).toContain(APPLE_SIGN_IN_REMOVAL_HELP);
    expect(html).toContain('Stop Using Sign in with Apple'); expect(html).toContain('role="status"');
    const standard = renderToStaticMarkup(createElement(AccountDeleted, { applePermissionRemains: false }));
    expect(standard).toContain('have been deleted'); expect(standard).not.toContain(APPLE_SIGN_IN_REMOVAL_HELP);
  });
});
