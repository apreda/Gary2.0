import type { Metadata } from 'next';
import Link from 'next/link';
import { PageMasthead } from '@/components/Terminal';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = pageMetadata({
  canonical: '/terms',
  title: 'Terms of Service | Gary AI',
  description: 'Terms of Service for betwithgary.ai and the Gary AI iOS app.',
});

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <PageMasthead title="Terms of service" meta="Last updated: September 8, 2026">
        <p className="mt-2 font-mono text-[11px] text-low">Operated by Gary A.I. LLC</p>
      </PageMasthead>

      <div className="mt-7 space-y-10 text-[15px] leading-relaxed text-mid">

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">1. Acceptance of Terms</h2>
          <p>
            By accessing <strong className="text-hi">betwithgary.ai</strong> (the
            &ldquo;Website&rdquo;) or downloading the Gary AI iOS application (the &ldquo;App&rdquo;),
            collectively the &ldquo;Service,&rdquo; you agree to be bound by these Terms of Service.
            If you do not agree, do not use the Service.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">2. Eligibility</h2>
          <p>
            You must be 18 years of age or older to use this Service. You are solely responsible
            for ensuring that viewing sports betting information is lawful in your jurisdiction.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">3. Description of Service</h2>
          <p className="mb-3">
            Gary AI provides algorithmic sports-pick analysis and commentary. The Service
            consists of:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-hi">Website (betwithgary.ai):</strong> A site displaying
              Gary&rsquo;s picks, props, insight Hub, permanent analysis pages, and historical
              track record. No account is required to browse public content. Optional accounts
              let users ride or fade Gary&rsquo;s calls, maintain a personal record in Your Book,
              log their own plays, and choose a public handle. These tracking tools record a
              user&rsquo;s selections; they do not transmit or place wagers.
            </li>
            <li>
              <strong className="text-hi">iOS App:</strong> A free-to-download companion app
              offering free sports analysis and optional notifications with your permission.
              An optional account via email, Apple Sign-In, or Google Sign-In adds personal
              tracking and account-specific result alerts. Optional paid subscriptions
              (Winners boards and passes) are billed through Stripe.
            </li>
          </ul>
          <p className="mt-3">
            We do not place bets on your behalf, accept wagering deposits, or hold wagering
            balances. All wagering decisions and financial risk are yours alone. Content is provided
            for informational and entertainment purposes only — no real-money wagering occurs
            within our platform, and past performance does not guarantee future results.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">4. Intellectual Property</h2>
          <p>
            All content, trademarks, logos, and software belonging to Gary A.I. LLC or its
            licensors are protected by applicable intellectual-property laws. You may not copy,
            modify, or distribute any portion of the Service without prior written consent.
            Systematic scraping or automated harvesting of picks data is prohibited.
          </p>
          <p className="mt-3">
            See our{' '}
            <Link href="/data-sources#nflverse" className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold">data source credits</Link>{' '}
            for applicable third-party licenses. These Terms do not limit rights granted by
            those licenses to the material they cover.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">5. Prohibited Conduct</h2>
          <p className="mb-2">You agree not to:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Violate any applicable law or regulation, including any gambling regulations.</li>
            <li>Attempt to reverse-engineer, decompile, or interfere with the Service.</li>
            <li>Use automated bots or scripts to scrape, harvest, or reproduce Service data.</li>
            <li>Upload or transmit malicious code, viruses, or other harmful software.</li>
            <li>Publish harassment, threats, hateful or sexual content, spam, or another person&rsquo;s private information.</li>
            <li>
              Impersonate Gary A.I. LLC or misrepresent your affiliation with the Service.
            </li>
          </ul>
          <div id="profile-safety" className="mt-4 scroll-mt-24">
            <h3 className="font-semibold text-hi">Public profile safety and appeals</h3>
            <p className="mt-2">
              Public handles and bios must follow these rules. Gary filters public profile text;
              reports can lead to a review and removal from public profiles and leaderboards.
              Reporting someone does not automatically remove their profile or change their results.
              Sign in and open a player&rsquo;s profile to report or block them. Blocking hides that
              player&rsquo;s profile and leaderboard entries from your signed-in account. Manage blocks
              from the leaderboard. Your private Book and its results are separate.
            </p>
            <p className="mt-2">
              For a safety concern, help with reporting, or an appeal, email{' '}
              <a href="mailto:support@betwithgary.ai?subject=Gary%20profile%20safety" className="text-gold underline">support@betwithgary.ai</a>.
              Include the public profile link and report reference if you have one. Do not send passwords,
              payment details or private bet information. Reports are visible to Gary&rsquo;s support
              reviewers, not other players. Gary may restrict abusive public profiles while preserving
              the account&rsquo;s private tracking data and recorded results.
            </p>
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">6. No Gambling Facilitation</h2>
          <p>
            Gary provides sports analysis and personal tracking. Gary does not accept or place
            sportsbook wagers, accept wagering deposits, hold wagering balances, or award cash
            prizes. Optional Gary subscriptions are sold through Stripe; those payments purchase
            access to information, not a wager. Predictions are fallible opinions, not guarantees
            or investment advice. You remain responsible for your own wagering decisions.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">7. Disclaimers</h2>
          <p>
            THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE.&rdquo; GARY
            A.I. LLC MAKES NO WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF
            MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. BETTING
            CARRIES INHERENT FINANCIAL RISK; PAST PERFORMANCE DOES NOT GUARANTEE FUTURE RESULTS.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">8. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Gary A.I. LLC, its directors, employees, and
            partners shall not be liable for any indirect, incidental, special, or consequential
            damages — including loss of profits — arising from your use of or inability to use
            the Service, even if advised of the possibility of such damages.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">9. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless Gary A.I. LLC, its directors, employees, and
            partners from any claims, damages, or liabilities arising out of your use of the
            Service or your violation of these Terms.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">
            10. Governing Law &amp; Dispute Resolution
          </h2>
          <p>
            These Terms are governed by the laws of the State of Ohio, USA, without regard to
            conflict-of-law principles. All disputes shall be resolved through binding arbitration
            in Cincinnati, OH, conducted in English under the AAA Consumer Arbitration Rules. YOU
            WAIVE ANY RIGHT TO CLASS-ACTION PROCEEDINGS.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">11. Modifications</h2>
          <p>
            We may revise these Terms at any time by posting an updated version with a new
            &ldquo;Last updated&rdquo; date. Continued use of the Service after such changes
            constitutes your acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">12. Contact</h2>
          <p>
            For legal inquiries, email{' '}
            <a
              href="mailto:legal@betwithgary.ai"
              className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
            >
              legal@betwithgary.ai
            </a>
            . For general support, email{' '}
            <a
              href="mailto:support@betwithgary.ai"
              className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
            >
              support@betwithgary.ai
            </a>
            .
          </p>
        </section>

      </div>
    </main>
  );
}
