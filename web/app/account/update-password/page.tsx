import type { Metadata } from 'next';
import Link from 'next/link';
import { PageMasthead } from '@/components/Terminal';
import { currentUser } from '@/lib/auth/server';
import { resetPasswordHref, safeNextPath } from '@/lib/auth/redirect';
import { pageMetadata } from '@/lib/seo/metadata';
import { UpdatePasswordForm } from './UpdatePasswordForm';

export const metadata: Metadata = pageMetadata({
  canonical: '/account/update-password',
  title: 'Choose a New Password | Gary AI',
  description: 'Choose a new password for your Gary account.',
  robots: { index: false },
});

type SearchParams = Promise<{ next?: string | string[] }>;

export const dynamic = 'force-dynamic';

export default async function UpdatePasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const [user, query] = await Promise.all([currentUser(), searchParams]);
  const rawNext = Array.isArray(query.next) ? query.next[0] : query.next;
  const nextPath = safeNextPath(rawNext);

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <PageMasthead
        title="Choose a new password"
        sub="Use a password you do not use on another site."
      />
      {user ? (
        <UpdatePasswordForm nextPath={nextPath} />
      ) : (
        <div className="mt-7 max-w-md rounded-panel border border-line bg-card px-7 py-7">
          <p className="text-[14px] leading-relaxed text-mid">
            This password link is invalid or has expired. Request a fresh link to continue.
          </p>
          <Link
            href={resetPasswordHref(nextPath)}
            className="mt-5 inline-flex rounded-chip bg-gold px-4 py-2.5 text-[13.5px] font-semibold text-ink transition-opacity hover:opacity-90"
          >
            Request another link
          </Link>
        </div>
      )}
    </main>
  );
}
