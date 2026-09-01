import type { Metadata } from 'next';
import { PageMasthead } from '@/components/Terminal';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = pageMetadata({
  canonical: '/privacy',
  title: 'Privacy Policy | Gary AI',
  description: 'Privacy Policy for betwithgary.ai and the Gary AI iOS app.',
});

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <PageMasthead title="Privacy policy" meta="Last updated: September 1, 2026">
        <p className="mt-2 font-mono text-[11px] text-low">Operated by Gary A.I. LLC</p>
      </PageMasthead>

      <div className="mt-7 space-y-10 text-[15px] leading-relaxed text-mid">

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">1. Information We Collect</h2>

          <p className="mb-3 font-semibold text-hi">Website (betwithgary.ai)</p>
          <ul className="mb-4 list-disc space-y-2 pl-5">
            <li>
              No account is required to browse the public Website. If you create or use an
              optional account, Supabase Auth processes your email address, sign-in credentials,
              and authentication-provider profile data needed to operate that account.
            </li>
            <li>
              If you use Your Book, we store the picks you ride or fade, bets you log, stakes,
              grading information, and an optional public handle. If you claim a handle and have
              enough settled rides or fades to rank, that handle and your aggregate verified
              win-loss-push and unit record may appear on the public leaderboard. Manually logged
              plays, dollar stake values, and your email address are not shown there. A preferred
              dollar value for one unit is stored locally in your browser rather than in your account.
            </li>
            <li>
              If you join a launch notification list, we collect the email address you submit,
              a short source label, and limited request information such as the browser user
              agent so we can operate and protect that signup.
            </li>
            <li>
              We use <strong className="text-hi">Vercel Analytics</strong> to collect
              anonymous usage statistics (pages visited, referrer, country, device type). This
              data is aggregated and not linked to any individual.
            </li>
            <li>
              Gary also uses first-party product and attribution analytics. The Website creates
              a random <code className="font-mono text-hi">gary_web_id</code> in local browser
              storage and sends that identifier, an event name, the web platform label, and
              limited page or call-to-action properties to Supabase. Tracked App Store redirects
              also store the campaign token, referring page, and browser user-agent string. We
              use this information to measure product usage, campaign performance, and abuse;
              it is not used for cross-site advertising.
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
            <li>Manage optional accounts and keep account-linked features available across web and iOS.</li>
            <li>Store, display, and grade Your Book activity that you choose to create.</li>
            <li>Send push notifications or one-time launch notifications you have opted into.</li>
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
            The Website uses essential cookies for optional account sessions. It also uses local
            browser storage for preferences such as the display value of one betting unit.
            Vercel Analytics collects anonymous page-view data without cross-site advertising
            cookies. We do not place cross-site advertising cookies. You can browse the public
            content without signing in.
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
              authentication and database hosting, and Vercel for infrastructure and analytics)
              who process data on our behalf.
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
            Account and Your Book data are retained while your account remains active or as
            needed to provide the features you requested. Launch-notification data is retained
            for the stated notification and related operational needs. First-party event and link
            attribution records are retained for operational analytics and campaign measurement
            until they are no longer reasonably needed for those purposes. You may request deletion
            of your account and associated personal data at any time by emailing{' '}
            <a
              href="mailto:privacy@betwithgary.ai"
              className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
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
              className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
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
              className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
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
