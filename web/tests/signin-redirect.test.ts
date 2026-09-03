import { describe, expect, it } from 'vitest';
import { GET, HEAD } from '@/app/signin/route';

describe('/signin compatibility redirect', () => {
  it.each([GET, HEAD])('permanently redirects to /account', handler => {
    const response = handler(new Request('https://www.betwithgary.ai/signin'));
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://www.betwithgary.ai/account');
  });

  it('preserves an existing return path', () => {
    const response = GET(new Request('https://www.betwithgary.ai/signin?next=%2Fpicks'));
    expect(response.headers.get('location')).toBe('https://www.betwithgary.ai/account?next=%2Fpicks');
  });
});
