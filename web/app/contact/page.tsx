import type { Metadata } from 'next';
import { Eyebrow } from '@/components/Eyebrow';
import { AppStoreButton } from '@/components/AppStoreButton';

export const metadata: Metadata = {
  title: 'Contact | Gary AI',
  description:
    'Contact Gary AI: support email, X account, and App Store link.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Eyebrow>CONTACT</Eyebrow>
      <h1 className="mt-2 font-display text-4xl text-white/95">Get in Touch</h1>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/60">
        Questions about a pick, a technical issue with the app, or anything else — reach
        out via email or X.
      </p>

      <div className="mt-8 max-w-lg rounded-[20px] border border-white/10 bg-card px-7 py-7">
        <ul className="space-y-6">
          {/* Support email */}
          <li className="flex items-start gap-4">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-chip">
              <span className="font-mono text-[11px] text-white/50">@</span>
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase text-white/40">Email</p>
              <a
                href="mailto:support@betwithgary.ai"
                className="mt-1 block text-[15px] text-white/85 underline hover:text-white/95"
              >
                support@betwithgary.ai
              </a>
            </div>
          </li>

          {/* X / Twitter */}
          <li className="flex items-start gap-4">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-chip">
              <span className="font-mono text-[11px] text-white/50">X</span>
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase text-white/40">X (Twitter)</p>
              <a
                href="https://x.com/BetwithGary"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block text-[15px] text-white/85 underline hover:text-white/95"
              >
                @BetwithGary
              </a>
            </div>
          </li>

          {/* App Store */}
          <li className="flex items-start gap-4">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-chip">
              <span className="font-mono text-[11px] text-white/50">iOS</span>
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase text-white/40">iOS App</p>
              <div className="mt-2">
                <AppStoreButton label="Download on the App Store" />
              </div>
            </div>
          </li>
        </ul>
      </div>
    </main>
  );
}
