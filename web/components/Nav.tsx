"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { accountHref } from "@/lib/auth/redirect";
import { useSupabaseSessionHint } from "@/lib/auth/session-hint";
import { Icon } from "./site/Icon";
const PRIMARY = [
  ["/picks", "The Picks"],
  ["/props", "Player Props"],
  ["/winners", "Winners"],
  ["/results", "The Record"],
  ["/#how-it-works", "How Gary Works"],
  ["/#the-app", "The App"],
];
const PRODUCT = [
  ["/today", "Today"],
  ["/hub", "The Hub"],
  ["/you", "Your Book"],
  ["/leaderboard", "Leaderboard"],
  ["/archive", "Pick Archive"],
];
export function Nav() {
  const pathname = usePathname();
  const signedIn = useSupabaseSessionHint();
  const accountPath = signedIn
    ? "/account"
    : accountHref(
        pathname.startsWith("/account") ? "/you" : pathname,
        "signup",
      );
  const links = (items: string[][]) =>
    items.map(([href, label]) => (
      <Link
        key={href}
        href={href}
        prefetch={false}
        aria-current={
          pathname === href || pathname.startsWith(href + "/")
            ? "page"
            : undefined
        }
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
      <header className="site-header">
        <div className="site-wrap site-nav-inner">
          <Link href="/" className="site-brand" aria-label="Gary home">
            <Image src="/site/gary-current.png" alt="" width={43} height={43} />
            <span>
              GARY<b>.</b>
            </span>
          </Link>
          <nav aria-label="Main navigation" className="site-nav-links">
            {links(PRIMARY)}
          </nav>
          <Link
            href="/#the-app"
            className="site-button site-button-gold site-nav-download"
          >
            Get Gary
            <Icon size={16} />
          </Link>
          <details className="site-menu">
            <summary aria-label="Open navigation and account menu">
              <Icon name="menu" />
            </summary>
            <nav className="site-menu-panel" aria-label="More navigation">
              <div className="site-menu-primary">{links(PRIMARY)}</div>
              {links(PRODUCT)}
              <div className="site-menu-account">
                {links([
                  [accountPath, signedIn ? "Account" : "Sign In / Join Free"],
                ])}
              </div>
            </nav>
          </details>
        </div>
      </header>
    </>
  );
}
