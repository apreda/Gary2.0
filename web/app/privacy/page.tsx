import type { Metadata } from 'next';
import { PageMasthead } from '@/components/Terminal';

export const metadata: Metadata = {
  title: 'Privacy Policy | Gary AI',
  description: 'Privacy Policy for betwithgary.ai and the Gary AI iOS app.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <PageMasthead title="Privacy policy" meta="Last updated: June 4, 2026">
        <p className="mt-2 font-mono text-[11px] text-low">Operated by Gary A.I. LLC</p>
      </PageMasthead>

      <div className="mt-7 space-y-10 text-[15px] leading-relaxed text-mid">

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">1. Information We Collect</h2>

          <p className="mb-3 font-semibold text-hi">Website (betwithgary.ai)</p>
          <ul className="mb-4 list-disc space-y-2 pl-5">
            <li>
              No account or registration is required. We do not collect your name, email address,
              or any other personally identifiable information through the Website.
            </li>
            <li>
              We use <strong className="text-hi">Vercel Analytics</strong> to collect
              anonymous usage statistics (pages visited, referrer, country, device type). This
              data is aggregated and not linked to any individual.
            </li>
          </ul>

          <p className="mb-3 font-semibold text-hi">iOS App</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              The App is free to use without an account. Optional features — personalized
              notifications and saved preferences — require creating an account via email,
              Apple Sign-In, or Google Sign-In. When you do, we collect your email address
              and a display name (if provided) to manage your account.
            </li>
            <li>
              If you enable push notifications, we collect your device&rsquo;s push-notification
              token to deliver those notifications. This token is not linked to any advertising
              identifier.
            </li>
            <li>
              We do not sell, rent, or share your personal information with third parties for
              marketing purposes.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">2. How We Use Information</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Provide, maintain, and improve the Service.</li>
            <li>Send push notifications you have opted into.</li>
            <li>
              Analyze aggregate, anonymous usage patterns to improve performance and content
              (Website analytics only).
            </li>
            <li>Ensure platform security and prevent abuse.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">3. Cookies &amp; Analytics</h2>
          <p>
            The Website uses Vercel Analytics, which collects anonymous page-view data without
            setting persistent tracking cookies. No cross-site advertising cookies are placed.
            If you wish to limit analytics collection, you may use a browser extension that
            blocks analytics scripts.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">4. Data Sharing</h2>
          <p className="mb-3">
            We do not sell your personal data. We may share data with:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-hi">Service providers</strong> (e.g., Supabase for
              database hosting, Vercel for infrastructure) who process data on our behalf under
              appropriate data-processing agreements.
            </li>
            <li>
              <strong className="text-hi">Authentication providers</strong> (Apple, Google)
              when you choose to sign in with those services, subject to their own privacy
              policies.
            </li>
            <li>
              <strong className="text-hi">Legal obligations</strong> — when required by
              law, subpoena, or to protect the rights, property, or safety of Gary A.I. LLC or
              others.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">5. Data Retention</h2>
          <p>
            Account data is retained for as long as your account remains active. You may request
            deletion of your account and associated personal data at any time by emailing{' '}
            <a
              href="mailto:privacy@betwithgary.ai"
              className="text-hi underline decoration-gold/60 underline-offset-4 hover:decoration-gold"
            >
              privacy@betwithgary.ai
            </a>
            . Anonymous analytics data is retained per Vercel&rsquo;s standard retention policies.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">6. Data Security</h2>
          <p>
            We implement TLS encryption and industry-standard security practices for data in
            transit and at rest. We maintain access controls to limit who can access personal
            data. No system is perfectly secure; in the event of a breach we will notify
            affected users as required by applicable law.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">7. Children&rsquo;s Privacy</h2>
          <p>
            The Service is not directed to anyone under 18 years of age. We do not knowingly
            collect personal information from minors. If we become aware that we have
            inadvertently received personal information from a person under 18, we will delete
            that information promptly.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">8. Your Rights</h2>
          <p>
            Depending on your jurisdiction, you may have rights to access, correct, or delete
            personal data we hold about you, or to object to certain processing. To exercise
            these rights, contact us at{' '}
            <a
              href="mailto:privacy@betwithgary.ai"
              className="text-hi underline decoration-gold/60 underline-offset-4 hover:decoration-gold"
            >
              privacy@betwithgary.ai
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">9. Changes to This Policy</h2>
          <p>
            We will post revisions to this page with a new &ldquo;Last updated&rdquo; date.
            Continued use of the Service after changes constitutes your acceptance of the
            revised Policy.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">10. Contact</h2>
          <p>
            For privacy-related questions, contact us at{' '}
            <a
              href="mailto:privacy@betwithgary.ai"
              className="text-hi underline decoration-gold/60 underline-offset-4 hover:decoration-gold"
            >
              privacy@betwithgary.ai
            </a>
            .
          </p>
        </section>

      </div>
    </main>
  );
}
