"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { accountHref } from "@/lib/auth/redirect";
import { useSupabaseSessionHint } from "@/lib/auth/session-hint";
import { AppStoreButton } from "./AppStoreButton";
import { Icon } from "./site/Icon";

// The app's page header and its floating dock (ios/GaryApp ContentView,
// GaryCenteredTabBar): the mark beside GARY A.I., destinations as words that
// turn gold, a gold hairline under the header; on a phone the five
// destinations float at the bottom with the mark in the middle and the page
// fading into the ink under them (design.md: the nav bar floats).
const PRIMARY: [string, string][] = [
  ["/picks", "Picks"],
  ["/props", "Props"],
  ["/winners", "Winners"],
  ["/results", "Record"],
  ["/archive", "Archive"],
];
const MORE: [string, string][] = [
  ["/today", "Today"],
  ["/how-it-works", "How Gary works"],
  ["/you", "Your Book"],
  ["/leaderboard", "Leaderboard"],
  ["/app", "Gary for iPhone"],
];
const DOCK_LEFT = [
  { href: "/", label: "HOME", icon: "house" as const },
  { href: "/props", label: "PROPS", icon: "scope" as const },
];
const DOCK_RIGHT = [
  { href: "/picks", label: "PICKS", icon: "list" as const },
  { href: "/results", label: "RECORD", icon: "record" as const },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Nav() {
  const pathname = usePathname();
  const signedIn = useSupabaseSessionHint();
  const accountPath = signedIn
    ? "/account"
    : accountHref(
        pathname.startsWith("/account") ? "/you" : pathname,
        "signup",
      );
  const links = (items: [string, string][]) =>
    items.map(([href, label]) => (
      <Link
        key={href}
        href={href}
        prefetch={false}
        aria-current={isActive(pathname, href) ? "page" : undefined}
        onClick={(e) =>
          e.currentTarget.closest("details")?.removeAttribute("open")
        }
      >
        {label}
      </Link>
    ));
  return (
    <>
      <a href="#main-content" className="site-skip">
        Skip to content
      </a>
      <header className="app-header">
        <div className="app-header-row">
          <Link href="/" className="app-wordmark" aria-label="Gary home">
            <Image src="/brand/GaryIconBG.png" alt="" width={30} height={30} priority />
            <span>
              GARY <b>A.I.</b>
            </span>
          </Link>
          <nav aria-label="Main navigation" className="app-header-links">
            {links(PRIMARY)}
          </nav>
          <AppStoreButton surface="nav" label="Get the app" className="app-header-get" />
          <details className="app-menu">
            <summary aria-label="Open navigation and account menu">
              <Icon name="menu" />
            </summary>
            <nav className="app-menu-panel" aria-label="More navigation">
              <div className="app-menu-primary">{links(PRIMARY)}</div>
              {links(MORE)}
              <div className="app-menu-account">
                {links([
                  [accountPath, signedIn ? "Account" : "Sign in / Join free"],
                ])}
              </div>
            </nav>
          </details>
        </div>
      </header>
      <nav className="app-dock" aria-label="Sections">
        {DOCK_LEFT.map((t) => (
          <Link key={t.href} href={t.href} prefetch={false} aria-current={isActive(pathname, t.href) ? "page" : undefined}>
            <Icon name={t.icon} size={21} />
            <span>{t.label}</span>
          </Link>
        ))}
        <Link
          href="/winners"
          prefetch={false}
          className="app-dock-mark"
          aria-current={isActive(pathname, "/winners") ? "page" : undefined}
        >
          <Image src="/brand/GaryIconBG.png" alt="" width={46} height={46} />
          <span>WINNERS</span>
        </Link>
        {DOCK_RIGHT.map((t) => (
          <Link key={t.href} href={t.href} prefetch={false} aria-current={isActive(pathname, t.href) ? "page" : undefined}>
            <Icon name={t.icon} size={21} />
            <span>{t.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
