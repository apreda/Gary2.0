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
      <PageMasthead title="Privacy policy" meta="Last updated: September 5, 2026">
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
              If you use Your Book, we store your verified rides or fades, manually logged bets,
              odds, stakes in units, results, dates, notes, sportsbook labels and favorites.
              Your account also stores profile choices, favorite sports, and your preferred dollar
              display value for a unit. Changing that value changes historical dollar displays.
              Public leaderboard participation is optional. If you opt in, your handle, chosen
              avatar, bio and qualifying verified performance can be visible to other users.
              Manual bets, private notes, dollar stake displays and your email are not public.
            </li>
            <li>
              If you join a launch notification list, we collect the email address you submit,
              a short source label, and limited request information such as the browser user
              agent so we can operate and protect that signup.
            </li>
            <li>
              If you subscribe to website updates, we collect your email address, chosen email
              cadence, consent time and source, limited request information such as browser user
              agent, and delivery status. We use that information to send the daily-board alert
              and/or weekly public-record receipt you requested. Every message includes an
              unsubscribe link. We also use a keyed, one-way request fingerprint for short-lived
              signup rate limiting; the raw network address is not stored in the email tables.
            </li>
            <li>
              If you choose <strong className="text-hi">Allow analytics</strong>, we use Vercel
              Analytics and Speed Insights to collect aggregate page-use and performance
              information such as pages visited, referrer, country, device type, and loading
              measurements. These services are not used for cross-site advertising.
            </li>
            <li>
              With the same permission, Gary creates a random{' '}
              <code className="font-mono text-hi">gary_web_id</code> in local browser storage.
              That pseudonymous identifier links first-party product events across visits and is
              sent with an allowlisted event name and limited page, campaign, or call-to-action
              properties to a service-only Supabase table. Consented session and interaction
              measurements help us understand how visitors find Gary, read pick reasoning and
              return. We do not include account email
              addresses, full referring URLs, or URL query strings in those events.
            </li>
            <li>
              Standard App Store handoffs are measured only after you allow analytics. Gary also
              operates explicitly tracked campaign links at <code className="font-mono text-hi">/get</code>{' '}
              and <code className="font-mono text-hi">/c/&lt;handle&gt;</code>; those links record an
              aggregate click, campaign or creator label, surface, and referring hostname even
              when no analytics choice is available on the redirect. New click records do not
              store a browser user-agent or network address. For abuse prevention, the server
              temporarily converts its trusted client-address header into a keyed one-way rate
              key; the raw address is not stored, durable event and click records do not contain
              the key, and scheduled cleanup removes rate keys within approximately ten minutes.
            </li>
          </ul>

          <p className="mb-3 font-semibold text-hi">iOS App</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Public picks and historical results can be browsed without an account. If you sign
              in with email, Apple or Google, Supabase Auth processes your email address,
              authentication credentials, provider identifier and available profile name.
              Account features, including Your Book, profile preferences, access passes and the
              optional public leaderboard, use the same account data described above for the Website.
            </li>
            <li>
              If you enable push notifications, Firebase Cloud Messaging processes a push token,
              app-installation identifier and technical information needed for delivery, such as
              app and operating-system versions. Gary stores the token with your account ID when
              signed in, or a random installation ID when signed out, to deliver the requested
              notifications. These identifiers are not advertising identifiers. You can change
              notification permission in your device&rsquo;s Settings.
            </li>
            <li>
              Starting with iOS version 2.25 (build 899), the App&rsquo;s Settings include <strong className="text-hi">Share product analytics</strong>{' '}
              which is off by default. If you turn it on, Gary sends allowlisted plan-view, plan-choice
              and checkout-step events to Supabase. Signed-in events include your account ID;
              signed-out events have no persistent identifier. These events exclude bet notes,
              email addresses and payment-card details. Turn the setting off to stop future optional
              events; an event already sent may have been received. This choice does not disable
              essential account, billing or notification services. Earlier app versions may have
              associated these events with an account or installation identifier.
            </li>
            <li>
              When you choose Google sign-in or push notifications, the corresponding Google
              and Firebase services also process technical service information. Their SDK
              declarations include device or account identifiers, app/device metadata, diagnostic
              and usage information. Google sign-in may use your IP address to estimate your
              general location for fraud prevention, even without a device-location permission.
              Provider profile information depends on the sign-in permissions you grant. Gary does not request precise
              device location or additional phone-number access. The iOS product-analytics switch
              controls Gary&rsquo;s optional plan events; it does not suppress technical information
              required by a sign-in or notification service you choose. Starting with iOS version 2.25 (build 899), Firebase initialization waits for notification
              permission, and its optional default data collection is disabled.
            </li>
            <li>
              We do not sell, rent, or share your personal information with third parties for
              marketing purposes.
            </li>
          </ul>
          <p className="mt-4">
            If you purchase a pass, Stripe processes checkout and payment details. Gary receives
            account/customer identifiers, selected plan, payment and subscription status, and
            transaction references needed to provide access and manage billing. Gary does not
            receive or store your full payment-card number. Billing records are separate from
            optional product analytics. The App does not place sportsbook wagers or collect
            sportsbook account credentials.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">2. How We Use Information</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Provide, maintain, and improve the Service.</li>
            <li>Manage optional accounts and keep account-linked features available across web and iOS.</li>
            <li>Store, display, and grade Your Book activity that you choose to create.</li>
            <li>Send push notifications, one-time launch notifications, or recurring website updates you have opted into.</li>
            <li>
              Analyze the Website and App product-use information you permit to improve performance,
              content and the signup or purchase experience.
            </li>
            <li>Ensure platform security and prevent abuse.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-hi">3. Cookies &amp; Analytics</h2>
          <p>
            The Website uses essential cookies for optional account sessions. It also uses local
            browser storage for preferences such as the display value of one betting unit. Your
            analytics choice is stored in local browser storage and a same-site preference cookie
            so the Website can honor it during page use and standard App Store handoffs. Persistent
            first-party analytics, Vercel Analytics, and Speed Insights stay off unless you choose
            Allow analytics. Choose <strong className="text-hi">Privacy choices</strong> at the
            bottom of any page to allow, decline, or later change that choice; declining removes
            Gary&rsquo;s stored analytics identifier and attribution history. We do not place
            cross-site advertising cookies. You can browse public content without signing in or
            enabling analytics.
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
              authentication and database hosting, Firebase for push delivery, Stripe for payments,
              Vercel for infrastructure and consented website analytics, and Resend for email delivery)
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
            for the stated notification and related operational needs. Website-update subscriptions
            remain active until you unsubscribe; after that, we retain a suppression record and
            limited delivery logs as reasonably necessary to honor the request, prevent duplicate
            sends, troubleshoot delivery, and meet legal obligations. Consented first-party product
            events and App Store handoff or campaign-link records are retained for operational
            analytics and campaign measurement until they are no longer reasonably needed for
            those purposes. Analytics abuse-prevention rate keys are deleted on a scheduled basis
            within approximately ten minutes. In the App, use Settings → Delete Account; on the
            Website, use your account settings. Account deletion cancels Gary subscriptions and
            removes your profile, private bets, leaderboard entry, account-linked push registration
            and account-linked product events from Gary&rsquo;s active systems. If a required billing
            or deletion step fails, we report the failure so you can retry. Events without an
            account identifier and anonymous or deidentified aggregate measurements cannot be
            associated with your account. Earlier installation-based events may be retained until
            they are no longer reasonably needed or a matching deletion request is fulfilled.
            Payment providers may retain transaction records required for accounting, fraud
            prevention or legal obligations. Separately opted-in email updates can be stopped
            using their unsubscribe link. You can also request help with deletion by emailing{' '}
            <a
              href="mailto:privacy@betwithgary.ai"
              className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
            >
              privacy@betwithgary.ai
            </a>
            . Aggregate Vercel analytics data is retained per Vercel&rsquo;s standard retention policies.
          </p>
          <p className="mt-3">
            If you used Sign in with Apple, deleting Gary&rsquo;s account may leave Apple&rsquo;s
            separate sign-in authorization in place when Gary does not hold an Apple revocation
            token. The App confirms deletion and links to Apple&rsquo;s instructions for removing
            that permission in your Apple Account settings. This additional step does not delay
            deletion of your Gary account.
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
