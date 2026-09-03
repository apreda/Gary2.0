import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageMasthead } from '@/components/Terminal';
import { supabaseServer, currentUser } from '@/lib/auth/server';
import { resetPasswordHref, safeNextPath } from '@/lib/auth/redirect';
import { pageMetadata } from '@/lib/seo/metadata';
import { SignInForm } from './SignInForm';

export const metadata: Metadata = pageMetadata({
  canonical: '/account',
  title: 'Account | Gary AI',
  description: 'Sign in to Gary AI — ride or fade picks and keep your book on the web.',
  robots: { index: false },
});

// Session-dependent by nature — never prerender a signed-out shell for a
// signed-in user.
export const dynamic = 'force-dynamic';

async function signOut() {
  'use server';
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect('/account');
}

type AccountSearchParams = Promise<{
  next?: string | string[];
  mode?: string | string[];
  error?: string | string[];
  password?: string | string[];
}>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function AccountPage({ searchParams }: { searchParams: AccountSearchParams }) {
  const [user, query] = await Promise.all([currentUser(), searchParams]);
  const nextPath = safeNextPath(first(query.next));
  const initialMode = first(query.mode) === 'signup' ? 'signup' : 'signin';
  const initialError = first(query.error) === 'signin'
    ? 'Sign-in couldn’t finish. Please try again.'
    : null;

  if (!user) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-12">
        <SignInForm
          initialMode={initialMode}
          nextPath={nextPath}
          initialError={initialError}
        />
      </main>
    );
  }

  const label =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    'Signed in';

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <PageMasthead title="Account" sub="Signed in — the same identity as the iOS app." />

      <div className="mt-7 max-w-md rounded-panel border border-line bg-card px-7 py-7">
        {first(query.password) === 'updated' && (
          <p role="status" className="mb-5 rounded-chip border border-gold/35 bg-chip px-4 py-3 text-[13.5px] text-gold">
            Your password has been updated.
          </p>
        )}
        <p className="font-mono text-[11px] uppercase tracking-[0.04em] text-low">Signed in as</p>
        <p className="mt-1 text-[15px] text-hi">{label}</p>

        <form action={signOut} className="mt-6">
          <button
            type="submit"
            className="rounded-chip border border-line bg-chip px-4 py-2.5 text-[13.5px] text-mid transition-colors hover:border-gold/50 hover:text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          >
            Sign out
          </button>
        </form>

        <div className="mt-5 flex flex-wrap gap-4 border-t border-line pt-5">
          <Link
            href="/today"
            className="text-[13.5px] text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
          >
            Open today&apos;s desk →
          </Link>
          <Link
            href="/you"
            className="text-[13.5px] text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
          >
            Open your book →
          </Link>
          <Link
            href={resetPasswordHref('/account')}
            className="text-[13.5px] text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
          >
            Reset password →
          </Link>
        </div>
      </div>
    </main>
  );
}
