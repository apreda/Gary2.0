import Image from "next/image";
import Link from "next/link";
import { Icon } from "./Icon";
import { AppLink } from "./AppLink";
export function Hero() {
  return (
    <section className="site-hero site-wrap">
      <div className="site-hero-copy">
        <p className="site-eyebrow">
          <span />
          AI SPORTS BETTING PICKS
        </p>
        <h1>
          Your game.
          <br />
          <span>Gary’s take.</span>
        </h1>
        <p className="site-hero-description">
          Game picks. Player props. Gary’s best bets.
          <br />
          For MLB, NFL and college football.
        </p>
        <div className="site-hero-actions">
          <AppLink />
          <Link href="/picks" className="site-text-link">
            Explore the Picks
            <Icon name="right" />
          </Link>
        </div>
        <div className="site-hero-notes">
          <span>
            <Icon name="check" size={14} />
            Free game & prop picks
          </span>
          <span>
            <Icon name="check" size={14} />
            Every result on record
          </span>
        </div>
      </div>
      <div className="site-hero-art">
        <div className="site-phone site-phone-home">
          <Image
            src="/site/app-home.png"
            alt="Gary app Home screen with the matchup and today's picks"
            width={1320}
            height={2868}
            sizes="(max-width: 760px) 42vw, 24vw"
            priority
          />
        </div>
        <div className="site-phone site-phone-picks">
          <Image
            src="/site/app-picks.png"
            alt="Gary app Picks screen with the pick and its analysis"
            width={1320}
            height={2868}
            sizes="(max-width: 760px) 46vw, 26vw"
            priority
          />
        </div>
      </div>
    </section>
  );
}
export function SportsStrip() {
  return (
    <div className="site-sports-strip">
      <div className="site-wrap site-sports">
        <span>ONE GARY. EVERY GAME.</span>
        <Link href="/picks/mlb" className="font-bold hover:underline focus-visible:underline">MLB PICKS</Link>
        <span>✦</span>
        <Link href="/picks/nfl" className="font-bold hover:underline focus-visible:underline">NFL PICKS</Link>
        <span>✦</span>
        <Link href="/picks/ncaaf" className="font-bold hover:underline focus-visible:underline">COLLEGE FOOTBALL PICKS</Link>
        <span>GAME PICKS. PLAYER PROPS. BEST BETS.</span>
      </div>
    </div>
  );
}
export function Offering() {
  return (
    <section className="site-wrap site-section" id="how-it-works">
      <div className="site-section-heading">
        <div>
          <p className="site-eyebrow">WHAT YOU GET</p>
          <h2>Picks. Best bets. Insights.</h2>
        </div>
        <p>
          Find your game, see what Gary likes, and spot something you might have missed.
        </p>
      </div>
      <div className="site-method-grid">
        {[
          {
            n: "01",
            icon: "scan" as const,
            title: "The Picks",
            body: "Gary’s take on every game. Game picks and player props for the sports you follow, including home run and touchdown picks when available.",
            href: "/picks",
            cta: "Explore the Picks",
          },
          {
            n: "02",
            icon: "book" as const,
            title: "Winners",
            body: "Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most.",
            href: "/winners",
            cta: "See Winners",
          },
          {
            n: "03",
            icon: "shield" as const,
            title: "The Hub",
            body: "Gary’s insights and betting connections. Useful stats, trends, and matchups that help you spot something you might otherwise miss.",
            href: "/hub",
            cta: "Explore the Hub",
          },
        ].map((i) => (
          <article key={i.n}>
            <div>
              <span>{i.n}</span>
              <Icon name={i.icon} size={24} />
            </div>
            <h3>{i.title}</h3>
            <p>{i.body}</p>
            <Link href={i.href} className="site-text-link mt-5">
              {i.cta}
              <Icon name="right" />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
export function AppSection() {
  return (
    <section className="site-wrap site-app-section" id="the-app">
      <div className="site-app-promo">
        <div>
          <p className="site-eyebrow">
            <Icon name="phone" size={16} />
            GARY, TO GO.
          </p>
          <h2>
            Good company.
            <br />
            <span>Every game day.</span>
          </h2>
          <p>
            From the first look to the final score.
            <br />
            Keep your picks, your Book and Gary’s take
            <br />
            right where you need them.
          </p>
          <div className="site-benefits">
            <span>
              <Icon name="bell" size={17} />
              Pick alerts
            </span>
            <span>
              <Icon name="book" size={17} />
              Your Book
            </span>
            <span>
              <Icon name="check" size={17} />
              Tracked results
            </span>
          </div>
          <AppLink store />
          <p className="site-app-note">Free to download · iPhone</p>
        </div>
        <div className="site-app-art">
          <Image
            src="/site/gary-current.png"
            alt="Gary, the gold bear in sunglasses"
            width={800}
            height={800}
            sizes="300px"
          />
          <p>
            THE CALL IS GARY’S.
            <br />
            THE CHOICE IS YOURS.
          </p>
        </div>
      </div>
    </section>
  );
}
export function Journal() {
  return (
    <section className="site-wrap site-section">
      <div className="site-section-heading">
        <div>
          <p className="site-eyebrow">A LITTLE MORE CONTEXT.</p>
          <h2>From Gary’s desk.</h2>
        </div>
        <p>For the thinking part of game day.</p>
      </div>
      <div className="site-journal">
        <Link href="/how-it-works" className="site-feature-story site-venue-story">
          <Image
            src="/site/venue-football.webp"
            alt=""
            fill
            loading="lazy"
            sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1392px) 46vw, 623px"
          />
          <div>
            <span className="site-eyebrow">INSIDE THE PICK</span>
            <h3>
              The matchup.
              <br />
              The number.
              <br />
              The whole picture.
            </h3>
            <span>
              Three questions before game time
              <Icon />
            </span>
          </div>
        </Link>
        <div className="site-story-stack">
          <Link href="/how-it-works" className="site-venue-story site-venue-basketball">
            <Image
              src="/site/venue-basketball.webp"
              alt=""
              fill
              loading="lazy"
              sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1392px) 46vw, 623px"
            />
            <span className="site-eyebrow">
              THE BASICS
              <Icon />
            </span>
            <h3>
              The right team.
              <br />
              The wrong price.
            </h3>
            <p>Why liking a team and liking a bet are two different things.</p>
          </Link>
          <Link href="/results" className="site-venue-story site-venue-baseball">
            <Image
              src="/site/venue-baseball.webp"
              alt=""
              fill
              loading="lazy"
              sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1392px) 46vw, 623px"
            />
            <span className="site-eyebrow">
              ON THE RECORD
              <Icon />
            </span>
            <h3>
              The losses
              <br />
              belong here, too.
            </h3>
            <p>What a useful track record should actually tell you.</p>
          </Link>
        </div>
      </div>
    </section>
  );
}
