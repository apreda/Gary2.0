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
          YOUR GAME-DAY COMPANION
        </p>
        <h1>
          Your game.
          <br />
          <span>Gary’s take.</span>
        </h1>
        <p className="site-hero-description">
          A pick is just the beginning.
          <br />
          Get the reasoning. Follow the results.
          <br />
          Make your own call.
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
            Free game picks
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
            alt="Gary app Home screen with the matchup and today's board"
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
        <b>MLB</b>
        <span>✦</span>
        <b>NFL</b>
        <span>✦</span>
        <b>NBA</b>
        <span>✦</span>
        <b>COLLEGE FOOTBALL</b>
        <span>PICKS. REASONING. RECEIPTS.</span>
      </div>
    </div>
  );
}
export function Method() {
  return (
    <section className="site-wrap site-section" id="how-it-works">
      <div className="site-section-heading">
        <div>
          <p className="site-eyebrow">THERE’S A REASON BEHIND THE BEAR.</p>
          <h2>A little less guesswork.</h2>
        </div>
        <p>
          The pick gets your attention.
          <br />
          The reasoning earns your time.
        </p>
      </div>
      <div className="site-method-grid">
        {[
          {
            n: "01",
            icon: "scan" as const,
            title: "Read the game.",
            body: "Available odds, sport-specific stats and matchup context give Gary a place to start.",
          },
          {
            n: "02",
            icon: "book" as const,
            title: "Make the case.",
            body: "A clear call, with the reasoning behind it. Read what matters and what could change the view.",
          },
          {
            n: "03",
            icon: "shield" as const,
            title: "Keep the receipt.",
            body: "The result stays on the record. Wins, losses and corrections are part of the same story.",
          },
        ].map((i) => (
          <article key={i.n}>
            <div>
              <span>{i.n}</span>
              <Icon name={i.icon} size={24} />
            </div>
            <h3>{i.title}</h3>
            <p>{i.body}</p>
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
              Board alerts
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
        <Link href="/how-it-works" className="site-feature-story">
          <Image
            src="/site/game-night.png"
            alt="Football stadium under the lights"
            width={941}
            height={1672}
            sizes="(max-width: 760px) 100vw, 50vw"
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
          <Link href="/how-it-works">
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
          <Link href="/results">
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
