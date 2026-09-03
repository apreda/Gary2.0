import type { Metadata } from 'next';
import Link from 'next/link';
import { InstallWebsiteGuide } from '@/components/InstallWebsiteGuide';
import { PageMasthead } from '@/components/Terminal';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = pageMetadata({
  canonical: '/install',
  title: 'Add the Gary AI Website to Your Home Screen',
  description:
    'Open the Gary AI website like an app from your phone or desktop. Follow the home-screen steps for iPhone, iPad, Android, Chrome, or Edge.',
});

export default function InstallPage() {
  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-12">
      <PageMasthead
        title="Put Gary on your home screen"
        meta="INSTALL THE WEBSITE"
        sub="Keep today's picks one tap away. The shortcut opens betwithgary.ai directly and stays separate from Gary's native iOS app."
      />

      <InstallWebsiteGuide />

      <p className="mt-8 text-center text-[14px] text-low">
        No install needed to use Gary.{' '}
        <Link href="/today" className="text-gold underline decoration-gold/40 underline-offset-4 hover:text-gold-light">
          Open today&apos;s desk
        </Link>{' '}
        in any browser.
      </p>
    </main>
  );
}
