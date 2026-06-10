import type { Metadata } from 'next';
import { PageMasthead } from '@/components/Terminal';

export const metadata: Metadata = {
  title: 'Terms of Service | Gary AI',
  description: 'Terms of Service for betwithgary.ai and the Gary AI iOS app.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <PageMasthead title="Terms of service" meta="Last updated: June 4, 2026">
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
              <strong className="text-hi">Website (betwithgary.ai):</strong> A read-only
              site displaying Gary&rsquo;s picks, props, insight Hub, and historical track record.
              No account registration is required to browse the Website.
            </li>
            <li>
              <strong className="text-hi">iOS App:</strong> A free-to-download companion app
              offering the same free content plus optional features (push notifications,
              personalized notifications) available after creating an optional account via
              email, Apple Sign-In, or Google Sign-In, and optional paid subscriptions
              (Winners boards and passes) billed through Stripe.
            </li>
          </ul>
          <p className="mt-3">
            We do not place bets on your behalf, accept deposits, or facilitate wagering of any
            kind. All wagering decisions and financial risk are yours alone. Content is provided
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
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">5. Prohibited Conduct</h2>
          <p className="mb-2">You agree not to:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Violate any applicable law or regulation, including any gambling regulations.</li>
            <li>Attempt to reverse-engineer, decompile, or interfere with the Service.</li>
            <li>Use automated bots or scripts to scrape, harvest, or reproduce Service data.</li>
            <li>Upload or transmit malicious code, viruses, or other harmful software.</li>
            <li>
              Impersonate Gary A.I. LLC or misrepresent your affiliation with the Service.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">6. No Gambling Facilitation</h2>
          <p>
            Gary AI is an informational and entertainment service. We are not a sportsbook, a
            gambling operator, or a gambling-related service as defined under applicable law. We
            do not accept, process, or hold funds. Nothing in the Service constitutes investment
            advice or a recommendation to place any wager.
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
