import Link from "next/link";
import Image from "next/image";
import { EmailSignup } from "./EmailSignup";
import { Icon } from "./site/Icon";
const COLUMNS: {
  heading: string;
  links: { href: string; label: string; external?: boolean }[];
}[] = [
  {
    heading: "The Desk",
    links: [
      { href: "/nfl", label: "NFL Kickoff" },
      { href: "/today", label: "Today's Desk" },
      { href: "/picks", label: "Today's Picks" },
      { href: "/archive", label: "Pick Archive" },
      { href: "/results/world-cup", label: "World Cup 2026 Archive" },
      { href: "/props", label: "Player Props" },
      { href: "/hub", label: "The Hub" },
      { href: "/results", label: "Track Record" },
      { href: "/results/audit", label: "Model Audit" },
    ],
  },
  {
    heading: "Product",
    links: [
      { href: "/app", label: "Gary for iOS" },
      { href: "/install", label: "Add Website to Home Screen" },
      { href: "/pricing", label: "Pricing" },
      { href: "/how-it-works", label: "How It Works" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About Gary AI" },
      { href: "/editorial-standards", label: "Editorial Standards" },
      { href: "/data-sources", label: "Data Sources" },
      { href: "/corrections", label: "Corrections" },
      { href: "/press", label: "Press & Brand" },
      { href: "/contact", label: "Contact" },
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
      {
        href: "https://x.com/BetwithGary",
        label: "@BetwithGary",
        external: true,
      },
    ],
  },
];

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-wrap">
        <div className="site-footer-top">
          <Link href="/" className="site-brand">
            <Image src="/site/gary-current.png" alt="" width={43} height={43} />
            <span>
              GARY<b>.</b>
            </span>
          </Link>
          <p>Your game. Gary’s take.</p>
          <nav aria-label="Footer main">
            <Link href="/picks">The Picks</Link>
            <Link href="/results">The Record</Link>
            <Link href="/#the-app" className="site-text-link">
              Get the App
              <Icon size={15} />
            </Link>
          </nav>
        </div>
        <nav className="site-footer-more" aria-label="Explore Gary">
          {COLUMNS.flatMap((c) => c.links).map((l) =>
            l.external ? (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ) : (
              <Link key={l.href} href={l.href} prefetch={false}>
                {l.label}
              </Link>
            ),
          )}
          <Link href="/you">Your Book</Link>
          <Link href="/leaderboard">Leaderboard</Link>
          <Link href="/account">Account</Link>
        </nav>
        <details className="site-footer-signup">
          <summary className="cursor-pointer text-base text-gold">
            Get Gary’s Email Updates
          </summary>
          <div className="pt-6">
            <EmailSignup source="site_footer" />
          </div>
        </details>
        <div className="site-footer-bottom">
          <p>
            © {new Date().getFullYear()} Gary A.I. LLC · For informational and
            entertainment purposes only. 18+.
            <br />A public game-pick record. Player props are reported
            separately.
            <br />
            Gary does not accept wagers. If gambling is causing harm, call
            1-800-GAMBLER.
          </p>
          <div>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
        <a
          href="https://www.producthunt.com/products/gary-ai?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-gary-ai"
          className="mt-7 inline-block"
        >
          <Image
            src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1244756&theme=dark"
            alt="Find Gary AI on Product Hunt"
            width={250}
            height={54}
            className="h-auto max-w-full"
            loading="lazy"
            referrerPolicy="no-referrer"
            unoptimized
          />
        </a>
      </div>
    </footer>
  );
}
