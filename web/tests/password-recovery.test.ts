import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, type FormEvent, type ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  useState: vi.fn(), setBusy: vi.fn(), setSent: vi.fn(), setError: vi.fn(),
  reset: vi.fn(), exchange: vi.fn(), update: vi.fn(), replace: vi.fn(), refresh: vi.fn(),
  announceSession: vi.fn(),
}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(), useState: mocks.useState,
}));
vi.mock('@/lib/auth/client', () => ({
  supabaseBrowser: () => ({ auth: { resetPasswordForEmail: mocks.reset, updateUser: mocks.update } }),
}));
vi.mock('@/lib/auth/server', () => ({
  supabaseServer: async () => ({ auth: { exchangeCodeForSession: mocks.exchange } }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock('@/lib/auth/session-hint', () => ({ announceSessionHintChanged: mocks.announceSession }));

import { ResetPasswordForm } from '@/app/account/reset/ResetPasswordForm';
import { UpdatePasswordForm } from '@/app/account/update-password/UpdatePasswordForm';
import { GET } from '@/app/auth/callback/route';

const origin = 'https://www.betwithgary.ai';
const event = { preventDefault: vi.fn() } as unknown as FormEvent;

function submitHandler(node: ReactNode) {
  let submit: ((event: FormEvent) => Promise<void>) | undefined;
  const walk = (children: ReactNode) => Children.forEach(children, child => {
    if (!isValidElement<{ children?: ReactNode; onSubmit?: typeof submit }>(child)) return;
    if (child.type === 'form') submit = child.props.onSubmit;
    walk(child.props.children);
  });
  walk(node);
  expect(submit).toBeDefined();
  return submit!;
}

function resetForm() {
  mocks.useState.mockReturnValueOnce(['fixture@example.invalid', vi.fn()])
    .mockReturnValueOnce([false, mocks.setBusy])
    .mockReturnValueOnce([false, mocks.setSent])
    .mockReturnValueOnce([null, mocks.setError]);
  return ResetPasswordForm({ nextPath: '/account', expired: false });
}

function updateForm(confirmation = 'fixture-password') {
  mocks.useState.mockReturnValueOnce(['fixture-password', vi.fn()])
    .mockReturnValueOnce([confirmation, vi.fn()])
    .mockReturnValueOnce([false, mocks.setBusy])
    .mockReturnValueOnce([null, mocks.setError]);
  return UpdatePasswordForm({ nextPath: '/account' });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('window', { location: { origin } });
  mocks.reset.mockResolvedValue({ error: null });
  mocks.exchange.mockResolvedValue({ data: { user: null }, error: null });
  mocks.update.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllGlobals());

describe('browser password recovery used by the native app', () => {
  it('requests an explicit recovery callback and sends its exchanged session to the password form', async () => {
    await submitHandler(resetForm())(event);
    expect(mocks.reset).toHaveBeenCalledOnce();
    const [email, options] = mocks.reset.mock.calls[0];
    expect(email).toBe('fixture@example.invalid');
    const callback = new URL(options.redirectTo);
    expect(callback.origin).toBe(origin);
    expect(callback.pathname).toBe('/auth/callback');
    expect(callback.searchParams.get('flow')).toBe('recovery');
    const update = new URL(callback.searchParams.get('next')!, origin);
    expect(update.pathname).toBe('/account/update-password');
    expect(update.searchParams.get('next')).toBe('/account');
    callback.searchParams.set('code', 'fixture-auth-code');
    const response = await GET(new Request(callback));
    expect(mocks.exchange).toHaveBeenCalledExactlyOnceWith('fixture-auth-code');
    expect(response.headers.get('location')).toBe(update.toString());
    expect(mocks.setSent).toHaveBeenCalledExactlyOnceWith(true);
    expect(mocks.setBusy).toHaveBeenLastCalledWith(false);
  });

  it('keeps failed reset requests retryable without claiming the email was sent', async () => {
    mocks.reset.mockResolvedValue({ error: { message: 'Rate limited' } });
    await submitHandler(resetForm())(event);
    expect(mocks.setSent).not.toHaveBeenCalled();
    expect(mocks.setError).toHaveBeenLastCalledWith(expect.stringContaining('could not be sent'));
    expect(mocks.setBusy).toHaveBeenLastCalledWith(false);
  });

  it.each([false, true])('returns missing or expired recovery codes to a fresh reset request (code present: %s)', async present => {
    mocks.exchange.mockResolvedValue({ data: { user: null }, error: { message: 'Expired code' } });
    const callback = new URL('/auth/callback', origin);
    callback.searchParams.set('flow', 'recovery');
    callback.searchParams.set('next', '/account/update-password?next=%2Faccount');
    if (present) callback.searchParams.set('code', 'expired-fixture-code');
    const response = await GET(new Request(callback));
    const retry = new URL(response.headers.get('location')!);
    expect(retry.origin).toBe(origin);
    expect(retry.pathname).toBe('/account/reset');
    expect(retry.searchParams.get('error')).toBe('expired');
    expect(retry.searchParams.get('next')).toBe('/account');
    expect(mocks.exchange).toHaveBeenCalledTimes(present ? 1 : 0);
  });

  it('updates only after password confirmation and returns to the account success state', async () => {
    await submitHandler(updateForm())(event);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ password: 'fixture-password' });
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/account?password=updated');
    expect(mocks.announceSession).toHaveBeenCalledOnce();
  });

  it('does not change a password when confirmation differs or the service rejects the update', async () => {
    await submitHandler(updateForm('different-fixture'))(event);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.setError).toHaveBeenLastCalledWith('Passwords do not match.');
    mocks.update.mockResolvedValue({ error: { message: 'Session expired' } });
    await submitHandler(updateForm())(event);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.setError).toHaveBeenLastCalledWith('Session expired');
    expect(mocks.setBusy).toHaveBeenLastCalledWith(false);
  });
});
