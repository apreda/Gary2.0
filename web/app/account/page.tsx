import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { PageMasthead } from '@/components/Terminal';
import { supabaseServer, currentUser } from '@/lib/auth/server';
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

export default async function AccountPage() {
  const user = await currentUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-12">
        <PageMasthead
          title="Sign in"
          sub="One account for the app and the web — your picks, your book, your record."
        />
        {/* useSearchParams inside the form wants a boundary when prerendering */}
        <Suspense>
          <SignInForm />
        </Suspense>
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
      </div>
    </main>
  );
}
