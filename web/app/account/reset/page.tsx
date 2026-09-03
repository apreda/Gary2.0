import type { Metadata } from 'next';
import { PageMasthead } from '@/components/Terminal';
import { safeNextPath } from '@/lib/auth/redirect';
import { pageMetadata } from '@/lib/seo/metadata';
import { ResetPasswordForm } from './ResetPasswordForm';

export const metadata: Metadata = pageMetadata({
  canonical: '/account/reset',
  title: 'Reset Password | Gary AI',
  description: 'Request a secure password-reset link for your Gary account.',
  robots: { index: false },
});

type SearchParams = Promise<{
  next?: string | string[];
  error?: string | string[];
}>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const nextPath = safeNextPath(first(query.next));

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <PageMasthead
        title="Reset your password"
        sub="Enter your account email and Gary will send a secure link to choose a new password."
      />
      <ResetPasswordForm nextPath={nextPath} expired={first(query.error) === 'expired'} />
    </main>
  );
}
