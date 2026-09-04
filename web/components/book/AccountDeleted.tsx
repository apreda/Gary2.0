import { APPLE_SIGN_IN_REMOVAL_HELP } from '@/lib/auth/deletion-result';

export function AccountDeleted({ applePermissionRemains }: { applePermissionRemains: boolean }) {
  return (
    <div role="status" className="mb-5 rounded-chip border border-gold/35 p-4 text-[13px] leading-relaxed text-gold">
      <p>Your Gary account and data have been deleted. Any active paid subscriptions have been canceled.</p>
      {applePermissionRemains && (
        <p className="mt-3 text-mid">
          Apple&apos;s separate sign-in permission may still remain. On your iPhone, open Settings → your name →
          Sign in with Apple → Gary → Stop Using Sign in with Apple. Your Gary deletion is already complete.{' '}
          <a href={APPLE_SIGN_IN_REMOVAL_HELP} className="text-gold underline underline-offset-2">Apple&apos;s instructions</a>
        </p>
      )}
    </div>
  );
}
