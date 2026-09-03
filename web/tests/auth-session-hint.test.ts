import { describe, expect, it } from 'vitest';
import { hasSupabaseSessionHint } from '@/lib/auth/session-hint';

describe('Supabase session presentation hint', () => {
  it('recognizes whole and chunked SSR auth-cookie names', () => {
    expect(hasSupabaseSessionHint('theme=dark; sb-project-auth-token=encoded')).toBe(true);
    expect(hasSupabaseSessionHint('sb-project-auth-token.0=first; sb-project-auth-token.1=second')).toBe(true);
  });

  it('does not mistake unrelated or PKCE cookies for an authenticated session', () => {
    expect(hasSupabaseSessionHint('theme=dark; cookie_notice=1')).toBe(false);
    expect(hasSupabaseSessionHint('sb-project-auth-token-code-verifier=secret')).toBe(false);
  });
});
