import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/components/EmailSignup', () => ({ EmailSignup: () => createElement('form', { 'data-testid': 'email-form' }) }));

import { Footer } from '@/components/Footer';

const EMAIL_ENV = ['RESEND_API_KEY', 'EMAIL_TOKEN_SECRET', 'COMPANY_POSTAL_ADDRESS', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

afterEach(() => vi.unstubAllEnvs());

describe('footer email signup disclosure', () => {
  it('hides the disclosure when the email runtime cannot render a form', () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('EMAIL_TOKEN_SECRET', '');
    vi.stubEnv('COMPANY_POSTAL_ADDRESS', '');
    const html = renderToStaticMarkup(createElement(Footer));
    expect(html).not.toContain('Get Gary’s Email Updates');
    expect(html).not.toContain('email-form');
  });

  it('shows the disclosure with the form when every email dependency is configured', () => {
    for (const key of EMAIL_ENV) vi.stubEnv(key, key === 'NEXT_PUBLIC_SUPABASE_URL' ? 'https://test.supabase.co' : 'configured');
    const html = renderToStaticMarkup(createElement(Footer));
    expect(html).toContain('Get Gary’s Email Updates');
    expect(html).toContain('email-form');
  });
});
