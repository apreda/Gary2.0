import type { Metadata } from 'next';
import { PageMasthead, StitchRule } from '@/components/Terminal';
import { AppStoreButton } from '@/components/AppStoreButton';

export const metadata: Metadata = {
  title: 'Contact | Gary AI',
  description:
    'Contact Gary AI: support email, X account, and App Store link.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <PageMasthead
        title="Contact"
        sub="Questions about a pick, a technical issue with the app, or anything else — reach out via email or X."
      />

      <div className="mt-7 max-w-lg rounded-panel border border-line bg-card px-7 py-7">
        <ul>
          {/* Support email */}
          <li className="flex items-start gap-4">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-chip bg-chip">
              <span className="font-mono text-[11px] text-low">@</span>
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.04em] text-low">Email</p>
              <a
                href="mailto:support@betwithgary.ai"
                className="mt-1 block text-[15px] text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
              >
                support@betwithgary.ai
              </a>
            </div>
          </li>

          {/* X / Twitter */}
          <li>
            <StitchRule tone="faint" className="my-5" />
            <div className="flex items-start gap-4">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-chip bg-chip">
                <span className="font-mono text-[11px] text-low">X</span>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.04em] text-low">X (Twitter)</p>
                <a
                  href="https://x.com/BetwithGary"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block text-[15px] text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
                >
                  @BetwithGary
                </a>
              </div>
            </div>
          </li>

          {/* App Store */}
          <li>
            <StitchRule tone="faint" className="my-5" />
            <div className="flex items-start gap-4">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-chip bg-chip">
                <span className="font-mono text-[11px] text-low">iOS</span>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.04em] text-low">iOS App</p>
                <div className="mt-2">
                  <AppStoreButton label="Download on the App Store" surface="contact" />
                </div>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </main>
  );
}
